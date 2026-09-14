/**
 * Paints the watercolour illustration that stands for 烦恼 in TroubleScene.
 *
 *   node tools/gen-trouble-art.mjs [--seed 7] [--out public/assets/trouble-cloud.png]
 *
 * Why a hand-rolled renderer instead of SVG + a browser: the sandbox cannot give
 * a Chromium process its IPC pipes, and watercolour is easier to model directly.
 * Pigment is composited as multiply glazes over white paper, alpha accumulates
 * as the washes dry, wet edges darken, dry paper lifts pigment, and the whole
 * thing is finished with paper grain. Everything is procedural but seeded, so
 * the same seed always paints the same picture.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const argOf = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at > -1 ? process.argv[at + 1] : fallback;
};
const SEED = Number(argOf('--seed', 7));
const OUT = path.resolve(root, argOf('--out', 'public/assets/trouble-cloud.png'));
const SIZE = 1024;

/* ------------------------------------------------------------------- random */

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(SEED);
const between = (lo, hi) => lo + rng() * (hi - lo);
const pick = (list) => list[Math.floor(rng() * list.length)];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
};

/* --------------------------------------------------------------------- noise */

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function fbm(x, y, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/* --------------------------------------------------------------- image buffers */

const PIXELS = SIZE * SIZE;
const rgb = new Float32Array(PIXELS * 3).fill(1); // white paper
const alpha = new Float32Array(PIXELS);
const maskBuf = new Float32Array(PIXELS);
const blurBuf = new Float32Array(PIXELS);

/** Irregular wet-edge field, sampled instead of evaluated per pixel for speed. */
const NOISE_W = 256;
const edgeField = new Float32Array(NOISE_W * NOISE_W);
for (let y = 0; y < NOISE_W; y++) {
  for (let x = 0; x < NOISE_W; x++) {
    edgeField[y * NOISE_W + x] = fbm(x / NOISE_W * 5.5, y / NOISE_W * 5.5, 4, SEED + 3) - 0.5;
  }
}

function sampleEdge(x, y, scale = 1, ox = 0, oy = 0) {
  const wrap = (v) => ((v % NOISE_W) + NOISE_W) % NOISE_W;
  const fx = wrap(((x * scale) / SIZE) * NOISE_W + ox);
  const fy = wrap(((y * scale) / SIZE) * NOISE_W + oy);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const x1 = (x0 + 1) % NOISE_W;
  const y1 = (y0 + 1) % NOISE_W;
  const i00 = y0 * NOISE_W + x0;
  const i10 = y0 * NOISE_W + x1;
  const i01 = y1 * NOISE_W + x0;
  const i11 = y1 * NOISE_W + x1;
  const a = edgeField[i00] + (edgeField[i10] - edgeField[i00]) * tx;
  const b = edgeField[i01] + (edgeField[i11] - edgeField[i01]) * tx;
  return a + (b - a) * ty;
}

/* ---------------------------------------------------------------- mask shaping */

/** Signed distance of an ellipse (negative inside). */
function ellipseSdf(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  return (d - 1) * Math.min(rx, ry);
}

function circleSdf(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) - r;
}

function roundedRectSdf(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/** Thick hand-drawn stroke: distance to a jittered polyline. */
function strokeSdf(x, y, points, width) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy || 1e-6;
    const t = clamp01(((x - x1) * dx + (y - y1) * dy) / len);
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best - width / 2;
}

/** Filled shape from a radial radius profile (irregular blobs, droplets). */
function radialSdf(x, y, cx, cy, rx, ry, profile) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-4) return -Math.min(rx, ry);
  const angle = Math.atan2(dy, dx);
  const t = ((angle + Math.PI) / (Math.PI * 2)) * profile.length;
  const i0 = Math.floor(t) % profile.length;
  const i1 = (i0 + 1) % profile.length;
  const f = t - Math.floor(t);
  const u = f * f * (3 - 2 * f);
  const r = profile[i0] + (profile[i1] - profile[i0]) * u;
  return (d / r - 1) * Math.min(rx, ry);
}

/** Smooth random radius profile for organic washes. */
function profile(controlPoints, wobble) {
  const out = [];
  const raw = [];
  for (let i = 0; i < controlPoints; i++) raw.push(1 + (rng() * 2 - 1) * wobble);
  const steps = 4; // smooth between control points so blobs read as poured, not faceted
  for (let i = 0; i < controlPoints; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % controlPoints];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const u = t * t * (3 - 2 * t);
      out.push(a + (b - a) * u);
    }
  }
  return out;
}

