// Hand-drawn (in code) pictures of rides, stalls and scenery.
import { RIDES, SCENERY } from './data.js';

let ox = 0, oy = 0;
export function setOrigin(x, y) { ox = x; oy = y; }
const X = (u, v) => ox + (u - v) * 32;
const Y = (u, v, z) => oy + (u + v) * 16 - z * 16;
const INK = 'rgba(40,28,64,0.38)';
const K = 2.24; // height levels per tile length, so circles in a vertical plane look round

// Height of each ride in levels, for badges and click areas.
export const RIDE_TOP = { carousel: 3.4, castle: 2.2, teacups: 1.4, ferris: 6.9, swing: 4.6, pirate: 4.7, bumper: 2.9, haunted: 5.2, drop: 9.9 };

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
const pt = (u, v, z) => [X(u, v), Y(u, v, z)];
function box(ctx, u0, v0, u1, v1, z0, z1, top, left, right, ink = INK) {
  poly(ctx, [pt(u0, v1, z1), pt(u1, v1, z1), pt(u1, v1, z0), pt(u0, v1, z0)], left, ink);
  poly(ctx, [pt(u1, v0, z1), pt(u1, v1, z1), pt(u1, v1, z0), pt(u1, v0, z0)], right, ink);
  poly(ctx, [pt(u0, v0, z1), pt(u1, v0, z1), pt(u1, v1, z1), pt(u0, v1, z1)], top, ink);
}
function ell(ctx, u, v, z, r, fill, stroke) {
  ctx.beginPath();
  ctx.ellipse(X(u, v), Y(u, v, z), r * 45.25, r * 22.63, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function cyl(ctx, u, v, z0, z1, r, side, top, ink = INK) {
  const x = X(u, v), y0 = Y(u, v, z0), y1 = Y(u, v, z1), rx = r * 45.25, ry = r * 22.63;
  ctx.beginPath();
  ctx.ellipse(x, y0, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(x - rx, y1);
  ctx.ellipse(x, y1, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = side; ctx.fill();
  if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke(); }
  if (top) ell(ctx, u, v, z1, r, top, ink);
}
function cone(ctx, u, v, z0, z1, r, col, ink = INK) {
  const x = X(u, v), y0 = Y(u, v, z0), y1 = Y(u, v, z1), rx = r * 45.25, ry = r * 22.63;
  ctx.beginPath();
  ctx.moveTo(x - rx, y0);
  ctx.ellipse(x, y0, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x, y1);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke(); }
}
function line(ctx, a, b, col, w) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}
function dot(ctx, p, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.fill(); }
function shadow(ctx, u, v, r) { ell(ctx, u, v, 0.02, r, 'rgba(0,0,0,0.16)'); }
function slab(ctx, o) {
  const w = o.w / 2 - 0.06, h = o.h / 2 - 0.06;
  box(ctx, -w, -h, w, h, 0, 0.18, '#ece6f2', '#c5bdd2', '#aea6bd');
}
const SKIN = ['#ffd9b3', '#f1c27d', '#c68642', '#e0ac69'];
const TOY = ['#ef476f', '#ffd23f', '#06d6a0', '#3b8ed0', '#9b5de5', '#f78c1f'];

// ---------- rides ----------
function carousel(ctx, o) {
  const a = o.anim || 0;
  slab(ctx, o);
  cyl(ctx, 0, 0, 0.18, 0.4, 0.84, '#e8553f', '#ffedc9');
  const horses = [];
  for (let k = 0; k < 6; k++) {
    const an = a * 0.9 + (k * Math.PI) / 3;
    horses.push({ u: Math.cos(an) * 0.6, v: Math.sin(an) * 0.6, k });
  }
  horses.sort((p, q) => p.u + p.v - q.u - q.v);
  const horse = (hh) => {
    const z = 0.82 + 0.16 * Math.sin(a * 3 + hh.k * 1.7);
    line(ctx, pt(hh.u, hh.v, 0.4), pt(hh.u, hh.v, 2.1), '#f4c95d', 1.5);
    const p = pt(hh.u, hh.v, z);
    ctx.fillStyle = ['#ffffff', '#c98b5a', '#f6e7d0'][hh.k % 3];
    ctx.beginPath(); ctx.ellipse(p[0], p[1], 6, 3.6, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0] + 5, p[1] - 3.5, 2.4, 0, 6.3); ctx.fill();
    if (o.riders && o.riders.length > hh.k) dot(ctx, [p[0], p[1] - 6], 2.6, SKIN[hh.k % 4]);
  };
  for (const hh of horses) if (hh.u + hh.v < 0) horse(hh);
  cyl(ctx, 0, 0, 0.4, 2.2, 0.13, '#f4c95d', null);
  for (const hh of horses) if (hh.u + hh.v >= 0) horse(hh);
  // striped canopy
  const n = 12, rim = [], apex = pt(0, 0, 3.2);
  for (let k = 0; k < n; k++) {
    const an = a * 0.9 + (k * Math.PI * 2) / n;
    rim.push({ u: Math.cos(an) * 0.98, v: Math.sin(an) * 0.98, k });
  }
  const order = rim.map((r, k) => k).sort((p, q) => (rim[p].u + rim[p].v + rim[(p + 1) % n].u + rim[(p + 1) % n].v) - (rim[q].u + rim[q].v + rim[(q + 1) % n].u + rim[(q + 1) % n].v));
  for (const k of order) {
    const r1 = rim[k], r2 = rim[(k + 1) % n];
    poly(ctx, [pt(r1.u, r1.v, 2.05), pt(r2.u, r2.v, 2.05), apex], k % 2 ? '#ef476f' : '#fff4dc', INK);
  }
  dot(ctx, apex, 3, '#ffd23f');
}

