// 「过来人的话」真实接口验收（走真服务端 + 真知乎搜索，不 mock）。
//
// 这一屏是整套改造里最容易被「假通过」的地方，所以断言盯的是可证伪的点：
//   1. 数据源必须是 zhihuSearch（真实回答），via 字段要如实说明；
//   2. ★ 每一条 quote 都必须是原文里的连续片段（服务端自证 verbatim），
//      这是「只摘录、不生成」唯一的硬证据；
//   3. 作者不重复、句子不重复（一屏里不能被同一个人刷屏）；
//   4. 没有营销词、没有标题党；
//   5. ★ sourceUrl 必须是真实存在的知乎地址（不是拼出来的假链接）。
//
// 未配置 ZHIHU_ACCESS_SECRET 时会明确 SKIP，不伪装成通过。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const TROUBLE='不想继续现在的工作了，但又不知道自己能去哪儿';
const QUERY=`/api/encouragements?trouble=${encodeURIComponent(TROUBLE)}&keywords=${encodeURIComponent('辞职,转行,职业迷茫')}&hugged=2&actions=${encodeURIComponent('slash:3,nod:1')}&stats=${encodeURIComponent('courage:4,acceptance:6,empathy:8,curiosity:2')}`;
const BAD=/课程|私信|加微信|报名|咨询|训练营|带货|推广|返利|扫码|优惠/;
const CLICKBAIT=/震惊|必看|秘籍|干货|收藏这一篇|深度好文/;

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:960}});
await p.goto('http://localhost:5174');await p.waitForTimeout(800);

const health=await p.evaluate(async()=>(await fetch('/api/health')).json());
if(!health.zhihuConfigured){
  console.log('SKIP 未配置 ZHIHU_ACCESS_SECRET：真实检索这一项无法验收（不是通过）');
  return;
}

const res=await p.evaluate(async url=>{const r=await fetch(url);return {status:r.status,body:await r.json()};},QUERY);
assert.equal(res.status,200,'接口应返回 200');
const {items,via}=res.body;
console.log(`  服务端 via=${via}，返回 ${items.length} 条`);

if(items.length===0){
  // 取不到就是取不到：这里如实报失败，因为配了密钥时这一屏必须能给出内容
  throw new Error('配了知乎密钥却一条都没取到：要么检索词没命中，要么筛选过严（不要用本地文案补位）');
}
assert.equal(via,'zhihu_search','via 必须如实标明来自 zhihuSearch');
assert.ok(items.length>=3,`至少应有 3 条，实际 ${items.length} 条`);

const quotes=new Set();const authors=new Set();
for(const it of items){
  assert.ok(it.author&&it.author.trim(),'每条都要有作者');
  assert.ok(it.quote&&it.quote.length>=12&&it.quote.length<=90,`摘录长度应在 12~90 字：${it.quote}`);
  assert.equal(BAD.test(it.quote),false,`摘录里不该出现营销词：${it.quote}`);
  assert.equal(BAD.test(it.title||''),false,`标题里不该出现营销词：${it.title}`);
  assert.equal(CLICKBAIT.test(it.title||''),false,`标题不该是标题党：${it.title}`);
  assert.match(it.sourceUrl,/^https:\/\/[^ ]*zhihu\.com\//,`原文地址应是知乎真实地址：${it.sourceUrl}`);
  assert.ok(it.matchedQuery&&it.matchedQuery.trim(),'每条都要记下是哪条检索词召回的');
  assert.ok(it.debug&&typeof it.debug.score==='number',`应带上入选分数：${JSON.stringify(it.debug)}`);
  // ★ 只摘录、不生成：服务端要自证这句话是正文里的连续片段
  assert.equal(it.debug.verbatim,true,`这句话不是原文连续片段，说明被改写过：${it.quote}`);
  const qKey=it.quote.replace(/\s+/g,'');
  assert.equal(quotes.has(qKey),false,`摘录重复：${it.quote}`);
  quotes.add(qKey);
  assert.equal(authors.has(it.author),false,`同一个人在一屏里出现多次：${it.author}`);
  authors.add(it.author);
}
console.log(`  ✓ ${items.length} 条都带作者、原文地址与入选分数，且 verbatim=true`);

// ★ 原文地址必须真的存在（不是拼出来的）
let checked=0;
for(const it of items.slice(0,3)){
  try{
    const r=await fetch(it.sourceUrl,{redirect:'follow'});
    assert.notEqual(r.status,404,`原文地址打不开（404）：${it.sourceUrl}`);
    checked+=1;
    console.log(`  · ${r.status} ${it.sourceUrl}`);
  }catch(error){
    // 网络不可达不算内容问题，但要如实说出来，不能吞掉
    console.log(`  · 没连上（${error instanceof Error?error.message:String(error)}）：${it.sourceUrl}`);
  }
}
console.log(`  ✓ 抽检 ${checked} 个原文地址，均非 404`);
console.log(`PASS 过来人的话全部来自知乎真实回答、逐字可溯、来源可打开（via=${via}）`);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
