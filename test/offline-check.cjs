// 知乎内容取不回来时的验收：这一页必须如实提示，不得用本地虚构故事/角色顶替，也不放行进入故事。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"items":[]}'}));
await p.goto('http://localhost:5174');await p.waitForTimeout(1000);
for(const key of ['Enter','j','j']){await p.keyboard.press(key,{delay:100});await p.waitForTimeout(700);}
const read=()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);const s=game.scene.getScene('TroubleScene');const out=[];function visit(items){for(const o of items){if(o.type==='Text')out.push(o.text);if(o.list)visit(o.list);}}visit(s.children.list);return {phase:s.phase,text:out.join('\n')};});
// 挥剑之后有一段「看山正在整理这份心事」的过场，要等它走完才看得到真实状态
let phase='loading';
for(let i=0;i<20 && phase==='loading';i++){await p.waitForTimeout(700);phase=(await read()).phase;}
const {text}=await read();
assert.equal(phase,'offline','取不到知乎内容应停在 offline');
assert.match(text,/暂时连不上知乎内容/,'应如实说明连不上');
assert.equal(/苏叶|小禾|阿晴|林舟|陈默|何雨|周航|沈星|原创陪伴角色|非真实用户回答|情节化表达/.test(text),false,'不得出现任何本地虚构内容或旧标注');
assert.equal(/走进这段故事/.test(text),false,'没有真实内容时不应放行进入故事');
await p.keyboard.press('j',{delay:100});await p.waitForTimeout(600);
assert.equal(await p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);return game.scene.isActive('StoryScene');}),false,'offline 状态按 J 不应进入故事');
await p.screenshot({path:'test/offline-check.png'});
assert.deepEqual(errors,[]);console.log('PASS 无网络时如实提示、不虚构内容、不放行进入故事');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