function dropletProfile(points = 36) {
  const out = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const up = Math.max(0, -Math.sin(angle));
    out.push(1 + 1.35 * Math.pow(up, 1.5));
  }
  return out;
}

/* -------------------------------------------------------------------- filters */

function boxBlur(src, dst, radius, x0, y0, x1, y1) {
  const r = Math.max(1, Math.round(radius));
  const window = r * 2 + 1;
  const clampX = (x) => (x < x0 ? x0 : x >= x1 ? x1 - 1 : x);
  const clampY = (y) => (y < y0 ? y0 : y >= y1 ? y1 - 1 : y);
  // Horizontal pass.
  for (let y = y0; y < y1; y++) {
    const row = y * SIZE;
    let sum = src[row + x0] * (r + 1);
    for (let i = 1; i <= r; i++) sum += src[row + clampX(x0 + i)];
    for (let x = x0; x < x1; x++) {
      dst[row + x] = sum / window;
      sum += src[row + clampX(x + r + 1)] - src[row + clampX(x - r)];
    }
  }
  // Vertical pass.
  for (let x = x0; x < x1; x++) {
    let sum = dst[y0 * SIZE + x] * (r + 1);
    for (let i = 1; i <= r; i++) sum += dst[clampY(y0 + i) * SIZE + x];
    for (let y = y0; y < y1; y++) {
      src[y * SIZE + x] = sum / window;
      sum += dst[clampY(y + r + 1) * SIZE + x] - dst[clampY(y - r) * SIZE + x];
    }
  }
  return src;
}

function blur(mask, sigma, passes, region) {
  if (sigma <= 0) return mask;
  const radius = Math.max(1, Math.round(sigma * 0.9));
  for (let p = 0; p < passes; p++) boxBlur(mask, blurBuf, radius, ...region);
  return mask;
}

/**
 * Rasterise a signed distance field into a soft coverage mask.
 * `bounds` limits the work to the area a small element can actually touch —
 * without it every spatter dot would scan the whole canvas.
 */
function maskFromSdf(sdf, { feather = 2, sigma = 0, bounds, passes = 2 } = {}) {
  const pad = Math.ceil(sigma * 3) + 2;
  const [rx0, ry0, rx1, ry1] = bounds ?? [0, 0, SIZE, SIZE];
  const x0 = Math.max(0, Math.floor(rx0 - pad));
  const y0 = Math.max(0, Math.floor(ry0 - pad));
  const x1 = Math.min(SIZE, Math.ceil(rx1 + pad));
  const y1 = Math.min(SIZE, Math.ceil(ry1 + pad));
  const region = [x0, y0, x1, y1];
  const full = x0 === 0 && y0 === 0 && x1 === SIZE && y1 === SIZE;
  if (!full) maskBuf.fill(0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // A single non-finite sample would ride the blur's running sums through the
      // whole buffer, so treat it as bare paper instead of poisoning the wash.
      const coverage = clamp01(0.5 - sdf(x, y) / feather);
      maskBuf[y * SIZE + x] = Number.isFinite(coverage) ? coverage : 0;
    }
  }
  return blur(maskBuf, sigma, passes, region);
}

/* ----------------------------------------------------------------- compositing */

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255
];

const PIGMENT = {
  sage: hexToRgb('#8fa596'),
  sageDeep: hexToRgb('#5f7568'),
  sageShadow: hexToRgb('#48604f'),
  teal: hexToRgb('#7d9a94'),
  warmGrey: hexToRgb('#b0a695'),
  paperBloom: hexToRgb('#fffdf6'),
  ink: hexToRgb('#33483e'),
  amber: hexToRgb('#d9a44f'),
  warm2: hexToRgb('#f0c46a'),
  blush: hexToRgb('#e2a795')
};

/**
 * Lay a wash over the paper.
 * multiply = pigment glazing (darkens, accumulates); over = opaque accents.
 * Alpha accumulates either way, which is what makes the dried edge translucent.
 */
