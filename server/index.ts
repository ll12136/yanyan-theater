// 必须排在所有读 process.env 的模块之前：zhihu.js 在模块顶层就读 env 成常量了。
import './env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import {
  zhihuSearch,
  zhidaChat,
  deepseekGenerate,
  zhihuStoryList,
  zhihuKnowledgeList,
  zhihuStoryDetail,
  ZhihuSearchItem
} from './zhihu.js';
import { buildVoices } from './voices.js';
import { buildEncouragements } from './encouragements.js';
import crypto from 'node:crypto';

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });
type ZhihuProfile = { id: string; name: string; avatarUrl?: string; headline?: string };
type Session = { profile: ZhihuProfile; expiresAt: number };
const oauthStates = new Map<string, number>();
const sessions = new Map<string, Session>();
const SESSION_COOKIE = 'kanshan_session';

// 健康检查
app.get('/api/health', async () => {
  return {
    ok: true,
    zhihuConfigured: Boolean(process.env.ZHIHU_ACCESS_SECRET),
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY)
  };
});

// OAuth 配置状态：前端据此决定是否显示登录入口，不伪造“已登录”。
app.get('/api/auth/status', async (req) => {
  const sid = readCookie(req.headers.cookie, SESSION_COOKIE); const session = sid ? sessions.get(sid) : undefined;
  if (session && session.expiresAt > Date.now()) return { configured: true, loggedIn: true, profile: session.profile };
  return { configured: Boolean(process.env.ZHIHU_OAUTH_APP_ID && process.env.ZHIHU_OAUTH_APP_KEY && process.env.ZHIHU_OAUTH_REDIRECT_URI), loggedIn: false };
});
app.get('/api/auth/zhihu/login', async (_req, reply) => {
  const { ZHIHU_OAUTH_APP_ID, ZHIHU_OAUTH_REDIRECT_URI } = process.env;
  if (!ZHIHU_OAUTH_APP_ID || !process.env.ZHIHU_OAUTH_APP_KEY || !ZHIHU_OAUTH_REDIRECT_URI) return reply.code(503).send({ error: '知乎登录尚未配置，请设置 OAuth 环境变量' });
  const state = crypto.randomUUID();
  oauthStates.set(state, Date.now() + 10 * 60_000);
  const url = new URL('https://openapi.zhihu.com/authorize');
  url.searchParams.set('app_id', ZHIHU_OAUTH_APP_ID); url.searchParams.set('response_type', 'code'); url.searchParams.set('redirect_uri', ZHIHU_OAUTH_REDIRECT_URI); url.searchParams.set('state', state);
  return reply.header('set-cookie', `kanshan_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`).redirect(url.toString());
});
const oauthCallback = async (req: Parameters<typeof app.get>[1] extends never ? never : any, reply: any) => {
  // 回调里的授权码参数名是 authorization_code（官方 references/hackathon-oauth.md 与 oauth.md 都写明），
  // 不是通用 OAuth2 的 code。文档允许接收端同时接受两者以防协议修订，这里就都收。
  const { authorization_code: authCode, code: codeAlias, state, error } = req.query as {
    authorization_code?: string; code?: string; state?: string; error?: string;
  };
  const code = authCode ?? codeAlias;
  const cookieState = readCookie(req.headers.cookie, 'kanshan_oauth_state');
  const valid = Boolean(state && cookieState === state && oauthStates.get(state) && (oauthStates.get(state) as number) > Date.now());
  if (state) oauthStates.delete(state);
  if (!valid || error || !code) return reply.code(400).type('text/html').send('<h1>知乎登录未完成</h1><p>授权已过期或校验失败，请返回游戏重试。</p>');
  // 失败时按阶段给脱敏诊断（官方 references/deployment-credentials.md 的要求）：线上只看到一个笼统的
  // 502 时，根本分不清是换 token 挂了还是取用户资料挂了。
  let stage = 'token_exchange';
  let upstream = '';
  try {
    // 官方协议见 references/oauth.md「换取 Access Token」：
    //   POST https://openapi.zhihu.com/access_token
    //   表单 app_id / app_key / grant_type=authorization_code / redirect_uri / code
    // 字段名是 code——文档专门强调过不要把表单字段改名成 authorization_code。
    // 这里原来打的是 /oauth/token 且用 client_id/client_secret，那是通用 OAuth2 的写法，知乎不认。
    const form = new URLSearchParams({
      app_id: process.env.ZHIHU_OAUTH_APP_ID!,
      app_key: process.env.ZHIHU_OAUTH_APP_KEY!,
      grant_type: 'authorization_code',
      redirect_uri: process.env.ZHIHU_OAUTH_REDIRECT_URI!,
      code
    });
    const tokenRes = await fetch('https://openapi.zhihu.com/access_token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    // 知乎的业务错误是 HTTP 200 + 响应体里的 code，所以不能只看 tokenRes.ok：
    // 必须把原始响应体留下来，否则失败时只知道「没有 access_token」，不知道知乎为什么拒绝。
    const tokenText = await tokenRes.text();
    let token: { access_token?: string } = {};
    try { token = JSON.parse(tokenText) as { access_token?: string }; } catch { /* 非 JSON 时下面按缺 access_token 处理 */ }
    if (!tokenRes.ok || !token.access_token) {
      upstream = `HTTP ${tokenRes.status} ${tokenText.slice(0, 200) || '(空响应)'}`;
      throw new Error('token_exchange');
    }
    stage = 'user_profile';
    const profileRes = await fetch('https://openapi.zhihu.com/user', { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!profileRes.ok) { upstream = `HTTP ${profileRes.status}`; throw new Error('user_profile'); }
    const raw = await profileRes.json() as Record<string, unknown>;
    const profile: ZhihuProfile = { id: String(raw.id ?? raw.url_token ?? ''), name: String(raw.name ?? '知乎用户'), avatarUrl: typeof raw.avatar_url === 'string' ? raw.avatar_url : undefined, headline: typeof raw.headline === 'string' ? raw.headline : undefined };
    const sid = crypto.randomBytes(32).toString('hex'); sessions.set(sid, { profile, expiresAt: Date.now() + 7 * 24 * 60 * 60_000 });
    return reply.header('set-cookie', [`${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`, 'kanshan_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0']).redirect('/');
  } catch { return reply.code(502).type('text/html').send(oauthFailurePage(stage, upstream)); }
};
app.get('/auth/callback', oauthCallback);
app.get('/api/auth/zhihu/callback', oauthCallback);

/**
 * 换 token / 取资料失败时的页面。
 * 按官方 references/deployment-credentials.md 的要求给出脱敏诊断：说清失败阶段与凭证来源，
 * 但绝不输出 App Key、Access Secret、authorization_code 或 access_token 的完整值。
 */
function oauthFailurePage(stage: string, upstream: string): string {
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY ?? '';
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
  const rows: [string, string][] = [
    ['失败阶段', stage === 'user_profile' ? '取用户资料 /user' : '换取 access_token /access_token'],
    ['app_id', process.env.ZHIHU_OAUTH_APP_ID || '(未配置)'],
    ['app_key', appKey ? `长度 ${appKey.length}，sha256 前缀 ${crypto.createHash('sha256').update(appKey).digest('hex').slice(0, 8)}` : '(未配置)'],
    ['redirect_uri', process.env.ZHIHU_OAUTH_REDIRECT_URI || '(未配置)'],
    ['上游返回', upstream || '(无)']
  ];
  const body = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  return `<h1>知乎登录暂时失败</h1><p>没有获取到公开资料，请稍后重试。</p><table>${body}</table>`;
}
app.post('/api/auth/logout', async (req, reply) => { const sid = readCookie(req.headers.cookie, SESSION_COOKIE); if (sid) sessions.delete(sid); return reply.header('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`).send({ ok: true }); });

function readCookie(header: string | undefined, key: string): string | undefined {
  return header?.split(';').map(v => v.trim()).find(v => v.startsWith(`${key}=`))?.slice(key.length + 1);
}

// 知乎故事列表（盐言故事，无需鉴权）
app.get('/api/zhihu/stories', async () => {
  const items = await zhihuStoryList();
  return { items };
});

// 知乎知识列表（烦恼主题内容，无需鉴权）
app.get('/api/zhihu/knowledge', async () => {
  const items = await zhihuKnowledgeList();
  return { items };
});

// 知乎故事详情（正文，无需鉴权）
app.get('/api/zhihu/story/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const detail = await zhihuStoryDetail(id);
  if (!detail) return reply.code(404).send({ error: 'story not found' });
  return detail;
});

// 三个声音：按心事挑选知乎真实内容（盐言故事 + 知乎知识），只做挑选与摘录，不生成正文
app.get('/api/zhihu/voices', async (req) => {
  const { trouble = '', keywords = '' } = req.query as { trouble?: string; keywords?: string };
  if (trouble.trim().length === 0) return { items: [] };
  const words = keywords.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 8);
  // 心事文本会进模型提示词，截断一下，别让超长字符串把提示词撑爆
  const items = await buildVoices(trouble.slice(0, 120), words);
  return { items };
});
// 过来人的话：按这一局的动作画像去检索知乎真实回答，只挑选与摘录。
// 注意这里走的是 zhihuSearch（真实回答），不是 voices 那条盐言故事候选池——那是小说台词。
app.get('/api/encouragements', async (req) => {
  const { trouble = '', keywords = '', hugged = '', actions = '', stats = '' } = req.query as Record<string, string>;
  if (!trouble.trim()) return { items: [], via: 'unavailable' };
  const items = await buildEncouragements({
    trouble: trouble.slice(0, 120),
    keywords: keywords.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 8),
    hugged: Number.parseInt(hugged, 10) || 0,
    actions: parseCounts(actions),
    stats: parseCounts(stats)
  });
  return { items, via: items.length ? 'zhihu_search' : 'unavailable' };
});

/** 解析 `slash:3,nod:1` 这种紧凑计数串 */
function parseCounts(value: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of value.split(',')) {
    const [k, v] = pair.split(':');
    if (!k || !k.trim()) continue;
    const n = Number.parseInt(v ?? '', 10);
    if (Number.isFinite(n)) out[k.trim()] = n;
  }
  return out;
}

// 搜索烦恼相关的人生样本（知乎搜索）
app.post('/api/troubles/search', async (req, reply) => {
  const { query, limit } = (req.body ?? {}) as { query?: string; limit?: number };
  if (!query || typeof query !== 'string') {
    return reply.code(400).send({ error: 'query required' });
  }
  const items = await zhihuSearch(query, Math.min(limit ?? 5, 10));
  if (items.length === 0) {
    return reply.code(503).send({ error: 'zhihu unavailable', items: [] });
  }
  return { items: items.map(toSample) };
});

// 获取人生样本（同搜索，语义化别名）
app.post('/api/samples/search', async (req, reply) => {
  const { query, limit } = (req.body ?? {}) as { query?: string; limit?: number };
  if (!query || typeof query !== 'string') {
    return reply.code(400).send({ error: 'query required' });
  }
  const items = await zhihuSearch(query, Math.min(limit ?? 5, 10));
  if (items.length === 0) {
    return reply.code(503).send({ error: 'zhihu unavailable', items: [] });
  }
  return { items: items.map(toSample) };
});

// 生成剧情（DeepSeek 把知乎样本改编成互动剧情）
app.post('/api/story/generate', async (req, reply) => {
  const { trouble, samples } = (req.body ?? {}) as { trouble?: string; samples?: ZhihuSearchItem[] };
  if (!trouble || typeof trouble !== 'string') {
    return reply.code(400).send({ error: 'trouble required' });
  }
  const raw = await deepseekGenerate(buildStoryPrompt(trouble, samples ?? []));
  if (!raw) {
    return reply.code(503).send({ error: 'deepseek unavailable' });
  }
  const parsed = parseJson(raw);
  if (!parsed) {
    return reply.code(502).send({ error: 'invalid story json' });
  }
  return parsed;
});

function toSample(it: ZhihuSearchItem): Record<string, unknown> {
  return {
    title: it.title,
    summary: it.contentText.slice(0, 200),
    sourceUrl: it.url,
    author: it.authorName,
    voteCount: it.voteUpCount
  };
}

function buildStoryPrompt(trouble: string, samples: ZhihuSearchItem[]): string {
  const sampleText = samples
    .map((s) => `- 《${s.title}》(作者:${s.authorName}, ${s.voteUpCount}赞): ${s.contentText.slice(0, 150)}`)
    .join('\n');
  return [
    '你是助眠互动叙事游戏《看山问你，睡了吗？》的剧情生成器。',
    `玩家今晚睡不着，压着他的事是：「${trouble}」。`,
    '以下是来自知乎的真实内容（前人的经历与办法）：',
    sampleText || '(无样本，请围绕睡不着这件事自由发挥)',
    '',
    '请把样本改编成一段温柔的互动剧情，严格只输出一个 JSON 对象（不要 markdown 代码块）：',
    '{"title":"四字标题","opening":"开场一句话","scenes":[{"id":"scene-1","text":"场景描述(60字内)","action":"nod|hug|slash|dodge|investigate","options":[{"label":"选项A","effect":{"courage":0,"acceptance":0,"empathy":0}},{"label":"选项B","effect":{"courage":0,"acceptance":0,"empathy":0}}]}]}',
    '',
    '要求：3 个场景；action 从 nod/hug/slash/dodge/investigate 选；effect 只含 courage/acceptance/empathy，数值 1-2；',
    '每一幕都给两条路，方向固定：选项 A 是「先缓解一点压力」（慢慢呼吸、松开肩膀、把明天的事写下来、允许自己停下来），选项 B 是「让身体动一动」（起身走两步、拉伸肩颈、下楼走走、动一动再躺回来）。',
    '内容温暖、不评判、不催睡，不说「你必须」「你应该」；',
    '不要做医疗诊断，不推荐任何药物、保健品或治疗方案；睡不着持续很久就平和地建议去看医生；',
    '不要复制样本原文，改为虚构角色。'
  ].join('\n');
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof obj !== 'object' || obj === null) return null;
    return obj;
  } catch {
    return null;
  }
}

