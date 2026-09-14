import { SharpScene } from '../ui/SharpScene';
import Phaser from 'phaser';
import { store, JournalEntry } from '../store';
import { Sample } from '../story/storyData';
import { THEME, css, roundedRect, backdrop, button } from '../ui/theme';

/** 故事集场景：展示收藏的故事，以及走完的每一程（带真实来源与写给自己的话） */
export class SampleScene extends SharpScene {
  private page = 0;
  constructor() {
    super('SampleScene');
  }

  create(): void {
    const W = 960;
    const H = 640;
    backdrop(this, '把走过的夜晚留下来');
    button(this,740,530,160,'返回首页',()=>this.scene.start('MenuScene'),false);
    this.events.once('shutdown',()=>this.input.keyboard!.removeAllKeys(true));

    this.add
      .text(W / 2, 112, '我的故事集', { fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: css(THEME.text), fontStyle: 'bold' })
      .setOrigin(0.5);

    const samples = store.engine.savedSampleList;
    const journals = store.journals;
    const pages=Math.max(1,Math.ceil((samples.length+journals.length)/2));
    this.page=Math.min(this.page,pages-1);
    if(pages>1) {
      button(this,70,530,130,'← 上一页',()=>{this.page=(this.page-1+pages)%pages;this.scene.restart();},false);
      button(this,215,530,130,'下一页 →',()=>{this.page=(this.page+1)%pages;this.scene.restart();},false);
    }

    if (samples.length === 0 && journals.length === 0) {
      this.add
        .text(W / 2, 300, '还没有收藏的记录\n走完今晚这一程，把它收进来吧', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '20px',
          color: css(THEME.faint),
          align: 'center',
          lineSpacing: 10
        })
        .setOrigin(0.5);
    } else {
      // 走完的那一程排前面：它带着真实来源和玩家自己写下的那句话
      const cards: ((slot: number) => void)[] = [
        ...journals.map((journal) => (slot: number) => this.renderJournal(journal, slot)),
        ...samples.map((sample) => (slot: number) => this.renderSample(sample, slot))
      ];
      cards.slice(this.page * 2, this.page * 2 + 2).forEach((render, i) => render(i));
    }

    this.add
      .text(W / 2, 600, '按 Enter 返回首页', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: css(THEME.faint) })
      .setOrigin(0.5);

    const enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    enterKey.on('down', () => {
      this.scene.start('MenuScene');
    });
  }

  /** 走完的一程：心事、故事、真实来源、写下的那句话 */
  private renderJournal(journal: JournalEntry, slot: number): void {
    const W = 960;
    const y = 230 + slot * 150;
    roundedRect(this, W / 2 - 320, y - 52, 640, 124, 16, THEME.paper, 1, THEME.green, 0.45);
    this.add
      .text(W / 2 - 290, y - 28, `这一程 · ${journal.trouble}`, {
        fontFamily: 'Microsoft YaHei',
        fontSize: '17px',
        color: css(THEME.text),
        fontStyle: 'bold',
        wordWrap: { width: 560, useAdvancedWrap: true }
      })
      .setOrigin(0, 0.5);
    this.add
      .text(W / 2 - 290, y + 6, `结局「${journal.endingTitle}」 · 回应 ${journal.responses} 次（${journal.responseMix}）`, {
        fontFamily: 'Microsoft YaHei',
        fontSize: '12px',
        color: css(THEME.muted)
      })
      .setOrigin(0, 0.5);
    // 一行放得下的写法：首位作者 + 还有几位；完整名单在「看这一程的回顾」里
    const voices = journal.voices;
    const sources =
      voices.length === 0
        ? '本地示例剧情（非知乎内容）'
        : voices.length === 1
          ? `@${voices[0].author}《${voices[0].title}》`
          : `@${voices[0].author}《${voices[0].title}》等 ${voices.length} 位知乎创作者`;
    this.add
      .text(W / 2 - 290, y + 26, `陪你的人：${sources}`, {
        fontFamily: 'Microsoft YaHei',
        fontSize: '11px',
        color: css(THEME.faint),
        wordWrap: { width: 560, useAdvancedWrap: true }
      })
      .setOrigin(0, 0.5);
    const noteLine = journal.note ? `“${journal.note}”` : `${journal.at}`;
    this.add
      .text(W / 2 - 290, y + 46, noteLine, {
        fontFamily: 'Microsoft YaHei',
        fontSize: '12px',
        color: journal.note ? css(THEME.warm) : css(THEME.faint),
        wordWrap: { width: 560, useAdvancedWrap: true }
      })
      .setOrigin(0, 0.5);
  }

  /** 本地示例收藏（旧的故事集条目） */
  private renderSample(sample: Sample, slot: number): void {
    const W = 960;
    const y = 230 + slot * 150;
    roundedRect(this, W / 2 - 320, y - 50, 640, 120, 16, THEME.paper, 1, THEME.warm, 0.3);
    this.add
      .text(W / 2 - 290, y - 20, `${sample.personName}，${sample.age}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: css(THEME.text),
        fontStyle: 'bold'
      })
      .setOrigin(0, 0.5);
    this.add
      .text(W / 2 - 290, y + 15, sample.content.length > 100 ? sample.content.slice(0, 100) + '…' : sample.content, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: css(THEME.muted),
        wordWrap: { width: 560, useAdvancedWrap: true }
      })
      .setOrigin(0, 0.5);
  }

  /** 当前页里的第几个位置（每页两张） */
}
