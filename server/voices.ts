// 把知乎真实内容挑成「三个声音」。
// 原则：只挑选与摘录，不生成、不改写正文；作者、标题、正文全部来自知乎内容接口。
// 接口字段缺失或请求失败时如实返回更少的声音，不用本地虚构内容顶替。

import {
  zhihuKnowledgeDetail,
  zhihuKnowledgeList,
  zhihuStoryDetail,
  zhihuStoryList,
  resolveContentSource,
  deepseekGenerate
} from './zhihu.js';

export type VoiceKind = 'story' | 'knowledge';

export interface ContentItem {
  kind: VoiceKind;
  workId: string;
  title: string;
  description: string;
  labels: string[];
}

export interface ZhihuVoice {
  kind: VoiceKind;
  workId: string;
  title: string;
  author: string;
  /** 知乎正文的原样摘录 */
  excerpt: string;
  /** 知乎正文（供剧情改编使用，仍是原文） */
  body: string;
  /** 展示用来源署名：知乎盐言故事 · 作者《标题》 */
  sourceLabel: string;
  /** 展示用角色说明，取自真实标签或内容类型 */
  role: string;
  /** 这条内容在知乎的真实地址，供界面「知乎原文」入口打开 */
  sourceUrl: string;
  /** search = 开放平台搜索返回的官方链接；work = 由 work_id 还原的站内页 */
  sourceVia: 'search' | 'work';
  /** 搜索结果里的真实赞同数；拿不到为 0 */
  voteCount: number;
  /** 搜索命中的标题；与 title 不同时说明链接指向的是知乎上同主题的另一条内容 */
  matchedTitle: string;
}

/** 心事主题词表：用于把「用户的烦恼」和「知乎内容的标签/标题/摘要」对上 */
const TOPICS: Record<string, string[]> = {
  // 「看山问你，睡了吗？」的三条主轴：睡不着本身、压着睡不着的事、白天动得不够
  sleep: ['失眠', '睡眠', '睡不着', '入睡', '熬夜', '晚睡', '早醒', '多梦', '睡前', '夜里', '夜晚', '安眠', '助眠', '睡觉', '睡眠质量', '困'],
  stress: ['压力', '焦虑', '紧张', '内耗', '情绪', '放松', '休息', '疲惫', '疲劳', '倦怠', '冥想', '呼吸', '心事', '烦躁', '委屈', '压抑', '说不出口'],
  sport: ['运动', '锻炼', '跑步', '健身', '散步', '久坐', '拉伸', '瑜伽', '走路', '出汗', '打球', '游泳', '体力'],
  career: ['工作', '职场', '职业', '辞职', '离职', '转行', '老板', '升职', '加薪', '同事', '上班', '打工', '就业', '实习', '面试', 'offer', '穷人思维', '金字塔', '事业', '创业', '副业', '上班族'],
  study: ['学习', '考研', '考试', '成绩', '分数', '专注', '注意力', '目标', '自律', '拖延', '学校', '校园', '学霸', '专业', '论文', '毕业', '读书', '刷题', '备考', '效率', '行动力', '逼迫自己'],
  emotion: ['喜欢', '表白', '暗恋', '恋爱', '爱情', '感情', '分手', '暧昧', '心动', '结婚', '相亲', '甜宠', '言情', '虐恋', '先虐后甜', '青梅竹马', '追妻'],
  relation: ['朋友', '友谊', '疏远', '挽回', '人际', '合群', '拒绝', '社交', '孤独', '圈子', '团宠', '关系', '家人', '父母', '亲情', '家庭', '陪伴'],
  self: ['自卑', '自我怀疑', '落后', '同龄人', '内向', '被动', '主动', '心理', '迷茫', '成长', '治愈', '勇气', '自信', '讨好', '价值'],
  escape: ['重新开始', '离开', '陌生', '城市', '换环境', '重启', '重生', '穿越', '穿书', '末日', '末世', '求生', '逃亡', '逆袭', '躺赢', '囤物资', '系统', '爽文', '脑洞', '无限流']
};

const MAX_VOICES = 3;
const BODY_LIMIT = 3000;
const CACHE_TTL_MS = 5 * 60 * 1000;
/** 缓存条数上限：演示一下午会点很多次心事，过期条目要顺手清掉 */
const CACHE_MAX_ENTRIES = 40;
/**
 * 让模型挑声音的最长等待。超时就走主题词表打分——
 * 玩家在这一页是等着看的，宁可相关度差一点，也不能让他干等或看到超时提示。
 */
const AI_PICK_TIMEOUT_MS = 9000;

const cache = new Map<string, { time: number; value: ZhihuVoice[] }>();