function paint(mask, color, strength, blend = 'multiply') {
  const [cr, cg, cb] = color;
  for (let i = 0; i < PIXELS; i++) {
    const m = mask[i] * strength;
    if (m <= 0.0015) continue;
    const a = alpha[i];
    if (blend === 'multiply') {
      const f = 1 - m * (1 - cr);
      rgb[i * 3] *= f;
      rgb[i * 3 + 1] *= 1 - m * (1 - cg);
      rgb[i * 3 + 2] *= 1 - m * (1 - cb);
    } else {
      const na = m + a * (1 - m);
      const keep = (a * (1 - m)) / (na || 1);
      rgb[i * 3] = cr * (1 - keep) + rgb[i * 3] * keep;
      rgb[i * 3 + 1] = cg * (1 - keep) + rgb[i * 3 + 1] * keep;
      rgb[i * 3 + 2] = cb * (1 - keep) + rgb[i * 3 + 2] * keep;
    }
    alpha[i] = m + a * (1 - m);
  }
}

/* ------------------------------------------------------------------ geometry */

const CX = 512;
const CY = 404;
/** The vector cloud lived in a 250 × 75 art box; scale it up to the canvas. */
const S = 2.75;
const px = (x) => CX + x * S;
const py = (y) => CY + y * S;

const PUFFS = [
  [-78, -26, 48],
  [-17, -51, 62],
  [51, -35, 51],
  [99, -5, 36]
];

/** Union distance of the cloud silhouette, its edge roughened by the wet field. */
function cloudSdf(x, y, { noise = 26, scale = 1, offset = 0 } = {}) {
  let d = roundedRectSdf(x, y, px(0), py(9.5), 125 * S, 37.5 * S, 35 * S);
  for (const [cx, cy, r] of PUFFS) d = Math.min(d, circleSdf(x, y, px(cx), py(cy), r * S));
  if (noise > 0) d += sampleEdge(x, y, scale, offset, offset * 0.6) * 2 * noise;
  return d;
}

/* ------------------------------------------------------------------- painting */

function paintHalo() {
  // Damp aura that hugs the silhouette — a broad grey wash would read as dirt.
  const inner = maskFromSdf((x, y) => cloudSdf(x, y, { noise: 34, scale: 0.8, offset: 0 }), { feather: 6, sigma: 45 });
  paint(inner, PIGMENT.sage, 0.07, 'multiply');
  const outer = maskFromSdf((x, y) => cloudSdf(x, y, { noise: 30, scale: 0.85, offset: 20 }) - 38, { feather: 8, sigma: 55 });
  paint(outer, PIGMENT.warmGrey, 0.05, 'multiply');
}

/** Scale a mask by a low-frequency noise field so effects stay irregular. */
function modulate(mask, scale, ox, oy, lo, hi) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (mask[i] <= 0.001) continue;
      const n = clamp01(0.5 + sampleEdge(x, y, scale, ox, oy) * 1.7);
      mask[i] *= lo + (hi - lo) * n;
    }
  }
  return mask;
}

function paintGroundShadow() {
  const cx = px(-4);
  const cy = py(152);
  const rx = 105 * S;
  const ry = 10 * S;
  const m = maskFromSdf(
    (x, y) => ellipseSdf(x, y, cx, cy, rx, ry) + sampleEdge(x, y, 1.4, 30, 12) * 14,
    { sigma: 30, bounds: [cx - rx - 40, cy - ry - 40, cx + rx + 40, cy + ry + 40] }
  );
  paint(m, PIGMENT.sageShadow, 0.19, 'multiply');
}

