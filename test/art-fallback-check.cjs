const { chromium } = require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
// 水彩图加载失败时必须回退到矢量云，且流程不受影响（离线/资源 404 场景）。
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }));
    await page.route('**/trouble-cloud.png', (r) => r.abort());
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Enter', { delay: 100 });
    await page.waitForTimeout(400);
    await page.keyboard.press('j', { delay: 100 });
    await page.waitForTimeout(600);
    const state = await page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="main.ts"]').src);
      const scene = game.scene.getScene('TroubleScene');
      return { phase: scene.phase, textureLoaded: scene.textures.exists('trouble-cloud') };
    });
    await page.screenshot({ path: 'test/art-fallback-check.png' });
    console.log('Fallback to vector cloud:', state.phase === 'manifest' && !state.textureLoaded ? 'PASS' : 'FAIL', state);
    console.log('Browser errors:', errors);
    if (state.phase !== 'manifest' || state.textureLoaded || errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
