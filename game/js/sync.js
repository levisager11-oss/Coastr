// Keeping one park the same on several devices (see net.js for the connection).
// diff() says what changed here since the last look; apply() takes in what changed elsewhere.
// The host's game runs the park: money, time, goals, research and the rating come from it in
// hostState(); everything that is built, removed or set by a player goes both ways as a diff.
// Never touches the DOM, so it runs in Node too.
import { N, MAX_TERRAIN, SCENERY, RIDES, STALLS, COASTERS } from './data.js';
import { S, net, emit, removeObj, registerPiece, unregisterPiece, countScenery, idx } from './world.js';
import { recompute } from './coaster.js';
import { coasterCap } from './sim.js';

const LAYERS = ['h', 'water', 'path', 'scn'];
// fields of an object that only matter while the game runs, are worked out again from the rest,
// or are counted by the host's game alone (customers, income)
const SKIP = new Set(['queue', 'riders', 'st', 'timer', 'sim', 'geo', 'test', 'pop', 'spin', 'anim', 'noAccess', 'runs', 'gap',
  'load', 'runT', 'capacity', 'customers', 'income', 'pieces']);
// A track's ratings count the scenery round it when they are worked out, so two games can come
// to slightly different numbers. They are shared as they are, and kept when the track is worked out again here.
const RATING = ['E', 'I', 'Q', 'loops', 'inv', 'price'];
/** The ratings of the coasters in a list of saved objects (call before loading them: loading works them out again). */
export const ratingsOf = (objs) => objs.filter((o) => o.kind === 'coaster').map((o) => [o.id, ...RATING.map((k) => o[k])]);
export function putRatings(list) {
  for (const [id, ...v] of list) {
    const o = S.objs[id];
    if (o) RATING.forEach((k, i) => { if (v[i] !== undefined) o[k] = v[i]; });
  }
}
// settings any player can change; names holds the running numbers of ride names
const SETS = ['fee', 'open', 'name', 'marketing', 'speed', 'rlevel', 'names'];
// what the host's game keeps up to date and sends about once a second
const HOST_KEYS = ['cash', 'loan', 'rating', 'peakGuests', 'unlocked', 'goal', 'goalsDone', 'stars', 'ach', 'fin', 'wx', 'event',
  'evNext', 'yr', 'awards', 'thoughts', 'turnedAway'];

const pieceRow = (p) => [p.t, p.x, p.y, p.d, p.h0, p.h1, p.chain ? 1 : 0, p.bank ? 1 : 0, p.cost || 0];
const rowPiece = ([t, x, y, d, h0, h1, chain, bank, cost]) => ({ t, x, y, d, h0, h1, chain: !!chain, bank: !!bank, cost });
/** What of an object is shared, with its keys in a fixed order so two copies can be compared as text. */
function persist(o) {
  const out = {}, isC = o.kind === 'coaster';
  for (const k of Object.keys(o).sort()) {
    if (SKIP.has(k) || (isC && (k === 'x' || k === 'y'))) continue;
    const v = o[k];
    if (v !== undefined && typeof v !== 'function') out[k] = v;
  }
  if (o.pieces) out.pieces = o.pieces.map(pieceRow);
  return out;
}
const sigOf = (o) => JSON.stringify(persist(o));
const getSet = (k) => (k === 'rlevel' ? S.research.level : S[k]);
function putSet(k, v) {
  if (k === 'rlevel') S.research.level = v;
  else if (k === 'names') { if (!S.names) S.names = {}; for (const t in v) S.names[t] = Math.max(S.names[t] || 0, v[t]); }
  else S[k] = v;
}

// what the park looked like at the last diff or apply
let base = null, seq = 0, stats = new Map();
// for each tile ('t' + index), object ('o' + id) and setting ('s' + key): our last message that held it
const sent = new Map();

/** Start comparing from the park as it is now. */
export function resetSync() {
  base = { objs: new Map(), set: {}, cash: S.cash, loan: S.loan, fin: { ...S.fin.cur } };
  for (const k of LAYERS) base[k] = S[k].slice();
  for (const id in S.objs) base.objs.set(+id, sigOf(S.objs[id]));
  for (const k of SETS) base.set[k] = JSON.stringify(getSet(k));
  seq = 0; sent.clear(); stats = new Map();
}
export const lastSeq = () => seq;

