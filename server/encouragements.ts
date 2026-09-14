// 把知乎上的「真实回答」挑成结算页的「过来人的话」。
//
// 与 voices.ts 的区别（很重要，别混用）：
//   voices 的候选池是盐言故事 + 知乎知识，那是虚构小说里的台词，
//   不能当作「真实的人说过的话」拿给玩家看。所以这一屏只走 zhihuSearch，
//   数据源是真实回答/文章，每个条目都带作者与可打开的原文地址。
//
// 原则：只检索、只摘录，不生成、不改写。拿不到就如实返回空数组，不用本地文案顶替。

import { zhihuSearch, ZhihuSearchItem } from './zhihu.js';

export interface Encouragement {
  author: string;
  /** 知乎正文的原样摘录，一字不改 */
  quote: string;
  title: string;
  sourceUrl: string;
  voteCount: number;
  /** 这句话是哪条检索词召回的，便于核对质量 */
  matchedQuery: string;
  debug: {
    score: number;
    reason: string;
    /** quote 是否确实是正文里的连续原文（自证「只摘录」） */
    verbatim: boolean;
  };
}

/** 这一局的动作画像：决定搜什么，而不是搜一批通用鼓励 */
export interface Profile {
  trouble: string;
  keywords?: string[];
  /** 拥抱过几个知乎声音 */
  hugged?: number;
  /** 各类动作的次数 */
  actions?: Record<string, number>;
  stats?: { courage?: number; acceptance?: number; empathy?: number; curiosity?: number };
}

const MAX_QUOTES = 8;
/** 少于这个数就当作「这次没取到」，宁可如实说没有，也不凑数 */
const MIN_QUOTES = 3;
/** 及格线：低于这个分的不要 */
const PASS_SCORE = 45;
const QUERY_LIMIT = 6;
const PER_QUERY_COUNT = 5;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 40;

// —— 词表：这套词表决定了「像真人经历」还是「像鸡汤卡片」 ——
const FIRST_PERSON = /我|自己/;
const TIME_ORDER = /当时|后来|一开始|最后|那段时间|过了|回头看|现在/;
const NARRATIVE_MARKERS = ['我', '当时', '后来', '一开始', '最后', '那段时间', '回头看', '熬', '撑', '慢慢', '其实'];
const CONCRETE: RegExp[] = [
  /\d/,
  /[一二三四五六七八九十]+(年|个月|天|周|次)/,
  /(公司|学校|城市|家里|医院|出租屋|机场|车站|办公室|宿舍)/,
  /(辞职|离职|转行|考研|分手|搬家|离开|回国|换工作|加班|面试|考试)/,
  /(结果|所以|于是|后来|最后|现在)/
];
const VAGUE = ['人生', '成长', '努力', '心态', '热爱', '坚持', '焦虑', '迷茫', '未来'];
const AD = /课程|私信|加微信|报名|咨询|训练营|带货|推广|返利|扫码|优惠|代购/;
const CLICKBAIT = /震惊|必看|秘籍|干货|收藏这一篇|深度好文/;
const ADVICE = /你应该|建议你|一定要|必须得|千万不要|劝你|教你/;
const STOP_TOPIC = ['什么', '怎么', '如何', '为什么', '可以', '自己', '一个', '现在', '就是', '觉得', '知道', '还是', '很想', '特别'];

const cache = new Map<string, { time: number; value: Encouragement[] }>();

function remember(key: string, value: Encouragement[]): void {
  const now = Date.now();
  if (cache.size >= CACHE_MAX_ENTRIES) {
    for (const [k, v] of cache) if (now - v.time >= CACHE_TTL_MS) cache.delete(k);
  }
  cache.set(key, { time: now, value });
}

function countHits(text: string, markers: string[]): number {
  let n = 0;
  for (const m of markers) if (text.includes(m)) n += 1;
  return n;
}

