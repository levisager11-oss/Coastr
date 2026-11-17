// Isometric renderer: terrain, paths, scenery, rides, coasters, guests, overlays.
import { N, DX, DY, RIDES, SCN, COASTERS } from './data.js';
import { S, idx, inB } from './world.js';
import { pieceSamples, posAt, distAtTime, STATION_HEAD, CAR_LEN, endState, isTurn } from './coaster.js';
import { guestPos } from './guests.js';
import { drawRide, drawStall, drawScenery, setOrigin, RIDE_TOP } from './sprites.js';

export const cam = { x: 0, y: 600, zoom: 1 };
export const view = { w: 800, h: 600, dpr: 1 };
const HW = 32, HH = 16, ZH = 16;

export const isoX = (x, y) => (x - y) * HW;
export const isoY = (x, y, z) => (x + y) * HH - z * ZH;
const heff = (i) => S.h[i] - (S.water[i] ? 0.3 : 0);

export function toWorld(px, py) {
  return [(px - view.w / 2) / cam.zoom + cam.x, (py - view.h / 2) / cam.zoom + cam.y];
}
export function toScreen(wx, wy) {
  return [(wx - cam.x) * cam.zoom + view.w / 2, (wy - cam.y) * cam.zoom + view.h / 2];
}
/** Tile under a screen point, taking terrain height into account. */
export function pickTile(px, py) {
  const [wx, wy] = toWorld(px, py);
  for (let z = 9; z >= 0; z--) {
    const a = wx / HW, b = (wy + z * ZH) / HH;
    const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
    if (inB(x, y) && S.h[idx(x, y)] >= z) return { x, y };
  }
  const a = wx / HW, b = (wy + 2 * ZH) / HH;
  const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
  return inB(x, y) ? { x, y } : null;
}
export function objTop(o) {
  if (o.kind === 'coaster') return 2.2;
  return o.kind === 'stall' ? 2.4 : RIDE_TOP[o.type];
}
export function objCenter(o) {
  if (o.kind === 'coaster') {
    const p = o.pieces[1];
    return [isoX(p.x + 0.5, p.y + 0.5), isoY(p.x + 0.5, p.y + 0.5, p.h0)];
  }
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  return [isoX(cx, cy), isoY(cx, cy, o.z)];
}
/** Front-most ride, stall or guest under a screen point. */
export function pickThing(px, py) {
  const [wx, wy] = toWorld(px, py);
  let best = null, bd = 14 / Math.min(1, cam.zoom);
  const gp = {};
  for (const g of S.guests) {
    if (g.st === 'queue' || g.st === 'ride') continue;
    guestPos(g, gp);
    const d = Math.hypot(isoX(gp.x, gp.y) - wx, isoY(gp.x, gp.y, gp.z) - 7 - wy);
    if (d < bd) { bd = d; best = g; }
  }
  if (best) return { kind: 'guest', id: best.id };
  let bo = null, depth = -1;
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'coaster') continue;
    const [cx, cy] = objCenter(o);
    const halfW = (o.w + o.h) * HW / 2, top = objTop(o) * ZH, halfH = (o.w + o.h) * HH / 2;
    if (Math.abs(wx - cx) < halfW * 0.8 && wy > cy - top && wy < cy + halfH) {
      const d = o.x + o.w + o.y + o.h;
      if (d > depth) { depth = d; bo = o; }
    }
  }
  const t = pickTile(px, py);
  if (t) {
    const i = idx(t.x, t.y);
    if (S.occ[i]) return { kind: 'obj', id: S.occ[i] };
    if (bo) return { kind: 'obj', id: bo.id };
    const tr = S.trk.get(i);
    if (tr) return { kind: 'obj', id: tr[tr.length - 1].c };
  } else if (bo) return { kind: 'obj', id: bo.id };
  // tracks high above the ground: look for the nearest track point
  let bc = null, cd = 16 / Math.min(1, cam.zoom);
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind !== 'coaster' || !o.sim) continue;
    const sm = o.sim;
    for (let k = 0; k < sm.n; k += 3) {
      const d = Math.hypot(isoX(sm.X[k], sm.Y[k]) - wx, isoY(sm.X[k], sm.Y[k], sm.Z[k]) - wy);
      if (d < cd) { cd = d; bc = o; }
    }
  }
  return bc ? { kind: 'obj', id: bc.id } : null;
}

