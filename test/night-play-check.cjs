// 剧情页「玩起来」那三件的回归：
//   ① 左边距的夜里时间轴（22:30 → 01:30，走到哪一格看得见）
//   ② 右上角的心事云：每给自己一次回应就小一点
//   ③ 第一幕之后那一次幕间是「跟着做一次呼吸」：身体动作算跟上，Enter 跳过
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const reachStory=async(p)=>{
  // 剧情改写固定 503：留在本地五幕剧情上，换幕时机才是可复现的
  await p.route('**/api/story/generate',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"deepseek unavailable"}'}));
  await p.goto('http://localhost:5174/');await p.waitForTimeout(900);
  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(700);
  await p.mouse.click(480,556);await p.waitForTimeout(800);
  await p.keyboard.press('j',{delay:100});
  await p.locator('.companions').waitFor({timeout:30000});
  await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(600);
};
const settle=async(p)=>{
  for(let i=0;i<30;i++){
    const d=await p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');
      return {now:s.time.now,lock:s.inputLockUntil,pending:s.aiPending};});
    if(!d.pending&&d.now>d.lock+250)return;
    await p.waitForTimeout(400);
  }
};
const read=async(p)=>p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');
  const texts=s.timelineObjs.filter(o=>o.type==='Text').map(o=>o.text);
  return {
    i:s.sceneIndex,n:s.sceneNodes.length,
    times:texts.filter(t=>/^\d\d:\d\d$/.test(t)),
    timelineParts:s.timelineObjs.length,
    cloudScale:Number(s.worryCloud.scaleX.toFixed(3)),
    cloudColors:s.worryCloud.list.filter(o=>o.type==='Arc').map(o=>o.fillColor),
    breathVisible:s.breath.visible,breathAlpha:Number(s.breath.alpha.toFixed(2)),
    phase:s.breathPhaseText.text,count:s.breathCountText.text,hint:s.breathHintText.text,
    title:s.breathTitle.text,gateDone:s.breathGateDone,active:!!s.breathNext,
    sceneText:(s.sceneText.text??'').slice(0,14),stats:s.statsText.text,
  };});

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:960,height:640}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await reachStory(p);await settle(p);

// ① 夜里时间轴：五幕 = 22:30 / 23:15 / 00:00 / 00:45 / 01:30
let s=await read(p);
assert.equal(s.n,5,'本地剧情应是五幕');
assert.deepEqual(s.times,['22:30','23:15','00:00','00:45','01:30'],`时间轴应是五个整点：${s.times.join(' ')}`);
assert.ok(s.timelineParts>=12,`时间轴该有线、五个点与五个刻度：现在 ${s.timelineParts} 个部件`);
console.log(`  ✓ 夜里时间轴：${s.times.join(' → ')}`);
await p.screenshot({path:'test/night-1-story.png'});

// ② 心事云：一开始是满的，给自己一次回应就缩一点
assert.equal(s.cloudScale,1,'第一幕刚开始时心事云应是满的');
const before=JSON.stringify(s.cloudColors);
for(const k of ['j','m','x']){await p.keyboard.press(k,{delay:80});await p.waitForTimeout(700);}
s=await read(p);
assert.ok(s.cloudScale<1,`给过回应后心事云应变小：现在 ${s.cloudScale}`);
assert.notEqual(JSON.stringify(s.cloudColors),before,'心事云的颜色应随进度变暖');
console.log(`  ✓ 心事云：三次回应后缩到 ${s.cloudScale}，颜色也转暖`);

// ③ 幕间：选中 + 确认之后，是「跟着做一次呼吸」而不是一闪而过
await p.keyboard.press('ArrowLeft',{delay:80});await p.waitForTimeout(500);
await p.keyboard.press('Enter',{delay:80});await p.waitForTimeout(1400);
s=await read(p);
assert.equal(s.i,1,'确认之后应立刻进入第二幕的幕间');
assert.equal(s.breathVisible,true,'幕间应出现呼吸那一层');
assert.match(s.title,/跟着做一次呼吸/,'第一次幕间应是跟着做的呼吸');
assert.match(s.phase,/吸气/,'应先给「吸气」');
assert.match(s.count,/第 1 \/ 3 轮/,'应显示第几轮');
assert.match(s.hint,/Enter 跳过/,'应告诉玩家可以跳过');
console.log(`  ✓ 幕间呼吸关：${s.title} · ${s.phase} · ${s.count}`);
await p.screenshot({path:'test/night-2-breath.png'});

// 跟着做：每个相位敲一个身体键，做满三轮自己结束
const deadline=Date.now()+30000;
let guard=0;
while(await read(p).then(r=>r.active) && Date.now()<deadline){
  await p.keyboard.press(guard++%2?'m':'j',{delay:80});
  await p.waitForTimeout(1500);
}
s=await read(p);
assert.equal(s.active,false,'三轮做完后呼吸关应自己结束');
assert.equal(s.gateDone,true,'这一次跟着做的呼吸只出现一次');
assert.match(s.stats,/接纳 [1-9]/,'跟着做完应记一点接纳');
console.log(`  ✓ 跟着做完三轮：${s.stats}`);

// 呼吸层淡出后，第二幕正常渲染（等它真的收起，最多 6 秒）
for(let i=0;i<20 && (await read(p)).breathVisible;i++)await p.waitForTimeout(300);
s=await read(p);
assert.ok(s.sceneText.length>2,'第二幕的正文应渲染出来');
assert.equal(s.breathVisible,false,'呼吸层应已收起');
assert.deepEqual(s.times.length,5,'新的一幕时间轴还在');
console.log(`  ✓ 第二幕正常出现：${s.sceneText}… · 时间轴仍在（${s.times.join(' ')}）`);

assert.deepEqual(errors,[]);
console.log('PASS 夜里时间轴 / 心事云 / 跟着做一次呼吸，三件都在跑');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