function teacups(ctx, o) {
  const a = o.anim || 0;
  slab(ctx, o);
  cyl(ctx, 0, 0, 0.18, 0.32, 0.9, '#2ec4b6', '#c9f5ec');
  const cups = [];
  for (let k = 0; k < 4; k++) {
    const an = a * 0.7 + (k * Math.PI) / 2;
    cups.push({ u: Math.cos(an) * 0.52, v: Math.sin(an) * 0.52, k });
  }
  cups.push({ u: 0, v: 0, k: -1 });
  cups.sort((p, q) => p.u + p.v - q.u - q.v);
  for (const c of cups) {
    if (c.k < 0) {
      cyl(ctx, 0, 0, 0.32, 0.8, 0.17, '#f6f0ff', '#ffffff');
      cone(ctx, 0, 0, 0.8, 1.15, 0.17, '#ff70a6');
      continue;
    }
    cyl(ctx, c.u, c.v, 0.32, 0.66, 0.22, TOY[c.k], '#fff8ea');
    const n = o.riders ? Math.min(2, Math.max(0, o.riders.length - c.k * 2)) : 0;
    for (let j = 0; j < n; j++) {
      const an = a * 3 + c.k + j * Math.PI;
      dot(ctx, pt(c.u + Math.cos(an) * 0.09, c.v + Math.sin(an) * 0.09, 0.85), 2.6, SKIN[(c.k + j) % 4]);
    }
  }
}

function castle(ctx, o) {
  const a = o.anim || 0, wob = 1 + 0.035 * Math.sin(a * 7) * (o.spin || 0);
  slab(ctx, o);
  const turret = (u, v) => {
    cyl(ctx, u, v, 0.18, 1.5 * wob, 0.17, '#3b8ed0', '#5aa7e6');
    cone(ctx, u, v, 1.5 * wob, 2.1 * wob, 0.2, '#ffd23f');
  };
  turret(-0.68, -0.68);
  box(ctx, -0.72, -0.72, 0.72, 0.72, 0.18, 0.75 * wob, '#ffd86b', '#ef476f', '#d63a5f');
  // back walls
  box(ctx, -0.72, -0.72, 0.72, -0.58, 0.75 * wob, 1.25 * wob, '#ff8fab', '#ef476f', '#d63a5f');
  box(ctx, -0.72, -0.72, -0.58, 0.72, 0.75 * wob, 1.25 * wob, '#ff8fab', '#ef476f', '#d63a5f');
  const n = o.riders ? Math.min(5, o.riders.length) : 0;
  for (let k = 0; k < n; k++) {
    const u = -0.3 + (k % 3) * 0.3, v = -0.25 + ((k * 2) % 3) * 0.25;
    const z = 0.8 + Math.abs(Math.sin(a * 5 + k * 1.3)) * 0.7;
    dot(ctx, pt(u, v, z + 0.35), 2.7, SKIN[k % 4]);
    ctx.fillStyle = TOY[k % 6];
    const p = pt(u, v, z);
    ctx.beginPath(); ctx.roundRect(p[0] - 2.6, p[1] - 4, 5.2, 6, 2); ctx.fill();
  }
  turret(-0.68, 0.68); turret(0.68, -0.68); turret(0.68, 0.68);
}

