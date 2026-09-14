/**
 * 把「刘看山」动态 GIF 烘焙成 Phaser 能播的 sprite sheet。
 *
 *   node tools/gen-avatar-art.mjs
 *   node tools/gen-avatar-art.mjs --src "D:/Zhi_Hei/刘看山素材包/刘看山动态" --out public/assets/avatars
 *
 * 为什么需要这一步：Phaser 3.90 没有 GIF 解码器（loader/filetypes 下没有 GifFile），
 * 直接把 gif 交给 load.image 只会拿到第一帧。这里用 Chromium 播一遍 GIF，
 * 按时间轴取出不重复的帧，裁剪成同一套构图后，横排成一张 sprite sheet。
 *
 * 输出与 src/ui/companions.css 的 comp-avatar-play 动画一一对应：每张 24 帧、格子 128×128，
 * 运行时按 background-size:1008px 42px（24 帧 × 42px）用 steps(24) 平移。
 * 改动这里的 FRAMES/CELL 时，必须同步改那个 CSS。
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/');
const { chromium } = require('playwright');

const argOf = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at > -1 ? process.argv[at + 1] : fallback;
};

const SRC = path.resolve(argOf('--src', path.join(root, 'tools/assets/kanshan')));
const OUT = path.resolve(root, argOf('--out', 'public/assets/avatars'));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

/** 每张表的帧数与格子边长，必须与 src/ui/companions.css 的 steps(24) 和 1008px 一致 */
const FRAMES = 24;
const CELL = 128;

/** 三个声音各用一种动态；顺序即头像下标顺序 */
const CLIPS = [
  { key: 'kanshan-greet', match: /打招呼/, seconds: 4 },
  { key: 'kanshan-idle', match: /待机/, seconds: 5 },
  { key: 'kanshan-desk', match: /电脑/, seconds: 6 }
];

