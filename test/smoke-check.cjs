// 冒烟检查：专找「跑久了才会露出来」的问题
//   1. 知乎内容取不到 → 恢复后按 E 能重新加载（状态机不是单向的）
//   2. DOM 层不留残渣：面板进入故事后移除，弹层关掉后不残留
//   3. 弹层关掉后键盘/输入要恢复，不能一关就失灵
//   4. 改窗口大小时面板跟着画布缩放，不跑到画布外面
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const VOICES={items:[{kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'感觉心累、疲惫、抗拒工作。…',body:'你在工作中是否有过心累、疲惫的感受。',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''}]};

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1280,height:800}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
let serveVoices=false;
await p.route('**/api/**',r=>{
  const url=r.request().url();
  if(url.includes('/zhihu/voices')) return serveVoices
    ? r.fulfill({contentType:'application/json',body:JSON.stringify(VOICES)})
    : r.fulfill({contentType:'application/json',body:'{"items":[]}'});
  return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
});
const scenePhase=()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);return game.scene.getScene('TroubleScene').phase;});
const counts=()=>p.evaluate(()=>({panels:document.querySelectorAll('.companions').length,dialogs:document.querySelectorAll('dialog').length}));

await p.goto('http://localhost:5174/?harvest=off');await p.waitForTimeout(1200);

// 1. 取不到内容 → 停在 offline；服务恢复后按 E 应能重新加载
await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(600);
await p.keyboard.press('j',{delay:120});await p.waitForTimeout(800);   // 挥剑有 550ms 冷却，两次按键要拉开
await p.keyboard.press('j',{delay:120});
let phase='loading';
for(let i=0;i<20 && phase==='loading';i++){await p.waitForTimeout(700);phase=await scenePhase();}
assert.equal(phase,'offline','取不到内容时应在 offline');
serveVoices=true;
await p.keyboard.press('e',{delay:100});
await p.locator('.companions').waitFor({timeout:20000});
assert.equal(await scenePhase(),'sample','服务恢复后按 E 应能重新取回内容');
assert.deepEqual(await counts(),{panels:1,dialogs:0},'面板只应有一个');

// 4. 面板开着时改窗口大小，面板应跟着画布缩放并留在画布范围内
const rects=await p.evaluate(()=>{const c=document.querySelector('canvas').getBoundingClientRect();const r=document.querySelector('.companions').getBoundingClientRect();return {canvas:{x:c.x,y:c.y,w:c.width},panel:{x:r.x,y:r.y,w:r.width}};});
await p.setViewportSize({width:900,height:620});await p.waitForTimeout(600);
const after=await p.evaluate(()=>{const c=document.querySelector('canvas').getBoundingClientRect();const r=document.querySelector('.companions').getBoundingClientRect();return {canvas:{x:c.x,y:c.y,w:c.width},panel:{x:r.x,y:r.y,w:r.width}};});
assert.ok(after.panel.w<rects.panel.w,'窗口变小后，面板宽应同步缩小');
assert.ok(after.panel.x>=after.canvas.x-2 && after.panel.y>=after.canvas.y-2,'面板不应跑到画布外面');
assert.ok(after.panel.x+after.panel.w<=after.canvas.x+after.canvas.w+2,'面板不应超出画布右边界');

// 2/3. 进入故事：面板应被移除；结尾弹层关闭后键盘要恢复
await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(1200);
assert.deepEqual(await counts(),{panels:0,dialogs:0},'进入故事后不应留下 DOM 面板');
const askNote=p.locator('dialog[aria-label="写给自己的话"]');
for(let i=0;i<10 && !(await askNote.count());i++){await p.keyboard.press('ArrowLeft',{delay:100});await p.waitForTimeout(500);await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(2400);}
await askNote.waitFor({timeout:8000});
await p.keyboard.press('Escape');await p.waitForTimeout(700);
assert.equal((await counts()).dialogs,0,'Esc 关掉弹层后不应残留');
const afterEsc=await p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);const s=game.scene.getScene('StoryScene');return {keyboard:s.input.keyboard.enabled,inputEnabled:s.input.enabled,active:game.scene.getScenes(true).map(x=>x.scene.key)};});
assert.equal(afterEsc.keyboard,true,'关掉弹层后键盘应恢复');

// 看这一程的回顾：打开 → Esc → 输入恢复
await p.waitForTimeout(500);
if(await p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);return game.scene.isActive('EndingScene');})){
  await p.locator('canvas').click({position:{x:5,y:5}}).catch(()=>{});
  await p.keyboard.press('e',{delay:100});await p.waitForTimeout(500);
  const recap=p.locator('dialog[aria-label="这一程的回顾"]');
  if(await recap.count()){
    await p.keyboard.press('Escape');await p.waitForTimeout(600);
    assert.equal((await counts()).dialogs,0,'回顾弹层关闭后不应残留');
    const ok=await p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);const s=game.scene.getScene('EndingScene');return s.input.keyboard.enabled;});
    assert.equal(ok,true,'回顾关掉后键盘应恢复');
  }
}

assert.deepEqual(errors,[]);console.log('PASS 离线可重试、DOM 无残渣、弹层关闭后输入恢复、改窗口不跑版');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
