import Phaser from 'phaser';
import { SharpScene } from '../ui/SharpScene';
import { store } from '../store';
import { ApiClient, Encouragement } from '../ai/apiClient';
import { THEME, css, backdrop } from '../ui/theme';

/**
 * 结算高潮。顺序就是情绪顺序，不要调换：
 *
 *   ① 过来人的话   —— 真实的人说过的话，一条条涌上来（先把玩家托住）
 *   ② 带走一句     —— 收束成一句，可以点开看 TA 的完整回答
 *   ③ 三句金句     —— 逐句浮现，每浮现一句，怀里那团东西暖一分
 *   ④ 抱住它       —— 第一幕砍过的那团烦恼，现在被抱住（从砍它到抱它）
 *   ⑤ 留白         —— 什么都不发生，只有呼吸。留白是这个场景的重点，不要压缩
 *   → 然后才进结局页
 *
 * 两条硬规矩：
 *   · 这一屏只展示知乎真实回答的原样摘录；拿不到就整段跳过，绝不用本地文案顶替；
 *   · 玩家随时可以按 Esc 离开，任何阶段都不困住人。
 */

/** 结算最后对玩家说的三句话。原样保留，不要改写。 */
const GOLDEN = [
  '不要责怪曾经的自己，因为他们也很迷茫',
  '不要压力现在的自己，因为我们也很努力',
  '不要诋毁未来的自己，因为你们也很骄傲'
];

const CLOUD_TEXTURE = 'trouble-cloud';
const CLOUD_ASSET = 'assets/trouble-cloud.png';
// 暗紫夜色里的那团心事：没被抱住时是月光的冷色，抱住之后一层层转暖。
const COOL_TINT = 0x8f9ec4;
const WARM_TINT = 0xffd9a0;

/** 抱完之后什么都不发生的时间。治愈需要留白，别在这里省时间。 */
const AFTERGLOW_MS = 2600;
const MAX_SHOWN_QUOTES = 6;

type Phase = 'loading' | 'gathering' | 'collect' | 'golden' | 'hug' | 'afterglow';

export class HarvestScene extends SharpScene {
  private phase: Phase = 'loading';
  private run = 0;
  /** 金句阶段只能进一次：定时器和 Enter 可能都调它 */
  private goldenStarted = false;
  private items: Encouragement[] = [];
  private cloud: Phaser.GameObjects.Image | Phaser.GameObjects.Container | null = null;
  private glow: Phaser.GameObjects.Arc | null = null;
  private warmLevel = 0;

  constructor() {
    super('HarvestScene');
  }

  preload(): void {
    if (!this.textures.exists(CLOUD_TEXTURE)) this.load.image(CLOUD_TEXTURE, CLOUD_ASSET);
  }

  create(): void {
    // 自动化与排练开关：?harvest=off 直接进结局页。
    // 与 TroubleScene 的导演模式（F1/F3/F4/F5）同类，只服务于调试和测试，正常流程不用它。
    if (new URLSearchParams(window.location.search).get('harvest') === 'off') {
      this.scene.start('EndingScene');
      return;
    }

    this.phase = 'loading';
    this.warmLevel = 0;
    this.goldenStarted = false;
    this.items = [];
    this.cloud = null;
    this.glow = null;
    this.run += 1;
    const run = this.run;
    this.events.once('shutdown', () => {
      this.run += 1;
    });

    backdrop(this, '03 / 04    留住这一刻');

    // 随时可以离开，不困住人
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => this.finish());

