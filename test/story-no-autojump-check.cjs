// 剧情页「不许自己往下走」回归。两条都是玩家报过的：
//   ① 幕间呼吸三轮做完、玩家一次都没跟上时，原来会自己进第二幕（计数明明写着「你跟上了 0 次」）；
//   ② 改编剧情原来等模型回来才把整套剧情换掉（本地 5 幕 → 改编 3 幕），
//      玩家读第一幕读到一半，标题正文全变——就是「我还没做选择，它自己跳了」。
// 现在：呼吸关必须等玩家动一下或按 Enter；改编必须在开演前定稿，慢过上限就本局不换。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const AUTH=r=>r.fulfill({status:200,contentType:'application/json',body:'{"configured":false,"loggedIn":false}'});
const AI_JSON=JSON.stringify({title:'夜灯微光',scenes:[
  {text:'你翻了个身，枕头窸窣作响。那些未读的消息还在屏幕里亮着，你没有去碰它。',prompt:'此刻你想怎么对待这团心事？',optionA:{label:'先把它放在一边',effect:{acceptance:1}},optionB:{label:'把它说清楚',effect:{courage:1}}},
  {text:'窗外的车声一趟趟过去。你想起白天那句话，胸口还是紧的。',prompt:'要不要再松一点？',optionA:{label:'松开肩膀',effect:{courage:1}},optionB:{label:'抱住自己',effect:{empathy:1}}},
  {text:'你不再和它较劲了。夜里安静下来，呼吸也慢了下来。',prompt:'今晚到这里，够了。',optionA:{label:'就这样睡',effect:{acceptance:1}},optionB:{label:'再陪自己一会',effect:{empathy:1}}}
]});

/** 进剧情页，并把这一幕的正文定稿（等逐字浮现结束） */
const reachStory=async(p)=>{
  await p.goto('http://localhost:5174/');await p.waitForTimeout(900);
  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(500);
  await p.keyboard.press('d',{delay:100});await p.waitForTimeout(300);
  await p.keyboard.press('j',{delay:100});await p.waitForTimeout(500);
  await p.keyboard.press('j',{delay:100});
  await p.locator('.companions').waitFor({timeout:30000});
  await p.getByRole('button',{name:/走进故事/}).click();
  // 等开演（renderScene 跑过才会设 inputLockUntil），再等正文浮现完整
  for(let i=0;i<60;i++){
    const s=await p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');return s?{trans:s.transitioning,lock:s.inputLockUntil}:null;}).catch(()=>null);
    if(s&&!s.trans&&s.lock>0)break;
    await p.waitForTimeout(400);
  }
  let prev='';
  for(let i=0;i<30;i++){
    const cur=await p.evaluate(()=>window.__game.scene.getScene('StoryScene').sceneText.text);
    if(cur&&cur===prev)return cur;
    prev=cur;await p.waitForTimeout(300);
  }
  return prev;
};
const state=p=>p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');
  return {i:s.sceneIndex,title:String(s.title),n:s.sceneNodes.length,gate:!!s.breathNext,waiting:s.breathWaiting,
    followed:s.breathFollowed,count:s.breathCountText?s.breathCountText.text:'',shown:s.sceneText.text,credit:s.creditText?s.creditText.text:''};});

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const errors=[];

// ① 幕间呼吸：三轮做完但一次都没跟上 → 必须停在原地
{
  const p=await b.newPage({viewport:{width:960,height:640}});p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/auth/status**',AUTH);
  await p.route('**/api/story/generate',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"off"}'}));
  const act1=await reachStory(p);
  for(let i=0;i<20;i++){const d=await p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');return s.time.now>s.inputLockUntil+300;});if(d)break;await p.waitForTimeout(300);}
  await p.keyboard.press('ArrowLeft',{delay:100});await p.waitForTimeout(700);
  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(600);
  assert.equal((await state(p)).gate,true,'确认之后应该进入幕间呼吸关');

  await p.waitForTimeout(26000);                       // 三轮 ≈19 秒 + 余量，全程不给任何输入
  const s=await state(p);
  assert.equal(s.gate,true,`一次都没跟上，呼吸关不该自己结束（现在 gate=${s.gate}）`);
  assert.equal(s.shown,act1,'画面必须还停在第一幕正文');
  assert.equal(s.waiting,true,'应该进入等待态');
  assert.match(s.count,/你跟上了 0 次/,'计数要如实写着 0 次');
  console.log('  ✓ 一次没跟上：三轮后停在原地继续呼吸，没有自己进第二幕');

  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(2500);
  const after=await state(p);
  assert.equal(after.gate,false,'按 Enter 应该跳过并继续');
  assert.notEqual(after.shown,act1,'Enter 之后应该换到第二幕');
  console.log('  ✓ 按 Enter：跳过呼吸，正常进入第二幕');
  await p.close();
}

// ①b 等待态里跟一次动作 → 也应该继续
{
  const p=await b.newPage({viewport:{width:960,height:640}});p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/auth/status**',AUTH);
  await p.route('**/api/story/generate',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"off"}'}));
  const act1=await reachStory(p);
  for(let i=0;i<20;i++){const d=await p.evaluate(()=>{const s=window.__game.scene.getScene('StoryScene');return s.time.now>s.inputLockUntil+300;});if(d)break;await p.waitForTimeout(300);}
  await p.keyboard.press('ArrowLeft',{delay:100});await p.waitForTimeout(700);
  await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(22000);
  assert.equal((await state(p)).waiting,true,'应该已经在等待态');
  await p.keyboard.press('f',{delay:100});await p.waitForTimeout(2500);   // 下压 = 算跟上
  const after=await state(p);
  assert.equal(after.gate,false,'跟上一次之后应该继续');
  assert.notEqual(after.shown,act1,'跟上之后应该换到第二幕');
  console.log('  ✓ 等待态里跟一次动作：正常进入第二幕');
  await p.close();
}

// ② 改编慢过等待上限 → 本局不许替换
{
  const p=await b.newPage({viewport:{width:960,height:640}});p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/auth/status**',AUTH);
  await p.route('**/api/story/generate',async r=>{await new Promise(res=>setTimeout(res,20000));await r.fulfill({status:200,contentType:'application/json',body:AI_JSON});});
  await reachStory(p);
  await p.waitForTimeout(14000);                       // 已经过了 12 秒上限，本地剧情应该已经开演
  const afterTimeout=await state(p);
  assert.equal(/^改编自知乎/.test((afterTimeout.credit||'').split('·  正在用知乎原文改编')[0].trim()),false,
    `超时不该用改编版：${afterTimeout.credit}`);
  console.log(`  ✓ 超时后用本地剧情开演：《${afterTimeout.title}》`);

  await p.waitForTimeout(16000);                       // 改编此时已经回来
  const later=await state(p);
  assert.equal(later.title,afterTimeout.title,`改编回来不该替换本局剧情（${afterTimeout.title} → ${later.title}）`);
  assert.equal(later.n,afterTimeout.n,'幕数也不该变');
  console.log('  ✓ 改编回来：本局剧情没被替换');
  await p.close();
}

assert.deepEqual(errors,[]);
console.log('PASS 剧情页不会自己往下走：呼吸关等人、改编在开演前定稿');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
