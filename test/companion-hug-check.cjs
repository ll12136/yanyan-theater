// 验收「拥抱 = 点赞入口」与「知乎原文」：
// 走真实 Vite 页面 + 真实服务端（3100）取回的知乎内容，检查
//   1. 三个声音里出现「知乎原文 ↗」，地址就是这条内容的 sourceUrl；
//   2. 按 H 拥抱 → 爱心/暖圈出现、按钮变成「去知乎给它点个赞 ↗」、引擎记下这次互动；
//   3. 点按钮 → window.open 打开的正是知乎真实地址（不是本地点位）；
//   4. 同一条内容重复拥抱不重复计分。
const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert = require('node:assert/strict');

const API_TARGET = 'http://localhost:3100';
const PAGE_URL = 'http://localhost:5174/?harvest=off';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 页面里的 /api 走本机 3100（新代码）而不是 5174 代理到的旧 3000
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      try {
        const upstream = await fetch(`${API_TARGET}${u.pathname}${u.search}`);
        const body = await upstream.text();
        await route.fulfill({ status: upstream.status, contentType: 'application/json', body });
      } catch (e) {
        await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: String(e) }) });
      }
    });
    await page.addInitScript(() => {
      window.__opened = [];
      window.open = (url) => { window.__opened.push(String(url)); return null; };
    });

    const scene = () => page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      return game.scene.getScene('TroubleScene');
    });
    const texts = () => page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      const out = [];
      const visit = (items) => { for (const o of items) { if (o.type === 'Text') out.push(o.text); if (o.list) visit(o.list); } };
      visit(game.scene.getScene('TroubleScene').children.list);
      return out;
    });

    await page.goto(PAGE_URL);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter', { delay: 100 });   // 进 TroubleScene
    await page.waitForTimeout(400);
    await page.keyboard.press('d', { delay: 100 });       // 选一张心事卡
    await page.waitForTimeout(300);
    await page.keyboard.press('j', { delay: 100 });       // 心事实体化
    await page.waitForTimeout(800);                       // 等过 slash 的 550ms 冷却
    await page.keyboard.press('j', { delay: 100 });       // 挥剑 → 取知乎内容

    for (let i = 0; i < 40 && !/想对你说/.test((await texts()).join('\n')); i++) await page.waitForTimeout(500);

    let shown = await texts();
    assert.match(shown.join('\n'), /不是一个人，听听他们怎么说/, '应进入三个声音页');

    // 1. 知乎原文入口
    assert.ok(shown.includes('知乎原文  ↗'), `应有「知乎原文 ↗」按钮，实际文本：${JSON.stringify(shown.slice(-8))}`);

    const voice = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      const s = game.scene.getScene('TroubleScene');
      const v = s.companionPanel.activeVoice;
      return { title: v.title, author: v.author, sourceUrl: v.sourceUrl, via: v.sourceVia, voteCount: v.voteCount, sourceLabel: v.sourceLabel };
    });
    assert.match(voice.sourceUrl, /^https:\/\/www\.zhihu\.com\//, `sourceUrl 应指向知乎真实页面：${voice.sourceUrl}`);

    // 来源署名如实展示，且与真实知乎内容一致
    assert.ok(shown.some((t) => t.startsWith(voice.sourceLabel)), '气泡应展示来源署名');

    await page.screenshot({ path: 'test/hug-before.png' });

    // 拥抱前：任何头像都不该带拥抱记号
    const ringsBefore = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      const s = game.scene.getScene('TroubleScene');
      return s.companionPanel.avatars.reduce(
        (n, c) => n + c.list.filter((o) => o.name === 'hug-ring' && o.visible).length, 0);
    });
    assert.equal(ringsBefore, 0, '拥抱前不应有任何头像带拥抱记号');

    // 2. 按 H 拥抱（趁动画还在截一张，确认爱心真的升起来了）
    await page.keyboard.press('h', { delay: 120 });
    await page.waitForTimeout(320);
    const hearts = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      const s = game.scene.getScene('TroubleScene');
      return s.companionPanel.group.list.filter((o) => o.type === 'Text' && o.text === '❤').length;
    });
    assert.ok(hearts > 0, `拥抱时应有爱心动画，实际 ${hearts} 个`);
    await page.screenshot({ path: 'test/hug-burst.png' });
    await page.waitForTimeout(900);
    shown = await texts();
    assert.ok(shown.includes('去知乎给它点个赞  ↗'), `拥抱后按钮应变成点赞入口，实际：${JSON.stringify(shown.slice(-8))}`);
    assert.equal(shown.includes('知乎原文  ↗'), false, '拥抱后不应再显示「知乎原文」');

    const afterHug = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      const s = game.scene.getScene('TroubleScene');
      const ringCounts = s.companionPanel.avatars.map(
        (c) => c.list.filter((o) => o.name === 'hug-ring' && o.visible).length);
      return { huggedCount: s.companionPanel.huggedCount, ringCounts, workId: s.companionPanel.activeVoice.workId };
    });
    assert.equal(afterHug.huggedCount, 1, '面板应记下 1 次拥抱');
    assert.ok(afterHug.workId, '拥抱的应该是这条知乎内容');
    // 只有被拥抱的那一个头像带记号
    assert.deepEqual(afterHug.ringCounts, [1, 0, 0], `只有被拥抱的头像应带记号，实际 ${JSON.stringify(afterHug.ringCounts)}`);

    await page.screenshot({ path: 'test/hug-after.png' });

    // 3. 点按钮 → 打开知乎真实地址
    // 场景坐标是 960×640 的设计空间；SharpScene 用 camera zoom 提高分辨率，
    // 所以 canvas 逻辑尺寸是 960×density，换算成屏幕像素要按设计空间来除。
    const geo = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      const s = game.scene.getScene('TroubleScene');
      const r = game.canvas.getBoundingClientRect();
      const bg = s.companionPanel.sourceBtn.bg;
      const sx = r.width / 960, sy = r.height / 640;
      return {
        x: r.left + (bg.x + bg.input.hitArea.width / 2) * sx,
        y: r.top + (bg.y + bg.input.hitArea.height / 2) * sy,
        bounds: { x: bg.x, y: bg.y, w: bg.input.hitArea.width, h: bg.input.hitArea.height },
        label: s.companionPanel.sourceBtn.label.text
      };
    });
    await page.mouse.click(geo.x, geo.y);
    await page.waitForTimeout(400);
    console.log(`点击「${geo.label}」 @ ${Math.round(geo.x)},${Math.round(geo.y)}`);
    const opened = await page.evaluate(() => window.__opened);
    assert.equal(opened.length, 1, `点按钮应打开一次链接，实际 ${JSON.stringify(opened)}`);
    assert.equal(opened[0], voice.sourceUrl, '打开的必须是这条内容的知乎真实地址');

    // 4. 同一条内容重复拥抱不重复计数
    await page.keyboard.press('h', { delay: 120 });
    await page.waitForTimeout(800);
    const huggedAgain = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      return game.scene.getScene('TroubleScene').companionPanel.huggedCount;
    });
    assert.equal(huggedAgain, 1, '同一条内容重复拥抱不应重复计数');

    // 5. 走进故事，一路推进到结局卡：这次拥抱要真的被引擎记住
    await page.keyboard.press('j', { delay: 100 });
    await page.waitForTimeout(3000);
    const inStory = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      return game.scene.isActive('StoryScene');
    });
    assert.ok(inStory, '拥抱后仍应能走进故事');

    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('m', { delay: 100 });
      await page.waitForTimeout(1400);
    }
    const ending = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="main.ts"]').src;
      const { game } = await import(src);
      if (!game.scene.isActive('EndingScene')) return null;
      const out = [];
      const visit = (items) => { for (const o of items) { if (o.type === 'Text') out.push(o.text); if (o.list) visit(o.list); } };
      visit(game.scene.getScene('EndingScene').children.list);
      return out;
    });
    assert.ok(ending, '应能一路走到结局场景');
    const hugLine = ending.find((t) => /你拥抱了/.test(t));
    assert.ok(
      hugLine && /你拥抱了 1 个来自知乎的声音/.test(hugLine),
      `结局卡应记下这次拥抱，实际文本：${JSON.stringify(ending)}`
    );
    await page.screenshot({ path: 'test/hug-ending.png' });

    assert.deepEqual(errors, [], `页面不应有报错：${JSON.stringify(errors)}`);
    console.log('PASS 拥抱 = 点赞入口');
    console.log(`  声音      : ${voice.sourceLabel}`);
    console.log(`  原文地址  : ${voice.sourceUrl}  (via ${voice.via})`);
    console.log(`  拥抱后按钮: 去知乎给它点个赞 ↗ → 打开 ${opened[0]}`);
    console.log(`  结局卡    : ${hugLine}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
