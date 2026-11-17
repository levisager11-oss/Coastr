// Isometric renderer: backdrop, terrain, paths, scenery, rides, coasters, guests, light and overlays.
import { N, DX, DY, RIDES, SCN, COASTERS } from './data.js';
import { S, idx, inB, accessTiles, walkH } from './world.js';
import { posAt, trainDist, STATION_HEAD, CAR_LEN, endState, bankAt, corkAngle } from './coaster.js';
import { guestPos, queueLine } from './guests.js';
import { darkness } from './sim.js';
import * as SP from './sprites.js';
import { drawFxWorld, drawFxGlow, drawFxScreen, fxWet, fxSnow } from './fx.js';
import { drawPiece, drawCar, stationRoof, setTrackDetail, coasterThumb } from './track.js';
import { isoX, isoY, heff, shade, mix, rectPath } from './iso.js';

export { isoX, isoY, shade, drawPiece, coasterThumb };

const { drawRide, drawStall, drawScenery, setOrigin, RIDE_TOP } = SP;

export const cam = { x: 0, y: 600, zoom: 1 };
export const view = { w: 800, h: 600, dpr: 1 };
export const look = { night: true }; // settings that only change the picture
const HW = 32, HH = 16, ZH = 16;
const SEA = 0.4; // height of the ground around the park, in levels
const FONT = 'ui-rounded, "Segoe UI", system-ui, sans-serif';


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
    if (inB(x, y) && walkH(idx(x, y)) >= z) return { x, y };
  }
  const a = wx / HW, b = (wy + 2 * ZH) / HH;
  const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
  return inB(x, y) ? { x, y } : null;
}
export function objTop(o) {
  if (o.kind === 'coaster') return 3.3;
  return o.kind === 'stall' ? 2.4 : RIDE_TOP[o.type] || 3;
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

// ---------- colours ----------
// One look per kind of scenario. ground / hi = low and high land, side = cliff faces (left, right),
// far = the land or sea around the park (top and bottom of the screen), mark = little strokes on it.
const THEMES = {
  meadow: {
    ground: '#7cc653', hi: '#b3ea8f', sideL: '#c99b5f', sideR: '#a87c48', lip: '#62a83f', shore: '#e6d7a0', water: '#55bdf0', deep: '#3fa6e2',
    foam: 'rgba(255,255,255,0.75)', far: ['#3795d6', '#6cc4ef'], mark: 'rgba(255,255,255,0.42)', sea: true,
    path: '#f1dfb5', pathEdge: '#c9ad78', tuft: '#5aa83d', dots: ['#ffffff', '#ffd23f', '#ff8fab'],
  },
  lagoon: {
    ground: '#74c768', hi: '#b2eba2', sideL: '#d8b877', sideR: '#b79655', lip: '#58a850', shore: '#f2e4b4', water: '#45cbd9', deep: '#27acc9',
    foam: 'rgba(255,255,255,0.8)', far: ['#1f93c4', '#5fd0e2'], mark: 'rgba(255,255,255,0.45)', sea: true,
    path: '#f4e6c2', pathEdge: '#cdb27f', tuft: '#4f9f48', dots: ['#ffffff', '#ffd23f', '#ff70a6'],
  },
  desert: {
    ground: '#e6c483', hi: '#f7e6ba', sideL: '#cf8e5a', sideR: '#ae6c41', lip: '#d1a765', shore: '#c9d6a0', water: '#3fc6c4', deep: '#27aeb3',
    foam: 'rgba(255,255,255,0.7)', far: ['#e9cc90', '#f5e3b8'], mark: 'rgba(176,128,70,0.3)', sea: false,
    path: '#d99f76', pathEdge: '#a8704b', tuft: '#c9a45f', dots: ['#b98d57', '#f3d9a4', '#a3b86c'],
  },
  snow: {
    ground: '#e8f0f9', hi: '#ffffff', sideL: '#a3b4c9', sideR: '#8598b0', lip: '#cfdceb', shore: '#d5e6f4', water: '#8fd3f2', deep: '#6dbde6',
    foam: 'rgba(255,255,255,0.9)', far: ['#6eb4e0', '#b6e0f5'], mark: 'rgba(255,255,255,0.7)', sea: true,
    path: '#cdbb9c', pathEdge: '#9c8a6b', tuft: '#c9d8e8', dots: ['#ffffff', '#d6e6f5', '#ffffff'],
  },
};
for (const k in THEMES) {
  const T = THEMES[k];
  T.pal = [];
  for (let l = 0; l < 7; l++) {
    const base = mix(T.ground, T.hi, (l / 6) * 0.85);
    T.pal.push([base, shade(base, -0.035), shade(base, -0.06), shade(base, 0.05)]);
  }
  T.pathB = shade(T.path, -0.04); T.lipR = shade(T.lip, -0.08); T.stairL = shade(T.path, -0.1); T.stairR = shade(T.path, -0.18);
  T.shoreB = shade(T.shore, -0.04);
}
export const themeOf = (name) => THEMES[name] || THEMES.meadow;
// ---------- drawing helpers ----------
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65536; };

