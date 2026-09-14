// 三个声音的浏览器验收：面板现在是 DOM（.companions），
// 内容必须全部来自知乎真实内容（此处用真实结构的桩数据），头像用刘看山动态 sprite sheet。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const VOICES={items:[
  {kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'你在工作中是否有过或者正在经历着这样一些体验：感觉心累、疲惫、抗拒工作。…',body:'正文',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''},
  {kind:'story',workId:'s1',title:'不提分就出不去的房间',author:'林浣',excerpt:'我被关进了一个房间，只有提分才能出去。…',body:'正文',sourceLabel:'知乎盐言故事 · 林浣《不提分就出不去的房间》',role:'盐言故事 · 言情 · 学霸',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''},
  {kind:'knowledge',workId:'k2',title:'不想学习的时候如何逼迫自己学习？',author:'黛西巫巫',excerpt:'先别急着骂自己懒，我们先把这件事拆小。…',body:'正文',sourceLabel:'知乎知识 · 黛西巫巫《不想学习的时候如何逼迫自己学习？》',role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''}
]};

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',r=>{
  const url=r.request().url();
  if(url.includes('/zhihu/voices')) return r.fulfill({contentType:'application/json',body:JSON.stringify(VOICES)});
  return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
});
await p.goto('http://localhost:5174');await p.waitForTimeout(1000);
for(const key of ['Enter','j','j']){await p.keyboard.press(key,{delay:100});await p.waitForTimeout(700);}
await p.locator('.companions').waitFor({timeout:8000});

const panel=()=>p.locator('.companions').innerText();
const shown=await panel();
assert.match(shown,/草芽君Psy/,'第一个声音应为知乎作者');
assert.match(shown,/知乎知识 · 草芽君Psy《如何走出职业倦怠？》/,'必须标明知乎来源与作者');
assert.equal(/原创陪伴角色|非真实用户回答|情节化表达/.test(shown),false,'页面不得再出现原创/非真实标注');
assert.equal(/苏叶|小禾|阿晴/.test(shown),false,'页面不得再出现本地虚构角色名');
assert.equal(await p.locator('.comp-person').count(),3,'三个声音都应列出来');

// 头像换成刘看山动态 sprite sheet
const avatarStyles=await p.locator('.comp-avatar').evaluateAll(els=>els.map(e=>getComputedStyle(e).backgroundImage));
assert.deepEqual(avatarStyles.map(s=>(/kanshan-(?:greet|idle|desk)\.png/.exec(s)||[])[0]),['kanshan-greet.png','kanshan-idle.png','kanshan-desk.png'],'头像应依次使用三条刘看山动态');
const anim=await p.locator('.comp-avatar').first().evaluate(e=>getComputedStyle(e).animationName);
assert.equal(anim,'comp-avatar-play','头像应有逐帧动画');
// 动画真的在走：背景按 steps(24) 平移，两次采样应停在不同帧
const bgAt=()=>p.locator('.comp-avatar').first().evaluate(e=>getComputedStyle(e).backgroundPositionX);
const bg1=await bgAt();await p.waitForTimeout(700);const bg2=await bgAt();
assert.notEqual(bg1,bg2,`头像动画应逐帧推进（${bg1} → ${bg2}）`);
await p.screenshot({path:'test/companions-check.png'});

// 9 秒自动轮换
await p.waitForTimeout(9500);
assert.match(await panel(),/林浣/,'9 秒后自动轮换到第二个声音');

// 点击某个讲述者：停下来读它
await p.locator('.comp-person').nth(2).click();await p.waitForTimeout(300);
assert.match(await panel(),/黛西巫巫/,'点击头像切换到这条声音');

// 拥抱与圈子文案：面板改版后这两个入口不再是 DOM 按钮，改成了动作键
// （拥抱 = H，圈子文案 = F）。拥抱本身没删，只是入口搬到了键位上。
const huggedCount=()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);return game.scene.getScene('TroubleScene')?.companionPanel?.huggedCount??-1;});
assert.equal(await huggedCount(),0,'一开始还没拥抱过');
await p.keyboard.press('h');await p.waitForTimeout(300);
assert.equal(await huggedCount(),1,'按 H 应记下一次拥抱');
await p.keyboard.press('f');await p.locator('dialog').waitFor();
assert.match(await p.locator('dialog').innerText(),/写给「烦恼斩断所」/,'圈子文案弹层的标题');
await p.getByLabel('分享文案').fill('我想和大家聊一聊。');await p.keyboard.press('j');
assert.equal(await p.locator('dialog').count(),1,'打开圈子文案时键盘不应穿透');
await p.getByRole('button',{name:/关闭/}).click();await p.waitForTimeout(300);

// 进入故事
await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(500);
assert.equal(await p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);return game.scene.isActive('StoryScene');}),true,'可以走进故事');
assert.deepEqual(errors,[]);console.log('PASS 三个声音均来自知乎内容、刘看山动态头像、轮换、点击停留、拥抱、圈子文案与进入故事');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