// ============ 线上部署：一个进程同时发前端与 /api ============
// 黑客松要的是一个「点开就能玩」的地址。静态前端（vite build 出来的 dist/）和这里的
// 知乎内容 / DeepSeek 代理必须挂在同一个域名下，否则前端那些 /api 请求会全部打空、
// 整站降级成本地剧情。所以部署时不要再分成两个服务。
// 这一段用 node:fs 手写，不额外引入 @fastify/static：少一个依赖少一处部署坑。
const DIST_DIR = new URL('../dist/', import.meta.url);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

app.get('/*', async (req, reply) => {
  const url = (req.raw.url ?? '/').split('?')[0];
  if (url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });

  const rel = decodeURIComponent(url).replace(/^\/+/, '');
  const target = new URL(rel === '' ? 'index.html' : rel, DIST_DIR);
  // URL 会把 .. 归一化掉，所以这里再确认一次没跑出 dist 目录
  if (!target.href.startsWith(DIST_DIR.href)) return reply.code(403).send({ error: 'forbidden' });

  try {
    const body = await readFile(target);
    return reply.type(MIME[extname(target.pathname).toLowerCase()] ?? 'application/octet-stream').send(body);
  } catch {
    // 单页应用：路径对不上文件就交回 index.html（这一版整个游戏都在 canvas 里，没有前端路由）
    try {
      return reply.type(MIME['.html']).send(await readFile(new URL('index.html', DIST_DIR)));
    } catch {
      return reply
        .code(404)
        .type(MIME['.html'])
        .send('<h1>前端还没构建</h1><p>先在仓库根目录跑 <code>npm run build</code>，再启动这个服务。</p>');
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`[server] listening on http://localhost:${port}`);