// ---------- guests ----------
const HATS = ['#ef476f', '#ffd23f', '#06d6a0', '#3b8ed0', '#9b5de5'];
function drawGuest(ctx, g, sx, sy, sel, time, rain) {
  const walking = g.st === 'walk';
  const step = walking ? Math.sin(g.walk) : 0;
  const k = g.id % 7 === 0 ? 0.82 : 1; // some guests are children
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(sx, sy, 4.4 * k, 2.2 * k, 0, 0, 6.3); ctx.fill();
  if (sel) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, 8, 4, 0, 0, 6.3); ctx.stroke();
  }
  if (!fine) {
    // far away a guest is just a shirt and a head
    ctx.fillStyle = g.shirt; ctx.fillRect(sx - 3 * k, sy - 11 * k, 6 * k, 10 * k);
    ctx.fillStyle = g.skin; ctx.beginPath(); ctx.arc(sx, sy - 13.8 * k, 3.1 * k, 0, 6.3); ctx.fill();
    return;
  }
  const cheer = g.emT > 1.6 && (g.em === 'star' || g.em === 'smile');
  const hop = cheer ? Math.abs(Math.sin((g.emT - 1.6) * 8)) * 3 : 0;
  const bob = Math.abs(step) * 0.8 + hop;
  const by = sy - bob;
  // legs
  ctx.strokeStyle = '#3d405b'; ctx.lineWidth = 1.9 * k; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - 1.4 * k, by - 4.5 * k); ctx.lineTo(sx - 1.4 * k - step * 1.5, sy - 0.5 - hop);
  ctx.moveTo(sx + 1.4 * k, by - 4.5 * k); ctx.lineTo(sx + 1.4 * k + step * 1.5, sy - 0.5 - hop);
  ctx.stroke();
  // arms
  ctx.strokeStyle = g.skin; ctx.lineWidth = 1.5 * k;
  ctx.beginPath();
  if (cheer) {
    ctx.moveTo(sx - 3 * k, by - 9.5 * k); ctx.lineTo(sx - 5 * k, by - 14 * k);
    ctx.moveTo(sx + 3 * k, by - 9.5 * k); ctx.lineTo(sx + 5 * k, by - 14 * k);
  } else {
    ctx.moveTo(sx - 3.1 * k, by - 9.6 * k); ctx.lineTo(sx - 3.6 * k + step * 1.2, by - 5.4 * k);
    ctx.moveTo(sx + 3.1 * k, by - 9.6 * k); ctx.lineTo(sx + 3.6 * k - step * 1.2, by - 5.4 * k);
  }
  ctx.stroke();
  // body
  ctx.fillStyle = g.shirt;
  ctx.beginPath(); ctx.roundRect(sx - 3 * k, by - 11 * k, 6 * k, 7.4 * k, 2.2 * k); ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,50,0.4)'; ctx.lineWidth = 0.7; ctx.stroke();
  // head
  const hy = by - 13.8 * k;
  ctx.fillStyle = g.nausea > 70 ? '#9fcf6a' : g.skin;
  ctx.beginPath(); ctx.arc(sx, hy, 3.1 * k, 0, 6.3); ctx.fill();
  ctx.fillStyle = g.hair;
  ctx.beginPath(); ctx.arc(sx, hy - 0.6 * k, 3.1 * k, Math.PI, 0); ctx.fill();
  if (g.hat) {
    ctx.fillStyle = HATS[g.hat - 1];
    ctx.beginPath(); ctx.arc(sx, hy - 1.2 * k, 3.3 * k, Math.PI, 0); ctx.fill();
    ctx.fillRect(sx - 1 * k, hy - 1.9 * k, 5.6 * k, 1.3 * k);
  }
  if (g.gift) {
    const cols = ['#ef476f', '#ffd23f', '#06d6a0', '#3b8ed0', '#9b5de5'];
    const bx = sx + 5 + Math.sin(g.walk * 0.3 + time) * 1.2, byy = sy - 27 - bob;
    ctx.strokeStyle = 'rgba(60,60,60,0.6)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(sx + 3, by - 8); ctx.lineTo(bx, byy + 4); ctx.stroke();
    ctx.fillStyle = cols[g.gift - 1];
    ctx.beginPath(); ctx.ellipse(bx, byy, 3.5, 4.3, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(bx - 1.1, byy - 1.4, 1, 1.4, 0, 0, 6.3); ctx.fill();
  } else if (rain && g.id % 3) {
    const uy = hy - 6.5 * k;
    ctx.strokeStyle = '#5b4636'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(sx + 2.5, by - 7 * k); ctx.lineTo(sx + 2.5, uy); ctx.stroke();
    ctx.fillStyle = HATS[g.id % 5];
    ctx.beginPath(); ctx.ellipse(sx + 2.5, uy, 7.5, 3.4, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(sx + 2.5, uy, 2.6, 3.4, 0, Math.PI, 0); ctx.fill();
  }
}
// The little bubble over a guest who just thought something.
function drawEmote(ctx, kind, x, y, a) {
  ctx.globalAlpha = a;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(40,28,64,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 7.2, 0, 6.3); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 2, y + 6.4); ctx.lineTo(x, y + 10); ctx.lineTo(x + 2.4, y + 6.2); ctx.fill();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const face = (col, mouth) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath(); ctx.arc(x - 1.8, y - 1.2, 0.8, 0, 6.3); ctx.arc(x + 1.8, y - 1.2, 0.8, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (mouth > 0) ctx.arc(x, y + 0.6, 2.4, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mouth < 0) ctx.arc(x, y + 3.6, 2.2, 1.2 * Math.PI, 1.8 * Math.PI);
    else { ctx.moveTo(x - 2, y + 2.2); ctx.lineTo(x + 2, y + 2.2); }
    ctx.stroke();
  };
  if (kind === 'smile') face('#ffd23f', 1);
  else if (kind === 'sick') face('#9fcf6a', -1);
  else if (kind === 'angry') face('#ef6a6a', -1);
  else if (kind === 'bored') face('#cfd6e3', 0);
  else if (kind === 'heart') {
    ctx.fillStyle = '#ef476f';
    ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.bezierCurveTo(x - 7, y - 1, x - 3, y - 6, x, y - 2); ctx.bezierCurveTo(x + 3, y - 6, x + 7, y - 1, x, y + 4); ctx.fill();
  } else if (kind === 'star') {
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 2.2 : 5, an = -Math.PI / 2 + (k * Math.PI) / 5; ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); }
    ctx.closePath(); ctx.fill();
  } else {
    const txt = kind === 'money' ? '$' : kind === 'zzz' ? 'z' : kind === 'clock' ? '…' : '!';
    ctx.fillStyle = kind === 'money' ? '#d63a5f' : kind === 'zzz' ? '#3b8ed0' : '#f78c1f';
    ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 0.5);
  }
  ctx.globalAlpha = 1;
}

// ---------- the frame ----------
let buckets = new Map();
const tp = {};
const trains = []; // flat list for one coaster: time on track, riders, moving (1) or waiting (0)
let fine = true; // zoomed in far enough for small details to be worth drawing
const gp = {};
let farGrad = null, farKey = '';
const lights = [], emotes = [];
let glowWarm = null, glowCool = null;
const queueSpot = new Map();
let queuePv = -1;

