const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page = await browser.newPage();
  await page.route('**/api/**', r=>r.fulfill({json:{items:Array.from({length:12},(_,i)=>({title:'如何面对职场压力和不确定的未来？'.repeat(i===0?12:1),description:'这是一段非常长的真实内容摘要。'.repeat(40),labels:['职场'.repeat(30)]}))}}));
  await page.goto('http://localhost:5174');
  await page.waitForFunction(()=>window.__game?.scene.isActive('MenuScene'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__game.scene.getScene('TroubleScene').cards.length===6);
  const overflow=await page.evaluate(()=>window.__game.scene.getScene('TroubleScene').cards.flatMap(c=>c.list.filter(t=>t.type==='Text').filter(t=>t.y-t.height*t.originY < -60 || t.y+t.height*(1-t.originY)>60 || t.width>220).map(t=>t.text)));
  assert.deepEqual(overflow,[],'Card text must stay inside its allocated bounds');
  for(const [name,width,height] of [['desktop',1440,960],['mobile',390,844]]){
   await page.setViewportSize({width,height}); await page.waitForTimeout(400);
   await page.screenshot({path:`test/cards-fixed-${name}.png`});
  }
  console.log('PASS long titles and descriptions stay inside cards at desktop/mobile sizes');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
