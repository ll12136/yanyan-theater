const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
const page=await browser.newPage({viewport:{width:960,height:640}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let requests=0;
await page.route('**/api/**',async r=>{
 const url=r.request().url();let body;
 if(url.includes('knowledge')) body={items:Array.from({length:6},(_,i)=>({title:'如何走出职业倦怠，重新找到自己的方向？'+i,description:'',labels:[]}))};
 else if(url.includes('/zhihu/voices')) body={items:[{kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'感觉心累、疲惫、抗拒工作。…',body:'正文',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享'}]};
 else if(url.includes('/stories')) body={items:[{workId:'1',title:'测试故事',description:'',labels:[]}]};
 else if(url.includes('/story/1')) body={workId:'1',chapterName:'一个新的开始',authorName:'测试作者',content:'他决定给自己一段休息的时间。'.repeat(10)};
 else {requests++;await new Promise(r=>setTimeout(r,1800));body={title:'迟到的故事',scenes:[{id:'one',text:'新的故事',options:[]}]};}
 await r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
});
const inspect=fn=>page.evaluate(async fn=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);return Function('game',`return (${fn})(game)`)(game);},fn.toString());
await page.goto('http://localhost:5174');await page.waitForTimeout(800);
await page.mouse.click(160,443);await page.waitForTimeout(400);
assert.equal(await inspect(g=>g.scene.isActive('TroubleScene')),true,'start mouse button');
await page.mouse.click(810,556);await page.waitForTimeout(200);
assert.equal(await inspect(g=>g.scene.getScene('TroubleScene').selectedIndex),6,'page switch');
await page.screenshot({path:'test/online-cards-check.png'});
await page.mouse.click(480,556);await page.waitForTimeout(650);
await page.keyboard.press('j',{delay:100});
await page.locator('.companions').waitFor({timeout:15000});   // 挥剑后有一段整理心事的过场
assert.equal(await inspect(g=>g.scene.getScene('TroubleScene').phase),'sample');
await page.getByRole('button',{name:/走进故事/}).click();await page.waitForTimeout(300);
assert.equal(await inspect(g=>g.scene.isActive('StoryScene')),true,'enter online story');
await page.mouse.click(190,524);await page.mouse.click(280,445);await page.waitForTimeout(2100);
assert.equal(await inspect(g=>g.scene.getScene('StoryScene').sceneIndex),1,'late AI must not reset progress');
assert.notEqual(await inspect(g=>g.scene.getScene('StoryScene').title),'迟到的故事');
assert.equal(requests,1);assert.deepEqual(errors,[]);
console.log('PASS mouse navigation, online pagination, online story entry, action buttons, late AI guard, no browser errors');
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
