// Coaster tracks and trains: how every piece, support, station and car is drawn.
import { N, DX, DY, COASTERS, TRACK_COLORS } from './data.js';
import { S, idx } from './world.js';
import { pieceSamples, exitDir, bankAt, corkAngle } from './coaster.js';
import { isoX, isoY, heff, shade, rectPath, HW, HH } from './iso.js';

let fine = true; // zoomed in far enough for small details to be worth drawing
export function setTrackDetail(on) { fine = on; }

const styles = new Map();
/** Colours of a coaster: its type's own, or the paint the player picked. */
function styleOf(c) {
  const key = c.ctype + (c.col | 0);
  let st = styles.get(key);
  if (!st) {
    const T = COASTERS[c.ctype], pal = TRACK_COLORS[c.col | 0];
    st = pal ? { ...T, rail: pal[0], tie: pal[1], car: pal[2] } : { ...T };
    st.railHi = shade(st.rail, 0.45); st.carDark = shade(st.car, -0.22); st.carHi = shade(st.car, 0.35);
    styles.set(key, st);
  }
  return st;
}


// ---------- track geometry ----------
function buildGeo(c, pi) {
  const p = c.pieces[pi], sm = pieceSamples(c, pi), st = styleOf(c);
  const n = sm.length, L = [], R = [], C = [], SH = [], ties = [];
  const w = 0.13, zo = 0.3, cork = p.t === 'cork', loop = p.t === 'loop', ed = exitDir(p), wide = p.t === 'wl' || p.t === 'wr';
  const tieEvery = loop || cork ? 2 : c.ctype === 'wood' ? 1 : 2;
  const cellOf = (s) => idx(Math.max(0, Math.min(N - 1, Math.floor(s.x))), Math.max(0, Math.min(N - 1, Math.floor(s.y))));
  for (let k = 0; k < n; k++) {
    const a = sm[Math.max(0, k - 1)], b = sm[Math.min(n - 1, k + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    // at the two ends the rails point exactly along the grid, so they meet the next piece without a notch
    if (!loop && !cork) { if (k === 0) { tx = DX[p.d]; ty = DY[p.d]; } else if (k === n - 1) { tx = DX[ed]; ty = DY[ed]; } }
    let nx, ny;
    if (loop || cork) { nx = -DY[p.d]; ny = DX[p.d]; }
    else { const l = Math.hypot(tx, ty) || 1; nx = -ty / l; ny = tx / l; }
    const s = sm[k];
    let zl = 0, zr = 0, ww = w;
    if (p.bank) { zl = bankAt(c, pi, k / (n - 1)); zr = -zl; }
    if (cork) { const th = corkAngle(k / (n - 1)); ww = w * Math.cos(th); zl = 0.26 * Math.sin(th); zr = -zl; }
    L.push(isoX(s.x + nx * ww, s.y + ny * ww), isoY(s.x + nx * ww, s.y + ny * ww, s.z + zo + zl));
    R.push(isoX(s.x - nx * ww, s.y - ny * ww), isoY(s.x - nx * ww, s.y - ny * ww, s.z + zo + zr));
    C.push(isoX(s.x, s.y), isoY(s.x, s.y, s.z + zo));
    const g = heff(cellOf(s));
    if (s.z - g > 0.45 && p.t !== 'station') SH.push(isoX(s.x, s.y), isoY(s.x, s.y, g + 0.02)); else SH.push(NaN, NaN);
    if (k % tieEvery === 0) ties.push(k);
  }
  // which stretch of the piece lies on which tile, so each tile draws its own part in the right order
  let parts = null;
  if (wide || cork) {
    parts = new Map();
    for (let k = 0; k < n - 1; k++) {
      const ci = cellOf({ x: (sm[k].x + sm[k + 1].x) / 2, y: (sm[k].y + sm[k + 1].y) / 2 });
      const r = parts.get(ci);
      if (r) r[1] = k + 1; else parts.set(ci, [k, k + 1]);
    }
  }
  const sup = [];
  const addSup = (k) => {
    const s = sm[k], ci = cellOf(s), g = heff(ci);
    if (s.z - g > 0.5) sup.push([s.x, s.y, s.z + zo - 0.1, g, k]);
  };
  let loopSup = null;
  if (loop) {
    addSup(4);
    // a frame holding the loop: from its side points down to the ground
    const q1 = sm[Math.round(n * 0.32)], q2 = sm[Math.round(n * 0.68)];
    const gi = idx(p.x, p.y);
    loopSup = [[q1.x, q1.y, q1.z, heff(gi)], [q2.x, q2.y, q2.z, heff(gi)]];
  } else if (cork) { addSup(2); addSup(n - 3); addSup((n - 1) >> 1); }
  else if (wide) { addSup(2); addSup((n - 1) >> 1); addSup(n - 3); }
  else {
    addSup((n - 1) >> 1);
    if (c.ctype === 'wood') addSup(0);
  }
  return { L, R, C, SH, ties, sup, loopSup, n, st, parts, tv: S.tv };
}

function strokeRange(ctx, a, k0, k1) {
  ctx.beginPath();
  ctx.moveTo(a[k0 * 2], a[k0 * 2 + 1]);
  for (let k = k0 + 1; k <= k1; k++) ctx.lineTo(a[k * 2], a[k * 2 + 1]);
  ctx.stroke();
}

/** Draws one piece, or only the part of it that lies on tile `cell`. */
export function drawPiece(ctx, c, pi, alpha, cell) {
  const p = c.pieces[pi];
  let g = p.geo;
  if (!g || g.tv !== S.tv) g = p.geo = buildGeo(c, pi);
  const T = g.st;
  let k0 = 0, k1 = g.n - 1;
  if (g.parts && cell !== undefined) {
    const r = g.parts.get(cell);
    if (!r) return;
    k0 = r[0]; k1 = r[1];
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  // shadow on the ground under raised track
  if (fine) {
    ctx.strokeStyle = 'rgba(20,35,45,0.15)'; ctx.lineWidth = 7;
    ctx.beginPath();
    let pen = false;
    for (let k = k0; k <= k1; k++) {
      const x = g.SH[k * 2];
      if (x !== x) { pen = false; continue; }
      if (pen) ctx.lineTo(x, g.SH[k * 2 + 1]); else { ctx.moveTo(x, g.SH[k * 2 + 1]); pen = true; }
    }
    ctx.stroke();
  }
  if (p.t === 'station') stationBase(ctx, c, p, T);
  // supports
  if (g.sup.length || g.loopSup) {
    for (const s of g.sup) {
      if (s[4] < k0 || s[4] > k1) continue;
      const x = isoX(s[0], s[1]), y0 = isoY(s[0], s[1], s[2]), y1 = isoY(s[0], s[1], s[3]);
      ctx.strokeStyle = T.sup;
      if (c.ctype === 'wood') {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 5, y0 + 2); ctx.lineTo(x - 5, y1); ctx.moveTo(x + 5, y0 + 2); ctx.lineTo(x + 5, y1);
        for (let yy = y1 - 2; yy > y0 + 12; yy -= 14) {
          ctx.moveTo(x - 5, yy); ctx.lineTo(x + 5, yy - 12);
          ctx.moveTo(x + 5, yy); ctx.lineTo(x - 5, yy - 12);
        }
        ctx.stroke();
      } else {
        const lw = c.ctype === 'mini' ? 2.4 : 3.4;
        ctx.fillStyle = 'rgba(70,80,100,0.5)';
        ctx.beginPath(); ctx.ellipse(x, y1, lw + 2, (lw + 2) / 2, 0, 0, 6.3); ctx.fill();
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + lw / 2 - 0.4, y0); ctx.lineTo(x + lw / 2 - 0.4, y1); ctx.stroke();
      }
    }
    if (g.loopSup) {
      ctx.strokeStyle = T.sup; ctx.lineWidth = 3;
      for (const s of g.loopSup) {
        const x = isoX(s[0], s[1]), y0 = isoY(s[0], s[1], s[2]);
        const bx = isoX(s[0] + (-DY[p.d]) * 0.35, s[1] + DX[p.d] * 0.35), by = isoY(s[0] - DY[p.d] * 0.35, s[1] + DX[p.d] * 0.35, s[3]);
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
  }
  // spine for steel
  if (c.ctype === 'steel' || c.ctype === 'launch') {
    ctx.strokeStyle = T.tie; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(g.C[k0 * 2], g.C[k0 * 2 + 1] + 2);
    for (let k = k0 + 1; k <= k1; k++) ctx.lineTo(g.C[k * 2], g.C[k * 2 + 1] + 2);
    ctx.stroke();
  }
  // ties
  ctx.strokeStyle = T.tie; ctx.lineWidth = c.ctype === 'wood' ? 2.2 : 1.6;
  ctx.beginPath();
  for (const k of g.ties) { if (k < k0 || k > k1) continue; ctx.moveTo(g.L[k * 2], g.L[k * 2 + 1]); ctx.lineTo(g.R[k * 2], g.R[k * 2 + 1]); }
  ctx.stroke();
  // special markings
  if (p.chain) {
    ctx.strokeStyle = '#4a4f5e'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
    strokeRange(ctx, g.C, k0, k1); ctx.setLineDash([]);
  } else if (p.t === 'boost' || p.t === 'brake') {
    ctx.strokeStyle = p.t === 'boost' ? '#06d6a0' : '#ff3b3b'; ctx.lineWidth = 4;
    strokeRange(ctx, g.C, k0, k1);
  }
  // rails: a dark outline, the colour, and a thin highlight
  ctx.strokeStyle = 'rgba(30,20,50,0.38)'; ctx.lineWidth = 3.8;
  strokeRange(ctx, g.L, k0, k1); strokeRange(ctx, g.R, k0, k1);
  ctx.strokeStyle = T.rail; ctx.lineWidth = 2.3;
  strokeRange(ctx, g.L, k0, k1); strokeRange(ctx, g.R, k0, k1);
  if (fine) {
    ctx.save(); ctx.translate(-0.5, -0.7);
    ctx.strokeStyle = T.railHi; ctx.lineWidth = 0.8;
    strokeRange(ctx, g.L, k0, k1); strokeRange(ctx, g.R, k0, k1);
    ctx.restore();
  }
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

// A station tile: a raised platform beside the track with a yellow safety line.
function stationBase(ctx, c, p, T) {
  const z = p.h0, zt = z + 0.22;
  const sx = isoX(p.x, p.y), sy = isoY(p.x, p.y, zt);
  ctx.fillStyle = '#b9bfcc';
  ctx.beginPath(); ctx.moveTo(sx - HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx, sy + HH * 2 + 4); ctx.lineTo(sx - HW, sy + HH + 4); ctx.fill();
  ctx.fillStyle = '#9da5b5';
  ctx.beginPath(); ctx.moveTo(sx + HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx, sy + HH * 2 + 4); ctx.lineTo(sx + HW, sy + HH + 4); ctx.fill();
  rectPath(ctx, p.x, p.y, 1, 1, zt);
  ctx.fillStyle = '#e9ecf2'; ctx.fill();
  // the trough the train runs in
  const nx = -DY[p.d], ny = DX[p.d], fx = DX[p.d], fy = DY[p.d], cx = p.x + 0.5, cy = p.y + 0.5;
  const Q = (a, b) => [isoX(cx + fx * a + nx * b, cy + fy * a + ny * b), isoY(cx + fx * a + nx * b, cy + fy * a + ny * b, zt)];
  const q = [Q(-0.5, -0.24), Q(0.5, -0.24), Q(0.5, 0.24), Q(-0.5, 0.24)];
  ctx.fillStyle = '#c3c9d6';
  ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
  for (const sgn of [-1, 1]) {
    const a = Q(-0.5, 0.31 * sgn), b = Q(0.5, 0.31 * sgn);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
}
// The canopy over a station tile, drawn after the train so it sits above it.
export function stationRoof(ctx, c, p) {
  const T = styleOf(c), z0 = p.h0 + 0.22, z1 = p.h0 + 2.5;
  const post = (x, y) => {
    const px = isoX(x, y), a = isoY(x, y, z0), b = isoY(x, y, z1);
    ctx.strokeStyle = '#f4f6fa'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(px, a); ctx.lineTo(px, b); ctx.stroke();
  };
  const nx = Math.abs(DY[p.d]), ny = Math.abs(DX[p.d]); // across the track
  const cx = p.x + 0.5, cy = p.y + 0.5;
  post(cx - nx * 0.44, cy - ny * 0.44);
  post(cx + nx * 0.44, cy + ny * 0.44);
  const ax = Math.abs(DX[p.d]), ay = Math.abs(DY[p.d]);
  const P = (a, b, z) => [isoX(cx + ax * a + nx * b, cy + ay * a + ny * b), isoY(cx + ax * a + nx * b, cy + ay * a + ny * b, z)];
  const quad = (pts, col) => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  ctx.globalAlpha = 0.93;
  // two sloping halves with stripes running across the track
  for (let k = 0; k < 4; k++) {
    const a0 = -0.5 + k * 0.25, a1 = a0 + 0.25, col = k % 2 ? '#fff6e6' : T.car;
    quad([P(a0, -0.56, z1), P(a1, -0.56, z1), P(a1, 0, z1 + 0.42), P(a0, 0, z1 + 0.42)], shade(col, -0.1));
    quad([P(a0, 0, z1 + 0.42), P(a1, 0, z1 + 0.42), P(a1, 0.56, z1), P(a0, 0.56, z1)], col);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(40,28,64,0.35)'; ctx.lineWidth = 1;
  const r0 = P(-0.5, 0, z1 + 0.42), r1 = P(0.5, 0, z1 + 0.42);
  ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.stroke();
}

// ---------- trains ----------
export function drawCar(ctx, c, car) {
  const T = styleOf(c);
  // metric frame: f = forward, s = sideways, u = up out of the seats
  let fx = car.tx * 4, fy = car.ty * 4, fz = car.tz * 2;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  const sx0 = car.sx, sy0 = car.sy, sz0 = car.sz || 0;
  const ux = fy * sz0 - fz * sy0, uy = fz * sx0 - fx * sz0, uz = fx * sy0 - fy * sx0;
  const P = (a, b, u) => {
    const mx = car.x * 4 + fx * a + sx0 * b + ux * u, my = car.y * 4 + fy * a + sy0 * b + uy * u;
    const mz = car.z * 2 + 0.7 + fz * a + sz0 * b + uz * u;
    return [isoX(mx / 4, my / 4), isoY(mx / 4, my / 4, mz / 2)];
  };
  const hl = 1.08, hw = 0.64, ht = 0.9;
  const b = [P(-hl, -hw, 0), P(hl, -hw, 0), P(hl, hw, 0), P(-hl, hw, 0)];
  const t = [P(-hl, -hw, ht), P(hl * (car.first ? 0.72 : 1), -hw, ht), P(hl * (car.first ? 0.72 : 1), hw, ht), P(-hl, hw, ht)];
  const quad = (q, col) => {
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
    for (let k = 1; k < q.length; k++) ctx.lineTo(q[k][0], q[k][1]);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  quad(b, 'rgba(30,20,50,0.55)');
  for (let k = 0; k < 4; k++) quad([b[k], b[(k + 1) % 4], t[(k + 1) % 4], t[k]], k === 3 || k === 0 ? T.carDark : shade(T.car, -0.1));
  quad(t, T.car);
  ctx.strokeStyle = 'rgba(30,20,50,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  // seat well and a bright stripe
  quad([P(-hl * 0.72, -hw * 0.7, ht), P(hl * 0.3, -hw * 0.7, ht), P(hl * 0.3, hw * 0.7, ht), P(-hl * 0.72, hw * 0.7, ht)], 'rgba(30,20,50,0.35)');
  quad([P(hl * 0.36, -hw, ht), P(hl * 0.52, -hw, ht), P(hl * 0.52, hw, ht), P(hl * 0.36, hw, ht)], T.carHi);
  if (car.riders > 0) {
    const up = car.fun > 0.25;
    for (let k = 0; k < Math.min(2, car.riders); k++) {
      const side = k ? 0.3 : -0.3, h = P(-0.15, side, ht + 0.5), sh = P(-0.15, side, ht + 0.05);
      if (up) {
        const wav = Math.sin(car.time * 14 + k * 2 + car.j) * 0.12;
        const a1 = P(-0.15 + wav, side - 0.22, ht + 1.05), a2 = P(-0.15 - wav, side + 0.22, ht + 1.05);
        ctx.strokeStyle = k ? '#f1c27d' : '#ffd9b3'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(a1[0], a1[1]); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(h[0], h[1], 2.7, 0, 6.3);
      ctx.fillStyle = k ? '#f1c27d' : '#ffd9b3'; ctx.fill();
      ctx.beginPath(); ctx.arc(h[0], h[1] - 0.6, 2.7, Math.PI, 0);
      ctx.fillStyle = HAIR[(car.j + k) % HAIR.length]; ctx.fill();
    }
  }
}
const HAIR = ['#3b2a1a', '#6b4423', '#d9a441', '#1b1b1b', '#b5451b'];


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
