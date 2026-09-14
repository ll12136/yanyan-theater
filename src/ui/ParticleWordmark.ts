import Phaser from 'phaser';
import { THEME } from './theme';

/**
 * 首屏背景的粒子字标：整屏散开的粒子先收拢成项目的字标，之后一边轻微抖动、
 * 一边躲开鼠标；鼠标划过的地方还有一圈光晕。
 *
 * 这套手感来自 flow.guyue.me 首页那段 Canvas 2D 实现（同一届知乎黑客松的作品），
 * 这里按它的算法逐条移植：逐像素采样字形得到归位点、弹簧收敛 + 随机抖动、
 * 开场的一次性 burst、鼠标斥力与光晕，以及它的几条护栏（30fps 上限、
 * prefers-reduced-motion、触屏不绑指针）。
 *
 * 与原站实现的三点必要差异：
 * 1. 原站是页面里一块 z-index 为负的 DOM canvas，垫在所有内容底下；这里是 Phaser 的
 *    Graphics，靠「插入顺序」垫在首屏文字之下——所以接入位置必须留在建文字之前，
 *    挪到后面就会盖住标题。坐标全部走 960×640 设计空间，放大交给 SharpScene 的相机 zoom。
 * 2. 原站逐粒子改 fillStyle 不会打断批次；Phaser 的 MultiPipeline.batchFillRect 把颜色
 *    逐顶点写进 fillTint，FILL_STYLE 命令也不 flush。所以这里照搬「每颗粒子一次
 *    fillStyle + fillRect」，3200 颗仍然只是一个 draw call，不必改写成 Blitter。
 * 3. 形状来源：优先采样项目自己的字标图片（透明底 PNG），拿不到就用文字画字模再采样。
 *    原站也是这条兜底路径，只是它的兜底字写死成「知乎」。
 */

/** 与 SharpScene / MenuScene 共用的设计空间 */
const DESIGN_W = 960;
const DESIGN_H = 640;
/** 采样步长跟着短边走：原站口径，保证不同尺寸下粒子密度一致 */
const SAMPLE_DIVISOR = 150;
/** 光晕半径（设计空间像素），与原站的 240 对齐 */
const GLOW_RADIUS = 240;
/** 原站刻意压到 30fps：粒子只在动，30fps 足够，省一半重绘 */
const FRAME_MS = 1000 / 30;
const GLOW_TEXTURE_KEY = '__particle-wordmark-glow';
/** 三档粒子的深浅过渡，模拟原站 palette 里的三个蓝 */
const DEFAULT_COLORS = [0x6a86d8, THEME.blue, 0xbfd2ff] as const;

export interface ParticleWordmarkOptions {
  /** 没有字标图片时，用这几个字画字模（建议 2 个字、笔画够重，粒子才立得住） */
  glyph: string;
  /** 项目自己的字标 / logo：给了就优先采样它，取不到自动退回文字 */
  textureUrl?: string;
  fontFamily?: string;
  /** 字模中心（设计空间 960×640） */
  x?: number;
  y?: number;
  /** 字模的尺寸上限（设计空间像素） */
  maxWidth?: number;
  maxHeight?: number;
  /** 粒子数上限，原站是 3200 */
  maxParticles?: number;
  /** 整体透明度系数：首屏文字密，字标要压得住当背景 */
  alphaScale?: number;
  colors?: readonly [number, number, number];
  /** 鼠标光晕颜色 */
  glow?: number;
  /** 鼠标斥力半径 */
  repelRadius?: number;
}

interface ResolvedOptions {
  glyph: string;
  textureUrl: string | null;
  fontFamily: string;
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
  maxParticles: number;
  alphaScale: number;
  colors: readonly [number, number, number];
  glow: number;
  repelRadius: number;
}

interface Particle {
  /** 归位点：采样出来的字形像素位置 */
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 边长（设计空间像素） */
  s: number;
  /** 基础透明度 */
  a: number;
  /** 打包的 0xRRGGBB */
  c: number;
}

function rgba(hex: number, alpha: number): string {
  return `rgba(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff},${alpha})`;
}

