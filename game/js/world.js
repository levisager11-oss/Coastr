// World state and every way to change it (build, demolish, terrain, money, save/load).
import {
  N, DX, DY, MAX_TERRAIN, BASE_H, RIDES, STALLS, SCENERY, SCN, COASTERS, START_UNLOCKS, RESEARCH,
  RIDE_ORDER, STALL_ORDER, COASTER_ORDER, SCENARIOS,
} from './data.js';

export const S = {}; // the one mutable game state; filled by newGame / loadGame
export const events = []; // queued notifications for the UI: {type, ...}
export const emit = (type, data = {}) => { events.push({ type, ...data }); };

export const idx = (x, y) => x + y * N;
export const inB = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const OK = { ok: true };
const no = (why) => ({ ok: false, why });

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function newGame(mode, scenario) {
  const sc = SCENARIOS[scenario] ? scenario : 'meadows', SC = SCENARIOS[sc];
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, {
    v: 2, mode, sc, theme: SC.theme, sandbox: mode === 'sandbox',
    h: new Uint8Array(N * N).fill(BASE_H), water: new Uint8Array(N * N), path: new Uint8Array(N * N),
    scn: new Uint8Array(N * N), occ: new Int32Array(N * N),
    objs: {}, nextId: 1, trk: new Map(), pv: 1, tv: 1,
    ent: { x: N >> 1, y: N - 1 },
    cash: mode === 'sandbox' ? 0 : SC.cash, loan: 0, fee: 8, open: false,
    time: 0, speed: 1, guests: [], gid: 1, rating: 500, peakGuests: 0,
    unlocked: {}, research: { level: 1, pts: 0, done: 0 },
    goal: 0, goalsDone: false, stars: 0, ach: {}, tut: 0, marketing: 0, turnedAway: 0,
    fin: { cur: {}, last: {} }, thoughts: {}, sceneryCount: 0, sentValue: 0, sentGuests: 0,
    names: {}, wx: { kind: 'sun', t: 90 }, event: null, evNext: 260, yr: { guests: 0, income: 0, peak: 0 }, awards: {},
  });
  for (const u of [...START_UNLOCKS, ...SC.extra]) S.unlocked[u] = 1;
  if (S.sandbox) { unlockAll(); S.tut = 99; }
  genTerrain(sc);
  countScenery();
  return S;
}
function unlockAll() {
  for (const u of [...RIDE_ORDER, ...STALL_ORDER, ...COASTER_ORDER, 'booster']) S.unlocked[u] = 1;
  for (const s of SCENERY) if (s) S.unlocked[s.id] = 1;
  S.research.done = RESEARCH.length;
}

// The first version of the game had a 40 x 40 map. Its area now sits at the front centre of the
// bigger map, so old saves can be dropped in at this offset.
const OLD_N = 40;

// One entry per scenario: hills as [x, y, radius, height], a water test, how many trees to try and
// which kinds (cumulative chances). The area in front of the entrance always stays flat and dry.
const MAPS = {
  meadows: {
    seed: 4242, trees: 340, mix: [['oak', 0.5], ['pine', 0.8], ['bush', 0.9], ['rock', 1]],
    hills: [[15, 25, 7, 3], [43, 26, 6, 2], [16, 50, 5, 2], [44, 42, 4, 1],
      [6, 6, 8, 4], [52, 8, 8, 3], [4, 37, 5, 2], [56, 35, 6, 3], [54, 55, 5, 2], [29, 3, 5, 2]],
    water: (x, y) => Math.hypot((x - 39) * 0.8, y - 51) < 2.6 || Math.hypot((x - 34) * 0.8, y - 14) < 2.2,
  },
  lake: {
    seed: 1717, trees: 300, mix: [['pine', 0.45], ['oak', 0.8], ['bush', 0.92], ['rock', 1]],
    hills: [[5, 5, 8, 3], [55, 6, 8, 3], [3, 30, 6, 2], [57, 30, 6, 2], [8, 53, 5, 1], [52, 53, 5, 1]],
    water: (x, y) => Math.hypot((x - 30) / 17, (y - 24) / 12.5) < 1 && !lakeIsle(x, y),
    extra: (x, y, r) => (lakeIsle(x, y) && r() < 0.3 ? 'palm' : null),
  },
  dunes: {
    seed: 909, trees: 230, mix: [['cactus', 0.5], ['rock', 0.78], ['bush', 0.9], ['palm', 1]], open: 0.45,
    hills: [[10, 12, 7, 2], [24, 8, 6, 2], [40, 10, 7, 3], [52, 18, 6, 2], [8, 30, 6, 2], [20, 26, 5, 1], [48, 32, 7, 2],
      [36, 24, 5, 1], [12, 46, 5, 2], [50, 48, 6, 2], [30, 3, 5, 2], [56, 5, 5, 3], [4, 56, 4, 1]],
    water: (x, y) => Math.hypot((x - 19) * 0.9, y - 39) < 2.4,
    extra: (x, y, r) => { const d = Math.hypot((x - 19) * 0.9, y - 39); return d >= 2.4 && d < 4.3 && r() < 0.45 ? 'palm' : null; },
  },
  frost: {
    seed: 3131, trees: 400, mix: [['snowpine', 0.72], ['rock', 0.86], ['pine', 0.96], ['bush', 1]],
    hills: [[30, 20, 15, 6], [12, 9, 8, 3], [49, 9, 8, 4], [6, 34, 6, 2], [55, 36, 6, 2], [47, 44, 4, 1]],
    water: (x, y) => Math.hypot((x - 46) * 0.85, y - 52) < 2.8 || Math.hypot(x - 12, (y - 48) * 1.2) < 2.2,
  },
};
function lakeIsle(x, y) { return Math.hypot(x - 22, y - 22) < 4.3 || Math.hypot(x - 39, y - 27) < 3.7; }

