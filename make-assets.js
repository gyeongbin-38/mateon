/* MATE:ON 에셋 생성 — 순수 Node PNG 인코더 (zlib 내장)
   og-image.png(1200x630), icon-192.png, icon-512.png 생성 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------- CRC32 / PNG chunks ---------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 도형 ---------- */
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
const CORAL = [255, 107, 122], BLUE = [107, 158, 255], INK = [46, 46, 46], WHITE = [255, 255, 255];

function drawLogo(px, W, H, ox, oy, scale, mono) {
  const circles = [[38, 15, 10], [90, 15, 10]];
  // 공식 심볼: 두 몸통 스트로크가 정점에서 교차하며 지붕 아치 형성 (Q곡선 다각선 근사)
  const strokes = [
    // coral (26,94)→(26,56)→Q(44,33)→(60,27)→Q(68,37)→(73,52)
    [[26, 94], [26, 56]], [[26, 56], [31, 44]], [[31, 44], [44, 33]],
    [[44, 33], [52, 30]], [[52, 30], [60, 27]],
    [[60, 27], [64, 32]], [[64, 32], [68, 37]], [[68, 37], [70.5, 44.5]], [[70.5, 44.5], [73, 52]],
    // blue (102,94)→(102,56)→Q(84,33)→(68,27)→Q(60,37)→(55,52)
    [[102, 94], [102, 56]], [[102, 56], [97, 44]], [[97, 44], [84, 33]],
    [[84, 33], [76, 30]], [[76, 30], [68, 27]],
    [[68, 27], [64, 32]], [[64, 32], [60, 37]], [[60, 37], [57.5, 44.5]], [[57.5, 44.5], [55, 52]],
  ];
  const rects = [[54, 64], [66, 64], [54, 78], [66, 78]];
  const sw = 16 / 2;
  const LW = Math.ceil(128 * scale), LH = Math.ceil(104 * scale);
  for (let ly = 0; ly < LH; ly++) {
    const v = ly / scale, Y = Math.round(oy + ly);
    if (Y < 0 || Y >= H) continue;
    for (let lx = 0; lx < LW; lx++) {
      const u = lx / scale, X = Math.round(ox + lx);
      if (X < 0 || X >= W) continue;
      let col = null;
      circles.forEach(([cx, cy, r], ci) => {
        if (Math.hypot(u - cx, v - cy) <= r) col = mono ? WHITE : (ci === 0 ? CORAL : BLUE);
      });
      strokes.forEach(([a, b], si) => {
        if (distSeg(u, v, a[0], a[1], b[0], b[1]) <= sw) col = mono ? WHITE : (si < 9 ? CORAL : BLUE);
      });
      rects.forEach(([rx, ry]) => {
        if (u >= rx && u <= rx + 8 && v >= ry && v <= ry + 8) col = mono ? [255, 66, 85] : INK;
      });
      if (col) {
        const i = (Y * W + X) * 4;
        px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
      }
    }
  }
}

/* ---------- 배경 ---------- */
function lerp(a, b, t) { return a + (b - a) * t; }
function hex(hx) { return [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)]; }
function makeCanvas(w, h) { return Buffer.alloc(w * h * 4); }
function fillGradient(px, w, h, c1, c2) {
  for (let y = 0; y < h; y++) {
    const c = [0, 1, 2].map(i => lerp(c1[i], c2[i], y / h));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
}
function fillRadialGlow(px, w, h, cx, cy, r, c, a) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d < 1) {
      const t = (1 - d) * a, i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) px[i + k] = lerp(px[i + k], c[k], t);
    }
  }
}
function boxDown(px, w2, h2, W, H) {
  const small = makeCanvas(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    for (let k = 0; k < 4; k++) {
      const a = ((y * 2) * w2 + x * 2) * 4 + k;
      small[i + k] = (px[a] + px[a + 4] + px[a + w2 * 4] + px[a + w2 * 4 + 4]) / 4;
    }
  }
  return small;
}

/* ---------- 생성 ---------- */
const out = path.join(__dirname, 'assets');
fs.mkdirSync(out, { recursive: true });

// og-image 1200x630
{
  const W = 1200, H = 630, S = 2, w2 = W * S, h2 = H * S;
  const px = makeCanvas(w2, h2);
  fillGradient(px, w2, h2, hex('#FFF5F6'), hex('#F0F5FF'));
  fillRadialGlow(px, w2, h2, w2 * 0.5, h2 * 0.15, w2 * 0.45, hex('#FFC2C8'), 0.55);
  fillRadialGlow(px, w2, h2, w2 * 0.12, h2 * 0.95, w2 * 0.3, hex('#C2D7FF'), 0.5);
  const sc = 3.4 * S;
  drawLogo(px, w2, h2, (w2 - 128 * sc) / 2, (h2 - 104 * sc) / 2 - 20 * S, sc, false);
  fs.writeFileSync(path.join(out, 'og-image.png'), encodePNG(W, H, boxDown(px, w2, h2, W, H)));
  console.log('og-image.png', W + 'x' + H);
}

// icons — 브랜드 배경 + 흰 로고
for (const size of [192, 512]) {
  const S = 2, w2 = size * S;
  const px = makeCanvas(w2, w2);
  fillGradient(px, w2, w2, hex('#FF8591'), hex('#FF4255'));
  fillRadialGlow(px, w2, w2, w2 * 0.5, w2 * 0.35, w2 * 0.6, hex('#FF99A3'), 0.4);
  const sc = size * 0.005 * S;
  drawLogo(px, w2, w2, (w2 - 128 * sc) / 2, (w2 - 104 * sc) / 2, sc, true);
  const small = boxDown(px, w2, w2, size, size);
  const r = size * 0.22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const cx = Math.max(r, Math.min(size - r, x));
    const cy = Math.max(r, Math.min(size - r, y));
    if (Math.hypot(x - cx, y - cy) > r) small[i + 3] = 0;
  }
  fs.writeFileSync(path.join(out, `icon-${size}.png`), encodePNG(size, size, small));
  console.log(`icon-${size}.png`, size + 'x' + size);
}
console.log('done');