    const waiting = this.add
      .text(480, 320, '正在找一些真实的人说过的话…', {
        fontFamily: 'Microsoft YaHei',
        fontSize: '15px',
        color: css(THEME.faint)
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({ targets: waiting, alpha: 1, duration: 600 });

    const query = this.profile();
    if (!query.trouble.trim()) {
      // 连心事文本都没有：直接进金句，别让这一屏空着
      waiting.destroy();
      this.time.delayedCall(300, () => this.goldenPhase());
      return;
    }

    void new ApiClient()
      .fetchEncouragements(query)
      .then((items) => {
        if (run !== this.run) return;
        waiting.destroy();
        this.items = items;
        if (items.length === 0) {
          // 拿不到就整段跳过：宁可没有这一屏，也不用别的内容顶替
          this.goldenPhase();
          return;
        }
        this.gatheringPhase();
      })
      .catch(() => {
        if (run !== this.run) return;
        waiting.destroy();
        this.goldenPhase();
      });
  }

  update(): void {
    // 呼吸由 tween 负责，这里不做事；保留空实现以便 SharpScene 的刷新逻辑复用
  }

  // ———————————————————————— 画像 ————————————————————————
  private profile() {
    const s = store.engine.state;
    const counts: Record<string, number> = {};
    for (const action of s.actions) counts[action] = (counts[action] ?? 0) + 1;
    const trouble = store.realTroubleText ?? store.selectedTrouble?.text ?? store.engine.trouble?.text ?? '';
    return {
      trouble,
      keywords: store.selectedTrouble?.keywords ?? [],
      hugged: s.huggedVoices.length,
      actions: counts,
      stats: {
        courage: s.courage,
        acceptance: s.acceptance,
        empathy: s.empathy,
        curiosity: s.curiosity
      }
    };
  }

  // ———————————————————————— ① 过来人的话 ————————————————————————
  private gatheringPhase(): void {
    this.phase = 'gathering';

    const title = this.add
      .text(480, 104, '过来人的话', { fontFamily: 'Microsoft YaHei', fontSize: '19px', color: css(THEME.green), fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    const sub = this.add
      .text(480, 132, '都是知乎上真实的人写下的，一字未改', {
        fontFamily: 'Microsoft YaHei',
        fontSize: '12px',
        color: css(THEME.faint)
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 600 });

    const raisers: { obj: Phaser.GameObjects.Text; finalY: number; delay: number }[] = [];
    let cursor = 162;
    let delay = 500;

    for (const item of this.items.slice(0, MAX_SHOWN_QUOTES)) {
      if (cursor > 556) break;
      const quote = this.add
        .text(480, cursor, `“${item.quote}”`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '16px',
          color: css(THEME.text),
          align: 'center',
          wordWrap: { width: 700, useAdvancedWrap: true },
          lineSpacing: 6
        })
        .setOrigin(0.5, 0)
        .setAlpha(0);
      const author = this.add
        .text(480, cursor + quote.height + 3, `—— @${item.author}`, {
          fontFamily: 'Microsoft YaHei',
          fontSize: '12px',
          color: css(THEME.muted)
        })
        .setOrigin(0.5, 0)
        .setAlpha(0);

      raisers.push({ obj: quote, finalY: cursor, delay });
      raisers.push({ obj: author, finalY: author.y, delay });
      cursor += quote.height + 3 + author.height + 20;
      delay += 330;
    }

    // 一条条涌上来：位置从下方升到最终位置，透明度跟上
    for (const r of raisers) {
      r.obj.y = r.finalY + 14;
      this.tweens.add({ targets: r.obj, y: r.finalY, alpha: 1, duration: 520, delay: r.delay, ease: 'Sine.easeOut' });
    }

    const total = delay + 1600;
    this.time.delayedCall(total, () => this.collectPhase([title, sub, ...raisers.map((r) => r.obj)]));
  }

  // ———————————————————————— ② 带走一句 ————————————————————————
  private collectPhase(fadeOut: Phaser.GameObjects.GameObject[]): void {
    this.phase = 'collect';
    this.tweens.add({ targets: fadeOut, alpha: 0, duration: 700 });

    const kept = this.items[0];
    if (!kept) {
      this.time.delayedCall(700, () => this.goldenPhase());
      return;
    }
    // 记下来，结局回顾里会给玩家看（有才显示，没有就不显示）
    store.keptEncouragement = { quote: kept.quote, author: kept.author, sourceUrl: kept.sourceUrl };

    const label = this.add
      .text(480, 186, '这一句，你可以带走', { fontFamily: 'Microsoft YaHei', fontSize: '15px', color: css(THEME.green), fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    const quote = this.add
      .text(480, 240, `“${kept.quote}”`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '21px',
        color: css(THEME.text),
        align: 'center',
        wordWrap: { width: 660, useAdvancedWrap: true },
        lineSpacing: 10
      })
      .setOrigin(0.5, 0)
      .setAlpha(0);
    const author = this.add
      .text(480, quote.y + 140, `—— @${kept.author}`, {
        fontFamily: 'Microsoft YaHei',
        fontSize: '13px',
        color: css(THEME.muted)
      })
      .setOrigin(0.5)
      .setAlpha(0);
    const link = this.add
      .text(480, quote.y + 176, '看 TA 的完整回答 ↗', {
        fontFamily: 'Microsoft YaHei',
        fontSize: '13px',
        color: css(THEME.blue)
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });
    link.on('pointerdown', () => window.open(kept.sourceUrl, '_blank', 'noopener'));

    // 作者与链接跟着引用的实际高度走，长句子也不会压在一起
    author.setY(quote.y + quote.height + 22);
    link.setY(author.y + 30);

    this.tweens.add({ targets: [label, quote], alpha: 1, duration: 800 });
    this.tweens.add({ targets: [author, link], alpha: 1, duration: 800, delay: 500 });

    const advance = () => this.goldenPhase();
    this.time.delayedCall(3200, advance);
    this.input.keyboard!.once('keydown-ENTER', advance);
  }

  // ———————————————————————— ③ 三句金句 ————————————————————————
  private goldenPhase(): void {
    if (this.goldenStarted) return;
    this.goldenStarted = true;
    this.phase = 'golden';

    this.buildCloud();

    const label = this.add
      .text(480, 96, '这些话，也想对你说', { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.green) })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: label, alpha: 1, duration: 700 });

    const lines = GOLDEN.filter(Boolean);
    lines.forEach((text, index) => {
      const y = 150 + index * 40;
      const line = this.add
        .text(480, y + 12, text, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          color: css(THEME.text),
          align: 'center',
          wordWrap: { width: 760, useAdvancedWrap: true }
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.add({
        targets: line,
        y,
        alpha: 1,
        duration: 900,
        delay: index * 1500,
        ease: 'Sine.easeOut',
        onComplete: () => this.warmUp((index + 1) / lines.length)
      });
    });

    this.time.delayedCall(lines.length * 1500 + 1400, () => this.hugPhase());
  }

  // ———————————————————————— 那团烦恼（第一幕砍过的那一个） ————————————————————————
  private buildCloud(): void {
    const x = 480;
    const y = 400;
    // 光晕用月光金：暗紫底上，暖光要自己亮起来才看得见
    this.glow = this.add.circle(x, y, 132, THEME.warm, 0);

    if (this.textures.exists(CLOUD_TEXTURE)) {
      const img = this.add.image(x, y, CLOUD_TEXTURE).setDisplaySize(196, 196);
      img.setTint(COOL_TINT);
      this.cloud = img;
      return;
    }
    // 素材缺失时用矢量云兜底，场景不能因为一张图崩掉
    const fallback = this.add.container(x, y);
    for (const [dx, dy, r] of [[-46, 8, 40], [-12, -14, 50], [30, 4, 44], [64, 14, 32], [8, 24, 40]] as const) {
      fallback.add(this.add.circle(dx, dy, r, COOL_TINT, 0.92));
    }
    this.cloud = fallback;
  }

  /** 每浮现一句金句，怀里那团东西就暖一分 */
  private warmUp(level: number): void {
    const from = this.warmLevel;
    this.warmLevel = level;
    if (!this.cloud || !this.glow) return;
    const cloud = this.cloud;
    const glow = this.glow;
    const state = { t: from };
    this.tweens.add({
      targets: state,
      t: level,
      duration: 900,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const color = lerpColor(COOL_TINT, WARM_TINT, state.t);
        if (cloud instanceof Phaser.GameObjects.Image) cloud.setTint(color);
        else for (const child of cloud.list as Phaser.GameObjects.Arc[]) child.setFillStyle(color, 0.92);
        glow.setAlpha(0.3 * state.t);
      }
    });
  }

