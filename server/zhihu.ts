// 知乎开放平台 API 封装。
// 鉴权：Authorization: Bearer <Access Secret> + X-Request-Timestamp（秒级）
// 参考：https://developer.zhihu.com

const ZHIHU_ACCESS_SECRET = process.env.ZHIHU_ACCESS_SECRET ?? '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';

export interface ZhihuSearchItem {
  title: string;
  contentType: string;
  contentId: string;
  contentText: string;
  url: string;
  voteUpCount: number;
  authorName: string;
  authorityLevel: string;
  rankingScore?: number;
}

function zhihuHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${ZHIHU_ACCESS_SECRET}`,
    'X-Request-Timestamp': Math.floor(Date.now() / 1000).toString(),
    'Content-Type': 'application/json'
  };
}

/** 知乎站内搜索：返回高赞回答/文章摘要 */
export async function zhihuSearch(query: string, count = 5): Promise<ZhihuSearchItem[]> {
  if (!ZHIHU_ACCESS_SECRET) return [];
  try {
    const url = `https://developer.zhihu.com/api/v1/content/zhihu_search?Query=${encodeURIComponent(query)}&Count=${count}`;
    const resp = await fetch(url, { headers: zhihuHeaders() });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { Code?: number; Data?: { Items?: Array<Record<string, unknown>> } };
    if (data.Code !== 0 || !data.Data?.Items) return [];
    return data.Data.Items.map((it) => ({
      title: String(it.Title ?? ''),
      contentType: String(it.ContentType ?? ''),
      contentId: String(it.ContentID ?? ''),
      contentText: String(it.ContentText ?? ''),
      url: String(it.Url ?? ''),
      voteUpCount: Number(it.VoteUpCount ?? 0),
      authorName: String(it.AuthorName ?? '知乎用户'),
      authorityLevel: String(it.AuthorityLevel ?? ''),
      rankingScore: it.RankingScore !== undefined ? Number(it.RankingScore) : undefined
    }));
  } catch {
    return [];
  }
}

