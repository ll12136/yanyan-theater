import Phaser from 'phaser';
import { GameAction } from '../input/actionMapper';
import {
  KANSHAN_ANIMS,
  KANSHAN_ANIM_KEYS,
  KANSHAN_DISPLAY_HEIGHT,
  KanshanAnimKey
} from './kanshanAssets';

/**
 * 刘看山陪伴角色。
 *
 * 官方素材包（刘看山动态.zip）里给的六段透明 GIF，被 tools/build-kanshan-sprites.py
 * 切成精灵图后在这里驱动：
 *
 *   待机 idle    —— 默认呼吸循环
 *   晃悠 wander  —— 在场景里小步走动（也用作「开心地摇摆」）
 *   打招呼 greet —— 玩家做动作时的回应，也是久违后的「你回来啦」
 *   瞌睡 sleepy  —— 长时间没人理它
 *   电脑 desk    —— 玩家点「调查」，它打开电脑一起查（头顶会亮起小灯泡）
 *   运球 dribble —— 玩家切换道具时，它自己玩一会儿
 *
 * 设计原则：**没有失败、没有惩罚**。它不会饿、不会走、不会生气，
 * 只在「安静陪着」和「被你逗起来」之间来回，符合治愈小屋那条「看山永远在」的设定。
 */

/** 活动范围：允许精灵中心出现的矩形（设计空间 960×640 坐标） */
export type KanshanRoam = Phaser.Geom.Rectangle;

const SLEEP_AFTER_MS = 24000;
const WANDER_GAP_MS: [number, number] = [6000, 11000];
/** 走动速度（设计空间像素 / 秒） */
const WALK_SPEED = 46;
/** 反应后的最短锁定时长：比这更早到来的新动作可以直接打断，避免连点没反应 */
const REACT_MIN_MS = 620;

export interface KanshanOptions {
  x: number;
  y: number;
  roam: KanshanRoam;
  /** 渲染层级：默认压在「心事云」下面，保证挥剑特效在最上层 */
  depth?: number;
  /**
   * 帧高（设计空间像素），含头顶留白。默认 144（剧情场景里的小小一只）；
   * 首屏要当主视觉，可以调到 316.8 让它和原插图一样大。
   */
  displayHeight?: number;
  /** true = 让角色朝左（面向左半区的文案）；默认 false 保持素材原朝向（朝右）。 */
  faceLeft?: boolean;
}

type KanshanState = 'idle' | 'wander' | 'react' | 'sleepy';

export class KanshanCompanion {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly frameHeight: number;
  private readonly baseScale: number;
  /** 走动的目标位置；tween 直接改这个对象，再同步到精灵与影子 */
  private readonly anchor: { x: number; y: number };
  /** 反应时的原地小跳偏移（像素） */
  private hop = 0;

  private roam: KanshanRoam;
  private state: KanshanState = 'idle';
  private lastInteractAt: number;
  private nextWanderAt: number;
  private reactUntil = 0;
  private walk?: Phaser.Tweens.Tween;
  private disposed = false;
  /** 站立/反应时的朝向：true = 翻转素材，脸朝左 */
  private readonly faceLeft: boolean;

  /** 走位、量高度都要用「一只脚」的位置，这里从锚点推出来 */
  private get footY(): number {
    return this.anchor.y + (this.frameHeight * this.baseScale) / 2 - 3;
  }

  /**
   * 预加载：把动画精灵图排进场景的 loader（放在场景 preload 里调用）。
   * 传 keys 可以只加载用得到的几段——首屏不需要「电脑」「运球」，
   * 少拉 1.7 MB，剩下的等剧情场景自己加载。
   */
  static preload(scene: Phaser.Scene, keys: KanshanAnimKey[] = KANSHAN_ANIM_KEYS): void {
    for (const key of keys) {
      const spec = KANSHAN_ANIMS[key];
      if (scene.textures.exists(spec.key)) continue;
      scene.load.spritesheet(spec.key, `assets/kanshan/${spec.file}`, {
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight
      });
    }
  }

