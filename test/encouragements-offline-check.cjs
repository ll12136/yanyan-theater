// 「拿不到就如实跳过」验收。
//
// 这一条是整套改造里最容易在演示前被临时破功的地方：一紧张就想补一句凑数。
// 所以这里把接口 stub 成空，然后断言：
//   1. 「过来人的话」这一屏整段不出现（不是显示假的、也不是显示占位文案）；
//   2. 页面上不出现任何本地兜底文案（按禁止词表逐条查）；
//   3. 流程照常走到结局，不卡死。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

// 这些词一旦出现在拿不到内容的页面上，就说明有人用本地文案顶替了
const FORBIDDEN=[
  '过来人的话',
  '一字未改',
  '有人也这样',
  '过来人',
  '陌生人给过你',
  '哪句话支撑你',
  '你并不孤单',
  '一切都会好起来'
];

const VOICES={items:[{kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'感觉心累、疲惫、抗拒工作。…',body:'你在工作中是否有过心累、疲惫的感受。',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''}]};

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',r=>{
  const url=r.request().url();
  // 关键：过来人的话一律空——模拟没配密钥或一条都没命中
  if(url.includes('/encouragements')) return r.fulfill({contentType:'application/json',body:'{"items":[],"via":"unavailable"}'});
  if(url.includes('/zhihu/voices')) return r.fulfill({contentType:'application/json',body:JSON.stringify(VOICES)});
  return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
});

const read=()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);
  const state={harvest:game.scene.isActive('HarvestScene'),ending:game.scene.isActive('EndingScene'),phase:'',visible:''};
  if(!state.harvest)return state;
  const s=game.scene.getScene('HarvestScene');const all=[];const visit=l=>{for(const o of l){if(o.type==='Text'&&o.text)all.push({text:o.text,alpha:o.alpha});if(o.list)visit(o.list);}};visit(s.children.list);
  state.phase=s.phase;
  state.visible=all.filter(o=>o.alpha>0.05).map(o=>o.text).join('\n');
  return state;});
const waitFor=async(fn,ms,label)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)throw new Error(`等不到：${label}`);await p.waitForTimeout(250);}};

await p.goto('http://localhost:5174');await p.waitForTimeout(1000);
await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(500);
await p.keyboard.press('d',{delay:100});await p.waitForTimeout(300);
await p.keyboard.press('j',{delay:100});await p.waitForTimeout(600);
await p.keyboard.press('j',{delay:100});
await p.locator('.companions').waitFor({timeout:30000});
await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(1200);
const dialog=p.locator('dialog[aria-label="写给自己的话"]');
for(let i=0;i<12 && !(await dialog.count());i++){await p.keyboard.press('ArrowLeft',{delay:100});await p.waitForTimeout(500);await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(2400);}
await dialog.waitFor({timeout:10000});
await p.getByRole('button',{name:/先不写/}).click();

const live=await waitFor(async()=>{const s=await read();return s.harvest&&s.phase!=='loading'?s:null;},12000,'HarvestScene 起来');
assert.equal(live.phase,'golden',`拿不到内容时应直接进金句相位，现在是 ${live.phase}`);
for(const word of FORBIDDEN){
  assert.equal(live.visible.includes(word),false,`拿不到知乎内容时不该出现「${word}」：这一屏必须整段跳过，不能用本地文案顶替`);
}
console.log('  ✓ 这一屏整段跳过，页面上没有任何本地兜底文案');

// 三句金句照旧（这是固定文案，不属于「过来人的话」）
await waitFor(async()=>{const s=await read();return s.visible.includes('不要责怪曾经的自己，因为他们也很迷茫')?s:null;},20000,'金句出现');
// 走完拥抱 → 结局
await waitFor(async()=>{const s=await read();return s.phase==='hug'?s:null;},20000,'进入拥抱相位');
await p.keyboard.press('h',{delay:80});
await waitFor(async()=>{const s=await read();return s.ending?s:null;},9000,'进入结局页');
console.log('  ✓ 拿不到内容也能走完流程并进入结局页');
await p.screenshot({path:'test/encouragements-offline.png'});
assert.deepEqual(errors,[]);
console.log('PASS 知乎内容取不到时如实跳过，不用本地文案顶替，流程不卡死');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