function genTerrain(sc) {
  const M = MAPS[sc] || MAPS.meadows, r = rng(M.seed);
  const front = (x, y) => Math.abs(x - S.ent.x) <= 5 && y >= N - 12;
  // soft hills; the middle stays mostly flat for building
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let add = 0;
    if (!front(x, y)) {
      for (const [hx, hy, rad, amp] of M.hills) {
        const d = Math.hypot(x - hx, y - hy);
        if (d < rad) add = Math.max(add, Math.round(amp * (1 - d / rad) + 0.2));
      }
    }
    S.h[idx(x, y)] = Math.min(MAX_TERRAIN, BASE_H + add);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!front(x, y) && M.water(x, y)) { S.water[idx(x, y)] = 1; S.h[idx(x, y)] = BASE_H - 1; }
  }
  // entrance path
  for (let y = N - 1; y >= N - 5; y--) S.path[idx(S.ent.x, y)] = 1;
  // scattered trees, mostly round the edges and on the hills
  for (let i = 0; i < M.trees; i++) {
    const x = Math.floor(r() * N), y = Math.floor(r() * N), i2 = idx(x, y);
    if (S.water[i2] || S.path[i2] || S.scn[i2]) continue;
    if (Math.abs(x - S.ent.x) < 5 && y > N - 12) continue;
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y) < 4 || S.h[i2] > BASE_H;
    if (!edge && r() < (M.open === undefined ? 0.75 : 1 - M.open)) continue;
    const t = r();
    S.scn[i2] = SCN[M.mix.find((m) => t < m[1])[0]];
  }
  if (M.extra) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i2 = idx(x, y);
      if (S.water[i2] || S.path[i2] || front(x, y)) continue;
      const id = M.extra(x, y, r);
      if (id) S.scn[i2] = SCN[id];
    }
  }
}
/** A small picture of a scenario's map for the menu: returns {h, water, scn} without touching the game. */
export function previewMap(sc) {
  const keep = { ...S };
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, { h: new Uint8Array(N * N).fill(BASE_H), water: new Uint8Array(N * N), path: new Uint8Array(N * N), scn: new Uint8Array(N * N), ent: { x: N >> 1, y: N - 1 } });
  genTerrain(sc);
  const out = { h: S.h, water: S.water, scn: S.scn, path: S.path, theme: SCENARIOS[sc].theme };
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, keep);
  return out;
}

// ---------- money ----------
export function canAfford(n) { return S.sandbox || S.cash >= n; }
export function spend(n, cat) {
  if (!S.sandbox) S.cash -= n;
  S.fin.cur[cat] = (S.fin.cur[cat] || 0) - n;
}
export function earn(n, cat) {
  if (!S.sandbox) S.cash += n;
  S.fin.cur[cat] = (S.fin.cur[cat] || 0) + n;
}