function addBucket(i, item) {
  let b = buckets.get(i);
  if (!b) { b = []; buckets.set(i, b); }
  b.push(item);
}
function glowSprite(rgb) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  gr.addColorStop(0, `rgba(${rgb},0.85)`); gr.addColorStop(0.35, `rgba(${rgb},0.34)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
  return c;
}

// The land or sea around the park, with little strokes that stay put as the camera moves.
function drawBackdrop(ctx, TH, w, h, z, time) {
  const key = S.theme + '|' + h;
  if (!farGrad || farKey !== key) {
    farGrad = ctx.createLinearGradient(0, 0, 0, h);
    farGrad.addColorStop(0, TH.far[0]); farGrad.addColorStop(1, TH.far[1]);
    farKey = key;
  }
  ctx.fillStyle = farGrad; ctx.fillRect(0, 0, w, h);
  const step = 110 * Math.max(1, Math.ceil(0.55 / z));
  const x0 = Math.floor((cam.x - w / 2 / z) / step) - 1, x1 = Math.ceil((cam.x + w / 2 / z) / step);
  const y0 = Math.floor((cam.y - h / 2 / z) / (step / 2)) - 1, y1 = Math.ceil((cam.y + h / 2 / z) / (step / 2));
  ctx.strokeStyle = TH.mark; ctx.lineWidth = Math.max(1.4, 2 * z); ctx.lineCap = 'round';
  ctx.beginPath();
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const hs = hash(gx, gy);
    if (hs > 0.62) continue;
    const wx = (gx + hash(gy, gx)) * step, wy = (gy + hs) * (step / 2);
    const px = (wx - cam.x) * z + w / 2, py = (wy - cam.y) * z + h / 2;
    const len = (10 + hs * 26) * z * (TH.sea ? 0.6 + 0.4 * Math.sin(time * 0.9 + hs * 40) : 1);
    if (TH.sea) { ctx.moveTo(px - len, py); ctx.lineTo(px + len, py); }
    else { ctx.moveTo(px - len, py + 2 * z); ctx.quadraticCurveTo(px, py - 3 * z, px + len, py + 2 * z); }
  }
  ctx.stroke();
}

export function render(ctx, time, ui) {
  const { w, h, dpr } = view, z = cam.zoom, TH = themeOf(S.theme);
  const dark = look.night ? darkness() : 0;
  if (SP.setNight) SP.setNight(dark);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackdrop(ctx, TH, w, h, z, time);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
  const wx0 = cam.x - w / 2 / z - 48, wx1 = cam.x + w / 2 / z + 48;
  const wy0 = cam.y - h / 2 / z - 48, wy1 = cam.y + h / 2 / z;
  const detail = z >= 0.6, rain = fxWet() > 0.5;
  fine = detail; setTrackDetail(detail);
  lights.length = 0; emotes.length = 0;

  // dynamic things go into per-tile buckets so they sort with the scenery
  buckets.clear();
  for (const g of S.guests) {
    if (g.st === 'queue' || g.st === 'ride') continue;
    guestPos(g, gp);
    const tx = Math.max(0, Math.min(N - 1, Math.floor(gp.x))), ty = Math.max(0, Math.min(N - 1, Math.floor(gp.y)));
    addBucket(idx(tx, ty), { g, x: gp.x, y: gp.y, z: gp.z, d: gp.x + gp.y });
  }
  if (queuePv !== S.pv) { queueSpot.clear(); queuePv = S.pv; }
  for (const id in S.objs) {
    const c = S.objs[id];
    // people waiting stand along the ride's queue line, or in a little crowd by its entrance if it has none
    if (c.kind !== 'stall' && c.queue.length && S.gmap) {
      const line = queueLine(c);
      let spot = queueSpot.get(c.id);
      if (spot === undefined) { const a = accessTiles(c); spot = a.length ? a[0] : -1; queueSpot.set(c.id, spot); }
      const shown = line.length ? Math.min(c.queue.length, line.length * 4 + 8) : Math.min(12, c.queue.length);
      for (let k = 0; k < shown; k++) {
        const g = S.gmap.get(c.queue[k]);
        if (!g) continue;
        const ti = line.length ? line[Math.min(line.length - 1, k >> 2)] : spot;
        if (ti < 0) break;
        const kk = line.length && (k >> 2) >= line.length ? k - (line.length - 1) * 4 : line.length ? k & 3 : k;
        const x = (ti % N) + 0.26 + (kk % 3) * 0.24 + ((kk / 3) | 0) % 2 * 0.1, y = ((ti / N) | 0) + 0.26 + ((kk / 3) | 0) * 0.22;
        addBucket(ti, { g, x, y, z: walkH(ti), d: x + y });
      }
    }
    if (c.kind !== 'coaster' || !c.sim || c.sim.L < 13) continue;
    const T = COASTERS[c.ctype], sm = c.sim;
    // every train that is out on the track, plus one waiting in the station if there is one to spare
    trains.length = 0;
    if (c.st === 'test') trains.push(c.runT, 0, 1);
    else {
      let arriving = false;
      if (c.runs) for (const r of c.runs) { trains.push(r.t, r.riders.length, 1); if (r.t > sm.T - 3.2) arriving = true; }
      if (!arriving && (!c.runs || c.runs.length < Math.max(1, Math.min(3, c.trains || 1)) || !c.runs.length)) trains.push(0, 0, 0);
    }
    for (let q = 0; q < trains.length; q += 3) {
      const moving = trains[q + 2] === 1, head = moving ? trainDist(sm, trains[q]) : STATION_HEAD;
      let riders = trains[q + 1];
      for (let j = 0; j < T.cars; j++) {
        let dist = head - j * CAR_LEN;
        if (!c.closed) dist = Math.max(0.1, Math.min(sm.L - 0.1, dist));
        if (!posAt(sm, dist, tp)) continue;
        const p = c.pieces[tp.pi];
        let sx, sy, sz = 0;
        if (p.t === 'loop') { sx = -DY[p.d]; sy = DX[p.d]; }
        else if (p.t === 'cork') { const th = corkAngle(tp.u); sx = -DY[p.d] * Math.cos(th); sy = DX[p.d] * Math.cos(th); sz = Math.sin(th); }
        else {
          const l = Math.hypot(tp.tx, tp.ty) || 1;
          sx = -tp.ty / l; sy = tp.tx / l;
          if (p.bank) {
            // lean into the turn with the rails: the outer rail is lifted by this much over half the track width
            const tan = (bankAt(c, tp.pi, tp.u) * 2) / 0.52, m = Math.hypot(1, tan);
            sx /= m; sy /= m; sz = tan / m;
          }
        }
        const v = sm.v[Math.min(sm.segs, tp.k)] || 0;
        const car = {
          car: 1, c, x: tp.x, y: tp.y, z: tp.z, tx: tp.tx, ty: tp.ty, tz: tp.tz, sx, sy, sz, d: tp.x + tp.y + 0.01,
          riders: Math.max(0, Math.min(2, riders)), first: j === 0, last: j === T.cars - 1, n: T.cars, j, time, v,
          fun: moving && v > 9 && p.t !== 'station' && !p.chain ? 1 : 0,
        };
        riders -= 2;
        const tx = Math.max(0, Math.min(N - 1, Math.floor(tp.x))), ty = Math.max(0, Math.min(N - 1, Math.floor(tp.y)));
        addBucket(idx(tx, ty), car);
        if (j === 0 && moving && dark > 0.05) lights.push(isoX(tp.x, tp.y), isoY(tp.x, tp.y, tp.z + 0.6), 34, 1);
      }
      // the camera follows the first train in the list
      if (q === 0 && ui.follow === c.id && posAt(sm, head, tp)) ui.followPos = [isoX(tp.x, tp.y), isoY(tp.x, tp.y, tp.z), tp.k];
    }
  }

  const sel = ui.sel;
  for (let d = 0; d <= 2 * N - 2; d++) {
    const xa = Math.max(0, d - N + 1), xb = Math.min(N - 1, d);
    for (let x = xa; x <= xb; x++) {
      const y = d - x, i = idx(x, y);
      const he = heff(i), sx = isoX(x, y), sy = isoY(x, y, he);
      const hasTrack = S.trk.has(i);
      if (sx < wx0 - HW || sx > wx1 + HW || sy < wy0 - 40 || sy > wy1 + (hasTrack ? 460 : S.occ[i] ? 240 : 120)) continue;
      drawTile(ctx, TH, x, y, i, he, sx, sy, time, detail);
      const sc = S.scn[i];
      if (sc) {
        drawScenery(ctx, sc, sx, sy + HH, time, hash(x, y));
        if (dark > 0.05 && (sc === SCN.lamp || sc === SCN.torch)) lights.push(sx, sy + HH - 30, sc === SCN.lamp ? 78 : 58 + Math.sin(time * 9 + x) * 5, 0);
      }
      let roofs = null;
      if (hasTrack) {
        const list = S.trk.get(i);
        for (const s of list) {
          const c = S.objs[s.c];
          if (!c) continue;
          const p = c.pieces[s.p];
          if (!p) continue;
          const alpha = ui.editing && ui.editing !== c.id ? 0.85 : undefined;
          if (p.t === 'loop') {
            const front = p.d === 0 || p.d === 1;
            const isSecond = !(p.x === x && p.y === y);
            if (front !== isSecond) continue;
            drawPiece(ctx, c, s.p, alpha);
          } else drawPiece(ctx, c, s.p, alpha, i);
          if (c.sim && c.sim.stall === s.p) hot(ctx, p);
          if (p.t === 'station') {
            (roofs || (roofs = [])).push(c, p);
            if (dark > 0.05) lights.push(sx, sy - 12, 62, 0);
          }
        }
      }
      const oid = S.occ[i];
      if (oid) {
        const o = S.objs[oid];
        if (o && x === o.x + o.w - 1 && y === o.y + o.h - 1) {
          const ox = isoX(o.x + o.w / 2, o.y + o.h / 2), oy = isoY(o.x + o.w / 2, o.y + o.h / 2, o.z);
          // a new building pops up with a little bounce
          const age = o.pop ? time - o.pop : 9;
          const squash = age < 0.45 ? 1 + Math.sin((age / 0.45) * Math.PI) * 0.16 * (1 - age / 0.45) - (age < 0.12 ? (0.12 - age) * 2.5 : 0) : 1;
          if (squash !== 1) { ctx.save(); ctx.translate(ox, oy); ctx.scale(2 - squash, squash); ctx.translate(-ox, -oy); }
          setOrigin(ox, oy);
          if (o.kind === 'ride') drawRide(ctx, o, time); else drawStall(ctx, o, time);
          if (squash !== 1) ctx.restore();
          if (dark > 0.05 && o.open) {
            if (o.kind === 'ride') lights.push(ox, oy - (RIDE_TOP[o.type] || 3) * 6, 56 + 20 * (o.w + o.h), 0);
            else lights.push(ox, oy - 14, 48, 0);
          }
        }
      }
      const b = buckets.get(i);
      if (b) {
        if (b.length > 1) b.sort((p, q) => p.d - q.d);
        for (const e of b) {
          if (e.car) drawCar(ctx, e.c, e);
          else {
            const gx = isoX(e.x, e.y), gy = isoY(e.x, e.y, e.z);
            drawGuest(ctx, e.g, gx, gy, sel && sel.kind === 'guest' && sel.id === e.g.id, time, rain);
            if (e.g.emT > 0 && detail) emotes.push(e.g.em, gx, gy - 27, Math.min(1, e.g.emT * 2));
          }
        }
      }
      if (roofs) for (let k = 0; k < roofs.length; k += 2) stationRoof(ctx, roofs[k], roofs[k + 1]);
      if (x === S.ent.x && y === S.ent.y) {
        drawEntrance(ctx, x, y, he, time);
        if (dark > 0.05) lights.push(sx, sy - 10, 90, 0);
      }
    }
  }
  for (let k = 0; k < emotes.length; k += 4) drawEmote(ctx, emotes[k], emotes[k + 1], emotes[k + 2], emotes[k + 3]);
  cloudShadows(ctx, time);
  drawFxWorld(ctx, z);

  // weather gloom and night: shade the whole picture, then let the lights shine through
  const wk = S.wx ? S.wx.kind : 'sun';
  const gloom = Math.max(fxWet(), fxSnow() * 0.35, wk === 'cloud' ? 0.4 : 0) * 0.22;
  if (dark > 0.01 || gloom > 0.01) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.round((255 - 165 * dark) * (1 - gloom)), g = Math.round((255 - 146 * dark) * (1 - gloom)), b = Math.round((255 - 78 * dark) * (1 - gloom * 0.7));
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
    if (dark > 0.05 && lights.length) {
      if (!glowWarm) { glowWarm = glowSprite('255,205,120'); glowCool = glowSprite('220,235,255'); }
      if (glowWarm) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, dark * 0.36);
        for (let k = 0; k < lights.length; k += 4) {
          const rr = lights[k + 2];
          ctx.drawImage(lights[k + 3] ? glowCool : glowWarm, lights[k] - rr, lights[k + 1] - rr * 0.7, rr * 2, rr * 1.4);
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  drawFxGlow(ctx);
  drawOverlays(ctx, time, ui);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFxScreen(ctx, w, h);
}

function hot(ctx, p) {
  const z = Math.max(p.h0, p.h1) + 0.3;
  ctx.fillStyle = 'rgba(255,40,40,0.45)';
  ctx.beginPath(); ctx.arc(isoX(p.x + 0.5, p.y + 0.5), isoY(p.x + 0.5, p.y + 0.5, z), 13, 0, 6.3); ctx.fill();
}
// Soft shadows of clouds drifting over the park.
let cloudSprite = null;
function cloudShadows(ctx, time) {
  if (!cloudSprite) {
    if (typeof document === 'undefined') return;
    cloudSprite = document.createElement('canvas');
    cloudSprite.width = cloudSprite.height = 128;
    const g = cloudSprite.getContext('2d'), gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(20,40,70,0.13)'); gr.addColorStop(0.6, 'rgba(20,40,70,0.08)'); gr.addColorStop(1, 'rgba(20,40,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const span = N * HW * 2.6;
  ctx.globalAlpha = S.theme === 'desert' || S.theme === 'snow' ? 0.4 : 0.75;
  for (let k = 0; k < 5; k++) {
    const sp = 9 + k * 2.3, rw = 340 + k * 40;
    const x = ((k * 0.23 * span + time * sp) % span) - span / 2, y = N * HH * (0.1 + ((k * 0.37) % 1) * 1.7);
    ctx.drawImage(cloudSprite, x - rw, y - rw * 0.42, rw * 2, rw * 0.84);
    ctx.drawImage(cloudSprite, x + rw * 0.5, y - rw * 0.2, rw * 1.3, rw * 0.55);
  }
  ctx.globalAlpha = 1;
}

function drawTile(ctx, TH, x, y, i, he, sx, sy, time, detail) {
  const water = S.water[i], path = S.path[i];
  // side faces
  const edgeL = y + 1 >= N, edgeR = x + 1 >= N;
  const hl = edgeL ? SEA : heff(i + N), hr = edgeR ? SEA : heff(i + 1);
  if (he > hl) {
    const dh = (he - hl) * ZH;
    ctx.beginPath();
    ctx.moveTo(sx - HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx, sy + HH * 2 + dh); ctx.lineTo(sx - HW, sy + HH + dh);
    ctx.closePath();
    ctx.fillStyle = TH.sideL; ctx.fill();
    if (dh > 20 && detail) {
      ctx.fillStyle = 'rgba(60,30,20,0.09)';
      ctx.beginPath(); ctx.moveTo(sx - HW, sy + HH + dh * 0.5); ctx.lineTo(sx, sy + HH * 2 + dh * 0.5); ctx.lineTo(sx, sy + HH * 2 + dh); ctx.lineTo(sx - HW, sy + HH + dh); ctx.fill();
    }
    if (path && !edgeL && S.path[i + N] && he - hl <= 1.1) stairs(ctx, sx - HW, sy + HH, sx, sy + HH * 2, dh, TH.stairL);
    else if (!water && detail) { ctx.fillStyle = TH.lip; ctx.beginPath(); ctx.moveTo(sx - HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx, sy + HH * 2 + 2.5); ctx.lineTo(sx - HW, sy + HH + 2.5); ctx.fill(); }
    if (edgeL && TH.sea) { ctx.strokeStyle = TH.foam; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(sx - HW, sy + HH + dh); ctx.lineTo(sx, sy + HH * 2 + dh); ctx.stroke(); }
  }
  if (he > hr) {
    const dh = (he - hr) * ZH;
    ctx.beginPath();
    ctx.moveTo(sx, sy + HH * 2); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx + HW, sy + HH + dh); ctx.lineTo(sx, sy + HH * 2 + dh);
    ctx.closePath();
    ctx.fillStyle = TH.sideR; ctx.fill();
    if (dh > 20 && detail) {
      ctx.fillStyle = 'rgba(60,30,20,0.09)';
      ctx.beginPath(); ctx.moveTo(sx, sy + HH * 2 + dh * 0.5); ctx.lineTo(sx + HW, sy + HH + dh * 0.5); ctx.lineTo(sx + HW, sy + HH + dh); ctx.lineTo(sx, sy + HH * 2 + dh); ctx.fill();
    }
    if (path && !edgeR && S.path[i + 1] && he - hr <= 1.1) stairs(ctx, sx, sy + HH * 2, sx + HW, sy + HH, dh, TH.stairR);
    else if (!water && detail) { ctx.fillStyle = TH.lipR; ctx.beginPath(); ctx.moveTo(sx, sy + HH * 2); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx + HW, sy + HH + 2.5); ctx.lineTo(sx, sy + HH * 2 + 2.5); ctx.fill(); }
    if (edgeR && TH.sea) { ctx.strokeStyle = TH.foam; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(sx, sy + HH * 2 + dh); ctx.lineTo(sx + HW, sy + HH + dh); ctx.stroke(); }
  }
  // top
  ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx - HW, sy + HH);
  ctx.closePath();
  const wB = y > 0 && S.water[i - N], wA = x > 0 && S.water[i - 1], wC = !edgeR && S.water[i + 1], wD = !edgeL && S.water[i + N];
  if (water) {
    ctx.fillStyle = wA && wB && wC && wD ? TH.deep : TH.water; ctx.fill();
    // foam where the water meets the bank behind it
    if ((!wA || !wB) && detail) {
      ctx.strokeStyle = TH.foam; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const o = 1.5 + Math.sin(time * 1.6 + x + y) * 0.9;
      ctx.beginPath();
      if (!wB) { ctx.moveTo(sx + 2, sy + 2 + o); ctx.lineTo(sx + HW - 4, sy + HH - 1 + o); }
      if (!wA) { ctx.moveTo(sx - 2, sy + 2 + o); ctx.lineTo(sx - HW + 4, sy + HH - 1 + o); }
      ctx.stroke();
    }
    const ph = detail && !path ? (time * 0.6 + hash(x, y) * 6) % 3 : 9;
    if (path) bridge(ctx, TH, x, y, i, sx, isoY(x, y, S.h[i] + 1), path === 2);
    if (ph < 1.6) {
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * Math.sin((ph / 1.6) * Math.PI)})`; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      const ox = (hash(y, x) - 0.5) * 24, oy = HH + (hash(x + 9, y) - 0.5) * 10;
      ctx.beginPath(); ctx.moveTo(sx + ox - 6, sy + oy); ctx.lineTo(sx + ox + 6, sy + oy); ctx.stroke();
    }
    return;
  }
  const hs = hash(x, y);
  if (path) {
    ctx.fillStyle = path === 2 ? ((x + y) & 1 ? QUEUE[0] : QUEUE[1]) : (x + y) & 1 ? TH.path : TH.pathB; ctx.fill();
    if (detail) {
      // paving joints
      ctx.strokeStyle = 'rgba(90,60,30,0.1)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - HW / 2, sy + HH / 2); ctx.lineTo(sx + HW / 2, sy + HH * 1.5);
      ctx.moveTo(sx + HW / 2, sy + HH / 2); ctx.lineTo(sx - HW / 2, sy + HH * 1.5);
      ctx.stroke();
    }
    if (path === 2) {
      // a rope down the middle shows this is a queue line
      ctx.strokeStyle = QUEUE[2]; ctx.lineWidth = 1.4; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(sx - HW / 2, sy + HH / 2); ctx.lineTo(sx + HW / 2, sy + HH * 1.5); ctx.moveTo(sx + HW / 2, sy + HH / 2); ctx.lineTo(sx - HW / 2, sy + HH * 1.5); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = path === 2 ? QUEUE[2] : TH.pathEdge; ctx.lineWidth = path === 2 ? 2.4 : 1.8; ctx.lineCap = 'round';
    ctx.beginPath();
    const P = (xx, yy) => S.path[idx(xx, yy)] || S.occ[idx(xx, yy)];
    if (!(y > 0 && P(x, y - 1))) { ctx.moveTo(sx + 1, sy + 1); ctx.lineTo(sx + HW - 1, sy + HH); }
    if (!(x > 0 && P(x - 1, y))) { ctx.moveTo(sx - 1, sy + 1); ctx.lineTo(sx - HW + 1, sy + HH); }
    if (!(x + 1 < N && P(x + 1, y))) { ctx.moveTo(sx + HW - 1, sy + HH); ctx.lineTo(sx, sy + HH * 2 - 1); }
    if (!(y + 1 < N ? P(x, y + 1) : (x === S.ent.x))) { ctx.moveTo(sx - HW + 1, sy + HH); ctx.lineTo(sx, sy + HH * 2 - 1); }
    ctx.stroke();
  } else if (wA || wB || wC || wD) {
    ctx.fillStyle = (x + y) & 1 ? TH.shore : TH.shoreB; ctx.fill();
  } else {
    const lift = Math.max(0, Math.min(6, S.h[i]));
    ctx.fillStyle = TH.pal[lift][((x + y) & 1) + (hs > 0.72 ? 2 : 0)];
    ctx.fill();
    if (detail && !S.scn[i] && !S.occ[i] && hs < 0.2) {
      const dx = (hash(y, x) - 0.5) * 30, dy = HH + (hash(x + 5, y + 3) - 0.5) * 12;
      if (hs < 0.13) {
        // a tuft of grass, a ripple in the sand or a drift of snow
        ctx.strokeStyle = TH.tuft; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath();
        if (S.theme === 'desert' || S.theme === 'snow') { ctx.moveTo(sx + dx - 7, sy + dy); ctx.quadraticCurveTo(sx + dx, sy + dy - 3, sx + dx + 7, sy + dy); }
        else { ctx.moveTo(sx + dx - 3, sy + dy); ctx.lineTo(sx + dx - 4, sy + dy - 4); ctx.moveTo(sx + dx, sy + dy); ctx.lineTo(sx + dx, sy + dy - 5); ctx.moveTo(sx + dx + 3, sy + dy); ctx.lineTo(sx + dx + 4.5, sy + dy - 4); }
        ctx.stroke();
      } else {
        ctx.fillStyle = TH.dots[(hs * 300) % 3 | 0];
        ctx.beginPath(); ctx.arc(sx + dx, sy + dy, 1.5, 0, 6.3); ctx.arc(sx + dx + 5, sy + dy + 2.5, 1.3, 0, 6.3); ctx.arc(sx + dx - 4, sy + dy + 3, 1.2, 0, 6.3); ctx.fill();
      }
    }
  }
  // a soft shadow at the foot of higher ground behind this tile
  const tA = x > 0 && S.h[i - 1] > S.h[i] && !S.water[i - 1], tB = y > 0 && S.h[i - N] > S.h[i] && !S.water[i - N];
  if ((tA || tB) && detail) {
    ctx.fillStyle = 'rgba(20,40,30,0.12)';
    if (tA) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - HW, sy + HH); ctx.lineTo(sx - HW + 8, sy + HH + 4); ctx.lineTo(sx + 8, sy + 4); ctx.fill(); }
    if (tB) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx + HW - 8, sy + HH + 4); ctx.lineTo(sx - 8, sy + 4); ctx.fill(); }
  }
}

