// Coaster tracks and trains: how every piece, support, station and car is drawn.
import { N, DX, DY, COASTERS, TRACK_COLORS } from './data.js';
import { S, idx } from './world.js';
import { pieceSamples, exitDir, bankAt, corkAngle } from './coaster.js';
import { isoX, isoY, heff, shade, mix } from './iso.js';

let fine = true; // zoomed in far enough for small details to be worth drawing
export function setTrackDetail(on) { fine = on; }

const TAU = Math.PI * 2;
const INK = '#2b2140';
const INKA = 'rgba(40,28,64,0.5)';
const ZO = 0.6; // metres from the centre line of a piece up to its rails
const GAUGE = { mini: 0.54, wood: 0.66, steel: 0.64, launch: 0.64 }; // half the distance between the rails, metres
const SPINE = { mini: -0.14, wood: -0.2, steel: -0.44, launch: -0.62 }; // where the structure under the rails sits

const styles = new Map();
/** Colours of a coaster: its type's own, or the paint the player picked, with the shades made from them. */
function styleOf(c) {
  const key = c.ctype + (c.col | 0);
  let st = styles.get(key);
  if (!st) {
    const T = COASTERS[c.ctype], pal = TRACK_COLORS[c.col | 0];
    st = pal ? { ...T, rail: pal[0], tie: pal[1], car: pal[2] } : { ...T };
    const ink = (col, k) => mix(shade(col, -0.45), INK, k);
    st.railHi = shade(st.rail, 0.5); st.railInk = ink(st.rail, 0.55);
    st.tieHi = shade(st.tie, 0.4); st.tieLo = shade(st.tie, -0.24); st.tieInk = ink(st.tie, 0.6);
    st.supLo = shade(st.sup, -0.17); st.supInk = mix(st.sup, INK, 0.6);
    st.carDark = shade(st.car, -0.22); st.carHi = shade(st.car, 0.4); st.carInk = ink(st.car, 0.6);
    // the car's paint from the darkest face (underneath) to the lightest (on top)
    st.carPal = [shade(st.car, -0.42), shade(st.car, -0.29), shade(st.car, -0.19), shade(st.car, -0.09), st.car];
    st.roofLo = [shade(st.car, -0.14), '#e2d6bf'];
    styles.set(key, st);
  }
  return st;
}

// ---------- track geometry ----------
// Everything about a piece that stays the same from frame to frame is worked out once and kept as a
// list of ready paths ("layers"); drawing a piece is then only painting that list.
// when: 0 = always, 1 = only close up, 2 = only from far away.
const layer = (p, f, s, w, when, cap) => ({ p, f: f || null, s: s || null, w: w || 1, when: when || 0, cap: cap || 'round' });

// A path that knows the box it covers, so a piece can be kept as a ready-made picture (see paintPart).
class BPath extends (typeof Path2D !== 'undefined' ? Path2D : class { moveTo() {} lineTo() {} rect() {} ellipse() {} arc() {} closePath() {} }) {
  constructor() { super(); this.x0 = Infinity; this.y0 = Infinity; this.x1 = -Infinity; this.y1 = -Infinity; }
  b(x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; }
  moveTo(x, y) { this.b(x, y); super.moveTo(x, y); }
  lineTo(x, y) { this.b(x, y); super.lineTo(x, y); }
  rect(x, y, w, h) { this.b(x, y); this.b(x + w, y + h); super.rect(x, y, w, h); }
  ellipse(x, y, rx, ry, ...a) { this.b(x - rx, y - ry); this.b(x + rx, y + ry); super.ellipse(x, y, rx, ry, ...a); }
  arc(x, y, r, ...a) { this.b(x - r, y - r); this.b(x + r, y + r); super.arc(x, y, r, ...a); }
}

const paintAll = (ctx, part) => paint(ctx, part.L);
function paint(ctx, L) {
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (l.when && (l.when === 1) !== fine) continue;
    if (l.f) { ctx.fillStyle = l.f; ctx.fill(l.p); }
    if (l.s) { ctx.strokeStyle = l.s; ctx.lineWidth = l.w; ctx.lineCap = l.cap; ctx.stroke(l.p); }
  }
}

// Track does not move, so once the zoom has settled each part of a piece is painted into a small
// picture of its own at the screen's scale and from then on only copied: a few dozen strokes become one
// copy. Pictures are made a few per frame (the rest are drawn as paths meanwhile), only up to a total
// size, and only when they stay small enough on screen; close up the paths are drawn as before.
const pics = { scale: 0, on: false, budget: 0, made: 0, gen: 1, frame: 0, live: [] };
const PIC_BUDGET = 6e6; // pixels, all pictures together (a busy park seen whole needs 1 to 2 million)
const PIC_PER_FRAME = 24;
const PIC_MAX_SCALE = 3;
// make room by letting go of the pictures that have not been on screen for a while
function dropPic(pc) {
  if (pc.dead) return;
  pics.budget += pc.cv.width * pc.cv.height;
  pc.cv.width = pc.cv.height = 0; pc.dead = true;
}
function freePics() {
  const keep = [];
  for (const pc of pics.live) {
    if (pc.dead) continue;
    if (pc.used < pics.frame - 20 || pc.gen !== pics.gen) dropPic(pc); else keep.push(pc);
  }
  pics.live = keep;
}
/** Called once per frame by the renderer with s = screen pixels per world unit. While the zoom is
 *  changing (settled false) the pictures already made are stretched; once it settles they are made
 *  afresh at the new scale, a few per frame, the old ones standing in until then. */
let px = { a: 1, e: 0, f: 0 };
export function trackPictures(s, settled, where) {
  px = where;
  if (settled && s !== pics.scale) { pics.scale = s; pics.gen++; }
  if (!pics.live.length) pics.budget = PIC_BUDGET;
  pics.on = s <= PIC_MAX_SCALE && pics.scale > 0 && pics.scale <= PIC_MAX_SCALE && typeof document !== 'undefined';
  pics.made = 0; pics.frame++;
}
function partBox(L) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of L) {
    const p = l.p, m = l.s ? l.w / 2 + 1 : 1;
    if (p.x0 - m < x0) x0 = p.x0 - m; if (p.y0 - m < y0) y0 = p.y0 - m;
    if (p.x1 + m > x1) x1 = p.x1 + m; if (p.y1 + m > y1) y1 = p.y1 + m;
  }
  return x1 > x0 ? [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)] : null;
}
function paintPart(ctx, part) {
  if (pics.on) {
    let pc = part.pic;
    const key = pics.gen * 2 + (fine ? 1 : 0);
    if (pc && pc.dead) pc = part.pic = null;
    if (!pc || pc.key !== key) {
      if (pics.made < PIC_PER_FRAME) {
        const box = part.box || (part.box = partBox(part.L));
        const s = pics.scale;
        if (box) {
          const w = Math.ceil((box[2] - box[0]) * s), h = Math.ceil((box[3] - box[1]) * s);
          if (w * h > pics.budget) freePics();
          if (w * h <= pics.budget && w > 0 && h > 0) {
            if (pc) dropPic(pc);
            pics.made++; pics.budget -= w * h;
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const g = cv.getContext('2d');
            g.setTransform(s, 0, 0, s, -box[0] * s, -box[1] * s);
            g.lineJoin = 'round';
            paint(g, part.L);
            pc = part.pic = { key, cv, box, gen: pics.gen, used: pics.frame };
            pics.live.push(pc);
          }
        }
      }
    }
    if (pc) {
      const b = pc.box;
      pc.used = pics.frame;
      if (pics.scale === px.a && pc.gen === pics.gen) {
        // made at this very scale: copy it pixel for pixel
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(pc.cv, Math.round(b[0] * px.a + px.e), Math.round(b[1] * px.a + px.f));
        ctx.setTransform(px.a, 0, 0, px.a, px.e, px.f);
      } else ctx.drawImage(pc.cv, b[0], b[1], b[2] - b[0], b[3] - b[1]);
      return;
    }
  }
  paint(ctx, part.L);
}

