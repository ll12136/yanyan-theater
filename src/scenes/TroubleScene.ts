import { CompanionPanel } from '../ui/CompanionPanel';
import { SharpScene } from '../ui/SharpScene';
import Phaser from 'phaser';
import { store } from '../store';
import { InputManager } from '../input/inputManager';
import { GameAction } from '../input/actionMapper';
import { TROUBLE_LIST, Trouble } from '../story/storyData';
import { THEME, css, roundedRect, backdrop, fitText, button } from '../ui/theme';
import { ZhihuKnowledgeItem, ZhihuVoice } from '../ai/apiClient';
import { KanshanCompanion } from '../companion/KanshanCompanion';

type Phase = 'choose' | 'manifest' | 'slashing' | 'loading' | 'sample' | 'offline';

/**
 * 刘看山的落脚点。选心事时卡片占满版面，它待在标题右侧那条空白带里；
 * 心事实体化之后下半版空出来，走动的范围就宽一些；
 * 最后三个声音面板是盖在画布上的 DOM 层（上沿在设计坐标 y=176），
 * 所以那一页它要退回面板上方，别被挡住。
 */
const ROAM_CHOOSE = new Phaser.Geom.Rectangle(760, 100, 136, 26);
const ROAM_STAGE = new Phaser.Geom.Rectangle(720, 100, 176, 30);
const ROAM_PANEL = new Phaser.Geom.Rectangle(766, 94, 130, 10);

/** Watercolour study of the trouble itself, painted by tools/gen-trouble-art.mjs. */
const CLOUD_TEXTURE = 'trouble-cloud';
const CLOUD_ASSET = 'assets/trouble-cloud.png';
/**
 * The file is 1024² with the painting occupying y 49..873, x 97..924, so this
 * size puts the cloud top just under the subtitle and the knot just above the
 * "此刻的心事" card (see the painted-area line the art tool prints).
 */
const CLOUD_SIZE = 329;
const CLOUD_Y = 9;

/** 今晚的心事选择 + 实体化 + 挥剑放下场景（接入真实知乎内容） */
export class TroubleScene extends SharpScene {
  private inputMgr!: InputManager;
  private phase: Phase = 'choose';
  private selectedIndex = 0;
  private troubleList: Trouble[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private zones: Phaser.GameObjects.Rectangle[] = [];
  private troubleCloud!: Phaser.GameObjects.Container;
  private manifestCard?: Phaser.GameObjects.Container;
  private detailDialog?: HTMLDialogElement;
  private hintText!: Phaser.GameObjects.Text;
  private sampleGroup!: Phaser.GameObjects.Container;
  /** 三个声音面板；拥抱与「知乎原文」入口都在它里面 */
  private companionPanel: CompanionPanel | null = null;
  /** 刘看山：全程陪着玩家，并对每个体感/键鼠动作给出反应 */
  private kanshan: KanshanCompanion | null = null;

  private run = 0;
  private renderedPage = -1;
  private loadingTimer?: Phaser.Time.TimerEvent;

  update(time: number): void {
    this.inputMgr.update(time);
    this.kanshan?.update(time);
  }

  constructor() {
    super('TroubleScene');
  }

  preload(): void {
    // Relative to the page: works both from the dev server and from dist/.
    this.load.image(CLOUD_TEXTURE, CLOUD_ASSET);
    KanshanCompanion.preload(this);
  }

  create(): void {
    this.phase='choose'; this.selectedIndex=0; this.cards=[]; this.zones=[]; this.renderedPage=-1;
    this.companionPanel=null;
    this.kanshan=null;
    this.run++; this.events.once('shutdown',()=>{this.run++;this.companionPanel=null;this.kanshan=null;});
    const W = 960;
    const H = 640;
    backdrop(this, '01 / 04    今晚的心事');
    KanshanCompanion.register(this);

    this.add
      .text(W / 2, 112, '今晚，是什么让你还没睡着？', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: css(THEME.text), fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 151, '挑一件今天压着你的事。你不用一个人面对。', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: css(THEME.muted) })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(W / 2, 615, '挑一件今晚的心事，准备好就往下走', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: css(THEME.faint)
      })
      .setOrigin(0.5);