const QUEUE = ['#c4dbf1', '#b8d1ea', '#4f8fcf']; // queue line: two paving shades and the rope colour
// A wooden bridge deck one level above the water, with railings on the open sides and posts into the water.
function bridge(ctx, TH, x, y, i, sx, sy, queue) {
  const P = (xx, yy) => inB(xx, yy) && S.path[idx(xx, yy)];
  ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [px, py] of [[sx - HW + 6, sy + HH], [sx + HW - 6, sy + HH], [sx, sy + HH * 2 - 3]]) { ctx.moveTo(px, py); ctx.lineTo(px, py + 15); }
  ctx.stroke();
  ctx.fillStyle = '#8a6540';
  ctx.beginPath(); ctx.moveTo(sx - HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx, sy + HH * 2 + 4); ctx.lineTo(sx - HW, sy + HH + 4); ctx.fill();
  ctx.fillStyle = '#74532f';
  ctx.beginPath(); ctx.moveTo(sx + HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx, sy + HH * 2 + 4); ctx.lineTo(sx + HW, sy + HH + 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + HW, sy + HH); ctx.lineTo(sx, sy + HH * 2); ctx.lineTo(sx - HW, sy + HH); ctx.closePath();
  ctx.fillStyle = queue ? QUEUE[(x + y) & 1] : (x + y) & 1 ? '#d9b383' : '#d0a877'; ctx.fill();
  if (fine) {
    ctx.strokeStyle = 'rgba(90,60,30,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(sx - HW + k * 16, sy + HH - k * 8 + 16 * 0 + 0); ctx.lineTo(sx - HW + k * 16 + HW, sy + HH - k * 8 + HH); }
    ctx.stroke();
  }
  // railings where the bridge does not carry on
  ctx.strokeStyle = queue ? QUEUE[2] : '#f4f1ea'; ctx.lineWidth = 2;
  ctx.beginPath();
  const rail = (ax, ay, bx, by) => { ctx.moveTo(ax, ay - 9); ctx.lineTo(bx, by - 9); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 9); ctx.moveTo(bx, by); ctx.lineTo(bx, by - 9); };
  if (!P(x, y - 1)) rail(sx + 2, sy + 1, sx + HW - 2, sy + HH);
  if (!P(x - 1, y)) rail(sx - 2, sy + 1, sx - HW + 2, sy + HH);
  if (!P(x + 1, y)) rail(sx + HW - 2, sy + HH, sx + 2, sy + HH * 2 - 1);
  if (!P(x, y + 1)) rail(sx - HW + 2, sy + HH, sx - 2, sy + HH * 2 - 1);
  ctx.stroke();
}

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

