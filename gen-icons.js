// Generates SKYSTACK PWA icons as PNGs with zero dependencies (Node built-ins only).
// Draws a pixel stack-tower on a sky gradient. Run: node gen-icons.js
const zlib = require('zlib');
const fs = require('fs');

// ---- CRC32 ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(size, px) { // px: Uint8Array RGB, size*size*3
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (stride + 1)] = 0; px.copy ? px.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride) : raw.set(px.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const SKY_TOP = [30, 24, 60], SKY_BOT = [255, 170, 100];
function hsl(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]; }

function draw(size) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const i = (y * size + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  // sky gradient
  for (let y = 0; y < size; y++) { const t = y / size; const c = [SKY_TOP[0] + (SKY_BOT[0] - SKY_TOP[0]) * t, SKY_TOP[1] + (SKY_BOT[1] - SKY_TOP[1]) * t, SKY_TOP[2] + (SKY_BOT[2] - SKY_TOP[2]) * t].map(Math.round); for (let x = 0; x < size; x++) set(x, y, c); }
  // stars (deterministic scatter, upper area)
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < Math.round(size / 12); i++) { const sx = Math.floor(rnd() * size), sy = Math.floor(rnd() * size * 0.5); const s = Math.max(1, Math.round(size / 170)); for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) set(sx + a, sy + b, [255, 246, 232]); }
  // pixel tower — 6 blocks, aurora hues, centred, in the maskable safe zone
  const bh = Math.round(size * 0.10), baseW = Math.round(size * 0.52), cx = size / 2;
  const groundY = Math.round(size * 0.86);
  // ground
  for (let y = groundY; y < size; y++) for (let x = 0; x < size; x++) set(x, y, [42, 31, 61]);
  for (let n = 0; n < 6; n++) {
    const w = baseW - n * Math.round(size * 0.03);
    const x0 = Math.round(cx - w / 2), y0 = groundY - (n + 1) * bh;
    const base = hsl((40 + n * 34) % 360, 78, 58), lite = hsl((40 + n * 34) % 360, 82, 72), dark = hsl((40 + n * 34) % 360, 72, 40);
    for (let y = 0; y < bh; y++) for (let x = 0; x < w; x++) { let c = base; const e = Math.max(1, Math.round(size / 90)); if (y < e || x < e) c = lite; if (y >= bh - e || x >= w - e) c = dark; set(x0 + x, y0 + y, c); }
  }
  // mascot on top
  const topY = groundY - 6 * bh, m = Math.round(size * 0.06), mx = Math.round(cx - m / 2), my = topY - m;
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) set(mx + x, my + y, [255, 231, 168]);
  const eye = Math.max(1, Math.round(m / 6));
  for (let y = 0; y < eye * 2; y++) { for (let x = 0; x < eye; x++) { set(mx + Math.round(m * 0.28) + x, my + Math.round(m * 0.35) + y, [42, 34, 51]); set(mx + Math.round(m * 0.62) + x, my + Math.round(m * 0.35) + y, [42, 34, 51]); } }
  return px;
}

for (const size of [512, 192, 180]) {
  const buf = encodePNG(size, draw(size));
  const name = size === 180 ? 'apple-touch-icon.png' : ('icon-' + size + '.png');
  fs.writeFileSync(__dirname + '/' + name, buf);
  console.log('wrote ' + name + ' (' + buf.length + ' bytes)');
}
