import { SharpScene } from '../ui/SharpScene';
import Phaser from 'phaser';
import { store, JournalEntry } from '../store';
import { THEME, css, roundedRect, backdrop, button } from '../ui/theme';
import { KanshanCompanion } from '../companion/KanshanCompanion';

/** 结局场景：结算结局卡 + 人生建议 + 收藏故事 */
export class EndingScene extends SharpScene {
  private shareText = '';
  private kanshan: KanshanCompanion | null = null;

  constructor() {
    super('EndingScene');
  }

  preload(): void { KanshanCompanion.preload(this); }

  create(): void {
    const W = 960;
    const H = 640;
    // Phaser 会复用同一个 Scene 实例，字段不会自动回到初始值：
    // 不清掉这个标记，第二局按 S 会被「已经收过」挡住，故事集里永远只有第一局。
    this.journalSaved = false;
    this.recapDialog?.remove();
    this.recapDialog = null;
    backdrop(this, '04 / 04    收好今夜');
    KanshanCompanion.register(this);
    this.kanshan = new KanshanCompanion(this, { x: 175, y: 432, roam: new Phaser.Geom.Rectangle(120, 390, 110, 70), depth: 5 });
    this.events.once('shutdown', () => { this.kanshan?.destroy(); this.kanshan = null; });
    button(this,740,530,160,'返回首页',()=>this.scene.start('MenuScene'),false);
    this.events.once('shutdown',()=>this.input.keyboard!.removeAllKeys(true));
    this.events.once('shutdown',()=>{this.recapDialog?.remove();this.recapDialog=null;});

    const ending = store.engine.resolveEnding();
    const s = store.engine.state;
    // 玩家在剧情结尾写给自己的那句话，跟着结局卡一起走
    const note = store.selfNote;
    this.shareText = note ? `${ending.shareText}\n\n我写给自己的话：${note}` : ending.shareText;

    // 结局卡
    roundedRect(this, W / 2 - 300, 90, 600, 430, 24, THEME.paper, 1, THEME.warm, 0.4);
    roundedRect(this, W / 2 - 268, 112, 536, 38, 12, THEME.greenSoft, 1, THEME.green, 0.12).disableInteractive();
    this.add.text(W / 2, 131, '看山把今晚收好了', { fontFamily: 'Microsoft YaHei', fontSize: '13px', color: css(THEME.green) }).setOrigin(0.5);
    this.add
      .text(W / 2, 180, ending.title, { fontFamily: 'system-ui, sans-serif', fontSize: '36px', color: css(THEME.warm), fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 222, ending.text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: css(THEME.text),
        // 中文断行：太窄会把句末标点挤成下一行开头的孤字，放宽到 576
        wordWrap: { width: 520, useAdvancedWrap: true },
        align: 'center',
        lineSpacing: 10
      })
      .setOrigin(0.5, 0);

    // 人生建议
    this.add
      .text(W / 2, 330, `「${ending.advice}」`, { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: css(THEME.green), fontStyle: 'bold', wordWrap: { width: 500, useAdvancedWrap: true }, align: 'center' })
      .setOrigin(0.5);

    // 玩家写给自己的那句话：这一局里唯一由玩家写下的内容
    if (note) {
      this.add
        .text(W / 2, 358, `“${note}”  —— 你写给自己的话`, {
          fontFamily: 'Microsoft YaHei',
          fontSize: '15px',
          color: css(THEME.warm),
          align: 'center',
          wordWrap: { width: 520, useAdvancedWrap: true },
          maxLines: 2,
          lineSpacing: 6
        })
        .setOrigin(0.5);
    }

    // 动作统计
    // 这一程你做过什么：把自己的回应、拥抱过的人、走过的故事说成一句话
    const responses = s.actions.length;
    const recap = `这一程你给了自己 ${responses} 次回应${s.huggedVoices.length > 0 ? ` · 拥抱了 ${s.huggedVoices.length} 个知乎声音` : ''}${store.storyTitle ? ` · 走过《${store.storyTitle}》` : ''}`;
    this.add
      .text(W / 2, note ? 418 : 404, recap, {
        fontFamily: 'Microsoft YaHei',
        fontSize: '13px',
        color: css(THEME.faint)
      })
      .setOrigin(0.5);

    // 拥抱过的知乎声音：真实互动留下的记号
    if (s.huggedVoices.length > 0) {
      this.add
        .text(W / 2, note ? 434 : 420, `❤ 你拥抱了 ${s.huggedVoices.length} 个来自知乎的声音`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: css(THEME.warm),
          fontStyle: 'bold'
        })
        .setOrigin(0.5);
    }