function drawEntrance(ctx, x, y, he, time) {
  // an arch across the entrance path, at the front edge of the map
  const lx = isoX(x, y + 1), ly = isoY(x, y + 1, he), rx = isoX(x + 1, y + 1), ry = isoY(x + 1, y + 1, he);
  const H = 48;
  for (const [px, py, k] of [[lx, ly, 0], [rx, ry, 1]]) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(px, py + 1, 8, 4, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ef476f';
    ctx.beginPath(); ctx.roundRect(px - 5, py - H, 10, H + 2, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    for (let j = 0; j < 4; j++) ctx.fillRect(px - 5, py - H + 6 + j * 11, 10, 4.5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px + 2, py - H, 3, H + 2);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(px, py - H - 3, 5.5, 0, 6.3); ctx.fill();
    // a pennant on each post
    const wv = Math.sin(time * 4 + k * 2) * 2;
    ctx.strokeStyle = '#5b4636'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, py - H - 7); ctx.lineTo(px, py - H - 22); ctx.stroke();
    ctx.fillStyle = k ? '#06d6a0' : '#3b8ed0';
    ctx.beginPath(); ctx.moveTo(px, py - H - 22); ctx.lineTo(px + 12, py - H - 18 + wv); ctx.lineTo(px, py - H - 14); ctx.fill();
  }
  ctx.fillStyle = '#3b8ed0';
  ctx.beginPath();
  ctx.moveTo(lx - 2, ly - H + 2); ctx.lineTo(rx + 2, ry - H + 2); ctx.lineTo(rx + 2, ry - H + 18); ctx.lineTo(lx - 2, ly - H + 18);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,50,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(lx - 2, ly - H + 2); ctx.lineTo(rx + 2, ry - H + 2); ctx.lineTo(rx + 2, ry - H + 6); ctx.lineTo(lx - 2, ly - H + 6); ctx.fill();
  ctx.save();
  ctx.translate((lx + rx) / 2, (ly + ry) / 2 - H + 10.5);
  ctx.transform(1, (ry - ly) / (rx - lx), 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.font = `900 9px ${FONT}`;
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
function pill(ctx, text, x, y, col, s) {
  ctx.font = `800 ${12 * s}px ${FONT}`;
  const tw = Math.max(18 * s, ctx.measureText(text).width + 12 * s);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 9 * s, tw, 18 * s, 9 * s); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * s);
}
// A round button floating on the map, with an arrow pointing along (ax, ay) on screen.
function handle(ctx, x, y, r, col, ink, ax, ay, s, kind) {
  ctx.fillStyle = 'rgba(20,20,40,0.25)';
  ctx.beginPath(); ctx.arc(x, y + 2.5 * s, r, 0, 6.3); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,50,0.55)'; ctx.lineWidth = 1.6 * s; ctx.stroke();
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.atan2(ay, ax));
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 2) { ctx.moveTo(-5, -6); ctx.lineTo(1, 0); ctx.lineTo(-5, 6); ctx.moveTo(1, -6); ctx.lineTo(7, 0); ctx.lineTo(1, 6); }
  else if (kind === 1) { ctx.moveTo(-2, -6); ctx.lineTo(4, 0); ctx.lineTo(-2, 6); }
  else { ctx.moveTo(-8, 0); ctx.lineTo(7, 0); ctx.moveTo(1, -6); ctx.lineTo(7, 0); ctx.lineTo(1, 6); }
  ctx.stroke();
  ctx.restore();
}