function ferris(ctx, o) {
  const a = o.anim || 0;
  slab(ctx, o);
  const ax = o.w >= o.h ? 1 : 0, ay = 1 - ax; // wheel plane runs along the long side
  const px = -ay, py = ax;
  const R = 1.22, hub = 3.6;
  const W = (an, r, off) => pt(ax * Math.cos(an) * r + px * off, ay * Math.cos(an) * r + py * off, hub + Math.sin(an) * r * K);
  const frame = (off) => {
    const top = pt(px * off, py * off, hub);
    line(ctx, pt(ax * 0.85 + px * off, ay * 0.85 + py * off, 0.18), top, '#f4f6fa', 4);
    line(ctx, pt(-ax * 0.85 + px * off, -ay * 0.85 + py * off, 0.18), top, '#f4f6fa', 4);
    line(ctx, pt(ax * 0.85 + px * off, ay * 0.85 + py * off, 0.18), top, INK, 1);
  };
  frame(-0.3);
  // wheel
  ctx.lineJoin = 'round';
  for (const [r, col, w] of [[R, '#ef476f', 3.2], [R * 0.72, '#ffd23f', 2]]) {
    ctx.beginPath();
    for (let k = 0; k <= 32; k++) { const p = W((k / 32) * 6.2832, r, 0); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  const c0 = pt(0, 0, hub);
  for (let k = 0; k < 8; k++) line(ctx, c0, W(a * 0.35 + (k * Math.PI) / 4, R, 0), '#dfe7f1', 1.4);
  for (let k = 0; k < 8; k++) {
    const p = W(a * 0.35 + (k * Math.PI) / 4, R, 0);
    ctx.fillStyle = TOY[k % 6];
    ctx.beginPath(); ctx.roundRect(p[0] - 6, p[1] + 2, 12, 9, 3); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(p[0] - 4, p[1] + 4, 8, 3);
    if (o.riders && o.riders.length > k * 2) dot(ctx, [p[0], p[1] + 5.5], 2, SKIN[k % 4]);
    line(ctx, p, [p[0], p[1] + 2], '#8d99ae', 1.2);
  }
  frame(0.3);
  dot(ctx, pt(px * 0.3, py * 0.3, hub), 5, '#ffd23f');
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
}

function swing(ctx, o) {
  const a = o.anim || 0, s = o.spin || 0;
  slab(ctx, o);
  cyl(ctx, 0, 0, 0.18, 0.4, 0.5, '#9b5de5', '#c3a3f5');
  const chairs = [];
  const th = 0.25 + s * 0.75, Lu = 1.9;
  for (let k = 0; k < 10; k++) {
    const an = a * 1.6 + (k * Math.PI * 2) / 10;
    const r = 0.5 + (Lu / K) * Math.sin(th);
    chairs.push({ au: Math.cos(an) * 0.5, av: Math.sin(an) * 0.5, u: Math.cos(an) * r, v: Math.sin(an) * r, z: 3.5 - Lu * Math.cos(th), k });
  }
  const chair = (c) => {
    const p = pt(c.u, c.v, c.z);
    line(ctx, pt(c.au, c.av, 3.5), p, 'rgba(70,70,90,0.7)', 0.9);
    ctx.fillStyle = TOY[c.k % 6];
    ctx.beginPath(); ctx.roundRect(p[0] - 3.2, p[1] - 1, 6.4, 5, 1.5); ctx.fill();
    if (o.riders && o.riders.length > c.k) dot(ctx, [p[0], p[1] - 3], 2.5, SKIN[c.k % 4]);
  };
  for (const c of chairs) if (c.u + c.v < 0) chair(c);
  cyl(ctx, 0, 0, 0.4, 3.5, 0.13, '#ffd23f', null);
  for (let z = 0.8; z < 3.4; z += 0.9) cyl(ctx, 0, 0, z, z + 0.3, 0.135, '#ef476f', null, null);
  for (const c of chairs) if (c.u + c.v >= 0) chair(c);
  cyl(ctx, 0, 0, 3.45, 3.75, 0.58, '#ef476f', '#ff8fab');
  cone(ctx, 0, 0, 3.75, 4.45, 0.58, '#ffd23f');
  dot(ctx, pt(0, 0, 4.5), 2.6, '#ef476f');
}

function pirate(ctx, o) {
  const a = o.anim || 0, s = o.spin || 0;
  slab(ctx, o);
  const ax = o.w >= o.h ? 1 : 0, ay = 1 - ax, px = -ay, py = ax;
  const piv = 4.3;
  const th = 1.1 * Math.sin(a * 1.7) * s;
  const frame = (off) => {
    const top = pt(px * off, py * off, piv);
    for (const sgn of [-1, 1]) line(ctx, pt(ax * sgn * 1.1 + px * off, ay * sgn * 1.1 + py * off, 0.18), top, '#3b8ed0', 4.5);
  };
  // point in the swing plane: p along the axis (tiles), q down from the pivot (levels)
  const SP = (p, q, off = 0) => {
    const pu = p * K, c = Math.cos(th), sn = Math.sin(th);
    const rp = (pu * c - q * sn) / K, rq = pu * sn + q * c;
    return pt(ax * rp + px * off, ay * rp + py * off, piv + rq);
  };
  frame(-0.34);
  line(ctx, SP(0, 0), SP(-0.55, -2.5), '#8d99ae', 2);
  line(ctx, SP(0, 0), SP(0.55, -2.5), '#8d99ae', 2);
  poly(ctx, [SP(-1.2, -2.3), SP(-0.75, -3.2), SP(0.75, -3.2), SP(1.2, -2.3)], '#a0623a', INK);
  poly(ctx, [SP(-1.2, -2.3), SP(-1.02, -2.65), SP(1.02, -2.65), SP(1.2, -2.3)], '#ffd23f', INK);
  const n = o.riders ? Math.min(7, Math.ceil(o.riders.length / 2)) : 0;
  for (let k = 0; k < n; k++) dot(ctx, SP(-0.75 + k * 0.25, -2.1), 2.6, SKIN[k % 4]);
  // little flag
  line(ctx, SP(1.2, -2.3), SP(1.2, -1.5), '#5b4636', 1.4);
  poly(ctx, [SP(1.2, -1.5), SP(1.5, -1.65), SP(1.2, -1.85)], '#1b1b1b');
  frame(0.34);
  line(ctx, pt(-px * 0.34, -py * 0.34, piv), pt(px * 0.34, py * 0.34, piv), '#ffd23f', 5);
}

function bumper(ctx, o) {
  const a = o.anim || 0;
  slab(ctx, o);
  box(ctx, -1.38, -1.38, 1.38, 1.38, 0.18, 0.32, '#8494ab', '#5b6577', '#4b5464');
  const pole = (u, v) => cyl(ctx, u, v, 0.32, 2.5, 0.06, '#f4f6fa', null);
  pole(-1.3, -1.3);
  const cars = [];
  for (let k = 0; k < 6; k++) {
    cars.push({ u: 1.02 * Math.sin(a * (0.55 + 0.09 * k) + k * 1.3), v: 1.02 * Math.cos(a * (0.5 + 0.11 * k) + k * 2.1), k });
  }
  cars.sort((p, q) => p.u + p.v - q.u - q.v);
  for (const c of cars) {
    ell(ctx, c.u, c.v, 0.34, 0.2, '#2b2d42');
    cyl(ctx, c.u, c.v, 0.38, 0.6, 0.16, TOY[c.k], TOY[c.k]);
    if (o.riders && o.riders.length > c.k * 2) dot(ctx, pt(c.u, c.v, 0.9), 2.6, SKIN[c.k % 4]);
    line(ctx, pt(c.u, c.v, 0.6), pt(c.u, c.v, 2.4), 'rgba(70,70,90,0.5)', 0.8);
  }
  pole(-1.3, 1.3); pole(1.3, -1.3);
  // roof
  ctx.globalAlpha *= 0.6;
  for (let k = 0; k < 6; k++) {
    const u0 = -1.42 + (k * 2.84) / 6, u1 = u0 + 2.84 / 6;
    poly(ctx, [pt(u0, -1.42, 2.5), pt(u1, -1.42, 2.5), pt(u1, 1.42, 2.5), pt(u0, 1.42, 2.5)], k % 2 ? '#ef476f' : '#ffd23f');
  }
  ctx.globalAlpha /= 0.6;
  box(ctx, -1.42, 1.36, 1.42, 1.42, 2.3, 2.5, '#ef476f', '#ef476f', '#d63a5f');
  box(ctx, 1.36, -1.42, 1.42, 1.42, 2.3, 2.5, '#ef476f', '#ef476f', '#d63a5f');
  pole(1.3, 1.3);
}

function haunted(ctx, o, t) {
  const a = o.anim || 0;
  slab(ctx, o);
  box(ctx, -1.25, -1.25, 1.25, 1.25, 0.18, 2.7, '#8d7bb0', '#75649a', '#5f5080');
  // windows on the left face (v = 1.25) and a door on the right face (u = 1.25)
  const flick = 0.65 + 0.35 * Math.sin(t * 7 + Math.sin(t * 2.3) * 3);
  ctx.globalAlpha *= flick;
  for (const u of [-0.75, 0.35]) poly(ctx, [pt(u, 1.25, 2.1), pt(u + 0.4, 1.25, 2.1), pt(u + 0.4, 1.25, 1.3), pt(u, 1.25, 1.3)], '#ffe066', INK);
  poly(ctx, [pt(1.25, -0.85, 2.1), pt(1.25, -0.45, 2.1), pt(1.25, -0.45, 1.3), pt(1.25, -0.85, 1.3)], '#ffe066', INK);
  ctx.globalAlpha /= flick;
  poly(ctx, [pt(1.25, 0.15, 1.5), pt(1.25, 0.75, 1.5), pt(1.25, 0.75, 0.18), pt(1.25, 0.15, 0.18)], '#2a2138', INK);
  // roof
  const apex = pt(0, 0, 4.4);
  poly(ctx, [pt(-1.4, 1.4, 2.7), pt(1.4, 1.4, 2.7), apex], '#3d3154', INK);
  poly(ctx, [pt(1.4, -1.4, 2.7), pt(1.4, 1.4, 2.7), apex], '#2c2340', INK);
  // crooked tower
  box(ctx, -0.95, 0.35, -0.45, 0.85, 2.7, 4.3, '#8d7bb0', '#75649a', '#5f5080');
  poly(ctx, [pt(-1.05, 0.95, 4.3), pt(-0.35, 0.95, 4.3), pt(-0.7, 0.6, 5.3)], '#3d3154', INK);
  poly(ctx, [pt(-0.35, 0.25, 4.3), pt(-0.35, 0.95, 4.3), pt(-0.7, 0.6, 5.3)], '#2c2340', INK);
  if ((o.spin || 0) > 0.1) {
    const g = pt(0.5 + Math.sin(a) * 0.5, -0.3 + Math.cos(a * 0.8) * 0.4, 4.4 + Math.sin(a * 2) * 0.3);
    ctx.globalAlpha *= 0.85 * o.spin;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(g[0], g[1], 6, Math.PI, 0); ctx.lineTo(g[0] + 6, g[1] + 8);
    ctx.lineTo(g[0] + 3, g[1] + 5); ctx.lineTo(g[0], g[1] + 8); ctx.lineTo(g[0] - 3, g[1] + 5); ctx.lineTo(g[0] - 6, g[1] + 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a2138';
    ctx.beginPath(); ctx.arc(g[0] - 2, g[1] - 1, 1.2, 0, 6.3); ctx.arc(g[0] + 2, g[1] - 1, 1.2, 0, 6.3); ctx.fill();
    ctx.globalAlpha /= 0.85 * o.spin;
  }
}

function drop(ctx, o) {
  slab(ctx, o);
  cyl(ctx, 0, 0, 0.18, 0.6, 0.62, '#4b5464', '#69758a');
  let gz = 0.8;
  if (o.st === 'run') {
    const tau = o.runT || 0;
    if (tau < 5) { const f = tau / 5; gz = 0.8 + 7.6 * (f * f * (3 - 2 * f)); }
    else if (tau < 6.5) gz = 8.4;
    else if (tau < 7.5) { const f = (tau - 6.5) / 1.0; gz = 8.4 - 7.2 * f * f; }
    else gz = 0.8 + 0.4 * Math.exp(-(tau - 7.5) * 2) * Math.abs(Math.cos((tau - 7.5) * 6));
  }
  const tower = (z0, z1) => {
    box(ctx, -0.15, -0.15, 0.15, 0.15, z0, z1, '#f4f6fa', '#e9edf3', '#cfd6e0', null);
    for (let z = Math.ceil(z0); z < z1; z += 2) {
      const zt = Math.min(z1, z + 1);
      poly(ctx, [pt(-0.15, 0.15, zt), pt(0.15, 0.15, zt), pt(0.15, 0.15, z), pt(-0.15, 0.15, z)], '#ef476f');
      poly(ctx, [pt(0.15, -0.15, zt), pt(0.15, 0.15, zt), pt(0.15, 0.15, z), pt(0.15, -0.15, z)], '#d63a5f');
    }
  };
  tower(0.6, gz + 0.35);
  cyl(ctx, 0, 0, gz, gz + 0.35, 0.44, '#ffd23f', '#ffe58a');
  const n = o.riders ? Math.min(8, o.riders.length) : 0;
  for (let k = 0; k < n; k++) {
    const an = (k / 8) * Math.PI + 0.2;
    dot(ctx, pt(Math.cos(an - Math.PI / 4) * 0.5, Math.sin(an + Math.PI / 4) * 0.5, gz + 0.55), 2.5, SKIN[k % 4]);
  }
  tower(gz + 0.35, 9.3);
  box(ctx, -0.26, -0.26, 0.26, 0.26, 9.3, 9.6, '#3b8ed0', '#3b8ed0', '#2f73ab');
  dot(ctx, pt(0, 0, 9.9), 3, '#ffd23f');
}

const RIDE_DRAW = { carousel, teacups, castle, ferris, swing, pirate, bumper, haunted, drop };
export function drawRide(ctx, o, t) { RIDE_DRAW[o.type](ctx, o, t || 0); }

// ---------- stalls ----------
const STALL_COL = { burger: '#e8553f', drinks: '#3b8ed0', icecream: '#ff70a6', toilet: '#6c7a92', gift: '#9b5de5' };
export function drawStall(ctx, o, t) {
  const col = STALL_COL[o.type], dark = '#d8cfc0';
  box(ctx, -0.4, -0.4, 0.4, 0.4, 0, 1.2, '#fff6e6', '#f2e6d0', dark);
  // serving windows
  if (o.type !== 'toilet') {
    poly(ctx, [pt(-0.28, 0.4, 1.0), pt(0.28, 0.4, 1.0), pt(0.28, 0.4, 0.5), pt(-0.28, 0.4, 0.5)], '#4a3f55');
    poly(ctx, [pt(0.4, -0.28, 1.0), pt(0.4, 0.28, 1.0), pt(0.4, 0.28, 0.5), pt(0.4, -0.28, 0.5)], '#3a3145');
  } else {
    poly(ctx, [pt(-0.15, 0.4, 0.95), pt(0.15, 0.4, 0.95), pt(0.15, 0.4, 0), pt(-0.15, 0.4, 0)], '#3b8ed0', INK);
    poly(ctx, [pt(0.4, -0.15, 0.95), pt(0.4, 0.15, 0.95), pt(0.4, 0.15, 0), pt(0.4, -0.15, 0)], '#d6507a', INK);
  }
  // striped roof
  box(ctx, -0.52, -0.52, 0.52, 0.52, 1.2, 1.36, col, col, col);
  for (let k = 0; k < 4; k++) {
    const u0 = -0.52 + k * 0.26, u1 = u0 + 0.13;
    poly(ctx, [pt(u0, -0.52, 1.36), pt(u1, -0.52, 1.36), pt(u1, 0.52, 1.36), pt(u0, 0.52, 1.36)], 'rgba(255,255,255,0.8)');
    poly(ctx, [pt(u0, 0.52, 1.36), pt(u1, 0.52, 1.36), pt(u1, 0.52, 1.2), pt(u0, 0.52, 1.2)], 'rgba(255,255,255,0.8)');
  }
  // sign on the roof
  const p = pt(0, 0, 1.36), x = p[0], y = p[1] - 13 + Math.sin((t || 0) * 2 + o.x) * 1;
  ctx.lineWidth = 1; ctx.strokeStyle = INK;
  if (o.type === 'burger') {
    ctx.fillStyle = '#e9a13b'; ctx.beginPath(); ctx.ellipse(x, y - 3, 9, 6, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6fbf4a'; ctx.fillRect(x - 9.5, y - 3, 19, 2.2);
    ctx.fillStyle = '#7a4a2b'; ctx.fillRect(x - 9, y - 1, 18, 3.4);
    ctx.fillStyle = '#e9a13b'; ctx.beginPath(); ctx.roundRect(x - 9, y + 2.4, 18, 4, [0, 0, 3, 3]); ctx.fill(); ctx.stroke();
  } else if (o.type === 'drinks') {
    poly(ctx, [[x - 6, y - 7], [x + 6, y - 7], [x + 4, y + 7], [x - 4, y + 7]], '#ef476f', INK);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, y - 2, 10, 3);
    line(ctx, [x + 1, y - 7], [x + 4, y - 14], '#ffd23f', 2);
  } else if (o.type === 'icecream') {
    poly(ctx, [[x - 5, y - 1], [x + 5, y - 1], [x, y + 9]], '#e9b872', INK);
    dot(ctx, [x - 2.5, y - 4], 4.4, '#ff8fab'); dot(ctx, [x + 2.5, y - 4], 4.4, '#fff4dc'); dot(ctx, [x, y - 8], 4.2, '#8ed1fc');
  } else if (o.type === 'toilet') {
    ctx.fillStyle = '#3b8ed0'; ctx.beginPath(); ctx.roundRect(x - 10, y - 6, 20, 13, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 9px ui-rounded, "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WC', x, y + 1);
  } else {
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.roundRect(x - 7, y - 3, 14, 10, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ef476f'; ctx.fillRect(x - 1.5, y - 3, 3, 10); ctx.fillRect(x - 7, y + 0.5, 14, 2.5);
    line(ctx, [x + 5, y - 3], [x + 9, y - 14], 'rgba(60,60,60,0.6)', 0.7);
    ctx.fillStyle = '#06d6a0'; ctx.beginPath(); ctx.ellipse(x + 9.5, y - 18, 4, 5, 0, 0, 6.3); ctx.fill();
  }
}

// ---------- scenery (cx, cy = centre of the tile on screen) ----------
export function drawScenery(ctx, code, cx, cy, t, hsh) {
  const id = SCENERY[code].id;
  const sway = Math.sin(t * 1.3 + hsh * 20) * 1.1;
  const sh = (r) => { ctx.fillStyle = 'rgba(0,0,0,0.17)'; ctx.beginPath(); ctx.ellipse(cx, cy, r, r / 2, 0, 0, 6.3); ctx.fill(); };
  ctx.lineWidth = 1; ctx.strokeStyle = INK;
  switch (id) {
    case 'oak': {
      const s = 0.85 + hsh * 0.3;
      sh(13 * s);
      ctx.fillStyle = '#8a5a35'; ctx.fillRect(cx - 2.5, cy - 14 * s, 5, 14 * s);
      const blob = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx + x * s + sway * 0.5, cy + y * s, r * s, 0, 6.3); ctx.fill(); };
      blob(-7, -20, 10, '#2f9e4f'); blob(7, -19, 10, '#2f9e4f'); blob(0, -29, 11, '#3bb35a'); blob(-3, -24, 6, '#57c86f');
      break;
    }
    case 'pine': {
      const s = 0.85 + hsh * 0.35;
      sh(10 * s);
      ctx.fillStyle = '#7a5230'; ctx.fillRect(cx - 2, cy - 8 * s, 4, 8 * s);
      for (let k = 0; k < 3; k++) {
        const y = cy - (6 + k * 11) * s, w = (13 - k * 3) * s;
        ctx.fillStyle = k % 2 ? '#2a8f5a' : '#23804f';
        ctx.beginPath(); ctx.moveTo(cx - w, y); ctx.lineTo(cx + w, y); ctx.lineTo(cx + sway * 0.4 * (k + 1) * 0.5, y - 17 * s); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'palm': {
      sh(10);
      ctx.strokeStyle = '#a57b4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + 5, cy - 18, cx + 2 + sway, cy - 34); ctx.stroke();
      ctx.strokeStyle = '#2fae5c'; ctx.lineWidth = 3.4;
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * Math.PI * 2 + 0.3;
        ctx.beginPath(); ctx.moveTo(cx + 2 + sway, cy - 34);
        ctx.quadraticCurveTo(cx + 2 + sway + Math.cos(an) * 10, cy - 42 + Math.sin(an) * 3, cx + 2 + sway + Math.cos(an) * 17, cy - 32 + Math.sin(an) * 6);
        ctx.stroke();
      }
      break;
    }
    case 'bush':
      sh(10);
      for (const [x, y, r, c] of [[-5, -5, 7, '#2f9e4f'], [5, -5, 7, '#2f9e4f'], [0, -9, 7.5, '#45b965']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx + x, cy + y, r, 0, 6.3); ctx.fill();
      }
      break;
    case 'flowers': {
      ctx.fillStyle = '#5fae3f'; ctx.beginPath(); ctx.ellipse(cx, cy, 20, 10, 0, 0, 6.3); ctx.fill();
      const cols = ['#ef476f', '#ffd23f', '#ffffff', '#ff70a6', '#9b5de5'];
      for (let k = 0; k < 9; k++) {
        const an = k * 2.4 + hsh * 6, r = 4 + (k % 3) * 5;
        ctx.fillStyle = cols[(k + ((hsh * 5) | 0)) % 5];
        ctx.beginPath(); ctx.arc(cx + Math.cos(an) * r * 1.2, cy + Math.sin(an) * r * 0.6 - 2, 2.3, 0, 6.3); ctx.fill();
      }
      break;
    }
    case 'bench':
      sh(11);
      ctx.fillStyle = '#b07a45'; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(cx - 14, cy - 3); ctx.lineTo(cx + 4, cy + 6); ctx.lineTo(cx + 12, cy + 2); ctx.lineTo(cx - 6, cy - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#946033';
      ctx.beginPath(); ctx.moveTo(cx - 6, cy - 7); ctx.lineTo(cx + 12, cy + 2); ctx.lineTo(cx + 12, cy - 6); ctx.lineTo(cx - 6, cy - 15); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5b4636'; ctx.fillRect(cx - 13, cy - 2, 2, 5); ctx.fillRect(cx + 3, cy + 6, 2, 5);
      break;
    case 'lamp':
      sh(5);
      ctx.fillStyle = 'rgba(255,230,120,0.25)'; ctx.beginPath(); ctx.arc(cx, cy - 30, 11, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#3d405b'; ctx.fillRect(cx - 1.5, cy - 27, 3, 27);
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(cx, cy - 30, 4.6, 0, 6.3); ctx.fill(); ctx.stroke();
      break;
    case 'fountain': {
      ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.ellipse(cx, cy, 24, 12, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b3b9c6'; ctx.beginPath(); ctx.ellipse(cx, cy - 3, 24, 12, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#58c1f0'; ctx.beginPath(); ctx.ellipse(cx, cy - 3, 20, 10, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#c9ced8'; ctx.fillRect(cx - 2.5, cy - 20, 5, 17);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const an = (k / 5) * 6.28 + t * 0.4, dx = Math.cos(an) * 14, dy = Math.sin(an) * 7;
        ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.quadraticCurveTo(cx + dx * 0.6, cy - 30 + dy * 0.4, cx + dx, cy - 4 + dy); ctx.stroke();
      }
      break;
    }
    case 'statue':
      sh(10);
      ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.roundRect(cx - 8, cy - 12, 16, 14, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f4c542';
      ctx.beginPath(); ctx.roundRect(cx - 4.5, cy - 27, 9, 15, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - 31, 4.4, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f4c542'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + 4, cy - 24); ctx.lineTo(cx + 10, cy - 33); ctx.stroke();
      break;
    case 'rock':
      sh(11);
      ctx.fillStyle = '#9aa3b2'; ctx.beginPath(); ctx.moveTo(cx - 12, cy + 1); ctx.lineTo(cx - 7, cy - 10); ctx.lineTo(cx + 3, cy - 13); ctx.lineTo(cx + 12, cy - 3); ctx.lineTo(cx + 8, cy + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b9c1ce'; ctx.beginPath(); ctx.moveTo(cx - 7, cy - 10); ctx.lineTo(cx + 3, cy - 13); ctx.lineTo(cx, cy - 4); ctx.closePath(); ctx.fill();
      break;
  }
}

// ---------- thumbnails for the build menu ----------
export function thumbRide(ctx, type, w, h) {
  const d = RIDES[type];
  const o = { type, w: d.w, h: d.h, z: 0, anim: 0.6, spin: type === 'swing' ? 0.6 : 0, riders: [], st: 'idle' };
  const top = RIDE_TOP[type] * 16, foot = (d.w + d.h) * 16;
  const sc = Math.min((w - 6) / ((d.w + d.h) * 32 + 8), (h - 6) / (top + foot * 0.6 + 14));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(sc, sc);
  setOrigin(0, (top - foot * 0.35) / 2 + 2);
  drawRide(ctx, o, 0);
  ctx.restore();
}
export function thumbStall(ctx, type, w, h) {
  ctx.save();
  ctx.translate(w / 2, h / 2 + 16);
  const sc = Math.min(w, h) / 76;
  ctx.scale(sc, sc);
  setOrigin(0, 0);
  drawStall(ctx, { type, x: 0 }, 0);
  ctx.restore();
}
export function thumbScenery(ctx, code, w, h) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const id = SCENERY[code].id;
  const tall = id === 'oak' || id === 'pine' || id === 'palm' || id === 'lamp' || id === 'statue' || id === 'fountain';
  const sc = Math.min(w, h) / (tall ? 58 : 46);
  ctx.scale(sc, sc);
  drawScenery(ctx, code, 0, tall ? 20 : 6, 0, 0.5);
  ctx.restore();
}
