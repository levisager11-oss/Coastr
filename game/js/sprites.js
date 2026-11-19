// Hand-drawn (in code) pictures of rides, stalls and scenery.
import { RIDES, SCENERY } from './data.js';

let ox = 0, oy = 0;
export function setOrigin(x, y) { ox = x; oy = y; }
let night = 0; // 0 = day, 1 = full night
export function setNight(v) { night = v; }
let T = 0; // time of the picture being drawn, for blinking bulbs and waving flags

const X = (u, v) => ox + (u - v) * 32;
const Y = (u, v, z) => oy + (u + v) * 16 - z * 16;
const INK = 'rgba(40,28,64,0.38)';
const INK2 = 'rgba(40,28,64,0.6)';
const SHADE = 'rgba(20,16,50,0.15)';
const K = 2.24; // height levels per tile length, so circles in a vertical plane look round
const PI = Math.PI, TAU = Math.PI * 2;
const RX = 45.25, RY = 22.63; // screen radii of a circle on the ground with a radius of one tile

// Height of each ride in levels, for badges and click areas.
export const RIDE_TOP = {
  carousel: 4.3, castle: 2.6, teacups: 2.2, ferris: 6.9, swing: 5.2, pirate: 4.8, bumper: 3.1, haunted: 5.7, drop: 10.4,
  slide: 6.8, maze: 2.2, tower: 10.2, octopus: 3.6, tumbler: 4.6, slingshot: 10.6,
};

// ---------- drawing helpers ----------
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
  const a = pt(u0, v1, z1), b = pt(u1, v1, z1), c = pt(u1, v1, z0), d = pt(u0, v1, z0), e = pt(u1, v0, z1), f = pt(u1, v0, z0), g = pt(u0, v0, z1);
  poly(ctx, [a, b, c, d], left);
  poly(ctx, [e, b, c, f], right);
  poly(ctx, [g, e, b, a], top);
  if (ink) {
    // outline and the three edges that meet at the near corner, in one stroke
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(g[0], g[1]); ctx.lineTo(e[0], e[1]); ctx.lineTo(f[0], f[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(e[0], e[1]);
    ctx.moveTo(b[0], b[1]); ctx.lineTo(c[0], c[1]);
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
  }
}
// Flat panels: wallL lies on a face looking to the lower left (v fixed), wallR on one looking to
// the lower right (u fixed), flat lies level.
function wallL(ctx, u0, u1, v, z0, z1, fill, stroke) { poly(ctx, [pt(u0, v, z1), pt(u1, v, z1), pt(u1, v, z0), pt(u0, v, z0)], fill, stroke); }
function wallR(ctx, u, v0, v1, z0, z1, fill, stroke) { poly(ctx, [pt(u, v0, z1), pt(u, v1, z1), pt(u, v1, z0), pt(u, v0, z0)], fill, stroke); }
function flat(ctx, u0, v0, u1, v1, z, fill, stroke) { poly(ctx, [pt(u0, v0, z), pt(u1, v0, z), pt(u1, v1, z), pt(u0, v1, z)], fill, stroke); }
function ell(ctx, u, v, z, r, fill, stroke) {
  ctx.beginPath();
  ctx.ellipse(X(u, v), Y(u, v, z), r * RX, r * RY, 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function cyl(ctx, u, v, z0, z1, r, side, top, ink = INK) {
  const x = X(u, v), y0 = Y(u, v, z0), y1 = Y(u, v, z1), rx = r * RX, ry = r * RY;
  ctx.beginPath();
  ctx.ellipse(x, y0, rx, ry, 0, 0, PI);
  ctx.lineTo(x - rx, y1);
  ctx.ellipse(x, y1, rx, ry, 0, PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = side; ctx.fill();
  if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke(); }
  if (top) ell(ctx, u, v, z1, r, top, ink);
}
function cone(ctx, u, v, z0, z1, r, col, ink = INK) {
  const x = X(u, v), y0 = Y(u, v, z0), y1 = Y(u, v, z1), rx = r * RX, ry = r * RY;
  ctx.beginPath();
  ctx.moveTo(x - rx, y0);
  ctx.ellipse(x, y0, rx, ry, 0, PI, 0, true);
  ctx.lineTo(x, y1);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke(); }
}
function line(ctx, a, b, col, w) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = w > 2 ? 'round' : 'butt'; // round ends cost more and do not show on thin lines
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}
// a girder w pixels thick with a dark edge (a filled strip, which is cheaper than two thick lines)
function beam(ctx, a, b, col, w) {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = w / 2 / (Math.hypot(dx, dy) || 1), nx = -dy * k, ny = dx * k;
  ctx.beginPath();
  ctx.moveTo(a[0] + nx, a[1] + ny); ctx.lineTo(b[0] + nx, b[1] + ny); ctx.lineTo(b[0] - nx, b[1] - ny); ctx.lineTo(a[0] - nx, a[1] - ny); ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = INK2; ctx.lineWidth = 1; ctx.stroke();
}
function dot(ctx, p, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.fill(); }
function ring(ctx, p, r, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.stroke(); }
// Shadows fall to the right, away from the light in the upper left.
function shadow(ctx, u, v, r) { ell(ctx, u + 0.07, v - 0.07, 0.19, r, SHADE); }

const TINTS = new Map();
// Lighter (f > 0) or darker (f < 0) version of a '#rrggbb' colour.
function tint(col, f) {
  const q = Math.round(f * 25);
  if (!q) return col;
  const key = col + q;
  let r = TINTS.get(key);
  if (!r) {
    const n = parseInt(col.slice(1), 16), a = Math.abs(q) / 25;
    const ch = (s, to) => Math.round(((n >> s) & 255) * (1 - a) + to * a);
    r = q > 0 ? `rgb(${ch(16, 255)},${ch(8, 255)},${ch(0, 255)})` : `rgb(${ch(16, 40)},${ch(8, 24)},${ch(0, 70)})`;
    TINTS.set(key, r);
  }
  return r;
}

// Round tower, r0 wide at the bottom and r1 at the top, lit from the left. Several colours give
// upright stripes; with a phase (ph) the stripes turn round the tower.
function tower(ctx, u, v, z0, z1, r0, r1, cols, top, n = 5, ph = null, ink = INK) {
  const x = X(u, v), y0 = Y(u, v, z0), y1 = Y(u, v, z1);
  const a0 = r0 * RX, b0 = r0 * RY, a1 = r1 * RX, b1 = r1 * RY;
  const facet = (p0, p1, col) => {
    ctx.beginPath();
    ctx.ellipse(x, y0, a0, b0, 0, p0, Math.min(PI, p1 + 0.03));
    ctx.ellipse(x, y1, a1, b1, 0, Math.min(PI, p1 + 0.03), p0, true);
    ctx.closePath();
    ctx.fillStyle = tint(col, -0.2 * Math.cos((p0 + p1) / 2) - 0.03);
    ctx.fill();
  };
  if (ph === null) {
    for (let k = 0; k < n; k++) facet((k / n) * PI, ((k + 1) / n) * PI, cols[k % cols.length]);
  } else {
    const step = TAU / n, s0 = ((ph % TAU) + TAU) % TAU;
    for (let k = 0; k < n; k++) {
      const s = (s0 + k * step) % TAU, col = cols[k % cols.length];
      if (s < PI) facet(s, Math.min(PI, s + step), col);
      if (s + step > TAU) facet(0, Math.min(PI, s + step - TAU), col);
    }
  }
  if (ink) {
    ctx.beginPath();
    ctx.ellipse(x, y0, a0, b0, 0, 0, PI);
    ctx.ellipse(x, y1, a1, b1, 0, PI, 0, true);
    ctx.closePath();
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
  }
  if (top) ell(ctx, u, v, z1, r1, top, ink);
}
// Pointed round roof in n panels. ph turns the panels round the middle.
function tent(ctx, u, v, z0, z1, r, cols, n, ph = 0, ink = INK) {
  const x = X(u, v), y0 = Y(u, v, z0), ya = Y(u, v, z1), rx = r * RX, ry = r * RY, step = TAU / n;
  // far side first; the near panels cover it when the roof is steep
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < n; k++) {
      const p0 = ph + k * step, m = p0 + step / 2;
      if ((Math.sin(m) >= 0) !== (pass === 1)) continue;
      ctx.beginPath(); ctx.moveTo(x, ya); ctx.ellipse(x, y0, rx, ry, 0, p0, p0 + step); ctx.closePath();
      ctx.fillStyle = tint(cols[k % cols.length], -0.12 * Math.cos(m) - (pass ? 0 : 0.05));
      ctx.fill();
    }
  }
  if (ink) {
    // seams, and the rim on the near side
    ctx.beginPath();
    ctx.ellipse(x, y0, rx, ry, 0, 0, PI);
    for (let k = 0; k < n; k++) { const p0 = ph + k * step; ctx.moveTo(x, ya); ctx.lineTo(x + Math.cos(p0) * rx, y0 + Math.sin(p0) * ry); }
    ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.stroke();
  }
}

// A little lamp. By day a pale dot, at night it glows; k staggers the blinking.
// Bulbs are only collected here and then drawn together by lamps(), which is much cheaper.
const LAMPS_ON = [], LAMPS_OFF = [];
function bulb(ctx, p, k = 0) { (Math.sin(T * 5 + k * 2.4) > -0.3 ? LAMPS_ON : LAMPS_OFF).push(p[0], p[1]); }
// bulbs along the near edge of a round rim
function rimBulbs(ctx, u, v, z, r, n, k0 = 0) {
  const x = X(u, v), y = Y(u, v, z);
  for (let k = 0; k < n; k++) {
    const p = ((k + 0.5) / n) * PI;
    bulb(ctx, [x + Math.cos(p) * r * RX, y + Math.sin(p) * r * RY], k + k0);
  }
  lamps(ctx);
}
function glow(ctx, p, r, col, a) { ctx.globalAlpha *= a; dot(ctx, p, r, col); ctx.globalAlpha /= a; }
// a pennant flying to the right from p
function pennant(ctx, p, len, col, ph = 0) {
  const w = Math.sin(T * 6 + ph), x = p[0], y = p[1], h = len * 0.56;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + len * 0.5, y + w * 1.6, x + len, y + h * 0.5 + w * 1.3);
  ctx.quadraticCurveTo(x + len * 0.5, y + h * 0.7 - w * 1.2, x, y + h);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
}
// a small flag on a mast, h levels tall
function mastFlag(ctx, u, v, z, h, col, ph = 0) {
  const a = pt(u, v, z), b = [a[0], a[1] - h * 16];
  line(ctx, a, b, '#6b6f80', 1.2);
  pennant(ctx, b, 9, col, ph);
  dot(ctx, b, 1.4, '#ffd23f');
}

// every other slice of a level disc, as on a carousel floor; rot turns them
function wedges(ctx, u, v, z, r, rot, n, fill) {
  const x = X(u, v), y = Y(u, v, z), step = TAU / n;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a0 = rot + k * step + PI / 4;
    ctx.moveTo(x, y); ctx.ellipse(x, y, r * RX, r * RY, 0, a0, a0 + step / 2); ctx.closePath();
  }
  ctx.fillStyle = fill; ctx.fill();
}
// adds a four-cornered shape to the path being built
function quad(ctx, a, b, c, d) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); }
// upright pole w pixels wide; cheap, as it is only rectangles on screen
function post(ctx, u, v, z0, z1, w, col, dark) {
  const x = X(u, v), y0 = Y(u, v, z0), y1 = Y(u, v, z1);
  ctx.fillStyle = INK2; ctx.fillRect(x - w / 2 - 0.7, y1 - 0.7, w + 1.4, y0 - y1 + 1.4);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y1, w, y0 - y1);
  ctx.fillStyle = dark; ctx.fillRect(x + w / 6, y1, w / 3, y0 - y1);
}
// many dots in one go; a holds x, y pairs
function spots(ctx, a, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < a.length; i += 2) { ctx.moveTo(a[i] + r, a[i + 1]); ctx.arc(a[i], a[i + 1], r, 0, 6.3); }
  ctx.fill();
}
// draws the bulbs collected by bulb() so far
function lamps(ctx) {
  if (night > 0.3) {
    if (LAMPS_ON.length) { ctx.globalAlpha *= 0.3; spots(ctx, LAMPS_ON, 5, '#ffd95a'); ctx.globalAlpha /= 0.3; spots(ctx, LAMPS_ON, 1.9, '#fff6c8'); }
    if (LAMPS_OFF.length) spots(ctx, LAMPS_OFF, 1.3, '#ffd95a');
  } else {
    if (LAMPS_ON.length) spots(ctx, LAMPS_ON, 1.25, '#fffbe6');
    if (LAMPS_OFF.length) spots(ctx, LAMPS_OFF, 1.25, '#f0d98e');
  }
  LAMPS_ON.length = 0; LAMPS_OFF.length = 0;
}
function slab(ctx, o, top = '#f4f0f8') {
  const w = o.w / 2 - 0.06, h = o.h / 2 - 0.06;
  box(ctx, -w, -h, w, h, 0, 0.18, '#dcd5e6', '#c5bdd2', '#aba3ba');
  flat(ctx, -w + 0.09, -h + 0.09, w - 0.09, h - 0.09, 0.18, top);
}
const SKIN = ['#ffd9b3', '#f1c27d', '#c68642', '#e0ac69'];
const HAIR = ['#5b3a21', '#2b2d42', '#d9a441', '#8a4b2a', '#b23a2e'];
const TOY = ['#ef476f', '#ffd23f', '#06d6a0', '#3b8ed0', '#9b5de5', '#f78c1f'];
// colour sets for striped towers and roofs
const STRIPES = ['#ef476f', '#fff4dc'], CANDY = ['#fff4dc', '#ff8fab'], SUNNY = ['#ffd23f', '#ef476f'], SKY = ['#3b8ed0', '#5aa7e6'];
const PLUM = ['#9b5de5', '#ffd23f'], PLUM2 = ['#7d46c7', '#9b5de5'], GOLD = ['#ffd23f'], WHITE = ['#ffffff'], PALE = ['#f4f6fa'];
const BLUE = ['#3b8ed0'], STEEL = ['#4b5464'], HAZARD = ['#ffd23f', '#2b2d42'], LAGOON = ['#3b8ed0', '#5aa7e6'];
const COAT = ['#ffffff', '#c98b5a', '#f6e7d0'], MANE = ['#b9c1ce', '#6b4226', '#d9a441'];
const count = (o) => (o.riders ? o.riders.length : 0);
function head(ctx, p, k, r = 2.6) {
  dot(ctx, p, r, SKIN[k % 4]);
  ctx.fillStyle = HAIR[k % 5];
  ctx.beginPath(); ctx.arc(p[0], p[1] - 0.2, r, PI * 1.08, PI * 1.92); ctx.closePath(); ctx.fill();
}
// a seated guest: p is where they sit
function rider(ctx, p, k) {
  ctx.fillStyle = TOY[(k * 5 + 2) % 6];
  ctx.beginPath(); ctx.roundRect(p[0] - 2.5, p[1] - 5.6, 5, 6.2, 1.8); ctx.fill();
  head(ctx, [p[0], p[1] - 7.6], k);
}
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ---------- rides ----------
function carousel(ctx, o) {
  const a = o.anim || 0, rot = a * 0.9, nr = count(o);
  slab(ctx, o);
  shadow(ctx, 0.03, -0.03, 0.97);
  cyl(ctx, 0, 0, 0.18, 0.3, 0.95, '#b5344f', null);
  cyl(ctx, 0, 0, 0.3, 0.42, 0.91, '#ef476f', '#fff0d2');
  wedges(ctx, 0, 0, 0.42, 0.86, rot, 6, '#ffd9a0');
  rimBulbs(ctx, 0, 0, 0.36, 0.91, 7);

  const n = 12, R = 0.95, zr = 2.42, zv = 2.16, step = TAU / n;
  const top = [], low = [];
  for (let k = 0; k <= n; k++) {
    const cu = Math.cos(rot + k * step) * R, sv = Math.sin(rot + k * step) * R;
    top.push(pt(cu, sv, zr)); low.push(pt(cu, sv, zv));
  }
  const near = (k) => { const m = rot + (k + 0.5) * step; return Math.cos(m) + Math.sin(m) > 0; };
  // far side of the canopy frill, seen from inside
  ctx.beginPath();
  for (let k = 0; k < n; k++) if (!near(k)) quad(ctx, top[k], top[k + 1], low[k + 1], low[k]);
  ctx.fillStyle = '#a8324a'; ctx.fill();
  const horses = [];
  for (let k = 0; k < 6; k++) {
    const an = rot + (k * PI) / 3;
    horses.push({ u: Math.cos(an) * 0.62, v: Math.sin(an) * 0.62, k, dir: Math.sin(an) + Math.cos(an) > 0 ? -1 : 1 });
  }
  horses.sort((p, q) => p.u + p.v - q.u - q.v);
  const poles = (front) => {
    ctx.beginPath();
    for (const hh of horses) {
      if ((hh.u + hh.v >= 0) !== front) continue;
      ctx.moveTo(X(hh.u, hh.v), Y(hh.u, hh.v, 0.42)); ctx.lineTo(X(hh.u, hh.v), Y(hh.u, hh.v, 2.3));
    }
    ctx.strokeStyle = '#e9b949'; ctx.lineWidth = 1.5; ctx.stroke();
  };
  const horse = (hh) => {
    const z = 0.8 + 0.16 * Math.sin(a * 3 + hh.k * 1.7), d = hh.dir;
    const x = X(hh.u, hh.v), y = Y(hh.u, hh.v, z), coat = COAT[hh.k % 3];
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x - 3.6, y + 2); ctx.lineTo(x - 4.6, y + 6.4); ctx.moveTo(x + 3.6, y + 2); ctx.lineTo(x + 4.8, y + 6.2);
    ctx.strokeStyle = coat; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.ellipse(x, y, 6.4, 3.6, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
    // neck and head
    ctx.beginPath(); ctx.moveTo(x + d * 2.6, y - 1.6); ctx.lineTo(x + d * 5.4, y - 7.2); ctx.lineTo(x + d * 10, y - 5.6); ctx.lineTo(x + d * 9.6, y - 3.4);
    ctx.lineTo(x + d * 7.2, y - 3.4); ctx.lineTo(x + d * 6.2, y); ctx.closePath(); ctx.fill();
    // tail and mane
    ctx.beginPath(); ctx.moveTo(x - d * 6, y - 1); ctx.lineTo(x - d * 8.4, y + 3.2); ctx.moveTo(x + d * 3.4, y - 3); ctx.lineTo(x + d * 5.2, y - 7);
    ctx.strokeStyle = MANE[hh.k % 3]; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.fillStyle = TOY[hh.k % 6]; ctx.fillRect(x - 2.4, y - 3.9, 4.8, 3.2);
    if (nr > hh.k) rider(ctx, [x, y - 2.6], hh.k);
  };
  poles(false);
  for (const hh of horses) if (hh.u + hh.v < 0) horse(hh);
  tower(ctx, 0, 0, 0.42, 2.3, 0.2, 0.2, CANDY, null, 12, rot + PI / 4);
  cyl(ctx, 0, 0, 0.42, 0.56, 0.24, '#ffd23f', null);
  cyl(ctx, 0, 0, 1.3, 1.45, 0.22, '#ffd23f', null);
  poles(true);
  for (const hh of horses) if (hh.u + hh.v >= 0) horse(hh);
  // near side of the frill
  for (let k = 0; k < n; k++) {
    if (!near(k)) continue;
    const m = rot + (k + 0.5) * step;
    ctx.beginPath(); quad(ctx, top[k], top[k + 1], low[k + 1], low[k]);
    if (Math.cos(m) + Math.sin(m) > 0.95) { const q = pt(Math.cos(m) * R * 0.97, Math.sin(m) * R * 0.97, zv); ctx.moveTo(q[0] + 3, q[1]); ctx.arc(q[0], q[1], 3, 0, 6.3); }
    ctx.fillStyle = tint(k % 2 ? '#fff4dc' : '#ef476f', 0.1 * (Math.sin(m) - Math.cos(m)) - 0.04); ctx.fill();
  }
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    if (!near(k)) continue;
    ctx.moveTo(low[k][0], low[k][1]); ctx.lineTo(top[k][0], top[k][1]);
    ctx.moveTo(low[k][0], low[k][1]); ctx.lineTo(low[k + 1][0], low[k + 1][1]); ctx.lineTo(top[k + 1][0], top[k + 1][1]);
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  tent(ctx, 0, 0, zr, 3.66, R, STRIPES, n, rot + PI / 4);
  for (let k = 0; k < n; k++) if (near(k) || near(k - 1)) bulb(ctx, [top[k][0], top[k][1] + 0.5], k);
  lamps(ctx);
  mastFlag(ctx, 0, 0, 3.64, 0.5, '#3b8ed0', 1);
  dot(ctx, pt(0, 0, 3.68), 3, '#ffd23f');
  ring(ctx, pt(0, 0, 3.68), 3, INK, 1);
}

