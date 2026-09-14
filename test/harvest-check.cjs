// 结算高潮（03 / 04 留住这一刻）流程与留白验收。
//
// 这一屏验的是「顺序」和「留白」，所以过来人的话用桩数据（内容真实性由
// encouragements-check.cjs 走真接口验收）。检查项：
//   1. 「过来人的话」一条条涌上来，每条都带作者名；
//   2. 三句金句逐句浮现；
//   3. 出现「抱住它」的邀请；
//   4. ★ 抱完之后留白：至少 2 秒里画面上没有可见文字，也不许切换场景；
//   5. 留白结束才进结局页。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

const GOLDEN=[
  '不要责怪曾经的自己，因为他们也很迷茫',
  '不要压力现在的自己，因为我们也很努力',
  '不要诋毁未来的自己，因为你们也很骄傲'
];

// 桩：形状与真实接口一致，用来验流程；不是内容真实性的证据
const ENCOURAGEMENTS={items:[
  {author:'潘幸知',quote:'我辞掉那份工作时也整夜睡不着，后来才明白怕的不是没钱，是不知道下一步在哪。',title:'关于辞职',sourceUrl:'https://www.zhihu.com/question/1/answer/1',voteCount:820,matchedQuery:'不想继续现在的工作了',debug:{score:78,reason:'topic=22 narrative=18',verbatim:true}},
  {author:'草芽君Psy',quote:'那两年我一直觉得自己落后了，回头看其实只是走得慢一点。',title:'关于落后',sourceUrl:'https://www.zhihu.com/question/2/answer/2',voteCount:640,matchedQuery:'转行',debug:{score:71,reason:'topic=20 narrative=16',verbatim:true}},
  {author:'动机在杭州',quote:'当时我选择再等半年，不是为了逃避，是想先看清自己到底在怕什么。',title:'关于等待',sourceUrl:'https://www.zhihu.com/question/3/answer/3',voteCount:1500,matchedQuery:'当时我选择再等等',debug:{score:83,reason:'topic=26 narrative=19',verbatim:true}},
  {author:'李松蔚',quote:'我以为自己需要的是一个答案，其实需要的是有人告诉我这样也可以。',title:'关于答案',sourceUrl:'https://www.zhihu.com/question/4/answer/4',voteCount:2100,matchedQuery:'走出来之后回头看',debug:{score:80,reason:'topic=24 narrative=17',verbatim:true}}
]};

const VOICES={items:[{kind:'knowledge',workId:'k1',title:'如何走出职业倦怠？',author:'草芽君Psy',excerpt:'感觉心累、疲惫、抗拒工作。…',body:'你在工作中是否有过心累、疲惫的感受。',sourceLabel:'知乎知识 · 草芽君Psy《如何走出职业倦怠？》',role:'知乎创作者 · 经验分享',sourceUrl:'',sourceVia:'work',voteCount:0,matchedTitle:''}]};

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',r=>{
  const url=r.request().url();
  if(url.includes('/encouragements')) return r.fulfill({contentType:'application/json',body:JSON.stringify(ENCOURAGEMENTS)});
  if(url.includes('/zhihu/voices')) return r.fulfill({contentType:'application/json',body:JSON.stringify(VOICES)});
  return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
});

const read=()=>p.evaluate(async()=>{const {game}=await import(document.querySelector('script[src*="main.ts"]').src);
  if(!game.scene.isActive('HarvestScene'))return {active:false,ending:game.scene.isActive('EndingScene'),phase:'',visible:''};
  const s=game.scene.getScene('HarvestScene');const all=[];const visit=l=>{for(const o of l){if(o.type==='Text'&&o.text)all.push({text:o.text,alpha:o.alpha});if(o.list)visit(o.list);}};visit(s.children.list);
  return {active:true,ending:game.scene.isActive('EndingScene'),phase:s.phase,
    visible:all.filter(o=>o.alpha>0.05).map(o=>o.text).join('\n')};});
const waitFor=async(fn,ms,label)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)throw new Error(`等不到：${label}`);await p.waitForTimeout(250);}};

