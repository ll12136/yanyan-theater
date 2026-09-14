// AI / 知乎内容客户端：请求经过 Node 服务端代理。
// 所有方法失败/超时返回 null 或空数组，由调用方降级到本地数据。

export interface ZhihuKnowledgeItem {
  title: string;
  description: string;
  labels: string[];
}

export interface ZhihuStoryItem {
  workId: string;
  title: string;
  description: string;
  labels: string[];
}

export interface ZhihuStoryDetail {
  workId: string;
  chapterName: string;
  authorName: string;
  introduction: string;
  content: string;
  /** 知乎站内阅读页 */
  sourceUrl: string;
}

export type VoiceKind = 'story' | 'knowledge';
/** 结算页「过来人的话」：知乎真实回答的原样摘录，一字不改 */
export interface Encouragement {
  author: string;
  quote: string;
  title: string;
  sourceUrl: string;
  voteCount: number;
  matchedQuery: string;
  debug?: { score: number; reason: string; verbatim: boolean };
}

/** 这一局的动作画像：服务端按它决定去搜什么 */
export interface EncouragementQuery {
  trouble: string;
  keywords?: string[];
  /** 拥抱过几个知乎声音 */
  hugged?: number;
  /** 各类动作的次数 */
  actions?: Record<string, number>;
  stats?: Record<string, number>;
}

/** 知乎登录的配置与登录态，由服务端 /api/auth/status 提供 */
export interface AuthStatus {
  /** 三个 ZHIHU_OAUTH_* 环境变量是否齐全；false 时 /api/auth/zhihu/login 一定返回 503 */
  configured: boolean;
  loggedIn: boolean;
  profile?: { id: string; name: string; avatarUrl?: string; headline?: string };
}

/** 一个声音 = 一条知乎真实内容。正文、作者、来源都由服务端从知乎接口取回，前端只展示。 */
export interface ZhihuVoice {
  kind: VoiceKind;
  workId: string;
  title: string;
  author: string;
  /** 知乎正文的原样摘录 */
  excerpt: string;
  /** 知乎正文（用于剧情改编，仍是原文） */
  body: string;
  /** 来源署名：知乎盐言故事 / 知乎知识 · 作者《标题》 */
  sourceLabel: string;
  /** 真实标签或内容类型，例如「盐言故事 · 言情 · 甜宠」 */
  role: string;
  /** 这条内容在知乎的真实地址 */
  sourceUrl: string;
  /** search = 开放平台搜索返回的官方链接；work = 由 work_id 还原的站内页 */
  sourceVia: 'search' | 'work';
  /** 知乎上的真实赞同数；0 表示接口没返回 */
  voteCount: number;
  /** 搜索命中的标题；与 title 不同时说明链接是同主题的另一条知乎内容 */
  matchedTitle: string;
}

export class ApiClient {
  private baseUrl: string;
  private timeoutMs: number;
  private cache = new Map<string, { time: number; value: unknown }>();

  constructor(baseUrl = '/api', timeoutMs = 6000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  private async get<T>(path: string, timeoutMs = this.timeoutMs): Promise<T | null> {
    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.time < 300000) return cached.value as T;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal });
      if (!resp.ok) return null;
      const value = await resp.json() as T;
      this.cache.set(path, { time: Date.now(), value });
      return value;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async post<T>(path: string, body: unknown, timeoutMs = this.timeoutMs): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!resp.ok) return null;
      return (await resp.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 拉取真实烦恼（知乎知识列表） */
  async fetchKnowledge(): Promise<ZhihuKnowledgeItem[]> {
    const data = await this.get<{ items: ZhihuKnowledgeItem[] }>(`/zhihu/knowledge?t=${Date.now()}`);
    return data?.items ?? [];
  }

  /** 拉取真实故事（盐言故事列表） */
  async fetchStories(): Promise<ZhihuStoryItem[]> {
    const data = await this.get<{ items: ZhihuStoryItem[] }>(`/zhihu/stories?t=${Date.now()}`);
    return data?.items ?? [];
  }

  /** 拉取故事正文 */
  async fetchStoryDetail(workId: string): Promise<ZhihuStoryDetail | null> {
    return this.get<ZhihuStoryDetail>(`/zhihu/story/${encodeURIComponent(workId)}`);
  }

  /**
   * 拉取这一页的三个声音（知乎真实内容）。
   * 匹配在服务端完成，失败时返回空数组，由界面如实提示，不用本地文案顶替。
   *
   * 空结果不进缓存：接口成功但一条都没匹配上时，页面会显示「暂时连不上知乎内容」，
   * 玩家点「重新加载」必须真的重新请求；缓存空结果会让这个按钮在 5 分钟内一直白按。
   */
  async fetchVoices(trouble: string, keywords: string[] = []): Promise<ZhihuVoice[]> {
    const query = new URLSearchParams({ trouble, keywords: keywords.join(',') });
    const path = `/zhihu/voices?${query.toString()}`;
    const data = await this.get<{ items: ZhihuVoice[] }>(path, 25000);
    const items = data?.items ?? [];
    if (items.length === 0) this.cache.delete(path);
    return items;
  }
  /**
   * 拉取结算页的「过来人的话」。
   * 服务端按这一局的动作画像去检索知乎真实回答，空结果同样不进缓存。
   */
  async fetchEncouragements(query: EncouragementQuery): Promise<Encouragement[]> {
    const params = new URLSearchParams({
      trouble: query.trouble,
      keywords: (query.keywords ?? []).join(','),
      hugged: String(query.hugged ?? 0),
      actions: compactCounts(query.actions),
      stats: compactCounts(query.stats)
    });
    const path = `/encouragements?${params.toString()}`;
    const data = await this.get<{ items: Encouragement[] }>(path, 9000);
    const items = data?.items ?? [];
    if (items.length === 0) this.cache.delete(path);
    return items;
  }

  /**
   * DeepSeek 生成剧情。服务端要等模型把三幕写完（实测 8~20 秒），
   * 所以这里不能用默认的 6 秒超时，否则每次都会被掐断而永远走本地剧情。
   */
  async generateStory(trouble: string, sampleText: string): Promise<Record<string, unknown> | null> {
    return this.post<Record<string, unknown>>(
      '/story/generate',
      {
        trouble,
        samples: [{ title: '', authorName: '知乎用户', voteUpCount: 0, contentText: sampleText }]
      },
      45000
    );
  }

  /**
   * 查询知乎登录状态。返回 null 表示查不到（服务端没起、超时等），
   * 调用方应当按「未配置」处理——宁可少显示一个登录入口，也不要摆一个点了必然报错的入口。
   *
   * 超时给得短：这是首屏的一个装饰性判断，不该拖慢任何东西。
   * 带 ?t= 是为了绕开 get() 里 5 分钟的缓存——登录态是会变的。
   */
  async fetchAuthStatus(): Promise<AuthStatus | null> {
    return this.get<AuthStatus>(`/auth/status?t=${Date.now()}`, 4000);
  }
}

/** 把 { slash: 3, nod: 1 } 压成 `slash:3,nod:1`，避免 URL 里塞一长串 JSON */
function compactCounts(value: Record<string, number> | undefined): string {
  if (!value) return '';
  return Object.entries(value)
    .filter(([, n]) => Number.isFinite(n) && n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(',');
}