function teacups(ctx, o) {
  const a = o.anim || 0, rot = a * 0.7, nr = count(o);
  slab(ctx, o);
  const P = 0.84, zp = 1.95;
  const lampPost = (u, v) => {
    post(ctx, u, v, 0.18, zp, 2, '#f4f6fa', '#cfd6e0');
    const p = pt(u, v, zp + 0.1);
    if (night > 0.3) glow(ctx, p, 7, '#ffe680', 0.3);
    dot(ctx, p, 3, night > 0.3 ? '#fff6c8' : '#fff0b8');
    ring(ctx, p, 3, INK, 0.8);
  };
  // string of lights between two posts
  const festoon = (u0, v0, u1, v1, k0) => {
    const A = pt(u0, v0, zp), B = pt(u1, v1, zp), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2 + 9;
    ctx.strokeStyle = 'rgba(60,50,80,0.55)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(mx, my, B[0], B[1]); ctx.stroke();
    for (let k = 1; k < 6; k++) {
      const f = k / 6, g = 1 - f;
      bulb(ctx, [g * g * A[0] + 2 * g * f * mx + f * f * B[0], g * g * A[1] + 2 * g * f * my + f * f * B[1] + 0.8], k + k0);
    }
  };
  lampPost(-P, -P);
  festoon(-P, -P, -P, P, 0); festoon(-P, -P, P, -P, 3);
  lamps(ctx);
  shadow(ctx, 0.04, -0.04, 0.93);
  cyl(ctx, 0, 0, 0.18, 0.34, 0.9, '#1fa89b', '#d3f7ef');
  wedges(ctx, 0, 0, 0.34, 0.84, rot, 6, '#a3ecdf');
  ell(ctx, 0, 0, 0.34, 0.84, null, 'rgba(255,255,255,0.7)');
  const cups = [];
  for (let k = 0; k < 4; k++) {
    const an = rot + (k * PI) / 2;
    cups.push({ u: Math.cos(an) * 0.52, v: Math.sin(an) * 0.52, k });
  }
  cups.push({ u: 0, v: 0, k: -1 });
  cups.sort((p, q) => p.u + p.v - q.u - q.v);
  const pot = () => {
    const sa = -rot * 1.4, su = Math.cos(sa), sv = Math.sin(sa);
    const spout = () => { beam(ctx, pt(su * 0.16, sv * 0.16, 0.62), pt(su * 0.34, sv * 0.34, 0.98), '#ffffff', 2.6); };
    const grip = () => {
      const g0 = pt(-su * 0.17, -sv * 0.17, 0.9), g1 = pt(-su * 0.17, -sv * 0.17, 0.52), gm = pt(-su * 0.36, -sv * 0.36, 0.72);
      ctx.strokeStyle = '#ff70a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.quadraticCurveTo(gm[0], gm[1], g1[0], g1[1]); ctx.stroke();
    };
    if (su + sv < 0) spout(); else grip();
    tower(ctx, 0, 0, 0.34, 0.98, 0.2, 0.2, WHITE, '#fff6fb', 4);
    cyl(ctx, 0, 0, 0.56, 0.7, 0.203, '#ff9cc2', null, null);
    cone(ctx, 0, 0, 0.98, 1.24, 0.17, '#ff70a6');
    dot(ctx, pt(0, 0, 1.3), 2.2, '#ffd23f');
    if (su + sv < 0) grip(); else spout();
  };
  for (const c of cups) {
    if (c.k < 0) { pot(); continue; }
    const col = TOY[c.k], ca = a * 3 + c.k;
    ell(ctx, c.u, c.v, 0.345, 0.27, '#ffffff', INK);
    const hu = Math.cos(ca) * 0.27, hv = Math.sin(ca) * 0.27;
    if (hu + hv < 0) ring(ctx, pt(c.u + hu, c.v + hv, 0.56), 2.6, tint(col, -0.15), 1.8);
    tower(ctx, c.u, c.v, 0.36, 0.72, 0.15, 0.22, [col], '#fff8ea', 3);
    ell(ctx, c.u, c.v, 0.715, 0.17, tint(col, -0.28));
    if (hu + hv >= 0) ring(ctx, pt(c.u + hu, c.v + hv, 0.56), 2.6, tint(col, -0.15), 1.8);
    const m = Math.min(2, Math.max(0, nr - c.k * 2));
    for (let j = 0; j < m; j++) {
      const an = ca + j * PI;
      head(ctx, pt(c.u + Math.cos(an) * 0.09, c.v + Math.sin(an) * 0.09, 0.9), c.k + j);
    }
  }
  lampPost(-P, P); lampPost(P, -P);
  festoon(-P, P, P, P, 1); festoon(P, -P, P, P, 4);
  lamps(ctx);
  lampPost(P, P);
}

function castle(ctx, o) {
  const a = o.anim || 0, wob = 1 + 0.035 * Math.sin(a * 7) * (o.spin || 0), nr = count(o);
  slab(ctx, o);
  flat(ctx, -0.64, -0.86, 0.86, 0.64, 0.19, SHADE);
  const turret = (u, v, k) => {
    tower(ctx, u, v, 0.18, 1.5 * wob, 0.19, 0.17, BLUE, null, 3);
    cyl(ctx, u, v, 0.86 * wob, 0.98 * wob, 0.182, '#ffd23f', null, null);
    cyl(ctx, u, v, 1.4 * wob, 1.5 * wob, 0.2, '#8fc4f0', '#a9d4f5');
    cone(ctx, u, v, 1.5 * wob, 2.15 * wob, 0.2, '#ffd23f');
    const p = pt(u, v, 1.5 * wob), q = pt(u, v, 2.15 * wob);
    poly(ctx, [[p[0] - 8.6, p[1] + 0.6], [p[0] - 3.4, p[1] + 3.6], q], '#ffe88f');
    mastFlag(ctx, u, v, 2.13 * wob, 0.34, TOY[(k * 2) % 6], k * 1.7);
  };
  turret(-0.68, -0.68, 0);
  box(ctx, -0.74, -0.74, 0.74, 0.74, 0.18, 0.75 * wob, '#ffd86b', '#ef476f', '#d63a5f');
  wallL(ctx, -0.74, 0.74, 0.74, 0.6 * wob, 0.75 * wob, '#ff7391');
  wallR(ctx, 0.74, -0.74, 0.74, 0.6 * wob, 0.75 * wob, '#e2496f');
  flat(ctx, -0.52, -0.52, 0.56, 0.56, 0.75 * wob, '#ffe9a3');
  // back walls with battlements
  box(ctx, -0.74, -0.74, 0.74, -0.58, 0.75 * wob, 1.3 * wob, '#ff9db5', '#ef476f', '#d63a5f');
  box(ctx, -0.74, -0.74, -0.58, 0.74, 0.75 * wob, 1.3 * wob, '#ff9db5', '#ef476f', '#d63a5f');
  for (const m of [-0.34, 0.12]) {
    box(ctx, m, -0.74, m + 0.24, -0.58, 1.3 * wob, 1.5 * wob, '#ffc0d0', '#ff7391', '#e2496f');
    box(ctx, -0.74, m, -0.58, m + 0.24, 1.3 * wob, 1.5 * wob, '#ffc0d0', '#ff7391', '#e2496f');
  }
  wallL(ctx, -0.3, 0.3, -0.58, 0.82 * wob, 1.16 * wob, '#c9365a', INK);
  wallR(ctx, -0.58, -0.3, 0.3, 0.82 * wob, 1.16 * wob, '#b02f50', INK);
  const n = Math.min(5, nr);
  for (let k = 0; k < n; k++) {
    const u = -0.3 + (k % 3) * 0.3, v = -0.25 + ((k * 2) % 3) * 0.25;
    const z = 0.8 + Math.abs(Math.sin(a * 5 + k * 1.3)) * 0.7;
    const p = pt(u, v, z);
    ctx.fillStyle = TOY[k % 6];
    ctx.beginPath(); ctx.roundRect(p[0] - 2.6, p[1] - 4, 5.2, 6, 2); ctx.fill();
    head(ctx, [p[0], p[1] - 5.6], k, 2.7);
  }
  // low bumpers at the front, with a doorway on the right
  box(ctx, -0.5, 0.6, 0.5, 0.74, 0.75 * wob, 0.94 * wob, '#a9d4f5', '#3b8ed0', '#2f73ab');
  box(ctx, 0.6, -0.5, 0.74, 0.08, 0.75 * wob, 0.94 * wob, '#a9d4f5', '#3b8ed0', '#2f73ab');
  turret(0.68, -0.68, 1);
  box(ctx, 0.74, 0.12, 0.9, 0.5, 0.18, 0.3, '#8fe0c8', '#06d6a0', '#05b384');
  turret(-0.68, 0.68, 2); turret(0.68, 0.68, 3);
}

function ferris(ctx, o) {
  const a = o.anim || 0, rot = a * 0.35, nr = count(o);
  slab(ctx, o);
  const ax = o.w >= o.h ? 1 : 0, ay = 1 - ax; // wheel plane runs along the long side
  const P = (p, q, z) => pt(ax * p + ay * q, ay * p + ax * q, z); // p along the wheel, q towards the viewer
  const bx = (p0, q0, p1, q1, z0, z1, c0, c1, c2) => (ax ? box(ctx, p0, q0, p1, q1, z0, z1, c0, c1, c2) : box(ctx, q0, p0, q1, p1, z0, z1, c0, c1, c2));
  const R = 1.2, hub = 3.8;
  const W = (an, r, q) => P(Math.cos(an) * r, q, hub + Math.sin(an) * r * K);
  const frame = (q) => {
    const top = P(0, q, hub), fa = P(-0.92, q, 0.18), fb = P(0.92, q, 0.18);
    beam(ctx, fa, top, '#f4f6fa', 3.6); beam(ctx, fb, top, '#dfe5ee', 3.6);
    beam(ctx, P(-0.52, q, 1.76), P(0.52, q, 1.76), '#e9edf3', 2);
    dot(ctx, fa, 2.6, '#3b8ed0'); dot(ctx, fb, 2.6, '#3b8ed0');
  };
  frame(-0.34);
  bx(-0.72, -0.3, 0.72, 0.3, 0.18, 0.3, '#e3c08f', '#c99b5f', '#a87c48');
  bx(-0.22, 0.3, 0.22, 0.42, 0.18, 0.24, '#e3c08f', '#c99b5f', '#a87c48');
  // a ring of the wheel: a unit circle pushed into the wheel's plane, stroked back in screen space
  const circle = (r, q, col, w, edge) => {
    const c = P(0, q, hub);
    ctx.save();
    ctx.transform((ax ? 32 : -32) * r, 16 * r, 0, -16 * r * K, c[0], c[1]);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.restore();
    if (edge) { ctx.strokeStyle = INK2; ctx.lineWidth = w + 1.4; ctx.stroke(); }
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  };
  circle(R, -0.1, '#a8324a', 2.6, false);
  // spokes, then the bracing between them
  const c0 = P(0, 0, hub), tips = [], mids = [];
  for (let k = 0; k < 8; k++) { const an = rot + (k * PI) / 4; tips.push(W(an, R, 0)); mids.push(W(an, R * 0.62, 0)); }
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let k = 0; k < 8; k++) { ctx.moveTo(c0[0], c0[1]); ctx.lineTo(tips[k][0], tips[k][1]); }
  ctx.strokeStyle = '#e6ecf4'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const j = (k + 1) % 8;
    ctx.moveTo(mids[k][0], mids[k][1]); ctx.lineTo(tips[j][0], tips[j][1]);
    ctx.moveTo(mids[j][0], mids[j][1]); ctx.lineTo(tips[k][0], tips[k][1]);
  }
  ctx.strokeStyle = '#cfd8e4'; ctx.lineWidth = 0.9; ctx.stroke();
  circle(R * 0.62, 0, '#ffd23f', 1.8, false);
  circle(R, 0.1, '#ef476f', 2.6, true);
  for (let k = 0; k < 16; k++) bulb(ctx, W(rot + ((k + 0.5) * PI) / 8, R, 0.1), k);
  lamps(ctx);
  ctx.beginPath();
  for (let k = 0; k < 8; k++) { ctx.moveTo(tips[k][0], tips[k][1]); ctx.lineTo(tips[k][0], tips[k][1] + 3); }
  ctx.strokeStyle = '#6b6f80'; ctx.lineWidth = 1.3; ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const x = tips[k][0], y = tips[k][1], col = TOY[k % 6];
    ctx.fillStyle = tint(col, -0.3);
    ctx.beginPath(); ctx.moveTo(x - 7, y + 5.6); ctx.quadraticCurveTo(x, y - 1.8, x + 7, y + 5.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(x - 5.6, y + 5.4, 11.2, 7.2, [0, 0, 3.2, 3.2]); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = night > 0.3 ? '#ffe9a0' : '#eaf7ff'; ctx.fillRect(x - 4.2, y + 6.2, 8.4, 3.2);
    if (nr > k * 2) dot(ctx, [x - 1.9, y + 8], 1.7, SKIN[k % 4]);
    if (nr > k * 2 + 1) dot(ctx, [x + 1.9, y + 8], 1.7, SKIN[(k + 1) % 4]);
  }
  frame(0.34);
  line(ctx, P(0, -0.34, hub), P(0, 0.34, hub), '#c9a227', 4);
  const h = P(0, 0.34, hub);
  dot(ctx, h, 5.2, '#ffd23f'); ring(ctx, h, 5.2, INK, 1);
  dot(ctx, h, 2.2, '#ef476f');
}