// 走到剧情结尾（harvest 保持开启）
await p.goto('http://localhost:5174');await p.waitForTimeout(1000);
await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(500);
await p.keyboard.press('d',{delay:100});await p.waitForTimeout(300);
await p.keyboard.press('j',{delay:100});await p.waitForTimeout(600);
await p.keyboard.press('j',{delay:100});
await p.locator('.companions').waitFor({timeout:30000});
await p.getByRole('button',{name:/走进故事/}).click();await p.waitForTimeout(1200);
const dialog=p.locator('dialog[aria-label="写给自己的话"]');
// 选中一条路 → 隔一下再按确认（两段式选择：确认要等 350ms 才生效）
for(let i=0;i<12 && !(await dialog.count());i++){await p.keyboard.press('ArrowLeft',{delay:100});await p.waitForTimeout(500);await p.keyboard.press('Enter',{delay:100});await p.waitForTimeout(2400);}
await dialog.waitFor({timeout:10000});
await p.getByRole('button',{name:/先不写/}).click();

// 1. 过来人的话：一条条涌上来，带作者名
const gathering=await waitFor(async()=>{const s=await read();return s.active&&s.phase!=='loading'?s:null;},15000,'HarvestScene 起来');
const firstShown=await waitFor(async()=>{const s=await read();return s.visible.includes('过来人的话')&&s.visible.includes('@潘幸知')?s:null;},12000,'第一条过来人的话出现');
// 逐条涌上来：第一条已经在时，最后一条应该还没到
const lastQuote=`“${ENCOURAGEMENTS.items[ENCOURAGEMENTS.items.length-1].quote}”`;
if(!firstShown.visible.includes(lastQuote)) console.log('  ✓ 逐条涌上来（首条出现时末条还没到）');
const shown=await waitFor(async()=>{const s=await read();return ENCOURAGEMENTS.items.every(it=>s.visible.includes(`“${it.quote}”`))?s:null;},9000,'全部过来人的话涌上来');
for(const it of ENCOURAGEMENTS.items){
  assert.ok(shown.visible.includes(`“${it.quote}”`),`应显示这条真实摘录：${it.quote.slice(0,16)}…`);
  assert.ok(shown.visible.includes(`—— @${it.author}`),`应标出作者：${it.author}`);
}
assert.match(shown.visible,/一字未改/,'应如实说明这些话一字未改');
console.log(`  ✓ 过来人的话 ${ENCOURAGEMENTS.items.length} 条已涌上来，作者署名完好在场`);

// 2. 三句金句逐句浮现
const golden=await waitFor(async()=>{const s=await read();return GOLDEN.every(g=>s.visible.includes(g))?s:null;},20000,'三句金句全部出现');
assert.ok(golden.phase==='golden'||golden.phase==='hug'||golden.phase==='afterglow',`金句之后相位应前进，现在是 ${golden.phase}`);
console.log('  ✓ 三句金句逐句浮现');

// 3. 出现的「抱住它」
const hug=await waitFor(async()=>{const s=await read();return s.phase==='hug'?s:null;},20000,'进入拥抱相位');
assert.ok(hug.visible.includes('抱住它'),'应出现「抱住它」的邀请');
await p.screenshot({path:'test/harvest-hug.png'});

// 4. 抱完留白：文字退干净之后，至少 2 秒里什么都不发生，也不许切场景
const t0=Date.now();
await p.keyboard.press('h',{delay:80});
const silent=await waitFor(async()=>{const s=await read();return s.visible.trim()===''?s:null;},7000,'画面文字退干净');
const tSilent=Date.now();
assert.equal(silent.ending,false,`文字刚退干净就进了结局页：留白被吃掉了`);
console.log(`  ✓ 抱完 ${tSilent-t0}ms 后画面静下来（只剩怀里的呼吸）`);

const ending=await waitFor(async()=>{const s=await read();return s.ending?s:null;},9000,'进入结局页');
const silenceMs=Date.now()-tSilent;
assert.ok(silenceMs>=1800,`留白应不少于 2 秒，实际只有 ${silenceMs}ms（AFTERGLOW_MS 被改小了？）`);
assert.ok(ending,'留白之后应进入结局页');
console.log(`  ✓ 静默 ${silenceMs}ms 之后才进结局页`);

assert.deepEqual(errors,[]);
console.log('PASS 结算顺序正确：涌上来 → 三句金句 → 拥抱 → 留白 ≥2 秒 → 结局页');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