export class ParticleWordmark {
  private readonly scene: Phaser.Scene;
  private readonly o: ResolvedOptions;
  /** 粒子自己一层 Graphics；光晕分开，因为它要用 ADD 混合 */
  private readonly dots: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image | null = null;
  private particles: Particle[] = [];
  private burst = false;
  private burstAt = 0;
  private last = 0;
  private ready = false;
  private destroyed = false;
  private readonly mouse = { x: -1e4, y: -1e4, active: false };
  /** 原站的两条护栏：要求减少动效时给静态画面，触屏不绑指针 */
  private readonly reduced: boolean;
  private readonly pointerEnabled: boolean;

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    // 指针要先换算进设计空间：相机带着 density 倍 zoom，直接读 pointer.x 会整体偏掉。
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.mouse.x = world.x;
    this.mouse.y = world.y;
    this.mouse.active = true;
  };

  private readonly onPointerOut = (): void => {
    this.mouse.active = false;
  };

  constructor(scene: Phaser.Scene, options: ParticleWordmarkOptions) {
    this.scene = scene;
    this.o = {
      glyph: options.glyph,
      textureUrl: options.textureUrl ?? null,
      fontFamily: options.fontFamily ?? '"Microsoft YaHei", sans-serif',
      x: options.x ?? DESIGN_W / 2,
      y: options.y ?? DESIGN_H / 2,
      maxWidth: options.maxWidth ?? DESIGN_W * 0.62,
      maxHeight: options.maxHeight ?? DESIGN_H * 0.52,
      maxParticles: options.maxParticles ?? 3200,
      alphaScale: options.alphaScale ?? 0.45,
      colors: options.colors ?? DEFAULT_COLORS,
      glow: options.glow ?? THEME.blue,
      repelRadius: options.repelRadius ?? 130
    };
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pointerEnabled = !this.reduced && !window.matchMedia('(hover: none)').matches;

    // 顺序即层级：光晕先建，粒子后建，粒子才压在光晕上面。
    this.glow = this.createGlow();
    this.dots = scene.add.graphics();

    if (this.pointerEnabled) {
      scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
      scene.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerOut);
    }
    void this.build();
  }

  /** 由场景的 update 每帧调用；内部按原站的 30fps 上限节流 */
  update(time: number): void {
    if (this.destroyed || !this.ready || this.reduced) return;
    if (time - this.last < FRAME_MS) return;
    this.last = time - ((time - this.last) % FRAME_MS);
    this.draw();
  }

  /** 场景 shutdown 时必须调用：Graphics、光晕和指针监听都要收干净，否则回首页会叠出第二层 */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.pointerEnabled) {
      this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
      this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.onPointerOut);
    }
    this.dots.destroy();
    this.glow?.destroy();
    this.glow = null;
    this.particles = [];
    this.ready = false;
  }

  /**
   * 原站每帧用 createRadialGradient 现画那团光晕；这里烘成一张贴图，
   * 之后每帧只剩一个 quad。贴图按 key 缓存在 TextureManager 里，回首页时直接复用。
   */
  private createGlow(): Phaser.GameObjects.Image | null {
    const textures = this.scene.textures;
    if (!textures.exists(GLOW_TEXTURE_KEY)) {
      const size = GLOW_RADIUS * 2;
      const texture = textures.createCanvas(GLOW_TEXTURE_KEY, size, size);
      if (!texture) return null;
      const ctx = texture.getContext();
      const gradient = ctx.createRadialGradient(GLOW_RADIUS, GLOW_RADIUS, 0, GLOW_RADIUS, GLOW_RADIUS, GLOW_RADIUS);
      gradient.addColorStop(0, rgba(this.o.glow, 0.12));
      gradient.addColorStop(1, rgba(this.o.glow, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      texture.refresh();
    }
    return this.scene.add.image(0, 0, GLOW_TEXTURE_KEY).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  private async build(): Promise<void> {
    const points = await this.sampleTargets();
    if (this.destroyed) return;
    const count = points.length / 2;
    if (count === 0) return;
    // 原站口径：把采样点稀释到 maxParticles 以内，4K 屏上也不会炸
    const stride = Math.max(1, Math.ceil(count / this.o.maxParticles));
    this.particles = [];
    for (let i = 0; i < points.length; i += stride * 2) {
      const hx = points[i];
      const hy = points[i + 1];
      this.particles.push({
        // 归位点加一点抖动，边缘才不像锯齿
        hx: hx + (Math.random() - 0.5) * 3,
        hy: hy + (Math.random() - 0.5) * 3,
        // 开场：粒子从整屏随机位置与随机速度出发，再由弹簧收拢成字标
        x: this.reduced ? hx : Math.random() * DESIGN_W,
        y: this.reduced ? hy : Math.random() * DESIGN_H,
        vx: this.reduced ? 0 : (Math.random() - 0.5) * 1.5,
        vy: this.reduced ? 0 : (Math.random() - 0.5) * 1.5,
        s: 2 + Math.round(Math.random() * 2),
        a: (0.3 + Math.random() * 0.42) * this.o.alphaScale,
        c: this.o.colors[(i >> 1) % 3]
      });
    }
    this.burstAt = this.scene.time.now;
    this.burst = !this.reduced;
    this.last = 0;
    this.ready = true;
    // 减少动效时只画这一帧静态字标，不进补间循环
    if (this.reduced) this.draw();
  }

  /** 把字标（图片或文字字模）画到离屏 canvas 上，再逐像素采出归位点 */
  private async sampleTargets(): Promise<number[]> {
    const canvas = document.createElement('canvas');
    canvas.width = DESIGN_W;
    canvas.height = DESIGN_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const fromImage = await this.drawTarget(ctx);
    const data = ctx.getImageData(0, 0, DESIGN_W, DESIGN_H).data;
    const step = Math.max(5, Math.round(Math.min(DESIGN_W, DESIGN_H) / SAMPLE_DIVISOR));
    const points: number[] = [];
    for (let y = 0; y < DESIGN_H; y += step) {
      for (let x = 0; x < DESIGN_W; x += step) {
        const alpha = data[(y * DESIGN_W + x) * 4 + 3];
        if (alpha > (fromImage ? 120 : 140)) points.push(x, y);
      }
    }
    return points;
  }

  /** 返回 true 表示用的是字标图片，false 表示退回了文字字模 */
  private async drawTarget(ctx: CanvasRenderingContext2D): Promise<boolean> {
    if (this.o.textureUrl) {
      try {
        const response = await fetch(this.o.textureUrl);
        if (!response.ok) throw new Error('wordmark');
        const bitmap = await createImageBitmap(await response.blob());
        const scale = Math.min(this.o.maxWidth / bitmap.width, this.o.maxHeight / bitmap.height);
        const w = bitmap.width * scale;
        const h = bitmap.height * scale;
        ctx.drawImage(bitmap, this.o.x - w / 2, this.o.y - h / 2, w, h);
        bitmap.close();
        return true;
      } catch {
        // 拉不到就退回文字：首屏不能因为一张图把字标整个丢掉
      }
    }
    this.drawGlyph(ctx);
    return false;
  }

  /** 原站的兜底路径：直接画字。字号按「先塞进 maxWidth、再塞进 maxHeight」收敛 */
  private drawGlyph(ctx: CanvasRenderingContext2D): void {
    const font = (size: number) => `900 ${size}px ${this.o.fontFamily}`;
    let size = this.o.maxHeight;
    ctx.font = font(size);
    const width = ctx.measureText(this.o.glyph).width;
    if (width > this.o.maxWidth && width > 0) size = Math.floor(size * (this.o.maxWidth / width));
    ctx.font = font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(this.o.glyph, this.o.x, this.o.y);
  }

  private draw(): void {
    const dots = this.dots;
    dots.clear();
    const bursting = this.burst;
    if (bursting && this.hasSettled()) this.burst = false;
    this.drawGlow(bursting);
    for (const p of this.particles) {
      // 弹簧收敛 + 一点随机抖动：让它看起来是「活的」，而不是一张会动的贴图
      p.vx += (p.hx - p.x) * 0.12 + (Math.random() - 0.5) * 0.09;
      p.vy += (p.hy - p.y) * 0.12 + (Math.random() - 0.5) * 0.09;
      let near = 0;
      if (this.mouse.active && !bursting) {
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const d = Math.hypot(dx, dy);
        const radius = this.o.repelRadius;
        if (d < radius) {
          const k = 1 - d / radius;
          near = k;
          const angle = Math.random() * Math.PI * 2;
          p.vx += Math.cos(angle) * 1.8 * k + (dx / (d || 1)) * 0.6 * k;
          p.vy += Math.sin(angle) * 1.8 * k + (dy / (d || 1)) * 0.6 * k;
        }
      }
      p.vx *= 0.75;
      p.vy *= 0.75;
      p.x += p.vx;
      p.y += p.vy;
      dots.fillStyle(p.c, Math.min(1, p.a + near * 0.6));
      dots.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
  }

  /** 原站的收尾条件：97% 归位，或者最多凑 3.2 秒 */
  private hasSettled(): boolean {
    if (this.particles.length === 0) return true;
    let settled = 0;
    for (const p of this.particles) if (Math.hypot(p.hx - p.x, p.hy - p.y) < 3) settled++;
    return settled / this.particles.length > 0.97 || this.scene.time.now - this.burstAt > 3200;
  }

  private drawGlow(bursting: boolean): void {
    const glow = this.glow;
    if (!glow) return;
    const on = this.mouse.active && !bursting;
    glow.setVisible(on);
    if (on) glow.setPosition(this.mouse.x, this.mouse.y);
  }
}