function paintCloudBody() {
  const passes = [
    { noise: 38, scale: 0.9, offset: 0, sigma: 15, strength: 0.28, color: PIGMENT.sage },
    { noise: 20, scale: 1.25, offset: 40, sigma: 7, strength: 0.34, color: PIGMENT.sage },
    { noise: 12, scale: 1.6, offset: 90, sigma: 3, strength: 0.18, color: PIGMENT.sageDeep }
  ];
  for (const p of passes) {
    const m = maskFromSdf((x, y) => cloudSdf(x, y, p), { feather: 3, sigma: p.sigma });
    paint(m, p.color, p.strength, 'multiply');
  }

  // Wet edge: pigment migrates outward as it dries, so the rim reads darker —
  // but only in patches, otherwise the cloud looks die-cut.
  const rim = maskFromSdf(
    (x, y) => {
      const d = cloudSdf(x, y, { noise: 26, scale: 1.1, offset: 60 });
      return Math.abs(d) - 6 * S; // band straddling the silhouette
    },
    { feather: 4, sigma: 8 }
  );
  paint(modulate(rim, 2.1, 11, 24, 0.15, 1.5), PIGMENT.sageShadow, 0.16, 'multiply');

  // Granulation: heavy pigment settles into irregular pockets.
  for (let i = 0; i < 34; i++) {
    const rx = between(18, 70);
    const ry = between(14, 44);
    const cx = px(between(-120, 120));
    // Bias pockets toward the lower half, where water pools before it dries.
    const cy = py(between(-95, 10) + Math.pow(rng(), 1.6) * 50);
    const prof = profile(7, 0.28);
    const m = maskFromSdf(
      (x, y) => radialSdf(x, y, cx, cy, rx, ry, prof) + sampleEdge(x, y, 1.8, i * 7, i * 3) * 12,
      { sigma: pick([9, 13, 18]), bounds: [cx - rx - 24, cy - ry - 24, cx + rx + 24, cy + ry + 24] }
    );
    paint(m, pick([PIGMENT.sageDeep, PIGMENT.teal, PIGMENT.warmGrey, PIGMENT.sage]), between(0.06, 0.16));
  }

  // Dry paper resists the wash and lifts pale blooms out of it — the cloud top
  // stays lighter, which is also where the light would fall.
  for (let i = 0; i < 12; i++) {
    const rx = between(34, 78);
    const ry = between(22, 52);
    const prof = profile(6, 0.3);
    const cx = px(between(-100, 90));
    const cy = py(between(-95, 30) - (i < 5 ? 26 : 0));
    const m = maskFromSdf((x, y) => radialSdf(x, y, cx, cy, rx, ry, prof), {
      sigma: 16,
      bounds: [cx - rx - 40, cy - ry - 40, cx + rx + 40, cy + ry + 40]
    });
    paint(m, PIGMENT.paperBloom, between(0.2, 0.34), 'over');
  }
}

function paintFace() {
  // Two closed eyes and a small sigh, drawn twice: a damp bleed under a dry line.
  const eye = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = 0.2 + (i / 8) * (Math.PI - 0.4);
      pts.push([cx + Math.cos(a) * r + between(-0.9, 0.9), cy + Math.sin(a) * r * 0.85 + between(-0.9, 0.9)]);
    }
    return pts;
  };
  const sigh = [];
  for (let i = 0; i < 4; i++) sigh.push([px(-5) + (i / 3) * 9 * S * 0.9, py(23) + between(-0.6, 0.6)]);

  const strokes = [eye(px(-29), py(2), 7.4 * S), eye(px(29), py(2), 7.4 * S), sigh];
  const sdf = (x, y, width) => {
    let d = Infinity;
    for (const s of strokes) d = Math.min(d, strokeSdf(x, y, s, width));
    return d;
  };
  if (DEBUG) {
    for (let y = 0; y < SIZE; y += 64) {
      for (let x = 0; x < SIZE; x += 64) {
        const v = sdf(x, y, 5.2 * S);
        if (Number.isNaN(v)) console.log(`    NaN sdf at ${x},${y}`);
      }
    }
  }

  const face = [px(-29) - 7.4 * S * 1.4, py(2) - 7.4 * S * 1.4, px(29) + 7.4 * S * 1.4, py(23) + 7.4 * S * 1.4];
  paint(maskFromSdf((x, y) => sdf(x, y, 6 * S), { feather: 3, sigma: 5, bounds: face }), PIGMENT.ink, 0.18);
  paint(maskFromSdf((x, y) => sdf(x, y, 2.6 * S), { feather: 1.4, sigma: 1.2, bounds: face }), PIGMENT.ink, 0.76);

  // Warm cheeks.
  for (const side of [-1, 1]) {
    const cx = px(47 * side);
    const cy = py(18);
    const m = maskFromSdf(
      (x, y) => ellipseSdf(x, y, cx, cy, 9 * S, 3.6 * S) + sampleEdge(x, y, 3, side * 5, 20) * 6,
      { sigma: 10, bounds: [cx - 9 * S - 20, cy - 3.6 * S - 20, cx + 9 * S + 20, cy + 3.6 * S + 20] }
    );
    paint(m, PIGMENT.blush, 0.3, 'over');
  }
}