// ---------- drawing helpers ----------
function diamond(ctx, x, y, z) {
  const sx = isoX(x, y), sy = isoY(x, y, z);
  ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx - HW, sy + HH);
  ctx.closePath();
}
function rectPath(ctx, x, y, w, h, z) {
  ctx.beginPath();
  ctx.moveTo(isoX(x, y), isoY(x, y, z)); ctx.lineTo(isoX(x + w, y), isoY(x + w, y, z));
  ctx.lineTo(isoX(x + w, y + h), isoY(x + w, y + h, z)); ctx.lineTo(isoX(x, y + h), isoY(x, y + h, z));
  ctx.closePath();
}
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65536; };

// ---------- track geometry ----------
function buildGeo(c, pi) {
  const p = c.pieces[pi], sm = pieceSamples(c, pi), T = COASTERS[c.ctype];
  const n = sm.length, L = [], R = [], C = [], ties = [];
  const w = 0.13, zo = 0.3;
  for (let k = 0; k < n; k++) {
    const a = sm[Math.max(0, k - 1)], b = sm[Math.min(n - 1, k + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    let nx, ny;
    if (p.t === 'loop') { nx = -DY[p.d]; ny = DX[p.d]; }
    else { const l = Math.hypot(tx, ty) || 1; nx = -ty / l; ny = tx / l; }
    const s = sm[k];
    let zl = 0, zr = 0;
    if (p.bank) { const b2 = Math.sin((k / (n - 1)) * Math.PI) * 0.35 * (p.t === 'l' ? 1 : -1); zl = b2; zr = -b2; }
    L.push(isoX(s.x + nx * w, s.y + ny * w), isoY(s.x + nx * w, s.y + ny * w, s.z + zo + zl));
    R.push(isoX(s.x - nx * w, s.y - ny * w), isoY(s.x - nx * w, s.y - ny * w, s.z + zo + zr));
    C.push(isoX(s.x, s.y), isoY(s.x, s.y, s.z + zo));
    const tieEvery = p.t === 'loop' ? 2 : c.ctype === 'wood' ? 1 : 2;
    if (k % tieEvery === 0) ties.push(k);
  }
  // supports
  const sup = [];
  const addSup = (s) => {
    const tx = Math.max(0, Math.min(N - 1, Math.floor(s.x))), ty = Math.max(0, Math.min(N - 1, Math.floor(s.y)));
    const g = heff(idx(tx, ty));
    if (s.z - g > 0.5) sup.push([s.x, s.y, s.z + zo - 0.1, g]);
  };
  if (p.t === 'loop') { addSup({ x: sm[4].x, y: sm[4].y, z: sm[4].z }); }
  else {
    addSup(sm[(n - 1) >> 1]);
    if (c.ctype === 'wood') addSup(sm[0]);
  }
  let loopSup = null;
  if (p.t === 'loop') {
    // a frame holding the loop: from its side points down to the ground
    const q1 = sm[Math.round(n * 0.32)], q2 = sm[Math.round(n * 0.68)];
    const gi = idx(p.x, p.y);
    loopSup = [[q1.x, q1.y, q1.z, heff(gi)], [q2.x, q2.y, q2.z, heff(gi)]];
  }
  return { L, R, C, ties, sup, loopSup, n, T };
}

function strokeLine(ctx, a) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  for (let k = 2; k < a.length; k += 2) ctx.lineTo(a[k], a[k + 1]);
  ctx.stroke();
}

export function drawPiece(ctx, c, pi, alpha) {
  const p = c.pieces[pi];
  const g = p.geo || (p.geo = buildGeo(c, pi));
  const T = g.T;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  // station platform
  if (p.t === 'station') {
    const z = p.h0 + 0.12;
    rectPath(ctx, p.x, p.y, 1, 1, z);
    ctx.fillStyle = '#e4e7ee'; ctx.fill();
    ctx.strokeStyle = 'rgba(60,60,90,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    // yellow safety edges along the track
    const nx = -DY[p.d] * 0.3, ny = DX[p.d] * 0.3;
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
    for (const sgn of [-1, 1]) {
      const ax = p.x + 0.5 - DX[p.d] * 0.5 + nx * sgn, ay = p.y + 0.5 - DY[p.d] * 0.5 + ny * sgn;
      ctx.beginPath();
      ctx.moveTo(isoX(ax, ay), isoY(ax, ay, z));
      ctx.lineTo(isoX(ax + DX[p.d], ay + DY[p.d]), isoY(ax + DX[p.d], ay + DY[p.d], z));
      ctx.stroke();
    }
  }
  // supports
  if (g.sup.length || g.loopSup) {
    ctx.strokeStyle = T.sup;
    for (const s of g.sup) {
      const x = isoX(s[0], s[1]), y0 = isoY(s[0], s[1], s[2]), y1 = isoY(s[0], s[1], s[3]);
      if (c.ctype === 'wood') {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 5, y0 + 2); ctx.lineTo(x - 5, y1); ctx.moveTo(x + 5, y0 + 2); ctx.lineTo(x + 5, y1);
        for (let yy = y1 - 2, f = 0; yy > y0 + 12; yy -= 14, f ^= 1) {
          ctx.moveTo(x - 5, yy); ctx.lineTo(x + 5, yy - 12);
          ctx.moveTo(x + 5, yy); ctx.lineTo(x - 5, yy - 12);
        }
        ctx.stroke();
      } else {
        ctx.lineWidth = c.ctype === 'steel' ? 3.4 : 2.4;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 1.4, y0); ctx.lineTo(x + 1.4, y1); ctx.stroke();
        ctx.strokeStyle = T.sup;
      }
    }
    if (g.loopSup) {
      ctx.lineWidth = 3;
      for (const s of g.loopSup) {
        const x = isoX(s[0], s[1]), y0 = isoY(s[0], s[1], s[2]);
        const bx = isoX(s[0] + (-DY[p.d]) * 0.35, s[1] + DX[p.d] * 0.35), by = isoY(s[0] - DY[p.d] * 0.35, s[1] + DX[p.d] * 0.35, s[3]);
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
  }
  // spine for steel
  if (c.ctype === 'steel') {
    ctx.strokeStyle = T.tie; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(g.C[0], g.C[1] + 2);
    for (let k = 2; k < g.C.length; k += 2) ctx.lineTo(g.C[k], g.C[k + 1] + 2);
    ctx.stroke();
  }
  // ties
  ctx.strokeStyle = T.tie; ctx.lineWidth = c.ctype === 'wood' ? 2.2 : 1.6;
  ctx.beginPath();
  for (const k of g.ties) { ctx.moveTo(g.L[k * 2], g.L[k * 2 + 1]); ctx.lineTo(g.R[k * 2], g.R[k * 2 + 1]); }
  ctx.stroke();
  // special markings
  if (p.chain) {
    ctx.strokeStyle = '#4a4f5e'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
    strokeLine(ctx, g.C); ctx.setLineDash([]);
  } else if (p.t === 'boost' || p.t === 'brake') {
    ctx.strokeStyle = p.t === 'boost' ? '#06d6a0' : '#ff3b3b'; ctx.lineWidth = 4;
    strokeLine(ctx, g.C);
  }
  // rails
  ctx.strokeStyle = 'rgba(30,20,50,0.35)'; ctx.lineWidth = 3.6;
  strokeLine(ctx, g.L); strokeLine(ctx, g.R);
  ctx.strokeStyle = T.rail; ctx.lineWidth = 2.2;
  strokeLine(ctx, g.L); strokeLine(ctx, g.R);
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

// ---------- trains ----------
const tp = {};
function drawCar(ctx, c, car) {
  const T = COASTERS[c.ctype];
  // metric frame
  let fx = car.tx * 4, fy = car.ty * 4, fz = car.tz * 2;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  const sx0 = car.sx, sy0 = car.sy; // side vector (horizontal)
  const ux = fy * 0 - fz * sy0, uy = fz * sx0 - fx * 0, uz = fx * sy0 - fy * sx0;
  const P = (a, b, u) => {
    const mx = car.x * 4 + fx * a + sx0 * b + ux * u, my = car.y * 4 + fy * a + sy0 * b + uy * u;
    const mz = car.z * 2 + 0.7 + fz * a + uz * u;
    return [isoX(mx / 4, my / 4), isoY(mx / 4, my / 4, mz / 2)];
  };
  const hl = 1.05, hw = 0.62, ht = 0.95;
  const b = [P(-hl, -hw, 0), P(hl, -hw, 0), P(hl, hw, 0), P(-hl, hw, 0)];
  const t = [P(-hl, -hw, ht), P(hl, -hw, ht), P(hl, hw, ht), P(-hl, hw, ht)];
  const quad = (q, col) => {
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
    for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  quad(b, 'rgba(30,20,50,0.55)');
  for (let k = 0; k < 4; k++) quad([b[k], b[(k + 1) % 4], t[(k + 1) % 4], t[k]], shade(T.car, -0.22));
  quad(t, T.car);
  ctx.strokeStyle = 'rgba(30,20,50,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  if (car.riders > 0) {
    for (let k = 0; k < Math.min(2, car.riders); k++) {
      const h = P(0, k ? 0.3 : -0.3, ht + 0.45);
      ctx.beginPath(); ctx.arc(h[0], h[1], 2.6, 0, 6.3);
      ctx.fillStyle = k ? '#f1c27d' : '#ffd9b3'; ctx.fill();
    }
  }
}
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// ---------- guests ----------
function drawGuest(ctx, g, sx, sy, sel) {
  const step = g.st === 'walk' ? Math.sin(g.walk) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(sx, sy, 4.2, 2.1, 0, 0, 6.3); ctx.fill();
  if (sel) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, 8, 4, 0, 0, 6.3); ctx.stroke();
  }
  // legs
  ctx.strokeStyle = '#3d405b'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - 1.3, sy - 4); ctx.lineTo(sx - 1.3 - step * 1.4, sy - 0.5);
  ctx.moveTo(sx + 1.3, sy - 4); ctx.lineTo(sx + 1.3 + step * 1.4, sy - 0.5);
  ctx.stroke();
  const bob = Math.abs(step) * 0.8;
  // body
  ctx.fillStyle = g.shirt;
  ctx.beginPath(); ctx.roundRect(sx - 2.9, sy - 10.5 - bob, 5.8, 7, 2); ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,50,0.4)'; ctx.lineWidth = 0.7; ctx.stroke();
  // head
  ctx.fillStyle = g.skin;
  ctx.beginPath(); ctx.arc(sx, sy - 13 - bob, 2.9, 0, 6.3); ctx.fill();
  ctx.fillStyle = g.hair;
  ctx.beginPath(); ctx.arc(sx, sy - 13.6 - bob, 2.9, Math.PI, 0); ctx.fill();
  if (g.gift) {
    const cols = ['#ef476f', '#ffd23f', '#06d6a0', '#3b8ed0', '#9b5de5'];
    const bx = sx + 5 + Math.sin(g.walk * 0.3) * 1.2, by = sy - 26 - bob;
    ctx.strokeStyle = 'rgba(60,60,60,0.6)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(sx + 3, sy - 8 - bob); ctx.lineTo(bx, by + 4); ctx.stroke();
    ctx.fillStyle = cols[g.gift - 1];
    ctx.beginPath(); ctx.ellipse(bx, by, 3.4, 4.2, 0, 0, 6.3); ctx.fill();
  }
  if (g.nausea > 70) {
    ctx.fillStyle = '#7bc043';
    ctx.beginPath(); ctx.arc(sx, sy - 13 - bob, 2.9, 0, 6.3); ctx.fill();
  }
}