  /**
   * 注册动画。AnimationManager 属于 game 级，场景重进时动画已经存在，
   * 所以这里必须判重，否则第二次进入会抛 "animation key already exists"。
   * 纹理还没加载的动画直接跳过（按需加载时另一个场景会补上）。
   */
  static register(scene: Phaser.Scene, keys: KanshanAnimKey[] = KANSHAN_ANIM_KEYS): void {
    for (const key of keys) {
      const spec = KANSHAN_ANIMS[key];
      if (scene.anims.exists(spec.key)) continue;
      if (!scene.textures.exists(spec.key)) continue;
      scene.anims.create({
        key: spec.key,
        frames: scene.anims.generateFrameNumbers(spec.key, { start: 0, end: spec.frames - 1 }),
        frameRate: spec.fps,
        repeat: -1
      });
    }
  }

  constructor(scene: Phaser.Scene, options: KanshanOptions) {
    const spec = KANSHAN_ANIMS.idle;
    this.scene = scene;
    this.frameHeight = spec.frameHeight;
    this.baseScale = (options.displayHeight ?? KANSHAN_DISPLAY_HEIGHT) / spec.frameHeight;
    this.faceLeft = options.faceLeft ?? false;
    this.anchor = { x: options.x, y: options.y };
    this.roam = options.roam;

    const depth = options.depth ?? 6;
    const halfWidth = (spec.frameWidth * this.baseScale) / 2;
    // 脚下的影子：暗紫底上要用更深的紫才压得住，浅色阴影会像一块脏斑
    this.shadow = scene.add
      .ellipse(options.x, this.footY, halfWidth * 0.86, 9, 0x0b0714, 0.34)
      .setDepth(depth - 1);
    this.sprite = scene.add
      .sprite(options.x, options.y, spec.key)
      .setScale(this.baseScale)
      .setDepth(depth);
    this.sprite.play(spec.key);

    this.lastInteractAt = scene.time.now;
    this.nextWanderAt = scene.time.now + Phaser.Math.Between(WANDER_GAP_MS[0], WANDER_GAP_MS[1]);
    // 进屋先打个招呼，让玩家第一眼就看到 IP 是活的
    scene.time.delayedCall(900, () => {
      if (!this.disposed && this.state === 'idle') this.playReaction('greet');
    });
  }

  /** 玩家做动作：看山立刻回应（这就是「动起来比点点点强」的那一下反馈） */
  react(action: GameAction): void {
    if (this.disposed) return;
    this.lastInteractAt = this.scene.time.now;
    if (this.state === 'sleepy') {
      // 被吵醒：先挥手，再回到待机
      this.playReaction('greet');
      return;
    }
    switch (action) {
      case 'slash':
      case 'nod':
        this.playReaction('greet'); // 挥手 / 点头 → 挥手回应
        break;
      case 'hug':
        this.playReaction('wander', { hop: 14 }); // 拥抱 → 高兴地摇摆 + 蹦一下
        break;
      case 'dodge':
        this.crouch(); // 蹲下 → 陪玩家一起蹲
        break;
      case 'investigate':
        this.playReaction('desk'); // 调查 → 打开电脑一起查（头顶亮灯泡）
        break;
      case 'selectA':
      case 'selectB':
        this.playReaction('dribble'); // 切换道具 → 自己玩会儿球
        break;
      case 'move':
        this.startWander(); // 移动 → 跟着在场景里晃悠
        break;
    }
  }

  /** 光标左右移动时把它也拨动一下，让它对 UI 操作也有反应 */
  nudge(direction: -1 | 1): void {
    if (this.disposed) return;
    this.lastInteractAt = this.scene.time.now;
    if (this.state === 'react') return;
    this.wanderTo(this.anchor.x + direction * Phaser.Math.Between(18, 34), this.anchor.y + Phaser.Math.Between(-6, 6));
  }

  /**
   * 打个招呼。鼠标划过、隔一会儿没动静都走这里：
   * 睡着的时候它会先被叫醒（greet 之后再回到待机）。
   */
  greet(): void {
    if (this.disposed) return;
    this.lastInteractAt = this.scene.time.now;
    this.playReaction('greet');
  }

  /** 换一块活动区域（界面换版式时调用），并把它请过去 */
  setRoam(roam: KanshanRoam): void {
    if (this.disposed) return;
    this.roam = roam;
    const clampedX = Phaser.Math.Clamp(this.anchor.x, roam.x, roam.right);
    const clampedY = Phaser.Math.Clamp(this.anchor.y, roam.y, roam.bottom);
    if (Math.abs(clampedX - this.anchor.x) > 2 || Math.abs(clampedY - this.anchor.y) > 2) {
      this.wanderTo(clampedX, clampedY);
    }
  }