/** 写入缓存，并在超过上限时清掉过期条目 */
function remember(key: string, value: ZhihuVoice[]): void {
  const now = Date.now();
  if (cache.size >= CACHE_MAX_ENTRIES) {
    for (const [cachedKey, cached] of cache) {
      if (now - cached.time >= CACHE_TTL_MS) cache.delete(cachedKey);
    }
  }
  cache.set(key, { time: now, value });
}

/** 心事问句命中了哪些主题，以及每个主题的强调程度 */
function topicWeightsOf(text: string): Map<string, number> {
  const lower = text.toLowerCase();
  const weights = new Map<string, number>();
  for (const [topic, words] of Object.entries(TOPICS)) {
    const hits = words.filter((w) => lower.includes(w.toLowerCase())).length;
    if (hits > 0) weights.set(topic, Math.min(hits, 3));
  }
  return weights;
}

/**
 * 主题相关度：题目里命中的主题词，越靠近内容自身（标题 > 标签 > 摘要）权重越高。
 * 这样「不想学习的时候如何逼迫自己学习」会排在只是碰巧带「职场」标签的言情故事前面。
 */
function scoreItem(item: ContentItem, queryWeights: Map<string, number>, queryWords: string[]): number {
  const title = item.title.toLowerCase();
  const labels = item.labels.join(' ').toLowerCase();
  const desc = item.description.toLowerCase();
  let score = 0;
  for (const [topic, weight] of queryWeights) {
    for (const word of TOPICS[topic]) {
      const w = word.toLowerCase();
      if (title.includes(w)) score += 6 * weight;
      else if (labels.includes(w)) score += 4 * weight;
      else if (desc.includes(w)) score += weight;
    }
  }
  score += queryWords.filter((w) => title.includes(w)).length * 5;
  return score;
}

/**
 * 兜底选题：心事字面一个主题都没命中时，用「和睡不着最近的几类」再挑一次。
 *
 * 为什么需要它：知乎这份候选池（10 篇知乎知识 + 20 篇盐言故事）里压根没有失眠主题的内容，
 * 「一躺下就清醒」这类心事只靠字面匹配会一条都命中不了；再叠上没配 DEEPSEEK_API_KEY
 * 就没有模型来挑，整页会直接空掉、评委卡在「暂时连不上知乎内容」这一步走不下去。
 *
 * 这不是编内容：仍然只从同一批真实候选里挑，署名照旧落在真实作者与标题上，
 * 只是把「挑哪几条」从字面命中换成最近的主题（压力 / 自我 / 学习 / 关系 / 职场）。
 */
const NEAR_SLEEP_TOPICS: [string, number][] = [
  ['stress', 3],
  ['self', 3],
  ['study', 2],
  ['relation', 2],
  ['career', 1]
];

function nearestToSleep(candidates: ContentItem[]): ContentItem[] {
  const weights = new Map<string, number>(NEAR_SLEEP_TOPICS);
  return candidates
    .map((item) => ({ item, score: scoreItem(item, weights, []) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.item);
}

/** 摘录：按原文字符截取，尽量停在句末，不改写任何字 */
function excerptOf(content: string, max = 104): string {  const clean = content.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const stop = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('！'),
    head.lastIndexOf('？'),
    head.lastIndexOf('…'),
    head.lastIndexOf('；')
  );
  return `${stop >= max * 0.5 ? head.slice(0, stop + 1) : head}…`;
}

function roleOf(item: ContentItem): string {
  if (item.kind === 'story') {
    const labels = item.labels.slice(0, 2).join(' · ');
    return labels ? `盐言故事 · ${labels}` : '盐言故事 · 知乎创作者';
  }
  return '知乎创作者 · 经验分享';
}

function sourceLabelOf(kind: VoiceKind, author: string, title: string): string {
  const kindLabel = kind === 'story' ? '知乎盐言故事' : '知乎知识';
  return `${kindLabel} · ${author}《${title}》`;
}

async function loadCandidates(): Promise<ContentItem[]> {
  const [stories, knowledge] = await Promise.all([zhihuStoryList(), zhihuKnowledgeList()]);
  return [
    ...stories.map((s) => ({ kind: 'story' as const, ...s })),
    ...knowledge.map((k) => ({ kind: 'knowledge' as const, ...k }))
  ].filter((it) => it.workId);
}

/** 让 DeepSeek 只在真实候选里挑相关项；只选 id，不写正文 */
async function aiPick(trouble: string, candidates: ContentItem[], need: number): Promise<string[]> {
  const list = candidates
    .map((it) => `[${it.workId}] ${it.kind === 'story' ? '盐言故事' : '知乎知识'}｜${it.title}｜标签:${it.labels.join('/') || '无'}｜${it.description.slice(0, 90)}`)
    .join('\n');
  const raw = await deepseekGenerate(
    [
      '下面是从知乎接口取回的真实内容清单（故事与知识）。',
      `用户此刻的心事是：「${trouble}」。`,
      `请从清单里挑选与该心事最相关的 ${need} 条，理想组合是 1 篇盐言故事 + 2 篇知乎知识；某一类确实不相关时就不要硬挑，宁少勿滥。`,
      '只能选清单里已有的 work_id，不得编造、改写或补充清单以外的任何内容。',
      '严格只输出 JSON：{"picks":["work_id","work_id"]}；都不相关就输出 {"picks":[]}。',
      '',
      list
    ].join('\n'),
    // 这一页在玩家等着的路径上：模型慢就直接放弃、退回主题词表，别让页面超时
    AI_PICK_TIMEOUT_MS
  );
  if (!raw) return [];
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { picks?: unknown };
    if (!Array.isArray(parsed.picks)) return [];
    const valid = new Set(candidates.map((it) => it.workId));
    return parsed.picks.map(String).filter((id) => valid.has(id)).slice(0, need);
  } catch {
    return [];
  }
}