// ---------- the frame ----------
let buckets = new Map();
const gp = {};
let skyGrad = null, skyH = 0;
const clouds = Array.from({ length: 7 }, (_, i) => ({ x: (i * 0.17 + 0.05) % 1, y: 0.05 + ((i * 37) % 40) / 100, s: 0.7 + ((i * 53) % 60) / 100 }));

function addBucket(i, item) {
  let b = buckets.get(i);
  if (!b) { b = []; buckets.set(i, b); }
  b.push(item);
}

export function render(ctx, time, ui) {
  const { w, h, dpr } = view, z = cam.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!skyGrad || skyH !== h) {
    skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#8fd3ff'); skyGrad.addColorStop(0.6, '#c9ecff'); skyGrad.addColorStop(1, '#e8f8ff');
    skyH = h;
  }
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const c of clouds) {
    const cx = ((c.x + time * 0.004 * c.s) % 1.2 - 0.1) * w, cy = c.y * h, s = c.s * Math.min(w, 900) * 0.07;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 1.6, s * 0.55, 0, 0, 6.3); ctx.ellipse(cx - s * 0.7, cy + s * 0.1, s * 0.9, s * 0.4, 0, 0, 6.3);
    ctx.ellipse(cx + s * 0.6, cy - s * 0.25, s * 0.8, s * 0.5, 0, 0, 6.3);
    ctx.fill();
  }
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
  const wx0 = cam.x - w / 2 / z - 48, wx1 = cam.x + w / 2 / z + 48;
  const wy0 = cam.y - h / 2 / z - 48, wy1 = cam.y + h / 2 / z;

  // dynamic things go into per-tile buckets so they sort with the scenery
  buckets.clear();
  for (const g of S.guests) {
    if (g.st === 'queue' || g.st === 'ride') continue;
    guestPos(g, gp);
    const tx = Math.max(0, Math.min(N - 1, Math.floor(gp.x))), ty = Math.max(0, Math.min(N - 1, Math.floor(gp.y)));
    addBucket(idx(tx, ty), { g, x: gp.x, y: gp.y, z: gp.z, d: gp.x + gp.y });
  }
  for (const id in S.objs) {
    const c = S.objs[id];
    if (c.kind !== 'coaster' || !c.sim || c.sim.L < 13) continue;
    const moving = c.st === 'run' || c.st === 'test';
    const head = STATION_HEAD + (moving ? distAtTime(c.sim, c.runT) : 0);
    const T = COASTERS[c.ctype];
    let riders = c.st === 'run' ? c.riders.length : 0;
    for (let j = 0; j < T.cars; j++) {
      let dist = head - j * CAR_LEN;
      if (!c.closed) dist = Math.max(0.1, Math.min(c.sim.L - 0.1, dist));
      if (!posAt(c.sim, dist, tp)) continue;
      const p = c.pieces[c.sim.PI[tp.k % c.sim.n]];
      let sx, sy;
      if (p.t === 'loop') { sx = -DY[p.d]; sy = DX[p.d]; }
      else { const l = Math.hypot(tp.tx, tp.ty) || 1; sx = -tp.ty / l; sy = tp.tx / l; }
      const car = { car: 1, c, x: tp.x, y: tp.y, z: tp.z, tx: tp.tx, ty: tp.ty, tz: tp.tz, sx, sy, d: tp.x + tp.y + 0.01, riders: Math.min(2, riders) };
      riders -= 2;
      const tx = Math.max(0, Math.min(N - 1, Math.floor(tp.x))), ty = Math.max(0, Math.min(N - 1, Math.floor(tp.y)));
      addBucket(idx(tx, ty), car);
    }
    if (ui.follow === c.id && moving && posAt(c.sim, head, tp)) {
      ui.followPos = [isoX(tp.x, tp.y), isoY(tp.x, tp.y, tp.z), tp.k];
    }
  }

  const sel = ui.sel;
  for (let d = 0; d <= 2 * N - 2; d++) {
    const xa = Math.max(0, d - N + 1), xb = Math.min(N - 1, d);
    for (let x = xa; x <= xb; x++) {
      const y = d - x, i = idx(x, y);
      const he = heff(i), sx = isoX(x, y), sy = isoY(x, y, he);
      const hasTrack = S.trk.has(i);
      if (sx < wx0 - HW || sx > wx1 + HW || sy < wy0 - 40 || sy > wy1 + (hasTrack ? 420 : S.occ[i] ? 220 : 120)) continue;
      drawTile(ctx, x, y, i, he, sx, sy, time);
      if (S.scn[i]) drawScenery(ctx, S.scn[i], sx, sy + HH, time, hash(x, y));
      if (hasTrack) {
        const list = S.trk.get(i);
        for (const s of list) {
          const c = S.objs[s.c];
          if (!c) continue;
          const p = c.pieces[s.p];
          if (!p) continue;
          if (p.t === 'loop') {
            const front = p.d === 0 || p.d === 1;
            const isSecond = !(p.x === x && p.y === y);
            if (front !== isSecond) continue;
          }
          drawPiece(ctx, c, s.p, ui.editing && ui.editing !== c.id ? 0.85 : undefined);
          if (c.sim && c.sim.stall === s.p) hot(ctx, p);
        }
      }
      const oid = S.occ[i];
      if (oid) {
        const o = S.objs[oid];
        if (o && x === o.x + o.w - 1 && y === o.y + o.h - 1) {
          setOrigin(isoX(o.x + o.w / 2, o.y + o.h / 2), isoY(o.x + o.w / 2, o.y + o.h / 2, o.z));
          if (o.kind === 'ride') drawRide(ctx, o, time); else drawStall(ctx, o, time);
        }
      }
      const b = buckets.get(i);
      if (b) {
        if (b.length > 1) b.sort((p, q) => p.d - q.d);
        for (const e of b) {
          if (e.car) drawCar(ctx, e.c, e);
          else drawGuest(ctx, e.g, isoX(e.x, e.y), isoY(e.x, e.y, e.z), sel && sel.kind === 'guest' && sel.id === e.g.id);
        }
      }
      if (x === S.ent.x && y === S.ent.y) drawEntrance(ctx, x, y, he);
    }
  }
  drawOverlays(ctx, time, ui);
}