// ---------- queries ----------
export function footprint(type, x, y, rot) {
  const d = RIDES[type];
  const w = rot % 2 ? d.h : d.w, h = rot % 2 ? d.w : d.h;
  return { x, y, w, h };
}
export function trackAt(i) { return S.trk.get(i); }
export function minTrackZ(i) {
  const t = S.trk.get(i);
  if (!t) return Infinity;
  let m = Infinity;
  for (const s of t) if (s.z0 < m) m = s.z0;
  return m;
}
/** Tiles of an object (ride, stall or coaster station) guests can walk next to. */
export function objTiles(o) {
  const out = [];
  if (o.kind === 'coaster') {
    for (const p of o.pieces) if (p.t === 'station') out.push([p.x, p.y, p.h0]);
  } else {
    for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) out.push([o.x + i, o.y + j, o.z]);
  }
  return out;
}
/** Path tiles next to an object where guests get on. */
export function accessTiles(o) {
  const out = [], seen = new Set();
  for (const [x, y, z] of objTiles(o)) {
    for (let d = 0; d < 4; d++) {
      const ax = x + DX[d], ay = y + DY[d];
      if (!inB(ax, ay)) continue;
      const i = idx(ax, ay);
      if (S.path[i] && Math.abs(walkH(i) - z) <= 1 && !seen.has(i)) { seen.add(i); out.push(i); }
    }
  }
  return out;
}
export function objValue(o) {
  if (o.kind === 'coaster') return o.cost || 0;
  return (o.kind === 'ride' ? RIDES[o.type] : STALLS[o.type]).cost;
}
export function assetValue() {
  let v = 0;
  for (const id in S.objs) v += objValue(S.objs[id]);
  let p = 0;
  for (let i = 0; i < N * N; i++) { if (S.path[i]) p += 10; if (S.scn[i]) p += SCENERY[S.scn[i]].cost; }
  return v + p;
}
export function parkValue() { return Math.round(assetValue() + (S.sandbox ? 0 : S.cash - S.loan)); }

// ---------- paths ----------
/** Height guests walk at on a tile: a path over water is a bridge one level above the water's bed. */
export const walkH = (i) => S.h[i] + (S.water[i] && S.path[i] ? 1 : 0);
/** What a piece of path costs here. kind 1 = path, 2 = queue line; over water it is a bridge. */
export function pathCost(x, y, kind = 1) {
  const i = idx(x, y);
  if (S.path[i]) return 2; // only changing its kind
  return S.water[i] ? 30 : kind === 2 ? 12 : 10;
}
export function canPath(x, y, kind = 1) {
  if (!inB(x, y)) return no('e_bounds');
  const i = idx(x, y);
  if (S.path[i] === kind) return no('e_same');
  if (x === S.ent.x && y === S.ent.y) return no('e_entrance');
  if (S.occ[i]) return no('e_blocked');
  if (minTrackZ(i) - (S.h[i] + (S.water[i] ? 1 : 0)) < 2) return no('e_track');
  if (!canAfford(pathCost(x, y, kind))) return no('e_money');
  return OK;
}
export function placePath(x, y, kind = 1) {
  const r = canPath(x, y, kind);
  if (!r.ok) return r;
  const i = idx(x, y), cost = pathCost(x, y, kind);
  if (S.scn[i]) { S.scn[i] = 0; S.sceneryCount--; }
  S.path[i] = kind; S.pv++;
  spend(cost, 'build');
  return OK;
}
export function removePath(x, y) {
  const i = idx(x, y);
  if (!S.path[i]) return no('e_none');
  if (x === S.ent.x && y === S.ent.y) return no('e_entrance');
  S.path[i] = 0; S.pv++;
  earn(5, 'build');
  return OK;
}

