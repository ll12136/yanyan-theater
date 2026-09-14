// 故事集与署名回归：
//   1. 玩一张「知乎热门烦恼」卡（没有本地剧情、引擎里只能退回 career 占位），
//      故事集里记下的必须是这张卡本身的心事，不能写成辞职那件；署名也不能写成「职业迷茫」。
//   2. 连玩两局，故事集里应留下两条，并且分页按钮可用。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const REAL_WORRY='职场：如何让老板给我升职加薪？';
const VOICES={items:[{kind:'knowledge',workId:'k1',title:REAL_WORRY,author:'潘幸知',excerpt:'感觉心累、疲惫、抗拒工作。…',body:'你在工作中是否有过心累、疲惫的感受。',sourceLabel:`知乎知识 · 潘幸知《${REAL_WORRY}》`,role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''}]};

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,'height':960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',r=>{
  const url=r.request().url();
  if(url.includes('/zhihu/knowledge')) return r.fulfill({contentType:'application/json',body:JSON.stringify({items:[{title:REAL_WORRY,description:'',labels:[]}]})});
  if(url.includes('/zhihu/voices')) return r.fulfill({contentType:'application/json',body:JSON.stringify(VOICES)});
  return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
});
const texts=async key=>p.evaluate(async name=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);
  const s=game.scene.getScene(name);if(!game.scene.isActive(name))return null;
  const out=[];const visit=l=>{for(const o of l){if(o.type==='Text'&&o.text)out.push(o.text);if(o.list)visit(o.list);}};visit(s.children.list);return out.join('\n');},key);

await p.goto('http://localhost:5174/?harvest=off');await p.waitForTimeout(1400);

// 一局：选知乎热门烦恼卡 → 走完 → 收进故事集
const playOnce=async(first)=>{
  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(500);       // 首页 → 心事
  if(first){
    await p.mouse.click(1230,834);await p.waitForTimeout(400);                    // 翻到第二页（知乎热门烦恼）
    await p.mouse.click(450,411);await p.waitForTimeout(300);                      // 选第一张真实卡
  }
  await p.mouse.click(720,834);await p.waitForTimeout(700);                        // 放下心事
  await p.keyboard.press('j',{delay:120});                                         // 挥剑
  const phase=async()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);const s=game.scene.getScene('TroubleScene');return {phase:s.phase,selected:s.selectedIndex,cards:s.troubleList.length};});
  try { await p.locator('.companions').waitFor({timeout:25000}); }
  catch(e){ console.log('  [诊断] 面板没出现，当前状态：', JSON.stringify(await phase())); throw e; }
  await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(1200);
  const storyText=await texts('StoryScene');
  const askNote=p.locator('dialog[aria-label="写给自己的话"]');
  for(let i=0;i<10 && !(await askNote.count());i++){await p.keyboard.press('1',{delay:100});await p.waitForTimeout(2400);}
  await askNote.waitFor({timeout:8000});
  await p.getByRole('button',{name:/先不写/}).click();await p.waitForTimeout(1000);
  await p.keyboard.press('s',{delay:100});await p.waitForTimeout(600);             // 收进我的故事集
  assert.match(await texts('EndingScene'),/已收进/,'应能收进故事集');
  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(700);         // 回首页
  return storyText;
};

const firstStory=await playOnce(true);
assert.ok(firstStory,'应进入过剧情页');
assert.equal(/职业迷茫/.test(firstStory),false,`真实卡的署名不该写成「职业迷茫」：${firstStory.split('\n').find(t=>/本地示例剧情|改编自/.test(t))}`);
assert.match(firstStory,/知乎热门烦恼|改编自知乎/,'真实卡应标成知乎热门烦恼或改编自知乎');

// 看故事集：记的必须是这张卡的心事
await p.mouse.click(553,664);await p.waitForTimeout(900);                          // 我的故事集
const shelf1=await texts('SampleScene');
assert.ok(shelf1,'应进入我的故事集');
assert.ok(shelf1.includes(REAL_WORRY),`故事集里应是玩家选的那张卡：${REAL_WORRY}`);
assert.equal(shelf1.includes('不想继续现在的工作了'),false,'不应记成别的卡的心事');
assert.ok(shelf1.includes('@潘幸知'),'应标出陪你的人');
await p.screenshot({path:'test/shelf-realcard-check.png'});
await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(700);           // 回首页

// 第二局：再走一遍，故事集里应有两条并出现分页
await playOnce(false);
await p.mouse.click(553,664);await p.waitForTimeout(900);
const shelf2=await texts('SampleScene');
const entries=(shelf2.match(/这一程 ·/g)||[]).length;
assert.equal(entries,2,`故事集里应留下两条这一程，实际 ${entries}`);
assert.ok(shelf2.includes(REAL_WORRY)&&shelf2.includes('不想继续现在的工作了'),'两条记录应分别是真实卡与本地卡');
await p.screenshot({path:'test/shelf-two-check.png'});
await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(700);           // 回首页

// 第三局：三条记录 → 每页两张，应出现分页并能翻到第二页
await playOnce(false);
await p.mouse.click(553,664);await p.waitForTimeout(900);
const shelf3=await texts('SampleScene');
assert.equal((shelf3.match(/这一程 ·/g)||[]).length,2,'第一页应显示两条');
assert.match(shelf3,/下一页|上一页/,'三条以上应出现分页按钮');
await p.mouse.click(420,829);await p.waitForTimeout(800);                          // 下一页 →
const paged=await texts('SampleScene');
assert.equal((paged.match(/这一程 ·/g)||[]).length,1,'第二页应显示剩下的一条');
assert.match(paged,/上一页/,'第二页应能翻回去');
await p.screenshot({path:'test/shelf-page2-check.png'});
assert.deepEqual(errors,[]);
console.log('PASS 真实卡署名与故事集记录正确、连玩三局会累积并分页');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