function paintRain() {
  // Sparse rain falling out of the cloud, each drop a settled puddle. Two rows
  // so the empty middle of the canvas still reads as weather, not blank paper.
  const drops = [
    [-58, 58, 13],
    [-16, 74, 10],
    [30, 62, 15],
    [72, 80, 9],
    [-44, 96, 8],
    [-10, 126, 11],
    [44, 132, 8]
  ];
  drops.forEach(([x, y, r], i) => {
    const prof = dropletProfile();
    const cx = px(x);
    const cy = py(y);
    const rx = r * S * 0.42;
    const ry = r * S * 0.42;
    const bounds = [cx - rx * 2.5, cy - ry * 3.4, cx + rx * 2.5, cy + ry * 2];
    const jitter = (sx, sy) => (px2, py2) =>
      radialSdf(px2, py2, cx + sx, cy + sy, rx, ry, prof) + sampleEdge(px2, py2, 2.2, i * 13, i * 5) * 7;
    paint(maskFromSdf(jitter(0, 0), { sigma: 6, bounds }), PIGMENT.teal, 0.34);
    paint(maskFromSdf(jitter(between(-3, 3), between(-3, 3)), { sigma: 1.2, bounds }), PIGMENT.sageDeep, 0.3);
  });
}

function paintKnot() {
  // One thread of worry, still tied: the strand leaves the cloud and ends in a
  // knot drawn as a short spiral, so the line visibly crosses itself. Kept
  // short on purpose — the scene needs the painting to stay compact.
  const strand = [];
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    strand.push([
      px(-2 + Math.sin(t * 5.1 + 0.6) * 6) + between(-1.8, 1.8),
      py(50 + t * 62) + between(-1.8, 1.8)
    ]);
  }
  const knotCx = px(2);
  const knotCy = py(124);
  const turns = 1.6;
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const a = t * Math.PI * 2 * turns - Math.PI * 0.5;
    const r = 12 - t * 4; // drawn tight, like a knot pulled closed
    strand.push([knotCx + Math.cos(a) * r + between(-1, 1), knotCy + Math.sin(a) * r * 1.15 + between(-1, 1)]);
  }
  const bounds = [px(-40), py(40), px(50), py(145)];
  const sdf = (x, y, width) => strokeSdf(x, y, strand, width);
  paint(maskFromSdf((x, y) => sdf(x, y, 5 * S), { feather: 3, sigma: 5, bounds }), PIGMENT.ink, 0.16);
  paint(maskFromSdf((x, y) => sdf(x, y, 2.6 * S), { feather: 1.2, sigma: 1, bounds }), PIGMENT.ink, 0.72);
}

function paintFlecks() {
  // A little light already leaking around the cloud — placed outside the
  // silhouette, because amber pigment on top of sage just reads as a stain.
  for (let i = 0; i < 10; i++) {
    const angle = between(Math.PI * 0.95, Math.PI * 2.05); // upper half
    const radius = between(0.92, 1.18);
    const cx = CX + Math.cos(angle) * 330 * radius;
    const cy = CY - 10 + Math.sin(angle) * 250 * radius;
    const r = between(7, 17);
    const m = maskFromSdf((x, y) => radialSdf(x, y, cx, cy, r, r, profile(8, 0.2)), {
      sigma: 11,
      bounds: [cx - r * 2, cy - r * 2, cx + r * 2, cy + r * 2]
    });
    paint(m, PIGMENT.warm2, between(0.12, 0.26), 'over');
  }

  for (let i = 0; i < 140; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = between(0.5, 1.18);
    const cx = CX + Math.cos(angle) * 372 * radius;
    const cy = CY + 24 + Math.sin(angle) * 292 * radius;
    const r = between(1.1, 4.2);
    const m = maskFromSdf((x, y) => radialSdf(x, y, cx, cy, r, r, profile(6, 0.24)), {
      sigma: 1.6,
      bounds: [cx - r * 2, cy - r * 2, cx + r * 2, cy + r * 2]
    });
    paint(m, pick([PIGMENT.sageDeep, PIGMENT.warmGrey, PIGMENT.teal, PIGMENT.warm2]), between(0.06, 0.22));
  }
}