const clampN = (v) => Math.max(0, Math.min(N - 1, Math.floor(v)));
const ground = (xt, yt) => heff(idx(clampN(xt), clampN(yt)));
// Paths and scenery may lie under raised track. No support stands on such a tile: the track spans
// it, so guests do not walk through a column and a fountain is not speared by one. The tiles looked
// at are kept with the drawing, so it is rebuilt only when one of them changes.
const busyAt = (i) => (S.path[i] || S.scn[i] ? 1 : 0);
function geoFresh(g) {
  if (!g || g.tv !== S.tv) return false;
  if (g.pv !== S.pv) {
    for (const [i, v] of g.seen) if (busyAt(i) !== v) return false;
    g.pv = S.pv;
  }
  return true;
}

function buildGeo(c, pi) {
  const p = c.pieces[pi], sm = pieceSamples(c, pi), T = styleOf(c), type = c.ctype;
  const seen = new Map();
  const busy = (xt, yt) => { const i = idx(clampN(xt), clampN(yt)), v = busyAt(i); seen.set(i, v); return v; };
  const n = sm.length, last = n - 1, d = p.d, ed = exitDir(p);
  const cork = p.t === 'cork', loop = p.t === 'loop', inv = loop || cork, wide = p.t === 'wl' || p.t === 'wr';
  const station = p.t === 'station', W = GAUGE[type], SP = SPINE[type], wood = type === 'wood';
  const endOpen = !c.closed && pi === c.pieces.length - 1;
  const lnx = -DY[d], lny = DX[d]; // left of the direction of travel, on the map

  // A frame at every sample, in metres: the middle between the rails, the direction to the left rail
  // (leaning with banking, rolling in a corkscrew) and "up" as the riders feel it.
  const F = new Float64Array(n * 9);
  for (let k = 0; k < n; k++) {
    const a = sm[Math.max(0, k - 1)], b = sm[Math.min(last, k + 1)], s = sm[k], u01 = k / last;
    let tx = (b.x - a.x) * 4, ty = (b.y - a.y) * 4, tz = (b.z - a.z) * 2;
    // at the two ends the rails point exactly along the grid, so they meet the next piece without a notch
    if (!inv && (k === 0 || k === last)) { const h = Math.hypot(tx, ty), dd = k ? ed : d; tx = DX[dd] * h; ty = DY[dd] * h; }
    let l = Math.hypot(tx, ty, tz) || 1;
    tx /= l; ty /= l; tz /= l;
    let sx, sy, sz = 0;
    if (loop) { sx = lnx; sy = lny; }
    else if (cork) { const th = corkAngle(u01), co = Math.cos(th); sx = lnx * co; sy = lny * co; sz = Math.sin(th); }
    else {
      const h = Math.hypot(tx, ty) || 1;
      sx = -ty / h; sy = tx / h;
      if (p.bank) { const tan = (bankAt(c, pi, u01) * 2) / 0.52, m = Math.hypot(1, tan); sx /= m; sy /= m; sz = tan / m; }
    }
    let ux = ty * sz - tz * sy, uy = tz * sx - tx * sz, uz = tx * sy - ty * sx;
    l = Math.hypot(ux, uy, uz) || 1;
    const o = k * 9;
    F[o] = s.x * 4; F[o + 1] = s.y * 4; F[o + 2] = s.z * 2 + ZO;
    F[o + 3] = sx; F[o + 4] = sy; F[o + 5] = sz; F[o + 6] = ux / l; F[o + 7] = uy / l; F[o + 8] = uz / l;
  }
  // P(k, b, u): the point b metres to the left of and u metres above the track at sample k (k may lie between two samples)
  let qx = 0, qy = 0, qmx = 0, qmy = 0, qmz = 0;
  const P = (kf, b, u) => {
    let i = Math.floor(kf);
    if (i >= last) i = last - 1;
    if (i < 0) i = 0;
    const t = kf - i, r = 1 - t, o = i * 9, e = o + 9;
    qmx = F[o] * r + F[e] * t + (F[o + 3] * r + F[e + 3] * t) * b + (F[o + 6] * r + F[e + 6] * t) * u;
    qmy = F[o + 1] * r + F[e + 1] * t + (F[o + 4] * r + F[e + 4] * t) * b + (F[o + 7] * r + F[e + 7] * t) * u;
    qmz = F[o + 2] * r + F[e + 2] * t + (F[o + 5] * r + F[e + 5] * t) * b + (F[o + 8] * r + F[e + 8] * t) * u;
    qx = (qmx - qmy) * 8; qy = (qmx + qmy) * 4 - qmz * 8;
  };
  const run = (q, b, u, k0, k1, ox = 0, oy = 0) => {
    P(k0, b, u); q.moveTo(qx + ox, qy + oy);
    for (let k = k0 + 1; k <= k1; k++) { P(k, b, u); q.lineTo(qx + ox, qy + oy); }
  };
  const seg = (q, ka, ba, ua, kb, bb, ub, oy = 0) => { P(ka, ba, ua); q.moveTo(qx, qy + oy); P(kb, bb, ub); q.lineTo(qx, qy + oy); };
  const gx = (xt, yt) => isoX(xt, yt), gy = (xt, yt, z) => isoY(xt, yt, z);

  // --- supports ---
  const supSet = () => ({ dark: new BPath(), light: new BPath(), ink: new BPath(), any: false });
  const flush = (L, s) => {
    if (!s.any) return;
    L.push(layer(s.dark, T.supLo), layer(s.light, T.sup), layer(s.ink, null, T.supInk, 1, 1, 'butt'));
  };
  // a round column from the ground up to zTop (levels), w pixels thick, on a flange foot
  const column = (s, xt, yt, zTop, w, foot) => {
    const g = ground(xt, yt);
    if (zTop - g < 0.3 || busy(xt, yt)) return false;
    const x = gx(xt, yt), y0 = gy(xt, yt, zTop), y1 = gy(xt, yt, g), h = w / 2;
    s.dark.moveTo(x + foot, y1); s.dark.ellipse(x, y1, foot, foot * 0.5, 0, 0, TAU);
    s.dark.rect(x - h, y0, w, y1 - y0);
    s.light.rect(x - h, y0, w * 0.6, y1 - y0);
    s.ink.moveTo(x - h, y0); s.ink.lineTo(x - h, y1); s.ink.moveTo(x + h, y0); s.ink.lineTo(x + h, y1);
    s.ink.moveTo(x - foot, y1); s.ink.ellipse(x, y1, foot, foot * 0.5, 0, Math.PI, 0, true);
    s.any = true;
    return true;
  };
  // a straight girder between two points on screen, lit along its upper left edge
  const beam = (s, x0, y0, x1, y1, w) => {
    let nx = y0 - y1, ny = x1 - x0;
    const l = (w / 2) / (Math.hypot(nx, ny) || 1);
    nx *= l; ny *= l;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    s.dark.moveTo(x0 + nx, y0 + ny); s.dark.lineTo(x1 + nx, y1 + ny); s.dark.lineTo(x1 - nx, y1 - ny); s.dark.lineTo(x0 - nx, y0 - ny); s.dark.closePath();
    s.light.moveTo(x0 + nx, y0 + ny); s.light.lineTo(x1 + nx, y1 + ny); s.light.lineTo(x1 - nx * 0.2, y1 - ny * 0.2); s.light.lineTo(x0 - nx * 0.2, y0 - ny * 0.2); s.light.closePath();
    s.ink.moveTo(x0 + nx, y0 + ny); s.ink.lineTo(x1 + nx, y1 + ny); s.ink.moveTo(x0 - nx, y0 - ny); s.ink.lineTo(x1 - nx, y1 - ny);
    s.any = true;
  };
  const foot = (s, xt, yt, r) => {
    const g = ground(xt, yt), x = gx(xt, yt), y = gy(xt, yt, g);
    s.dark.moveTo(x + r, y); s.dark.ellipse(x, y, r, r * 0.5, 0, 0, TAU);
    s.ink.moveTo(x - r, y); s.ink.ellipse(x, y, r, r * 0.5, 0, Math.PI, 0, true);
    return g;
  };
  // the usual support under sample k: steel stands beside the track and reaches in with an arm, the others stand under it
  const turnSide = p.t === 'l' || p.t === 'wl' ? -1 : p.t === 'r' || p.t === 'wr' ? 1 : 0;
  const post = (s, k) => {
    const o = k * 9;
    if (type === 'steel') {
      let hx = F[o + 3], hy = F[o + 4];
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl; hy /= hl;
      const side = turnSide || (hx + hy > 0 ? 1 : -1);
      P(k, 0, SP - 0.1);
      const ax = qx, ay = qy, zt = qmz / 2;
      const xt = (qmx + hx * side * 1.3) / 4, yt = (qmy + hy * side * 1.3) / 4;
      if (column(s, xt, yt, zt + 0.14, 5.2, 5.8)) beam(s, gx(xt, yt), gy(xt, yt, zt), ax, ay, 3.6);
    } else {
      P(k, 0, SP - (type === 'mini' ? 0 : 0.12));
      const w = type === 'mini' ? 2.6 : 3.6;
      if (column(s, qmx / 4, qmy / 4, qmz / 2, w, w + 1.2) && type === 'launch') {
        // a small collar where the truss sits on the column
        s.dark.rect(qx - 3.4, qy - 1, 6.8, 2.6);
      }
    }
  };
  // a wooden trestle: bents (two posts with cross beams) every half tile, tied together along the track
  const BW = 0.84;
  const bentAt = (k) => {
    const o = k * 9, bx = F[o + 3] * BW, by = F[o + 4] * BW;
    const lx = (F[o] + bx) / 4, ly = (F[o + 1] + by) / 4, rx = (F[o] - bx) / 4, ry = (F[o + 1] - by) / 4;
    const gl = ground(lx, ly), gr = ground(rx, ry);
    return { lx, ly, rx, ry, top: F[o + 2] / 2 - 0.17, gl, gr, g: Math.max(gl, gr), busy: busy(lx, ly) || busy(rx, ry) };
  };
  const trestle = (L, k0, k1, own) => {
    const posts = new BPath(), braces = new BPath();
    let any = false;
    const ln = (q, x0, y0, z0, x1, y1, z1) => { q.moveTo(gx(x0, y0), gy(x0, y0, z0)); q.lineTo(gx(x1, y1), gy(x1, y1, z1)); };
    for (let k = k0 - (k0 % 4 ? k0 % 4 - 4 : 0); k < k1 || (k === last && k1 === last && endOpen); k += 4) {
      if (!own(k)) continue;
      const b = bentAt(k);
      if (b.top - b.g < 0.3 || b.busy) continue;
      any = true;
      ln(posts, b.lx, b.ly, b.top, b.lx, b.ly, b.gl); ln(posts, b.rx, b.ry, b.top, b.rx, b.ry, b.gr);
      let z0 = b.g, flip = ((k >> 2) + pi) & 1;
      for (let z = Math.floor(b.g) + 1; ; z++) {
        const z1 = Math.min(z, b.top), end = z >= b.top - 0.35;
        if (z1 - z0 > 0.45) { if (flip) ln(braces, b.lx, b.ly, z0, b.rx, b.ry, end ? b.top : z1); else ln(braces, b.rx, b.ry, z0, b.lx, b.ly, end ? b.top : z1); flip = !flip; }
        if (end) break;
        ln(posts, b.lx, b.ly, z, b.rx, b.ry, z);
        z0 = z;
      }
      // ribbon boards to the next bent at every level both of them reach
      if (k + 4 > last) continue;
      const e = bentAt(k + 4), g2 = Math.max(b.g, e.g), top = Math.min(b.top, e.top);
      if (e.busy) continue;
      for (let z = Math.floor(g2) + 1; z < top - 0.35; z++) { ln(braces, b.lx, b.ly, z, e.lx, e.ly, z); ln(braces, b.rx, b.ry, z, e.rx, e.ry, z); }
    }
    if (any) L.push(layer(braces, null, T.supLo, 1.3, 1, 'butt'), layer(posts, null, T.sup, 1.9, 0, 'butt'));
  };

  // --- one stretch of the piece (all of it, or the part on one tile) ---
  const mkPart = (k0, k1, back, front) => {
    const L = [];
    const own = (k) => k >= k0 && (k < k1 || (k === last && k1 === last && endOpen));
    const add = (q, f, s, w, when, cap) => L.push(layer(q, f, s, w, when, cap));
    const rails = (ox, oy) => { const q = new BPath(); run(q, W, 0, k0, k1, ox, oy); run(q, -W, 0, k0, k1, ox, oy); return q; };
    // soft shadow on the ground under raised track
    if (!station) {
      const q = new BPath();
      let pen = false, any = false;
      for (let k = k0; k <= k1; k++) {
        const s = sm[k], g = ground(s.x, s.y);
        if (s.z - g <= 0.45) { pen = false; continue; }
        const x = gx(s.x, s.y), y = gy(s.x, s.y, g + 0.02);
        if (pen) { q.lineTo(x, y); any = true; } else { q.moveTo(x, y); pen = true; }
      }
      if (any) add(q, null, 'rgba(20,35,45,0.15)', wood ? 12 : 9, 1, 'butt'); // flat ends: the parts of a piece meet without darker overlaps
    }
    if (back) back(L, k0, k1);
    if (!station && !inv) {
      if (wood) trestle(L, k0, k1, own);
      else {
        const s = supSet(), mid = last >> 1;
        for (const k of wide ? [2, mid, last - 2] : [mid]) if (k >= k0 && k < k1) post(s, k);
        flush(L, s);
      }
    }

    // what lies between the rails
    if (wood) {
      const bw = 0.96, bu = -0.16;
      const bed = new BPath(), side = new BPath(), planks = new BPath();
      run(bed, bw, bu, k0, k1);
      for (let k = k1; k >= k0; k--) { P(k, -bw, bu); bed.lineTo(qx, qy); }
      bed.closePath();
      run(side, bw, bu, k0, k1, 0, 2.2); run(side, -bw, bu, k0, k1, 0, 2.2);
      for (let k = k0; k <= k1; k++) if (own(k)) seg(planks, k, bw, bu, k, -bw, bu);
      add(side, null, T.tieInk, 2.6, 0, 'butt');
      add(bed, T.tieLo);
      add(planks, null, T.tie, 2.5, 0, 'butt');
    } else if (type === 'mini') {
      const ink = rails(0, 0), ties = new BPath();
      for (let k = k0; k <= k1; k += 1) if (k % 2 === 0 && own(k)) { seg(ties, k, W + 0.1, SP, k, -W - 0.1, SP); seg(ink, k, W + 0.1, SP, k, -W - 0.1, SP); }
      add(ink, null, T.railInk, 4.2, 0, 'butt');
      add(ties, null, T.tie, 2.3);
    } else if (type === 'steel') {
      const spine = new BPath(), ties = new BPath(), hi = new BPath();
      run(spine, 0, SP, k0, k1); run(hi, 0, SP, k0, k1, -0.4, -1.3);
      for (let k = k0; k <= k1; k++) if (k % 2 === 0 && own(k)) { P(k, W, 0); ties.moveTo(qx, qy); P(k, 0, SP); ties.lineTo(qx, qy); P(k, -W, 0); ties.lineTo(qx, qy); }
      add(spine, null, T.tieInk, 6, 0, 'butt');
      add(ties, null, T.tieLo, 2);
      add(spine, null, T.tie, 4.2);
      add(hi, null, T.tieHi, 1.3, 1);
    } else {
      // a truss of three tubes laced together in a zigzag
      const tube = new BPath(), lace = new BPath(), hi = new BPath();
      run(tube, 0, SP, k0, k1); run(hi, 0, SP, k0, k1, -0.3, -0.8);
      for (const b of [W, -W]) {
        P(k0, b * (k0 & 1 ? 0 : 1), k0 & 1 ? SP : 0); lace.moveTo(qx, qy);
        for (let k = k0 + 1; k <= k1; k++) { P(k, b * (k & 1 ? 0 : 1), k & 1 ? SP : 0); lace.lineTo(qx, qy); }
      }
      add(lace, null, T.tieLo, 1.5);
      add(tube, null, T.tieInk, 4.2, 0, 'butt');
      add(tube, null, T.tie, 2.8);
      add(hi, null, T.tieHi, 0.9, 1);
    }

    // lift chain, brakes, boosters and the launch
    const cu = wood ? -0.06 : -0.1;
    if (p.chain) {
      const trough = new BPath(), links = new BPath();
      run(trough, 0, cu, k0, k1);
      for (let k = k0; k < k1; k++) for (const j of [0.08, 0.58]) seg(links, k + j, 0, cu, k + j + 0.3, 0, cu);
      add(trough, null, '#3a3e4f', 3.6, 0, 'butt');
      add(links, null, '#dfe4ec', 1.5, 1, 'butt');
      if (!wood) {
        // a stair with a handrail on the far side of the lift
        const sd = F[3] + F[4] > 0 ? -1 : 1, steps = new BPath(), rail = new BPath();
        const b0 = sd * (W + 0.2), b1 = sd * (W + 0.62);
        for (let k = k0; k < k1; k++) { seg(steps, k + 0.25, b0, -0.1, k + 0.25, b1, -0.1); seg(steps, k + 0.75, b0, -0.1, k + 0.75, b1, -0.1); }
        run(rail, b1, 0.95, k0, k1);
        for (let k = k0; k <= k1; k++) if (k % 2 === 0 && own(k)) seg(rail, k, b1, -0.1, k, b1, 0.95);
        add(steps, null, '#c9cfdb', 2.2, 1, 'butt');
        add(rail, null, '#646b82', 1.1, 1, 'butt');
      }
    } else if (p.t === 'brake' || p.t === 'boost' || (type === 'launch' && (pi === 3 || pi === 4) && !inv && c.pieces[0].t === 'station')) {
      const house = new BPath();
      run(house, 0, cu, k0, k1);
      add(house, null, '#3a3e4f', 6.6, 0, 'butt');
      if (p.t === 'brake') {
        // pairs of red brake fins
        const fins = new BPath(), hi = new BPath(), m = last / 8;
        for (const [a0, a1] of [[0.5, 2.5], [3, 5], [5.5, 7.5]]) for (const b of [0.19, -0.19]) {
          seg(fins, a0 * m, b, 0.1, a1 * m, b, 0.1); seg(hi, a0 * m, b, 0.1, a1 * m, b, 0.1, -1);
        }
        add(fins, null, '#f0353f', 2.4, 0, 'butt');
        add(hi, null, '#ffb4a6', 0.8, 1, 'butt');
      } else if (p.t === 'boost') {
        // green arrows pointing the way the train is pushed
        const arrows = new BPath(), m = last / 8;
        for (const tip of [2.1, 4.7, 7.3]) { P((tip - 1.3) * m, 0.44, 0.06); arrows.moveTo(qx, qy); P(tip * m, 0, 0.06); arrows.lineTo(qx, qy); P((tip - 1.3) * m, -0.44, 0.06); arrows.lineTo(qx, qy); }
        add(arrows, null, '#16e6a6', 2.2);
      } else {
        // the launch: a row of glowing blocks down the middle
        const glow = new BPath(), blocks = new BPath();
        run(glow, 0, 0.02, k0, k1);
        for (let k = k0; k < k1; k++) seg(blocks, k + 0.18, 0, 0.04, k + 0.82, 0, 0.04);
        add(glow, null, 'rgba(120,255,235,0.4)', 9, 1, 'butt');
        add(blocks, null, '#e6fffa', 2.8, 0, 'butt');
      }
    }

    // the rails: a dark outline, the colour, and a thin highlight
    const r = rails(0, 0);
    if (type !== 'mini') add(r, null, T.railInk, wood ? 4.6 : 4.8, 0, 'butt');
    add(r, null, T.rail, type === 'mini' ? 2.6 : wood ? 3 : 3.2);
    add(rails(-0.5, -0.8), null, T.railHi, type === 'mini' ? 0.9 : 1.1, 1);

    if (wood && !station) {
      // handrails along the side that is further from the viewer
      const hr = new BPath();
      let any = false;
      for (const sd of [1, -1]) {
        let pen = false;
        for (let k = k0; k <= k1; k++) {
          const o = k * 9;
          if (sd * (F[o + 3] + F[o + 4]) > 0.4) { pen = false; continue; }
          P(k, sd * 1.02, 0.7);
          if (pen) { hr.lineTo(qx, qy); any = true; } else { hr.moveTo(qx, qy); pen = true; }
          if (k % 2 === 0 && own(k)) { const x = qx, y = qy; P(k, sd * 1.02, -0.16); hr.lineTo(qx, qy); hr.moveTo(x, y); }
        }
      }
      if (any) add(hr, null, T.sup, 1.2, 1, 'butt');
    }
    if (front) front(L, k0, k1);
    return L;
  };

  const out = { parts: null, split: false, roof: null, tv: S.tv, pv: S.pv, seen };
  if (loop) {
    // A-frames at both ends hold the loop: legs on each side of the track up to its widest point,
    // and a second pair reaching further up. The legs nearer to the viewer are drawn over the track.
    const far = supSet(), near = supSet(), nearSide = lnx + lny > 0 ? 1 : -1;
    for (const [ka, kb] of [[Math.round(last * 0.32), Math.round(last * 0.41)], [Math.round(last * 0.68), Math.round(last * 0.59)]]) {
      P(ka, 0, SP - 0.15);
      const mx = qmx / 4, my = qmy / 4, ax = qx, ay = qy;
      P(kb, 0, SP - 0.15);
      const bx = qx, by = qy;
      for (const sd of [1, -1]) {
        const s = sd === nearSide ? near : far, fx = mx + lnx * sd * 0.42, fy = my + lny * sd * 0.42;
        const g = foot(s, fx, fy, 5.6), x = gx(fx, fy), y = gy(fx, fy, g);
        beam(s, x, y, bx, by, 3.4); beam(s, x, y, ax, ay, 4.4);
      }
    }
    const h = last >> 1, firstNear = (lnx + lny) * -0.15 * Math.sin((TAU * (h >> 1)) / last) > 0;
    const A = mkPart(0, h, firstNear ? null : (L) => flush(L, far), firstNear ? (L) => flush(L, near) : null);
    const B = mkPart(h, last, firstNear ? (L) => flush(L, far) : null, firstNear ? null : (L) => flush(L, near));
    out.parts = firstNear ? [{ cell: -1, L: B }, { cell: -1, L: A }] : [{ cell: -1, L: A }, { cell: -1, L: B }];
  } else if (wide || cork) {
    // which stretch of the piece lies on which tile, so each tile draws its own part in the right order
    const ranges = new Map();
    for (let k = 0; k < last; k++) {
      const ci = idx(clampN((sm[k].x + sm[k + 1].x) / 2), clampN((sm[k].y + sm[k + 1].y) / 2));
      const r = ranges.get(ci);
      if (r) r[1] = k + 1; else ranges.set(ci, [k, k + 1]);
    }
    let frame = null;
    if (cork) {
      // a column on each side where the track rides on its edge, and a beam between their tops that the crown hangs from
      const ka = Math.round(last / 3), kb = last - ka, zTop = p.h0 + 3.05, cols = [];
      for (const [k, sd] of [[ka, 1], [kb, -1]]) {
        const s = sm[k], xt = s.x + lnx * sd * 0.17, yt = s.y + lny * sd * 0.17;
        cols.push({ k, sd, xt, yt, x: gx(xt, yt), y: gy(xt, yt, zTop) });
      }
      frame = (k0, k1, isNear) => (L) => {
        const s = supSet();
        for (const q of cols) {
          if (q.k < k0 || q.k >= k1 || (q.sd * (lnx + lny) > 0) !== isNear) continue;
          if (!column(s, q.xt, q.yt, zTop, 4.6, 5.6)) continue;
          P(q.k, 0, SP - 0.1);
          beam(s, q.x, qy, qx, qy, 3.2);
        }
        // the beam goes with the tile nearer to the viewer, where it is drawn last
        if (isNear && (DX[d] + DY[d] > 0 ? k1 === last : k0 === 0)) {
          beam(s, cols[0].x, cols[0].y, cols[1].x, cols[1].y, 3.6);
          P(last / 2, 0, SP);
          beam(s, qx, (cols[0].y + cols[1].y) / 2, qx, qy, 2.6);
        }
        flush(L, s);
      };
    }
    out.parts = [];
    for (const [cell, r] of ranges) out.parts.push({ cell, L: mkPart(r[0], r[1], frame && frame(r[0], r[1], false), frame && frame(r[0], r[1], true)) });
    out.parts.sort((a, b) => (a.cell % N) + ((a.cell / N) | 0) - (b.cell % N) - ((b.cell / N) | 0));
    out.split = true;
  } else if (station) {
    const base = [];
    out.roof = [];
    stationParts(c, p, pi, T, base, out.roof);
    out.parts = [{ cell: -1, L: base.concat(mkPart(0, last)) }];
  } else out.parts = [{ cell: -1, L: mkPart(0, last) }];
  return out;
}

