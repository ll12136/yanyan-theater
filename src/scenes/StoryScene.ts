import { SharpScene } from '../ui/SharpScene';
import Phaser from 'phaser';
import { store } from '../store';
import { InputManager } from '../input/inputManager';
import { GameAction, ACTION_LABELS } from '../input/actionMapper';
import { Encouragement } from '../ai/apiClient';
import { THEME, css, roundedRect, backdrop, button, fitText } from '../ui/theme';
import { StorySceneNode, EffectValue } from '../story/storyData';

/** 每一幕最多记 4 次「给自己的回应」，避免连点把数值刷成噪音 */
const MAX_RESPONSES_PER_SCENE = 4;

/**
 * 故事场景：一幕一幕往下走，玩家先用动作回应自己，再用选择推进故事。
 *
 * 这一页的四条规矩：
 *   1. 素材要么是知乎真实内容改编（并在幕上署名），要么是本地示例剧情（并如实标注），不含糊；
 *   2. 动作只改状态、不推进故事，选择才推进——所以两者在版面上分开摆放并各有说明；
 *   3. 幕与幕之间留一次呼吸，不硬切；
 *   4. 选一条路必须分两步：先「选中」把它点亮，再「确认」才换幕。
 *      体感设备的手势和连点常常不请自来——dongle 的「双手交叉额头」就是依次敲 1/2/3/4
 *      （MoveToPlay/main/app_main.c:1131-1142），「右手挥砍」是鼠标左键连点；
 *      一步就换幕的话，玩家还没做选择，第二幕就自己跳出来了。
 */
export class StoryScene extends SharpScene {
  private inputMgr!: InputManager;
  private title = '';
  private sceneNodes: StorySceneNode[] = [];
  private sceneIndex = 0;
  private titleText!: Phaser.GameObjects.Text;
  private creditText!: Phaser.GameObjects.Text;
  private sceneText!: Phaser.GameObjects.Text;
  private echoText!: Phaser.GameObjects.Text;
  private actSourceText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private optionAText!: Phaser.GameObjects.Text;
  private optionBText!: Phaser.GameObjects.Text;
  /** 两张选项卡片的底：选中态要重新画它，所以留着引用 */
  private optionCards: Phaser.GameObjects.Graphics[] = [];
  /** 玩家点亮的是哪一条；null 表示这一幕还没选 */
  private selectedSlot: 'A' | 'B' | null = null;
  private confirmButton!: Phaser.GameObjects.Graphics;
  private confirmText!: Phaser.GameObjects.Text;
  private choiceHint!: Phaser.GameObjects.Text;
  /**
   * 这一幕读到什么时候为止收到的「选 / 确认」都不算数。
   * 换幕时会把上一幕残留的手势与连点挡在门外，别让它们把新的一幕推走。
   */
  private inputLockUntil = 0;
  /** 选中之后要过一小会儿才允许确认：同一次连点不许既选中又确认 */
  private confirmArmedAt = 0;
  /** 四个身体动作按钮，要按幕淡出其中的「选项」动作，所以要留着引用 */
  private responseButtons: { action: GameAction; bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }[] = [];
  private responseHint!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private breath!: Phaser.GameObjects.Container;
  private breathText!: Phaser.GameObjects.Text;
  private selfNoteDialog: HTMLDialogElement | null = null;

  private run = 0;
  private interacted = false;
  private transitioning = false;
  private actionCount = 0;
  private sceneResponses = 0;
  /** 是否还在等模型把知乎原文改编成剧情（等着的时候如实告诉玩家） */
  private aiPending = false;
  /** 逐字浮现用的计时器，换幕时要停掉 */
  private revealTimer: Phaser.Time.TimerEvent | null = null;
  private encouragementRun = 0;

  constructor() {
    super('StoryScene');
  }

  create(): void {
    this.sceneIndex = 0;
    this.interacted = false;
    this.transitioning = false;
    this.actionCount = 0;
    this.sceneResponses = 0;
    this.run++;
    this.events.once('shutdown', () => {
      this.run++;
      this.selfNoteDialog?.remove();
      this.selfNoteDialog = null;
    });
    const W = 960;

    backdrop(this, '02 / 04    走进故事');

    this.titleText = this.add
      .text(W / 2, 106, '', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: css(THEME.text), fontStyle: 'bold' })
      .setOrigin(0.5);