    // 线上优先：页面先等待知乎热门知识列表，避免把固定主题误当成“当前大众焦虑”。
    this.troubleList = [];
    this.renderCards();

    this.inputMgr = new InputManager(this, (action) => this.onAction(action));

    // 光标移动
    const kb = this.input.keyboard!;
    const moveCursor = (delta: number) => {
      if (this.phase !== 'choose') return;
      this.selectedIndex = (this.selectedIndex + delta + this.troubleList.length) % this.troubleList.length;
      this.highlightCard(this.selectedIndex);
      this.kanshan?.nudge(delta < 0 ? -1 : 1);
    };
    kb.addKey('A').on('down', () => moveCursor(-1));
    kb.addKey('D').on('down', () => moveCursor(1));
    kb.addKey('LEFT').on('down', () => moveCursor(-1));
    kb.addKey('RIGHT').on('down', () => moveCursor(1));

    // 烦恼实体化对象
    this.troubleCloud = this.makeTroubleCloud();
    this.troubleCloud.setVisible(false);
    this.sampleGroup = this.add.container(0, 0);
    this.sampleGroup.setVisible(false);

    this.highlightCard(0);
    this.setupDirectorMode();
    button(this,365,533,230,'就把这件心事，先放下',()=>{if(this.phase==='choose') this.beginManifest();});
    button(this,75,533,130,'← 上一组',()=>this.changePage(-1),false);
    button(this,755,533,130,'下一组 →',()=>this.changePage(1),false);

    // 刘看山：站在标题右侧的空白带里，全程陪着玩家
    this.kanshan = new KanshanCompanion(this, { x: 828, y: 116, roam: ROAM_CHOOSE, depth: 6 });

