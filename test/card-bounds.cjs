const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert = require('node:assert/strict');

// 心事卡排版回归：长标题、长描述都不许冲出卡片。
// 两个坑都真踩过：
//   ① 描述行既没有换行宽度、截断又只按高度算（11px 那行高度本来就低于上限），
//      于是 24 个汉字约 273px 直接冲出卡片右边 40px，压到旁边那张卡上；
//   ② 本地兜底心事排在列表最前面，只量第 0 页的话，从接口来的长内容永远量不到——
//      这个用例以前就是这么空转通过的。
const LONG_ITEMS = [
  ['知乎热议 · 权谋', '如何走出职业倦怠？', '你在工作中是否有过或者正在经历着这样一些体验：感觉心累、疲惫，早上不想起床，对什么事都提不起兴趣。'],
  ['知乎热议 · 大家都想问', '拯救注意力分散：使专注力提升', '在上课时发呆和走神的时间越来越多，总是不记得老师刚刚讲过什么，作业也一拖再拖。'],
  ['知乎热议 · 悬疑', '「不懂拒绝，事事操心」', '拒绝别人是人生中遭遇的一件很难的事情，但是不懂拒绝会让你背负越来越多的东西。'],
  ['知乎热议 · 大家都想问', '年轻人 在职场：我们是如何陷入', '作为一名无关系、无背景的职场小白，我们常常渴望逆袭，但现实往往比想象中更难。'],
  ['知乎热议 · 大家都想问', '职场：如何让老板给我升职加薪', '大家好，今天我们来聊一个大家都非常关心和感兴趣的话题，关于升职加薪的那些事。'],
  ['知乎热议 · 悬疑', '如何从心理被动的人慢慢变', '绝大部分的退缩、被动行为都和自我概念有关，这一点不改变，学再多技巧也没用。']
].map(([categoryLabel, title, desc], i) => ({ id: `long-${i}`, category: 'real', categoryLabel, text: `${title}\n${desc}` }));

(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page = await browser.newPage();
  await page.route('**/api/**', r=>{
    // 登录态单独给：没有这条，菜单按 Enter 会跳到知乎授权页，后面全跑不到。
    // （写在一个 handler 里而不是叠两条 route，免得依赖注册顺序决定谁生效。）
    if(r.request().url().includes('/api/auth/status'))
      return r.fulfill({status:200,contentType:'application/json',body:'{"configured":false,"loggedIn":false}'});
    return r.fulfill({json:{items:Array.from({length:12},(_,i)=>({title:'如何面对职场压力和不确定的未来？'.repeat(i===0?12:1),description:'这是一段非常长的真实内容摘要。'.repeat(40),labels:['职场'.repeat(30)]}))}});
  });
  await page.goto('http://localhost:5174');
  await page.waitForFunction(()=>window.__game?.scene.isActive('MenuScene'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__game.scene.getScene('TroubleScene').cards.length===6);

  // ① 端到端：这一页（本地兜底心事）的文字要留在卡片里
  const overflow=await page.evaluate(()=>window.__game.scene.getScene('TroubleScene').cards.flatMap(c=>c.list.filter(t=>t.type==='Text').filter(t=>t.y-t.height*t.originY < -60 || t.y+t.height*(1-t.originY)>60 || t.width>220).map(t=>t.text)));
  assert.deepEqual(overflow,[],'Card text must stay inside its allocated bounds');

  // ② 真实长度的文案直接喂给渲染路径：接口来的长内容在后面的分组里，
  //    只量第 0 页会空转。三行文字都必须落在卡片左右边界内。
  const longOverflow=await page.evaluate((items)=>{
    const s=window.__game.scene.getScene('TroubleScene');
    s.troubleList=items; s.renderedPage=-1; s.renderCards();
    const out=[];
    for(const c of s.cards){
      const [,category,title,count]=c.list;
      const left=c.x-125, right=c.x+125;
      for(const t of [category,title,count]){
        const b=t.getBounds();
        if(b.right>right+0.5||b.left<left-0.5)
          out.push(`「${t.text}」 ${Math.round(b.left)}~${Math.round(b.right)} 超出卡片 ${left}~${right}`);
      }
    }
    return out;
  }, LONG_ITEMS);
  assert.deepEqual(longOverflow,[],'长标题与长描述也必须留在卡片内');

  for(const [name,width,height] of [['desktop',1440,960],['mobile',390,844]]){
   await page.setViewportSize({width,height}); await page.waitForTimeout(400);
   await page.screenshot({path:`test/cards-fixed-${name}.png`});
  }
  console.log('PASS 长标题与长描述都留在卡片内（含直接喂长文案的渲染路径），桌面/移动尺寸均已截图');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