  /** 每帧调用：状态机 + 把锚点同步到精灵和影子 */
  update(time: number): void {
    if (this.disposed) return;
    if (this.state === 'react' && time >= this.reactUntil) this.enterIdle(time);
    else if (this.state === 'idle' && time - this.lastInteractAt >= SLEEP_AFTER_MS) this.enterSleepy();
    else if (this.state === 'idle' && time >= this.nextWanderAt) this.startWander();

    this.sprite.setPosition(this.anchor.x, this.anchor.y - this.hop);
    this.shadow.setPosition(this.anchor.x, this.footY);
  }

  destroy(): void {
    this.disposed = true;
    this.walk?.remove();
    this.sprite.destroy();
    this.shadow.destroy();
  }

  private enterIdle(time: number): void {
    this.state = 'idle';
    this.sprite.setFlipX(this.faceLeft);
    this.sprite.play(KANSHAN_ANIMS.idle.key, true);
    this.nextWanderAt = time + Phaser.Math.Between(WANDER_GAP_MS[0], WANDER_GAP_MS[1]);
  }

  private enterSleepy(): void {
    this.state = 'sleepy';
    this.sprite.setFlipX(this.faceLeft);
    this.sprite.play(KANSHAN_ANIMS.sleepy.key, true);
    this.walk?.remove();
    this.walk = undefined;
  }

  /** 播一段一次性反应；期间锁住状态机，结束时自动回到待机 */
  private playReaction(key: KanshanAnimKey, options: { hop?: number } = {}): void {
    const spec = KANSHAN_ANIMS[key];
    const now = this.scene.time.now;
    // 正在反应时：刚播下去的先让路，播了一会儿的允许被打断（连点也有反馈）
    if (this.state === 'react' && now < this.reactUntil - (spec.frames / spec.fps) * 1000 + REACT_MIN_MS) return;

    this.walk?.remove();
    this.walk = undefined;
    this.state = 'react';
    this.sprite.setFlipX(this.faceLeft);
    this.sprite.play({ key, repeat: 0 }, true);
    this.reactUntil = now + Math.max(REACT_MIN_MS, (spec.frames / spec.fps) * 1000);

    if (options.hop) {
      this.hop = 0;
      this.scene.tweens.add({
        targets: this,
        hop: options.hop,
        duration: 240,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeOut'
      });
    }
  }

  /** 蹲下：素材里没有蹲的动画，用一次压扁 + 影子收缩来表达「陪你一起蹲」 */
  private crouch(): void {
    const now = this.scene.time.now;
    if (this.state === 'react' && now < this.reactUntil) return;
    this.state = 'react';
    this.reactUntil = now + 900;
    this.walk?.remove();
    this.walk = undefined;
    this.sprite.setFlipX(this.faceLeft);
    this.sprite.play(KANSHAN_ANIMS.idle.key, true);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * 1.08,
      scaleY: this.baseScale * 0.74,
      duration: 260,
      yoyo: true,
      hold: 240,
      ease: 'Sine.easeInOut'
    });
    this.scene.tweens.add({
      targets: this.shadow,
      scaleX: 0.72,
      alpha: 0.07,
      duration: 260,
      yoyo: true,
      hold: 240,
      ease: 'Sine.easeInOut'
    });
  }

  private startWander(): void {
    this.wanderTo(
      Phaser.Math.Between(this.roam.x, this.roam.right),
      Phaser.Math.Between(this.roam.y, this.roam.bottom)
    );
  }

  private wanderTo(x: number, y: number): void {
    const targetX = Phaser.Math.Clamp(x, this.roam.x, this.roam.right);
    const targetY = Phaser.Math.Clamp(y, this.roam.y, this.roam.bottom);
    const distance = Phaser.Math.Distance.Between(this.anchor.x, this.anchor.y, targetX, targetY);
    if (distance < 6) {
      this.enterIdle(this.scene.time.now);
      return;
    }

    this.walk?.remove();
    this.state = 'wander';
    const movingLeft = targetX < this.anchor.x;
    this.sprite.setFlipX(this.faceLeft ? !movingLeft : movingLeft);
    this.sprite.play(KANSHAN_ANIMS.wander.key, true);
    this.walk = this.scene.tweens.add({
      targets: this.anchor,
      x: targetX,
      y: targetY,
      duration: (distance / WALK_SPEED) * 1000,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.walk = undefined;
        if (!this.disposed && this.state === 'wander') this.enterIdle(this.scene.time.now);
      }
    });
  }
}
