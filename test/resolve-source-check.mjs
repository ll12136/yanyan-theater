// 验收「知乎原文地址」的解析逻辑（server/zhihu.ts 的 resolveContentSource）。
//
// 这条分支在没配 ZHIHU_ACCESS_SECRET 的本机环境里走不到（会直接回落站内页），
// 所以这里把上游 zhihu_search 的响应换成固定数据，直接跑真实模块代码：
//   1. 搜索结果里有同一条内容 → 用知乎官方返回的 Url 与真实赞同数；
//   2. 只有不相关的帖子 → 如实回落到 work_id 还原的站内页，赞同数必须是 0；
//   3. 标题过短 → 不做模糊匹配；
//   4. 同一 work_id 第二次调用命中缓存，不重复消耗搜索额度。
//
// 自包含：用 typescript 的 transpileModule 现场转译，不依赖 tsx/esbuild，也不需要预先编译。
// 运行：node test/resolve-source-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, '..', 'server');

// zhihu.ts 不 import 其它本地模块，单独转译即可
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-source-check-'));
const outFile = path.join(outDir, 'zhihu.mjs');
fs.writeFileSync(
  outFile,
  ts.transpileModule(fs.readFileSync(path.join(serverDir, 'zhihu.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText
);

// Access Secret 必须在 import 之前设好：模块加载时就会读取它
process.env.ZHIHU_ACCESS_SECRET = 'test-secret';

const STORY_ID = '2050600604976803918';
const STORY_TITLE = '不提分就出不去的房间';
const OFFICIAL_URL = `https://www.zhihu.com/story/${STORY_ID}?utm_medium=openapi_platform&utm_source=abcdef123456`;

let searchCalls = 0;
let lastQuery = '';
let payload = [];

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('zhihu_search')) return realFetch(url, opts);
  searchCalls += 1;
  lastQuery = new URL(u).searchParams.get('Query') ?? '';
  return new Response(
    JSON.stringify({ Code: 0, Message: 'success', Data: { HasMore: false, SearchHashId: 'x', Items: payload() } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

const { resolveContentSource, zhihuWorkUrl } = await import(pathToFileURL(outFile).href);

// 1. 搜索结果里有同一条内容 → 用官方 Url 与真实赞同数
payload = () => [
  {
    Title: '一个完全不相干的帖子', ContentType: 'Answer', ContentID: '1', ContentText: '无关',
    Url: 'https://www.zhihu.com/question/1/answer/2', VoteUpCount: 9, AuthorName: '路人', AuthorityLevel: '1'
  },
  {
    Title: STORY_TITLE, ContentType: 'Story', ContentID: STORY_ID, ContentText: '摘录',
    Url: OFFICIAL_URL, VoteUpCount: 3456, AuthorName: '灯灯', AuthorityLevel: '2'
  }
];

const hit = await resolveContentSource(STORY_TITLE, STORY_ID);
assert.equal(hit.via, 'search', '命中时应走开放平台搜索返回的官方链接');
assert.equal(hit.url, OFFICIAL_URL, '应原样使用知乎返回的 Url（含溯源 UTM）');
assert.equal(hit.voteUpCount, 3456, '应带上真实赞同数，而不是 0');
assert.equal(hit.matchedTitle, STORY_TITLE);
assert.equal(searchCalls, 1, '应发起一次搜索');
assert.equal(lastQuery, STORY_TITLE, '搜索词应为内容标题');

// 4. 缓存：同一 work_id 再问一次不应再消耗额度
const cached = await resolveContentSource(STORY_TITLE, STORY_ID);
assert.equal(cached.url, OFFICIAL_URL);
assert.equal(searchCalls, 1, '第二次应命中缓存，不再调用搜索');

// 2. 搜索结果都不相关 → 如实回落到 work_id 还原的站内页
payload = () => [
  {
    Title: '另一个标题完全不同的回答', ContentType: 'Answer', ContentID: '7', ContentText: '无关',
    Url: 'https://www.zhihu.com/question/7/answer/8', VoteUpCount: 100, AuthorName: '某人', AuthorityLevel: '1'
  }
];

const miss = await resolveContentSource('一篇知乎上搜不到的内容', '9999999999999999999');
assert.equal(miss.via, 'work', '搜不到时应回落到 work_id 还原的站内页');
assert.equal(miss.url, zhihuWorkUrl('9999999999999999999'));
assert.equal(miss.voteUpCount, 0, '没有真实赞同数时必须是 0，不能编造');
assert.equal(miss.matchedTitle, '');

// 3. 标题过短 → 不做模糊匹配
assert.equal((await resolveContentSource('短文', '123')).via, 'work');

fs.rmSync(outDir, { recursive: true, force: true });

console.log('PASS resolveContentSource');
console.log(`  搜索命中 : ${hit.url}`);
console.log(`  赞同数   : ${hit.voteUpCount}`);
console.log(`  回落     : ${miss.url}`);