function swing(ctx, o) {
  const a = o.anim || 0, s = o.spin || 0, rot = a * 1.6, nr = count(o);
  slab(ctx, o);
  shadow(ctx, 0.04, -0.04, 0.68);
  cyl(ctx, 0, 0, 0.18, 0.32, 0.64, '#7d46c7', '#cdb4f7');
  tower(ctx, 0, 0, 0.32, 0.52, 0.5, 0.42, PLUM, '#e3d3fb', 16, 0);
  const chairs = [];
  const th = 0.22 + s * 0.66, Lu = 1.72, zc = 3.44, ra = 0.46, r = ra + (Lu / K) * Math.sin(th), z = zc - Lu * Math.cos(th);
  for (let k = 0; k < 10; k++) {
    const an = rot + (k * TAU) / 10, cu = Math.cos(an), sv = Math.sin(an);
    chairs.push({ front: cu + sv >= 0, k, x: X(cu * r, sv * r), y: Y(cu * r, sv * r, z), qx: X(cu * ra, sv * ra), qy: Y(cu * ra, sv * ra, zc) });
  }
  const group = (front) => {
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const c of chairs) {
      if (c.front !== front) continue;
      ctx.moveTo(c.qx, c.qy); ctx.lineTo(c.x - 2.2, c.y - 1); ctx.moveTo(c.qx, c.qy); ctx.lineTo(c.x + 2.2, c.y - 1);
    }
    ctx.strokeStyle = 'rgba(60,60,84,0.75)'; ctx.lineWidth = 0.8; ctx.stroke();
    // legs dangling
    ctx.beginPath();
    for (const c of chairs) {
      if (c.front !== front || nr <= c.k) continue;
      ctx.moveTo(c.x - 1.2, c.y + 2); ctx.lineTo(c.x - 1.6, c.y + 6); ctx.moveTo(c.x + 1.2, c.y + 2); ctx.lineTo(c.x + 1.6, c.y + 6);
    }
    ctx.strokeStyle = '#3d5a80'; ctx.lineWidth = 1.6; ctx.stroke();
    for (const c of chairs) {
      if (c.front !== front) continue;
      ctx.fillStyle = TOY[c.k % 6];
      ctx.beginPath(); ctx.roundRect(c.x - 3.4, c.y - 1.4, 6.8, 4.6, 1.6); ctx.fill();
      if (nr > c.k) rider(ctx, [c.x, c.y + 0.4], c.k);
    }
  };
  group(false);
  tower(ctx, 0, 0, 0.52, 3.46, 0.15, 0.12, GOLD, null, 3);
  for (let k = 0; k < 3; k++) { const zb = 0.9 + k * 0.92, rb = 0.146 - k * 0.0095; cyl(ctx, 0, 0, zb, zb + 0.46, rb, '#ef476f', null, null); }
  group(true);
  // turning crown
  ell(ctx, 0, 0, zc - 0.04, 0.6, '#a8324a');
  tower(ctx, 0, 0, zc - 0.04, zc + 0.3, 0.6, 0.64, STRIPES, null, 10, rot + PI / 4);
  rimBulbs(ctx, 0, 0, zc + 0.04, 0.61, 7);
  tent(ctx, 0, 0, zc + 0.3, 4.5, 0.66, SUNNY, 10, rot + PI / 4);
  mastFlag(ctx, 0, 0, 4.48, 0.5, '#06d6a0', 2);
  dot(ctx, pt(0, 0, 4.54), 2.8, '#ffd23f');
  ring(ctx, pt(0, 0, 4.54), 2.8, INK, 1);
}

function pirate(ctx, o) {
  const a = o.anim || 0, s = o.spin || 0, nr = count(o);
  slab(ctx, o);
  const ax = o.w >= o.h ? 1 : 0, ay = 1 - ax;
  const P = (p, q, z) => pt(ax * p + ay * q, ay * p + ax * q, z);
  const bx = (p0, q0, p1, q1, z0, z1, c0, c1, c2) => (ax ? box(ctx, p0, q0, p1, q1, z0, z1, c0, c1, c2) : box(ctx, q0, p0, q1, p1, z0, z1, c0, c1, c2));
  const piv = 4.3;
  const th = 1.1 * Math.sin(a * 1.7) * s, c = Math.cos(th), sn = Math.sin(th);
  const frame = (q) => {
    const top = P(0, q, piv);
    beam(ctx, P(-1.16, q, 0.18), top, '#4a9be0', 4); beam(ctx, P(1.16, q, 0.18), top, '#3b8ed0', 4);
    beam(ctx, P(-0.6, q, 2.17), P(0.6, q, 2.17), '#3b8ed0', 2.4);
    dot(ctx, P(-1.16, q, 0.18), 2.8, '#ffd23f'); dot(ctx, P(1.16, q, 0.18), 2.8, '#ffd23f');
  };
  // point in the swing plane: p along the axis (tiles), d down from the pivot (levels)
  const SP = (p, d, q = 0) => {
    const pu = p * K;
    return P((pu * c + d * sn) / K, q, piv + pu * sn - d * c);
  };
  const hull = (q) => [SP(-1.14, 2.08, q), SP(-0.94, 2.56, q), SP(0.94, 2.56, q), SP(1.16, 2.02, q), SP(1.02, 2.84, q), SP(0.7, 3.26, q), SP(0.25, 3.46, q),
    SP(-0.25, 3.46, q), SP(-0.7, 3.26, q), SP(-1.0, 2.84, q)];
  frame(-0.36);
  bx(-0.62, -0.3, 0.62, 0.3, 0.18, 0.32, '#e3c08f', '#c99b5f', '#a87c48');
  bx(-0.2, 0.3, 0.2, 0.42, 0.18, 0.25, '#e3c08f', '#c99b5f', '#a87c48');
  poly(ctx, hull(-0.17), '#7a4a28', INK);
  beam(ctx, SP(0, 0), SP(-0.52, 2.6), '#8d99ae', 2); beam(ctx, SP(0, 0), SP(0.52, 2.6), '#8d99ae', 2);
  // stern lantern and flag
  line(ctx, SP(-1.12, 2.1), SP(-1.12, 1.2), '#5b4636', 1.4);
  ctx.fillStyle = '#2b2d42'; const f0 = SP(-1.12, 1.2), f1 = SP(-1.12, 1.62), f2 = SP(-0.82, 1.4);
  ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f2[0], f2[1] + Math.sin(T * 6) * 1.2); ctx.lineTo(f1[0], f1[1]); ctx.closePath(); ctx.fill();
  dot(ctx, [(f0[0] + f1[0] + f2[0]) / 3, (f0[1] + f1[1] + f2[1]) / 3], 1.2, '#f4f6fa');
  const n = Math.min(7, Math.ceil(nr / 2));
  for (let k = 0; k < n; k++) rider(ctx, SP(-0.72 + k * 0.24, 2.5), k);
  const h = hull(0.17);
  poly(ctx, h, '#b5733f', INK);
  poly(ctx, [h[4], h[5], h[6], h[7], h[8], h[9], SP(-0.86, 3.0, 0.17), SP(-0.3, 3.24, 0.17), SP(0.3, 3.24, 0.17), SP(0.86, 3.0, 0.17)], '#8f5630');
  poly(ctx, [h[0], h[1], h[2], h[3], SP(1.1, 2.36, 0.17), SP(0.92, 2.88, 0.17), SP(-0.92, 2.88, 0.17), SP(-1.08, 2.4, 0.17)], '#ffd23f', INK);
  for (let k = 0; k < 4; k++) {
    const p = SP(-0.6 + k * 0.4, 3.08, 0.17);
    dot(ctx, p, 2.5, TOY[(k * 2) % 6]); ring(ctx, p, 2.5, INK, 0.8); dot(ctx, p, 0.9, '#fff4dc');
  }
  // figurehead
  const bow = SP(1.16, 2.02, 0.17);
  dot(ctx, bow, 2.8, '#ffd23f'); ring(ctx, bow, 2.8, INK, 0.8);
  bulb(ctx, SP(-1.12, 2.02, 0.17), 3);
  lamps(ctx);
  frame(0.36);
  line(ctx, P(0, -0.36, piv), P(0, 0.36, piv), '#d9a900', 5);
  const hb = P(0, 0.36, piv);
  dot(ctx, hb, 4.6, '#ffd23f'); ring(ctx, hb, 4.6, INK, 1);
  mastFlag(ctx, ax * 0 + ay * 0.36, ay * 0 + ax * 0.36, piv + 0.2, 0.42, '#ef476f', 2);
}

function bumper(ctx, o) {
  const a = o.anim || 0, nr = count(o), E = 1.38;
  slab(ctx, o);
  box(ctx, -E, -E, E, E, 0.18, 0.34, '#8a99b0', '#5b6577', '#4b5464');
  flat(ctx, -1.27, -1.27, 1.27, 1.27, 0.34, '#9aa9bf');
  ctx.beginPath();
  quad(ctx, pt(-1.1, 0.25, 0.34), pt(-0.85, 0.25, 0.34), pt(0.25, -0.85, 0.34), pt(0.25, -1.1, 0.34));
  quad(ctx, pt(-0.4, 0.95, 0.34), pt(-0.3, 0.95, 0.34), pt(0.95, -0.3, 0.34), pt(0.95, -0.4, 0.34));
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
  box(ctx, -E, -E, E, -1.3, 0.34, 0.64, '#ffa3b9', '#ef476f', '#d63a5f');
  box(ctx, -E, -E, -1.3, E, 0.34, 0.64, '#ffa3b9', '#ef476f', '#d63a5f');
  const pole = (u, v) => post(ctx, u, v, 0.34, 2.5, 5.4, '#f4f6fa', '#cfd6e0');
  pole(-1.3, -1.3);
  const cars = [];
  for (let k = 0; k < 6; k++) {
    cars.push({ u: 0.98 * Math.sin(a * (0.55 + 0.09 * k) + k * 1.3), v: 0.98 * Math.cos(a * (0.5 + 0.11 * k) + k * 2.1), k });
  }
  cars.sort((p, q) => p.u + p.v - q.u - q.v);
  ctx.beginPath();
  for (const c of cars) { const x = X(c.u + 0.04, c.v - 0.04), y = Y(c.u + 0.04, c.v - 0.04, 0.34); ctx.moveTo(x + 0.23 * RX, y); ctx.ellipse(x, y, 0.23 * RX, 0.23 * RY, 0, 0, TAU); }
  ctx.fillStyle = 'rgba(20,16,50,0.2)'; ctx.fill();
  // trolley poles up to the ceiling, behind the cars
  ctx.beginPath();
  for (const c of cars) { const x = X(c.u, c.v); ctx.moveTo(x, Y(c.u, c.v, 0.62)); ctx.lineTo(x, Y(c.u, c.v, 2.46)); }
  ctx.strokeStyle = 'rgba(60,60,84,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  for (const c of cars) {
    const col = TOY[c.k];
    cyl(ctx, c.u, c.v, 0.36, 0.44, 0.22, '#2b2d42', '#3d405b', null);
    tower(ctx, c.u, c.v, 0.42, 0.64, 0.18, 0.15, [col], tint(col, 0.3), 3);
    if (nr > c.k * 2) rider(ctx, pt(c.u, c.v, 0.62), c.k);
    if ((o.spin || 0) > 0.3 && Math.sin(T * 9 + c.k * 2.7) > 0.72) dot(ctx, pt(c.u, c.v, 2.46), night > 0.3 ? 2.6 : 1.8, '#fff6a8');
  }
  // front barriers with a way in on the right
  box(ctx, -E, 1.3, E, E, 0.34, 0.58, '#ffa3b9', '#ef476f', '#d63a5f');
  box(ctx, 1.3, -E, E, 0.5, 0.34, 0.58, '#ffa3b9', '#ef476f', '#d63a5f');
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const m = -E + 0.12 + k * 0.46;
    quad(ctx, pt(m, E, 0.58), pt(m + 0.23, E, 0.58), pt(m + 0.23, E, 0.34), pt(m, E, 0.34));
    if (m + 0.23 < 0.5) quad(ctx, pt(E, m, 0.58), pt(E, m + 0.23, 0.58), pt(E, m + 0.23, 0.34), pt(E, m, 0.34));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fill();
  pole(-1.3, 1.3); pole(1.3, -1.3);
  // roof you can see through
  const Rf = 1.44, sw = (2 * Rf) / 8;
  ctx.globalAlpha *= 0.6;
  for (let c = 0; c < 2; c++) {
    ctx.beginPath();
    for (let k = c; k < 8; k += 2) quad(ctx, pt(-Rf + k * sw, -Rf, 2.56), pt(-Rf + (k + 1) * sw, -Rf, 2.56), pt(-Rf + (k + 1) * sw, Rf, 2.56), pt(-Rf + k * sw, Rf, 2.56));
    ctx.fillStyle = c ? '#ef476f' : '#ffd23f'; ctx.fill();
  }
  ctx.globalAlpha /= 0.6;
  box(ctx, -Rf, 1.36, Rf, Rf, 2.28, 2.56, '#ffc0d0', '#ef476f', '#d63a5f');
  box(ctx, 1.36, -Rf, Rf, Rf, 2.28, 2.56, '#ffc0d0', '#ef476f', '#d63a5f');
  flat(ctx, -Rf, -Rf, Rf, Rf, 2.56, null, INK);
  for (let k = 0; k < 9; k++) {
    const m = -1.28 + k * 0.32;
    bulb(ctx, pt(m, Rf, 2.42), k); bulb(ctx, pt(Rf, m, 2.42), k + 4);
  }
  lamps(ctx);
  pole(1.3, 1.3);
  // sign board with three little cars
  wallL(ctx, -0.56, 0.56, Rf, 2.56, 2.98, '#3b8ed0', INK);
  wallL(ctx, -0.5, 0.5, Rf, 2.62, 2.92, '#fff4dc');
  for (let k = 0; k < 3; k++) dot(ctx, pt(-0.28 + k * 0.28, Rf, 2.77), 2.6, TOY[k * 2]);
  mastFlag(ctx, -Rf, Rf, 2.56, 0.4, '#ffd23f', 0); mastFlag(ctx, Rf, -Rf, 2.56, 0.4, '#06d6a0', 2);
}

