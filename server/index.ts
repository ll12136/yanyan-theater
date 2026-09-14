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

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

// 健康检查
app.get('/api/health', async () => {
  return {
    ok: true,
    zhihuConfigured: Boolean(process.env.ZHIHU_ACCESS_SECRET),
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY)
  };
});

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