  // ———————————————————————— ④ 抱住它 ————————————————————————
  private hugPhase(): void {
    if (this.phase === 'hug' || this.phase === 'afterglow') return;
    this.phase = 'hug';

    // 提示放在画布底部安全区内，避免被页眉/底部装饰线和小屏 FIT 缩放裁切。
    const prompt = this.add
      .text(480, 520, '抱住它', { fontFamily: 'Microsoft YaHei', fontSize: '22px', color: css(THEME.warm), fontStyle: 'bold' })
      .setOrigin(0.5);
    const hint = this.add
      .text(480, 550, 'H / 空格 / 点一下', { fontFamily: 'Microsoft YaHei', fontSize: '12px', color: css(THEME.faint) })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.62, duration: 1200, yoyo: true, repeat: -1 });

    let done = false;
    const doHug = () => {
      if (done) return;
      done = true;
      prompt.destroy();
      hint.destroy();
      this.performHug();
    };
    this.input.keyboard!.addKey('H').on('down', doHug);
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', doHug);
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', doHug);
    this.input.once('pointerdown', doHug);
  }

  private performHug(): void {
    if (!this.cloud) {
      this.afterglowPhase();
      return;
    }
    const cloud = this.cloud;
    const x = cloud.x;
    const y = cloud.y;

    // 一圈暖光荡开
    const ring = this.add.circle(x, y, 46).setStrokeStyle(2, THEME.warm, 0.7);
    this.tweens.add({ targets: ring, scale: 3.4, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });

    // 它向你靠近一点
    this.tweens.add({ targets: cloud, scale: 1.12, y: y - 10, duration: 720, ease: 'Sine.easeOut' });

    this.time.delayedCall(760, () => this.afterglowPhase());
  }

  // ———————————————————————— ⑤ 留白 ————————————————————————
  private afterglowPhase(): void {
    if (this.phase === 'afterglow') return;
    this.phase = 'afterglow';

    // 文字退开，只留怀里的呼吸
    for (const child of this.children.list.slice()) {
      if (child === this.cloud || child === this.glow) continue;
      if (child instanceof Phaser.GameObjects.Text) this.tweens.add({ targets: child, alpha: 0, duration: 700 });
    }

    if (this.cloud) {
      const cloud = this.cloud;
      this.tweens.add({
        targets: cloud,
        scaleY: (cloud.scaleY || 1) * 1.035,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // 什么都不发生，只有呼吸。这里不要加按钮、不要加提示。
    this.time.delayedCall(AFTERGLOW_MS, () => this.finish());
  }

  private finish(): void {
    if (!this.scene.isActive()) return;
    this.scene.start('EndingScene');
  }
}

/** 两个颜色的线性插值，避免依赖 Phaser 内部插值 API */
function lerpColor(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const fr = (from >> 16) & 255;
  const fg = (from >> 8) & 255;
  const fb = from & 255;
  const tr = (to >> 16) & 255;
  const tg = (to >> 8) & 255;
  const tb = to & 255;
  return ((fr + (tr - fr) * k) << 16) | (((fg + (tg - fg) * k) | 0) << 8) | ((fb + (tb - fb) * k) | 0);
}