// ---------- rides and stalls ----------
export function canPlaceBox(x, y, w, h, cost) {
  let z = -1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inB(x + i, y + j)) return no('e_bounds');
    const k = idx(x + i, y + j);
    if (S.water[k]) return no('e_water');
    if (S.path[k] || S.occ[k]) return no('e_blocked');
    if (S.trk.has(k)) return no('e_track');
    if (z < 0) z = S.h[k]; else if (S.h[k] !== z) return no('e_flat');
  }
  if (!canAfford(cost)) return no('e_money');
  return { ok: true, z };
}
function claim(o) {
  for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) {
    const k = idx(o.x + i, o.y + j);
    S.occ[k] = o.id;
    if (S.scn[k]) { S.scn[k] = 0; S.sceneryCount--; }
  }
  S.objs[o.id] = o; S.pv++;
}
export function nameFor(type) {
  S.names[type] = (S.names[type] || 0) + 1;
  return S.names[type];
}
export function placeRide(type, x, y, rot) {
  const d = RIDES[type], f = footprint(type, x, y, rot);
  const r = canPlaceBox(f.x, f.y, f.w, f.h, d.cost);
  if (!r.ok) return r;
  const o = {
    id: S.nextId++, kind: 'ride', type, x: f.x, y: f.y, w: f.w, h: f.h, rot: rot % 2, z: r.z,
    price: d.price, open: true, queue: [], riders: [], st: 'idle', timer: 0, anim: 0,
    num: nameFor(type), customers: 0, income: 0, born: S.time,
  };
  claim(o); spend(d.cost, 'build');
  emit('built', { kind: 'ride', id: o.id });
  return { ok: true, obj: o };
}
export function placeStall(type, x, y) {
  const d = STALLS[type];
  const r = canPlaceBox(x, y, 1, 1, d.cost);
  if (!r.ok) return r;
  const o = {
    id: S.nextId++, kind: 'stall', type, x, y, w: 1, h: 1, z: r.z, price: d.price, open: true,
    num: nameFor(type), customers: 0, income: 0,
  };
  claim(o); spend(d.cost, 'build');
  emit('built', { kind: 'stall', id: o.id });
  return { ok: true, obj: o };
}
export function removeObj(id, refund = true) {
  const o = S.objs[id];
  if (!o) return no('e_none');
  if (o.kind === 'coaster') {
    for (const [k, list] of S.trk) {
      const rest = list.filter((s) => s.c !== id);
      if (rest.length) S.trk.set(k, rest); else S.trk.delete(k);
    }
  } else {
    for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) S.occ[idx(o.x + i, o.y + j)] = 0;
  }
  if (refund) earn(Math.round(objValue(o) * 0.5), 'build');
  // release guests who were on or waiting for it
  for (const g of S.guests) {
    if (g.obj === id) { g.obj = 0; g.st = 'walk'; g.target = null; }
    else if (g.target && g.target.id === id) g.target = null;
  }
  delete S.objs[id]; S.pv++;
  emit('removed', { id });
  return OK;
}

// ---------- scenery ----------
export function canScenery(code, x, y) {
  if (!inB(x, y)) return no('e_bounds');
  const i = idx(x, y), d = SCENERY[code];
  if (S.water[i]) return no('e_water');
  if (S.path[i] || S.occ[i]) return no('e_blocked');
  if (S.scn[i] === code) return no('e_same');
  if (minTrackZ(i) - S.h[i] < 3) return no('e_track');
  if (!canAfford(d.cost)) return no('e_money');
  return OK;
}
export function placeScenery(code, x, y) {
  const r = canScenery(code, x, y);
  if (!r.ok) return r;
  const i = idx(x, y);
  if (!S.scn[i]) S.sceneryCount++;
  S.scn[i] = code; S.pv++;
  spend(SCENERY[code].cost, 'build');
  return OK;
}
export function removeScenery(x, y) {
  const i = idx(x, y);
  if (!S.scn[i]) return no('e_none');
  S.scn[i] = 0; S.sceneryCount--; S.pv++;
  return OK;
}
export function countScenery() {
  let n = 0;
  for (let i = 0; i < N * N; i++) if (S.scn[i]) n++;
  S.sceneryCount = n;
}

// ---------- terrain ----------
export function canTerrain(x, y, delta) {
  if (!inB(x, y)) return no('e_bounds');
  const i = idx(x, y), nh = S.h[i] + delta;
  if (nh < 0 || nh > MAX_TERRAIN) return no('e_limit');
  if (S.occ[i]) return no('e_blocked');
  if (x === S.ent.x && y === S.ent.y) return no('e_entrance');
  if (delta > 0) {
    const mz = minTrackZ(i);
    if (S.path[i] ? mz - nh < 2 : mz < nh) return no('e_track');
  }
  if (S.trk.has(i)) {
    // never lift or drop the ground under a station
    for (const s of S.trk.get(i)) if (s.station) return no('e_blocked');
  }
  if (!canAfford(20)) return no('e_money');
  return OK;
}
export function terrain(x, y, delta) {
  const r = canTerrain(x, y, delta);
  if (!r.ok) return r;
  S.h[idx(x, y)] += delta; S.pv++; S.tv++;
  spend(20, 'build');
  return OK;
}
export function canWater(x, y, on) {
  if (!inB(x, y)) return no('e_bounds');
  const i = idx(x, y);
  if (!!S.water[i] === on) return no('e_same');
  if (on) {
    if (S.path[i] || S.occ[i]) return no('e_blocked');
    if (S.trk.has(i)) for (const s of S.trk.get(i)) if (s.station || s.z0 - S.h[i] < 1) return no('e_track');
  }
  if (!canAfford(30)) return no('e_money');
  return OK;
}
export function setWater(x, y, on) {
  const r = canWater(x, y, on);
  if (!r.ok) return r;
  const i = idx(x, y);
  S.water[i] = on ? 1 : 0;
  if (on && S.scn[i]) { S.scn[i] = 0; S.sceneryCount--; }
  S.pv++; S.tv++;
  spend(30, 'build');
  return OK;
}
export function countWater() {
  let n = 0;
  for (let i = 0; i < N * N; i++) if (S.water[i]) n++;
  return n;
}

