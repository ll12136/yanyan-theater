import Phaser from 'phaser';
import { ZhihuVoice } from '../ai/apiClient';
import './companions.css';

export function officialSource(voice: ZhihuVoice): string | null {
  try {
    const u = new URL(voice.sourceUrl);
    if(u.protocol !== 'https:' || !['www.zhihu.com','zhuanlan.zhihu.com'].includes(u.hostname)) return null;
    if(u.pathname==='/' || u.pathname.startsWith('/story/')) return null;
    return u.href;
  } catch { return null; }
}

/** Native reading UI: real anchors, selectable text, accessible buttons. */
export class CompanionPanel {
  readonly group: Phaser.GameObjects.Container;
  activeIndex=0;
  onHug?: (voice: ZhihuVoice, first: boolean)=>void;
  private hugged=new Set<number>();
  private root=document.createElement('section');
  private people=document.createElement('nav');
  private reading=document.createElement('article');
  private timer: Phaser.Time.TimerEvent;
  private dialog: HTMLDialogElement|null=null;
  private inlineReader: HTMLElement|null = null;
  private paused=false;
  private toggle=document.createElement('button');
  private resize:()=>void;
  private keyHandler:(event: KeyboardEvent)=>void;

  constructor(private scene:Phaser.Scene,private voices:ZhihuVoice[],private trouble:string,enter:()=>void) {
    this.group=scene.add.container(0,0);
    this.root.className='companions';this.root.setAttribute('aria-label','来自知乎的声音');
    const layout=document.createElement('div');layout.className='comp-layout';
    this.people.className='comp-people';this.people.setAttribute('aria-label','选择讲述者');
    const eyebrow=document.createElement('div');eyebrow.className='comp-eyebrow';eyebrow.textContent='不同的经历 · 同一份陪伴';this.people.append(eyebrow);
    const help=document.createElement('p');help.className='comp-help';help.textContent='点击左侧头像切换讲述者；按 A / D 切换，J 走进故事，E 阅读原文。';this.people.append(help);
    voices.forEach((v,i)=>{
      const b=document.createElement('button');b.className='comp-person';b.dataset.index=String(i);
      const avatar=document.createElement('span');avatar.className=`comp-avatar tone-${i%3}`;
      avatar.textContent=v.author.slice(0,1)||'知';
      const clip=['kanshan-greet','kanshan-idle','kanshan-desk'][i%3];
      avatar.textContent='';avatar.style.backgroundImage=`url(assets/avatars/${clip}.png)`;
      avatar.style.backgroundSize='1008px 42px';avatar.style.backgroundRepeat='no-repeat';
      const words=document.createElement('span');const name=document.createElement('strong');name.textContent=v.author;
      const role=document.createElement('small');role.textContent=v.role;words.append(name,role);
      b.append(avatar,words);b.tabIndex=-1;this.people.append(b);
    });
    this.toggle.className='comp-rotation';this.toggle.tabIndex=-1;this.people.append(this.toggle);
    this.reading.className='comp-reading';layout.append(this.people,this.reading);
    this.root.append(layout);document.body.append(this.root);
    this.resize=()=>{const r=scene.game.canvas.getBoundingClientRect();const s=r.width/960;
      this.root.style.left=`${r.left+65*s}px`;this.root.style.top=`${r.top+176*s}px`;
      this.root.style.transform=`scale(${s})`;
    };
    this.resize();scene.scale.on('resize',this.resize);window.addEventListener('resize',this.resize);
    this.timer=scene.time.addEvent({delay:9000,loop:true,callback:()=>{if(!this.paused&&!this.dialog)this.select((this.activeIndex+1)%voices.length);}});
    this.enter=enter;this.setPaused(false);this.select(0);
    this.keyHandler=(event)=>this.onKey(event);
    window.addEventListener('keydown',this.keyHandler);
    const cleanup=()=>{this.timer.remove();this.root.remove();this.dialog?.remove();scene.scale.off('resize',this.resize);window.removeEventListener('resize',this.resize);window.removeEventListener('keydown',this.keyHandler);};
    scene.events.once('shutdown',cleanup);
  }
  private enter:()=>void;
  get activeVoice():ZhihuVoice|undefined{return this.voices[this.activeIndex];}
  get huggedCount():number{return this.hugged.size;}
  private button(label:string,action:()=>void):HTMLButtonElement {const b=document.createElement('button');b.textContent=label;b.onclick=action;return b;}
  private onKey(event: KeyboardEvent): void {
    if (this.dialog) { if (event.key === 'Escape') this.dialog.close(); return; }
    const key = event.key.toUpperCase();
    if (key === 'A') { event.preventDefault(); this.setPaused(true); this.select((this.activeIndex - 1 + this.voices.length) % this.voices.length); }
    else if (key === 'D' || key === 'N') { event.preventDefault(); this.setPaused(true); this.select((this.activeIndex + 1) % this.voices.length); }
    else if (key === 'E') { event.preventDefault(); this.openReader(); }
    else if (key === 'H') { event.preventDefault(); this.hug(); }
    else if (key === 'J') { event.preventDefault(); this.enter(); }
    else if (key === 'F') { event.preventDefault(); this.openDraft(); }
  }
  private setPaused(value:boolean):void {this.paused=value;this.toggle.textContent=value?'▶  继续轮播':'Ⅱ  暂停轮播 · 9 秒 / 位';}
  hug():boolean {
    const v=this.activeVoice;if(!v)return false;
    const first=!this.hugged.has(this.activeIndex);this.hugged.add(this.activeIndex);this.setPaused(true);
    this.select(this.activeIndex);this.onHug?.(v,first);return first;
  }
  select(index:number):void {
    const v=this.voices[index];if(!v)return;this.activeIndex=index;
    this.people.querySelectorAll<HTMLButtonElement>('.comp-person').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index)));
    this.reading.replaceChildren();
    const top=document.createElement('div');top.className='comp-eyebrow';top.textContent=`正在听 ${index+1} / ${this.voices.length}    ·    ${v.kind==='story'?'故事片段':'内容摘录'}`;
    const title=document.createElement('h2');title.textContent=v.title;
    const quote=document.createElement('blockquote');quote.textContent=v.excerpt;
    const by=document.createElement('p');by.className='comp-byline';by.textContent=`${v.author} · ${v.sourceLabel}${v.voteCount>0?` · ${v.voteCount} 赞同`:''}`;
    const actions=document.createElement('div');actions.className='comp-actions';
    const url=officialSource(v);
    if(url){const link=document.createElement('a');link.className='comp-secondary';link.textContent='在知乎阅读正文 ↗';link.href=url;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);} else { const read=this.button('阅读正文',()=>this.openReader());read.className='comp-secondary';actions.append(read); }
    const enter=this.button('走进故事 →',()=>this.enter());enter.className='comp-primary';actions.append(enter);
    this.reading.append(top,title,quote,by,actions);
  }
  private modal(title:string):HTMLDialogElement {
    this.setPaused(true);this.scene.input.enabled=false;this.scene.input.keyboard!.enabled=false;
    const d=document.createElement('dialog');d.className='comp-modal';this.dialog=d;
    const h=document.createElement('h2');h.textContent=title;d.append(h);
    const close=this.button('关闭 ×',()=>d.close());close.className='comp-close';d.append(close);
    d.addEventListener('close',()=>{d.remove();this.dialog=null;this.scene.input.enabled=true;this.scene.input.keyboard!.enabled=true;});
    document.body.append(d);return d;
  }
  private openReader():void {
    const v=this.activeVoice;if(!v)return;
    if(this.inlineReader){this.inlineReader.remove();this.inlineReader=null;return;}
    const reader=document.createElement('section');reader.className='comp-inline-reader';
    const head=document.createElement('div');head.className='comp-reader-head';
    const label=document.createElement('strong');label.textContent='正文阅读';
    const close=this.button('收起',()=>{reader.remove();this.inlineReader=null});close.className='comp-reader-close';head.append(label,close);
    const by=document.createElement('p');by.className='comp-byline';by.textContent=`${v.author} · ${v.sourceLabel}`;
    const body=document.createElement('div');body.className='comp-fulltext';body.textContent=v.body||v.excerpt;
    reader.append(head,by,body);
    const source=officialSource(v);if(source){const link=document.createElement('a');link.className='comp-source-link';link.textContent='查看知乎原文 ↗';link.href=source;link.target='_blank';link.rel='noopener noreferrer';reader.append(link);}
    this.reading.append(reader);this.inlineReader=reader;
  }
  private openDraft():void {
    if(this.dialog)return;const d=this.modal('写给「看山问你，睡了吗？」');
    const input=document.createElement('textarea');input.setAttribute('aria-label','分享文案');
    input.value=`最近让我睡不着的，是：${this.trouble}\n\n如果你也经历过这样的夜晚，愿意聊聊你后来是怎么睡着的吗？希望这段话也能陪到今晚还没睡着的你。\n\n#看山问你睡了吗`;
    const status=document.createElement('p');status.textContent='编辑后复制到知乎圈子发布，不会自动发送。';
    const copy=this.button('复制文案',async()=>{try{await navigator.clipboard.writeText(input.value);status.textContent='已复制，请到知乎粘贴并发布。';}catch{input.select();status.textContent='请按 Ctrl+C 复制选中的文案。';}});
    copy.className='comp-primary';d.append(input,status,copy);d.showModal();
  }
}