/** Draws one piece, or only the part of it that lies on tile `cell`. */
export function drawPiece(ctx, c, pi, alpha, cell) {
  const p = c.pieces[pi];
  let g = p.geo;
  if (!geoFresh(g)) g = p.geo = buildGeo(c, pi);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  const parts = g.parts, one = g.split && cell !== undefined;
  for (let i = 0; i < parts.length; i++) if (!one || parts[i].cell === cell) (c.id ? paintPart : paintAll)(ctx, parts[i]);
  ctx.lineCap = 'round';
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

// A station tile. `base` is drawn before the train: the platform, the trough the train runs in and what
// stands behind it. `roof` is drawn after the train: the gates in front of it and the canopy.
function stationParts(c, p, pi, T, base, roof) {
  const z = p.h0, zt = z + 0.22, z1 = z + 2.5, zr = z1 + 0.62, zf = z1 - 0.2;
  const cx = p.x + 0.5, cy = p.y + 0.5, ax = Math.abs(DX[p.d]), ay = Math.abs(DY[p.d]), nx = ay, ny = ax;
  // a runs along the track and b across it; both grow towards the viewer
  const X = (a, b) => isoX(cx + ax * a + nx * b, cy + ay * a + ny * b);
  const Y = (a, b, zz) => isoY(cx + ax * a + nx * b, cy + ay * a + ny * b, zz);
  const poly = (q, ...v) => { q.moveTo(X(v[0], v[1]), Y(v[0], v[1], v[2])); for (let i = 3; i < v.length; i += 3) q.lineTo(X(v[i], v[i + 1]), Y(v[i], v[i + 1], v[i + 2])); q.closePath(); return q; };
  const line = (q, ...v) => { q.moveTo(X(v[0], v[1]), Y(v[0], v[1], v[2])); for (let i = 3; i < v.length; i += 3) q.lineTo(X(v[i], v[i + 1]), Y(v[i], v[i + 1], v[i + 2])); return q; };
  const g = heff(idx(p.x, p.y)), mid = '#b9bfcc', dark = '#9da5b5';
  const lo = p.d < 2 ? pi === 0 : pi === 2, hi = p.d < 2 ? pi === 2 : pi === 0; // the ends of the station
  // platform
  base.push(layer(poly(new BPath(), -0.5, 0.5, zt, 0.5, 0.5, zt, 0.5, 0.5, g, -0.5, 0.5, g), ax ? mid : dark));
  base.push(layer(poly(new BPath(), 0.5, -0.5, zt, 0.5, 0.5, zt, 0.5, 0.5, g, 0.5, -0.5, g), ax ? dark : mid));
  base.push(layer(poly(new BPath(), -0.5, -0.5, zt, 0.5, -0.5, zt, 0.5, 0.5, zt, -0.5, 0.5, zt), '#e9ecf2'));
  base.push(layer(poly(new BPath(), -0.5, -0.29, zt, 0.5, -0.29, zt, 0.5, 0.29, zt, -0.5, 0.29, zt), '#a9b0c0'));
  base.push(layer(line(new BPath(), -0.5, -0.28, zt, 0.5, -0.28, zt), null, '#858da2', 1.8, 1, 'butt'));
  const safe = new BPath();
  line(safe, -0.5, 0.35, zt, 0.5, 0.35, zt); line(safe, -0.5, -0.35, zt, 0.5, -0.35, zt);
  base.push(layer(safe, null, '#ffd23f', 2.2, 0, 'butt'));
  const edge = line(new BPath(), -0.5, 0.5, zt, 0.5, 0.5, zt, 0.5, -0.5, zt);
  line(edge, -0.5, 0.5, g, 0.5, 0.5, g, 0.5, -0.5, g);
  base.push(layer(edge, null, INKA, 1, 1, 'butt'));
  // a fence along the back and the back post of the canopy
  const fence = new BPath(), fb = -0.46;
  for (const a of hi ? [-0.5, -1 / 6, 1 / 6, 0.5] : [-0.5, -1 / 6, 1 / 6]) line(fence, a, fb, zt, a, fb, zt + 0.56);
  line(fence, -0.5, fb, zt + 0.56, 0.5, fb, zt + 0.56); line(fence, -0.5, fb, zt + 0.3, 0.5, fb, zt + 0.3);
  const backPost = line(new BPath(), 0, -0.5, zt, 0, -0.5, z1);
  base.push(layer(fence, null, '#7d8499', 2.8, 1, 'butt'), layer(fence, null, '#f4f6fa', 1.5, 0, 'butt'));
  base.push(layer(backPost, null, '#7d8499', 4, 1, 'butt'), layer(backPost, null, '#f4f6fa', 2.6, 0, 'butt'));

  // gates at the front of the platform, and the front post
  const posts = new BPath(), bars = new BPath(), gb = 0.46;
  for (const a of [-0.38, -0.12, 0.12, 0.38]) line(posts, a, gb, zt, a, gb, zt + 0.5);
  line(bars, -0.38, gb, zt + 0.4, -0.12, gb, zt + 0.4); line(bars, 0.12, gb, zt + 0.4, 0.38, gb, zt + 0.4);
  const frontPost = line(new BPath(), 0, 0.5, zt, 0, 0.5, z1);
  roof.push(layer(posts, null, '#7d8499', 2.9, 1, 'butt'), layer(bars, null, T.carInk, 3.4, 1, 'butt'));
  roof.push(layer(posts, null, '#f4f6fa', 1.6, 0, 'butt'), layer(bars, null, T.car, 2));
  roof.push(layer(frontPost, null, '#7d8499', 4, 1, 'butt'), layer(frontPost, null, '#f4f6fa', 2.6, 0, 'butt'));
  // the canopy: two sloping halves in stripes of the train's colour, a fascia with bulbs along the front
  const a0 = lo ? -0.57 : -0.5, a1 = hi ? 0.57 : 0.5, rb = 0.6;
  const half = [[new BPath(), new BPath()], [new BPath(), new BPath()]];
  for (let k = 0; k < 4; k++) {
    const s0 = k ? -0.5 + k * 0.25 : a0, s1 = k < 3 ? -0.25 + k * 0.25 : a1;
    poly(half[0][k & 1], s0, -rb, z1, s1, -rb, z1, s1, 0, zr, s0, 0, zr);
    poly(half[1][k & 1], s0, 0, zr, s1, 0, zr, s1, rb, z1, s0, rb, z1);
  }
  const cream = '#fff6e6';
  roof.push(layer(half[0][0], T.car), layer(half[0][1], cream));
  roof.push(layer(half[1][0], shade(T.car, ax ? -0.1 : -0.2)), layer(half[1][1], shade(cream, ax ? -0.07 : -0.14)));
  roof.push(layer(poly(new BPath(), a0, rb, z1, a1, rb, z1, a1, rb, zf, a0, rb, zf), shade(T.car, ax ? -0.24 : -0.36)));
  const ink = new BPath();
  line(ink, a0, rb, zf, a1, rb, zf); line(ink, a0, rb, z1, a1, rb, z1); line(ink, a0, -rb, z1, a1, -rb, z1);
  if (lo) line(ink, a0, rb, zf, a0, rb, z1, a0, 0, zr, a0, -rb, z1);
  if (hi) {
    // the open end that faces the viewer is closed with a gable and a round badge
    const gable = poly(new BPath(), a1, -rb, zf, a1, -rb, z1, a1, 0, zr, a1, rb, z1, a1, rb, zf);
    roof.push(layer(gable, shade(cream, ax ? -0.16 : -0.08)));
    const badge = new BPath();
    badge.arc(X(a1, 0), Y(a1, 0, z1 + 0.14), 3.1, 0, TAU);
    roof.push(layer(badge, T.car, INKA, 1));
    line(ink, a1, rb, zf, a1, rb, z1, a1, 0, zr, a1, -rb, z1, a1, -rb, zf, a1, rb, zf);
  }
  roof.push(layer(ink, null, INKA, 1, 1, 'butt'));
  const ridge = line(new BPath(), a0, 0, zr, a1, 0, zr);
  roof.push(layer(ridge, null, T.carInk, 3.2, 1, 'butt'), layer(ridge, null, cream, 1.8, 0, 'butt'));
  const bulbs = new BPath();
  for (let k = 0; k < 4; k++) { const a = -0.375 + k * 0.25, x = X(a, rb), y = Y(a, rb, z1 - 0.1); bulbs.moveTo(x + 1.3, y); bulbs.arc(x, y, 1.3, 0, TAU); }
  roof.push(layer(bulbs, '#fff3b0', null, 1, 1));
  if (lo || hi) {
    // a pennant on each end of the ridge
    const a = lo ? a0 + 0.08 : a1 - 0.08, x = X(a, 0), y = Y(a, 0, zr + 0.85);
    const mast = line(new BPath(), a, 0, zr, a, 0, zr + 0.85), flag = new BPath();
    flag.moveTo(x, y); flag.lineTo(x + 8, y + 2.6); flag.lineTo(x, y + 5.2); flag.closePath();
    roof.push(layer(mast, null, '#5d6379', 1.2, 1, 'butt'), layer(flag, T.car, INKA, 1, 1));
  }
}
// The gates and the canopy of a station tile, drawn after the train so they sit in front of and above it.
export function stationRoof(ctx, c, p) {
  let g = p.geo;
  if (!geoFresh(g)) g = p.geo = buildGeo(c, c.pieces.indexOf(p));
  if (!g.roof) return;
  ctx.lineJoin = 'round';
  paintPart(ctx, g.roofPart || (g.roofPart = { L: g.roof }));
  ctx.lineCap = 'round';
}

// ---------- trains ----------
// Where the car is on screen and its three axes (forward, left, up) in pixels per metre.
let OX = 0, OY = 0, FX = 0, FY = 0, SX = 0, SY = 0, UX = 0, UY = 0;
const mv = (ctx, a, b, u) => ctx.moveTo(OX + a * FX + b * SX + u * UX, OY + a * FY + b * SY + u * UY);
const ln = (ctx, a, b, u) => ctx.lineTo(OX + a * FX + b * SX + u * UX, OY + a * FY + b * SY + u * UY);
const quad = (ctx, a0, b0, u0, a1, b1, u1, a2, b2, u2, a3, b3, u3) => { mv(ctx, a0, b0, u0); ln(ctx, a1, b1, u1); ln(ctx, a2, b2, u2); ln(ctx, a3, b3, u3); ctx.closePath(); };

// Car bodies as side views (forward, up) in metres, listed along the bottom to the front, back over the
// top and down the rear. `taper` narrows single corners (the pointed nose of the launch train).
const CARS = {
  mini: {
    hw: 0.56, top: 0.8, seat: -0.2, back: 0.4, well: [-0.78, 0.7], wellF: [-0.78, 0.36],
    mid: [-0.84, 0.2, 0.84, 0.2, 1, 0.36, 1, 0.64, 0.86, 0.8, -0.86, 0.8, -1, 0.64, -1, 0.36],
    front: [-0.84, 0.2, 0.9, 0.2, 1.12, 0.36, 1.14, 0.6, 0.98, 0.82, 0.5, 0.9, -0.86, 0.8, -1, 0.64, -1, 0.36],
    rear: [-0.84, 0.2, 0.84, 0.2, 1, 0.36, 1, 0.64, 0.86, 0.8, -0.8, 0.86, -1.04, 0.66, -1.04, 0.36],
    chassis: [-0.8, 0.02, 0.8, 0.02, 0.8, 0.22, -0.8, 0.22], cw: 0.4,
    wheels: [0.6, 0.5, 0.08, 1.7], stripe: [0.3, 0.44], seatCol: '#fff1cf', seatLo: '#d9c49a', bar: 0,
  },
  wood: {
    hw: 0.68, top: 0.82, seat: -0.2, back: 0.52, well: [-0.86, 0.78], wellF: [-0.86, 0.42],
    mid: [-1.04, 0.2, 1.04, 0.2, 1.08, 0.32, 1.08, 0.7, 0.98, 0.82, -1.08, 0.82, -1.08, 0.32],
    front: [-1.04, 0.2, 0.96, 0.2, 1.12, 0.34, 1.14, 0.56, 1.02, 0.74, 0.7, 0.84, -1.08, 0.82, -1.08, 0.32],
    rear: [-1, 0.2, 1.04, 0.2, 1.08, 0.32, 1.08, 0.7, 0.98, 0.82, -0.94, 0.92, -1.12, 0.72, -1.12, 0.32],
    chassis: [-0.92, 0.02, 0.92, 0.02, 0.92, 0.22, -0.92, 0.22], cw: 0.5,
    wheels: [0.68, 0.62, 0.08, 1.9], stripe: [0.46, 0.6], seatCol: '#f7e6c4', seatLo: '#c9ad7c', bar: 1,
  },
  steel: {
    hw: 0.54, top: 0.62, seat: -0.2, back: 0.68, well: [-0.82, 0.7], wellF: [-0.82, 0.3],
    mid: [-1, 0.2, 1, 0.2, 1.08, 0.32, 1.04, 0.54, 0.92, 0.62, -0.94, 0.62, -1.08, 0.52, -1.08, 0.32],
    front: [-1, 0.2, 0.98, 0.2, 1.17, 0.27, 1.14, 0.4, 0.42, 0.72, -0.94, 0.62, -1.08, 0.52, -1.08, 0.32],
    rear: [-1, 0.2, 1, 0.2, 1.08, 0.32, 1.04, 0.54, 0.92, 0.62, -0.7, 0.64, -1.14, 0.42, -1.12, 0.3],
    chassis: [-0.9, 0.04, 0.9, 0.04, 0.9, 0.22, -0.9, 0.22], cw: 0.42,
    wheels: [0.7, 0.76, 0.1, 2], bogie: 1, stripe: [0.42, 0.5], seatCol: '#4a4f66', seatLo: '#353a4e', bar: 2, barCol: '#ffb703',
  },
  launch: {
    hw: 0.56, top: 0.52, seat: -0.24, back: 0.6, well: [-0.84, 0.66], wellF: [-0.84, 0.2],
    mid: [-1.08, 0.18, 1.08, 0.18, 1.14, 0.3, 1.08, 0.46, 0.96, 0.52, -0.98, 0.52, -1.14, 0.44, -1.14, 0.3],
    front: [-1.08, 0.18, 1, 0.18, 1.24, 0.23, 1.22, 0.32, 0.3, 0.62, -0.98, 0.52, -1.14, 0.44, -1.14, 0.3],
    taper: [1, 1, 0.42, 0.42, 1, 1, 1, 1],
    rear: [-1.08, 0.18, 1.08, 0.18, 1.14, 0.3, 1.08, 0.46, 0.96, 0.52, -0.9, 0.56, -1.18, 0.4, -1.16, 0.28],
    chassis: [-0.96, 0.04, 0.96, 0.04, 0.96, 0.2, -0.96, 0.2], cw: 0.42,
    wheels: [0.74, 0.74, 0.1, 1.8], bogie: 1, stripe: [0.3, 0.38], seatCol: '#3a3f55', seatLo: '#2b2f42', bar: 2, barCol: '#f4f6fa', fin: 1,
  },
};
const UNDER = ['#1f1b2c', '#2a2536', '#2a2536', '#343044', '#3d394f'];
const HAIR = ['#3b2a1a', '#6b4423', '#d9a441', '#1b1b1b', '#b5451b'];
const SKIN = ['#ffd9b3', '#f1c27d', '#c68a5b'];
const SHIRT = ['#ef476f', '#3b8ed0', '#06d6a0', '#ffd23f', '#9b5de5', '#f78c1f', '#f4f6fa'];

const PXY = new Float64Array(96); // screen corners of the body being drawn: left side, then right side
const VIS = new Int8Array(24), TONE = new Int8Array(24);
const tone = (v) => (v > 0.36 ? 4 : v > 0.1 ? 3 : v > -0.1 ? 2 : v > -0.36 ? 1 : 0);

// A body with the side view `pr`, hw metres wide to each side: only the faces that look at the viewer,
// each in the shade its direction gives it, with one dark outline round the lot.
function prism(ctx, pr, taper, hw, pal, ink, vf, vs, vu, lf, ls, lu) {
  const n = pr.length >> 1;
  for (let i = 0; i < n; i++) {
    const a = pr[i * 2], u = pr[i * 2 + 1], w = taper ? taper[i] * hw : hw;
    const x = OX + a * FX + u * UX, y = OY + a * FY + u * UY;
    PXY[i * 4] = x + w * SX; PXY[i * 4 + 1] = y + w * SY; PXY[i * 4 + 2] = x - w * SX; PXY[i * 4 + 3] = y - w * SY;
  }
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, da = pr[j * 2] - pr[i * 2], du = pr[j * 2 + 1] - pr[i * 2 + 1];
    if (du * vf - da * vu <= 0) continue;
    VIS[m] = i; TONE[m++] = tone((du * lf - da * lu) / Math.hypot(da, du));
  }
  const so = vs > 0 ? 0 : 2; // which side is seen
  const side = () => { ctx.moveTo(PXY[so], PXY[so + 1]); for (let i = 1; i < n; i++) ctx.lineTo(PXY[i * 4 + so], PXY[i * 4 + so + 1]); ctx.closePath(); };
  const face = (i) => {
    const j = ((i + 1) % n) * 4, k = i * 4;
    ctx.moveTo(PXY[k], PXY[k + 1]); ctx.lineTo(PXY[j], PXY[j + 1]); ctx.lineTo(PXY[j + 2], PXY[j + 3]); ctx.lineTo(PXY[k + 2], PXY[k + 3]); ctx.closePath();
  };
  if (ink) {
    ctx.beginPath(); side();
    for (let q = 0; q < m; q++) face(VIS[q]);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.stroke();
  }
  // faces in the same shade are filled together
  for (let t = 0; t < 5; t++) {
    let any = false;
    for (let q = 0; q < m; q++) if (TONE[q] === t) { if (!any) { ctx.beginPath(); any = true; } face(VIS[q]); }
    if (any) { ctx.fillStyle = pal[t]; ctx.fill(); }
  }
  ctx.beginPath(); side();
  ctx.fillStyle = pal[tone(vs > 0 ? ls : -ls)]; ctx.fill();
}