/** 保证「有故事也有知乎知识」的多样性：缺哪一类，就用得分最高的那一类替换掉最弱的 */
function diversify(ranked: ContentItem[], picked: ContentItem[]): ContentItem[] {
  const kinds = new Set(picked.map((it) => it.kind));
  for (const kind of ['story', 'knowledge'] as VoiceKind[]) {
    if (kinds.has(kind)) continue;
    const replacement = ranked.find((it) => it.kind === kind && !picked.includes(it));
    if (!replacement) continue;
    picked[picked.length - 1] = replacement;
    kinds.add(kind);
  }
  return picked;
}

async function toVoice(item: ContentItem): Promise<ZhihuVoice | null> {
  const detail =
    item.kind === 'story' ? await zhihuStoryDetail(item.workId) : await zhihuKnowledgeDetail(item.workId);
  const body = (detail?.content || item.description || '').trim();
  if (!body) return null;
  const title = detail?.chapterName || item.title;
  const author = detail?.authorName || '知乎作者';
  const source = await resolveContentSource(title, item.workId);
  return {
    kind: item.kind,
    workId: item.workId,
    title,
    author,
    excerpt: excerptOf(body),
    body: body.slice(0, BODY_LIMIT),
    sourceLabel: sourceLabelOf(item.kind, author, title),
    role: roleOf(detail && detail.labels.length ? { ...item, labels: detail.labels } : item),
    sourceUrl: source.url,
    sourceVia: source.via,
    voteCount: source.voteUpCount,
    matchedTitle: source.matchedTitle
  };
}

/** 按心事挑选知乎真实内容，返回最多 3 个声音（可能少于 3 个，不虚构补齐） */
export async function buildVoices(trouble: string, keywords: string[] = []): Promise<ZhihuVoice[]> {
  const query = trouble.trim();
  const key = `${query}|${keywords.join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.value;

  const candidates = await loadCandidates();
  if (candidates.length === 0) return [];

  const queryWords = [...new Set([...keywords, ...query.split(/[\s，,。！？、；：]+/)].map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2))];
  const queryWeights = topicWeightsOf(`${query} ${keywords.join(' ')}`);

  const lexical = candidates
    .map((item) => ({ item, score: scoreItem(item, queryWeights, queryWords) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);

  const picked: ContentItem[] = [];
  const take = (item: ContentItem | undefined) => {
    if (!item || picked.length >= MAX_VOICES) return;
    if (picked.some((p) => p.workId === item.workId)) return;
    picked.push(item);
  };

  // 首选：由模型在真实候选里挑相关项（只选 id，正文仍来自知乎）
  for (const id of await aiPick(query, candidates, MAX_VOICES)) {
    take(candidates.find((it) => it.workId === id));
  }
  // 兜底：模型不可用或挑得不够时，用主题词表命中项补齐并兼顾故事/知识两类。
  // 词表一条都没命中（睡眠主题的心事撞上了没有睡眠内容的候选池）就退到最近的主题，
  // 宁可给到主题稍远但真实的内容，也不能让这一页空着把玩家挡在故事之外。
  if (picked.length < MAX_VOICES) {
    const pool = lexical.length > 0 ? lexical : nearestToSleep(candidates);
    const rest = pool.filter((it) => !picked.some((p) => p.workId === it.workId));
    for (const item of diversify(rest, rest.slice(0, MAX_VOICES - picked.length))) take(item);
  }

  const voices: ZhihuVoice[] = [];
  for (const item of picked) {
    const voice = await toVoice(item);
    if (voice) voices.push(voice);
  }

  remember(key, voices);
  return voices;
}