function drawOverlays(ctx, time, ui) {
  const pulse = 0.6 + 0.4 * Math.sin(time * 5), s = 1 / cam.zoom;
  // selected object
  if (ui.sel && ui.sel.kind === 'obj') {
    const o = S.objs[ui.sel.id];
    if (o && o.kind !== 'coaster') outline(ctx, o.x, o.y, o.w, o.h, o.z + 0.05, null, `rgba(255,255,255,${0.5 + 0.4 * pulse})`);
    else if (o) for (const p of o.pieces) if (p.t === 'station') outline(ctx, p.x, p.y, 1, 1, p.h0 + 0.25, null, `rgba(255,255,255,${0.5 + 0.4 * pulse})`);
  }
  // rough spots on the coaster being built or looked at
  const rc = S.objs[ui.editing] || (ui.sel && ui.sel.kind === 'obj' && S.objs[ui.sel.id]);
  if (rc && rc.kind === 'coaster' && rc.closed && rc.sim && rc.sim.ok && rc.I > 8) {
    const sm = rc.sim, lim = Math.max(1.1, sm.maxGl * 0.7);
    ctx.fillStyle = `rgba(255,45,45,${0.35 + 0.3 * pulse})`;
    for (let k = 2; k < sm.segs; k += 2) {
      if (sm.gl[k] > lim || sm.gv[k] > 4.4) { const q = k % sm.n; ctx.beginPath(); ctx.arc(isoX(sm.X[q], sm.Y[q]), isoY(sm.X[q], sm.Y[q], sm.Z[q] + 0.3), 6, 0, 6.3); ctx.fill(); }
    }
  }
  // ghost for the active tool
  const g = ui.ghost;
  if (g) {
    const FILL = ['rgba(255,70,70,0.45)', 'rgba(80,230,140,0.4)'], STROKE = ['#ffe1e1', '#eafff2'];
    const ok = g.ok ? 1 : 0;
    if (g.kind === 'tiles') {
      for (const tl of g.tiles) {
        if (!inB(tl[0], tl[1])) continue;
        const k = tl[2] === undefined ? ok : tl[2] ? 1 : 0;
        outline(ctx, tl[0], tl[1], 1, 1, heff(idx(tl[0], tl[1])) + 0.03, FILL[k], STROKE[k]);
      }
      if (g.label && g.tiles.length) {
        const tl = g.tiles[g.tiles.length - 1];
        if (inB(tl[0], tl[1])) pill(ctx, g.label, isoX(tl[0] + 0.5, tl[1] + 0.5), isoY(tl[0] + 0.5, tl[1] + 0.5, heff(idx(tl[0], tl[1]))) - 22 * s, g.poor ? '#d63a5f' : '#2b2d42', s);
      }
    } else if (g.kind === 'box') {
      const z = inB(g.x, g.y) ? S.h[idx(g.x, g.y)] : 2;
      outline(ctx, g.x, g.y, g.w, g.h, z + 0.03, FILL[ok], STROKE[ok]);
      if (g.draw && ok) {
        ctx.globalAlpha = 0.7;
        setOrigin(isoX(g.x + g.w / 2, g.y + g.h / 2), isoY(g.x + g.w / 2, g.y + g.h / 2, z));
        g.draw(ctx);
        ctx.globalAlpha = 1;
      }
    } else if (g.kind === 'station') {
      for (let k = 0; k < 3; k++) {
        const x = g.x + DX[g.d] * k, y = g.y + DY[g.d] * k;
        if (inB(x, y)) outline(ctx, x, y, 1, 1, S.h[idx(x, y)] + 0.03, FILL[ok], STROKE[ok]);
      }
      const ax = g.x + 0.5 + DX[g.d] * 2.2, ay = g.y + 0.5 + DY[g.d] * 2.2;
      if (inB(g.x, g.y)) arrow(ctx, ax, ay, S.h[idx(g.x, g.y)] + 0.4, g.d, '#fff');
    }
  }
  // the tile you can drag from to draw a line or an area
  if (ui.handle && inB(ui.handle.x, ui.handle.y)) {
    const { x, y } = ui.handle, z = heff(idx(x, y)) + 0.04;
    outline(ctx, x, y, 1, 1, z, `rgba(255,255,255,${0.12 + 0.14 * pulse})`, `rgba(255,255,255,${0.7 + 0.3 * pulse})`);
    const cx = isoX(x + 0.5, y + 0.5), cy = isoY(x + 0.5, y + 0.5, z);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(30,20,50,0.6)'; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.arc(cx, cy, 6 * s, 0, 6.3); ctx.fill(); ctx.stroke();
  }
  // coaster editor: where the next piece goes
  if (ui.editing && ui.pick !== null && ui.pick !== undefined) {
    // the piece picked for changing glows white
    const c = S.objs[ui.editing], sm = c && c.sim;
    if (sm) {
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.35 * pulse})`; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k <= sm.n; k++) {
        const q = k % sm.n;
        if (sm.PI[q] !== ui.pick && !(pen && sm.PI[(k - 1 + sm.n) % sm.n] === ui.pick && (k < sm.n || c.closed))) { pen = false; continue; }
        const x = isoX(sm.X[q], sm.Y[q]), y = isoY(sm.X[q], sm.Y[q], sm.Z[q] + 0.3);
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
        if (sm.PI[q] !== ui.pick) pen = false;
      }
      ctx.stroke();
    }
  }
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
      // mark the station entry so it is clear where the track must come back to
      const f = c.pieces[0];
      arrow(ctx, f.x + 0.5 - DX[f.d] * 0.9, f.y + 0.5 - DY[f.d] * 0.9, f.h0 + 0.5, f.d, '#06d6a0', 0.85);
      // previews of the pieces on offer, each with a button to tap
      const cs = ui.cands;
      if (cs) {
        for (const q of cs) if (q.gc && q.key === ui.hot) drawPiece(ctx, q.gc, 1, q.ok ? 0.8 : 0.3);
        for (const q of cs) {
          const hotOne = q.key === ui.hot, r = (hotOne ? 21 : 18) * s;
          if (q.kind) handle(ctx, q.hx, q.hy, 14 * s, q.on ? '#2b2d42' : '#ffffff', q.on ? '#fff' : '#2b2d42', 0, q.kind === 'up' ? -1 : 1, s, q.two ? 2 : 1);
          else handle(ctx, q.hx, q.hy, r, !q.ok ? '#c9ced8' : q.stall ? '#ffb703' : '#ffd23f', q.ok ? '#2b2d42' : '#8d93a6', q.ax, q.ay, s, 0);
        }
      } else arrow(ctx, e.x + 0.5 - DX[e.d] * 0.25, e.y + 0.5 - DY[e.d] * 0.25, e.h + 0.5, e.d, '#ffd23f', 1 + 0.12 * pulse);
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
      pill(ctx, text, cx, top, col, 1 / Math.max(0.8, cam.zoom));
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

/** A tiny picture of a whole map for the scenario list. m = {h, water, scn, path, theme}. */
export function mapThumb(ctx, m, w, h) {
  const TH = themeOf(m.theme), sx = w / (2 * N), sy = (h - 10) / (2 * N);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, TH.far[0]); g.addColorStop(1, TH.far[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let d = 0; d <= 2 * N - 2; d++) {
    for (let x = Math.max(0, d - N + 1); x <= Math.min(N - 1, d); x++) {
      const y = d - x, i = idx(x, y), z = m.h[i];
      const px = w / 2 + (x - y) * sx, py = 8 + (x + y) * sy - (z - 2) * 1.6;
      ctx.fillStyle = m.water[i] ? TH.water : m.path[i] ? TH.path : m.scn[i] ? shade(TH.pal[Math.min(6, z)][0], -0.28) : TH.pal[Math.min(6, z)][(x + y) & 1];
      ctx.fillRect(px - sx, py, sx * 2 + 0.6, sy * 2 + 0.6 + (z > 2 ? (z - 2) * 1.6 : 0));
    }
  }
}
