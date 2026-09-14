const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true });
 try {
  const page = await browser.newPage({viewport:{width:1920,height:1280}});
  await page.route('**/api/**', r=>{
   const url=r.request().url();
   // 需要一个声音，否则挥剑之后会停在「暂时连不上知乎内容」，走不到剧情页
   if(url.includes('/zhihu/voices')) return r.fulfill({contentType:'application/json',body:JSON.stringify({items:[{kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'感觉心累、疲惫。…',body:'正文',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''}]})});
   return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
  });
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:5174'); await page.waitForTimeout(1000);
  const read = () => page.evaluate(async()=>{
   const {game}=await import(document.querySelector('script[src*="main.ts"]').src);
   const rect=game.canvas.getBoundingClientRect();
   const scene=game.scene.getScenes(true)[0];
   const text=scene.children.list.find(o=>o.type==='Text');
   return {width:game.canvas.width,display:rect.width,dpr:devicePixelRatio,textResolution:text.style.resolution,scene:scene.scene.key};
  });
  const before=await read(); console.log('1920px render:',before);
  await page.screenshot({path:'test/clarity-desktop.png'});
  assert.ok(before.width>=before.display,'Canvas must not upscale a low-resolution bitmap');
  assert.ok(before.textResolution>=2,'Text must be rasterized at display resolution');
  await page.mouse.click(320,886); await page.waitForTimeout(300);
  assert.equal((await read()).scene,'TroubleScene','Scaled input coordinates');
  await page.setViewportSize({width:960,height:640}); await page.waitForTimeout(500);
  await page.keyboard.press('j',{delay:100}); await page.waitForTimeout(700);   // 心事实体化
  await page.keyboard.press('j',{delay:100});                                   // 挥剑
  // 挥剑之后有一段整理心事的过场，面板是 DOM，要等它真的出现
  await page.locator('.companions').waitFor({timeout:25000});
  await page.getByRole('button',{name:/走进故事/}).click(); await page.waitForTimeout(400);
  assert.equal((await read()).scene,'StoryScene','Resize preserves gameplay');
  assert.deepEqual(errors,[]);
  const retina=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:2});
  await retina.goto('http://localhost:5174');await retina.waitForTimeout(800);
  assert.equal(await retina.locator('canvas').evaluate(c=>c.width),1920,'Retina backing pixels');
  console.log('PASS sharp backing pixels, text resolution, click mapping, resize and Retina');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
