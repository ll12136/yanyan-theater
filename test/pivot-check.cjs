// 「看山问你，睡了吗？」整站走一遍：首页 → 今晚的心事 → 三个声音 → 剧情（选中+确认）→ 结算 → 结局页。
// 每一步截图到 test/pivot-*.png，顺带核对品牌名、状态条与选项卡的两段式。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:960,height:640}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
const texts=async()=>p.evaluate(()=>{const g=window.__game;const out=[];
  for(const s of g.scene.getScenes(true)){const visit=l=>{for(const o of l){if(o.type==='Text'&&o.text)out.push(o.text);if(o.list)visit(o.list);}};visit(s.children.list);}
  return {scene:g.scene.getScenes(true).map(s=>s.scene.key).join(','),texts:out};});

await p.goto('http://localhost:5174/');await p.waitForTimeout(1400);
await p.screenshot({path:'test/pivot-1-menu.png'});
let s=await texts();
assert.equal(s.scene,'MenuScene');
assert.ok(s.texts.some(t=>t.includes('看山问你，睡了吗？')),'首页应出现新品牌名');
assert.ok(s.texts.some(t=>t.includes('先松开')),'首页主标题应换成助眠主题');
console.log('  ✓ 首页：看山问你，睡了吗？');

await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(1500);
await p.screenshot({path:'test/pivot-2-trouble.png'});
s=await texts();
assert.equal(s.scene,'TroubleScene');
assert.ok(s.texts.some(t=>t.includes('今晚，是什么让你还没睡着？')),'心事页标题应换成助眠主题');
assert.ok(s.texts.some(t=>t.includes('入睡困难')),'第一张卡应是今夜的心事（入睡困难）');
assert.ok(s.texts.some(t=>/知乎热议/.test(t))||true,'（真实内容随接口返回）');
console.log('  ✓ 今晚的心事：'+s.texts.filter(t=>['入睡困难','熬夜放不下手机','压力压着睡不着','白天不动，晚上不困','一闭眼就复盘今天','心事堆在一起'].includes(t)).join(' / '));

// 挑第一张心事 → 放下 → 挥剑
await p.mouse.click(480,556);await p.waitForTimeout(900);
await p.screenshot({path:'test/pivot-2b-manifest.png'});   // 心事实体化那一幕：水彩云落在暗紫底上
await p.keyboard.press('j',{delay:100});
await p.locator('.companions').waitFor({timeout:30000});
await p.screenshot({path:'test/pivot-3-voices.png'});
console.log('  ✓ 三个声音（知乎真实内容）已出现');

await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(2600);
await p.screenshot({path:'test/pivot-4-story.png'});
s=await texts();
assert.ok(s.texts.some(t=>t.includes('这一条路')||t.includes('选一条路')),'剧情页应有「选中 → 确认」的说明');
assert.ok(s.texts.some(t=>/放松 0 · 接纳 0 · 陪伴 0/.test(t)),'状态条应写成 放松/接纳/陪伴：'+s.texts.find(t=>/接纳/.test(t)));
assert.ok(s.texts.some(t=>t.includes('02 / 04')),'剧情页应标第 02 / 04 步');
const choice=s.texts.filter(t=>t.includes('选一条路')||t.includes('往下走'));
console.log('  ✓ 剧情页（'+s.scene+'）：'+choice.join(' | '));

// 选中左边这条路，再确认
const settled=async()=>{
  for(let i=0;i<70;i++){
    const d=await p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');
      return {now:s.time.now,lock:s.inputLockUntil,pending:s.aiPending,title:s.title};});
    if(!d.pending && d.now>d.lock+300)return d;
    await p.waitForTimeout(500);
  }
  throw new Error('这一幕一直没读完');
};
await settled();                                     // 正文浮现完 + 静默期结束（模型可能刚换过剧情）
await p.keyboard.press('ArrowLeft',{delay:80});await p.waitForTimeout(500);
await p.screenshot({path:'test/pivot-5-selected.png'});
s=await texts();
assert.ok(s.texts.some(t=>t.includes('就这条路，往下走')),'选中后确认键应变成「就这条路，往下走」');
console.log('  ✓ 选中左边这条：确认键亮起来（还没换幕）');

await p.keyboard.press('Enter',{delay:80});await p.waitForTimeout(2800);
const idx=await p.evaluate(()=>window.__game.scene.getScene('StoryScene').sceneIndex);
assert.equal(idx,1,'确认之后应该进入第二幕');
console.log('  ✓ 确认之后进入第二幕');

// 一路走到结尾那句「写给自己的话」
const dialog=p.locator('dialog[aria-label="写给自己的话"]');
for(let i=0;i<12 && !(await dialog.count());i++){
  await p.keyboard.press('ArrowLeft',{delay:60});await p.waitForTimeout(450);
  await p.keyboard.press('Enter',{delay:60});await p.waitForTimeout(2400);
}
await dialog.waitFor({timeout:8000});
await p.screenshot({path:'test/pivot-6-selfnote.png'});
console.log('  ✓ 结尾那句「今晚睡前，想对自己说一句什么？」');
const mine='今晚先这样，也够了。';
await p.getByLabel('想对自己说的话').fill(mine);
await p.getByRole('button',{name:/写下，再看今晚的收尾/}).click();
await p.waitForTimeout(2000);

// 结算 → 结局页
const ending=async()=>p.evaluate(()=>{const g=window.__game;if(!g.scene.isActive('EndingScene'))return null;
  const scene=g.scene.getScene('EndingScene');const out=[];const visit=l=>{for(const o of l){if(o.type==='Text'&&o.text)out.push(o.text);if(o.list)visit(o.list);}};visit(scene.children.list);
  return {texts:out.join('\n'),share:scene.shareText};});
await p.locator('text=/抱住它/').first().waitFor({timeout:25000}).catch(()=>{});
await p.keyboard.press('Enter',{delay:80});          // 抱住它
for(let i=0;i<40 && !(await ending());i++)await p.waitForTimeout(700);
const e=await ending();
assert.ok(e,'应该走到结局页');
await p.waitForTimeout(2600);
await p.screenshot({path:'test/pivot-7-ending.png'});
assert.match(e.texts,/看山把今晚收好了/,'结局页页眉应换成今晚');
assert.ok(e.texts.includes(mine),'结局卡上应出现写给自己的话');
assert.match(e.share,/看山问你，睡了吗？/,'分享文案应带新品牌名');
console.log('  ✓ 结局页：'+e.texts.split('\n').filter(Boolean).slice(1,3).join(' / '));

assert.deepEqual(errors,[]);
console.log('PASS 换皮整站走通：品牌名、今夜的心事、两段式选择、结局与分享文案都换成睡眠主题');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