function paintGrain() {
  // Paper tooth, applied only where there is paint to sit on.
  const fine = new Float32Array(PIXELS);
  const fibre = new Float32Array(PIXELS);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      fine[i] = fbm(x * 0.55, y * 0.55, 3, SEED + 5);
      fibre[i] = fbm(x * 0.05, y * 0.42, 3, SEED + 17);
    }
  }
  for (let i = 0; i < PIXELS; i++) {
    const a = alpha[i];
    if (a <= 0.01) continue;
    // Coarse fibre survives being scaled down to a card; the fine tooth is
    // sub-pixel by then and only costs bytes, so it stays faint.
    const g = (fine[i] - 0.5) * 0.07 + (fibre[i] - 0.5) * 0.1;
    const f = 1 + g * a;
    rgb[i * 3] *= f;
    rgb[i * 3 + 1] *= f;
    rgb[i * 3 + 2] *= f;
  }
}

/* ------------------------------------------------------------------ png output */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Flatten the canvas to RGBA rows, optionally box-downscaled by `factor`. */
function canvasRows(factor = 1) {
  const w = Math.floor(SIZE / factor);
  const h = Math.floor(SIZE / factor);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const samples = factor * factor;
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = (y * factor + dy) * SIZE + (x * factor + dx);
          const av = clamp01(alpha[i]);
          r += clamp01(rgb[i * 3]) * av;
          g += clamp01(rgb[i * 3 + 1]) * av;
          b += clamp01(rgb[i * 3 + 2]) * av;
          a += av;
        }
      }
      const at = rowStart + 1 + x * 4;
      if (a / samples <= 0.002) continue; // leaves the RGBA bytes at zero
      raw[at] = Math.round((r / a) * 255);
      raw[at + 1] = Math.round((g / a) * 255);
      raw[at + 2] = Math.round((b / a) * 255);
      raw[at + 3] = Math.round((a / samples) * 255);
    }
  }
  return raw;
}

function pngFromRows(raw, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Bounding box of everything that was actually painted. */
function contentBounds(threshold = 0.03) {
  let minX = SIZE;
  let maxX = -1;
  let minY = SIZE;
  let maxY = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (alpha[y * SIZE + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/* ---------------------------------------------------------------------- main */

const DEBUG = process.argv.includes('--debug');

/** Per-stage sanity check: how much was painted, where, and did anything go NaN. */
function stats(label) {
  if (!DEBUG) return;
  let count = 0;
  let minX = SIZE;
  let maxX = -1;
  let minY = SIZE;
  let maxY = -1;
  let maxA = 0;
  let nan = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const a = alpha[y * SIZE + x];
      if (Number.isNaN(a)) {
        nan++;
        continue;
      }
      if (a > 0.05) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (a > maxA) maxA = a;
      }
    }
  }
  const box = maxX < 0 ? 'empty' : `[${minX},${minY}..${maxX},${maxY}]`;
  console.log(`  ${label.padEnd(16)} px=${String(count).padStart(7)} bbox=${box} maxA=${maxA.toFixed(2)}${nan ? ` NaN=${nan}` : ''}`);
}

paintHalo();
stats('halo');
paintGroundShadow();
stats('ground shadow');
paintCloudBody();
stats('cloud body');
paintFace();
stats('face');
paintRain();
stats('rain');
paintKnot();
stats('knot');
paintFlecks();
stats('flecks');
paintGrain();
stats('grain');

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, pngFromRows(canvasRows(1), SIZE, SIZE));

const bounds = contentBounds();
console.log(`seed ${SEED} -> ${path.relative(root, OUT)} (${SIZE}×${SIZE}, ${(statSync(OUT).size / 1024).toFixed(0)} KB)`);
if (bounds) {
  console.log(`  painted area x ${bounds.minX}..${bounds.maxX}, y ${bounds.minY}..${bounds.maxY} (of ${SIZE})`);
}

if (process.argv.includes('--preview')) {
  // Judging the art at 1024 px is misleading: the game draws it ~290 px wide.
  const scale = 3;
  const previewPath = path.join(root, 'art', `preview-${Math.floor(SIZE / scale)}.png`);
  writeFileSync(previewPath, pngFromRows(canvasRows(scale), Math.floor(SIZE / scale), Math.floor(SIZE / scale)));
  console.log(`  preview -> ${path.relative(root, previewPath)}`);
}
