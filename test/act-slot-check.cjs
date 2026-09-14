// 逐幕动作验收：动作不只是「回应」，它还要能当「选项」用。
//
// 验的是玩家真实感受到的那件事：**换幕换了动作，但槽位没变**——
//   第一幕 左手抬起=选项1 / 右手抬起=选项2
//   第二幕 右手挥砍=选项1 / 下压=选项2
//   第三幕 左手抬起又回到选项1
// 同时验：不是这一幕选项的动作，仍然只做「回应」，不推进故事。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const VOICES={items:[{kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'感觉心累、疲惫、抗拒工作。…',body:'你在工作中是否有过心累、疲惫的感受。',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''}]};

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',r=>{
  const url=r.request().url();
  if(url.includes('/zhihu/voices')) return r.fulfill({contentType:'application/json',body:JSON.stringify(VOICES)});
  return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
});

const read=()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);
  if(!game.scene.isActive('StoryScene'))return null;
  const s=game.scene.getScene('StoryScene');const items=[];
  const visit=l=>{for(const o of l){if(o.type==='Text'&&o.text)items.push({text:o.text,alpha:o.alpha});if(o.list)visit(o.list);}};
  visit(s.children.list);
  return {index:s.sceneIndex,nodes:s.sceneNodes.length,transitioning:s.transitioning,
    hasNoteDialog:Boolean(s.selfNoteDialog),items};});
const find=(st,re)=>st.items.find(i=>re.test(i.text));
const waitScene=async(ms=2400)=>{await p.waitForTimeout(ms);return read();};

// 进入剧情
await p.goto('http://localhost:5174/?harvest=off');await p.waitForTimeout(1000);
await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(500);
await p.keyboard.press('d',{delay:100});await p.waitForTimeout(300);
await p.keyboard.press('j',{delay:100});await p.waitForTimeout(600);
await p.keyboard.press('j',{delay:100});
await p.locator('.companions').waitFor({timeout:30000});
await p.getByRole('button',{name:/走进故事/}).click();
let st=await waitScene(1500);
assert.ok(st,'应进入 StoryScene');

// —— 第一幕：左手抬起=选项1、右手抬起=选项2 ——
assert.equal(st.index,0,'应在第一幕');
const a0=find(st,/【1 \/ ←】/);const b0=find(st,/【2 \/ →】/);
assert.ok(a0&&/手势：左手抬起/.test(a0.text),`第一幕选项1应标出「左手抬起」：${a0&&a0.text}`);
assert.ok(b0&&/手势：右手抬起/.test(b0.text),`第一幕选项2应标出「右手抬起」：${b0&&b0.text}`);
// 被征用为选项的动作，从回应按钮里淡出
const hugBtn=find(st,/^拥抱$/);const nodBtn=find(st,/^听见$/);
assert.ok(hugBtn&&hugBtn.alpha<0.5,`第一幕「拥抱」已是选项，按钮应淡出（实际 ${hugBtn&&hugBtn.alpha}）`);
assert.ok(nodBtn&&nodBtn.alpha<0.5,`第一幕「听见」已是选项，按钮应淡出（实际 ${nodBtn&&nodBtn.alpha}）`);
const slashBtn=find(st,/^挥剑$/);
assert.ok(slashBtn&&slashBtn.alpha>0.9,`第一幕「挥剑」不是选项，按钮应正常显示（实际 ${slashBtn&&slashBtn.alpha}）`);
console.log('  ✓ 第一幕：左手抬起/右手抬起 已作为选项标在卡片上，且从回应按钮里淡出');

// 按「左手抬起」（M = hug）应等于选选项1 → 进第二幕
await p.keyboard.press('m',{delay:100});
st=await waitScene();
assert.equal(st.index,1,`按左手抬起(M)应当选选项1并进第二幕，实际 index=${st.index}`);

// —— 第二幕：换动作，但槽位没变 ——
const a1=find(st,/【1 \/ ←】/);const b1=find(st,/【2 \/ →】/);
assert.ok(a1&&/手势：右手挥砍/.test(a1.text),`第二幕选项1应换成「右手挥砍」：${a1&&a1.text}`);
assert.ok(b1&&/手势：下压/.test(b1.text),`第二幕选项2应换成「下压」：${b1&&b1.text}`);
console.log('  ✓ 第二幕：动作换成 右手挥砍/下压（幕间换动作生效）');

// 不是这一幕选项的动作（拥抱=hug），仍应只做「回应」、不推进
await p.keyboard.press('h',{delay:100});
st=await waitScene(1200);
assert.equal(st.index,1,`第二幕里「拥抱」不是选项，不该推进故事，实际 index=${st.index}`);
const echo=find(st,/你拥抱了/);
assert.ok(echo,'不是选项的动作被按下时应给出回应文字');
console.log('  ✓ 第二幕：拥抱只做「回应」，不推进故事（同一幕里一个动作不做两件事）');

// 按「下压」（F = dodge）应等于选选项2 → 进第三幕
await p.keyboard.press('f',{delay:100});
st=await waitScene();
assert.equal(st.index,2,`按下压(F)应当选选项2并进第三幕，实际 index=${st.index}`);

// —— 第三幕：左手抬起又回到选项1（动作→槽位没变） ——
const a2=find(st,/【1 \/ ←】/);
assert.ok(a2&&/手势：左手抬起/.test(a2.text),`第三幕选项1应回到「左手抬起」：${a2&&a2.text}`);
console.log('  ✓ 第三幕：左手抬起又回到选项1（换幕换动作，槽位恒不变）');

// 本地剧情是 5 幕（storyData.ts:407-427 每个主题追加了「停下来听呼吸」「看山推来一杯温水」两幕），
// 剩下的幕用键位走完，验的是「能走到结局」而不是写死幕数。
const dialog=p.locator('dialog[aria-label="写给自己的话"]');
await p.keyboard.press('m',{delay:100});
for(let i=0;i<8 && !(await dialog.count());i++){
  await p.waitForTimeout(2600);
  if(!(await dialog.count())) await p.keyboard.press('1',{delay:100});
}
const dialogCount=await dialog.count();
if(dialogCount===0){
  st=await read();
  console.error('  诊断：',JSON.stringify({index:st&&st.index,nodes:st&&st.nodes,transitioning:st&&st.transitioning,hasNoteDialog:st&&st.hasNoteDialog,errors}));
}
assert.equal(dialogCount,1,`走完所有幕应进入「写给自己的话」，实际 index=${st&&st.index} dialog=${dialogCount}`);
console.log('  ✓ 按槽位动作与键位都能推进，走完每一幕进入「写给自己的话」');

assert.deepEqual(errors,[]);
console.log('PASS 逐幕动作：换幕换动作、槽位恒不变；非选项动作仍只做回应');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