// ---------- coaster track registry ----------
/** Tiles a piece lies on, as [x, y] pairs (they may be outside the map). */
export function pieceTiles(p) {
  const fx = DX[p.d], fy = DY[p.d];
  if (p.t === 'loop' || p.t === 'cork') return [[p.x, p.y], [p.x + fx, p.y + fy]];
  if (p.t === 'wl' || p.t === 'wr') {
    const ed = (p.d + (p.t === 'wl' ? 3 : 1)) % 4;
    return [[p.x, p.y], [p.x + fx, p.y + fy], [p.x + fx + DX[ed], p.y + fy + DY[ed]]];
  }
  return [[p.x, p.y]];
}
/** Tiles and height range a piece occupies. */
export function pieceCells(p) {
  const z0 = Math.min(p.h0, p.h1);
  const z1 = p.t === 'loop' ? z0 + 5 : p.t === 'cork' ? z0 + 3 : Math.max(p.h0, p.h1);
  return pieceTiles(p).map(([x, y]) => ({ i: idx(x, y), z0, z1 }));
}
export function registerPiece(c, pi) {
  const p = c.pieces[pi];
  for (const cell of pieceCells(p)) {
    let list = S.trk.get(cell.i);
    if (!list) { list = []; S.trk.set(cell.i, list); }
    list.push({ c: c.id, p: pi, z0: cell.z0, z1: cell.z1, station: p.t === 'station' });
  }
}
export function unregisterPiece(c, pi) {
  const p = c.pieces[pi];
  for (const cell of pieceCells(p)) {
    const list = S.trk.get(cell.i);
    if (!list) continue;
    const rest = list.filter((s) => !(s.c === c.id && s.p === pi));
    if (rest.length) S.trk.set(cell.i, rest); else S.trk.delete(cell.i);
  }
}
export function rebuildTrackRegistry() {
  S.trk = new Map();
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'coaster') for (let i = 0; i < o.pieces.length; i++) registerPiece(o, i);
  }
}

// ---------- demolish ----------
/** What the bulldozer would remove at a tile: {kind, id?} or null. */
export function whatAt(x, y) {
  if (!inB(x, y)) return null;
  const i = idx(x, y);
  if (S.occ[i]) return { kind: 'obj', id: S.occ[i] };
  if (S.scn[i]) return { kind: 'scenery' };
  if (S.path[i]) return { kind: 'path' };
  const t = S.trk.get(i);
  if (t) return { kind: 'coaster', id: t[t.length - 1].c };
  return null;
}

// ---------- undo for the last thing built ----------
/** Remember these tiles and the money, so the next build can be taken back. Set .delta (money spent) afterwards. */
export function snapshot(tiles) {
  return {
    cash: S.cash, delta: 0, nextId: S.nextId, names: { ...S.names },
    tiles: tiles.map((i) => [i, S.h[i], S.water[i], S.path[i], S.scn[i]]),
  };
}
export function restore(snap) {
  for (const id of Object.keys(S.objs)) if (+id >= snap.nextId) removeObj(+id, false);
  for (const [i, h, w, p, sc] of snap.tiles) { S.h[i] = h; S.water[i] = w; S.path[i] = p; S.scn[i] = sc; }
  // hand back what was spent, without touching what the park earned in the meantime
  S.cash -= snap.delta; S.fin.cur.build = (S.fin.cur.build || 0) - snap.delta; S.names = snap.names;
  countScenery();
  S.pv++; S.tv++;
}