/** What changed here since the last look, or null. deltas: also the money spent here (a guest's game sends it to the host). */
export function diff(deltas) {
  if (!base) return null;
  const d = {}, tiles = [];
  const { h, water, path, scn } = S, bh = base.h, bw = base.water, bp = base.path, bs = base.scn;
  for (let i = 0; i < N * N; i++) {
    if (h[i] !== bh[i] || water[i] !== bw[i] || path[i] !== bp[i] || scn[i] !== bs[i]) {
      tiles.push([i, h[i], water[i], path[i], scn[i]]);
      bh[i] = h[i]; bw[i] = water[i]; bp[i] = path[i]; bs[i] = scn[i];
    }
  }
  if (tiles.length) d.tiles = tiles;
  const objs = [], del = [];
  for (const id in S.objs) {
    const p = persist(S.objs[id]), sg = JSON.stringify(p);
    if (base.objs.get(+id) !== sg) { objs.push(p); base.objs.set(+id, sg); }
  }
  for (const id of base.objs.keys()) if (!S.objs[id]) del.push(id);
  for (const id of del) base.objs.delete(id);
  if (objs.length) d.objs = objs;
  if (del.length) d.del = del;
  for (const k of SETS) {
    const v = getSet(k), j = JSON.stringify(v);
    if (j !== base.set[k]) { (d.set || (d.set = {}))[k] = v; base.set[k] = j; }
  }
  if (deltas) {
    if (S.cash !== base.cash) { d.dc = S.cash - base.cash; base.cash = S.cash; }
    if (S.loan !== base.loan) { d.dl = S.loan - base.loan; base.loan = S.loan; }
    const cur = S.fin.cur, df = {};
    let any = false;
    for (const k of new Set([...Object.keys(cur), ...Object.keys(base.fin)])) {
      const v = (cur[k] || 0) - (base.fin[k] || 0);
      if (v) { df[k] = v; any = true; }
    }
    if (any) { d.df = df; base.fin = { ...cur }; }
  }
  if (!Object.keys(d).length) return null;
  d.seq = ++seq;
  for (const tl of tiles) sent.set('t' + tl[0], seq);
  for (const p of objs) sent.set('o' + p.id, seq);
  for (const id of del) sent.set('o' + id, seq);
  for (const k in d.set || {}) sent.set('s' + k, seq);
  return d;
}

/** Take in a diff made by player `by`. On the host it also brings in the money that player spent.
 *  Our own diffs come back too (in the host's order); a part we have changed again since is left as it is here. */
export function apply(d, by, host) {
  if (!base) return;
  const old = (k) => by === net.slot && (sent.get(k) || 0) > d.seq;
  if (d.tiles) {
    let tv = false, any = false;
    for (const [i, h0, w0, p0, s0] of d.tiles) {
      if (!(i >= 0 && i < N * N) || old('t' + i)) continue;
      // (a friend's game may be another version: keep only what this one can show)
      const h = Math.max(0, Math.min(MAX_TERRAIN, h0 | 0)), w = w0 ? 1 : 0, p = p0 === 1 || p0 === 2 ? p0 : 0, s = SCENERY[s0] ? s0 : 0;
      if (S.h[i] !== h || S.water[i] !== w) tv = true;
      if (S.h[i] !== h || S.water[i] !== w || S.path[i] !== p || S.scn[i] !== s) any = true;
      S.h[i] = base.h[i] = h; S.water[i] = base.water[i] = w; S.path[i] = base.path[i] = p; S.scn[i] = base.scn[i] = s;
    }
    if (any) { countScenery(); S.pv++; if (tv) S.tv++; }
  }
  for (const p of d.objs || []) {
    if (!known(p) || old('o' + p.id)) continue;
    putObj(p);
    base.objs.set(p.id, sigOf(S.objs[p.id]));
  }
  for (const id of d.del || []) {
    if (old('o' + id)) continue;
    if (S.objs[id]) removeObj(id, false);
    base.objs.delete(id);
  }
  for (const k in d.set || {}) {
    if (!SETS.includes(k) || old('s' + k)) continue;
    putSet(k, d.set[k]);
    base.set[k] = JSON.stringify(getSet(k));
  }
  if (host) {
    if (d.dc && !S.sandbox) S.cash += d.dc;
    if (d.dl) S.loan = Math.max(0, S.loan + d.dl);
    for (const k in d.df || {}) S.fin.cur[k] = (S.fin.cur[k] || 0) + d.df[k];
  }
}

