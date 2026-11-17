// World state and every way to change it (build, demolish, terrain, money, save/load).
import {
  N, DX, DY, MAX_TERRAIN, BASE_H, RIDES, STALLS, SCENERY, SCN, COASTERS, START_UNLOCKS, RESEARCH,
  START_CASH, RIDE_ORDER, STALL_ORDER, COASTER_ORDER,
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

export function newGame(mode) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, {
    v: 2, mode, sandbox: mode === 'sandbox',
    h: new Uint8Array(N * N).fill(BASE_H), water: new Uint8Array(N * N), path: new Uint8Array(N * N),
    scn: new Uint8Array(N * N), occ: new Int32Array(N * N),
    objs: {}, nextId: 1, trk: new Map(), pv: 1,
    ent: { x: N >> 1, y: N - 1 },
    cash: mode === 'sandbox' ? 0 : START_CASH, loan: 0, fee: 8, open: false,
    time: 0, speed: 1, guests: [], gid: 1, rating: 500, peakGuests: 0,
    unlocked: {}, research: { level: 1, pts: 0, done: 0 },
    goal: 0, goalsDone: false, ach: {}, tut: 0, marketing: 0, turnedAway: 0,
    fin: { cur: {}, last: {} }, thoughts: {}, sceneryCount: 0, sentValue: 0, sentGuests: 0,
    names: {},
  });
  for (const u of START_UNLOCKS) S.unlocked[u] = 1;
  if (S.sandbox) {
    for (const u of [...RIDE_ORDER, ...STALL_ORDER, ...COASTER_ORDER, 'booster']) S.unlocked[u] = 1;
    for (const s of SCENERY) if (s) S.unlocked[s.id] = 1;
    S.research.done = RESEARCH.length;
    S.tut = 99;
  }
  genTerrain();
  countScenery();
  return S;
}

// The first version of the game had a 40 x 40 map. Its area now sits at the front centre of the
// bigger map, so old saves can be dropped in at this offset.
const OLD_N = 40, OLD_OX = (N - OLD_N) >> 1, OLD_OY = N - OLD_N;

function genTerrain() {
  const r = rng(S.sandbox ? 777 : 4242);
  // soft hills around the edges; the middle stays flat for building
  const hills = [[15, 25, 7, 3], [43, 26, 6, 2], [16, 50, 5, 2], [44, 42, 4, 1],
    [6, 6, 8, 4], [52, 8, 8, 3], [4, 37, 5, 2], [56, 35, 6, 3], [54, 55, 5, 2], [29, 3, 5, 2]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let add = 0;
    for (const [hx, hy, rad, amp] of hills) {
      const d = Math.hypot(x - hx, y - hy);
      if (d < rad) add = Math.max(add, Math.round(amp * (1 - d / rad) + 0.2));
    }
    S.h[idx(x, y)] = BASE_H + add;
  }
  // a pond near the entrance and a second one further back
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d1 = Math.hypot((x - 39) * 0.8, y - 51), d2 = Math.hypot((x - 34) * 0.8, y - 14);
    if (d1 < 2.6 || d2 < 2.2) { S.water[idx(x, y)] = 1; S.h[idx(x, y)] = BASE_H - 1; }
  }
  // entrance path
  for (let y = N - 1; y >= N - 5; y--) S.path[idx(S.ent.x, y)] = 1;
  // scattered trees
  for (let i = 0; i < 340; i++) {
    const x = Math.floor(r() * N), y = Math.floor(r() * N), i2 = idx(x, y);
    if (S.water[i2] || S.path[i2] || S.scn[i2]) continue;
    if (Math.abs(x - S.ent.x) < 5 && y > N - 12) continue;
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y) < 4 || S.h[i2] > BASE_H;
    if (!edge && r() < 0.75) continue;
    const t = r();
    S.scn[i2] = t < 0.5 ? SCN.oak : t < 0.8 ? SCN.pine : t < 0.9 ? SCN.bush : SCN.rock;
  }
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
      if (S.path[i] && Math.abs(S.h[i] - z) <= 1 && !seen.has(i)) { seen.add(i); out.push(i); }
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
export function canPath(x, y) {
  if (!inB(x, y)) return no('e_bounds');
  const i = idx(x, y);
  if (S.path[i]) return no('e_same');
  if (S.water[i]) return no('e_water');
  if (S.occ[i]) return no('e_blocked');
  if (minTrackZ(i) - S.h[i] < 2) return no('e_track');
  if (!canAfford(10)) return no('e_money');
  return OK;
}
export function placePath(x, y) {
  const r = canPath(x, y);
  if (!r.ok) return r;
  const i = idx(x, y);
  if (S.scn[i]) { S.scn[i] = 0; S.sceneryCount--; }
  S.path[i] = 1; S.pv++;
  spend(10, 'build');
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
    num: nameFor(type), customers: 0, income: 0,
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
  S.h[idx(x, y)] += delta; S.pv++;
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
  S.pv++;
  spend(30, 'build');
  return OK;
}
export function countWater() {
  let n = 0;
  for (let i = 0; i < N * N; i++) if (S.water[i]) n++;
  return n;
}