/** 心事里值得拿去搜的词：去掉问句里的空词，最多 12 个 */
function topicSignals(profile: Profile): string[] {
  const raw = [profile.trouble, ...(profile.keywords ?? [])].join(' ');
  const parts = raw.split(/[\s，,。！？、；：.!?;:]+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const t = part.replace(/^关于/, '').slice(0, 12);
    if (t.length < 2 || STOP_TOPIC.includes(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

/** 主题命中 0-35：越靠前的信号词权重越高 */
function scoreTopic(text: string, signals: string[]): number {
  if (signals.length === 0) return 0;
  let hit = 0;
  signals.forEach((sig, index) => {
    if (!text.includes(sig)) return;
    hit += index < 4 ? 1.35 : index < 8 ? 1.1 : 0.9;
  });
  const coverage = hit / Math.max(signals.length, 4);
  return Math.round(Math.min(1, coverage) * 35);
}

/** 叙事性 0-25：第一人称 + 时间顺序，代表「这是一个人的经历」 */
function scoreNarrative(text: string): number {
  const base = Math.round(Math.min(1, countHits(text, NARRATIVE_MARKERS) / 5) * 20);
  return Math.min(25, base + (FIRST_PERSON.test(text) ? 3 : 0) + (TIME_ORDER.test(text) ? 2 : 0));
}

/** 具体性 0-20：有时间、地点、动作、结果，才像真的发生过 */
function scoreSpecificity(text: string): number {
  const kinds = CONCRETE.filter((re) => re.test(text)).length;
  return Math.round((Math.min(kinds, 5) / 5) * 20);
}

/** 基础质量 0-20 */
function scoreBasic(item: ZhihuSearchItem): number {
  const text = item.contentText ?? '';
  let score = 0;
  if (item.title) score += 4;
  if (text.length >= 30) score += 5;
  if (text.length >= 220) score += 3;
  if (item.authorName) score += 3;
  if (item.url) score += 3;
  if (item.voteUpCount >= 50) score += 2;
  return Math.min(20, score);
}

/** 惩罚 0-35：专治营销号、标题党、空话、说教 */
function scorePenalty(item: ZhihuSearchItem, topicHit: number): number {
  const text = item.contentText ?? '';
  const title = item.title ?? '';
  let p = 0;
  if (text.length < 30) p += 18;
  if (CLICKBAIT.test(title)) p += 10;
  if (AD.test(text)) p += 14;
  const vague = VAGUE.filter((w) => text.includes(w)).length;
  if (vague >= 3 && topicHit < 12) p += 10;
  const advice = (text.match(new RegExp(ADVICE, 'g')) ?? []).length;
  if (advice >= 2) p += 8;
  return Math.min(35, p);
}

interface Scored {
  item: ZhihuSearchItem;
  quote: string;
  score: number;
  reason: string;
  verbatim: boolean;
  matchedQuery: string;
}

function assess(item: ZhihuSearchItem, signals: string[], matchedQuery: string): Scored | null {
  const text = (item.contentText ?? '').trim();
  if (!text || !item.url) return null;

  const topicHit = scoreTopic(`${item.title ?? ''}${text}`, signals);
  const narrative = scoreNarrative(text);
  const specificity = scoreSpecificity(text);
  const basic = scoreBasic(item);
  const penalty = scorePenalty(item, topicHit);
  const raw = topicHit + narrative + specificity + basic - penalty;
  const score = Math.max(0, Math.min(100, raw));

  const picked = bestQuote(text);
  if (!picked) return null;

  const reason = `topic=${topicHit} narrative=${narrative} specific=${specificity} basic=${basic} penalty=${penalty}`;
  return {
    item,
    quote: picked.quote,
    score,
    reason,
    verbatim: picked.verbatim,
    matchedQuery,
  };
}

/**
 * 摘句：把正文分句后逐句打分，取最能当「过来人的话」的那一句。
 * 只做定位，不改一个字 —— 返回的 quote 必须是正文里的连续原文。
 */
function bestQuote(text: string): { quote: string; verbatim: boolean } | null {
  // 保留分隔符切句，再用正则在原串里定位，保证拿到的是连续原文
  const pieces = text.split(/(?<=[。！？…；])/).map((s) => s.trim()).filter(Boolean);
  let best = '';
  let bestScore = -Infinity;
  for (const piece of pieces) {
    const len = piece.length;
    if (len < 12 || len > 80) continue;
    if (AD.test(piece)) continue;
    let s = 0;
    s += scoreNarrative(piece) * 1.0;
    s += scoreSpecificity(piece) * 0.8;
    if (ADVICE.test(piece)) s -= 14;
    if (VAGUE.filter((w) => piece.includes(w)).length >= 2) s -= 6;
    // 太短或太长都不好念
    s -= Math.abs(len - 38) / 38 * 4;
    if (s > bestScore) {
      bestScore = s;
      best = piece;
    }
  }
  if (!best) {
    // 通篇没有合格句子时，退一步用开头一段（仍然是原文）
    const head = text.slice(0, 60).trim();
    if (head.length < 8) return null;
    return { quote: head, verbatim: text.includes(head) };
  }
  return { quote: best, verbatim: text.includes(best) };
}

/** 按动作画像生成检索词：不是搜「鼓励」，是搜「和他这一局相似的真实经历」 */
function buildQueries(profile: Profile): string[] {
  const qs: string[] = [];
  const trouble = profile.trouble.trim();
  if (trouble) qs.push(trouble.slice(0, 40));
  for (const k of (profile.keywords ?? []).slice(0, 2)) if (k.trim()) qs.push(k.trim());

  const actions = profile.actions ?? {};
  const order = (['slash', 'nod', 'dodge', 'hug'] as const).slice().sort((a, b) => (actions[b] ?? 0) - (actions[a] ?? 0));
  const dominant: Record<string, string> = {
    slash: '把心里的结松开之后',
    nod: '睡不着的时候我是这样想的',
    dodge: '允许自己休息下来',
    hug: '有人陪着的那一晚',
  };
  const top = order[0];
  if (top && (actions[top] ?? 0) > 0) qs.push(dominant[top]);

  if ((profile.hugged ?? 0) >= 2) qs.push('哪句话支撑你走了很久');
  if ((profile.stats?.courage ?? 99) <= 2) qs.push('压力大的时候我是怎么放松的');
  if ((profile.stats?.curiosity ?? 99) <= 2) qs.push('睡不着的时候我在想什么');
  qs.push('睡好之后回头看');

  const uniq: string[] = [];
  for (const q of qs) {
    const t = q.trim();
    if (t && !uniq.includes(t)) uniq.push(t);
  }
  return uniq.slice(0, QUERY_LIMIT);
}

function normalizeForDedupe(value: string): string {
  return value.replace(/[\s\u3000]+/g, '').replace(/[，,。.！!？?、；;：:「」『』"'’“”()（）《》]/g, '');
}

/**
 * 按这一局的动作画像，检索并挑出「过来人的话」。
 * 少于 MIN_QUOTES 条时返回空数组：宁可这一屏不出现，也不凑数。
 */
export async function buildEncouragements(profile: Profile): Promise<Encouragement[]> {
  const key = JSON.stringify({
    t: profile.trouble.slice(0, 120),
    k: (profile.keywords ?? []).slice(0, 4),
    h: profile.hugged ?? 0,
    a: profile.actions ?? {},
    s: profile.stats ?? {},
  });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.value;

  const signals = topicSignals(profile);
  const queries = buildQueries(profile);
  const sets = await Promise.all(queries.map((q) => zhihuSearch(q, PER_QUERY_COUNT)));

  const scored: Scored[] = [];
  for (let n = 0; n < sets.length; n += 1) {
    for (const item of sets[n]) {
      const s = assess(item, signals, queries[n]);
      if (s && s.score >= PASS_SCORE) scored.push(s);
    }
  }
  // 分高的在前；同分时赞同数高的在前
  scored.sort((a, b) => b.score - a.score || (b.item.voteUpCount ?? 0) - (a.item.voteUpCount ?? 0));

  const seenQuote = new Set<string>();
  const seenAuthor = new Set<string>();
  const out: Encouragement[] = [];
  for (const s of scored) {
    if (out.length >= MAX_QUOTES) break;
    const qKey = normalizeForDedupe(s.quote);
    if (qKey.length < 8 || seenQuote.has(qKey)) continue;
    // 同一个人最多出现一次：一屏里被同一个人刷屏就不像「很多人在说」
    const author = (s.item.authorName || '知乎用户').trim();
    if (seenAuthor.has(author)) continue;
    seenQuote.add(qKey);
    seenAuthor.add(author);
    out.push({
      author,
      quote: s.quote,
      title: s.item.title ?? '',
      sourceUrl: s.item.url,
      voteCount: s.item.voteUpCount ?? 0,
      matchedQuery: s.matchedQuery,
      debug: { score: s.score, reason: s.reason, verbatim: s.verbatim },
    });
  }

  const value = out.length >= MIN_QUOTES ? out : [];
  remember(key, value);
  return value;
}
