// Generates the app icons from SVG. PNGs are rasterized with macOS `sips`.
// Run: node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

// Rollover mark: a loop arrow carrying a "+" — leftover money comes back around.
// Geometry is on a 512 grid, centered at 256, kept inside the 80% maskable safe zone.
const R = 118;
const STROKE = 46;
const startDeg = -58;
const sweepDeg = 268;
const rad = (d) => (d * Math.PI) / 180;
const pt = (deg, r = R) => [256 + r * Math.cos(rad(deg)), 256 + r * Math.sin(rad(deg))];
const f = (n) => n.toFixed(2);

const [sx, sy] = pt(startDeg);
const endDeg = startDeg + sweepDeg;
const [ex, ey] = pt(endDeg - 6); // stop the stroke under the arrowhead
// Arrowhead at the end of the arc, pointing along the clockwise tangent.
const [tx, ty] = [-Math.sin(rad(endDeg)), Math.cos(rad(endDeg))];
const [nx, ny] = [Math.cos(rad(endDeg)), Math.sin(rad(endDeg))];
const [ax, ay] = pt(endDeg);
const tip = [ax + tx * 62, ay + ty * 62];
const b1 = [ax - tx * 6 + nx * 58, ay - ty * 6 + ny * 58];
const b2 = [ax - tx * 6 - nx * 58, ay - ty * 6 - ny * 58];

function mark({ fg, accent }) {
  return `
  <path d="M ${f(sx)} ${f(sy)} A ${R} ${R} 0 1 1 ${f(ex)} ${f(ey)}" fill="none" stroke="${fg}" stroke-width="${STROKE}" stroke-linecap="round"/>
  <path d="M ${f(tip[0])} ${f(tip[1])} L ${f(b1[0])} ${f(b1[1])} L ${f(b2[0])} ${f(b2[1])} Z" fill="${fg}" stroke="${fg}" stroke-width="10" stroke-linejoin="round"/>
  <path d="M256 222 V290 M222 256 H290" stroke="${accent}" stroke-width="30" stroke-linecap="round"/>`;
}

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7B6CF6"/>
      <stop offset="1" stop-color="#4A3AD0"/>
    </linearGradient>
  </defs>`;

/** Full-bleed square (platforms apply their own mask). */
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="url(#bg)"/>${mark({ fg: '#FFFFFF', accent: '#7CF2C0' })}
</svg>
`;

/** Rounded favicon. */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" rx="116" fill="url(#bg)"/>${mark({ fg: '#FFFFFF', accent: '#7CF2C0' })}
</svg>
`;

writeFileSync(join(publicDir, 'icon.svg'), favicon);

const tmp = mkdtempSync(join(tmpdir(), 'deficit-icons-'));
try {
  const src = join(tmp, 'full.svg');
  writeFileSync(src, fullBleed);
  for (const [name, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ]) {
    execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), src, '--out', join(publicDir, name)], {
      stdio: 'ignore',
    });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('icons written to public/');
