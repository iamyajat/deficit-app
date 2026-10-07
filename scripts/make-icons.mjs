// Generates the PWA PNG icons (no image tooling required): a dark rounded square with a
// green "rollover" ring and a center dot. Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [15, 23, 42];
const RING = [52, 211, 153];
const TRACK = [34, 48, 77];

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, { rounded }) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = size / 2;
  const rOuter = size * 0.34;
  const rInner = size * 0.24;
  const corner = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let a = 255;
      if (rounded) {
        const dx = Math.max(corner - px, px - (size - corner), 0);
        const dy = Math.max(corner - py, py - (size - corner), 0);
        const d = Math.hypot(dx, dy);
        a = Math.round(255 * Math.min(1, Math.max(0, corner - d + 0.5)));
      }
      const dist = Math.hypot(px - c, py - c);
      // angle from 12 o'clock, clockwise, 0..1
      const ang = ((Math.atan2(px - c, c - py) / (2 * Math.PI)) + 1) % 1;
      let col = BG;
      if (dist >= rInner && dist <= rOuter) col = ang <= 0.75 ? RING : TRACK;
      else if (dist <= size * 0.08) col = RING;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, { rounded: false }));
writeFileSync(new URL('icon-512.png', out), png(512, { rounded: false }));
writeFileSync(new URL('apple-touch-icon.png', out), png(180, { rounded: false }));
writeFileSync(
  new URL('icon.svg', out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f172a"/>
  <circle cx="32" cy="32" r="18.5" fill="none" stroke="#22304d" stroke-width="6.4"/>
  <circle cx="32" cy="32" r="18.5" fill="none" stroke="#34d399" stroke-width="6.4"
    stroke-dasharray="87.2 116.2" transform="rotate(-90 32 32)"/>
  <circle cx="32" cy="32" r="5" fill="#34d399"/>
</svg>
`,
);
console.log('icons written');