/** 知乎直答：生成回答 */
export async function zhidaChat(prompt: string): Promise<string | null> {
  if (!ZHIHU_ACCESS_SECRET) return null;
  try {
    const resp = await fetch('https://developer.zhihu.com/v1/chat/completions', {
      method: 'POST',
      headers: zhihuHeaders(),
      body: JSON.stringify({
        model: 'zhida-thinking-1p5',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    return typeof content === 'string' && content ? content : null;
  } catch {
    return null;
  }
}

// ============ 黑客松公开内容接口（无需鉴权） ============

export interface ZhihuStoryItem {
  workId: string;
  title: string;
  artwork: string;
  description: string;
  labels: string[];
}

export interface ZhihuStoryDetail {
  workId: string;
  chapterName: string;
  authorName: string;
  labels: string[];
  introduction: string;
  content: string;
  /** 知乎站内阅读页；内容接口不返回地址，由 work_id 还原 */
  sourceUrl: string;
}

const ZHIHU_CONTENT_BASE = 'https://api.zhihu.com/km-indep-home/hackathon/v2';

/**
 * 知乎盐言故事 / 知识的站内阅读页。
 * 黑客松内容接口不返回网页地址，这里按 work_id 还原；
 * 实测该路径会返回知乎的 story 阅读器（SSR 状态里带独立 story store），
 * 与 /knowledge/、/p/ 这类会落到 404 页的路径不同。
 */
export function zhihuWorkUrl(workId: string): string {
  // Activity IDs are not documented public webpage IDs. Never invent a link.
  return '';
}

/** 知乎故事列表（盐言故事，无需鉴权） */
export async function zhihuStoryList(): Promise<ZhihuStoryItem[]> {
  try {
    const resp = await fetch(`${ZHIHU_CONTENT_BASE}/story/list`, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return [];
    const data = (await resp.json()) as Array<Record<string, unknown>>;
    return data.map((it) => ({
      workId: String(it.work_id ?? ''),
      title: String(it.title ?? ''),
      artwork: String(it.artwork ?? ''),
      description: String(it.description ?? ''),
      labels: Array.isArray(it.labels) ? (it.labels as string[]).map(String) : []
    }));
  } catch {
    return [];
  }
}

/** 知乎知识列表（无需鉴权） */
export async function zhihuKnowledgeList(): Promise<ZhihuStoryItem[]> {
  try {
    const resp = await fetch(`${ZHIHU_CONTENT_BASE}/knowledge/list`, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return [];
    const data = (await resp.json()) as Array<Record<string, unknown>>;
    return data.map((it) => ({
      workId: String(it.work_id ?? ''),
      title: String(it.title ?? ''),
      artwork: String(it.artwork ?? ''),
      description: String(it.description ?? ''),
      labels: Array.isArray(it.labels) ? (it.labels as string[]).map(String) : []
    }));
  } catch {
    return [];
  }
}

/** 解析详情响应（故事与知识共用字段结构） */
function parseDetail(it: Record<string, unknown>, workId: string): ZhihuStoryDetail {
  return {
    workId: String(it.work_id ?? workId),
    chapterName: String(it.chapter_name ?? ''),
    authorName: String(it.author_name ?? ''),
    labels: Array.isArray(it.labels) ? (it.labels as string[]).map(String) : [],
    introduction: String(it.introduction ?? ''),
    content: String(it.content ?? ''),
    sourceUrl: zhihuWorkUrl(workId)
  };
}

async function fetchDetail(path: 'story' | 'knowledge', workId: string): Promise<ZhihuStoryDetail | null> {
  try {
    const resp = await fetch(`${ZHIHU_CONTENT_BASE}/${path}/${encodeURIComponent(workId)}`, {
      headers: { Accept: 'application/json' }
    });
    if (!resp.ok) return null;
    return parseDetail((await resp.json()) as Record<string, unknown>, workId);
  } catch {
    return null;
  }
}

/** 知乎故事详情（正文，无需鉴权，路径为 story/{work_id}） */
export async function zhihuStoryDetail(workId: string): Promise<ZhihuStoryDetail | null> {
  return fetchDetail('story', workId);
}

/** 知乎知识详情（正文，无需鉴权）。实测路径为 knowledge/{work_id}，用 story/ 会返回 40404。 */
export async function zhihuKnowledgeDetail(workId: string): Promise<ZhihuStoryDetail | null> {
  return fetchDetail('knowledge', workId);
}

/**
 * DeepSeek：把知乎样本改编成剧情（用户已有 key）。
 * timeoutMs 可按调用方收紧：挑选三个声音时要走「等心事页」的同一条请求，
 * 不能在模型这里卡满 30 秒，否则前端会先超时、玩家看到「连不上知乎内容」。
 */
export async function deepseekGenerate(prompt: string, timeoutMs = 30000): Promise<string | null> {
  if (!DEEPSEEK_API_KEY) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    return typeof content === 'string' && content ? content : null;
  } catch {
    return null;
  }
}

// ============ 真实原文地址 ============

/**
 * 知乎原文入口。
 * 黑客松内容接口只给 work_id，不给网页地址。所以按优先级取：
 *   1. `zhihu_search`（开放平台，需要 Access Secret）用标题搜回这条内容，用官方返回的 Url；
 *   2. 搜不到或没配密钥时，回落到 story/{work_id} 还原的站内页。
 * 两种情况都指向真实知乎页面，界面只展示，不改写。
 */
export interface ContentSource {
  url: string;
  /** search = 开放平台搜索返回的官方链接；work = 由 work_id 还原的站内页 */
  via: 'search' | 'work';
  /** 搜索命中的那条内容的赞同数，拿不到为 0 */
  voteUpCount: number;
  /** 搜索命中的标题，用于如实比对是否同一条内容 */
  matchedTitle: string;
}

const sourceCache = new Map<string, { time: number; value: ContentSource }>();
const SOURCE_CACHE_TTL_MS = 30 * 60 * 1000;

/** 标题归一化：去掉空白与常见标点，便于比对是否同一条内容 */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·、，,。.！!？?《》〈〉「」『』【】\[\]()（）"'’“”\-—_/\\|:：;；~～+*#@$%^&]/g, '')
    .toLowerCase();
}

/** 从搜索结果里挑出与目标标题同一条内容的那项；宁可返回 null，也不硬套一个不相关的帖子 */
function pickSameContent(title: string, items: ZhihuSearchItem[]): ZhihuSearchItem | null {
  const want = normalizeTitle(title);
  if (want.length < 4) return null;
  let best: ZhihuSearchItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    if (!item.url) continue;
    const got = normalizeTitle(item.title);
    if (!got) continue;
    let score = 0;
    if (got === want) score = 3;
    else if (got.includes(want) || want.includes(got)) score = 2;
    else continue;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/** 取一条知乎内容的原文地址；带 30 分钟缓存，避免重复消耗搜索额度 */
export async function resolveContentSource(title: string, workId: string): Promise<ContentSource> {
  // 即使未配置搜索密钥，也返回可用的知乎站内搜索链接，避免前端出现“阅读正文”但无法跳转。
  const fallback: ContentSource = { url: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(title)}`, via: 'work', voteUpCount: 0, matchedTitle: '' };
  const cacheKey = `${workId}|${title}`;
  const hit = sourceCache.get(cacheKey);
  if (hit && Date.now() - hit.time < SOURCE_CACHE_TTL_MS) return hit.value;

  let value = fallback;
  const items = await zhihuSearch(title, 5);
  const match = pickSameContent(title, items);
  if (match) {
    value = {
      url: match.url,
      via: 'search',
      voteUpCount: match.voteUpCount,
      matchedTitle: match.title
    };
  }

  sourceCache.set(cacheKey, { time: Date.now(), value });
  return value;
}
