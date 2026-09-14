const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/api/**', r=>{
  const url=r.request().url();
  if(url.includes('/zhihu/voices')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'感觉心累、疲惫、抗拒工作。…',body:'你在工作中是否有过心累、疲惫的感受。',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享'}]})});
  return r.fulfill({status:200,contentType:'application/json',body:'{"items":[]}'});
 });
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5174/?harvest=off');
 await page.waitForTimeout(1200);
 await page.screenshot({path:'test/menu-check.png'});
 await page.keyboard.press('Enter',{delay:100}); await page.waitForTimeout(300);
 await page.screenshot({path:'test/cards-check.png'});
 await page.keyboard.press('j',{delay:100}); await page.waitForTimeout(500);
 const state = await page.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src); const s=game.scene.getScene('TroubleScene'); return {phase:s.phase,active:s.scene.isActive(),listeners:s.input.listenerCount('pointerdown')};});
 console.log('Slash responds:',state.phase==='manifest'?'PASS':'FAIL',state);
 await page.screenshot({path:'test/trouble-check.png'});
 await page.keyboard.press('j',{delay:100}); await page.waitForTimeout(900);
 await page.screenshot({path:'test/story-card-check.png'});
 // 挥剑之后有一段「看山正在整理这份心事」的过场动画，要等面板真的出现
 await page.locator('.companions').waitFor({timeout:15000});
 await page.keyboard.press('j',{delay:100}); await page.waitForTimeout(400);
 await page.screenshot({path:'test/story-check.png'});
 await page.keyboard.press('h',{delay:100}); await page.waitForTimeout(300);
 // 选项是两段式：先选中一条路（← 或点卡片），隔一下再按 Enter 确认，才换幕。
 // 幕数不写死：本地剧情 5 幕、模型改编 3 幕，一律走到结尾那句「写给自己的话」为止
 const askNote=()=>page.locator('dialog[aria-label="写给自己的话"]');
 for(let i=0;i<10 && !(await askNote().count());i++){await page.keyboard.press('ArrowLeft',{delay:100});await page.waitForTimeout(500);await page.keyboard.press('Enter',{delay:100});await page.waitForTimeout(2400);}
 if(await askNote().count()){await page.getByRole('button',{name:/先不写/}).click();await page.waitForTimeout(900);}
 const ending=await page.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);return game.scene.isActive('EndingScene');});
 console.log('Full playthrough:',ending?'PASS':'FAIL');
 await page.screenshot({path:'test/ending-check.png'});
 await page.keyboard.press('Enter',{delay:100});await page.waitForTimeout(300);
 await page.keyboard.press('Enter',{delay:100});await page.waitForTimeout(300);
 const repeat=await page.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);const s=game.scene.getScene('TroubleScene');return {phase:s.phase,listeners:s.input.listenerCount('pointerdown')};});
 console.log('Restart:',repeat);
 console.log('Browser errors:',errors);
 await browser.close();
 if(state.phase!=='manifest'||!ending||repeat.phase!=='choose'||repeat.listeners!==1||errors.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