// ---------- coaster track registry ----------
/** Tiles and height range a piece occupies. */
export function pieceCells(p) {
  const z0 = Math.min(p.h0, p.h1), z1 = Math.max(p.h0, p.h1);
  if (p.t === 'loop') {
    return [
      { i: idx(p.x, p.y), z0, z1: z0 + 5 },
      { i: idx(p.x + DX[p.d], p.y + DY[p.d]), z0, z1: z0 + 5 },
    ];
  }
  return [{ i: idx(p.x, p.y), z0, z1 }];
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

// ---------- save / load ----------
const enc = (a) => { let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(48 + a[i]); return s; };
const dec = (s, a) => { for (let i = 0; i < a.length; i++) a[i] = (s.charCodeAt(i) || 48) - 48; return a; };

export function serialize() {
  const objs = [];
  for (const id in S.objs) {
    const o = S.objs[id];
    const c = { ...o, queue: [], riders: [], st: 'idle', timer: 0 };
    delete c.sim; delete c.geo; delete c.test;
    if (c.pieces) c.pieces = c.pieces.map((p) => ({ t: p.t, x: p.x, y: p.y, d: p.d, h0: p.h0, h1: p.h1, chain: p.chain ? 1 : 0, bank: p.bank ? 1 : 0, cost: p.cost || 0 }));
    objs.push(c);
  }
  return {
    v: 2, n: N, mode: S.mode, h: enc(S.h), water: enc(S.water), path: enc(S.path), scn: enc(S.scn), objs,
    nextId: S.nextId, cash: S.cash, loan: S.loan, fee: S.fee, open: S.open, time: S.time,
    rating: S.rating, peakGuests: S.peakGuests, unlocked: S.unlocked, research: S.research, goal: S.goal,
    goalsDone: S.goalsDone, ach: S.ach, tut: S.tut, marketing: S.marketing, fin: S.fin, names: S.names,
    guestCount: S.guests.length, sentValue: S.sentValue, sentGuests: S.sentGuests,
  };
}
export function deserialize(d) {
  newGame(d.mode);
  const n = d.n || OLD_N;
  let ox = 0, oy = 0;
  if (n === N) { dec(d.h, S.h); dec(d.water, S.water); dec(d.path, S.path); dec(d.scn, S.scn); }
  else {
    // a park saved on the smaller map: place it at the front centre of the new one
    ox = (N - n) >> 1; oy = N - n;
    for (const k of ['h', 'water', 'path', 'scn']) {
      const old = dec(d[k], new Uint8Array(n * n));
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) S[k][idx(x + ox, y + oy)] = old[x + y * n];
    }
  }
  S.occ.fill(0);
  for (const o of d.objs) {
    if (o.kind === 'coaster') { for (const p of o.pieces) { p.x += ox; p.y += oy; } }
    o.x += ox; o.y += oy;
    S.objs[o.id] = o;
    o.queue = []; o.riders = []; o.st = 'idle'; o.timer = 0;
    if (o.kind !== 'coaster') for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) S.occ[idx(o.x + i, o.y + j)] = o.id;
  }
  for (const k of ['nextId', 'cash', 'loan', 'fee', 'open', 'time', 'rating', 'peakGuests', 'unlocked',
    'research', 'goal', 'goalsDone', 'ach', 'tut', 'marketing', 'fin', 'names', 'sentValue', 'sentGuests']) {
    if (d[k] !== undefined) S[k] = d[k];
  }
  S.restoreGuests = Math.min(d.guestCount || 0, 400);
  rebuildTrackRegistry();
  countScenery();
  S.pv++;
  return S;
}

export { COASTERS };