    // 异步加载真实知乎烦恼
    void this.loadRealTroubles();
  }

  private changePage(delta: number): void {
    if(this.phase!=='choose') return;
    const pages=Math.ceil(this.troubleList.length/6);
    this.selectedIndex=((Math.floor(this.selectedIndex/6)+delta+pages)%pages)*6;
    this.highlightCard(this.selectedIndex);
  }

  /** 异步拉取知乎知识列表（真实的知乎热议内容），排过序之后接在今晚的心事后面 */
  private async loadRealTroubles(): Promise<void> {
    const run = this.run;
    const items = await store.api.fetchKnowledge();
    if(run !== this.run || this.phase !== 'choose') return;
    if (items.length === 0) {
      // 无网络时才使用本地主题，并明确标记为离线兜底。
      this.troubleList = [...TROUBLE_LIST];
      this.renderCards();
      this.highlightCard(0);
      this.hintText.setText('暂时无法读取知乎热门内容，已使用离线主题');
      return;
    }
    const real = rankRealTroubles(items).slice(0, 12).map((it, i) => knowledgeToTrouble(it, i));
    store.realTroubles = real;
    // 今夜的心事排在前面：这一版的产品就是「看山问你，睡了吗？」，
    // 开头六张卡必须先是睡不着这件事；知乎热议的真实内容接在后面，翻页照旧。
    this.troubleList = [...TROUBLE_LIST, ...real];
    this.renderCards();
    this.highlightCard(this.selectedIndex);
  }

  /** 渲染心事卡片（3 列，动态行数） */
  private renderCards(): void {
    this.cards.forEach((c) => c.destroy());
    this.zones.forEach((z) => z.destroy());
    this.cards = [];
    this.zones = [];

    const page = Math.floor(this.selectedIndex / 6);
    this.renderedPage = page;
    this.troubleList.slice(page*6,page*6+6).forEach((trouble, local) => {
      const i = page*6+local;
      const col = i % 3;
      const row = Math.floor(local / 3);
      const cx = 200 + col * 280;
      const cy = 274 + row * 160;
      this.cards.push(this.makeTroubleCard(cx, cy, trouble));
      this.zones.push(
        this.add.rectangle(cx, cy, 250, 136, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.selectedIndex = i;
            this.highlightCard(i);
          })
      );
    });
  }

  private makeTroubleCard(cx: number, cy: number, trouble: Trouble): Phaser.GameObjects.Container {
    const bg = roundedRect(this, cx - 125, cy - 48, 250, 96, 16, THEME.paper, 1, THEME.warm, 0.3);
    const category = this.add
      .text(cx - 108, cy - 32, trouble.categoryLabel, { fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: css(THEME.muted), fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    // 卡片只展示摘要，完整心事会在后续详情阶段显示。
    // 以字符数先做一道上限，避免文本被容器无提示地裁掉。
    // 当前卡片正文宽度约可容纳 11 个汉字/行，控制在 32 字以内可稳定保持三行。
    const [title, ...rest] = trouble.text.split('\n');
    const summary = rest.join(' ').trim();
    const text = this.add
      .text(cx - 108, cy - 10, title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px', fontStyle: 'bold',
        color: css(THEME.text),
        wordWrap: { width: 216, useAdvancedWrap: true }
      })
      .setOrigin(0, 0);
    const count = this.add
      .text(cx - 108, cy + 22, summary ? `${summary.slice(0, 24)}${summary.length > 24 ? '…' : ''}` : (trouble.category === 'real' ? '来自知乎 · 今晚也能聊' : '今夜的心事 · 给自己一点时间'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: css(THEME.faint)
      })
      .setOrigin(0, 0.5);
    bg.disableInteractive();
    category.setWordWrapWidth(216, true);
    for (const [item, height] of [[category, 14], [text, 20], [count, 16]] as const) {
      let value = item.text;
      while (item.height > height && value.length > 0) {
        value = Array.from(value).slice(0, -1).join('');
        item.setText(`${value}…`);
      }
    }
    const group=this.add.container(cx,cy);
    for(const child of [bg,category,text,count]) { child.x-=cx; child.y-=cy; group.add(child); }
    return group;
  }

  private highlightCard(index: number): void {
    if (this.renderedPage !== Math.floor(index / 6)) this.renderCards();
    this.cards.forEach((card, i) => {
      const selected=i === index % 6; card.setScale(selected ? 1.025 : 1); card.setAlpha(selected ? 1 : 0.72);
    });
    this.hintText.setText(`第 ${Math.floor(index/6)+1} / ${Math.ceil(this.troubleList.length/6)} 组`);
  }

  private beginManifest(): void {
    if (!this.troubleList.length) {
      this.hintText.setText('正在读取知乎热门心事，请稍候');
      return;
    }
    this.phase = 'manifest';
    this.kanshan?.setRoam(ROAM_STAGE);
    this.children.list.filter(o=>o instanceof Phaser.GameObjects.Graphics && o.input?.enabled).forEach(o=>o.destroy());
    this.children.list.filter(o=>o instanceof Phaser.GameObjects.Text && o.y===556).forEach(o=>o.destroy());
    this.cards.forEach(c=>c.setVisible(false)); this.zones.forEach(z=>z.disableInteractive());
    const trouble = this.troubleList[this.selectedIndex];
    this.renderManifestCard(trouble.text);
    this.setStageHeading('把今晚这件心事，先放在一边。', '先放下它，给心里腾一点地方。');
    this.troubleCloud.setVisible(true);
    this.troubleCloud.setAlpha(0);
    this.tweens.add({ targets: this.troubleCloud, alpha: 1, duration: 500 });
    this.hintText.setText('不必用力，准备好了就好');
  }

  private makeTroubleCloud(): Phaser.GameObjects.Container {
    const container = this.add.container(480, 320).setDepth(10);
    if (this.textures.exists(CLOUD_TEXTURE)) {
      // The painting already carries its own damp halo, shadow, rain and knot.
      // 暗紫夜色里给它一层冷月色，免得那张偏亮的水彩在深底上刺眼。
      const art = this.add.image(0, CLOUD_Y, CLOUD_TEXTURE).setDisplaySize(CLOUD_SIZE, CLOUD_SIZE).setTint(0xc8d0ea);
      container.add(art);
      this.tweens.add({
        targets: art,
        y: { from: CLOUD_Y - 4, to: CLOUD_Y + 4 },
        duration: 2600,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1
      });
    } else {
      // Fallback so a missing asset degrades to the original vector cloud.
      const art = this.makeVectorCloudArt();
      container.add(art);
      this.tweens.add({ targets: art, y: { from: -4, to: 4 }, duration: 2200, ease:'Sine.easeInOut', yoyo: true, repeat: -1 });
    }

    return container;
  }

  private renderManifestCard(fullText: string): void {
    this.manifestCard?.destroy();
    const card = this.add.container(0, 0);
    const [heading, ...paragraphs] = fullText.trim().split(/\r?\n/);
    const makeText = (y: number, value: string, size: number, bold = false) => this.add.text(-228, y, value, {
      fontFamily: 'Microsoft YaHei, sans-serif', fontSize: `${size}px`,
      fontStyle: bold ? 'bold' : 'normal', color: css(bold ? THEME.text : THEME.muted),
      align: 'left', wordWrap: { width: 456, useAdvancedWrap: true }, lineSpacing: 5
    }).setOrigin(0);
    // Measure actual wrapped lines, preserving the source in the detail view.
    const clamp = (text: Phaser.GameObjects.Text, lines: number) => {
      const original = text.text;
      const chars = Array.from(original);
      while (text.getWrappedText().length > lines && chars.length) {
        chars.pop();
        text.setText(`${chars.join('').trimEnd()}…`);
      }
      if (text.text !== original) {
        let value = chars.join('').trimEnd();
        const cut = Math.max(value.lastIndexOf('，'), value.lastIndexOf('。'), value.lastIndexOf('？'), value.lastIndexOf('！'));
        if (cut >= 0) value = value.slice(0, cut + 1);
        else value = value.replace(/[一的了着和与在把将就也又还很更最]+$/u, '');
        text.setText(`${value}…`);
      }
    };
    const label = makeText(24, '此刻的心事', 12);
    label.setColor(css(THEME.muted));
    const title = makeText(label.y + label.height + 8, heading || '给自己一点时间', 18, true);
    clamp(title, 2);
    let bottom = title.y + title.height;
    const nodes: Phaser.GameObjects.GameObject[] = [label, title];
    const summary = paragraphs.join('\n').trim();
    if (summary) {
      const body = makeText(bottom + 9, summary, 14);
      body.setColor(css(THEME.muted));
      clamp(body, 2);
      nodes.push(body);
      bottom = body.y + body.height;
    }
    const detail = makeText(bottom + 8, '查看完整内容 →', 13).setColor(css(THEME.onAccent));
    detail.setPadding(12, 8, 12, 8);
    const detailButton = roundedRect(this, detail.x, detail.y, detail.width, detail.height, 8, THEME.green, 1);
    detailButton.setInteractive({ useHandCursor: true });
    detailButton.on('pointerover', () => detailButton.setAlpha(0.85));
    detailButton.on('pointerout', () => detailButton.setAlpha(1));
    detailButton.on('pointerdown', (_pointer: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.openManifestDetail(fullText);
    });
    const height = detail.y + detail.height + 24;
    const paper = roundedRect(this, -252, 0, 504, height, 16, THEME.paper, 1, THEME.line, 0.9).disableInteractive();
    card.add([paper, ...nodes, detailButton, detail]);
    // Bottom is at design y=552: a stable 40px gap before the footer rule.
    card.setY(232 - height);
    // Fit the entire artwork (including transparent edges and its dangling line)
    // between the heading and card, reserving a 24px gap even during the bob.
    const art = this.troubleCloud.list[0] as Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    this.tweens.killTweensOf(art);
    const artTop = -140;
    const available = card.y - 24 - 8 - artTop;
    const size = Math.max(1, Math.min(CLOUD_SIZE, available));
    if (art instanceof Phaser.GameObjects.Image) {
      art.setDisplaySize(size, size).setY(artTop + size / 2);
    } else {
      art.setScale(size / 380).setY(artTop + size / 2);
    }
    this.tweens.add({ targets: art, y: { from: art.y, to: art.y + 8 }, duration: 2600, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    this.troubleCloud.add(card);
    this.manifestCard = card;
  }

  private openManifestDetail(fullText: string): void {
    if (this.detailDialog?.open) return;
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'box-sizing:border-box;width:min(640px,90vw);max-height:80vh;padding:28px;border:1px solid #4a3f6b;border-radius:18px;background:#2b2144;color:#f2edfb;font:16px/1.9 Microsoft YaHei,sans-serif;';
    const heading = document.createElement('h2');
    heading.textContent = '此刻的心事 · 完整内容';
    heading.style.cssText = 'font-size:20px;margin:0 0 16px';
    const content = document.createElement('div');
    content.textContent = fullText;
    content.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow-y:auto';
    const close = document.createElement('button');
    close.textContent = '返回心事卡片';
    close.style.cssText = 'margin-top:20px;padding:10px 18px;border:0;border-radius:8px;background:#86d6b4;color:#1e1730;cursor:pointer;font:inherit';
    close.onclick = () => dialog.close();
    dialog.append(heading, content, close);
    document.body.append(dialog);
    this.detailDialog = dialog;
    const cleanup = () => { dialog.remove(); this.detailDialog = undefined; };
    dialog.addEventListener('close', cleanup, { once: true });
    this.events.once('shutdown', cleanup);
    dialog.showModal();
    close.focus();
  }

  /** Vector cloud kept as the offline fallback for the watercolour asset. */
  private makeVectorCloudArt(): Phaser.GameObjects.Graphics {
    const art = this.add.graphics();
    // Static vector layers: soft halo, floating shadow and a scalloped cloud silhouette.
    art.fillStyle(0xe7e9df, 0.45).fillCircle(0, -8, 141);
    art.lineStyle(1, 0xcbd3c5, 0.6).strokeCircle(0, -8, 153);
    art.fillStyle(0xd9dfd0, 0.45).fillEllipse(0, 102, 180, 15);
    const shape = (offset: number, color: number) => {
      art.fillStyle(color);
      art.fillRoundedRect(-125, -28 + offset, 250, 75, 35);
      art.fillCircle(-78, -26 + offset, 48);
      art.fillCircle(-17, -51 + offset, 62);
      art.fillCircle(51, -35 + offset, 51);
      art.fillCircle(99, -5 + offset, 36);
    };
    shape(7, 0x788f84);
    shape(0, 0x9aafa1);
    art.fillStyle(0xb4c4b5, 0.65).fillEllipse(-27, -70, 67, 23);
    art.lineStyle(2, 0xe5ecdf, 0.8).beginPath().arc(-17, -51, 47, 3.9, 5.15).strokePath();
    // A gentle expression gives the cloud a character without making it a monster.
    art.lineStyle(2.5, 0x435e53, 0.85);
    art.beginPath().arc(-29, 2, 8, 0.15, Math.PI - 0.15).strokePath();
    art.beginPath().arc(29, 2, 8, 0.15, Math.PI - 0.15).strokePath();
    art.lineBetween(-5, 23, 5, 23);
    art.fillStyle(0xd8baa4, 0.75).fillEllipse(-47, 18, 17, 7).fillEllipse(47, 18, 17, 7);
    art.lineStyle(1.5, 0xc9a76b, 0.8);
    for (const [x, y, r] of [[-163,-54,7],[157,29,8],[114,-112,5]]) {
      art.lineBetween(x-r,y,x+r,y).lineBetween(x,y-r,x,y+r);
    }
    art.lineStyle(1, 0xa6b8a6, 0.7).lineBetween(-63,65,-68,77).lineBetween(2,71,-3,83).lineBetween(63,62,58,74);
    return art;
  }

  private setStageHeading(title: string, subtitle: string): void {
    for (const object of this.children.list) {
      if (!(object instanceof Phaser.GameObjects.Text)) continue;
      if (object.y === 112) object.setText(title);
      if (object.y === 151) object.setText(subtitle);
    }
  }

  private doSlash(): void {
    if (this.detailDialog?.open) return;
    this.phase = 'slashing';
    const W = 960;
    const cloud = this.troubleCloud;
    const slash = this.add.graphics().setDepth(20);
    slash.lineStyle(6, 0xffffff, 0.95);
    slash.lineBetween(W / 2 - 200, 340 - 120, W / 2 + 200, 340 + 120);
    for (let i = 0; i < 24; i++) {
      const p = this.add.circle(W / 2, 340, 4, Phaser.Math.Between(0, 1) > 0.5 ? THEME.warm2 : 0xffffff, 0.9);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.tweens.add({
        targets: p,
        x: p.x + Math.cos(angle) * Phaser.Math.Between(60, 160),
        y: p.y + Math.sin(angle) * Phaser.Math.Between(60, 160),
        alpha: 0,
        scale: 0.2,
        duration: 500, onComplete:()=>p.destroy()
      });
    }
    this.tweens.add({ targets: slash, alpha: 0, duration: 200, onComplete:()=>slash.destroy() });
    this.tweens.add({ targets: cloud, scaleX: 1.5, scaleY: 0.4, alpha: 0, duration: 350, onComplete: () => void this.showSample() });
    this.cameras.main.shake(120, 0.004);
  }

  /** 展示三个声音：每一条都来自知乎真实内容；连不上时如实提示，不用本地文案顶替 */
  private async showSample(): Promise<void> {
    this.phase = 'loading';
    this.setStageHeading('心事先放好了。', '接下来，听听知乎上真实的人怎么说。');
    const run = this.run;
    this.troubleCloud.setVisible(false);
    this.hintText.setText('');
    const trouble = this.troubleList[this.selectedIndex];

    // 本地精选心事沿用它的结局走向；知乎热议卡没有本地剧情，退回「入睡困难」这一条占位。
    // 引擎里只留得下占位，玩家真正点中的是哪张卡要单独记下来。
    store.engine.selectTrouble(trouble.category === 'real' ? 'cantfall' : trouble.id);
    // 引擎里只留得下 career 占位，玩家真正点中的是哪张卡要单独记下来
    store.selectedTrouble = trouble;
    // 剧情改编的素材一律取自知乎原文（拿到 voices 后写入 realSampleText）
    store.realTroubleText = trouble.text;
    store.realSampleText = null;
    store.realVoices = null;
    store.storyCredit = null;
    store.selfNote = null;

    this.renderSampleLoading();
    this.kanshan?.react('investigate');
    const [voices] = await Promise.all([
      store.api.fetchVoices(trouble.text, trouble.keywords),
      new Promise<void>((resolve) => window.setTimeout(resolve, 4300))
    ]);
    if (run !== this.run) return;
    this.renderVoices(voices);
  }

  private renderSampleLoading(): void {
    this.loadingTimer?.remove();
    this.sampleGroup.removeAll(true);
    this.sampleGroup.setVisible(true);
    const panel = roundedRect(this, 185, 210, 590, 260, 20, THEME.paper, 1, THEME.warm, 0.25).disableInteractive();
    const title = this.add.text(480, 248, '看山正在帮你整理这份心事', { fontFamily: 'Microsoft YaHei', fontSize: '21px', color: css(THEME.text), fontStyle: 'bold' }).setOrigin(0.5);
    const steps = [
      '识别核心变量：暂停工作、现金流、身份周期……',
      '寻找相似经历：从知乎公开内容里匹配路径',
      '整理选择代价：看见每条路需要承担什么',
      '准备经验回声：把前人的一句话留给你'
    ];
    const rows = steps.map((step, i) => this.add.text(270, 292 + i * 38, `○  ${step}`, { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.faint) }));
    this.sampleGroup.add([panel, title, ...rows]);
    rows.forEach((row, i) => {
      this.time.delayedCall(i * 900, () => {
        row.setText(`●  ${steps[i]}`).setColor(css(THEME.green));
        this.kanshan?.react('investigate');
      });
    });
    this.loadingTimer = this.time.delayedCall(4300, () => this.loadingTimer = undefined);
  }

  private renderVoices(voices: ZhihuVoice[]): void {
    this.sampleGroup.removeAll(true);
    if (voices.length === 0) {
      this.renderVoicesUnavailable();
      return;
    }
    this.phase = 'sample';
    // 声音面板是 DOM 层，看山退到面板上方，免得被盖住
    this.kanshan?.setRoam(ROAM_PANEL);
    this.setStageHeading(
      '你不是一个人，听听他们怎么说。',
      `${voices.length} 个来自知乎的真实声音，陪你度过今晚。`
    );
    // 交给剧情改编的素材全部是知乎原文
    store.realSampleText = voices.map((v) => `《${v.title}》（${v.author}）：${v.body}`).join('\n\n').slice(0, 2400);
    // 剧情页与结局页要照着这三条真实内容署名，所以留一份在 store 里
    store.realVoices = voices;
    store.storyCredit = null;
    const panel = new CompanionPanel(this, voices, this.troubleList[this.selectedIndex].text, () => this.scene.start('StoryScene'));
    panel.onHug = (voice, first) => this.onVoiceHugged(voice, first);
    this.companionPanel = panel;
    this.sampleGroup.add(panel.group).setVisible(true);
    this.hintText.setText('挑一段经历，慢慢读下去');
  }

  /** 拥抱是游戏内的真实互动：记进结局指标，并把这条内容的知乎地址交给玩家 */
  private onVoiceHugged(voice: ZhihuVoice, first: boolean): void {
    const total = this.companionPanel?.huggedCount ?? 0;
    if (!first) {
      this.hintText.setText(`你已经拥抱过 ${voice.author} 了 · 一共拥抱了 ${total} 个声音`);
      return;
    }
    store.engine.hug(voice.workId);
    this.hintText.setText(`你拥抱了 ${voice.author} · 接纳 +2 陪伴 +2 · 这份温柔已经留下来了`);
  }

  /** 知乎内容取不回来时的如实状态：不展示替代文案，也不放行进入故事 */
  private renderVoicesUnavailable(): void {
    this.phase = 'offline';
    store.realVoices = null;
    this.kanshan?.setRoam(ROAM_PANEL);
    this.sampleGroup.setVisible(true);
    const card = roundedRect(this, 220, 232, 520, 250, 22, THEME.paper, 1, THEME.line, 0.8).disableInteractive();
    const title = this.add
      .text(480, 286, '暂时连不上知乎内容', { fontFamily: 'Microsoft YaHei', fontSize: '22px', fontStyle: 'bold', color: css(THEME.text) })
      .setOrigin(0.5);
    const desc = this.add
      .text(
        480,
        336,
        '这一页只展示知乎上的真实内容，取不回来时不会用别的内容顶替。\n请确认服务端（端口 3000）与网络可用，然后重新加载。',
        { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.muted), align: 'center', lineSpacing: 8 }
      )
      .setOrigin(0.5);
    this.sampleGroup.add([card, title, desc]);
    this.hintText.setText('E 重新加载知乎内容 · 知乎内容不可用时，本页不展示替代文案');
  }
  private onAction(action: GameAction): void {
    if (this.detailDialog?.open) return;
    // 看山对每一个动作都有回应：挥手被回应、拥抱被接住、蹲下有人陪
    this.kanshan?.react(action);
    if (this.phase === 'choose') {
      if (action === 'slash' || action === 'investigate') {
        this.beginManifest();
      }
    } else if (this.phase === 'manifest') {
      if (action === 'slash') {
        this.doSlash();
      }
    } else if (this.phase === 'sample') {
      if (action === 'hug') {
        this.companionPanel?.hug();
      } else if (action === 'investigate' || action === 'slash') {
        this.scene.start('StoryScene');
      }
    } else if (this.phase === 'offline') {
      // 知乎内容没取回来时不进入故事，等玩家点「重新加载知乎内容」
      if (action === 'investigate') void this.showSample();
    }
  }

  /** 导演模式：现场演示快捷键 */
  private setupDirectorMode(): void {
    const kb = this.input.keyboard!;
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.F1).on('down', () => {
      if (this.phase === 'choose') this.beginManifest();
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.F3).on('down', () => {
      if (this.phase === 'choose') {
        this.selectedIndex = (this.selectedIndex + 1) % this.troubleList.length;
        this.highlightCard(this.selectedIndex);
      }
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.F4).on('down', () => {
      if (this.phase === 'choose') this.beginManifest();
      else if (this.phase === 'manifest') this.doSlash();
    });
  }
}

function knowledgeToTrouble(it: ZhihuKnowledgeItem, i: number): Trouble {
  const label = it.labels.find((value) => value.trim()) ?? '大家都在问';
  return {
    id: `real-${i}`,
    category: 'real',
    categoryLabel: `知乎热议 · ${label}`,
    text: it.description?.trim() ? `${it.title}\n${it.description.trim()}` : it.title,
    similarCount: 0,
    keywords: [it.title, ...it.labels].filter(Boolean).slice(0, 8),
    sampleId: '',
    storyId: ''
  };
}

/**
 * 知乎那份知识列表是通用热门内容（职场、学习、人际……），一条关于失眠的都没有。
 * 「看山问你，睡了吗？」里它们不该排在最前面，但也不该被藏起来——它们是真实的知乎内容。
 * 所以按「和今晚睡不着有多近」重排：压力、情绪、倦怠、注意力、关系这些排在前面，
 * 其余保持接口原本的顺序跟在后面。只动顺序，不改标题、不改来源。
 */
const SLEEP_WORDS = [
  '失眠', '睡眠', '睡不着', '入睡', '熬', '晚睡', '作息', '早醒', '多梦', '睡',
  '压力', '焦虑', '紧张', '内耗', '情绪', '心情', '放松', '休息', '疲劳', '疲惫', '倦怠', '累',
  '运动', '锻炼', '跑步', '健身', '散步', '久坐', '冥想', '呼吸', '注意力', '专注',
  '人际', '关系', '家庭', '孤独', '心事', '烦'
];

function sleepScore(it: ZhihuKnowledgeItem): number {
  const hay = `${it.title} ${it.description ?? ''} ${it.labels.join(' ')}`;
  return SLEEP_WORDS.reduce((score, word) => score + (hay.includes(word) ? 1 : 0), 0);
}

function rankRealTroubles(items: ZhihuKnowledgeItem[]): ZhihuKnowledgeItem[] {
  return items
    .filter((it) => it.title.trim())
    // Array.prototype.sort 是稳定排序：得分一样时保持接口原本的顺序
    .sort((a, b) => sleepScore(b) - sleepScore(a));
}
