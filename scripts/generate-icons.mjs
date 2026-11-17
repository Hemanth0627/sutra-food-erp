// Generates the PWA PNG icons (no image dependencies): node scripts/generate-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf) {
  let c, crc = 0xffffffff;
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
function bezier(p0, p1, p2, p3, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return pts;
}
function distToPolyline(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}
// Paths in a 32-unit box, mirroring public/icon.svg
const white = [...bezier([8, 11], [13, 11], [13, 21], [18, 21]), [24, 21]];
const amber = [...bezier([8, 21], [13, 21], [13, 11], [18, 11]), [24, 11]];

function render(size) {
  const s = size / 32;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const ux = (x + 0.5) / s, uy = (y + 0.5) / s;
      let col = [0x18, 0x18, 0x1b, 255];
      // rounded corners (radius 8 units) -> transparent outside
      const r = 8, cx = Math.min(Math.max(ux, r), 32 - r), cy = Math.min(Math.max(uy, r), 32 - r);
      if (Math.hypot(ux - cx, uy - cy) > r) col = [0, 0, 0, 0];
      else {
        if (distToPolyline(ux, uy, white) < 1.2) col = [0xfa, 0xfa, 0xfa, 255];
        if (distToPolyline(ux, uy, amber) < 1.2) col = [0xf5, 0x9e, 0x0b, 255];
        if (Math.hypot(ux - 24, uy - 16) < 2.2) col = [0xf5, 0x9e, 0x0b, 255];
      }
      raw.set(col, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, render(size));
console.log("Icons written to public/icons");