const PIECES = new Set(['station', 's', 'l', 'r', 'wl', 'wr', 'loop', 'cork', 'boost', 'brake']);
/** An object this version of the game knows how to run and draw. */
function known(p) {
  if (!p || !(p.id > 0)) return false;
  if (p.kind === 'ride') return !!RIDES[p.type] && p.w > 0 && p.h > 0;
  if (p.kind === 'stall') return !!STALLS[p.type];
  if (p.kind === 'coaster') return !!COASTERS[p.ctype] && Array.isArray(p.pieces) && p.pieces.length >= 3 && p.pieces.every((r) => PIECES.has(r[0]));
  return false;
}
function putObj(p) {
  let o = S.objs[p.id];
  if (o && sigOf(o) === JSON.stringify(p)) return;
  const isC = p.kind === 'coaster', fresh = !o;
  const newTrack = isC && (!o || !o.pieces || JSON.stringify(o.pieces.map(pieceRow)) !== JSON.stringify(p.pieces || []));
  if (o) {
    if (o.kind === 'coaster') { if (newTrack) for (let i = 0; i < o.pieces.length; i++) unregisterPiece(o, i); }
    else for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) S.occ[idx(o.x + i, o.y + j)] = 0;
  } else {
    o = S.objs[p.id] = { queue: [], riders: [], runs: [], st: 'idle', timer: 0, customers: 0, income: 0 };
  }
  for (const k in p) if (k !== 'pieces') o[k] = p[k];
  if (isC) {
    if (newTrack) {
      o.pieces = (p.pieces || []).map(rowPiece);
      for (let i = 0; i < o.pieces.length; i++) registerPiece(o, i);
      recompute(o);
      for (const k of RATING) if (p[k] !== undefined) o[k] = p[k];
    } else for (const pc of o.pieces) pc.geo = null; // a new colour, say
    o.capacity = coasterCap(o);
  } else {
    for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) S.occ[idx(o.x + i, o.y + j)] = o.id;
  }
  if (p.id >= S.nextId) S.nextId = p.id + 1;
  S.pv++;
  if (fresh && !isC) emit('built', { kind: o.kind, id: o.id });
}

/** The host's numbers for the guests' games: money, time, goals and the like, and ride counts that changed. */
export function hostState() {
  const s = { time: S.time, guests: S.guests.length, rpts: S.research.pts, rdone: S.research.done };
  for (const k of HOST_KEYS) s[k] = S[k];
  const os = {};
  let any = false;
  for (const id in S.objs) {
    const o = S.objs[id], v = (o.customers || 0) + ':' + (o.income || 0);
    if (stats.get(id) !== v) { stats.set(id, v); os[id] = [o.customers || 0, o.income || 0]; any = true; }
  }
  if (any) s.os = os;
  return s;
}
/** Take in the host's numbers. money: also the cash, loan and accounts (only once the host has every change we sent). */
export function takeState(s, money) {
  for (const k of HOST_KEYS) {
    if (s[k] === undefined || (!money && (k === 'cash' || k === 'loan' || k === 'fin'))) continue;
    S[k] = s[k];
  }
  if (!S.fin || !S.fin.cur) S.fin = { cur: {}, last: {} };
  // both games run the clock at the same speed: only catch up when they drift apart
  if (Math.abs(S.time - s.time) > 1.5) S.time = s.time; else S.time += (s.time - S.time) * 0.2;
  S.research.pts = s.rpts; S.research.done = s.rdone;
  net.hostGuests = s.guests;
  for (const id in s.os || {}) { const o = S.objs[id]; if (o) { o.customers = s.os[id][0]; o.income = s.os[id][1]; } }
  if (money && base) { base.cash = S.cash; base.loan = S.loan; base.fin = { ...S.fin.cur }; }
}
