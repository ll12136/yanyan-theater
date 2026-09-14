// 真实接口验收：不 mock，直接走 5174 的 Vite 代理 + 3000 的服务端，
// 确认这一页展示的内容都来自知乎真实接口（作者、标题、正文摘录、署名可逐条对上），
// 头像用的是刘看山动态素材，且不再出现任何本地虚构角色或「原创/非真实」标注。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const TROUBLE='考研还是工作，怎么选都很焦虑';
const KEYWORDS='考研,选择,焦虑';

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://localhost:5174');await p.waitForTimeout(900);
await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(500);
await p.keyboard.press('d',{delay:100});await p.waitForTimeout(300);          // 选到「考研还是工作」
await p.keyboard.press('j',{delay:100});await p.waitForTimeout(600);          // 心事实体化
await p.keyboard.press('j',{delay:100});                                      // 挥剑 → 取知乎内容
await p.locator('.companions').waitFor({timeout:30000});
const shown=await p.locator('.companions').innerText();
const stage=()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);const out=[];function visit(items){for(const o of items){if(o.type==='Text')out.push(o.text);if(o.list)visit(o.list);}}visit(game.scene.getScene('TroubleScene').children.list);return out.join('\n');});
const stageText=await stage();

assert.match(stageText,/不是一个人，听听他们怎么说/,'应进入三个声音页');
assert.equal(/原创陪伴角色|非真实用户回答|情节化表达/.test(shown+stageText),false,'不得再出现原创/非真实标注');
assert.equal(/苏叶|小禾|阿晴|林舟|沈星/.test(shown+stageText),false,'不得再出现本地虚构角色名');

const payload=await p.evaluate(async({trouble,keywords})=>{const r=await fetch(`/api/zhihu/voices?trouble=${encodeURIComponent(trouble)}&keywords=${encodeURIComponent(keywords)}`);return r.json();},{trouble:TROUBLE,keywords:KEYWORDS});
assert.ok(payload.items.length>=1,`知乎接口应返回至少一条内容，实际 ${payload.items.length} 条`);
for(const v of payload.items){
  assert.ok(v.author && v.author!=='知乎作者',`作者应来自知乎接口：${v.title}`);
  assert.match(v.sourceLabel,/知乎(盐言故事|知识) · /,'来源署名应为知乎内容');
  assert.ok(v.body.length>0,'正文不得为空');
  assert.ok(v.body.replace(/\s+/g,' ').startsWith(v.excerpt.replace(/…$/,'').trim()),'摘录必须是知乎正文的原样片段');
  assert.ok(shown.includes(v.author),`页面应署真实作者名：${v.author}`);
  assert.ok(shown.includes(v.role),`页面应展示真实标签：${v.role}`);
}
// 气泡一次只显示一个声音，默认是第一条
assert.ok(shown.includes(payload.items[0].excerpt),'首屏应展示知乎正文摘录');
assert.ok(shown.includes(payload.items[0].sourceLabel),'首屏应展示来源署名');
assert.match(stageText,new RegExp(`${payload.items.length} 个来自知乎的真实声音`),'副标题与真实数量一致');
assert.equal(await p.locator('.comp-person').count(),payload.items.length,'讲述者数量应与接口一致');
const avatars=await p.locator('.comp-avatar').evaluateAll(els=>els.map(e=>getComputedStyle(e).backgroundImage));
assert.ok(avatars.every(s=>/kanshan-(greet|idle|desk)\.png/.test(s)),'头像应使用刘看山动态素材');
await p.screenshot({path:'test/voices-check.png'});

// 走进故事：即使模型不可用，剧情也要能进入并可玩（素材已换成上面这些知乎原文）
await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(2500);
const story=await p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);const s=game.scene.getScene('StoryScene');if(!game.scene.isActive('StoryScene'))return null;return {title:s.title,scenes:s.sceneNodes.length};});
assert.ok(story && story.scenes>0,'应进入 StoryScene 并有可玩场景');
console.log(`PASS 真实接口：${payload.items.length} 个声音，全部为知乎内容，头像为刘看山动态；进入故事《${story.title}》（${story.scenes} 幕）`);
for(const v of payload.items) console.log(`  - ${v.sourceLabel}`);
assert.deepEqual(errors,[]);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