function haunted(ctx, o, t) {
  const a = o.anim || 0, s = o.spin || 0, H = 1.18, on = night > 0.3;
  slab(ctx, o, '#e6e0ee');
  box(ctx, -H, -H, H, H, 0.18, 2.7, '#8d7bb0', '#7f6da6', '#5f5080');
  wallL(ctx, -H, H, H, 0.18, 0.5, '#6b5b8e'); wallR(ctx, H, -H, H, 0.18, 0.5, '#4f4270');
  // boards
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const z = 1.05 + k * 0.55;
    ctx.moveTo(X(-H, H), Y(-H, H, z)); ctx.lineTo(X(H, H), Y(H, H, z)); ctx.lineTo(X(H, -H), Y(H, -H, z));
  }
  ctx.strokeStyle = 'rgba(40,28,64,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  // windows flicker; warm and bright at night
  const flick = (on ? 0.82 : 0.62) + (on ? 0.18 : 0.38) * Math.sin(t * 7 + Math.sin(t * 2.3) * 3);
  const glass = on ? '#ffd257' : '#ffe680';
  const winL = (u0) => {
    wallL(ctx, u0 - 0.06, u0 + 0.46, H, 1.24, 2.22, '#3d3154');
    ctx.globalAlpha *= flick; wallL(ctx, u0, u0 + 0.4, H, 1.3, 2.16, glass); ctx.globalAlpha /= flick;
    ctx.beginPath();
    ctx.moveTo(X(u0 + 0.2, H), Y(u0 + 0.2, H, 1.3)); ctx.lineTo(X(u0 + 0.2, H), Y(u0 + 0.2, H, 2.16));
    ctx.moveTo(X(u0, H), Y(u0, H, 1.76)); ctx.lineTo(X(u0 + 0.4, H), Y(u0 + 0.4, H, 1.76));
    ctx.strokeStyle = '#3d3154'; ctx.lineWidth = 1.1; ctx.stroke();
    if (on) glow(ctx, pt(u0 + 0.2, H, 1.73), 11, '#ffc94a', 0.2);
  };
  winL(-0.82); winL(0.36);
  // a shutter hanging loose
  poly(ctx, [pt(-0.34, H, 2.2), pt(-0.16, H, 2.12), pt(-0.12, H, 1.3), pt(-0.3, H, 1.38)], '#4a3d66', INK);
  wallR(ctx, H, -0.88, -0.36, 1.24, 2.22, '#32284a');
  ctx.globalAlpha *= flick; wallR(ctx, H, -0.82, -0.42, 1.3, 2.16, glass); ctx.globalAlpha /= flick;
  ctx.beginPath();
  ctx.moveTo(X(H, -0.62), Y(H, -0.62, 1.3)); ctx.lineTo(X(H, -0.62), Y(H, -0.62, 2.16));
  ctx.moveTo(X(H, -0.82), Y(H, -0.82, 1.76)); ctx.lineTo(X(H, -0.42), Y(H, -0.42, 1.76));
  ctx.strokeStyle = '#32284a'; ctx.lineWidth = 1.1; ctx.stroke();
  if (on) glow(ctx, pt(H, -0.62, 1.73), 11, '#ffc94a', 0.2);
  // door with a step and a little porch roof
  box(ctx, H, 0.04, H + 0.2, 0.84, 0.18, 0.3, '#a99cc4', '#8d7bb0', '#75649a');
  wallR(ctx, H, 0.12, 0.76, 0.3, 1.62, '#32284a');
  poly(ctx, [pt(H, 0.18, 0.3), pt(H, 0.18, 1.4), pt(H, 0.44, 1.56), pt(H, 0.7, 1.4), pt(H, 0.7, 0.3)], '#1d1630', INK);
  dot(ctx, pt(H, 0.62, 0.86), 1.2, '#ffd23f');
  poly(ctx, [pt(H, 0.02, 1.86), pt(H, 0.86, 1.86), pt(H + 0.24, 0.86, 1.66), pt(H + 0.24, 0.02, 1.66)], '#3d3154', INK);
  // lantern by the door
  const lp = pt(H + 0.03, 0.94, 1.36);
  if (on) glow(ctx, lp, 8, '#ffb84a', 0.32);
  dot(ctx, lp, 2.1, on ? '#ffe9a0' : '#ffcf5a'); ring(ctx, lp, 2.1, INK, 0.8);
  // roof
  const Ev = H + 0.16, apex = pt(0, 0, 4.4);
  const eL0 = pt(-Ev, Ev, 2.66), eC = pt(Ev, Ev, 2.66), eR0 = pt(Ev, -Ev, 2.66);
  poly(ctx, [eL0, eC, apex], '#45375f', INK);
  poly(ctx, [eR0, eC, apex], '#2c2340', INK);
  const mix = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  for (const f of [0.3, 0.58]) {
    line(ctx, mix(eL0, apex, f), mix(eC, apex, f), 'rgba(20,14,40,0.3)', 1);
    line(ctx, mix(eR0, apex, f), mix(eC, apex, f), 'rgba(140,120,180,0.22)', 1);
  }
  line(ctx, eC, apex, '#6a5a8c', 1.4);
  line(ctx, eL0, eC, '#6a5a8c', 1.6);
  // crooked tower
  box(ctx, -0.95, 0.32, -0.45, 0.82, 2.7, 4.3, '#8d7bb0', '#7f6da6', '#5f5080');
  wallL(ctx, -0.82, -0.58, 0.82, 3.42, 3.98, '#3d3154');
  ctx.globalAlpha *= flick; wallL(ctx, -0.78, -0.62, 0.82, 3.48, 3.92, glass); ctx.globalAlpha /= flick;
  poly(ctx, [pt(-1.06, 0.93, 4.28), pt(-0.34, 0.93, 4.28), pt(-0.62, 0.52, 5.36)], '#45375f', INK);
  poly(ctx, [pt(-0.34, 0.21, 4.28), pt(-0.34, 0.93, 4.28), pt(-0.62, 0.52, 5.36)], '#2c2340', INK);
  const tip = pt(-0.62, 0.52, 5.36);
  line(ctx, tip, [tip[0], tip[1] - 6], '#2c2340', 1.2);
  line(ctx, [tip[0] - 3.4, tip[1] - 4.4], [tip[0] + 3.8, tip[1] - 5.2], '#2c2340', 1.2);
  // graves and a pumpkin on the pad
  for (const [gu, k] of [[-0.86, 0], [-0.3, 1]]) {
    const g = pt(gu, 1.31, 0.18);
    ctx.fillStyle = k ? '#b9c1ce' : '#a7afbd';
    ctx.beginPath(); ctx.roundRect(g[0] - 3, g[1] - 7.6 + k, 6, 8 - k, [3, 3, 0, 0]); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
    line(ctx, [g[0], g[1] - 5.6 + k], [g[0], g[1] - 2.4], 'rgba(40,28,64,0.4)', 0.9);
    line(ctx, [g[0] - 1.4, g[1] - 4.4 + k], [g[0] + 1.4, g[1] - 4.4 + k], 'rgba(40,28,64,0.4)', 0.9);
  }
  const pk = pt(1.32, 1.12, 0.18);
  if (on) glow(ctx, [pk[0], pk[1] - 3], 7, '#ff9d2e', 0.3);
  ctx.fillStyle = '#f78c1f'; ctx.beginPath(); ctx.ellipse(pk[0], pk[1] - 3, 4, 3.3, 0, 0, 6.3); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = on ? '#fff1a0' : '#5b3a21'; ctx.fillRect(pk[0] - 2.2, pk[1] - 4.2, 1.4, 1.3); ctx.fillRect(pk[0] + 0.8, pk[1] - 4.2, 1.4, 1.3);
  line(ctx, [pk[0], pk[1] - 6.2], [pk[0] + 0.8, pk[1] - 7.8], '#3d7a3a', 1.2);
  if (s > 0.1) {
    // bats round the tower
    ctx.globalAlpha *= s;
    for (let k = 0; k < 3; k++) {
      const an = a * 1.4 + k * 2.1, b = pt(-0.62 + Math.cos(an) * 0.7, 0.52 + Math.sin(an) * 0.7, 5.0 + 0.3 * Math.sin(a * 3 + k * 2)), fl = Math.sin(a * 14 + k) * 2.4;
      ctx.fillStyle = '#1d1630';
      ctx.beginPath(); ctx.moveTo(b[0], b[1] + 1.2); ctx.lineTo(b[0] - 5, b[1] - fl); ctx.lineTo(b[0] - 2, b[1] - 0.6); ctx.lineTo(b[0], b[1] - 1.8);
      ctx.lineTo(b[0] + 2, b[1] - 0.6); ctx.lineTo(b[0] + 5, b[1] - fl); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha /= s;
    const g = pt(0.5 + Math.sin(a) * 0.5, -0.3 + Math.cos(a * 0.8) * 0.4, 4.4 + Math.sin(a * 2) * 0.3);
    if (on) glow(ctx, g, 12, '#c8f4ff', 0.22 * s);
    ctx.globalAlpha *= 0.88 * s;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(g[0], g[1], 6, PI, 0); ctx.lineTo(g[0] + 6, g[1] + 8);
    ctx.lineTo(g[0] + 3, g[1] + 5); ctx.lineTo(g[0], g[1] + 8); ctx.lineTo(g[0] - 3, g[1] + 5); ctx.lineTo(g[0] - 6, g[1] + 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a2138';
    ctx.beginPath(); ctx.arc(g[0] - 2, g[1] - 1, 1.2, 0, 6.3); ctx.arc(g[0] + 2, g[1] - 1, 1.2, 0, 6.3); ctx.fill();
    ctx.globalAlpha /= 0.88 * s;
  }
}

function drop(ctx, o) {
  const nr = count(o);
  slab(ctx, o);
  shadow(ctx, 0.05, -0.05, 0.72);
  tower(ctx, 0, 0, 0.18, 0.6, 0.66, 0.62, STEEL, '#6c788e', 4);
  tower(ctx, 0, 0, 0.44, 0.6, 0.63, 0.62, HAZARD, null, 20, 0, null);
  let gz = 0.8;
  if (o.st === 'run') {
    const tau = o.runT || 0;
    if (tau < 5) { const f = tau / 5; gz = 0.8 + 7.6 * (f * f * (3 - 2 * f)); }
    else if (tau < 6.5) gz = 8.4;
    else if (tau < 7.5) { const f = (tau - 6.5) / 1.0; gz = 8.4 - 7.2 * f * f; }
    else gz = 0.8 + 0.4 * Math.exp(-(tau - 7.5) * 2) * Math.abs(Math.cos((tau - 7.5) * 6));
  }
  const mast = (z0, z1) => {
    box(ctx, -0.15, -0.15, 0.15, 0.15, z0, z1, '#f4f6fa', '#eef1f6', '#cfd6e0', null);
    for (let z = Math.ceil(z0); z < z1; z += 2) {
      const zt = Math.min(z1, z + 1);
      wallL(ctx, -0.15, 0.15, 0.15, z, zt, '#ef476f');
      wallR(ctx, 0.15, -0.15, 0.15, z, zt, '#d63a5f');
    }
    // guide rails down both faces, then the edges
    const ya = Y(0, 0, z0), yb = Y(0, 0, z1), x = X(0, 0);
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x - 4.8, ya + 2.4); ctx.lineTo(x - 4.8, yb + 2.4); ctx.moveTo(x + 4.8, ya + 2.4); ctx.lineTo(x + 4.8, yb + 2.4);
    ctx.strokeStyle = 'rgba(40,28,64,0.25)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 9.6, ya); ctx.lineTo(x - 9.6, yb); ctx.moveTo(x + 9.6, ya); ctx.lineTo(x + 9.6, yb);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.lineCap = 'round';
    for (let z = Math.ceil(z0 + 0.3); z < z1 - 0.2; z += 1) bulb(ctx, pt(0.15, 0.15, z + 0.5), z);
    lamps(ctx);
  };
  const seat = (k, back) => {
    const an = (k / 8) * TAU + PI / 8, p = pt(Math.cos(an) * 0.47, Math.sin(an) * 0.47, gz + 0.38);
    const pad = () => { ctx.fillStyle = '#c2334f'; ctx.beginPath(); ctx.roundRect(p[0] - 3.2, p[1] - 7, 6.4, 7.6, 1.6); ctx.fill(); };
    if (back) { if (nr > k) head(ctx, [p[0], p[1] - 8], k); pad(); } else { pad(); if (nr > k) rider(ctx, [p[0], p[1] - 0.4], k); }
  };
  const isBack = (k) => { const an = (k / 8) * TAU + PI / 8; return Math.cos(an) + Math.sin(an) < 0; };
  mast(0.6, gz + 0.36);
  tower(ctx, 0, 0, gz, gz + 0.36, 0.5, 0.54, GOLD, '#ffe790', 4);
  for (let k = 0; k < 8; k++) if (isBack(k)) seat(k, true);
  mast(gz + 0.36, 9.3);
  for (let k = 0; k < 8; k++) if (!isBack(k)) seat(k, false);
  box(ctx, -0.27, -0.27, 0.27, 0.27, 9.3, 9.62, '#6fb3ec', '#3b8ed0', '#2f73ab');
  const b = pt(0, 0, 9.86);
  if (night > 0.3) glow(ctx, b, 9, '#ff6b6b', 0.25 + 0.15 * Math.sin(T * 4));
  dot(ctx, b, 3, night > 0.3 ? '#ffb0a0' : '#ffd23f'); ring(ctx, b, 3, INK, 1);
  mastFlag(ctx, 0, 0, 9.9, 0.42, '#ef476f', 3);
}