function drawRider(ctx, car, M, k, vf) {
  const b = k ? 0.28 : -0.28, a = M.seat, t = M.top, id = car.j * 2 + k;
  const skin = SKIN[id % 3];
  ctx.strokeStyle = SHIRT[(id * 3 + car.n) % 7]; ctx.lineWidth = 3.6;
  ctx.beginPath(); mv(ctx, a, b - 0.13, t + 0.12); ln(ctx, a, b + 0.13, t + 0.12); ctx.stroke();
  if (car.fun > 0.25) {
    const wav = Math.sin(car.time * 11 + id * 2.1) * 0.12;
    ctx.strokeStyle = skin; ctx.lineWidth = 1.4;
    ctx.beginPath();
    mv(ctx, a, b - 0.2, t + 0.2); ln(ctx, a + 0.1 + wav, b - 0.3, t + 0.98);
    mv(ctx, a, b + 0.2, t + 0.2); ln(ctx, a + 0.1 - wav, b + 0.3, t + 0.98);
    ctx.stroke();
  }
  const hx = OX + a * FX + b * SX + (t + 0.56) * UX, hy = OY + a * FY + b * SY + (t + 0.56) * UY;
  const ox = -FX * 0.14 + UX * 0.1, oy = -FY * 0.14 + UY * 0.1; // the hair sits on top and at the back of the head
  const hair = HAIR[(id + car.n) % 5];
  if (vf > 0) { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx + ox, hy + oy, 2.7, 0, TAU); ctx.fill(); }
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, TAU); ctx.fill();
  if (vf <= 0) { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx + ox, hy + oy, 2.7, 0, TAU); ctx.fill(); }
}

