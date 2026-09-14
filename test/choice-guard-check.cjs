// 剧情页「没做选择就不许换幕」回归：
//   体感 dongle 的「双手交叉额头」= 依次敲 1、2、3、4（MoveToPlay/main/app_main.c:1134, 2131-2142），
//   「右手挥砍」= 鼠标左键连点。这两样都不请自来，不能当成玩家做了选择。
//   真正的选择必须走两步：选中 → 确认。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const reachStory=async(p)=>{
  // 剧情改写接口固定回 503：这一页留在玩家自己的本地剧情上，
  // 「换幕」的时机才是可复现的（模型什么时候回来是它自己的事，见 story-check.cjs）。
  await p.route('**/api/story/generate',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"deepseek unavailable"}'}));
  // 登录墙与「没做选择就不许换幕」无关：把登录态 mock 成「未配置」，
  // 主按钮才会直接开演，而不是跳去知乎授权页。
  await p.route('**/api/auth/status**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"configured":false,"loggedIn":false}'}));
  await p.goto('http://localhost:5174/');await p.waitForTimeout(900);
  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(700);
  await p.mouse.click(480,556);await p.waitForTimeout(800);
  await p.keyboard.press('j',{delay:100});
  await p.locator('.companions').waitFor({timeout:30000});
  await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(600);
};
/** 等这一幕「读得差不多了」：正文浮现完 + 静默期结束 */
const settled=async(p)=>{
  for(let i=0;i<20;i++){
    const d=await p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');
      return {now:s.time.now,lock:s.inputLockUntil,i:s.sceneIndex};});
    if(d.now>d.lock+200)return d;
    await p.waitForTimeout(400);
  }
  throw new Error('这一幕的静默期一直没结束');
};
const state=async(p)=>p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');
  return {i:s.sceneIndex,n:s.sceneNodes.length,slot:s.selectedSlot,title:s.title,
    confirm:s.confirmText?.text??'',hint:s.choiceHint?.text??''};});

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const errors=[];

// ① 不请自来的输入：数字键（体感手势）与鼠标连点，都不许换幕
{
  const p=await b.newPage({viewport:{width:960,height:640}});p.on('pageerror',e=>errors.push(e.message));
  await reachStory(p);
  await settled(p);
  const before=await state(p);
  assert.equal(before.i,0,'第一幕应该是 index 0');

  // dongle「双手交叉额头」= 连敲 1、2、3、4
  for(const k of ['1','2','3','4']){await p.keyboard.press(k,{delay:60});}
  await p.waitForTimeout(2600);
  let now=await state(p);
  assert.equal(now.i,0,`数字键（体感双手交叉额头）不该推走第一幕，现在到了第 ${now.i+1} 幕`);
  assert.equal(now.slot,null,'数字键不该选中任何一条路');
  console.log('  ✓ 体感「双手交叉额头」连敲 1/2/3/4：停在第一幕，没有选中任何一条');

  // 什么都没选就按确认：只提醒，不换幕
  await p.keyboard.press('Enter',{delay:60});await p.waitForTimeout(1800);
  now=await state(p);
  assert.equal(now.i,0,`没选中任何一条时按 Enter 不该换幕，现在到了第 ${now.i+1} 幕`);
  assert.match(now.hint,/先选一条路/,'没选就按确认，应该提醒玩家先选一条路');
  console.log('  ✓ 没选就按确认：只给一句提醒，故事不动');

  // dongle「右手挥砍」= 鼠标左键连点，光标停在选项卡上
  await p.mouse.move(300,445);
  for(let i=0;i<3;i++){await p.mouse.down();await p.mouse.up();await p.waitForTimeout(120);}
  await p.waitForTimeout(2600);
  now=await state(p);
  assert.equal(now.i,0,`鼠标连点不该推走第一幕，现在到了第 ${now.i+1} 幕`);
  assert.equal(now.slot,'A','连点最多只是把左边这条点亮，不该直接确认');
  console.log(`  ✓ 体感「右手挥砍」鼠标连点：只点亮左边这条（${now.confirm}），仍停在第一幕`);

  // 光标还在选项卡上时再补几下：只是重复点亮，故事照旧不动
  for(let i=0;i<3;i++){await p.mouse.down();await p.mouse.up();await p.waitForTimeout(100);}
  await p.waitForTimeout(1500);
  now=await state(p);
  assert.equal(now.i,0,`继续连点也不该换幕，现在到了第 ${now.i+1} 幕`);
  console.log('  ✓ 光标停在卡片上的连续挥砍：仍然停在第一幕，等玩家自己确认');
  assert.deepEqual(errors,[]);
  await p.close();
}

// ② 键盘真的选择：← 选中 → Enter 确认 → 进第二幕
{
  const p=await b.newPage({viewport:{width:960,height:640}});p.on('pageerror',e=>errors.push(e.message));
  await reachStory(p);
  await settled(p);                          // 等这一幕的正文浮现完、静默期过去
  await p.keyboard.press('ArrowLeft',{delay:80});await p.waitForTimeout(500);
  let now=await state(p);
  assert.equal(now.slot,'A','← 应该点亮左边这条路');
  assert.equal(now.i,0,'只点亮不该换幕');
  await p.keyboard.press('Enter',{delay:80});await p.waitForTimeout(2600);
  now=await state(p);
  assert.equal(now.i,1,'选中后按 Enter 应该进入第二幕');
  assert.equal(now.slot,null,'新的一幕不该带着上一幕的选择');
  console.log('  ✓ 键盘：← 选中 · Enter 确认 → 正常进入第二幕');
  await p.close();
}

// ③ 鼠标真的选择：点卡片 → 点确认 → 进第二幕
{
  const p=await b.newPage({viewport:{width:960,height:640}});p.on('pageerror',e=>errors.push(e.message));
  await reachStory(p);
  await settled(p);
  await p.mouse.click(700,445);await p.waitForTimeout(600);
  let now=await state(p);
  assert.equal(now.slot,'B','点右边那张卡应该点亮右边这条路');
  assert.equal(now.i,0,'点卡片只是选中，不该换幕');
  await p.mouse.click(480,520);await p.waitForTimeout(2600);
  now=await state(p);
  assert.equal(now.i,1,'点确认按钮后应该进入第二幕');
  console.log('  ✓ 鼠标：点卡片选中 · 点确认按钮 → 正常进入第二幕');
  await p.close();
}

assert.deepEqual(errors,[]);
console.log('PASS 第一幕：手势/连点不请自来也换不了幕；选中并确认之后，故事照常往下走');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