function pickSource(match) {
  const files = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.gif'));
  const hit = files.find((f) => match.test(f));
  if (!hit) throw new Error(`在 ${SRC} 里找不到匹配 ${match} 的 GIF，现有：${files.join('、')}`);
  return path.join(SRC, hit);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
mkdirSync(OUT, { recursive: true });

try {
  const page = await browser.newPage();
  // WebCodecs 的 ImageDecoder 只在安全上下文可用：用拦截出来的 https 源当捕获页
  await page.route('https://kanshan.local/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>avatar capture</title>' })
  );
  await page.goto('https://kanshan.local/');

  for (const clip of CLIPS) {
    const file = pickSource(clip.match);
    const bytes = statSync(file).size;
    // 把 GIF 以 data URL 交给页面，避免给 file:// 开权限
    const dataUrl = `data:image/gif;base64,${(await import('node:fs')).readFileSync(file).toString('base64')}`;

    const result = await page.evaluate(
      async ({ src, frames, cell }) => {
        // Chromium 不会在无头页面里推进 <img> 的 GIF 动画（drawImage 永远拿第一帧），
        // 所以用 WebCodecs 的 ImageDecoder 逐帧解码。
        if (typeof ImageDecoder === 'undefined') throw new Error('当前浏览器没有 ImageDecoder，无法逐帧解码 GIF');
        const bytes = await (await fetch(src)).arrayBuffer();
        const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
        await decoder.tracks.ready;
        const track = decoder.tracks.selectedTrack;
        const total = track.frameCount;

        const scratch = document.createElement('canvas');
        const probe = (image) => {
          scratch.width = image.displayWidth;
          scratch.height = image.displayHeight;
          const sctx = scratch.getContext('2d', { willReadFrequently: true });
          sctx.clearRect(0, 0, scratch.width, scratch.height);
          sctx.drawImage(image, 0, 0);
          return sctx.getImageData(0, 0, scratch.width, scratch.height);
        };
        // 每 4 个像素取一个，四个通道都参与，避免漏掉只动一小块（挥手、眨眼）的帧
        const hashOf = (data) => {
          let hash = 2166136261;
          for (let i = 0; i < data.length; i += 16) {
            hash ^= data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11;
            hash = Math.imul(hash, 16777619);
          }
          return hash >>> 0;
        };

        // 第一遍：逐帧解码，记下去重后的真实帧序号
        const distinct = [];
        const seen = new Set();
        for (let i = 0; i < total; i++) {
          const { image } = await decoder.decode({ frameIndex: i });
          const hash = hashOf(probe(image).data);
          image.close();
          if (seen.has(hash)) continue;
          seen.add(hash);
          distinct.push(i);
        }
        if (distinct.length === 0) throw new Error('没有解出任何帧');

        // 等距取 frames 帧（去重后不足则允许重复，保证表长固定）
        const pickedIndexes = [];
        for (let i = 0; i < frames; i++) {
          pickedIndexes.push(distinct[Math.min(distinct.length - 1, Math.round((i * distinct.length) / frames))]);
        }

        // 第二遍：取选中的帧，先算非透明区域的并集包围盒，保证三条动画构图一致
        const kept = [];
        for (const index of pickedIndexes) {
          const { image } = await decoder.decode({ frameIndex: index });
          kept.push(image);
        }
        const w = kept[0].displayWidth;
        const h = kept[0].displayHeight;
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (const image of kept) {
          const d = probe(image).data;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (d[(y * w + x) * 4 + 3] > 16) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }
        }
        if (maxX < 0) throw new Error('所有帧都是透明的');

        const side = Math.min(Math.max(w, h), Math.ceil(Math.max(maxX - minX, maxY - minY) * 1.18));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const sx = Math.max(0, Math.min(w - side, cx - side / 2));
        const sy = Math.max(0, Math.min(h - side, cy - side / 2));

        // 第三遍：横排成一张 sprite sheet
        const sheet = document.createElement('canvas');
        sheet.width = cell * frames;
        sheet.height = cell;
        const sheetCtx = sheet.getContext('2d', { willReadFrequently: true });
        sheetCtx.imageSmoothingEnabled = true;
        sheetCtx.imageSmoothingQuality = 'high';
        kept.forEach((image, i) => {
          sheetCtx.drawImage(image, sx, sy, side, side, i * cell, 0, cell, cell);
          image.close();
        });

        const check = sheetCtx.getImageData(0, 0, cell, cell).data;
        let opaque = 0;
        for (let i = 3; i < check.length; i += 4) if (check[i] > 16) opaque++;

        // 相邻帧的差异，用来确认动作幅度确实进了表里
        const first = sheetCtx.getImageData(0, 0, cell, cell).data;
        const mid = sheetCtx.getImageData(Math.floor(frames / 2) * cell, 0, cell, cell).data;
        let moved = 0;
        for (let i = 0; i < first.length; i += 4) if (Math.abs(first[i + 3] - mid[i + 3]) > 16) moved++;

        return {
          png: sheet.toDataURL('image/png'),
          source: { w, h },
          total,
          unique: distinct.length,
          crop: { x: Math.round(sx), y: Math.round(sy), side },
          fill: Number((opaque / (cell * cell)).toFixed(3)),
          moved: Number((moved / (cell * cell)).toFixed(3))
        };
      },
      { src: dataUrl, frames: FRAMES, cell: CELL }
    );

    const outFile = path.join(OUT, `${clip.key}.png`);
    writeFileSync(outFile, Buffer.from(result.png.split(',')[1], 'base64'));
    const frameMs = Math.round((clip.seconds * 1000) / FRAMES);
    console.log(
      `${clip.key}: ${path.basename(file)} → ${path.basename(outFile)}  ` +
        `${FRAMES} 帧 / ${CELL}px / 源 ${result.source.w}×${result.source.h} / 共 ${result.total} 帧、去重 ${result.unique} 帧 / ` +
        `裁剪 ${result.crop.side}² @(${result.crop.x},${result.crop.y}) / 非透明 ${(result.fill * 100).toFixed(1)}% / ` +
        `首帧与中帧差异 ${(result.moved * 100).toFixed(1)}% / ` +
        `${Math.round(statSync(outFile).size / 1024)}KB / frameMs=${frameMs}`
    );
    console.log(`  → companions.css: animation-duration ${clip.seconds}s / steps(${FRAMES}) / background-size ${FRAMES * 42}px 42px`);
  }
} finally {
  await browser.close();
}
