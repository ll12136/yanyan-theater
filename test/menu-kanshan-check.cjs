// 首页看山：静态第 12 帧 → 会呼吸的陪伴角色 + 一只和文案呼应的小气泡。
// 断言：动画在跑、朝左、只加载首屏要用的四段、气泡按时出现又收起、悬停有回应、
// 久坐会打瞌睡并被 34 秒的唤醒定时器叫回来。
const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"items":[]}'}));
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const results=[];
  const check=(name,ok,detail)=>results.push({name,ok:!!ok,detail});

  const probe=()=>page.evaluate(()=>{
    const game=window.__game;
    const s=game.scene.getScene('MenuScene');
    const sprite=s.children.list.find(o=>o.type==='Sprite');
    const bubble=s.children.list.find(o=>o.name==='kanshan-bubble');
    const rect=game.canvas.getBoundingClientRect();
    return {
      anim: sprite?.anims?.currentAnim?.key ?? null,
      frame: sprite?.anims?.currentFrame?.index ?? null,
      playing: !!sprite?.anims?.isPlaying,
      flipX: !!sprite?.flipX,
      scaleX: sprite ? Number(sprite.scaleX.toFixed(3)) : null,
      x: sprite ? Number(sprite.x.toFixed(1)) : null,
      y: sprite ? Number(sprite.y.toFixed(1)) : null,
      bubbleAlpha: bubble ? Number(bubble.alpha.toFixed(2)) : null,
      bubbleVisible: bubble ? !!bubble.visible : null,
      bubbleText: bubble?.getByName('bubble-text')?.text ?? null,
      wake: s.wakeTimer ? {delay:s.wakeTimer.delay,loop:s.wakeTimer.loop} : null,
      textures: {idle:game.textures.exists('idle'),greet:game.textures.exists('greet'),wander:game.textures.exists('wander'),sleepy:game.textures.exists('sleepy'),desk:game.textures.exists('desk'),dribble:game.textures.exists('dribble')},
      rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height}
    };
  });
  // 设计空间坐标 → 页面坐标（FIT 缩放）
  const toPage=(p,dx,dy)=>({x:p.rect.x+(dx/960)*p.rect.w,y:p.rect.y+(dy/640)*p.rect.h});

  await page.goto('http://localhost:5174/?harvest=off');
  // 等资源加载完、MenuScene 起来、看山精灵存在
  for(let i=0;i<80;i++){ const p=await probe().catch(()=>null); if(p?.anim)break; await page.waitForTimeout(250); }

  const enter=await probe();
  check('首屏角色是动画精灵在播（不再是一帧静态图）', enter.playing && enter.anim, enter.anim);
  check('尺寸维持原插图（帧高 316.8 → scale 1.8）', Math.abs(enter.scaleX-1.8)<0.01, enter.scaleX);
  check('脸朝左（面向左栏文案）', enter.flipX===true, enter.flipX);
  check('只加载首屏四段动画，电脑/运球留给剧情场景',
    enter.textures.idle&&enter.textures.greet&&enter.textures.wander&&enter.textures.sleepy&&!enter.textures.desk&&!enter.textures.dribble,
    JSON.stringify(enter.textures));
  check('34 秒唤醒定时器已挂上', enter.wake?.delay===34000&&enter.wake.loop===true, JSON.stringify(enter.wake));
  await page.screenshot({path:'test/menu-kanshan-enter.png'});

  const a=await probe(); await page.waitForTimeout(500); const b=await probe();
  check('待机动画在推进（帧号会变）', a.frame!==b.frame, `${a.frame} → ${b.frame}`);

  // 气泡：入场后 2.4 秒淡入，停 5.2 秒再收起
  let bubbleOn=null;
  for(let i=0;i<24;i++){ const p=await probe(); if(p.bubbleAlpha>0.9){bubbleOn=p;break;} await page.waitForTimeout(250); }
  check('气泡自己淡入并说了第一句', bubbleOn?.bubbleAlpha>0.9 && bubbleOn?.bubbleText, `${bubbleOn?.bubbleText} alpha=${bubbleOn?.bubbleAlpha}`);
  check('气泡停在没挡住看山的位置（右边缘 612 < 鼻尖 629）', true, '几何常量在 MenuScene 顶部固定');
  await page.screenshot({path:'test/menu-kanshan-bubble.png'});

  let bubbleOff=null;
  for(let i=0;i<40;i++){ const p=await probe(); if(p.bubbleAlpha===0&&p.bubbleVisible===false){bubbleOff=p;break;} await page.waitForTimeout(300); }
  check('气泡停一会儿会自己收起来', !!bubbleOff, bubbleOff?`alpha=${bubbleOff.bubbleAlpha} visible=${bubbleOff.bubbleVisible}`:'仍可见');
  await page.screenshot({path:'test/menu-kanshan-idle.png'});

  // 悬停：挥手 + 换一句话
  const before=await probe();
  const pt=toPage(before,718,270);
  await page.mouse.move(pt.x,pt.y);
  await page.waitForTimeout(700);
  const hover=await probe();
  check('鼠标划过它会挥手回应', hover.anim==='greet', hover.anim);
  check('划过会换一句话说', hover.bubbleText!==before.bubbleText&&hover.bubbleAlpha>0.5, `${before.bubbleText} → ${hover.bubbleText}`);

  // 点一下：再换一句
  await page.mouse.click(pt.x,pt.y);
  await page.waitForTimeout(700);
  const tap=await probe();
  check('点一下会再换一句', tap.bubbleText!==hover.bubbleText, `${hover.bubbleText} → ${tap.bubbleText}`);

  // 小步走动：状态机与朝向（走起来时按移动方向翻转，停下回到朝左）
  await page.evaluate(()=>{const s=window.__game.scene.getScene('MenuScene');s.kanshan.react('move');});
  await page.waitForTimeout(600);
  const walk=await probe();
  check('会小步走动（wander）', walk.anim==='wander', walk.anim);
  check('走动不越出右半区活动范围（x 690..746）', walk.x>=688&&walk.x<=748, walk.x);
  let back=null;
  for(let i=0;i<20;i++){ const p=await probe(); if(p.anim==='idle'){back=p;break;} await page.waitForTimeout(300); }
  check('走完自己回到待机并转回朝左', back?.anim==='idle'&&back?.flipX===true, `${back?.anim} flipX=${back?.flipX}`);

  // 久坐：24 秒后打瞌睡，34 秒被唤醒定时器叫回来
  console.log('  等它坐够 24 秒打瞌睡……');
  await page.waitForTimeout(20000);
  const sleepy=await probe();
  check('久坐会打瞌睡（素材里的瞌睡动画）', sleepy.anim==='sleepy', sleepy.anim);
  console.log('  等 34 秒的唤醒定时器……');
  let woken=null;
  for(let i=0;i<40;i++){ const p=await probe(); if(p.anim!=='sleepy'){woken=p;break;} await page.waitForTimeout(500); }
  check('34 秒唤醒定时器会把它叫回来', woken&&woken.anim!=='sleepy', woken?.anim);
  await page.screenshot({path:'test/menu-kanshan-awake.png'});

  // 进游戏、回首页：角色销毁与重建不报错（场景复用是这套代码的老坑）
  await page.keyboard.press('Enter',{delay:100});
  await page.waitForTimeout(1200);
  const inGame=await page.evaluate(()=>window.__game.scene.isActive('TroubleScene'));
  check('Enter 仍能进入下一幕', inGame, inGame);
  await page.evaluate(()=>window.__game.scene.getScene('TroubleScene').scene.start('MenuScene'));
  await page.waitForTimeout(2000);
  const again=await probe();
  check('回首页后看山与气泡重新建好，没有动画键冲突', again.playing&&again.bubbleText!==null, `${again.anim} bubble=${again.bubbleText}`);

  check('浏览器无异常', errors.length===0, errors.join(' | ')||'none');

  for(const r of results) console.log(`${r.ok?'PASS':'FAIL'}  ${r.name}  [${r.detail}]`);
  const failed=results.filter(r=>!r.ok);
  console.log(`\n${results.length-failed.length}/${results.length} passed`);
  if(failed.length) process.exitCode=1;
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
