import { SharpScene } from '../ui/SharpScene';
import Phaser from 'phaser';
import { store } from '../store';
import { button, THEME, css, roundedRect } from '../ui/theme';
import { KanshanCompanion } from '../companion/KanshanCompanion';
import { KanshanAnimKey } from '../companion/kanshanAssets';
import { ParticleWordmark } from '../ui/ParticleWordmark';

/** 首屏只用得到这四段：待机 / 打招呼 / 晃悠 / 瞌睡。「电脑」「运球」是剧情里的反应动作，不进首屏加载。 */
const MENU_ANIMS: KanshanAnimKey[] = ['idle', 'greet', 'wander', 'sleepy'];
/** 看山在首屏的落点与活动范围（设计空间 960×640）：站在右半区，只在原地小幅晃悠，不越到左栏文字上。 */
const KANSHAN_X = 718;
const KANSHAN_Y = 300;
const KANSHAN_ROAM = new Phaser.Geom.Rectangle(690, 288, 56, 26);
/** 首屏角色维持原插图的尺寸（帧高 316.8），比剧情场景里的 144 大一倍多。 */
const KANSHAN_FRAME_HEIGHT = 316.8;
/** 久坐不动它会睡着，隔一阵轻轻叫醒一次，让首屏一直有呼吸感。 */
const WAKE_EVERY_MS = 34000;
/**
 * 气泡的框（设计空间）：右边缘停在 612，给看山的鼻尖（最左 x≈629）留出缝隙；
 * 竖直中心 282 正对它的鼻尖高度，让它看起来是在对着左边的人说话。
 */
const BUBBLE = { x: 426, y: 255, w: 186, h: 54, tail: 10 };
/** 气泡里的话只跟「它陪着你」有关，与左边文案呼应，不承载任何流程信息。 */
const BUBBLE_LINES = ['不急，夜还长。', '我先陪你躺一会儿。', '睡不着也没关系。'];
/**
 * 首屏背景粒子字标的目标字。以后真做了字标图片，把它换成
 * `{ glyph:'', textureUrl:'/assets/xxx-wordmark.png' }` 即可走图片采样（透明底 PNG，只认 alpha），
 * ParticleWordmark 里的逻辑一行都不用改。
 */
const WORDMARK_GLYPH = '看山';
/**
 * 字标落点：右下这一片是首屏唯一空着的区域（左栏文字到 x≈460 收，看山的脚在 y≈459 收）。
 * 被看山挡住一部分是可以接受的，所以尺寸按「上沿压在气泡（下沿 309）之下、
 * 下沿不贴画布底（640）、左边尽量不压正文段落」取满。
 *
 * maxParticles 必须给足：字标放大后采样点变多，stride 会把粒子稀释掉，
 * 密度一低笔画就散成一个个点（3200 是在 367×182 那个尺寸下调的）。
 */
const WORDMARK_LAYOUT = { glyph: WORDMARK_GLYPH, x: 626, y: 226, maxWidth: 470, maxHeight: 246, alphaScale: 0.62, maxParticles: 3600 };

