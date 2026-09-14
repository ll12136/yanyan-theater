const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({items:r.request().url().includes('voices')?[0,1,2].map(i=>({kind:'story',workId:String(i),title:['慢一点，也能到达','在陌生城市找到生活','重新开始的那个春天'][i],author:['林舟','小禾','阿晴'][i],role:'故事讲述者',excerpt:'有一段时间，我总觉得自己走得太慢。后来才发现，每个人都有自己的节奏。允许自己休息，也允许自己重新出发。',body:'完整正文：我们不必在同一天抵达终点。',sourceLabel:'知乎故事',voteCount:0,sourceVia:i===1?'search':'work',sourceUrl:i===1?'https://www.zhihu.com/answer/123456':'https://www.zhihu.com/story/bad'})):[]})}));
await p.goto('http://localhost:5174');await p.waitForTimeout(1200);
for(const k of ['Enter','j','j']){await p.keyboard.press(k,{delay:100});await p.waitForTimeout(800);}
// 正文阅读现在是面板内联阅读器（不再是弹层）。注意两点真实行为：
//   · officialSource 会拒掉 /story/ 这类地址，所以第 1 个声音只有「阅读正文」按钮；
//   · openReader 是个开关，已打开时再按 E 会关掉它。
await p.getByRole('button',{name:'阅读正文',exact:true}).click();
await p.locator('.comp-inline-reader').waitFor();
assert.match(await p.locator('.comp-inline-reader').innerText(),/正文阅读/);
assert.equal(await p.locator('.comp-inline-reader').getByRole('link',{name:'查看知乎原文 ↗'}).count(),0,'没有官方地址的声音不该出现原文入口');
await p.screenshot({path:'test/reading-panel.png'});
await p.getByRole('button',{name:'收起'}).click();
await p.locator('.comp-inline-reader').waitFor({state:'detached'});
// 用键盘切到第二个声音（它有官方地址）：点击头像目前没有绑定，切不了
await p.keyboard.press('d');await p.waitForTimeout(200);
await p.keyboard.press('e');await p.locator('.comp-inline-reader').waitFor();
assert.equal(await p.getByRole('link',{name:'查看知乎原文 ↗'}).getAttribute('href'),'https://www.zhihu.com/answer/123456');
await p.route('https://www.zhihu.com/**',r=>r.fulfill({body:'source test'}));const popup=p.waitForEvent('popup');await p.getByRole('link',{name:'查看知乎原文 ↗'}).click();await(await popup).close();
await p.getByRole('button',{name:'收起'}).click();
// 圈子文案（F 打开弹层）、拥抱（H）、走进故事
await p.keyboard.press('f');await p.locator('dialog').waitFor();await p.getByLabel('分享文案').fill('测试草稿');await p.getByRole('button',{name:'关闭 ×'}).click();
await p.keyboard.press('h');await p.waitForTimeout(200);
await p.getByRole('button',{name:'走进故事 →'}).click();await p.waitForTimeout(500);assert.equal(await p.locator('.companions').count(),0);assert.deepEqual(errors,[]);console.log('PASS inline reader, real anchor popup, draft, hug, story entry and cleanup');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