    // 收进「我的故事集」：把这一程的真实来源、写下的那句话一起留住
    const saveBtn = roundedRect(this, W / 2 - 250, 456, 160, 42, 21, THEME.green, 1);
    const saveText = this.add
      .text(W / 2 - 170, 477, '收进我的故事集', { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.onAccent) })
      .setOrigin(0.5);
    const saveStory = () => {
      if (this.journalSaved) return;
      const entry = buildJournal(ending.title, ending.advice);
      if (entry) {
        this.journalSaved = true;
        store.journals.unshift(entry);
        saveText.setText('已收进 ✓');
        return;
      }
      if (store.engine.sample) {
        store.engine.saveSample(store.engine.sample.id);
        saveText.setText('已收藏 ✓');
      }
    };
    saveBtn.on('pointerdown', saveStory);

    // 这一程的回顾：动作分布、拥抱过的声音、写下的那句话，可选中可复制
    const recapBtn = roundedRect(this, W / 2 - 80, 456, 160, 42, 21, THEME.paper, 1, THEME.line, 0.9);
    this.add
      .text(W / 2, 477, '看这一程的回顾', { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.text) })
      .setOrigin(0.5);
    const openRecap = () => this.openRecap(ending.title, ending.advice);
    recapBtn.on('pointerdown', openRecap);

    // 分享按钮
    const shareBtn = roundedRect(this, W / 2 + 90, 456, 160, 42, 21, THEME.warm, 1);
    const shareText = this.add
      .text(W / 2 + 170, 477, '复制分享', { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.onAccent) })
      .setOrigin(0.5);
    const copyShare = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(this.shareText).then(() => shareText.setText('已复制 ✓'));
      }
    };
    shareBtn.on('pointerdown', copyShare);
    // 拥抱/结算后留白：先让玩家停留片刻，再出现操作按钮。
    [saveBtn, saveText, recapBtn, shareBtn, shareText].forEach((o) => o.setAlpha(0));
    this.time.delayedCall(2200, () => [saveBtn, saveText, recapBtn, shareBtn, shareText].forEach((o) => o.setAlpha(1)));

    this.add
      .text(W / 2, 540, 'S 收进故事集  ·  E 看回顾  ·  C 复制分享  ·  Enter 回到首页', { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: css(THEME.faint) })
      .setOrigin(0.5);

    // 导演模式 F5：循环指定结局
    const kb = this.input.keyboard!;
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.F5).on('down', () => {
      const seq = [
        { courage: 6, acceptance: 4, empathy: 0 },
        { courage: 0, acceptance: 7, empathy: 0 },
        { courage: 0, acceptance: 0, empathy: 7 },
        { courage: 0, acceptance: 0, empathy: 0 }
      ];
      const idx = (EndingScene.forceIndex = ((EndingScene.forceIndex ?? 0) + 1) % seq.length);
      const v = seq[idx];
      store.engine.state.courage = v.courage;
      store.engine.state.acceptance = v.acceptance;
      store.engine.state.empathy = v.empathy;
      this.scene.restart();
    });

    const enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    enterKey.on('down', () => {
      this.scene.start('MenuScene');
    });
    this.input.keyboard!.addKey('S').on('down', saveStory);
    this.input.keyboard!.addKey('C').on('down', copyShare);
    this.input.keyboard!.addKey('E').on('down', openRecap);
  }

  update(time: number): void { this.kanshan?.update(time); }

  /** 这一程的回顾：把玩家真正做过的事摊开写清楚，可选中、可复制 */
  private openRecap(endingTitle: string, advice: string): void {
    if (this.recapDialog) return;
    this.input.enabled = false;
    this.input.keyboard!.enabled = false;
    const s = store.engine.state;
    const entry = buildJournal(endingTitle, advice);

    const dialog = document.createElement('dialog');
    this.recapDialog = dialog;
    dialog.setAttribute('aria-label', '这一程的回顾');
    dialog.style.cssText =
      'border:1px solid #4a3f6b;border-radius:20px;background:#2b2144;color:#f2edfb;padding:30px;width:min(620px,88vw);' +
      "max-height:84vh;overflow:auto;font:15px/1.85 'Microsoft YaHei',sans-serif;box-shadow:0 24px 100px #0b071499";

    const title = document.createElement('h2');
    title.textContent = '今晚，你做了什么';
    title.style.cssText = 'margin:0 0 4px;font-size:21px';
    const sub = document.createElement('p');
    sub.textContent = `结局「${endingTitle}」 · ${advice}`;
    sub.style.cssText = 'margin:0 0 16px;font-size:12px;color:#9184b0';

    const rows: [string, string][] = [
      ['今晚的心事', entry?.trouble ?? '（未记录）'],
      ['走过的故事', entry ? `《${entry.storyTitle}》` : '（未记录）'],
      ['素材来源', entry?.credit ?? store.storyCredit ?? '（未记录）'],
      ['给自己的回应', entry ? `${entry.responses} 次（${entry.responseMix}）` : `${s.actions.length} 次`],
      // 不给玩家看分数：情绪体验不该变成一张成绩单。
      // 这里放他自己决定带走的那句话——没有就如实说没有，不补文案。
      ['你带走的那句话', store.keptEncouragement ? `“${store.keptEncouragement.quote}” —— @${store.keptEncouragement.author}` : '（这一次没有留下）'],
      ['你拥抱过的知乎声音', s.huggedVoices.length > 0 ? `${s.huggedVoices.length} 个` : '还没有'],
      ['陪你走完这一程的真实内容', entry && entry.voices.length > 0 ? entry.voices.map((v) => `@${v.author}《${v.title}》`).join(' · ') : '这一段走的是本地示例剧情'],
      ['你写给自己的话', store.selfNote ?? '（这次没有写）']
    ];
    const list = document.createElement('dl');
    list.style.cssText = 'margin:0';
    for (const [key, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = key;
      dt.style.cssText = 'font-size:11px;color:#9184b0;margin-top:12px';
      const dd = document.createElement('dd');
      dd.textContent = value;
      dd.style.cssText = 'margin:2px 0 0';
      list.append(dt, dd);
    }

    const close = document.createElement('button');
    close.textContent = '继续';
    close.style.cssText = 'margin-top:20px;padding:11px 20px;border:0;border-radius:10px;background:#86d6b4;color:#1e1730;cursor:pointer';
    close.onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      dialog.remove();
      this.recapDialog = null;
      this.input.enabled = true;
      this.input.keyboard!.enabled = true;
    });
    dialog.append(title, sub, list, close);
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
  }

  private recapDialog: HTMLDialogElement | null = null;
  /** 这一局是否已经收进故事集，避免重复按键写进多条 */
  private journalSaved = false;
  private static forceIndex = 0;
}