export function drawCar(ctx, c, car) {
  const T = styleOf(c), M = CARS[c.ctype];
  // metric frame: f = forward, s = sideways, u = up out of the seats
  let fx = car.tx * 4, fy = car.ty * 4, fz = car.tz * 2;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  const sx = car.sx, sy = car.sy, sz = car.sz || 0;
  const ux = fy * sz - fz * sy, uy = fz * sx - fx * sz, uz = fx * sy - fy * sx;
  OX = (car.x - car.y) * 32; OY = (car.x + car.y) * 16 - (car.z * 2 + ZO) * 8;
  FX = (fx - fy) * 8; FY = (fx + fy) * 4 - fz * 8;
  SX = (sx - sy) * 8; SY = (sx + sy) * 4 - sz * 8;
  UX = (ux - uy) * 8; UY = (ux + uy) * 4 - uz * 8;
  // how much each axis looks at the viewer, and how much light it catches (from above and the left)
  const vf = fx + fy + fz, vs = sx + sy + sz, vu = ux + uy + uz;
  const lf = fz * 0.5 + (fy - fx) * 0.22, ls = sz * 0.5 + (sy - sx) * 0.22, lu = uz * 0.5 + (uy - ux) * 0.22;
  const pr = car.first ? M.front : car.last ? M.rear : M.mid, taper = car.first ? M.taper : null;
  const hw = M.hw, top = M.top, nearB = vs > 0 ? hw : -hw, up = vu > 0;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  if (!fine) {
    // from far away: the body and two dots for heads
    prism(ctx, pr, taper, hw, T.carPal, null, vf, vs, vu, lf, ls, lu);
    if (up) for (let k = 0; k < Math.min(2, car.riders); k++) {
      const b = k ? 0.28 : -0.28;
      ctx.fillStyle = SKIN[(car.j * 2 + k) % 3];
      ctx.beginPath(); ctx.arc(OX + M.seat * FX + b * SX + (top + 0.5) * UX, OY + M.seat * FY + b * SY + (top + 0.5) * UY, 2.6, 0, TAU); ctx.fill();
    }
    return;
  }

  const riders = Math.min(2, car.riders), farFirst = vs > 0 ? 0 : 1;
  const people = () => {
    // seat backs behind the riders, restraints over them; seen from behind the seat backs hide the shoulders
    const sa = M.seat - 0.3, s0 = 0.06, s1 = hw - 0.08, t0 = top - 0.08, t1 = top + M.back;
    const seats = () => {
      ctx.beginPath();
      quad(ctx, sa, s0, t0, sa, s1, t0, sa, s1, t1, sa, s0, t1); quad(ctx, sa, -s0, t0, sa, -s1, t0, sa, -s1, t1, sa, -s0, t1);
      ctx.fillStyle = vf > 0 ? M.seatCol : M.seatLo; ctx.fill();
      ctx.strokeStyle = INKA; ctx.lineWidth = 0.8; ctx.stroke();
    };
    if (vf > 0) seats();
    for (let q = 0; q < 2; q++) { const k = q ? 1 - farFirst : farFirst; if (k < riders) drawRider(ctx, car, M, k, vf); }
    if (M.bar === 2) {
      // bars over the shoulders
      const a = M.seat;
      ctx.beginPath();
      for (const b of [-0.28, 0.28]) for (const e of [-0.13, 0.13]) { mv(ctx, a - 0.26, b + e, top + M.back - 0.02); ln(ctx, a + 0.14, b + e, top + 0.6); ln(ctx, a + 0.24, b + e, top + 0.12); }
      ctx.strokeStyle = M.barCol; ctx.lineWidth = 1.4; ctx.stroke();
    } else {
      // a lap bar
      ctx.beginPath(); mv(ctx, M.seat + 0.36, -hw + 0.12, top + 0.1); ln(ctx, M.seat + 0.36, hw - 0.12, top + 0.1);
      ctx.strokeStyle = '#e4e9f0'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (vf <= 0) seats();
  };
  const running = () => {
    // coupling, axles and wheels
    const [wa, wb, wu, wr] = M.wheels;
    ctx.strokeStyle = '#2a2536'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    if (!car.last) { mv(ctx, -0.9, 0, 0.16); ln(ctx, -1.52, 0, 0.16); }
    if (M.bogie) { mv(ctx, wa, -wb, wu); ln(ctx, wa, wb, wu); mv(ctx, -wa, -wb, wu); ln(ctx, -wa, wb, wu); }
    ctx.stroke();
    ctx.fillStyle = '#2a2536'; ctx.beginPath();
    for (const a of [wa, -wa]) for (const b of [wb, -wb]) { const x = OX + a * FX + b * SX + wu * UX, y = OY + a * FY + b * SY + wu * UY; ctx.moveTo(x + wr, y); ctx.arc(x, y, wr, 0, TAU); }
    ctx.fill();
    if (M.bogie) {
      ctx.fillStyle = '#c9d1de'; ctx.beginPath();
      for (const a of [wa, -wa]) { const x = OX + a * FX + (nearB > 0 ? wb : -wb) * SX + wu * UX, y = OY + a * FY + (nearB > 0 ? wb : -wb) * SY + wu * UY; ctx.moveTo(x + 0.8, y); ctx.arc(x, y, 0.8, 0, TAU); }
      ctx.fill();
    }
  };

  if (up) running(); else people();
  if (up) prism(ctx, M.chassis, null, M.cw, UNDER, T.carInk, vf, vs, vu, lf, ls, lu);
  prism(ctx, pr, taper, hw, T.carPal, T.carInk, vf, vs, vu, lf, ls, lu);
  if (!up) { prism(ctx, M.chassis, null, M.cw, UNDER, null, vf, vs, vu, lf, ls, lu); running(); }
  // a lighter stripe along the side that is seen
  const sa0 = pr[pr.length - 2] + 0.1, sa1 = car.first ? pr[4] - 0.14 : pr[4] - 0.08;
  ctx.fillStyle = T.carHi;
  ctx.beginPath(); quad(ctx, sa0, nearB, M.stripe[0], sa1, nearB * (taper ? 0.7 : 1), M.stripe[0], sa1, nearB * (taper ? 0.7 : 1), M.stripe[1], sa0, nearB, M.stripe[1]); ctx.fill();
  if (car.last && vf < 0) {
    // tail lights
    const a = pr[pr.length - 2] - 0.01, u = 0.5 * (pr[pr.length - 1] + pr[pr.length - 3]);
    ctx.fillStyle = '#ff5964'; ctx.beginPath();
    for (const b of [-hw * 0.6, hw * 0.6]) { const x = OX + a * FX + b * SX + u * UX, y = OY + a * FY + b * SY + u * UY; ctx.moveTo(x + 1.2, y); ctx.arc(x, y, 1.2, 0, TAU); }
    ctx.fill();
  }
  if (!up) return;

  // the well the riders sit in
  const w = car.first ? M.wellF : M.well, wb = hw - 0.13;
  ctx.fillStyle = T.carInk;
  ctx.beginPath(); quad(ctx, w[0], -wb, top, w[1], -wb, top, w[1], wb, top, w[0], wb, top); ctx.fill();
  if (c.ctype === 'launch') {
    // a racing stripe over the nose
    ctx.strokeStyle = T.carHi; ctx.lineWidth = 2.6; ctx.lineCap = 'butt';
    ctx.beginPath();
    if (car.first) { mv(ctx, 1.2, 0, 0.34); ln(ctx, 0.3, 0, 0.63); ln(ctx, w[1], 0, top + 0.02); } else { mv(ctx, 0.98, 0, top + 0.01); ln(ctx, w[1], 0, top + 0.01); }
    mv(ctx, w[0], 0, top + 0.01); ln(ctx, -1.02, 0, top + 0.01);
    ctx.stroke(); ctx.lineCap = 'round';
  } else if (c.ctype === 'mini' && car.first) {
    // the front car has a face: two big headlamp eyes and a pair of feelers
    const eye = (r, col, da) => {
      ctx.fillStyle = col; ctx.beginPath();
      for (const b of [-0.27, 0.27]) { const x = OX + (1.05 + da) * FX + b * SX + 0.72 * UX, y = OY + (1.05 + da) * FY + b * SY + 0.72 * UY; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      ctx.fill();
    };
    if (0.22 * vf + 0.16 * vu > 0) { eye(2.3, '#ffffff', 0); eye(1.1, INK, 0.04); }
    ctx.strokeStyle = T.carInk; ctx.lineWidth = 1;
    ctx.beginPath(); mv(ctx, 0.62, -0.2, 0.88); ln(ctx, 0.74, -0.3, 1.4); mv(ctx, 0.62, 0.2, 0.88); ln(ctx, 0.74, 0.3, 1.4); ctx.stroke();
    ctx.fillStyle = T.carHi; ctx.beginPath();
    for (const b of [-0.3, 0.3]) { const x = OX + 0.74 * FX + b * SX + 1.4 * UX, y = OY + 0.74 * FY + b * SY + 1.4 * UY; ctx.moveTo(x + 1.4, y); ctx.arc(x, y, 1.4, 0, TAU); }
    ctx.fill();
  }
  people();
  if (M.fin && car.last) {
    // tail fin
    ctx.beginPath(); mv(ctx, -0.5, 0, top + 0.04); ln(ctx, -1.22, 0, top + 0.66); ln(ctx, -1.12, 0, top - 0.04); ctx.closePath();
    ctx.fillStyle = T.carHi; ctx.fill();
    ctx.strokeStyle = T.carInk; ctx.lineWidth = 0.9; ctx.stroke();
  }
}

/** Small picture of a coaster type for the build menu. */
export function coasterThumb(ctx, ctype, w, h) {
  const c = { ctype, closed: false, pieces: [] };
  const mk = (x, h0, h1, t = 's') => ({ t, x, y: 0, d: 0, h0, h1, chain: false, bank: false });
  c.pieces.push(mk(0, 0, 1), mk(1, 1, 2), mk(2, 2, 1), mk(3, 1, 0));
  ctx.save();
  ctx.translate(w / 2 - 34, h / 2 - 12);
  ctx.scale(0.62, 0.62);
  const keep = { h: S.h, water: S.water, fine };
  fine = true;
  S.h = S.h || new Uint8Array(N * N); S.water = S.water || new Uint8Array(N * N);
  const realH = [];
  for (let x = 0; x < 4; x++) { realH.push(S.h[idx(x, 0)], S.water[idx(x, 0)]); S.h[idx(x, 0)] = 0; S.water[idx(x, 0)] = 0; }
  for (let i = 0; i < 4; i++) drawPiece(ctx, c, i);
  // the front car of its train, just over the top of the hill
  const sm = pieceSamples(c, 2), a = sm[1], b = sm[3];
  drawCar(ctx, c, { x: sm[2].x, y: sm[2].y, z: sm[2].z, tx: b.x - a.x, ty: b.y - a.y, tz: b.z - a.z, sx: 0, sy: 1, sz: 0, riders: 2, first: true, last: true, n: 1, j: 0, time: 0, v: 0, fun: 1 });
  for (let x = 0; x < 4; x++) { S.h[idx(x, 0)] = realH[x * 2]; S.water[idx(x, 0)] = realH[x * 2 + 1]; }
  S.h = keep.h || S.h; S.water = keep.water || S.water;
  fine = keep.fine;
  ctx.restore();
}