function hot(ctx, p) {
  const z = Math.max(p.h0, p.h1) + 0.3;
  ctx.fillStyle = 'rgba(255,40,40,0.45)';
  ctx.beginPath(); ctx.arc(isoX(p.x + 0.5, p.y + 0.5), isoY(p.x + 0.5, p.y + 0.5, z), 13, 0, 6.3); ctx.fill();
}

function drawTile(ctx, x, y, i, he, sx, sy, time) {
  const water = S.water[i], path = S.path[i];
  // side faces
  const hl = y + 1 < N ? heff(i + N) : -1.6, hr = x + 1 < N ? heff(i + 1) : -1.6;
  if (he > hl) {
    const dh = (he - hl) * ZH;
    ctx.beginPath();
    ctx.moveTo(sx - HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx, sy + HH * 2 + dh); ctx.lineTo(sx - HW, sy + HH + dh);
    ctx.closePath();
    ctx.fillStyle = '#c99b5f'; ctx.fill();
    if (path && y + 1 < N && S.path[i + N] && he - hl <= 1.1) stairs(ctx, sx - HW, sy + HH, sx, sy + HH * 2, dh, '#d9c08e');
  }
  if (he > hr) {
    const dh = (he - hr) * ZH;
    ctx.beginPath();
    ctx.moveTo(sx, sy + HH * 2); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx + HW, sy + HH + dh); ctx.lineTo(sx, sy + HH * 2 + dh);
    ctx.closePath();
    ctx.fillStyle = '#a87c48'; ctx.fill();
    if (path && x + 1 < N && S.path[i + 1] && he - hr <= 1.1) stairs(ctx, sx, sy + HH * 2, sx + HW, sy + HH, dh, '#c2a877');
  }
  // top
  ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx - HW, sy + HH);
  ctx.closePath();
  if (water) {
    ctx.fillStyle = '#4fb8ee'; ctx.fill();
    const ph = (time * 0.6 + hash(x, y) * 6) % 3;
    if (ph < 1.6) {
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * Math.sin((ph / 1.6) * Math.PI)})`; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      const ox = (hash(y, x) - 0.5) * 24, oy = HH + (hash(x + 9, y) - 0.5) * 10;
      ctx.beginPath(); ctx.moveTo(sx + ox - 6, sy + oy); ctx.lineTo(sx + ox + 6, sy + oy); ctx.stroke();
    }
  } else if (path) {
    ctx.fillStyle = (x + y) & 1 ? '#f3e2ba' : '#efdcb0'; ctx.fill();
    ctx.strokeStyle = '#c9ad78'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    const P = (xx, yy) => S.path[idx(xx, yy)] || S.occ[idx(xx, yy)];
    if (!(y > 0 && P(x, y - 1))) { ctx.moveTo(sx + 1, sy + 1); ctx.lineTo(sx + HW - 1, sy + HH); }
    if (!(x > 0 && P(x - 1, y))) { ctx.moveTo(sx - 1, sy + 1); ctx.lineTo(sx - HW + 1, sy + HH); }
    if (!(x + 1 < N && P(x + 1, y))) { ctx.moveTo(sx + HW - 1, sy + HH); ctx.lineTo(sx, sy + HH * 2 - 1); }
    if (!(y + 1 < N ? P(x, y + 1) : (x === S.ent.x))) { ctx.moveTo(sx - HW + 1, sy + HH); ctx.lineTo(sx, sy + HH * 2 - 1); }
    ctx.stroke();
  } else {
    const lift = Math.min(4, S.h[i] - 2);
    ctx.fillStyle = (x + y) & 1 ? GRASS_A[lift + 2] : GRASS_B[lift + 2];
    ctx.fill();
  }
}
const GRASS_A = ['#7cc653', '#84cd59', '#8cd45f', '#95da69', '#9fe075', '#a9e582', '#b3ea8f'];
const GRASS_B = ['#75bf4d', '#7dc653', '#85cd59', '#8ed463', '#98da6f', '#a2df7c', '#ace489'];

function stairs(ctx, x0, y0, x1, y1, dh, col) {
  ctx.beginPath();
  const mx0 = x0 + (x1 - x0) * 0.2, my0 = y0 + (y1 - y0) * 0.2, mx1 = x0 + (x1 - x0) * 0.8, my1 = y0 + (y1 - y0) * 0.8;
  ctx.moveTo(mx0, my0); ctx.lineTo(mx1, my1); ctx.lineTo(mx1, my1 + dh); ctx.lineTo(mx0, my0 + dh); ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = 'rgba(90,60,20,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < 3; k++) { ctx.moveTo(mx0, my0 + (dh * k) / 3); ctx.lineTo(mx1, my1 + (dh * k) / 3); }
  ctx.stroke();
}

function drawEntrance(ctx, x, y, he) {
  // an arch across the entrance path, at the front edge of the map
  const lx = isoX(x, y + 1), ly = isoY(x, y + 1, he), rx = isoX(x + 1, y + 1), ry = isoY(x + 1, y + 1, he);
  const H = 46;
  for (const [px, py] of [[lx, ly], [rx, ry]]) {
    ctx.fillStyle = '#ef476f';
    ctx.beginPath(); ctx.roundRect(px - 4.5, py - H, 9, H + 2, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 4; k++) ctx.fillRect(px - 4.5, py - H + 6 + k * 11, 9, 4);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(px, py - H - 3, 5, 0, 6.3); ctx.fill();
  }
  ctx.fillStyle = '#3b8ed0';
  ctx.beginPath();
  ctx.moveTo(lx - 2, ly - H + 2); ctx.lineTo(rx + 2, ry - H + 2); ctx.lineTo(rx + 2, ry - H + 17); ctx.lineTo(lx - 2, ly - H + 17);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,50,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save();
  ctx.translate((lx + rx) / 2, (ly + ry) / 2 - H + 9.5);
  ctx.transform(1, (ry - ly) / (rx - lx), 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.font = '900 9px ui-rounded, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('COASTR', 0, 0.5);
  ctx.restore();
}

// ---------- overlays ----------
function outline(ctx, x, y, w, h, z, fill, stroke) {
  rectPath(ctx, x, y, w, h, z);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawOverlays(ctx, time, ui) {
  const pulse = 0.6 + 0.4 * Math.sin(time * 5);
  // selected object
  if (ui.sel && ui.sel.kind === 'obj') {
    const o = S.objs[ui.sel.id];
    if (o && o.kind !== 'coaster') outline(ctx, o.x, o.y, o.w, o.h, o.z + 0.05, null, `rgba(255,255,255,${0.5 + 0.4 * pulse})`);
    else if (o) for (const p of o.pieces) if (p.t === 'station') outline(ctx, p.x, p.y, 1, 1, p.h0 + 0.15, null, `rgba(255,255,255,${0.5 + 0.4 * pulse})`);
  }
  // ghost for the active tool
  const g = ui.ghost;
  if (g) {
    const ok = g.ok, fill = ok ? 'rgba(80,230,140,0.4)' : 'rgba(255,70,70,0.45)', stroke = ok ? '#eafff2' : '#ffe1e1';
    if (g.kind === 'tiles') {
      for (const [x, y] of g.tiles) if (inB(x, y)) outline(ctx, x, y, 1, 1, heff(idx(x, y)) + 0.03, fill, stroke);
    } else if (g.kind === 'box') {
      const z = inB(g.x, g.y) ? S.h[idx(g.x, g.y)] : 2;
      outline(ctx, g.x, g.y, g.w, g.h, z + 0.03, fill, stroke);
      if (g.draw && ok) {
        ctx.globalAlpha = 0.7;
        setOrigin(isoX(g.x + g.w / 2, g.y + g.h / 2), isoY(g.x + g.w / 2, g.y + g.h / 2, z));
        g.draw(ctx);
        ctx.globalAlpha = 1;
      }
    } else if (g.kind === 'station') {
      for (let k = 0; k < 3; k++) {
        const x = g.x + DX[g.d] * k, y = g.y + DY[g.d] * k;
        if (inB(x, y)) outline(ctx, x, y, 1, 1, S.h[idx(x, y)] + 0.03, fill, stroke);
      }
      const ax = g.x + 0.5 + DX[g.d] * 2.2, ay = g.y + 0.5 + DY[g.d] * 2.2;
      if (inB(g.x, g.y)) arrow(ctx, ax, ay, S.h[idx(g.x, g.y)] + 0.4, g.d, '#fff');
    }
  }
  // coaster editor: where the next piece goes
  if (ui.editing) {
    const c = S.objs[ui.editing];
    if (c && !c.closed) {
      const e = endState(c);
      if (inB(e.x, e.y)) {
        const gz = heff(idx(e.x, e.y));
        outline(ctx, e.x, e.y, 1, 1, gz + 0.03, `rgba(255,255,255,${0.2 + 0.2 * pulse})`, 'rgba(255,255,255,0.9)');
        if (e.h > gz + 0.2) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(isoX(e.x + 0.5, e.y + 0.5), isoY(e.x + 0.5, e.y + 0.5, gz));
          ctx.lineTo(isoX(e.x + 0.5, e.y + 0.5), isoY(e.x + 0.5, e.y + 0.5, e.h));
          ctx.stroke(); ctx.setLineDash([]);
        }
      }
      arrow(ctx, e.x + 0.5 - DX[e.d] * 0.25, e.y + 0.5 - DY[e.d] * 0.25, e.h + 0.5, e.d, '#ffd23f', 1 + 0.12 * pulse);
      // mark the station entry so it is clear where the track must come back to
      const f = c.pieces[0];
      arrow(ctx, f.x + 0.5 - DX[f.d] * 0.9, f.y + 0.5 - DY[f.d] * 0.9, f.h0 + 0.5, f.d, '#06d6a0', 0.85);
    }
  }
  // badges over rides
  if (cam.zoom >= 0.55) {
    for (const id in S.objs) {
      const o = S.objs[id];
      const [cx, cy] = objCenter(o);
      const top = cy - objTop(o) * ZH - 6;
      let text = null, col = '#3d405b';
      if (o.kind === 'coaster' && !o.closed) { text = '…'; col = '#f78c1f'; }
      else if (o.kind === 'coaster' && o.sim && !o.sim.ok) { text = '!'; col = '#e63946'; }
      else if (!o.open) { text = '×'; col = '#8d99ae'; }
      else if (o.noAccess) { text = '!'; col = '#e63946'; }
      else if (o.kind !== 'stall' && o.queue.length) text = String(o.queue.length);
      if (!text) continue;
      const s = 1 / Math.max(0.8, cam.zoom);
      ctx.font = `800 ${11 * s}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
      const tw = Math.max(16 * s, ctx.measureText(text).width + 10 * s);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(cx - tw / 2, top - 8 * s, tw, 16 * s, 8 * s); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, top + 0.5 * s);
    }
  }
}