    // 这一幕的素材打哪儿来，写在标题下面，不留给玩家猜
    this.creditText = this.add
      .text(W / 2, 138, '', { fontFamily: 'Microsoft YaHei', fontSize: '10px', color: css(THEME.faint), align: 'center', wordWrap: { width: 760, useAdvancedWrap: true } })
      .setOrigin(0.5);

    roundedRect(this, 90, 156, 780, 200, 20, THEME.paper, 1, THEME.warm, 0.18).disableInteractive();

    // 正文竖排在卡片上半部；origin 用 0.5 让它自己居中，不再顶在上面留一大片空
    this.sceneText = this.add
      .text(W / 2, 212, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '21px',
        color: css(THEME.text),
        wordWrap: { width: 700, useAdvancedWrap: true },
        align: 'left',
        lineSpacing: 12
      })
      .setOrigin(0.5);

    // 卡片下半部留给「给自己的回应」，跟正文用一条细线分开
    const rule = this.add.graphics();
    rule.lineStyle(1, THEME.warm, 0.22).lineBetween(150, 288, 810, 288);

    this.echoText = this.add
      .text(W / 2, 314, '', {
        fontFamily: 'Microsoft YaHei',
        fontSize: '14px',
        color: css(THEME.green),
        align: 'center',
        wordWrap: { width: 690, useAdvancedWrap: true },
        lineSpacing: 5
      })
      .setOrigin(0.5);
    fitText(this.echoText, 44);

    // 每一幕各自标明它陪你的那个人是谁，而不是整篇共用一个署名
    this.actSourceText = this.add
      .text(W / 2, 346, '', {
        fontFamily: 'Microsoft YaHei',
        fontSize: '11px',
        color: css(THEME.muted),
        align: 'center',
        wordWrap: { width: 700, useAdvancedWrap: true }
      })
      .setOrigin(0.5);

    this.promptText = this.add
      .text(W / 2, 381, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: css(THEME.warm), fontStyle: 'bold' })
      .setOrigin(0.5);

    // 选项要能用键盘走完（← / → 选中，Enter 确认），不只是点击。
    // 卡片自己留引用：选中之后要把底重画成暖色，让「选中了哪条」看得见。
    this.optionCards = [];
    for (const [x, action] of [[120, 'selectA'], [490, 'selectB']] as const) {
      const card = roundedRect(this, x, 409, 350, 78, 14, THEME.paper, 1, THEME.warm, 0.35).on('pointerdown', () =>
        this.onAction(action)
      );
      card.input!.cursor = 'pointer';
      this.optionCards.push(card);
    }
    this.optionAText = this.add
      .text(W / 2 - 180, 443, '', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: css(THEME.text), align: 'center', wordWrap: { width: 300, useAdvancedWrap: true } })
      .setOrigin(0.5);
    this.optionBText = this.add
      .text(W / 2 + 180, 443, '', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: css(THEME.text), align: 'center', wordWrap: { width: 300, useAdvancedWrap: true } })
      .setOrigin(0.5);
    // 卡片角上写清键位：哪张卡对应哪个方向键，不让玩家猜
    for (const [x, mark] of [[136, '←'], [506, '→']] as const) {
      this.add
        .text(x, 421, mark, { fontFamily: 'Microsoft YaHei', fontSize: '13px', color: css(THEME.faint) })
        .setOrigin(0.5);
    }

    // 「选中」和「确认」是两件事：这里只点亮一条路，下面这条宽按钮才换幕。
    // 做得宽是因为体感玩家只能靠「左转 / 右转」移动光标，窄按钮点不中。
    this.confirmButton = roundedRect(this, 270, 496, 420, 48, 24, THEME.paper, 1, THEME.warm, 0.5);
    this.confirmButton.input!.cursor = 'pointer';
    this.confirmButton.on('pointerdown', () => this.onAction('confirm'));
    this.confirmText = this.add
      .text(W / 2, 520, '选一条路，再往下走', { fontFamily: 'Microsoft YaHei', fontSize: '15px', color: css(THEME.faint) })
      .setOrigin(0.5);
    this.choiceHint = this.add
      .text(W / 2, 564, '【← / →】或点卡片选中一条路 · 【Enter】或点上面的按钮确认往下走', {
        fontFamily: 'Microsoft YaHei',
        fontSize: '12px',
        color: css(THEME.faint)
      })
      .setOrigin(0.5);

    // 体感回应通过硬件直接触发，不在页面底部重复摆放按钮。
    this.responseButtons = [];
    this.responseHint = this.add
      .text(-1000, -1000, '', { fontFamily: 'Microsoft YaHei', fontSize: '11px', color: css(THEME.faint) })
      .setOrigin(0.5);

    this.statsText = this.add
      .text(W / 2, 604, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: css(THEME.faint) })
      .setOrigin(0.5);

    this.breath = this.makeBreath();
    this.breath.setVisible(false);

    this.inputMgr = new InputManager(this, (action) => this.onAction(action));

    // 先用本地剧情保证可玩，再异步换成基于知乎原文的改编剧情
    if (!store.engine.story) store.engine.selectTrouble('cantfall');
    this.title = store.engine.story?.title ?? '故事';
    this.sceneNodes = store.engine.story?.scenes ?? [];
    store.storyCredit = this.localCredit();
    this.renderScene();
    void this.loadAiStory();
  }

  update(time: number): void {
    this.inputMgr.update(time);
  }

  /** 本地示例剧情的来源说明：它不是知乎内容，就不许写成知乎内容 */
  private localCredit(): string {
    const trouble = store.selectedTrouble ?? store.engine.trouble;
    const sample = store.engine.sample;
    const name = sample ? `《${sample.sourceTitle}》` : '本地示例剧情';
    // 知乎热议卡没有本地剧情，主题标签不能写成占位那套「入睡困难」
    const label = trouble?.category === 'real' ? '知乎热议' : (trouble?.categoryLabel ?? '今夜的心事');
    return `本地示例剧情 ${name} · 非知乎内容 · 用于「${label}」这一类心事`;
  }

  /** 有知乎真实内容时，用真实作者与书名署名 */
  private zhihuCredit(title: string): string {
    const voices = store.realVoices ?? [];
    if (voices.length === 0) return `本地示例剧情《${title}》 · 非知乎内容`;
    const [first] = voices;
    const rest = voices.length > 1 ? ` 等 ${voices.length} 条` : '';
    return `改编自知乎 · @${first.author}《${first.title}》${rest} · 原作仍属原作者`;
  }

  /** 标题下面那行来源说明：等着改编时也把状态说清楚，不静默换内容 */
  private creditLine(): string {
    const base = store.storyCredit ?? this.localCredit();
    return this.aiPending ? `${base}  ·  正在用知乎原文改编…` : base;
  }

  private refreshCredit(): void {
    this.creditText.setText(this.creditLine());
  }

  /** 异步生成剧情：拿不到就保持玩家自己心事对应的本地剧情，绝不换成别的主题 */
  private async loadAiStory(): Promise<void> {
    if (!store.realTroubleText) return;
    const run = this.run;
    const localTitle = this.title;
    const localNodes = this.sceneNodes;
    if (store.realSampleText) {
      this.aiPending = true;
      this.refreshCredit();
    }
    const ai = await store.api.generateStory(store.realTroubleText, store.realSampleText ?? '');
    if (run !== this.run) return;
    // 玩家已经开始回应，就不在他读的时候换剧情
    if (this.interacted) {
      this.aiPending = false;
      this.refreshCredit();
      return;
    }
    if (!ai || !Array.isArray(ai.scenes) || ai.scenes.length === 0) {
      // 降级：继续用玩家这张心事卡自己的本地剧情（之前这里会跳去辞职主题，是错的）
      this.aiPending = false;
      this.title = localTitle;
      this.sceneNodes = localNodes;
      store.storyCredit = this.localCredit();
      this.refreshCredit();
      return;
    }
    store.aiStory = ai;
    this.aiPending = false;
    this.title = typeof ai.title === 'string' && ai.title ? ai.title : this.title;
    this.sceneNodes = (ai.scenes as Array<Record<string, unknown>>).map(convertAiScene);
    this.sceneIndex = 0;
    store.storyCredit = this.zhihuCredit(this.title);
    this.renderScene(true);
  }

  /** 换幕：先淡入一层呼吸，再出现下一幕 */
  private breathe(next: () => void): void {
    this.transitioning = true;
    this.breath.setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.breath,
      alpha: 1,
      duration: 420,
      onComplete: () => {
        this.time.delayedCall(620, () => {
          next();
          this.tweens.add({
            targets: this.breath,
            alpha: 0,
            duration: 520,
            onComplete: () => {
              this.breath.setVisible(false);
              this.transitioning = false;
            }
          });
        });
      }
    });
  }

  /** 这一幕的正文要逐字浮现多久；太短的一句话不逐字，直接给完整的 */
  private static revealMs(full: string): number {
    if (full.length < 4) return 0;
    return Math.max(16, Math.round(1400 / full.length)) * (full.length - 1);
  }

  /**
   * 正文逐字浮现：先用完整文本量一次高度把顶端钉住，
   * 再逐字 setText，这样整块不会因为行数变化而上下跳。
   */
  private revealSceneText(full: string): void {
    this.revealTimer?.remove();
    this.revealTimer = null;
    // 上一幕可能被 fitText 缩过字号，这里先还原再重新量
    this.sceneText.setFontSize(21).setText(full);
    fitText(this.sceneText, 118);
    const top = 212 - this.sceneText.height / 2;
    this.sceneText.setOrigin(0.5, 0).setY(top);
    if (full.length < 4) return;
    const step = Math.max(16, Math.round(1400 / full.length));
    let shown = 0;
    this.sceneText.setText('');
    this.revealTimer = this.time.addEvent({
      delay: step,
      repeat: full.length - 1,
      callback: () => {
        shown += 1;
        this.sceneText.setText(full.slice(0, shown));
      }
    });
  }

  /** 这一幕对应哪条知乎内容；没有真实内容时返回空串，不硬凑 */
  private actSource(): string {
    const voices = store.realVoices ?? [];
    if (voices.length === 0) return '';
    const voice = voices[this.sceneIndex % voices.length];
    return `这一幕陪你的人：知乎 · @${voice.author}《${voice.title}》`;
  }

  private makeBreath(): Phaser.GameObjects.Container {
    const veil = roundedRect(this, 0, 0, 960, 640, 0, THEME.bg2, 1).disableInteractive();
    const line = this.add
      .text(480, 316, '先停一下，呼吸一次。', { fontFamily: 'Microsoft YaHei', fontSize: '22px', color: css(THEME.text) })
      .setOrigin(0.5);
    this.breathText = this.add
      .text(480, 352, '不用急着睡着，你已经在安顿自己了。', { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.muted) })
      .setOrigin(0.5);
    const container = this.add.container(0, 0, [veil, line, this.breathText]).setDepth(30);
    container.setVisible(false);
    return container;
  }

  private renderScene(fade = false): void {
    const node = this.sceneNodes[this.sceneIndex];
    if (!node) {
      void this.askSelfNote();
      return;
    }
    this.sceneResponses = 0;
    this.titleText.setText(this.title);
    store.storyTitle = this.title;
    // 引擎的进度也跟上，别让「这一程走到了第几幕」只有页面自己知道
    store.engine.state.currentSceneIndex = this.sceneIndex;
    this.refreshCredit();
    this.revealSceneText(node.text);
    this.echoText.setText(this.openingEcho());
    this.actSourceText.setText(this.actSource());
    this.promptText.setText(node.prompt).setWordWrapWidth(740, true);
    fitText(this.promptText, 38);
    this.optionAText.setText(node.optionA.label);
    this.optionBText.setText(node.optionB.label);
    // 模型写的选项可能很长，缩到卡片装得下，别溢出行外
    fitText(this.optionAText, 56, 12);
    fitText(this.optionBText, 56, 12);
    // 新的一幕：先把上一条路的选择清干净，再给玩家留够读这一幕的时间。
    // 这段静默期专门用来挡住换幕瞬间还在路上的手势与连点。
    this.selectedSlot = null;
    this.confirmArmedAt = 0;
    this.paintOptions();
    this.inputLockUntil = this.time.now + StoryScene.revealMs(node.text) + 400;
    // 回应按钮始终保持可用；动作只提供情绪反馈，不会意外替代选项。
    const asOption = new Set<GameAction>();
    for (const b of this.responseButtons) {
      const isOption = asOption.has(b.action);
      const alpha = isOption ? 0.25 : 1;
      b.bg.setAlpha(alpha);
      b.text.setAlpha(alpha);
      if (b.bg.input) b.bg.input.enabled = !isOption;
    }
    this.responseHint.setText(
      '先选一条故事路径，再用动作回应此刻的自己'
    );
    this.updateStats();
    if (fade) {
      this.sceneText.setAlpha(0);
      this.tweens.add({ targets: this.sceneText, alpha: 1, duration: 700 });
    }
  }

  /**
   * 重画两张选项卡与那颗确认键：选中的那张填暖色、描粗边。
   * 页面上的状态只有一处是真的——这里画出来的那一处。
   */
  private paintOptions(): void {
    const slots: ('A' | 'B')[] = ['A', 'B'];
    this.optionCards.forEach((card, i) => {
      const on = slots[i] === this.selectedSlot;
      card.clear();
      // 深色底上先铺卡片面，再叠一层很淡的暖金当「点亮」——比换一整套颜色稳
      card.fillStyle(THEME.paper, 1);
      card.fillRoundedRect(0, 0, 350, 78, 14);
      if (on) {
        card.fillStyle(THEME.warm, 0.22);
        card.fillRoundedRect(0, 0, 350, 78, 14);
      }
      card.lineStyle(on ? 2.5 : 1, THEME.warm, on ? 0.95 : 0.35);
      card.strokeRoundedRect(0, 0, 350, 78, 14);
    });
    this.confirmText.setText(this.selectedSlot ? '就这条路，往下走 →' : '选一条路，再往下走');
    this.confirmText.setColor(css(this.selectedSlot ? THEME.text : THEME.faint));
    this.confirmButton.setAlpha(this.selectedSlot ? 1 : 0.65);
  }

  /** 选中一条路：只点亮，不换幕 */
  private selectOption(slot: 'A' | 'B'): void {
    this.selectedSlot = slot;
    // 同一次连点不许既选中又确认，留出一个可以反悔的间隙
    this.confirmArmedAt = this.time.now + 350;
    this.paintOptions();
  }

  /** 确认这条路：只有走到这里，故事才往下走一幕 */
  private confirmOption(): void {
    const node = this.sceneNodes[this.sceneIndex];
    if (!node) return;
    if (!this.selectedSlot) {
      this.choiceHint.setText('先选一条路：按 ← / → 或点一张卡片，再按 Enter 确认');
      this.choiceHint.setColor(css(THEME.warm));
      return;
    }
    if (this.time.now < this.confirmArmedAt) {
      // 手快的人会在选中之后立刻按确认：不静默丢掉，而是告诉他还差一下
      this.choiceHint.setText('先看一眼这两条路 · 再按一次 Enter（或点一次按钮）就往下走');
      this.choiceHint.setColor(css(THEME.warm));
      return;
    }
    const choice = this.selectedSlot === 'A' ? node.optionA : node.optionB;
    this.interacted = true;
    store.engine.applyChoice(choice.effect);
    void this.showChoiceEncouragement(choice.label);
    this.nextScene();
  }

  /** 刚进这一幕时，卡片下半部先放一句安静的话，而不是空的 */
  private openingEcho(): string {
    const lines = [
      '慢慢来，这一幕不需要你立刻做对什么。',
      '先读完这一段，再决定要不要回应。',
      '你在这里是安全的，躺着看也可以。'
    ];
    return lines[this.sceneIndex % lines.length];
  }

  private updateStats(): void {
    const s = store.engine.state;
    const hugs = s.huggedVoices.length;
    // 三项指标：courage=放松（松开一点压力）· acceptance=接纳 · empathy=陪伴
    const parts = [`放松 ${s.courage}`, `接纳 ${s.acceptance}`, `陪伴 ${s.empathy}`];
    if (hugs > 0) parts.push(`拥抱过的知乎声音 ${hugs}`);
    parts.push(`给自己的回应 ${this.actionCount} 次`);
    this.statsText.setText(parts.join(' · '));
  }

  private onAction(action: GameAction): void {
    if (this.transitioning) return;
    const node = this.sceneNodes[this.sceneIndex];
    if (!node) return;

    // 「选一条路」和「确认往下走」是两步，而且都要等这一幕读得差不多了才算数。
    // 体感设备的手势（双手交叉额头=连敲数字键、右手挥砍=鼠标左键连点）不请自来，
    // 没有这两道门，玩家还没做选择，第二幕就会自己跳出来。
    if (action === 'selectA' || action === 'selectB') {
      if (this.time.now < this.inputLockUntil) return;
      this.interacted = true;
      this.selectOption(action === 'selectA' ? 'A' : 'B');
      this.choiceHint.setText('这条路已经点亮了 · 按 Enter 或点下面的按钮，故事才往下走');
      this.choiceHint.setColor(css(THEME.faint));
      return;
    }
    if (action === 'confirm') {
      if (this.time.now < this.inputLockUntil) return;
      this.confirmOption();
      return;
    }

    this.interacted = true;
    if (action === 'slash' || action === 'hug' || action === 'nod' || action === 'dodge' || action === 'investigate') {
      // 一幕之内给自己的回应有限度：超过之后只留话，不再加数值
      if (this.sceneResponses >= MAX_RESPONSES_PER_SCENE) {
        this.echoText.setText('你已经给过自己很多回应了。接下来，选一条路让故事往前走。');
        fitText(this.echoText, 48);
        return;
      }
      store.engine.record(action);
      this.actionCount += 1;
      this.sceneResponses += 1;
      this.echoText.setText(this.actionResponse(action));
      fitText(this.echoText, 48);
      this.echoText.setAlpha(0.4);
      this.tweens.add({ targets: this.echoText, alpha: 1, duration: 320 });
      this.updateStats();
    }
  }

  /** 选择后异步展示知乎真实回答摘录；接口没有结果时不伪造作者原话。 */
  private async showChoiceEncouragement(choice: string): Promise<void> {
    const run = ++this.encouragementRun;
    const trouble = store.realTroubleText ?? store.selectedTrouble?.text ?? store.engine.trouble?.text ?? '';
    const keywords = [...(store.selectedTrouble?.keywords ?? []), choice].filter(Boolean).slice(0, 8);
    this.echoText.setText('正在从知乎寻找和这一步相似的经历…');
    fitText(this.echoText, 48);
    const items = await store.api.fetchEncouragements({ trouble, keywords, actions: { choice: 1 }, stats: {
      courage: store.engine.state.courage,
      acceptance: store.engine.state.acceptance,
      empathy: store.engine.state.empathy,
      curiosity: store.engine.state.curiosity
    }});
    if (run !== this.encouragementRun) return;
    const item: Encouragement | undefined = items[0];
    if (item?.quote) {
      this.echoText.setText(`知乎网友 @${item.author}：\n“${item.quote}”`);
    } else {
      this.echoText.setText('这一步没有标准答案。你愿意继续走，已经是在给自己动力。');
    }
    fitText(this.echoText, 62);
  }

  /**
   * 动作之后的回声。只描述玩家刚做的事和一点点陪伴，不假装是知乎作者的原话：
   * 真实来源始终由标题下面那行署名负责。
   */
  private actionResponse(action: GameAction): string {
    const actionLine: Record<string, string> = {
      hug: '你抬起左手，把今天这份不容易轻轻接住了。先被理解，再慢慢睡着。',
      nod: '你点了点头：睡不着也是真的，不必急着把自己哄睡。',
      slash: '你挥剑斩开一点今晚的纠结。不必一次斩断，先清出一小块能呼吸的地方。',
      dodge: '你给自己留出一点空隙。躺下来歇一会，本来就是睡前该做的事。',
      investigate: '你愿意再看一眼今晚的心事。看见它，就已经松下来一点了。'
    };
    const head = `你${ACTION_LABELS[action]}了 · ${this.effectLabel(action)}`;
    const milestone =
      this.sceneResponses >= 3
        ? `\n你已经在这一幕里回应了自己 ${this.sceneResponses} 次。这些回应不需要谁来批准，它们已经发生了。`
        : this.sceneResponses === 2
          ? '\n再多走一步也好，或者现在就去选一条路。'
          : '';
    return `${head}\n${actionLine[action] ?? ''}${milestone}`;
  }

  private effectLabel(action: GameAction): string {
    switch (action) {
      case 'slash':
        return '放松 +2';
      case 'hug':
        return '接纳 +2，陪伴 +2';
      case 'nod':
        return '接纳 +1，陪伴 +1';
      case 'dodge':
        return '接纳 +2，先歇一会';
      case 'investigate':
        return '看清一点 +1，陪伴 +2';
      default:
        return '';
    }
  }

  private nextScene(): void {
    this.sceneIndex += 1;
    if (this.sceneIndex < this.sceneNodes.length) {
      this.breathe(() => this.renderScene(true));
    } else {
      void this.askSelfNote();
    }
  }

  /**
   * 走完最后一幕，留一句给玩家自己的话（可跳过）。
   * 这是这一页唯一「玩家写下来的东西」，会被带进结局卡与分享文案。
   */
  private askSelfNote(): void {
    if (this.selfNoteDialog) return;
    this.transitioning = true;
    this.input.enabled = false;
    this.input.keyboard!.enabled = false;

    const dialog = document.createElement('dialog');
    this.selfNoteDialog = dialog;
    dialog.setAttribute('aria-label', '写给自己的话');
    dialog.style.cssText =
      'border:1px solid #4a3f6b;border-radius:22px;background:#2b2144;color:#f2edfb;padding:30px;width:min(560px,86vw);' +
      "font:15px/1.9 'Microsoft YaHei',sans-serif;box-shadow:0 24px 90px #0b071499";

    const title = document.createElement('h2');
    title.textContent = '今晚睡前，想对自己说一句什么？';
    title.style.cssText = 'margin:0 0 6px;font-size:20px;line-height:1.6';
    const note = document.createElement('p');
    note.textContent = '可以不写。写下来的话会出现在结局卡上，也只留在这台设备上。';
    note.style.cssText = 'margin:0 0 14px;font-size:12px;color:#9184b0';

    const input = document.createElement('textarea');
    input.setAttribute('aria-label', '想对自己说的话');
    input.setAttribute('placeholder', '例如：今天先这样，也够了。');
    input.maxLength = 120;
    input.style.cssText =
      'box-sizing:border-box;width:100%;height:96px;padding:14px;border:1px solid #4a3f6b;border-radius:12px;' +
      "font:15px/1.8 'Microsoft YaHei';background:#221a36;color:#f2edfb;resize:vertical";

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px';
    const skip = document.createElement('button');
    skip.textContent = '先不写，看今晚的收尾';
    skip.style.cssText = 'padding:11px 16px;border:1px solid #4a3f6b;border-radius:10px;background:transparent;color:#c4b9dd;cursor:pointer';
    const save = document.createElement('button');
    save.textContent = '写下，再看今晚的收尾';
    save.style.cssText = 'padding:11px 18px;border:0;border-radius:10px;background:#86d6b4;color:#1e1730;cursor:pointer';

    const finish = (value: string | null) => {
      store.selfNote = value && value.trim() ? value.trim() : null;
      dialog.close();
    };
    skip.onclick = () => finish(null);
    save.onclick = () => finish(input.value);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        finish(input.value);
      }
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      this.selfNoteDialog = null;
      this.transitioning = false;
      this.input.enabled = true;
      this.input.keyboard!.enabled = true;
      // 先过结算高潮（过来人的话 → 三句金句 → 拥抱 → 留白），再进结局页
      this.scene.start('HarvestScene');
    });

    row.append(skip, save);
    dialog.append(title, note, input, row);
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  }
}

