// The isometric basics every drawing file shares: where a tile lands on screen, and colour helpers.
import { S } from './world.js';

export const HW = 32, HH = 16, ZH = 16; // half tile width, half tile height, pixels per height level
export const isoX = (x, y) => (x - y) * HW;
export const isoY = (x, y, z) => (x + y) * HH - z * ZH;
/** Height of the ground on a tile as it is drawn: water sits a little lower than its bed. */
export const heff = (i) => S.h[i] - (S.water[i] ? 0.3 : 0);

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export function mix(a, b, t) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(((p >> s) & 255) + (((q >> s) & 255) - ((p >> s) & 255)) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}

export function rectPath(ctx, x, y, w, h, z) {
  ctx.beginPath();
  ctx.moveTo(isoX(x, y), isoY(x, y, z)); ctx.lineTo(isoX(x + w, y), isoY(x + w, y, z));
  ctx.lineTo(isoX(x + w, y + h), isoY(x + w, y + h, z)); ctx.lineTo(isoX(x, y + h), isoY(x, y + h, z));
  ctx.closePath();
}