function arrow(ctx, x, y, z, d, col, sc = 1) {
  const fx = DX[d], fy = DY[d], nx = -fy, ny = fx;
  const P = (a, b) => [isoX(x + fx * a * sc + nx * b * sc, y + fy * a * sc + ny * b * sc), isoY(x + fx * a * sc + nx * b * sc, y + fy * a * sc + ny * b * sc, z)];
  const pts = [P(0.45, 0), P(0.05, 0.36), P(0.05, 0.14), P(-0.4, 0.14), P(-0.4, -0.14), P(0.05, -0.14), P(0.05, -0.36)];
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,50,0.6)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
}

/** Small picture of a coaster type for the build menu. */
export function coasterThumb(ctx, ctype, w, h) {
  const c = { ctype, closed: false, pieces: [] };
  const mk = (x, h0, h1, t = 's') => ({ t, x, y: 0, d: 0, h0, h1, chain: false, bank: false });
  c.pieces.push(mk(0, 0, 1), mk(1, 1, 2), mk(2, 2, 1), mk(3, 1, 0));
  ctx.save();
  ctx.translate(w / 2 - 34, h / 2 - 12);
  ctx.scale(0.62, 0.62);
  const keep = { h: S.h, water: S.water };
  S.h = S.h || new Uint8Array(N * N); S.water = S.water || new Uint8Array(N * N);
  const realH = [];
  for (let x = 0; x < 4; x++) { realH.push(S.h[idx(x, 0)], S.water[idx(x, 0)]); S.h[idx(x, 0)] = 0; S.water[idx(x, 0)] = 0; }
  for (let i = 0; i < 4; i++) drawPiece(ctx, c, i);
  for (let x = 0; x < 4; x++) { S.h[idx(x, 0)] = realH[x * 2]; S.water[idx(x, 0)] = realH[x * 2 + 1]; }
  S.h = keep.h || S.h; S.water = keep.water || S.water;
  ctx.restore();
}
