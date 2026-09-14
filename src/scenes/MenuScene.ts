import { SharpScene } from '../ui/SharpScene';
import Phaser from 'phaser';
import { store } from '../store';
import { button, THEME, css, roundedRect } from '../ui/theme';
import { KanshanCompanion } from '../companion/KanshanCompanion';
import { KanshanAnimKey } from '../companion/kanshanAssets';

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

export class MenuScene extends SharpScene {
  private manual: HTMLDialogElement | null = null;
  private kanshan: KanshanCompanion | null = null;
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleTimer: Phaser.Time.TimerEvent | null = null;
  private wakeTimer: Phaser.Time.TimerEvent | null = null;
  private bubbleIndex = 0;
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
    // 首页使用同一条 60px 内容边界，只有页头需要分隔线。
    this.add.rectangle(480,320,960,640,THEME.bg);
    this.add.graphics().lineStyle(1,THEME.line,0.95).lineBetween(60,80,900,80);
    this.add.text(60,32,'看山问你，睡了吗？',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'20px',fontStyle:'bold',color:css(THEME.text)});
    this.add.text(900,36,'操作手册',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'14px',color:css(THEME.muted)}).setOrigin(1,0).setPadding(0,4).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.openManual());
    this.add.graphics().lineStyle(1,THEME.line,1).lineBetween(844,62,900,62);
    this.add.text(60,144,'睡不着的时候，先松开一点压力',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'14px',color:css(THEME.muted)}).setLetterSpacing(0);
    this.add.text(60,184,'先松开，\n再动一动',{fontFamily:'SimSun, serif',fontSize:'42px',fontStyle:'normal',color:css(THEME.text),lineSpacing:14}).setLetterSpacing(0);
    this.add.text(60,320,'挑一件今晚压着你的事，走进一个故事。\n先缓解压力，再做一点运动——身体松了，睡意才来。',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'18px',color:css(THEME.muted),lineSpacing:8}).setLetterSpacing(0);
    button(this,60,400,216,'今晚，先安顿自己',()=>this.startGame());
    this.add.text(60,466,'约 3 分钟 · 支持键鼠与体感设备',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'13px',color:css(THEME.faint)}).setLetterSpacing(0);
    const savedCount = store.journals.length + store.engine.state.savedSamples.length;
    this.add.text(60,514,'我的故事集',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'15px',color:css(THEME.text)}).setPadding(0,4).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.scene.start('SampleScene'));
    this.add.graphics().lineStyle(1,THEME.line,1).lineBetween(60,539,135,539);
    this.add.text(154,518,savedCount ? `已收录 ${savedCount} 段记录` : '留住走过的故事与结局',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'12px',color:css(THEME.faint)}).setLetterSpacing(0);
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
    });
    this.events.once('shutdown',()=>this.input.keyboard!.removeAllKeys(true));
  }
  update(time: number): void {
    this.kanshan?.update(time);
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
    store.engine.reset(); store.realTroubleText=null; store.realSampleText=null; store.aiStory=null;
    store.realVoices=null; store.storyCredit=null; store.selfNote=null; store.storyTitle=null;
    store.selectedTrouble=null;
    this.scene.start('TroubleScene');
  }
}