/** 把 AI 生成的场景 JSON 转成本地 StorySceneNode 格式 */
function convertAiScene(s: Record<string, unknown>): StorySceneNode {
  const options = Array.isArray(s.options) ? (s.options as Array<Record<string, unknown>>) : [];
  const optA = options[0] ?? {};
  const optB = options[1] ?? {};
  return {
    id: String(s.id ?? 'scene'),
    text: String(s.text ?? ''),
    prompt: String(s.prompt ?? '你会怎么做？'),
    action: String(s.action ?? 'nod') as GameAction,
    optionA: {
      label: String(optA.label ?? '选择 A'),
      effect: normalizeEffect(optA.effect)
    },
    optionB: {
      label: String(optB.label ?? '选择 B'),
      effect: normalizeEffect(optB.effect)
    }
  };
}

function normalizeEffect(e: unknown): EffectValue {
  if (!e || typeof e !== 'object') return {};
  const obj = e as Record<string, unknown>;
  const effect: EffectValue = {};
  if (typeof obj.courage === 'number') effect.courage = obj.courage;
  if (typeof obj.acceptance === 'number') effect.acceptance = obj.acceptance;
  if (typeof obj.empathy === 'number') effect.empathy = obj.empathy;
  if (typeof obj.curiosity === 'number') effect.curiosity = obj.curiosity;
  return effect;
}
