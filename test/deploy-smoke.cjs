// 生产构建（dist/ + 同一个进程里的 /api）冒烟：模拟评委的用法，直接打开线上那一个地址。
// 用法：node test/deploy-smoke.cjs [baseUrl]   默认 http://localhost:3100
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.argv[2]||'http://localhost:3100';

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:960,height:640}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
const texts=async()=>p.evaluate(()=>{const g=window.__game;const out=[];
  for(const s of g.scene.getScenes(true)){const visit=l=>{for(const o of l){if(o.type==='Text'&&o.text)out.push(o.text);if(o.list)visit(o.list);}};visit(s.children.list);}
  return {scene:g.scene.getScenes(true).map(s=>s.scene.key).join(','),texts:out};});

await p.goto(base+'/');await p.waitForTimeout(1500);
let s=await texts();
assert.equal(s.scene,'MenuScene','线上地址应直接进首页');
assert.ok(s.texts.some(t=>t.includes('看山问你，睡了吗？')),'首页应有产品名');
console.log('  ✓ 首页在线上地址打开正常（生产包，不是 dev server）');

await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(1800);
s=await texts();
assert.equal(s.scene,'TroubleScene','应进入今晚的心事页');
assert.ok(s.texts.some(t=>t.includes('今晚，是什么让你还没睡着？')),'心事页标题');
console.log('  ✓ 进入今晚的心事页');

// 走真实内容那一段：这一步会打 /api/zhihu/voices —— 它证明静态前端与后端在同一个域名下
// 线上是冷启动，知乎内容列表要等一会儿才回来；列表没到就点「放下」只会提示「请稍候」
for(let i=0;i<40;i++){
  const n=await p.evaluate(()=>window.__game.scene.getScene('TroubleScene').troubleList.length);
  if(n>0)break;
  await p.waitForTimeout(500);
}
await p.mouse.click(480,556);await p.waitForTimeout(900);
await p.keyboard.press('j',{delay:100});
await p.locator('.companions').waitFor({timeout:40000});
const first=await p.evaluate(()=>({trouble:document.querySelector('.comp-reading h2')?.textContent??'',lines:document.querySelectorAll('.comp-person').length}));
console.log(`  ✓ /api 同源可用：拿到 ${first.lines} 条知乎真实内容，首条《${first.trouble.slice(0,22)}》`);

await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(2600);
s=await texts();
assert.ok(s.texts.some(t=>/放松 0 · 接纳 0 · 陪伴 0/.test(t)),'剧情页状态条');
assert.ok(s.texts.some(t=>t.includes('选一条路，再往下走')),'剧情页应有两段式选择的确认键');
console.log('  ✓ 走进故事：两段式选择在位');

// 选一条路 + 确认，确认换幕真的能走
for(let i=0;i<70;i++){
  const d=await p.evaluate(()=>{const sc=window.__game.scene.getScene('StoryScene');return {now:sc.time.now,lock:sc.inputLockUntil,pending:sc.aiPending};});
  if(!d.pending&&d.now>d.lock+300)break;
  await p.waitForTimeout(500);
}
await p.keyboard.press('ArrowLeft',{delay:80});await p.waitForTimeout(500);
await p.keyboard.press('Enter',{delay:80});await p.waitForTimeout(2800);
const idx=await p.evaluate(()=>window.__game.scene.getScene('StoryScene').sceneIndex);
assert.equal(idx,1,'选中并确认后应进入第二幕');
await p.screenshot({path:'test/deploy-smoke.png'});
console.log('  ✓ 选中 + 确认 → 第二幕');

assert.deepEqual(errors,[]);
console.log(`PASS 生产包在 ${base} 上可完整上手（同源 /api、两段式选择、无浏览器异常）`);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
