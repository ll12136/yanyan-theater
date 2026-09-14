// 首屏粒子字标：整屏散开 → 收拢成字标 → 一直抖着躲鼠标。
// 断言：粒子建出来了且不超过 3200、开场确实从散开位置收拢、收敛后落点就是字模、
// 字标图层垫在所有文字之下（同 depth 按插入顺序）、鼠标划过会把粒子推开、
// 减少动效时退化为静态、回首页重建不叠第二层。
//
// 注意：这里不能用 Enter 离场。首屏 Enter 绑的是 startGame() → login()，会把页面导航到
// /api/auth/zhihu/login，之后所有 page.evaluate 都会悬住。换幕一律用 scene.start()。
const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(15000);
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"items":[]}'}));
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const results=[];
  const check=(name,ok,detail)=>{results.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name}  [${detail}]`);};

  const probe=()=>page.evaluate(()=>{
    const game=window.__game;
    const s=game.scene.getScene('MenuScene');
    const w=s.wordmark;
    const list=s.children.list;
    const ps=(w&&w.particles)||[];
    let far=0,maxErr=0,minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
    for(const p of ps){
      const e=Math.hypot(p.hx-p.x,p.hy-p.y);
      if(e>25)far++;
      if(e>maxErr)maxErr=e;
      if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y;
    }
    const textIdx=list.map((o,i)=>o.type==='Text'?i:-1).filter(i=>i>=0);
    const dotIdx=list.findIndex(o=>o===w?.dots);
    const rect=game.canvas.getBoundingClientRect();
    return {
      ready:!!(w&&w.ready), burst:!!(w&&w.burst), reduced:!!(w&&w.reduced),
      pointerEnabled:!!(w&&w.pointerEnabled),
      count:ps.length, far, maxErr:Number(maxErr.toFixed(1)),
      box:ps.length?{minX:Math.round(minX),maxX:Math.round(maxX),minY:Math.round(minY),maxY:Math.round(maxY)}:null,
      dotIdx, textCount:textIdx.length, firstTextIdx:textIdx.length?Math.min(...textIdx):null,
      graphicsTotal:list.filter(o=>o.type==='Graphics').length,
      cfg:w?{x:w.o.x,y:w.o.y,maxWidth:w.o.maxWidth,maxHeight:w.o.maxHeight}:null,
      xs:ps.slice(0,120).map(p=>Number(p.x.toFixed(2))),
      sample:ps.slice(0,3).map(p=>({x:Number(p.x.toFixed(2)),y:Number(p.y.toFixed(2)),s:p.s,a:Number(p.a.toFixed(3)),c:p.c})),
      rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height}
    };
  });
  // 设计空间坐标 → 页面坐标（FIT 缩放），与 menu-kanshan-check.cjs 同一套
  const toPage=(p,dx,dy)=>({x:p.rect.x+(dx/960)*p.rect.w,y:p.rect.y+(dy/640)*p.rect.h});
  const near=(cx,cy,r)=>page.evaluate(([cx,cy,r])=>{
    const w=window.__game.scene.getScene('MenuScene').wordmark;let n=0,sum=0,off=0;
    for(const p of w.particles){const d=Math.hypot(p.x-cx,p.y-cy);if(d<r){n++;sum+=d;off+=Math.hypot(p.hx-p.x,p.hy-p.y)}}
    return {n,mean:n?Number((sum/n).toFixed(1)):0,offHome:n?Number((off/n).toFixed(2)):0};
  },[cx,cy,r]);

  await page.goto('http://localhost:5174/?harvest=off');
  let enter=null;
  for(let i=0;i<120;i++){ const p=await probe().catch(()=>null); if(p?.ready){enter=p;break;} await page.waitForTimeout(100); }
  check('首屏存在粒子字标且粒子已建好', enter?.ready&&enter?.count>0, `count=${enter?.count}`);
  check('粒子数不超过原站口径的 3200', enter&&enter.count<=3200, enter?.count);
  check('开场就在 burst：粒子还没归位（离散着）', enter?.burst===true&&enter?.far>0, `burst=${enter?.burst} far=${enter?.far}`);
  await page.screenshot({path:'test/menu-particle-burst.png'});

  // 确定性重放一次开场：直接重建粒子，量收敛曲线（不靠抢时间点）
  await page.evaluate(()=>window.__game.scene.getScene('MenuScene').wordmark.build());
  const t0=await probe();
  await page.waitForTimeout(400);
  const t1=await probe();
  await page.waitForTimeout(2200);
  const t2=await probe();
  check('重建后粒子从整屏随机位置出发（归位误差大）', t0.maxErr>50, `maxErr=${t0.maxErr}`);
  check('弹簧把它往字标收（误差一路下降）', t1.maxErr<t0.maxErr&&t2.maxErr<t1.maxErr,
    `${t0.maxErr} → ${t1.maxErr} → ${t2.maxErr}`);
  check('收敛完成：burst 结束、粒子几乎全部归位', t2.burst===false&&t2.maxErr<3, `burst=${t2.burst} maxErr=${t2.maxErr}`);

  // 形状与落点：断言跟着 MenuScene 里的配置走，不写死坐标，
  // 这样以后挪字标、换字号都不用改这里——只保证「落点合理、没被切掉」。
  const box=t2.box;
  const boxW=box?box.maxX-box.minX:0, boxH=box?box.maxY-box.minY:0;
  check('字标完整落在设计空间内（没被画布边缘切掉）',
    box&&box.minX>=0&&box.minY>=0&&box.maxX<=960&&box.maxY<=640, JSON.stringify(box));
  // 横向：画字用的是 textAlign:center，墨迹中心应当贴着配置的 x。
  // 纵向：textBaseline:middle 居中在 em 框上，中文墨迹实际会偏上一些，所以纵向容差给宽。
  check('落点包围盒中心贴着配置的字标落点',
    box&&Math.abs((box.minX+box.maxX)/2-t2.cfg.x)<=20&&Math.abs((box.minY+box.maxY)/2-t2.cfg.y)<=60,
    `ink=(${Math.round((box.minX+box.maxX)/2)},${Math.round((box.minY+box.maxY)/2)}) cfg=(${t2.cfg.x},${t2.cfg.y})`);
  check('字标有实际面积（横向两字，不是一条线或一个点）',
    boxW>=150&&boxH>=80&&boxW/boxH>1.2&&boxW/boxH<3.2, `w=${boxW} h=${boxH}`);
  check('粒子三档颜色与 2~4px 边长（原站的观感参数）',
    t2.sample.length===3&&t2.sample.every(p=>p.s>=2&&p.s<=4)&&new Set(t2.sample.map(p=>p.c)).size>=2,
    JSON.stringify(t2.sample));
  await page.screenshot({path:'test/menu-particle-settled.png'});

  // 层级：字标 Graphics 必须排在任何 Text 之前（同 depth 按插入顺序绘制）
  check('字标垫在所有文字之下（否则会盖住标题和左栏文案）',
    t2.dotIdx>=0&&t2.firstTextIdx!==null&&t2.dotIdx<t2.firstTextIdx,
    `dotIdx=${t2.dotIdx} firstTextIdx=${t2.firstTextIdx} texts=${t2.textCount}`);

  // 一直在动：抖动让它不是一张静态贴图
  check('粒子位置逐帧在变（弹簧抖动还活着）', t1.xs.join()!==t2.xs.join(), '前 120 颗位置不同');

  // 鼠标斥力：把指针停在字标中心，周围一圈粒子应该被推空。
  // 落点必须取配置值——写死坐标的话，一旦挪了字标就会对着空气测，断言假失败。
  const center=toPage(t2,t2.cfg.x,t2.cfg.y);
  const before=await near(t2.cfg.x,t2.cfg.y,70);
  await page.mouse.move(center.x,center.y);
  await page.waitForTimeout(900);
  const after=await near(t2.cfg.x,t2.cfg.y,70);
  check('鼠标划过会把粒子推开（近处一圈变稀）', after.n<before.n, `近邻 ${before.n} → ${after.n}`);
  // 更硬的信号：斥力与弹簧较劲，会把近处的粒子顶离自己的归位点
  check('被顶开的粒子明显偏离归位点（斥力真的在起作用）', after.offHome>before.offHome*3,
    `离位距离 ${before.offHome} → ${after.offHome}`);
  await page.screenshot({path:'test/menu-particle-hover.png'});
  // 移出画布后光晕要收掉，不能留在原地
  await page.mouse.move(5,5);
  await page.waitForTimeout(400);
  const glowOff=await page.evaluate(()=>{
    const w=window.__game.scene.getScene('MenuScene').wordmark;
    return w.glow?w.glow.visible:null;
  });
  check('指针离开画布后光晕收起', glowOff===false, `visible=${glowOff}`);

  // 回首页：重建一层，不能叠出第二层（走 Trouble 再回来，覆盖场景复用那条老坑）
  // scene.start() 返回的是 Phaser 对象，直接当 evaluate 的返回值会让 Playwright 序列化失败，
  // 所以这里必须用花括号包住、不返回任何东西。
  const gBefore=t2.graphicsTotal;
  await page.evaluate(()=>{window.__game.scene.getScene('MenuScene').scene.start('TroubleScene');});
  await page.waitForTimeout(900);
  await page.evaluate(()=>{window.__game.scene.getScene('TroubleScene').scene.start('MenuScene');});
  let again=null;
  for(let i=0;i<80;i++){ const p=await probe().catch(()=>null); if(p?.ready&&p?.count>0){again=p;break;} await page.waitForTimeout(150); }
  check('回首页后字标重新建好', again?.ready&&again?.count>0, `count=${again?.count}`);
  check('回首页没有叠出第二层 Graphics', again&&again.graphicsTotal===gBefore,
    `${gBefore} → ${again?.graphicsTotal}`);
  check('回首页场景复用没报错', errors.length===0, errors.join(' | ')||'none');

  // 减少动效：直接给静态字标，不起补间
  const rm=await browser.newPage({viewport:{width:1440,height:1000}});
  rm.setDefaultTimeout(15000);
  await rm.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"items":[]}'}));
  await rm.emulateMedia({reducedMotion:'reduce'});
  await rm.goto('http://localhost:5174/?harvest=off');
  let rp=null;
  for(let i=0;i<80;i++){
    rp=await rm.evaluate(()=>{
      const w=window.__game?.scene?.getScene('MenuScene')?.wordmark;
      if(!w||!w.ready)return null;
      let maxErr=0;for(const p of w.particles)maxErr=Math.max(maxErr,Math.hypot(p.hx-p.x,p.hy-p.y));
      return {reduced:w.reduced,burst:w.burst,maxErr:Number(maxErr.toFixed(1)),pointerEnabled:w.pointerEnabled,count:w.particles.length};
    }).catch(()=>null);
    if(rp)break; await rm.waitForTimeout(150);
  }
  check('prefers-reduced-motion 时退化为静态字标（不 burst、不自走）',
    rp&&rp.reduced===true&&rp.burst===false&&rp.maxErr<3, JSON.stringify(rp));
  check('减少动效时不绑指针（省掉一层监听）', rp?.pointerEnabled===false, `pointerEnabled=${rp?.pointerEnabled}`);
  await rm.screenshot({path:'test/menu-particle-reduced.png'});
  await rm.close();

  const failed=results.filter(r=>!r.ok);
  console.log(`\n${results.length-failed.length}/${results.length} passed`);
  if(failed.length) process.exitCode=1;
  await browser.close();
})().catch(e=>{
  // 这里必须显式退出：只设 exitCode 的话浏览器进程会一直挂着，node 事件循环不空，脚本永远不结束。
  console.error('HARNESS ERROR',e&&e.message);
  process.exit(1);
});