/** 把这一局的真实经过整理成一条「我的故事集」记录；没有心事可记时返回 null */
function buildJournal(endingTitle: string, advice: string): JournalEntry | null {
  // 玩家真正点中的那张卡优先；引擎里的 currentTroubleId 对知乎热门烦恼只是占位
  const trouble = store.selectedTrouble ?? store.engine.trouble;
  const worry = store.realTroubleText ?? trouble?.text;
  if (!worry) return null;
  const s = store.engine.state;
  const counts = new Map<string, number>();
  for (const action of s.actions) counts.set(action, (counts.get(action) ?? 0) + 1);
  const labels: Record<string, string> = { hug: '拥抱', nod: '点头', slash: '挥剑', dodge: '歇一会', investigate: '看一看' };
  const responseMix = [...counts.entries()].map(([action, n]) => `${labels[action] ?? action} ${n}`).join(' · ') || '只是在读';
  return {
    id: `journal-${Date.now()}`,
    at: new Date().toLocaleString('zh-CN', { hour12: false }),
    trouble: worry,
    storyTitle: store.storyTitle ?? '（未记录）',
    credit: store.storyCredit ?? '（未记录来源）',
    endingTitle,
    advice,
    responses: s.actions.length,
    responseMix,
    note: store.selfNote,
    voices: (store.realVoices ?? []).map((v) => ({ author: v.author, title: v.title, sourceLabel: v.sourceLabel }))
  };
}