// Spiral slide: the chute winds round the tower and ends at the front. Its edges never change,
// so they are worked out once, in pixels from the middle of the ride.
const HELIX = (() => {
  const zB = 0.18, zT = 4.9, rB = 0.47, rT = 0.3, turns = 2.3, zTop = 4.15, zBot = 0.3, n = 46, wide = 0.36;
  const rAt = (z) => rB + ((rT - rB) * (z - zB)) / (zT - zB);
  const angle = (f) => PI / 4 + 0.5 + (1 - f) * turns * TAU;
  const at = (f, rr, dz) => {
    const an = angle(f), z = zTop + (zBot - zTop) * f, r = rAt(z) + rr;
    return [(Math.cos(an) - Math.sin(an)) * r * 32, (Math.cos(an) + Math.sin(an)) * r * 16 - (z + dz) * 16];
  };
  const inner = [], outer = [], lip = [], near = [], tone = [];
  for (let k = 0; k <= n; k++) { inner.push(at(k / n, -0.02, 0)); outer.push(at(k / n, wide, 0)); lip.push(at(k / n, wide, 0.32)); }
  for (let k = 0; k < n; k++) {
    const an = angle((k + 0.5) / n), l = Math.sin(an) - Math.cos(an);
    near.push(Math.cos(an) + Math.sin(an) > 0); tone.push(l > 0.4 ? 1 : l < -0.4 ? -1 : 0);
  }
  return { n, inner, outer, lip, near, tone, rAt, angle, at, zB, zT, rB, rT, wide };
})();
const RIM = ['#3379b3', '#3b8ed0', '#5aa3dc']; // outside of the chute: in shade, plain, in the light
function slide(ctx, o) {
  const a = o.anim || 0, nr = count(o), HX = HELIX, n = HX.n;
  slab(ctx, o);
  shadow(ctx, 0.06, -0.06, 0.9);
  // a run of chute pieces between two edges, as one shape
  const strip = (A, B, k0, k1, fill) => {
    ctx.beginPath(); ctx.moveTo(ox + A[k0][0], oy + A[k0][1]);
    for (let k = k0 + 1; k <= k1; k++) ctx.lineTo(ox + A[k][0], oy + A[k][1]);
    for (let k = k1; k >= k0; k--) ctx.lineTo(ox + B[k][0], oy + B[k][1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  const part = (near, floor) => {
    let k = 0;
    while (k < n) {
      if (HX.near[k] !== near) { k++; continue; }
      let e = k;
      const tone = HX.tone[k];
      while (e < n && HX.near[e] === near && (floor || HX.tone[e] === tone)) e++;
      if (floor) strip(HX.inner, HX.outer, k, e, near ? '#ffd23f' : '#f0bd3c');
      else strip(HX.outer, HX.lip, k, e, near ? RIM[tone + 1] : '#7fbdf0');
      k = e;
    }
  };
  // the far half of the chute: rim first, then the floor in front of it
  part(false, false); part(false, true);
  tower(ctx, 0, 0, HX.zB, HX.zT, HX.rB, HX.rT, STRIPES, null, 12, 0.26);
  // doors at the bottom and the top, little windows
  const door = (an, z, r, w, h) => {
    const p = pt(Math.cos(an) * r, Math.sin(an) * r, z);
    ctx.fillStyle = night > 0.3 ? '#ffd76a' : '#3d2f52';
    ctx.beginPath(); ctx.roundRect(p[0] - w / 2, p[1] - h, w, h, [w / 2, w / 2, 0, 0]); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  };
  door(-0.1, HX.zB, HX.rB, 7.5, 11);
  door(PI / 4 + 0.75, 2.3, HX.rAt(2.3) * 0.96, 4, 6);
  door(-0.02, 3.2, HX.rAt(3.2) * 0.96, 4, 6);
  part(true, true); part(true, false);
  // landing mat
  const m0 = HX.at(1, HX.wide / 2, 0);
  ctx.fillStyle = '#06d6a0'; ctx.beginPath(); ctx.ellipse(ox + m0[0] + 5, oy + m0[1] + 3.5, 10, 5, 0, 0, 6.3); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  // guests on their mats
  if ((o.spin || 0) > 0.05) {
    const m = Math.min(4, nr);
    for (let k = 0; k < m; k++) {
      const f = (a * 0.24 + k * 0.27) % 1, an = HX.angle(f);
      if (Math.cos(an) + Math.sin(an) < -0.25) continue;
      const p = HX.at(f, HX.wide * 0.5, 0.12), x = ox + p[0], y = oy + p[1];
      ctx.fillStyle = '#2b2d42'; ctx.beginPath(); ctx.ellipse(x, y, 4, 2, 0, 0, 6.3); ctx.fill();
      rider(ctx, [x, y - 0.6], k);
    }
  }
  // gallery, roof and flag
  tower(ctx, 0, 0, HX.zT - 0.02, HX.zT + 0.2, HX.rT + 0.08, HX.rT + 0.12, GOLD, '#ffe790', 4);
  rimBulbs(ctx, 0, 0, HX.zT + 0.1, HX.rT + 0.1, 5);
  tent(ctx, 0, 0, HX.zT + 0.2, 6.15, HX.rT + 0.14, SKY, 8, 0.2);
  mastFlag(ctx, 0, 0, 6.12, 0.5, '#ffd23f', 1);
  dot(ctx, pt(0, 0, 6.17), 2.4, '#ffd23f'); ring(ctx, pt(0, 0, 6.17), 2.4, INK, 0.9);
}

// Hedge maze layout: walls on a 5 x 5 grid of cells, and the way guests walk to the middle.
// back and front are the long outer hedges, which always lie behind and in front of the rest.
const MAZE = (() => {
  const g = (i) => -1.36 + i * 0.544, th = 0.075;
  const walls = [], back = [], front = [];
  const Hw = (i, j, n = 1, to = walls) => to.push({ u0: g(i) - th, u1: g(i + n) + th, v0: g(j) - th, v1: g(j) + th });
  const Vw = (i, j, n = 1, to = walls) => to.push({ u0: g(i) - th, u1: g(i) + th, v0: g(j) - th, v1: g(j + n) + th });
  Hw(0, 0, 5, back); Vw(0, 0, 5, back);
  Vw(5, 0, 5, front); Hw(0, 5, 2, front); Hw(3, 5, 2, front); // with a gap for the way in
  for (let i = 1; i < 4; i++) { Hw(i, 1); Hw(i, 4); Vw(1, i); if (i !== 1) Vw(4, i); }
  Hw(2, 2); Hw(2, 3); Vw(3, 2); // the middle, open to the left
  Vw(1, 4); Hw(3, 2); // dead ends
  for (const w of walls) w.d = (w.u0 + w.u1 + w.v0 + w.v1) / 2;
  const path = [[2, 4.62], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [3, 1], [2, 1], [1, 1], [1, 2], [1.75, 2]].map(([i, j]) => [g(i + 0.5), g(j + 0.5)]);
  return { walls, back, front, path, g };
})();

function maze(ctx, o) {
  const a = o.anim || 0, nr = count(o), g = MAZE.g;
  const w = o.w / 2 - 0.06, h = o.h / 2 - 0.06;
  box(ctx, -w, -h, w, h, 0, 0.1, '#ecdcae', '#cdb98a', '#b5a174');
  // gravel flecks on the paths
  ctx.fillStyle = 'rgba(160,130,80,0.35)';
  for (let k = 0; k < 12; k++) ctx.fillRect(X(Math.sin(k * 7.3) * 1.2, Math.cos(k * 4.1) * 1.2), Y(Math.sin(k * 7.3) * 1.2, Math.cos(k * 4.1) * 1.2, 0.1), 1.6, 1);
  const hedge = (wl) => box(ctx, wl.u0, wl.v0, wl.u1, wl.v1, 0.1, 0.64, '#5ccb6e', '#38a554', '#27823f', null);
  const ball = (u, v) => {
    const p = pt(u, v, 0.86);
    dot(ctx, p, 5.4, '#27853f'); dot(ctx, [p[0] - 0.8, p[1] - 0.8], 4.4, '#3aa856'); dot(ctx, [p[0] - 1.8, p[1] - 2], 2, '#66d182');
  };
  for (const wl of MAZE.back) hedge(wl);
  ball(-1.36, -1.36);
  const items = [];
  for (const wl of MAZE.walls) items.push(wl);
  const m = Math.min(7, nr), L = MAZE.path.length - 1;
  for (let k = 0; k < m; k++) {
    let s = (a * 0.5 + k * 2.9) % (2 * L);
    if (s > L) s = 2 * L - s;
    const i = Math.min(L - 1, Math.floor(s)), f = s - i, A = MAZE.path[i], B = MAZE.path[i + 1];
    const u = A[0] + (B[0] - A[0]) * f, v = A[1] + (B[1] - A[1]) * f;
    items.push({ guest: k, u, v, d: u + v + 0.02, bob: Math.abs(Math.sin(a * 6 + k * 2)) * 0.05 });
  }
  items.push({ hut: 1, d: 0.32 });
  items.sort((p, q) => p.d - q.d);
  for (const it of items) {
    if (it.guest !== undefined) {
      const p = pt(it.u, it.v, 0.14 + it.bob);
      ctx.fillStyle = 'rgba(20,16,50,0.18)'; ctx.beginPath(); ctx.ellipse(p[0], p[1] + 0.4, 3.6, 1.8, 0, 0, 6.3); ctx.fill();
      rider(ctx, [p[0], p[1] - 1.6], it.guest);
    } else if (it.hut) {
      // little pavilion in the middle
      ell(ctx, 0, 0, 0.11, 0.22, '#d9c08e', INK);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const pu = k & 1 ? 0.13 : -0.13, pv = k & 2 ? 0.13 : -0.13; ctx.moveTo(X(pu, pv), Y(pu, pv, 0.11)); ctx.lineTo(X(pu, pv), Y(pu, pv, 1.08)); }
      ctx.strokeStyle = '#f4f6fa'; ctx.lineWidth = 1.6; ctx.stroke();
      tent(ctx, 0, 0, 1.05, 1.62, 0.27, STRIPES, 8, 0.2);
      mastFlag(ctx, 0, 0, 1.6, 0.4, '#ffd23f', 2);
    } else hedge(it);
  }
  for (const wl of MAZE.front) hedge(wl);
  ball(1.36, -1.36); ball(-1.36, 1.36); ball(1.36, 1.36);
  // leaves catching the light on top of the outer hedge, and a few blossoms on its sides
  ctx.fillStyle = '#86e092';
  for (let k = 0; k < 9; k++) {
    const f = -1.2 + k * 0.3;
    ctx.fillRect(X(f, 1.36) - 1, Y(f, 1.36, 0.64) - 0.6, 2.2, 1.2);
    ctx.fillRect(X(1.36, f + 0.1) - 1, Y(1.36, f + 0.1, 0.64) - 0.6, 2.2, 1.2);
  }
  ctx.fillStyle = '#ff9ecf';
  for (let k = 0; k < 5; k++) {
    const fu = -1.0 + k * 0.55 + (k > 2 ? 0.25 : 0), fv = -1.1 + k * 0.55;
    ctx.fillRect(X(fu, 1.44) - 1, Y(fu, 1.44, 0.4) - 1, 2, 2);
    ctx.fillRect(X(1.44, fv) - 1, Y(1.44, fv, 0.36) - 1, 2, 2);
  }
  // entrance arch over the gap at the front left
  const e0 = g(2) - 0.02, e1 = g(3) + 0.02, ev = g(5);
  post(ctx, e0, ev, 0.1, 1.22, 2.4, '#f4f6fa', '#cfd6e0');
  post(ctx, e1, ev, 0.1, 1.22, 2.4, '#f4f6fa', '#cfd6e0');
  wallL(ctx, e0 - 0.06, e1 + 0.06, ev, 1.04, 1.4, '#ef476f', INK);
  wallL(ctx, e0, e1, ev, 1.1, 1.34, '#fff4dc');
  for (let k = 0; k < 3; k++) dot(ctx, pt(e0 + 0.14 + k * 0.15, ev, 1.22), 1.7, k === 1 ? '#ef476f' : '#35a04f');
  bulb(ctx, pt(e0 - 0.06, ev, 1.42), 0); bulb(ctx, pt(e1 + 0.06, ev, 1.42), 2); bulb(ctx, pt((e0 + e1) / 2, ev, 1.42), 1);
  lamps(ctx);
}

function lookout(ctx, o) {
  const a = o.anim || 0, nr = count(o), on = night > 0.3;
  slab(ctx, o);
  shadow(ctx, 0.05, -0.05, 0.8);
  cyl(ctx, 0, 0, 0.18, 0.32, 0.78, '#2f73ab', '#e4eef8');
  tower(ctx, 0, 0, 0.32, 0.5, 0.64, 0.6, LAGOON, '#f4f8fc', 20, 0);
  rimBulbs(ctx, 0, 0, 0.26, 0.78, 7);
  let f = 0;
  if (o.st === 'run') {
    const x = Math.min(1, (o.runT || 0) / RIDES.tower.dur);
    f = smooth(x / 0.36) - smooth((x - 0.64) / 0.36);
  }
  const gz = 0.52 + 7.2 * f, rot = a * 0.55, zc = 9.05;
  const column = (z0, z1) => {
    if (z1 <= z0) return;
    tower(ctx, 0, 0, z0, z1, 0.125, 0.125, PALE, null, 3);
    for (let z = Math.ceil(z0 / 1.5 + 0.01) * 1.5; z < z1 - 0.1; z += 1.5) {
      cyl(ctx, 0, 0, z, z + 0.12, 0.135, '#8fc4f0', null, null);
      if (on) bulb(ctx, pt(0.09, 0.09, z + 0.7), z);
    }
    lamps(ctx);
  };
  column(0.5, gz + 0.1);
  // the cabin: a ring of glass that turns as it climbs
  const rc = 0.5, g0 = gz + 0.18, g1 = gz + 1.0;
  tower(ctx, 0, 0, gz, g0, 0.4, rc, PALE, null, 4);
  cyl(ctx, 0, 0, g0, g1, rc, on ? '#8a6d2e' : '#4f7ea8', null, null);
  const x = X(0, 0), yb = Y(0, 0, g0 + 0.34);
  const m = Math.min(8, nr);
  for (let k = 0; k < m; k++) {
    const ph = rot + (k * TAU) / 8, sn = Math.sin(ph);
    if (sn > 0.05) head(ctx, [x + Math.cos(ph) * 0.4 * RX, yb + sn * 0.4 * RY], k, 2.3);
  }
  const ga = on ? 0.8 : 0.55;
  ctx.globalAlpha *= ga;
  cyl(ctx, 0, 0, g0, g1, rc, on ? '#ffe9a0' : '#c9ecfd', null, null);
  ctx.globalAlpha /= ga;
  const y0 = Y(0, 0, g0), y1 = Y(0, 0, g1);
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const ph = rot + (k * TAU) / 10, sn = Math.sin(ph);
    if (sn <= 0) continue;
    const px = x + Math.cos(ph) * rc * RX;
    ctx.moveTo(px, y0 + sn * rc * RY); ctx.lineTo(px, y1 + sn * rc * RY);
  }
  ctx.strokeStyle = '#f4f6fa'; ctx.lineWidth = 1.2; ctx.stroke();
  if (!on) {
    ctx.globalAlpha *= 0.45;
    poly(ctx, [[x - 19, y1 + 5.6], [x - 14, y1 + 8], [x - 14, y0 + 8], [x - 19, y0 + 5.6]], '#ffffff');
    ctx.globalAlpha /= 0.45;
  }
  cyl(ctx, 0, 0, g1 - 0.02, g1 + 0.12, rc + 0.04, '#f4f6fa', null);
  // shallow domed roof
  const yr = Y(0, 0, g1 + 0.12), rx = (rc + 0.04) * RX, ry = (rc + 0.04) * RY;
  ctx.beginPath(); ctx.ellipse(x, yr, rx, ry, 0, 0, PI); ctx.ellipse(x, yr, rx, ry * 1.22, 0, PI, TAU); ctx.closePath();
  ctx.fillStyle = '#2ec4b6'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x - rx * 0.3, yr - ry * 0.42, rx * 0.42, ry * 0.42, -0.2, 0, TAU); ctx.fillStyle = '#7fe3d8'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, yr - ry * 0.2, rx * 0.34, ry * 0.34, 0, 0, TAU); ctx.fillStyle = '#f4f6fa'; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
  if (on) glow(ctx, [x, (y0 + y1) / 2 + 6], 24, '#ffe08a', 0.14);
  column(gz + 1.2, zc);
  // crown with a beacon
  tower(ctx, 0, 0, zc, zc + 0.2, 0.2, 0.26, BLUE, '#8fc4f0', 3);
  cone(ctx, 0, 0, zc + 0.2, zc + 0.72, 0.2, '#ef476f');
  const b = pt(0, 0, zc + 0.78);
  if (on) glow(ctx, b, 8, '#fff0a0', 0.3);
  dot(ctx, b, 2.2, on ? '#fff6c8' : '#ffd23f'); ring(ctx, b, 2.2, INK, 0.8);
  mastFlag(ctx, 0, 0, zc + 0.8, 0.4, '#2ec4b6', 2);
}

function octopus(ctx, o) {
  const a = o.anim || 0, s = o.spin || 0, rot = a * 0.8, nr = count(o);
  slab(ctx, o);
  cyl(ctx, 0, 0, 0.18, 0.3, 1.34, '#2a6ea8', '#c4e6f8');
  ell(ctx, 0, 0, 0.3, 1.2, '#aedcf5');
  ell(ctx, 0, 0, 0.3, 0.8, null, 'rgba(255,255,255,0.8)');
  rimBulbs(ctx, 0, 0, 0.25, 1.34, 11);
  const R = 1.04, BODY = '#9b5de5';
  const arms = [];
  for (let k = 0; k < 8; k++) {
    const an = rot + (k * TAU) / 8, cu = Math.cos(an), sv = Math.sin(an), lift = 0.42 + s * (0.72 + 0.62 * Math.sin(a * 2.3 + k * 2.2));
    arms.push({
      cu, sv, k, lift, near: cu + sv >= 0, lit: cu - sv < 0,
      A: pt(cu * 0.2, sv * 0.2, 1.95), B: pt(cu * R, sv * R, lift + 0.62), C: pt(cu * 0.72, sv * 0.72, 2.25 + lift * 0.5),
    });
  }
  arms.sort((p, q) => p.cu + p.sv - q.cu - q.sv);
  // shadows of the hub and the cars on the deck
  ctx.beginPath();
  ctx.ellipse(X(0.05, -0.05), Y(0.05, -0.05, 0.3), 0.42 * RX, 0.42 * RY, 0, 0, TAU);
  for (const m of arms) { const x = X(m.cu * R + 0.03, m.sv * R - 0.03), y = Y(m.cu * R + 0.03, m.sv * R - 0.03, 0.31); ctx.moveTo(x + 0.2 * RX, y); ctx.ellipse(x, y, 0.2 * RX, 0.2 * RY, 0, 0, TAU); }
  ctx.fillStyle = SHADE; ctx.fill();
  // an arm is a tapering strip from the hub out to its car, with a pale line along the top
  const limb = (m) => {
    const A = m.A, B = m.B, C = m.C, dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    ctx.beginPath();
    ctx.moveTo(A[0] + nx * 3.4, A[1] + ny * 3.4); ctx.quadraticCurveTo(C[0] + nx * 2.8, C[1] + ny * 2.8, B[0] + nx * 1.7, B[1] + ny * 1.7);
    ctx.lineTo(B[0] - nx * 1.7, B[1] - ny * 1.7); ctx.quadraticCurveTo(C[0] - nx * 2.8, C[1] - ny * 2.8, A[0] - nx * 3.4, A[1] - ny * 3.4);
    ctx.closePath();
    ctx.fillStyle = m.lit ? LIMB_LIT : LIMB_DIM; ctx.fill();
    ctx.strokeStyle = INK2; ctx.lineWidth = 1; ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(A[0], A[1] - 1.4); ctx.quadraticCurveTo(C[0], C[1] - 1.4, B[0], B[1] - 0.8);
    ctx.strokeStyle = '#c9a8f5'; ctx.lineWidth = 1.2; ctx.stroke();
  };
  const car = (m) => {
    const u = m.cu * R, v = m.sv * R, col = TOY[m.k % 6];
    tower(ctx, u, v, m.lift, m.lift + 0.34, 0.13, 0.19, [col], tint(col, -0.3), 3);
    const n = Math.min(2, Math.max(0, nr - m.k * 2)), sp = a * 2.4 + m.k;
    for (let j = 0; j < n; j++) head(ctx, pt(u + Math.cos(sp + j * PI) * 0.08, v + Math.sin(sp + j * PI) * 0.08, m.lift + 0.56), m.k + j, 2.5);
  };
  for (const m of arms) if (!m.near) { car(m); limb(m); }
  // the hub is the octopus itself
  tower(ctx, 0, 0, 0.3, 1.9, 0.34, 0.24, PLUM2, null, 12, rot + 0.3);
  cyl(ctx, 0, 0, 0.3, 0.44, 0.38, '#ffd23f', null);
  // the near arms come out from under the head
  for (const m of arms) if (m.near) limb(m);
  const hc = pt(0, 0, 2.5), hx = hc[0], hy = hc[1];
  ctx.fillStyle = tint(BODY, -0.14); ctx.beginPath(); ctx.ellipse(hx, hy, 14.5, 13, 0, 0, 6.3); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = BODY; ctx.beginPath(); ctx.ellipse(hx - 1.2, hy - 1.2, 12.6, 11.2, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#c3a3f5'; ctx.beginPath(); ctx.ellipse(hx - 5, hy - 6.4, 4.6, 3, -0.5, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#b48af0'; ctx.beginPath();
  ctx.arc(hx + 6.5, hy - 6, 1.6, 0, 6.3); ctx.moveTo(hx + 10.6, hy - 1); ctx.arc(hx + 9.4, hy - 1, 1.2, 0, 6.3); ctx.moveTo(hx + 3.5, hy - 9.4); ctx.arc(hx + 2.4, hy - 9.4, 1.1, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx - 4.6, hy + 2.6, 3.5, 0, 6.3); ctx.moveTo(hx + 8.1, hy + 2.6); ctx.arc(hx + 4.6, hy + 2.6, 3.5, 0, 6.3); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  const look = 0.7 * Math.sin(a * 0.9);
  ctx.fillStyle = '#2b2d42'; ctx.beginPath(); ctx.arc(hx - 4.6 + look, hy + 3.4, 1.7, 0, 6.3); ctx.moveTo(hx + 6.3 + look, hy + 3.4); ctx.arc(hx + 4.6 + look, hy + 3.4, 1.7, 0, 6.3); ctx.fill();
  ctx.strokeStyle = '#4a2a80'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(hx, hy + 6.2, 3.2, 0.25, PI - 0.25); ctx.stroke();
  for (const m of arms) if (m.near) car(m);
}

function tumbler(ctx, o) {
  const nr = count(o);
  slab(ctx, o);
  const ax = o.w >= o.h ? 1 : 0, ay = 1 - ax;
  const P = (p, q, z) => pt(ax * p + ay * q, ay * p + ax * q, z); // p along the axle, q towards the viewer
  const bx = (p0, q0, p1, q1, z0, z1, c0, c1, c2) => (ax ? box(ctx, p0, q0, p1, q1, z0, z1, c0, c1, c2) : box(ctx, q0, p0, q1, p1, z0, z1, c0, c1, c2));
  const piv = 3.2, L = 2.15;
  let th = 0;
  if (o.st === 'run') {
    const tau = o.runT || 0, x = Math.min(1, tau / RIDES.tumbler.dur);
    th = TAU * 4 * smooth(x) + 0.9 * Math.sin(x * PI) * Math.sin(tau * 2.3);
  }
  const c = Math.cos(th), sn = Math.sin(th);
  // a point on the turning part: p along the axle, r out from it, tn across (both in levels)
  const G = (p, r, tn = 0) => P(p, (sn * r + c * tn) / K, piv - c * r + sn * tn);
  const support = (p, k) => {
    const top = P(p, 0, piv);
    beam(ctx, P(p, -0.74, 0.18), top, '#d63a5f', 4.2);
    beam(ctx, P(p, 0.74, 0.18), top, '#ef476f', 4.2);
    beam(ctx, P(p, -0.36, 1.66), P(p, 0.36, 1.66), '#ef476f', 2.2);
    dot(ctx, P(p, -0.74, 0.18), 2.8, '#ffd23f'); dot(ctx, P(p, 0.74, 0.18), 2.8, '#ffd23f');
    for (let j = 0; j < 4; j++) bulb(ctx, P(p, 0.74 - (j + 0.6) * 0.15, 0.18 + (j + 0.6) * 0.616), j + k * 2);
    lamps(ctx);
    dot(ctx, top, 5, '#ffd23f'); ring(ctx, top, 5, INK, 1); dot(ctx, top, 2, '#ef476f');
    mastFlag(ctx, ax * p, ay * p, piv + 0.3, 0.4, k ? '#ffd23f' : '#06d6a0', k * 2);
  };
  const arm = (p) => {
    beam(ctx, G(p, -1.0), G(p, L), '#f4f6fa', 3.2);
    const w = G(p, -1.0);
    dot(ctx, w, 4.6, '#4b5464'); ring(ctx, w, 4.6, INK, 1);
  };
  const turning = () => {
    const front = c + sn > 0, W = 1.04;
    const back = () => {
      poly(ctx, [G(-W, L - 0.95), G(W, L - 0.95), G(W, L + 0.06), G(-W, L + 0.06)], front ? '#3b8ed0' : '#2a6ea8', INK);
      ctx.beginPath();
      for (let k = 1; k < 7; k++) { const p = -W + (k * 2 * W) / 7, g0 = G(p, L - 0.95), g1 = G(p, L + 0.06); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); }
      ctx.strokeStyle = 'rgba(20,16,50,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      poly(ctx, [G(-W, L - 0.95), G(W, L - 0.95), G(W, L - 0.8), G(-W, L - 0.8)], '#ffd23f');
    };
    const seats = () => {
      poly(ctx, [G(-1.2, L, 0), G(1.2, L, 0), G(1.2, L, 0.46), G(-1.2, L, 0.46)], '#34496b', INK);
      const n = Math.min(7, Math.ceil(nr / 2));
      for (let k = 0; k < 7; k++) {
        const p = -W + ((k + 0.5) * 2 * W) / 7;
        if (k < n) {
          line(ctx, G(p, L - 0.08, 0.24), G(p, L - 0.5, 0.24), TOY[(k * 5 + 2) % 6], 4.4);
          head(ctx, G(p, L - 0.7, 0.24), k, 2.5);
        }
      }
      // lap bars
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const p = -W + ((k + 0.5) * 2 * W) / 7, g0 = G(p, L - 0.62, 0.3), g1 = G(p, L - 0.1, 0.44);
        ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]);
      }
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.2; ctx.stroke();
    };
    arm(-1.2);
    if (front) { back(); seats(); } else { seats(); back(); }
    arm(1.2);
  };
  bx(-0.98, -0.42, 0.98, 0.42, 0.18, 0.46, '#8a99b0', '#5b6577', '#4b5464');
  bx(-0.9, -0.34, 0.9, 0.34, 0.46, 0.5, '#ffd23f', '#d9a900', '#c29700');
  bx(-0.3, 0.42, 0.3, 0.56, 0.18, 0.32, '#8a99b0', '#5b6577', '#4b5464');
  support(-1.3, 0);
  if (sn < 0) { turning(); support(1.3, 1); } else { support(1.3, 1); turning(); }
}