// ---------- save / load ----------
// Map layers are saved as text: one character per tile in old saves, run-length pairs
// (value, count) in new ones, which is about ten times smaller.
const dec = (s, a) => { for (let i = 0; i < a.length; i++) a[i] = (s.charCodeAt(i) || 48) - 48; return a; };
const encR = (a) => {
  let s = '';
  for (let i = 0; i < a.length;) {
    let n = 1;
    while (n < 50 && i + n < a.length && a[i + n] === a[i]) n++;
    s += String.fromCharCode(48 + a[i], 40 + n);
    i += n;
  }
  return s;
};
const decR = (s, a) => {
  let i = 0;
  for (let k = 0; k + 1 < s.length && i < a.length; k += 2) {
    const v = s.charCodeAt(k) - 48, n = s.charCodeAt(k + 1) - 40;
    for (let j = 0; j < n && i < a.length; j++) a[i++] = v;
  }
  return a;
};

export function serialize() {
  const objs = [];
  for (const id in S.objs) {
    const o = S.objs[id];
    const c = { ...o, queue: [], riders: [], st: 'idle', timer: 0 };
    delete c.sim; delete c.geo; delete c.test; delete c.pop; delete c.spin; delete c.anim; delete c.noAccess; delete c.runs; delete c.gap; delete c.load;
    if (c.pieces) c.pieces = c.pieces.map((p) => ({ t: p.t, x: p.x, y: p.y, d: p.d, h0: p.h0, h1: p.h1, chain: p.chain ? 1 : 0, bank: p.bank ? 1 : 0, cost: p.cost || 0 }));
    objs.push(c);
  }
  return {
    v: 2, n: N, rle: 1, mode: S.mode, sc: S.sc, h: encR(S.h), water: encR(S.water), path: encR(S.path), scn: encR(S.scn), objs,
    nextId: S.nextId, cash: S.cash, loan: S.loan, fee: S.fee, open: S.open, time: S.time,
    rating: S.rating, peakGuests: S.peakGuests, unlocked: S.unlocked, research: S.research, goal: S.goal,
    goalsDone: S.goalsDone, stars: S.stars, ach: S.ach, tut: S.tut, marketing: S.marketing, fin: S.fin, names: S.names,
    guestCount: S.guests.length, sentValue: S.sentValue, sentGuests: S.sentGuests, wx: S.wx,
    event: S.event, evNext: S.evNext, yr: S.yr, awards: S.awards,
  };
}
export function deserialize(d) {
  newGame(d.mode, d.sc);
  const n = d.n || OLD_N, rd = d.rle ? decR : dec;
  let ox = 0, oy = 0;
  if (n === N) { for (const k of ['h', 'water', 'path', 'scn']) rd(d[k], S[k]); }
  else {
    // a park saved on the smaller map: place it at the front centre of the new one
    ox = (N - n) >> 1; oy = N - n;
    for (const k of ['h', 'water', 'path', 'scn']) {
      const old = rd(d[k], new Uint8Array(n * n));
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) S[k][idx(x + ox, y + oy)] = old[x + y * n];
    }
  }
  for (let i = 0; i < N * N; i++) if (!SCENERY[S.scn[i]]) S.scn[i] = 0; // a code this version does not know
  S.occ.fill(0);
  for (const o of d.objs) {
    if (o.kind === 'coaster') { for (const p of o.pieces) { p.x += ox; p.y += oy; } }
    o.x += ox; o.y += oy;
    S.objs[o.id] = o;
    o.queue = []; o.riders = []; o.runs = []; o.st = 'idle'; o.timer = 0;
    if (o.kind !== 'coaster') for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) S.occ[idx(o.x + i, o.y + j)] = o.id;
  }
  for (const k of ['nextId', 'cash', 'loan', 'fee', 'open', 'time', 'rating', 'peakGuests', 'unlocked',
    'research', 'goal', 'goalsDone', 'stars', 'ach', 'tut', 'marketing', 'fin', 'names', 'sentValue', 'sentGuests', 'wx',
    'event', 'evNext', 'yr', 'awards']) {
    if (d[k] !== undefined) S[k] = d[k];
  }
  if (S.sandbox) unlockAll(); // things added to the game since this park was saved
  S.restoreGuests = Math.min(d.guestCount || 0, 400);
  rebuildTrackRegistry();
  countScenery();
  S.pv++;
  return S;
}

export { COASTERS };