export class MenuScene extends SharpScene {
  private nightParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private manual: HTMLDialogElement | null = null;
  private kanshan: KanshanCompanion | null = null;
  private wordmark: ParticleWordmark | null = null;
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleTimer: Phaser.Time.TimerEvent | null = null;
  private wakeTimer: Phaser.Time.TimerEvent | null = null;
  private bubbleIndex = 0;
  /** 知乎登录是否已配置（三个 ZHIHU_OAUTH_* 齐全）。默认按「没配」处理，见 loadAuthStatus */
  private authConfigured = false;
  /** 已登录的知乎昵称；null 表示没登录 */
  private authName: string | null = null;
  private loginEntry: Phaser.GameObjects.Text | null = null;
  private playHint: Phaser.GameObjects.Text | null = null;
  constructor() { super('MenuScene'); }
  preload(): void {
    KanshanCompanion.preload(this, MENU_ANIMS);
  }
  create(): void {
    // Phaser 会复用同一个 Scene 实例，这些字段每次 create 都要重置。
    this.kanshan = null;
    this.bubble = null;
    this.bubbleTimer = null;
    this.wakeTimer = null;
    this.bubbleIndex = 0;
    this.wordmark = null;
    this.authConfigured = false;
    this.authName = null;
    this.loginEntry = null;
    this.playHint = null;
    // 首页使用同一条 60px 内容边界，只有页头需要分隔线。
    this.add.rectangle(480,320,960,640,THEME.bg);
    // 粒子字标就建在这里：Phaser 里同 depth 按插入顺序绘制，晚于文字建就会盖住标题和左栏文案。
    this.wordmark = new ParticleWordmark(this, WORDMARK_LAYOUT);
    this.createNightParticles();
    this.add.graphics().lineStyle(1,THEME.line,0.95).lineBetween(60,80,900,80);
    this.add.text(60,32,'看山问你，睡了吗？',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'20px',fontStyle:'bold',color:css(THEME.text)});
    this.add.text(900,36,'操作手册',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'14px',color:css(THEME.muted)}).setOrigin(1,0).setPadding(0,4).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.openManual());
    this.add.graphics().lineStyle(1,THEME.line,1).lineBetween(844,62,900,62);
    this.add.text(60,144,'给今晚留一盏小灯',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'14px',color:css(THEME.muted)}).setLetterSpacing(1);
    this.add.text(60,184,'看山问你，\n睡了吗？',{fontFamily:'SimSun, serif',fontSize:'42px',fontStyle:'normal',color:css(THEME.text),lineSpacing:14}).setLetterSpacing(0);
    this.add.text(60,320,'不用急着解决所有事情。\n把一件压在心里的事交给今晚，先陪它待一会儿。',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'18px',color:css(THEME.muted),lineSpacing:8}).setLetterSpacing(0);
    button(this,60,400,246,'让看山陪我睡一会儿',()=>this.startGame());
    // 这两行随 /api/auth/status 的结果改写。未配置知乎登录时不该摆一个点了必然 503 的入口，
    // 所以登录入口先建成隐藏的，等状态回来再决定显不显示。
    this.playHint = this.add.text(60,466,'不登录也能完整体验 · 约 3 分钟',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'13px',color:css(THEME.faint)}).setLetterSpacing(0);
    this.loginEntry = this.add.text(60,500,'登录知乎，进入今晚的陪伴',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'14px',color:css(THEME.blue)})
      .setPadding(0,4).setVisible(false)
      .setInteractive({useHandCursor:true})
      // 已登录后再点它不该重复跳授权页；判断放在回调里，避免靠 disableInteractive 反复重算命中区
      .on('pointerdown',()=>{ if(this.authConfigured&&!this.authName) this.login(); });
    const savedCount = store.journals.length + store.engine.state.savedSamples.length;
    // 底部这一组原来挤在 y 500~541 这 41px 里：y=500 的「登录知乎」的框（500~525）压着 y=514 的
    // 「我的故事集」（514~541），而「安静房间」x=260 又压进说明文字 x154~274。可点文本带
    // setPadding(0,4)，框重叠＝命中区重叠——点「我的故事集」有一半落在「登录知乎」上。
    // 现在排成两行：登录一行；两个入口 + 说明一行，三者的框左右互不接触。
    this.add.text(60,536,'我的故事集',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'15px',color:css(THEME.text)}).setPadding(0,4).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.scene.start('SampleScene'));
    // 安静房间让开说明文字（x154~274），从 260 挪到 300
    this.add.text(300,536,'安静房间',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'15px',color:css(THEME.green)}).setPadding(0,4).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.scene.start('QuietRoomScene'));
    // 下划线跟着「我的故事集」下移，仍然停在它文字框的底边
    this.add.graphics().lineStyle(1,THEME.line,1).lineBetween(60,561,135,561);
    // 说明和两个入口同一行：15px 文字的行心约 y550，12px 取 y542 才能对齐行心
    this.add.text(154,542,savedCount ? `已收录 ${savedCount} 段记录` : '留住走过的故事与结局',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'12px',color:css(THEME.faint)}).setLetterSpacing(0);
    // 首屏原来放的是素材里静止的第 12 帧；现在交给陪伴角色：呼吸循环、偶尔晃两步、久坐会打瞌睡，
    // 一进页面先挥手，脚下自带影子，脸朝左半区的文案（faceLeft）。
    KanshanCompanion.register(this, MENU_ANIMS);
    this.kanshan = new KanshanCompanion(this,{
      x: KANSHAN_X,
      y: KANSHAN_Y,
      roam: KANSHAN_ROAM,
      depth: 12,
      displayHeight: KANSHAN_FRAME_HEIGHT,
      faceLeft: true
    });
    this.buildBubble(BUBBLE_LINES[0]);
    // 挥手之后再说话：首屏右半区原本什么都没有，这两步是让它和左边文案发生关系。
    this.time.delayedCall(2400,()=>this.showBubble(BUBBLE_LINES[this.bubbleIndex]));
    this.attachKanshanPointer();
    this.wakeTimer = this.time.addEvent({delay:WAKE_EVERY_MS,loop:true,callback:()=>this.kanshan?.greet()});
    this.input.keyboard!.addKey('F1').on('down',()=>this.openManual());
    this.input.keyboard!.addKey('ENTER').on('down',()=>{if(!this.manual)this.startGame();});
    this.events.once('shutdown',()=>{
      this.manual?.remove();this.manual=null;
      this.bubbleTimer?.remove();this.bubbleTimer=null;
      this.wakeTimer?.remove();this.wakeTimer=null;
      this.bubble=null;
      this.kanshan?.destroy();this.kanshan=null;
      this.wordmark?.destroy();this.wordmark=null;
    });
    this.events.once('shutdown',()=>this.input.keyboard!.removeAllKeys(true));
    // 首屏的登录入口与主按钮行为都取决于它，异步拉一次；拉不到就按「未配置」处理。
    void this.loadAuthStatus();
  }
  private async login(): Promise<void> { window.location.href = '/api/auth/zhihu/login'; }
  /**
   * 拉一次知乎登录状态，决定首屏摆不摆登录入口、主按钮要不要先跳授权页。
   * 拉不到（服务端没起 / 超时）就保持「未配置」——首屏永远不该因为一次请求失败变成死路。
   */
  private async loadAuthStatus(): Promise<void> {
    const status = await store.api.fetchAuthStatus();
    // 玩家可能已经点进下一幕了，那时这些文字对象已经销毁，不能再动。
    if (!this.sys.isActive()) return;
    this.authConfigured = Boolean(status?.configured);
    this.authName = status?.loggedIn ? status.profile?.name ?? '知乎用户' : null;
    this.applyAuthStatus();
  }
  /** 把状态如实反映到首屏：登录入口 + 主按钮下方的那行说明 */
  private applyAuthStatus(): void {
    const entry = this.loginEntry;
    if (entry) {
      if (this.authName) {
        // 已登录：不再提供登录入口，如实显示是谁
        entry.setText(`已登录 · ${this.authName}`).setColor(css(THEME.muted)).setVisible(true);
        if (entry.input) entry.input.cursor = 'default';
      } else if (this.authConfigured) {
        entry.setText('登录知乎，进入今晚的陪伴').setColor(css(THEME.blue)).setVisible(true);
        if (entry.input) entry.input.cursor = 'pointer';
      } else {
        // 未配置：/api/auth/zhihu/login 必然返回 503，别摆这个入口
        entry.setVisible(false);
      }
    }
    this.playHint?.setText(this.authConfigured && !this.authName ? '登录知乎后开始 · 约 3 分钟' : '不登录也能完整体验 · 约 3 分钟');
  }
  /** 低对比度、慢速的月尘背景：只做呼吸氛围，不抢文字和看山的注意力。 */
  private createNightParticles(): void {
    const textureKey = '__sleep-particle';
    if (!this.textures.exists(textureKey)) {
      const g = this.make.graphics({x:0,y:0}, false);
      g.fillStyle(0xd9d4ff, 0.9); g.fillCircle(3, 3, 3); g.generateTexture(textureKey, 6, 6); g.destroy();
    }
    this.nightParticles = this.add.particles(0, 0, textureKey, {
      x: { min: 70, max: 900 }, y: { min: 95, max: 625 },
      lifespan: { min: 9000, max: 15000 }, speedY: { min: -5, max: -16 },
      speedX: { min: -4, max: 4 }, scale: { start: 0.35, end: 0.08 },
      alpha: { start: 0.28, end: 0 }, quantity: 1, frequency: 420,
      blendMode: Phaser.BlendModes.SCREEN
    }).setDepth(0);
  }
  update(time: number): void {
    this.kanshan?.update(time);
    this.wordmark?.update(time);
  }
  /** 气泡：纸白小卡片 + 指向看山的小尖角，出现与收起都有淡入淡出，不抢主文案。 */
  private buildBubble(line: string): void {
    const bubble = this.add.container(BUBBLE.x,BUBBLE.y).setDepth(13).setAlpha(0).setVisible(false).setName('kanshan-bubble');
    bubble.add(roundedRect(this,0,0,BUBBLE.w,BUBBLE.h,12,THEME.paper,1,THEME.line,1));
    // 尖角：先描两条斜边，再用卡面色把气泡那一小段竖边盖掉，否则接缝会留一道线。
    const tail = this.add.graphics();
    tail.lineStyle(1,THEME.line,1);
    tail.beginPath();
    tail.moveTo(0,2);
    tail.lineTo(BUBBLE.tail - 1,BUBBLE.tail / 2);
    tail.lineTo(0,BUBBLE.tail - 2);
    tail.strokePath();
    tail.fillStyle(THEME.paper,1);
    tail.fillTriangle(0,3,BUBBLE.tail - 1,BUBBLE.tail / 2,0,BUBBLE.tail - 3);
    tail.setPosition(BUBBLE.w - 1,BUBBLE.h / 2 - BUBBLE.tail / 2);
    bubble.add(tail);
    bubble.add(this.add.text(BUBBLE.w / 2,BUBBLE.h / 2,line,{
      fontFamily:'Microsoft YaHei, sans-serif',
      fontSize:'14px',
      color:css(THEME.text)
    }).setOrigin(0.5).setName('bubble-text'));
    this.bubble = bubble;
  }
  /** 让看山说话：换一句文案、淡入，停一会儿再自己收起来。 */
  private showBubble(line: string, holdMs = 5200): void {
    const bubble = this.bubble;
    if (!bubble) return;
    const text = bubble.getByName('bubble-text') as Phaser.GameObjects.Text | null;
    text?.setText(line);
    this.bubbleTimer?.remove();
    this.bubbleTimer = null;
    this.tweens.killTweensOf(bubble);
    bubble.setVisible(true).setAlpha(0).setScale(0.96);
    this.tweens.add({targets:bubble,alpha:1,scale:1,duration:380,ease:'Sine.easeOut'});
    this.bubbleTimer = this.time.delayedCall(holdMs,()=>{
      this.bubbleTimer = null;
      this.tweens.add({targets:bubble,alpha:0,duration:520,ease:'Sine.easeIn',onComplete:()=>bubble.setVisible(false)});
    });
  }
  /** 鼠标划过或点一下：它挥手回应；点一下再换一句话说。 */
  private attachKanshanPointer(): void {
    let lastGreetAt = 0;
    const greet = (line: string | null) => {
      if (line === null && this.time.now - lastGreetAt < 1500) return;
      lastGreetAt = this.time.now;
      this.kanshan?.greet();
      if (line) this.showBubble(line);
    };
    this.add.zone(KANSHAN_X,KANSHAN_Y - 30,220,320)
      .setInteractive({useHandCursor:true})
      .setDepth(14)
      .on('pointerover',()=>greet(null))
      .on('pointerdown',()=>{
        this.bubbleIndex = (this.bubbleIndex + 1) % BUBBLE_LINES.length;
        greet(BUBBLE_LINES[this.bubbleIndex]);
      });
  }
  private openManual(): void {
    if(this.manual)return;
    const dialog=document.createElement('dialog');this.manual=dialog;
    dialog.setAttribute('aria-label','操作手册');
    dialog.style.cssText="box-sizing:border-box;width:min(580px,92vw);max-height:85vh;overflow:auto;padding:24px;border:1px solid #4a3f6b;border-radius:8px;background:#2b2144;color:#f2edfb;font:14px/1.6 'Microsoft YaHei',sans-serif";
    const heading=document.createElement('h2');heading.textContent='操作手册';heading.style.cssText='margin:0 0 16px;font-size:22px';dialog.append(heading);
    const rows=[['开始今晚','Enter'],['切换心事 / 人物','A / D'],['选一条路','← / → 或点选项'],['确认这条路','Enter'],['挥剑','右手挥砍 · 鼠标左键 / J'],['拥抱回应','左手抬起 · M / H'],['听见回应','右手抬起 · X / N'],['歇一会','下压 F / 跳跃 空格'],['阅读 / 调查','踢 · E'],['人物页圈子草稿','F']];
    for(const [name,key] of rows){
      const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:space-between;padding:10px 0;border-bottom:1px solid #3a3057';
      const label=document.createElement('span');label.textContent=name;
      const value=document.createElement('span');value.textContent=key;value.style.cssText='color:#e5b567;white-space:nowrap';row.append(label,value);dialog.append(row);
    }
    const close=document.createElement('button');close.textContent='关闭';close.style.cssText='margin-top:20px;padding:10px 24px;border:0;border-radius:6px;background:#86d6b4;color:#1e1730;font:inherit;cursor:pointer';close.onclick=()=>dialog.close();dialog.append(close);
    dialog.addEventListener('close',()=>{
      dialog.remove();this.manual=null;
      this.input.keyboard!.resetKeys();
      this.game.canvas.tabIndex = 0;
      this.game.canvas.focus();
    });document.body.append(dialog);dialog.showModal();close.focus();
  }
  private startGame(): void {
    // 只有「配了知乎登录、且还没登录」才先跳授权页；其余情况直接进剧情。
    // 首屏文案写着「不登录也能完整体验」，DEPLOY.md 也是同一口径
    //（「单机可玩完的体感叙事，不需要登录就能走完核心流程」）。
    // 这里原来是无条件 login() 加一个 return，于是 OAuth 未配置时主按钮和 Enter 全撞 503，
    // 整个 demo 一步都进不去——return 之后那段本来就是为「不登录也能玩」写的。
    if (this.authConfigured && !this.authName) {
      this.login();
      return;
    }
    store.engine.reset(); store.realTroubleText=null; store.realSampleText=null; store.aiStory=null;
    store.realVoices=null; store.storyCredit=null; store.selfNote=null; store.storyTitle=null;
    store.selectedTrouble=null;
    this.scene.start('TroubleScene');
  }
}