function slingshot(ctx, o) {
  const nr = count(o), on = night > 0.3;
  slab(ctx, o);
  const ax = o.w >= o.h ? 1 : 0, ay = 1 - ax;
  const P = (p, q, z) => pt(ax * p + ay * q, ay * p + ax * q, z);
  const bx = (p0, q0, p1, q1, z0, z1, c0, c1, c2) => (ax ? box(ctx, p0, q0, p1, q1, z0, z1, c0, c1, c2) : box(ctx, q0, p0, q1, p1, z0, z1, c0, c1, c2));
  let h = 0, shake = 0, roll = 0;
  if (o.st === 'run') {
    const tau = ((o.runT || 0) * 9) / RIDES.slingshot.dur;
    if (tau < 1) shake = Math.sin(tau * 45) * 0.04 * tau;
    else {
      const x = tau - 1, k = 1 - smooth((x - 5) / 3);
      h = k * 6.4 * (1 - Math.exp(-0.5 * x) * Math.cos(2.5 * x));
      roll = k * (x * 3.2 + Math.sin(x * 2.5));
    }
  }
  const zTop = 9.9, cz = 0.98 + h + shake;
  const mast = (sg, k) => {
    const foot = P(sg * 1.14, 0, 0.18), top = P(sg * 1.42, 0, zTop);
    beam(ctx, P(sg * 1.44, 0, 0.18), P(sg * 1.25, 0, 3.6), '#c9d1de', 2);
    beam(ctx, foot, top, '#f4f6fa', 4.4);
    ctx.setLineDash([9, 13]); ctx.lineCap = 'butt';
    ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'round';
    line(ctx, [foot[0] - 1.2, foot[1]], [top[0] - 1.2, top[1]], 'rgba(255,255,255,0.5)', 1);
    dot(ctx, foot, 3, '#4b5464'); dot(ctx, P(sg * 1.44, 0, 0.18), 2.4, '#4b5464');
    for (let j = 1; j < 5; j++) { const f = j / 5; bulb(ctx, P(sg * (1.14 + 0.28 * f), 0.04, 0.18 + (zTop - 0.18) * f), j + k * 2); }
    lamps(ctx);
    if (on) glow(ctx, top, 9, '#ff6b6b', 0.3);
    dot(ctx, top, 3.4, on ? '#ffb0a0' : '#ffd23f'); ring(ctx, top, 3.4, INK, 1);
    mastFlag(ctx, ax * sg * 1.42, ay * sg * 1.42, zTop + 0.1, 0.36, k ? '#3b8ed0' : '#ef476f', k * 2);
  };
  const cp = P(0, 0, cz);
  const rope = (sg) => {
    const top = P(sg * 1.42, 0, zTop), end = [cp[0] + (top[0] - cp[0] > 0 ? 7 : -7), cp[1]];
    line(ctx, top, end, 'rgba(40,28,64,0.5)', 2.6);
    line(ctx, top, end, '#fff4dc', 1.4);
  };
  mast(-1, 0);
  // launch pad
  bx(-0.5, -0.38, 0.5, 0.38, 0.18, 0.4, '#8a99b0', '#5b6577', '#4b5464');
  bx(-0.4, -0.3, 0.4, 0.3, 0.4, 0.44, '#ffd23f', '#d9a900', '#c29700');
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const p0 = -0.4 + k * 0.2;
    quad(ctx, P(p0, -0.3, 0.44), P(p0 + 0.1, -0.3, 0.44), P(p0 + 0.1, 0.3, 0.44), P(p0, 0.3, 0.44));
  }
  ctx.fillStyle = '#2b2d42'; ctx.fill();
  bx(-0.16, 0.38, 0.16, 0.47, 0.18, 0.3, '#8a99b0', '#5b6577', '#4b5464');
  if (h > 0.2) ell(ctx, 0, 0, 0.45, Math.max(0.1, 0.24 - h * 0.012), 'rgba(20,16,50,0.2)');
  rope(-1);
  // the capsule: a cage with two seats
  const x = cp[0], y = cp[1];
  ctx.globalAlpha *= 0.5; dot(ctx, cp, 9.4, on ? '#ffe9a0' : '#cfeafb'); ctx.globalAlpha /= 0.5;
  ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.roundRect(x - 7, y - 1, 14, 7, 2.4); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  if (nr > 0) rider(ctx, [x - 3.3, y + 2.4], 0);
  if (nr > 1) rider(ctx, [x + 3.3, y + 2.4], 1);
  ring(ctx, cp, 9.4, INK2, 3); ring(ctx, cp, 9.4, '#ffd23f', 1.6);
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.6, Math.abs(Math.cos(roll)) * 9.4), 9.4, 0, 0, TAU); ctx.stroke();
  rope(1);
  mast(1, 1);
}

const LIMB_LIT = '#a36ae8', LIMB_DIM = '#8a50d0';
const RIDE_DRAW = {
  carousel, teacups, castle, ferris, swing, pirate, bumper, haunted, drop, slide, maze, tower: lookout, octopus, tumbler, slingshot,
};
export function drawRide(ctx, o, t) {
  T = t || 0;
  const f = RIDE_DRAW[o.type];
  if (f) f(ctx, o, T);
  lamps(ctx);
}

// ---------- stalls ----------
const STALL_COL = {
  burger: '#e8553f', drinks: '#3b8ed0', icecream: '#ff70a6', toilet: '#6c7a92', gift: '#9b5de5', candy: '#2ec4b6', coffee: '#8a5a3c', hats: '#3aa85f',
};
export function drawStall(ctx, o, t) {
  T = t || 0;
  const col = STALL_COL[o.type] || '#e8553f', on = night > 0.3, wc = o.type === 'toilet';
  ell(ctx, 0.07, -0.07, 0.01, 0.62, SHADE);
  box(ctx, -0.4, -0.4, 0.4, 0.4, 0, 1.26, '#fff6e6', '#fbf0dc', '#dfd2be');
  wallL(ctx, -0.4, 0.4, 0.4, 0, 0.3, tint(col, 0.12)); wallR(ctx, 0.4, -0.4, 0.4, 0, 0.3, tint(col, -0.2));
  if (!wc) {
    // serving windows with a counter; someone is behind the left one
    wallL(ctx, -0.29, 0.29, 0.4, 0.5, 1.02, on ? '#ffdf8a' : '#4a3f55', INK);
    wallR(ctx, 0.4, -0.29, 0.29, 0.5, 1.02, on ? '#f2c860' : '#3a3145', INK);
    const p = pt(-0.04, 0.4, 0.5);
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(p[0] - 3.2, p[1] - 6, 6.4, 6.6, [2.4, 2.4, 0, 0]); ctx.fill();
    head(ctx, [p[0], p[1] - 8], (o.x || 0) + o.type.length, 2.7);
    for (let k = 0; k < 3; k++) dot(ctx, pt(0.4, -0.16 + k * 0.16, 0.62), 1.9, [col, '#ffd23f', '#fff4dc'][k]);
    wallL(ctx, -0.33, 0.33, 0.47, 0.44, 0.5, '#efe3cd'); wallR(ctx, 0.47, -0.33, 0.33, 0.44, 0.5, '#d9ccb6');
    flat(ctx, -0.33, 0.4, 0.33, 0.47, 0.5, '#ffffff', INK); flat(ctx, 0.4, -0.33, 0.47, 0.33, 0.5, '#ffffff', INK);
    if (on) { glow(ctx, pt(0, 0.42, 0.74), 12, '#ffd76a', 0.16); glow(ctx, pt(0.42, 0, 0.74), 12, '#ffd76a', 0.14); }
  } else {
    wallL(ctx, -0.17, 0.17, 0.4, 0, 0.98, '#3b8ed0', INK);
    wallR(ctx, 0.4, -0.17, 0.17, 0, 0.98, '#d6507a', INK);
    wallL(ctx, -0.11, 0.11, 0.4, 0.56, 0.86, on ? '#ffe9a0' : '#bfe0f7');
    wallR(ctx, 0.4, -0.11, 0.11, 0.56, 0.86, on ? '#ffe9a0' : '#f3b6c9');
    dot(ctx, pt(0.11, 0.4, 0.44), 1.1, '#ffd23f'); dot(ctx, pt(0.4, 0.11, 0.44), 1.1, '#ffd23f');
  }
  // striped awning roof
  const E = 0.5, R = 0.22, zE = 1.3, zR = 1.6, zV = 1.19, n = 6, f = R / E;
  poly(ctx, [pt(-E, -E, zE), pt(E, -E, zE), pt(R, -R, zR), pt(-R, -R, zR)], tint(col, -0.3));
  poly(ctx, [pt(-E, -E, zE), pt(-E, E, zE), pt(-R, R, zR), pt(-R, -R, zR)], tint(col, -0.2));
  const lite = '#fffaf0', lite2 = '#e9e0d2', colL = tint(col, 0.08), colR = tint(col, -0.2), sw = (2 * E) / n;
  // both slopes and the frill under the eaves in the stall colour, then the pale stripes over them
  poly(ctx, [pt(-E, E, zV), pt(E, E, zV), pt(E, E, zE), pt(R, R, zR), pt(-R, R, zR), pt(-E, E, zE)], colL);
  poly(ctx, [pt(E, -E, zV), pt(E, E, zV), pt(E, E, zE), pt(R, R, zR), pt(R, -R, zR), pt(E, -E, zE)], colR);
  for (let side = 0; side < 2; side++) {
    const Q = side ? (m, z, k) => pt(k ? R : E, k ? m * f : m, z) : (m, z, k) => pt(k ? m * f : m, k ? R : E, z);
    for (let pale = 0; pale < 2; pale++) {
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const a0 = -E + k * sw, a1 = a0 + sw, m = Q(a0 + sw / 2, zV, 0);
        if ((k % 2 === 1) === (pale === 1)) { ctx.moveTo(m[0] + 2.3, m[1]); ctx.arc(m[0], m[1], 2.3, 0, 6.3); }
        if (pale && k % 2 === 0) ctx.moveTo(m[0], m[1]);
        if (pale && k % 2) { quad(ctx, Q(a0, zE, 0), Q(a1, zE, 0), Q(a1, zR, 1), Q(a0, zR, 1)); quad(ctx, Q(a0, zV, 0), Q(a1, zV, 0), Q(a1, zE, 0), Q(a0, zE, 0)); }
      }
      ctx.fillStyle = pale ? (side ? lite2 : lite) : (side ? colR : colL); ctx.fill();
    }
  }
  ctx.beginPath();
  quad(ctx, pt(-E, E, zE), pt(E, E, zE), pt(R, R, zR), pt(-R, R, zR));
  quad(ctx, pt(E, -E, zE), pt(E, E, zE), pt(R, R, zR), pt(R, -R, zR));
  ctx.moveTo(X(-E, E), Y(-E, E, zV)); ctx.lineTo(X(E, E), Y(E, E, zV)); ctx.lineTo(X(E, -E), Y(E, -E, zV));
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
  flat(ctx, -R, -R, R, R, zR, tint(col, 0.3), INK);
  bulb(ctx, pt(-E, E, zE), 0); bulb(ctx, pt(E, E, zE), 1); bulb(ctx, pt(E, -E, zE), 2);
  lamps(ctx);
  // sign on the roof
  const p = pt(0, 0, zR), x = p[0], y = p[1] - 11.5 + Math.sin(T * 2 + (o.x || 0)) * 1;
  line(ctx, [x, p[1]], [x, y + 6], '#6b6f80', 1.6);
  if (on) glow(ctx, [x, y], 15, '#fff0b8', 0.16);
  ctx.lineWidth = 1; ctx.strokeStyle = INK;
  if (o.type === 'burger') {
    ctx.fillStyle = '#e9a13b'; ctx.beginPath(); ctx.ellipse(x, y - 3, 9, 6.4, 0, PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6c56b'; ctx.beginPath(); ctx.ellipse(x - 2.5, y - 6, 4, 1.8, -0.3, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#fff4dc'; ctx.fillRect(x + 1, y - 7, 1.2, 1); ctx.fillRect(x + 4, y - 5.4, 1.2, 1); ctx.fillRect(x - 5, y - 4.6, 1.2, 1);
    ctx.fillStyle = '#6fbf4a'; ctx.beginPath(); ctx.roundRect(x - 10, y - 3, 20, 2.4, 1.2); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 9, y - 1, 18, 1.4);
    ctx.fillStyle = '#7a4a2b'; ctx.beginPath(); ctx.roundRect(x - 9.4, y + 0.2, 18.8, 3, 1.4); ctx.fill();
    ctx.fillStyle = '#e9a13b'; ctx.beginPath(); ctx.roundRect(x - 9, y + 3, 18, 4, [0, 0, 3, 3]); ctx.fill(); ctx.stroke();
  } else if (o.type === 'drinks') {
    line(ctx, [x + 1, y - 7], [x + 4.4, y - 14.5], '#ffd23f', 2);
    poly(ctx, [[x - 6, y - 7], [x + 6, y - 7], [x + 4.2, y + 7.4], [x - 4.2, y + 7.4]], '#ef476f', INK);
    poly(ctx, [[x - 5.6, y - 3.6], [x + 5.6, y - 3.6], [x + 5.1, y + 0.4], [x - 5.1, y + 0.4]], '#ffffff');
    poly(ctx, [[x - 6, y - 7], [x - 4, y - 7], [x - 2.9, y + 7.4], [x - 4.2, y + 7.4]], 'rgba(255,255,255,0.35)');
    ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.roundRect(x - 6.8, y - 8.6, 13.6, 2.4, 1.2); ctx.fill(); ctx.stroke();
  } else if (o.type === 'icecream') {
    poly(ctx, [[x - 5, y - 1], [x + 5, y - 1], [x, y + 9.4]], '#e9b872', INK);
    line(ctx, [x - 2.4, y + 1], [x + 1.2, y + 5.6], 'rgba(120,80,30,0.45)', 0.8); line(ctx, [x + 2.4, y + 1], [x - 1.2, y + 5.6], 'rgba(120,80,30,0.45)', 0.8);
    dot(ctx, [x - 2.6, y - 4], 4.5, '#ff8fab'); dot(ctx, [x + 2.6, y - 4], 4.5, '#fff4dc'); dot(ctx, [x, y - 8.2], 4.3, '#8ed1fc');
    dot(ctx, [x - 1.2, y - 9.6], 1.5, '#d3eeff'); dot(ctx, [x - 3.8, y - 5.2], 1.4, '#ffc0d0');
    dot(ctx, [x + 1.4, y - 12.6], 1.7, '#ef476f');
  } else if (o.type === 'toilet') {
    ctx.fillStyle = '#3b8ed0'; ctx.beginPath(); ctx.roundRect(x - 10.5, y - 6.5, 21, 13.5, 3.4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.roundRect(x - 8.8, y - 4.8, 17.6, 10.1, 2.2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 9px ui-rounded, "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WC', x, y + 0.8);
  } else if (o.type === 'candy') {
    line(ctx, [x + 0.6, y + 9], [x, y - 2], '#f3e3c2', 2);
    dot(ctx, [x - 4, y - 2.6], 4.8, '#f277b8'); dot(ctx, [x + 4, y - 3], 5, '#f277b8'); dot(ctx, [x, y - 8], 5.4, '#f277b8'); dot(ctx, [x + 0.4, y - 1.2], 4.4, '#f277b8');
    dot(ctx, [x - 3.6, y - 4.2], 3.6, '#ffa9d6'); dot(ctx, [x + 2.8, y - 5], 3.6, '#ffa9d6'); dot(ctx, [x - 0.8, y - 9], 3.8, '#ffbfe1');
    dot(ctx, [x - 2, y - 10.4], 1.5, '#ffe3f2');
  } else if (o.type === 'coffee') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let j = 0; j < 2; j++) {
      const ph = (T * 0.8 + j * 0.5) % 1, sx = x - 2.4 + j * 4.8, sy = y - 5.5 - ph * 4;
      ctx.globalAlpha *= 1 - ph * 0.7;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 2.4, sy - 2.6, sx, sy - 5); ctx.quadraticCurveTo(sx - 2, sy - 7, sx + 0.6, sy - 9); ctx.stroke();
      ctx.globalAlpha /= 1 - ph * 0.7;
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, y + 7, 9.6, 2.7, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    ring(ctx, [x + 6.8, y + 1.4], 3, INK2, 3.2); ring(ctx, [x + 6.8, y + 1.4], 3, '#fff6e6', 1.8);
    poly(ctx, [[x - 6.6, y - 3.4], [x + 6.6, y - 3.4], [x + 5, y + 6.6], [x - 5, y + 6.6]], '#fff6e6', INK);
    poly(ctx, [[x - 6.1, y - 0.2], [x + 6.1, y - 0.2], [x + 5.6, y + 2.6], [x - 5.6, y + 2.6]], '#c9834a');
    ctx.fillStyle = '#6b3f22'; ctx.beginPath(); ctx.ellipse(x, y - 3.4, 6.6, 2, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  } else if (o.type === 'hats') {
    ctx.fillStyle = '#7740c0'; ctx.beginPath(); ctx.ellipse(x, y + 5, 10.6, 3.4, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    poly(ctx, [[x - 5.6, y + 4.6], [x - 6.4, y - 7.4], [x + 6.4, y - 7.4], [x + 5.6, y + 4.6]], '#9b5de5', INK);
    poly(ctx, [[x - 5.6, y + 4.6], [x - 6.4, y - 7.4], [x - 3.6, y - 7.4], [x - 3.2, y + 4.6]], '#b48af0');
    poly(ctx, [[x - 5.9, y - 0.4], [x + 5.9, y - 0.4], [x + 5.7, y + 2.8], [x - 5.7, y + 2.8]], '#ffd23f');
    ctx.fillStyle = '#c3a3f5'; ctx.beginPath(); ctx.ellipse(x, y - 7.4, 6.4, 2, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 4.4, y + 0.4); ctx.quadraticCurveTo(x + 10.5, y - 3, x + 8.4, y - 11.4); ctx.stroke();
  } else {
    line(ctx, [x + 5, y - 3], [x + 9, y - 13.4], 'rgba(60,60,60,0.6)', 0.7);
    ctx.fillStyle = '#06d6a0'; ctx.beginPath(); ctx.ellipse(x + 9.5, y - 17.6, 4, 5, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    dot(ctx, [x + 8.2, y - 19.2], 1.2, '#b5f5e2');
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.roundRect(x - 7.4, y - 3, 14.8, 10.4, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe58a'; ctx.fillRect(x - 6.6, y - 2.2, 4.4, 2.4);
    ctx.fillStyle = '#ef476f'; ctx.fillRect(x - 1.6, y - 3, 3.2, 10.4); ctx.fillRect(x - 7.4, y + 0.6, 14.8, 2.6);
    ring(ctx, [x - 2.4, y - 4.6], 2.2, '#ef476f', 1.6); ring(ctx, [x + 2.4, y - 4.6], 2.2, '#ef476f', 1.6);
  }
}

// ---------- scenery (cx, cy = centre of the tile on screen) ----------
// Drawn for every tile that has some, so these stay cheap: plain fills and strokes only.
// The little helpers work in pixels from the tile centre, which drawScenery puts in ox, oy.
function sh(ctx, r, dx = 2) { ctx.fillStyle = SHADE; ctx.beginPath(); ctx.ellipse(ox + dx, oy, r, r / 2, 0, 0, 6.3); ctx.fill(); }
function blob(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ox + x, oy + y, r, 0, 6.3); ctx.fill(); }
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); }
function tri(ctx, x0, y0, x1, y1, x2, y2, c) {
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.moveTo(ox + x0, oy + y0); ctx.lineTo(ox + x1, oy + y1); ctx.lineTo(ox + x2, oy + y2); ctx.closePath(); ctx.fill();
}
function pill(ctx, s, x, y, w, h, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(ox + x * s, oy + y * s, w * s, h * s, r * s); ctx.fill(); }
function frond(ctx, tx, ty, an, len, col) {
  const dx = Math.cos(an), dy = Math.sin(an), ex = tx + dx * len, ey = ty + dy * len * 0.35 + len * 0.5;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(tx, ty - 1);
  ctx.quadraticCurveTo(tx + dx * len * 0.62, ty - 10 + dy * 3, ex, ey);
  ctx.quadraticCurveTo(tx + dx * len * 0.5, ty - 1 + dy * 4, tx, ty + 1.6);
  ctx.fill();
}
// the tuft at the foot of a rock takes the colour of the map's own tufts: grass, dry grass or snow
let tuftCol = '#3d9a47';
export function setTuft(col) { tuftCol = col || '#3d9a47'; }
function snowBall(ctx, y, r) { blob(ctx, 0, y, r, '#cfdcec'); ctx.stroke(); blob(ctx, -r * 0.13, y - r * 0.13, r * 0.84, '#ffffff'); }
const FIR = ['#23804f', '#2a8f5a', '#33a066'], FIR_DARK = ['#1a663e', '#207347', '#278252'];
const FIR_SNOW = ['#1f6f5c', '#27806a', '#2f9179'], FIR_SNOW_DARK = ['#175646', '#1d6453', '#24735f'];
const PETALS = ['#ef476f', '#ffd23f', '#ffffff', '#ff70a6', '#9b5de5'];
const PARASOL = [['#ef476f', '#fff4dc'], ['#3b8ed0', '#fff4dc'], ['#ffd23f', '#f78c1f']];
export function drawScenery(ctx, code, cx, cy, t, hsh) {
  const def = SCENERY[code];
  if (!def) return;
  const id = def.id, on = night > 0.3;
  t = t || 0; hsh = hsh || 0;
  T = t;
  const sox = ox, soy = oy;
  ox = cx; oy = cy;
  const sway = Math.sin(t * 1.3 + hsh * 20) * 1.1;
  ctx.lineWidth = 1; ctx.strokeStyle = INK;
  switch (id) {
    case 'oak': {
      const s = 0.85 + hsh * 0.3, w = sway * 0.5;
      sh(ctx, 14 * s, 3);
      rect(ctx, -2.7, -16 * s, 5.4, 16 * s + 1, '#8a5a35'); rect(ctx, 0.5, -16 * s, 2.2, 16 * s + 1, '#6b4226');
      blob(ctx, -6 * s + w, -15.5 * s, 9 * s, '#1f7a3c'); blob(ctx, 6.5 * s + w, -15 * s, 9.4 * s, '#1f7a3c');
      blob(ctx, -7.5 * s + w, -21.5 * s, 9.6 * s, '#2f9e4f'); blob(ctx, 7 * s + w, -21 * s, 9.8 * s, '#289047'); blob(ctx, w, -29 * s, 11 * s, '#3bb35a');
      blob(ctx, -3.5 * s + w, -31.5 * s, 6.4 * s, '#5ccb74'); blob(ctx, -9 * s + w, -24 * s, 3.6 * s, '#4fc069');
      if (hsh > 0.78) {
        blob(ctx, 4 * s + w, -24 * s, 1.7, '#ef476f'); blob(ctx, -5 * s + w, -19 * s, 1.7, '#ef476f'); blob(ctx, 8 * s + w, -17 * s, 1.6, '#ef476f'); blob(ctx, -1 * s + w, -33 * s, 1.5, '#ef476f');
      }
      break;
    }
    case 'pine': case 'snowpine': {
      const s = 0.85 + hsh * 0.35, snow = id === 'snowpine';
      sh(ctx, 10.5 * s, 2);
      rect(ctx, -2.1, -8 * s, 4.2, 8 * s + 1, '#7a5230'); rect(ctx, 0.4, -8 * s, 1.7, 8 * s + 1, '#5f3d22');
      const G = snow ? FIR_SNOW : FIR, D = snow ? FIR_SNOW_DARK : FIR_DARK;
      for (let k = 0; k < 3; k++) {
        const y = -(5 + k * 10.5) * s, w = (13.5 - k * 3.2) * s, tx = sway * 0.22 * (k + 1), ty = y - 17 * s;
        tri(ctx, -w, y, w, y, tx, ty, G[k]);
        tri(ctx, w * 0.12, y, w, y, tx, ty, D[k]);
        if (snow) {
          const hh = 17 * s;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(cx + tx, cy + ty - 0.6);
          ctx.lineTo(cx + tx + w * 0.56, cy + ty + hh * 0.56); ctx.lineTo(cx + tx + w * 0.24, cy + ty + hh * 0.44); ctx.lineTo(cx + tx + w * 0.04, cy + ty + hh * 0.62);
          ctx.lineTo(cx + tx - w * 0.22, cy + ty + hh * 0.44); ctx.lineTo(cx + tx - w * 0.56, cy + ty + hh * 0.56);
          ctx.closePath(); ctx.fill();
          tri(ctx, tx + w * 0.08, ty + hh * 0.2, tx + w * 0.56, ty + hh * 0.56, tx + w * 0.24, ty + hh * 0.44, '#d6e3f3');
          blob(ctx, -w * 0.86, y - 1, 1.9 * s, '#ffffff'); blob(ctx, w * 0.8, y - 1, 1.7 * s, '#e3ecf7');
        }
      }
      break;
    }
    case 'palm': {
      sh(ctx, 11, 3);
      const tx = cx + 3 + sway, ty = cy - 35;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8a6438'; ctx.lineWidth = 4.8;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + 6, cy - 18, tx, ty); ctx.stroke();
      ctx.strokeStyle = '#b98d58'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - 1.2, cy - 1); ctx.quadraticCurveTo(cx + 4.6, cy - 18, tx - 1.2, ty); ctx.stroke();
      for (let k = 0; k < 7; k++) { const an = (k / 7) * TAU + 0.5; if (Math.sin(an) < 0) frond(ctx, tx, ty, an, 19, '#1f8245'); }
      for (let k = 0; k < 7; k++) { const an = (k / 7) * TAU + 0.5; if (Math.sin(an) >= 0) frond(ctx, tx, ty, an, 20, k % 2 ? '#2fae5c' : '#3cc06c'); }
      blob(ctx, tx - cx - 2, ty - cy + 2.4, 2.2, '#6b4226'); blob(ctx, tx - cx + 2, ty - cy + 3, 2, '#5a3620');
      break;
    }
    case 'bush':
      sh(ctx, 11.5, 2);
      blob(ctx, -5.5, -4, 7, '#1f7a3c'); blob(ctx, 5.5, -4, 7.2, '#1f7a3c');
      blob(ctx, -4.8, -7, 6.6, '#2f9e4f'); blob(ctx, 5, -6.8, 6.6, '#289047'); blob(ctx, 0, -10.4, 7.6, '#45b965');
      blob(ctx, -2.6, -12.6, 3.8, '#66d182');
      if (hsh > 0.45) { const c = hsh > 0.72 ? '#ffffff' : '#ff9ecf'; blob(ctx, 4, -9, 1.5, c); blob(ctx, -6, -6, 1.5, c); blob(ctx, 0.5, -4.5, 1.4, c); }
      break;
    case 'flowers': {
      ctx.fillStyle = '#4c9a36'; ctx.beginPath(); ctx.ellipse(cx, cy + 0.6, 21, 10.5, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#63b446'; ctx.beginPath(); ctx.ellipse(cx, cy - 0.4, 19, 9.2, 0, 0, 6.3); ctx.fill();
      for (let k = 0; k < 10; k++) {
        const an = k * 2.4 + hsh * 6, r = 3 + (k % 3) * 5.2;
        blob(ctx, Math.cos(an) * r * 1.2, Math.sin(an) * r * 0.58 - 2.4, 2.6, PETALS[(k + ((hsh * 5) | 0)) % 5]);
      }
      ctx.fillStyle = '#f9b233'; ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const an = k * 2.4 + hsh * 6, r = 3 + (k % 3) * 5.2, x = cx + Math.cos(an) * r * 1.2, y = cy + Math.sin(an) * r * 0.58 - 2.4;
        ctx.moveTo(x + 1, y); ctx.arc(x, y, 1, 0, 6.3);
      }
      ctx.fill();
      break;
    }
    case 'bench': {
      sh(ctx, 13, 2);
      const W1 = '#cf9358', W2 = '#a8713d', W3 = '#8a5a2f', LEG = '#4a4e69';
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(X(-0.28, -0.08), Y(-0.28, -0.08, 0)); ctx.lineTo(X(-0.28, -0.08), Y(-0.28, -0.08, 0.74));
      ctx.moveTo(X(0.28, -0.08), Y(0.28, -0.08, 0)); ctx.lineTo(X(0.28, -0.08), Y(0.28, -0.08, 0.74));
      ctx.moveTo(X(-0.28, 0.13), Y(-0.28, 0.13, 0)); ctx.lineTo(X(-0.28, 0.13), Y(-0.28, 0.13, 0.28));
      ctx.moveTo(X(0.28, 0.13), Y(0.28, 0.13, 0)); ctx.lineTo(X(0.28, 0.13), Y(0.28, 0.13, 0.28));
      ctx.strokeStyle = LEG; ctx.lineWidth = 1.8; ctx.stroke();
      wallL(ctx, -0.33, 0.33, -0.08, 0.44, 0.74, '#b9804a', INK);
      wallL(ctx, -0.33, 0.33, -0.08, 0.55, 0.61, '#7a4f29');
      box(ctx, -0.33, -0.08, 0.33, 0.16, 0.27, 0.33, W1, W2, W3);
      line(ctx, pt(-0.33, 0.04, 0.33), pt(0.33, 0.04, 0.33), 'rgba(90,50,20,0.35)', 0.8);
      break;
    }
    case 'lamp': {
      if (on) { ctx.fillStyle = 'rgba(255,224,130,0.16)'; ctx.beginPath(); ctx.ellipse(cx, cy, 27, 13.5, 0, 0, 6.3); ctx.fill(); }
      sh(ctx, 5, 1);
      ctx.fillStyle = '#2e3148'; ctx.beginPath(); ctx.roundRect(cx - 3.2, cy - 4.4, 6.4, 5.4, 1.4); ctx.fill();
      rect(ctx, -1.4, -28, 2.8, 24, '#3d405b'); rect(ctx, -1.4, -28, 1, 24, '#62668c');
      rect(ctx, -2.6, -29.4, 5.2, 2, '#2e3148');
      ctx.fillStyle = on ? 'rgba(255,226,130,0.26)' : 'rgba(255,236,150,0.2)';
      ctx.beginPath(); ctx.arc(cx, cy - 33, on ? 20 : 10, 0, 6.3); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,238,170,0.4)'; ctx.beginPath(); ctx.arc(cx, cy - 33, 10.5, 0, 6.3); ctx.fill(); }
      ctx.fillStyle = on ? '#fff6c8' : '#ffe680';
      ctx.beginPath(); ctx.moveTo(cx - 3.4, cy - 29.4); ctx.lineTo(cx + 3.4, cy - 29.4); ctx.lineTo(cx + 4.8, cy - 37); ctx.lineTo(cx - 4.8, cy - 37); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      rect(ctx, -0.4, -37, 0.8, 7.6, 'rgba(60,50,80,0.35)');
      tri(ctx, -6, -37, 6, -37, 0, -41.6, '#3d405b');
      blob(ctx, 0, -42.4, 1.3, '#3d405b');
      break;
    }
    case 'fountain': {
      ctx.fillStyle = '#98a0b0';
      ctx.beginPath(); ctx.ellipse(cx, cy + 1.5, 25, 12.5, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillRect(cx - 25, cy - 3.5, 50, 5);
      ctx.fillStyle = '#cfd4de'; ctx.beginPath(); ctx.ellipse(cx, cy - 3.5, 25, 12.5, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3fa9e0'; ctx.beginPath(); ctx.ellipse(cx, cy - 3.5, 21, 10.3, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#74cdf6'; ctx.beginPath(); ctx.ellipse(cx - 2, cy - 4.6, 15, 6.6, 0, 0, 6.3); ctx.fill();
      const rp = (t * 0.6) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - rp)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy - 3.5, 6 + rp * 13, 3 + rp * 6.4, 0, 0, 6.3); ctx.stroke();
      rect(ctx, -2.8, -17, 5.6, 14, '#aab1bf'); rect(ctx, -2.8, -17, 2.2, 14, '#d9dde5');
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#b4bbc8'; ctx.beginPath(); ctx.ellipse(cx, cy - 16, 9.6, 4.4, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cfd4de'; ctx.beginPath(); ctx.ellipse(cx, cy - 17.4, 9.6, 4.4, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#74cdf6'; ctx.beginPath(); ctx.ellipse(cx, cy - 17.4, 7.4, 3.2, 0, 0, 6.3); ctx.fill();
      rect(ctx, -1.3, -24, 2.6, 7, '#c3c9d4');
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * TAU + t * 0.4, dx = Math.cos(an) * 15, dy = Math.sin(an) * 7.4;
        ctx.moveTo(cx, cy - 24); ctx.quadraticCurveTo(cx + dx * 0.55, cy - 33 + dy * 0.4, cx + dx, cy - 4.5 + dy);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 3; k++) {
        const an = k * 2.1 + Math.floor(t * 3) * 1.3;
        ctx.fillRect(cx + Math.cos(an) * 13 - 0.8, cy - 4.5 + Math.sin(an) * 6 - 0.8, 1.6, 1.6);
      }
      blob(ctx, 0, -25, 2, '#e6f7ff');
      break;
    }
    case 'statue': {
      sh(ctx, 12, 3);
      box(ctx, -0.23, -0.23, 0.23, 0.23, 0, 0.16, '#d9dde5', '#b4bbc8', '#98a0b0');
      box(ctx, -0.16, -0.16, 0.16, 0.16, 0.16, 0.86, '#e6e9ef', '#c3c9d4', '#a4acba');
      wallL(ctx, -0.1, 0.1, 0.16, 0.4, 0.62, '#d9a900');
      const by = cy - 13.6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d9a900'; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(cx - 3.4, by - 11); ctx.lineTo(cx - 6.6, by - 6); ctx.stroke();
      ctx.strokeStyle = '#f4c542';
      ctx.beginPath(); ctx.moveTo(cx + 3.4, by - 11.4); ctx.lineTo(cx + 8.6, by - 19.6); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = INK;
      ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.roundRect(cx - 4.4, by - 14.6, 8.8, 15, [3.6, 3.6, 1, 1]); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d9a900'; ctx.beginPath(); ctx.roundRect(cx + 0.8, by - 13.6, 3, 13.4, [1, 2.4, 1, 0]); ctx.fill();
      rect(ctx, -2.6, -13.6 - 12.6, 1.3, 9.6, '#ffe88f');
      ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(cx, by - 18.4, 4.3, 0, 6.3); ctx.fill(); ctx.stroke();
      blob(ctx, -1.3, -13.6 - 19.8, 1.4, '#ffe88f');
      if (on) { ctx.fillStyle = 'rgba(255,240,160,0.3)'; ctx.beginPath(); ctx.arc(cx + 9.2, by - 22, 7, 0, 6.3); ctx.fill(); }
      ctx.fillStyle = '#fff2a8'; ctx.beginPath(); ctx.arc(cx + 9.2, by - 22, 2.8, 0, 6.3); ctx.fill(); ctx.stroke();
      break;
    }
    case 'rock': {
      sh(ctx, 13, 3);
      ctx.fillStyle = '#98a1b0';
      ctx.beginPath(); ctx.moveTo(cx - 13, cy + 1); ctx.lineTo(cx - 8, cy - 9.6); ctx.lineTo(cx - 1, cy - 3); ctx.lineTo(cx + 1, cy + 5.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7b8494';
      ctx.beginPath(); ctx.moveTo(cx - 1, cy - 3); ctx.lineTo(cx + 9.4, cy - 7.4); ctx.lineTo(cx + 13, cy + 0.4); ctx.lineTo(cx + 8, cy + 5); ctx.lineTo(cx + 1, cy + 5.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c6ccd8';
      ctx.beginPath(); ctx.moveTo(cx - 8, cy - 9.6); ctx.lineTo(cx + 3, cy - 13.4); ctx.lineTo(cx + 9.4, cy - 7.4); ctx.lineTo(cx - 1, cy - 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 13, cy + 1); ctx.lineTo(cx - 8, cy - 9.6); ctx.lineTo(cx + 3, cy - 13.4); ctx.lineTo(cx + 9.4, cy - 7.4); ctx.lineTo(cx + 13, cy + 0.4);
      ctx.lineTo(cx + 8, cy + 5); ctx.lineTo(cx + 1, cy + 5.4); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#aab2c0'; ctx.beginPath(); ctx.ellipse(cx - 10.5, cy + 5, 4, 2.6, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d3d8e1'; ctx.beginPath(); ctx.ellipse(cx - 11.2, cy + 4.2, 2.2, 1.2, 0, 0, 6.3); ctx.fill();
      ctx.strokeStyle = tuftCol; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + 12, cy + 5); ctx.lineTo(cx + 11, cy + 1); ctx.moveTo(cx + 12.6, cy + 5); ctx.lineTo(cx + 14, cy + 1.4); ctx.moveTo(cx + 13.4, cy + 5.2); ctx.lineTo(cx + 16, cy + 3); ctx.stroke();
      break;
    }
    case 'hedge': {
      sh(ctx, 21, 4);
      box(ctx, -0.4, -0.4, 0.4, 0.4, 0, 0.74, '#5ccb6e', '#38a554', '#27823f');
      flat(ctx, -0.32, -0.32, 0.1, 0.1, 0.74, '#78d988');
      ctx.fillStyle = '#2b8f45';
      for (let k = 0; k < 4; k++) { const p = pt(-0.3 + k * 0.2, 0.4, 0.2 + ((k * 7) % 3) * 0.16); ctx.fillRect(p[0], p[1], 2.4, 1.4); }
      ctx.fillStyle = '#1f6f35';
      for (let k = 0; k < 4; k++) { const p = pt(0.4, -0.3 + k * 0.2, 0.22 + ((k * 5) % 3) * 0.16); ctx.fillRect(p[0], p[1], 2.4, 1.4); }
      ctx.fillStyle = '#a6eab0';
      for (let k = 0; k < 3; k++) { const p = pt(-0.2 + k * 0.22, 0.24 - k * 0.2, 0.74); ctx.fillRect(p[0], p[1], 2, 1.2); }
      break;
    }
    case 'flag': {
      sh(ctx, 6, 1);
      ctx.fillStyle = '#98a0b0'; ctx.beginPath(); ctx.ellipse(cx, cy - 0.4, 5.6, 2.8, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cfd4de'; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 4.4, 2.2, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      rect(ctx, -1.3, -46, 2.6, 44, '#e6e9ef'); rect(ctx, 0.2, -46, 1.1, 44, '#aab1bf');
      const col = TOY[(hsh * 6) | 0] || TOY[0], w = Math.sin(t * 4.5 + hsh * 20), w2 = Math.sin(t * 4.5 + hsh * 20 + 1.6);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(cx + 1.3, cy - 45.4);
      ctx.bezierCurveTo(cx + 7, cy - 47.5 + w * 2, cx + 13, cy - 42 - w * 2, cx + 21, cy - 39.6 + w2 * 1.6);
      ctx.bezierCurveTo(cx + 13, cy - 36.6 - w * 1.4, cx + 7, cy - 35 + w * 1.6, cx + 1.3, cy - 33);
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.moveTo(cx + 1.3, cy - 41.6);
      ctx.quadraticCurveTo(cx + 8, cy - 41.4 + w * 1.5, cx + 13, cy - 39.6 - w * 0.4);
      ctx.quadraticCurveTo(cx + 8, cy - 38.4 + w * 1.2, cx + 1.3, cy - 37);
      ctx.closePath(); ctx.fill();
      blob(ctx, 0, -47.4, 2.5, '#ffd23f'); ctx.beginPath(); ctx.arc(cx, cy - 47.4, 2.5, 0, 6.3); ctx.stroke();
      break;
    }
    case 'topiary': {
      sh(ctx, 8.5, 2);
      ctx.fillStyle = '#c8693a';
      ctx.beginPath(); ctx.moveTo(cx - 6, cy - 8); ctx.lineTo(cx + 6, cy - 8); ctx.lineTo(cx + 4.4, cy + 1.4); ctx.lineTo(cx - 4.4, cy + 1.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a5502a';
      ctx.beginPath(); ctx.moveTo(cx + 1.6, cy - 8); ctx.lineTo(cx + 6, cy - 8); ctx.lineTo(cx + 4.4, cy + 1.4); ctx.lineTo(cx + 1.2, cy + 1.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e08552'; ctx.beginPath(); ctx.roundRect(cx - 7, cy - 10.4, 14, 3.2, 1.2); ctx.fill(); ctx.stroke();
      rect(ctx, -1, -15, 2, 5, '#7a5230');
      blob(ctx, 0, -19.6, 8.6, '#1f7a3c'); blob(ctx, -1.2, -20.8, 7.2, '#35a352'); blob(ctx, -3.2, -23, 3.3, '#66d182');
      rect(ctx, -0.9, -29.4, 1.8, 3, '#7a5230');
      blob(ctx, 0, -33, 6.3, '#1f7a3c'); blob(ctx, -1, -34, 5.2, '#35a352'); blob(ctx, -2.4, -35.6, 2.4, '#66d182');
      blob(ctx, 0, -42, 3.6, '#278a43'); blob(ctx, -0.8, -42.8, 2.4, '#55c26f');
      break;
    }
    case 'torch': {
      const fl = Math.sin(t * 11 + hsh * 30), fl2 = Math.sin(t * 17 + hsh * 11);
      if (on) { ctx.fillStyle = 'rgba(255,170,70,0.15)'; ctx.beginPath(); ctx.ellipse(cx, cy, 24 + fl, 12 + fl * 0.5, 0, 0, 6.3); ctx.fill(); }
      sh(ctx, 4.4, 1);
      rect(ctx, -1.5, -25, 3, 25.6, '#b07c42'); rect(ctx, 0.3, -25, 1.2, 25.6, '#80562a');
      rect(ctx, -1.9, -10, 3.8, 1.2, '#6b4526'); rect(ctx, -1.9, -18, 3.8, 1.2, '#6b4526');
      ctx.fillStyle = on ? 'rgba(255,170,60,0.28)' : 'rgba(255,180,70,0.16)';
      ctx.beginPath(); ctx.arc(cx, cy - 35, on ? 18 + fl : 9.5, 0, 6.3); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,214,120,0.36)'; ctx.beginPath(); ctx.arc(cx, cy - 35, 9.5, 0, 6.3); ctx.fill(); }
      ctx.fillStyle = '#ff8c1a';
      ctx.beginPath(); ctx.moveTo(cx - 4, cy - 30);
      ctx.quadraticCurveTo(cx - 6 + fl * 0.6, cy - 37, cx + fl * 1.7, cy - 43.6 - fl2);
      ctx.quadraticCurveTo(cx + 6 + fl * 0.6, cy - 36, cx + 4, cy - 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.moveTo(cx - 2.3, cy - 30);
      ctx.quadraticCurveTo(cx - 3 - fl2 * 0.4, cy - 34.4, cx + fl2, cy - 38.6);
      ctx.quadraticCurveTo(cx + 3 - fl2 * 0.4, cy - 34, cx + 2.3, cy - 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a3b33';
      ctx.beginPath(); ctx.moveTo(cx - 4.8, cy - 30.4); ctx.lineTo(cx + 4.8, cy - 30.4); ctx.lineTo(cx + 2.6, cy - 24.4); ctx.lineTo(cx - 2.6, cy - 24.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      rect(ctx, -3.4, -27.6, 6.8, 1.5, '#d9a441');
      break;
    }
    case 'cactus': {
      const s = 0.86 + hsh * 0.3;
      sh(ctx, 8.5 * s, 2);
      const G1 = '#3f9d5a', G2 = '#2c7a44', G3 = '#74c98a';
      pill(ctx, s, -11.6, -23, 5.2, 12, 2.6, G1); pill(ctx, s, -11.6, -15.2, 9, 4.8, 2.2, G1);
      pill(ctx, s, 6.4, -29, 5.2, 13, 2.6, G2); pill(ctx, s, 2.6, -20.6, 9, 4.8, 2.2, G2);
      pill(ctx, s, -4.3, -33, 8.6, 34, 4.3, G1);
      pill(ctx, s, 0.9, -31, 3.4, 31.4, 1.7, G2);
      pill(ctx, s, -3.1, -30.4, 1.4, 27, 0.7, G3); pill(ctx, s, -10.8, -21.6, 1.1, 8, 0.5, G3); pill(ctx, s, 7.2, -27.6, 1.1, 8, 0.5, '#4fae69');
      blob(ctx, -0.4 * s, -33.4 * s, 2.6, '#ff70a6'); blob(ctx, -0.4 * s, -33.4 * s, 1.1, '#ffd23f');
      blob(ctx, 9 * s, -29.4 * s, 1.8, '#ff9ecf');
      break;
    }
    case 'snowman': {
      sh(ctx, 12, 3);
      ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 5, cy - 21); ctx.lineTo(cx - 13.4, cy - 27 + sway * 0.4); ctx.moveTo(cx - 10.6, cy - 25); ctx.lineTo(cx - 12.6, cy - 22.6);
      ctx.moveTo(cx + 5, cy - 21); ctx.lineTo(cx + 13.4, cy - 25.4); ctx.moveTo(cx + 10.4, cy - 24); ctx.lineTo(cx + 11.6, cy - 27.6); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 1;
      snowBall(ctx, -8, 9.6); snowBall(ctx, -20.6, 7.2); snowBall(ctx, -31, 5.5);
      ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.roundRect(cx - 5.8, cy - 27.8, 11.6, 3.2, 1.6); ctx.fill();
      ctx.beginPath(); ctx.roundRect(cx + 2.4, cy - 26.6, 3.2, 7.4, 1.2); ctx.fill();
      blob(ctx, 0, -21.6, 1, '#3d405b'); blob(ctx, 0, -17.6, 1, '#3d405b'); blob(ctx, 0, -10, 1.1, '#3d405b');
      blob(ctx, -1.9, -32.2, 0.9, '#2b2d42'); blob(ctx, 1.9, -32.2, 0.9, '#2b2d42');
      tri(ctx, 0, -31, 6.4, -29.6, 0, -28.9, '#f78c1f');
      rect(ctx, -6, -36.4, 12, 1.9, '#2b2d42'); rect(ctx, -3.8, -43, 7.6, 7, '#2b2d42'); rect(ctx, -3.8, -38.6, 7.6, 1.7, '#ef476f');
      rect(ctx, -3.8, -43, 1.6, 4.4, '#4a4e69');
      break;
    }
    case 'picnic': {
      sh(ctx, 18, 2);
      const W1 = '#d9a066', W2 = '#a8713d', W3 = '#8a5a2f', LEG = '#6b4526';
      const leg = (u0, v0, z0, u1, v1, z1) => { ctx.moveTo(X(u0, v0), Y(u0, v0, z0)); ctx.lineTo(X(u1, v1), Y(u1, v1, z1)); };
      ctx.lineCap = 'round'; ctx.strokeStyle = LEG; ctx.lineWidth = 1.7;
      ctx.beginPath(); leg(-0.26, -0.3, 0, -0.26, -0.3, 0.18); leg(0.26, -0.3, 0, 0.26, -0.3, 0.18); ctx.stroke();
      box(ctx, -0.32, -0.37, 0.32, -0.24, 0.18, 0.24, W1, W2, W3);
      ctx.strokeStyle = LEG; ctx.lineWidth = 1.7;
      ctx.beginPath(); leg(-0.24, -0.1, 0, -0.24, 0.1, 0.42); leg(-0.24, 0.1, 0, -0.24, -0.1, 0.42); leg(0.24, -0.1, 0, 0.24, 0.1, 0.42); leg(0.24, 0.1, 0, 0.24, -0.1, 0.42);
      leg(-0.26, 0.3, 0, -0.26, 0.3, 0.18); leg(0.26, 0.3, 0, 0.26, 0.3, 0.18); ctx.stroke();
      box(ctx, -0.34, -0.17, 0.34, 0.17, 0.42, 0.49, '#e6b27a', W2, W3);
      flat(ctx, -0.12, -0.17, 0.12, 0.17, 0.49, '#ef476f');
      flat(ctx, -0.04, -0.17, 0.04, 0.17, 0.49, '#fff4dc');
      box(ctx, -0.32, 0.24, 0.32, 0.37, 0.18, 0.24, W1, W2, W3);
      line(ctx, pt(0, 0, 0.49), pt(0, 0, 2.1), INK2, 2.6); line(ctx, pt(0, 0, 0.49), pt(0, 0, 2.1), '#f4f6fa', 1.4);
      tent(ctx, 0, 0, 1.56, 2.14, 0.45, PARASOL[(hsh * 3) | 0] || PARASOL[0], 8, 0.4);
      blob(ctx, 0, -34.6, 1.6, '#ffd23f');
      break;
    }
  }
  ox = sox; oy = soy;
}

// ---------- thumbnails for the build menu ----------
export function thumbRide(ctx, type, w, h) {
  const d = RIDES[type];
  const o = { type, w: d.w, h: d.h, z: 0, anim: 0.6, spin: type === 'swing' ? 0.6 : type === 'octopus' ? 0.7 : 0, riders: [], st: 'idle' };
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
  const sc = Math.min(w, h) / 78;
  ctx.translate(w / 2, h / 2 + 26.5 * sc); // the stall stands a little below the middle, at any size
  ctx.scale(sc, sc);
  setOrigin(0, 0);
  drawStall(ctx, { type, x: 0 }, 0);
  ctx.restore();
}
const TALL = { oak: 1, pine: 1, palm: 1, lamp: 1, statue: 1, fountain: 1, flag: 1, topiary: 1, torch: 1, cactus: 1, snowman: 1, picnic: 1, snowpine: 1, hedge: 1 };
export function thumbScenery(ctx, code, w, h) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const id = SCENERY[code].id;
  const tall = TALL[id] === 1;
  const sc = Math.min(w, h) / (tall ? 58 : 46);
  ctx.scale(sc, sc);
  drawScenery(ctx, code, 0, tall ? 20 : 6, 0, 0.5);
  ctx.restore();
}
