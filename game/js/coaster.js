// Coaster tracks: pieces, geometry, physics and ratings.
import { N, DX, DY, COASTERS, SCENERY, isPlat } from './data.js';
import {
  S, idx, inB, canAfford, spend, earn, registerPiece, unregisterPiece, nameFor, emit, pieceCells, pieceTiles, walkH, removeObj, newId,
} from './world.js';

const OK = { ok: true };
const no = (why) => ({ ok: false, why });
const G = 9.81;
const TILE_M = 4; // metres per tile
const UNIT_M = 2; // metres per height level
const SAMPLES = 8;
const LOOP_SAMPLES = 40;
const LOOP_H = 3.6; // height of a loop, in levels
const LOOP_W = 0.18; // how far the way up and the way down lie to each side of the middle, in tiles
const LOOP_EASE = 0.75;

const WIDE_R = 1.5; // radius of a wide turn, in tiles
const WIDE_LEN = (WIDE_R * Math.PI) / 2;
const WIDE_SAMPLES = 16;
const CORK_SAMPLES = 24;
const CORK_R = 0.28; // how far a corkscrew swings sideways, in tiles
const CORK_Z = 1.0; // half its height, in levels
export const STATION_HEAD = 10; // where the front of the train waits, metres from the station start
export const CAR_LEN = 2.6;
const LAUNCH_ZONE = 9; // metres of launch track right after the waiting train
const DWELL = 6; // seconds a railway's train waits at each of its further platforms

// Piece types: station, s (straight), l / r (tight turns), wl / wr (wide turns over three tiles),
// loop and cork (two tiles long, upside down), boost, brake, photo (a camera that snaps the riders),
// stop (a further platform of a railway).
export const isTurn = (p) => p.t === 'l' || p.t === 'r' || p.t === 'wl' || p.t === 'wr';
export const isWide = (p) => p.t === 'wl' || p.t === 'wr';
export const isLeft = (p) => p.t === 'l' || p.t === 'wl';
export const isInv = (p) => p.t === 'loop' || p.t === 'cork';
export const exitDir = (p) => (isTurn(p) ? (p.d + (isLeft(p) ? 3 : 1)) % 4 : p.d);

/** Where the piece after p starts: tile, direction and height. */
export function pieceExit(p) {
  const ed = exitDir(p);
  if (isWide(p)) return { x: p.x + DX[p.d] + 2 * DX[ed], y: p.y + DY[p.d] + 2 * DY[ed], d: ed, h: p.h1 };
  const len = isInv(p) ? 2 : 1;
  return { x: p.x + DX[p.d] * (len - 1) + DX[ed], y: p.y + DY[p.d] * (len - 1) + DY[ed], d: ed, h: p.h1 };
}
/** Where the next piece would start: tile, direction and height. */
export function endState(c) { return pieceExit(c.pieces[c.pieces.length - 1]); }
function isClosed(c) {
  const e = endState(c), f = c.pieces[0];
  return c.pieces.length > 3 && e.x === f.x && e.y === f.y && e.d === f.d && e.h === f.h0;
}

function pieceCost(c, p) {
  const T = COASTERS[c.ctype];
  let cost = T.piece;
  if (isPlat(p)) cost = T.station / 3;
  else if (p.t === 'photo') cost *= 2.5;
  else if (p.t === 'loop') cost *= 5;
  else if (p.t === 'cork') cost *= 6;
  else if (isWide(p)) cost *= 2.4;
  else if (p.t === 'boost') cost *= 3;
  else if (p.t === 'brake') cost *= 1.5;
  if (p.chain) cost *= 1.3;
  if (p.bank) cost *= 1.15;
  const i = idx(p.x, p.y);
  cost += 5 * Math.max(0, Math.min(p.h0, p.h1) - S.h[i]);
  return Math.round(cost);
}

/** Can this piece go at the end of the track (or anywhere, for the auto-finish search)? */
function checkPiece(c, p, ignoreMoney) {
  const T = COASTERS[c.ctype], base = c.pieces.length ? c.pieces[0].h0 : p.h0;
  const slope = p.h1 - p.h0, g = isWide(p) ? slope / 2 : slope;
  if (Math.abs(g) === 2 && !T.steep) return no('e_steep');
  if (Math.abs(g) > 2) return no('e_steep');
  if (isTurn(p) && Math.abs(g) > 1) return no('e_steepturn');
  if (p.t === 'loop' && !T.loop) return no('e_noloop');
  if (p.t === 'cork' && !T.cork) return no('e_noloop');
  if ((isInv(p) || p.t === 'boost' || p.t === 'brake' || p.t === 'photo' || isPlat(p)) && slope) return no('e_flatonly');
  if (p.t === 'boost' && !S.unlocked.booster) return no('e_locked');
  if (p.t === 'photo' && !S.unlocked.photo) return no('e_locked');
  if ((p.t === 'boost' && T.noBoost) || (p.t === 'brake' && T.noBrake) || (p.t === 'photo' && T.kind) || (p.t === 'stop' && T.kind !== 'train')) return no('e_cannot');
  const z0 = Math.min(p.h0, p.h1), z1 = Math.max(p.h0, p.h1);
  if (z0 < 0) return no('e_low');
  if (z1 - base > T.maxH) return no('e_high');
  for (const [x, y] of pieceTiles(p)) if (!inB(x, y)) return no('e_bounds');
  for (const cell of pieceCells(p)) {
    if (S.occ[cell.i]) return no('e_blocked');
    const th = S.h[cell.i];
    if (cell.z0 < th) return no('e_ground');
    if (S.water[cell.i] && cell.z0 < th + 1) return no('e_water');
    if (S.path[cell.i] && cell.z0 - walkH(cell.i) < 2) return no('e_pathclear');
    const list = S.trk.get(cell.i);
    if (list) for (const s of list) if (cell.z0 < s.z1 + 3 && s.z0 < cell.z1 + 3) return no('e_track');
  }
  if (!ignoreMoney && !canAfford(pieceCost(c, p))) return no('e_money');
  return OK;
}

function commitPiece(c, p) {
  p.cost = pieceCost(c, p);
  c.pieces.push(p);
  registerPiece(c, c.pieces.length - 1);
  for (const cell of pieceCells(p)) {
    if (S.scn[cell.i] && cell.z0 - S.h[cell.i] < 3) { S.scn[cell.i] = 0; S.sceneryCount--; }
  }
  spend(p.cost, 'build');
  c.cost += p.cost;
}

export function canStartCoaster(ctype, x, y, d) {
  const T = COASTERS[ctype];
  let z = -1;
  for (let k = 0; k < 3; k++) {
    const tx = x + DX[d] * k, ty = y + DY[d] * k;
    if (!inB(tx, ty)) return no('e_bounds');
    const i = idx(tx, ty);
    if (S.water[i]) return no('e_water');
    if (S.path[i] || S.occ[i]) return no('e_blocked');
    if (S.trk.has(i)) return no('e_track');
    if (z < 0) z = S.h[i]; else if (S.h[i] !== z) return no('e_flat');
  }
  // the track has to leave and come back, so both ends of the station need a free tile
  for (const k of [-1, 3]) {
    const tx = x + DX[d] * k, ty = y + DY[d] * k;
    if (!inB(tx, ty)) return no('e_ends');
    const i = idx(tx, ty);
    if (S.occ[i] || S.path[i] || S.water[i] || S.h[i] > z) return no('e_ends');
    const list = S.trk.get(i);
    if (list) for (const sg of list) if (sg.z0 < z + 3) return no('e_ends');
  }
  if (!canAfford(T.station)) return no('e_money');
  return { ok: true, z };
}
export function startCoaster(ctype, x, y, d) {
  const r = canStartCoaster(ctype, x, y, d);
  if (!r.ok) return r;
  const c = {
    id: newId(), kind: 'coaster', ctype, num: nameFor(ctype), pieces: [], closed: false, open: false,
    price: 5, queue: [], riders: [], st: 'idle', timer: 0, cost: 0, customers: 0, income: 0,
    x, y, E: 0, I: 0, Q: 0, runT: 0, born: S.time,
  };
  S.objs[c.id] = c;
  for (let k = 0; k < 3; k++) {
    commitPiece(c, { t: 'station', x: x + DX[d] * k, y: y + DY[d] * k, d, h0: r.z, h1: r.z, chain: false, bank: false });
  }
  S.pv++;
  recompute(c);
  return { ok: true, obj: c };
}

/** spec: {t: 's'|'l'|'r'|'wl'|'wr'|'loop'|'cork'|'boost'|'brake', slope, chain, bank} */
export function buildPiece(c, spec) {
  const e = endState(c), T = COASTERS[c.ctype];
  const turn = isTurn(spec);
  let slope = spec.t === 's' || turn ? spec.slope || 0 : 0;
  if (turn) slope = Math.max(-1, Math.min(1, slope));
  const rise = isWide(spec) ? slope * 2 : slope; // a wide turn is longer, so it climbs two levels at the same steepness
  return {
    t: spec.t, x: e.x, y: e.y, d: e.d, h0: e.h, h1: e.h + rise,
    chain: !!spec.chain && slope >= 0 && (spec.t === 's' || turn) && !T.launch && !T.noChain,
    bank: !!spec.bank && turn && T.bank,
  };
}
/** What adding this piece would do, without building it: for the previews in the builder. */
export function previewPiece(c, spec) {
  const p = buildPiece(c, spec);
  const r = c.closed ? no('e_closed') : checkPiece(c, p);
  let stall = false;
  if (r.ok && c.sim && c.sim.ok) stall = !recompute({ ctype: c.ctype, closed: false, pieces: [...c.pieces, p] }).ok;
  return { p, ok: r.ok, why: r.why, stall, cost: pieceCost(c, p), exit: pieceExit(p) };
}
export function canAddPiece(c, spec) {
  if (c.closed) return no('e_closed');
  return checkPiece(c, buildPiece(c, spec));
}
export function addPiece(c, spec) {
  const r = canAddPiece(c, spec);
  if (!r.ok) return r;
  commitPiece(c, buildPiece(c, spec));
  afterEdit(c);
  return OK;
}
export function undoPiece(c) {
  if (c.pieces.length <= 3) return no('e_station');
  const pi = c.pieces.length - 1, p = c.pieces[pi];
  unregisterPiece(c, pi);
  c.pieces.pop();
  earn(p.cost || 0, 'build');
  c.cost -= p.cost || 0;
  afterEdit(c);
  return OK;
}
function afterEdit(c) {
  const was = c.closed;
  c.closed = isClosed(c);
  if (!c.closed) { c.open = false; kickOut(c); }
  for (const p of c.pieces) p.geo = null;
  c.plats = null;
  S.pv++;
  recompute(c);
  if (c.closed && !was) emit('closed', { id: c.id });
}
function kickOut(c) {
  for (const g of S.guests) if (g.obj === c.id) { g.obj = 0; g.st = 'walk'; g.target = null; }
  c.queue = []; c.riders = []; c.runs = []; c.st = 'idle';
}

// ---------- designs: a whole track written down as a list of short words ----------
// One word per piece after the station: the type (s, l, r, wl, wr, loop, cork, boost, brake), then
// for straights and turns the slope (-2..2), then c for a lift chain and b for banking: "s1c", "wr0b".
export function pieceWord(p) {
  if (p.t !== 's' && !isTurn(p)) return p.t;
  return p.t + (p.h1 - p.h0) / (isWide(p) ? 2 : 1) + (p.chain ? 'c' : '') + (p.bank ? 'b' : '');
}
function wordSpec(w) {
  const m = /^(wl|wr|s|l|r)(-?\d)(c?)(b?)$/.exec(w);
  return m ? { t: m[1], slope: +m[2], chain: !!m[3], bank: !!m[4] } : { t: w };
}
/** The design of a finished coaster: {ctype, words, col}. */
export function designOf(c) {
  return { ctype: c.ctype, col: c.col | 0, words: c.pieces.filter((p) => p.t !== 'station').map(pieceWord).join(' ') };
}
/**
 * Would this design fit with its station at x, y facing d? Nothing is built. Returns {ok, why, cost,
 * tiles}: tiles are [x, y, fits] for every tile the track would cover, for the preview.
 */
export function canPlaceDesign(design, x, y, d) {
  const T = COASTERS[design.ctype], tiles = [];
  for (let k = 0; k < 3; k++) tiles.push([x + DX[d] * k, y + DY[d] * k, true]);
  const st = canStartCoaster(design.ctype, x, y, d);
  if (!st.ok && st.why !== 'e_money') { for (const tl of tiles) tl[2] = false; return { ok: false, why: st.why, cost: 0, tiles }; }
  const tc = { ctype: design.ctype, pieces: [] };
  for (let k = 0; k < 3; k++) tc.pieces.push({ t: 'station', x: x + DX[d] * k, y: y + DY[d] * k, d, h0: st.z, h1: st.z, chain: false, bank: false });
  let cost = T.station, why = null;
  for (const w of design.words.split(' ')) {
    const p = buildPiece(tc, wordSpec(w)), r = checkPiece(tc, p, true);
    if (!r.ok && !why) why = r.why;
    for (const [tx, ty] of pieceTiles(p)) tiles.push([tx, ty, r.ok]);
    cost += inB(p.x, p.y) ? pieceCost(tc, p) : 0;
    tc.pieces.push(p);
  }
  if (!why && !isClosed(tc)) why = 'e_noroute';
  if (!why && !canAfford(cost)) why = 'e_money';
  return { ok: !why, why, cost: Math.round(cost), tiles };
}
/** The centre line of a design as points [x, y, z] from a station at 0, 0 facing +x, for small pictures. */
export function designShape(design) {
  const tc = { ctype: design.ctype, closed: false, pieces: [] }, out = [];
  for (let k = 0; k < 3; k++) tc.pieces.push({ t: 'station', x: k, y: 0, d: 0, h0: 0, h1: 0, chain: false, bank: false });
  for (const w of design.words.split(' ')) tc.pieces.push(buildPiece(tc, wordSpec(w)));
  tc.closed = true;
  for (let i = 0; i < tc.pieces.length; i++) for (const q of pieceSamples(tc, i)) out.push([q.x, q.y, q.z]);
  return out;
}
/** Build a whole design. Either all of it is built or nothing is. */
export function placeDesign(design, x, y, d) {
  const chk = canPlaceDesign(design, x, y, d);
  if (!chk.ok) return chk;
  const r = startCoaster(design.ctype, x, y, d);
  if (!r.ok) return r;
  const c = r.obj;
  c.col = design.col | 0;
  for (const w of design.words.split(' ')) {
    const p = buildPiece(c, wordSpec(w)), q = checkPiece(c, p);
    if (!q.ok) { earn(c.cost, 'build'); removeObj(c.id, false); return q; }
    commitPiece(c, p);
  }
  afterEdit(c);
  return { ok: true, obj: c };
}

/** What can be changed on piece i without moving the track: {chain, bank, kind}. */
export function alterable(c, i) {
  const p = c.pieces[i], T = COASTERS[c.ctype];
  if (!p || p.t === 'station') return null;
  const flat = p.h0 === p.h1;
  return {
    chain: (p.t === 's' || isTurn(p)) && p.h1 >= p.h0 && !T.launch && !T.noChain,
    bank: isTurn(p) && T.bank,
    kind: flat && (p.t === 's' || p.t === 'brake' || p.t === 'boost' || p.t === 'photo' || p.t === 'stop'),
    brake: !T.noBrake,
    boost: flat && !!S.unlocked.booster && c.ctype !== 'mini' && !T.noBoost,
    photo: !!S.unlocked.photo && !T.kind,
    stop: T.kind === 'train',
  };
}
/** Change a piece that is already built. what: 'chain' or 'bank' (switch on or off), or 's' / 'brake' / 'boost' / 'photo' / 'stop'. */
export function alterPiece(c, i, what) {
  const a = alterable(c, i), p = c.pieces[i];
  if (!a) return no('e_station');
  const old = { t: p.t, chain: p.chain, bank: p.bank };
  if (what === 'chain' && a.chain) p.chain = !p.chain;
  else if (what === 'bank' && a.bank) p.bank = !p.bank;
  else if ((what === 's' || ((what === 'brake' || what === 'boost' || what === 'photo' || what === 'stop') && a[what])) && a.kind) { p.t = what; p.chain = false; }
  else return no(what === 'boost' && !COASTERS[c.ctype].noBoost ? 'e_locked' : 'e_cannot');
  const cost = pieceCost(c, p), diff = cost - (p.cost || 0);
  if (diff > 0 && !canAfford(diff)) { Object.assign(p, old); return no('e_money'); }
  if (diff > 0) spend(diff, 'build'); else if (diff < 0) earn(-diff, 'build');
  p.cost = cost; c.cost += diff;
  for (const q of c.pieces) q.geo = null;
  c.plats = null;
  // (a platform is registered as one, so the ground under it cannot be dug away)
  unregisterPiece(c, i); registerPiece(c, i);
  S.pv++;
  recompute(c);
  return OK;
}
/** Take away every piece after piece i, so the track can be built again from there. */
export function cutAfter(c, i) {
  if (i < 2 || i >= c.pieces.length - 1) return no('e_cannot');
  while (c.pieces.length > i + 1) popPiece(c);
  afterEdit(c);
  return OK;
}

/** Finds the shortest way back to the station and builds it, with brakes first if the train is fast. */
export function autoFinish(c) {
  if (c.closed) return no('e_closed');
  // the way home is made of tight turns, so slow a fast train down first if there is room
  const before = c.pieces.length;
  for (let k = 0; k < 5 && c.sim && c.sim.ok && c.sim.endV > 12 && !COASTERS[c.ctype].noBrake; k++) {
    const p = buildPiece(c, { t: 'brake' });
    if (!checkPiece(c, p).ok) break;
    commitPiece(c, p);
    for (const q of c.pieces) q.geo = null;
    recompute(c);
  }
  let r = routeHome(c);
  if (!r.ok && c.pieces.length > before) {
    // the brakes got in the way: take them out and try from where the player stopped
    while (c.pieces.length > before) popPiece(c);
    recompute(c);
    r = routeHome(c);
  }
  afterEdit(c);
  return r;
}
function popPiece(c) {
  const pi = c.pieces.length - 1, q = c.pieces[pi];
  unregisterPiece(c, pi); c.pieces.pop(); earn(q.cost || 0, 'build'); c.cost -= q.cost || 0;
}
function routeHome(c) {
  const T = COASTERS[c.ctype], f = c.pieces[0], base = f.h0, HR = base + T.maxH + 1;
  const key = (x, y, d, h) => ((x + y * N) * 4 + d) * HR + h;
  const start = endState(c);
  if (!inB(start.x, start.y) && !(start.x === f.x && start.y === f.y)) return no('e_noroute');
  const goal = key(f.x, f.y, f.d, f.h0);
  const prev = new Map();
  const sk = key(start.x, start.y, start.d, start.h);
  prev.set(sk, null);
  let q = [[start.x, start.y, start.d, start.h, sk]], found = sk === goal;
  const moves = [['s', 0], ['s', -1], ['s', 1], ['l', 0], ['r', 0], ['l', -1], ['r', -1]];
  let guard = 0;
  while (q.length && !found && guard < 2500000) {
    const next = [];
    for (const [x, y, d, h, k] of q) {
      for (const [t, sl] of moves) {
        guard++;
        const p = { t, x, y, d, h0: h, h1: h + sl, chain: false, bank: false };
        if (!inB(x, y) || h + sl < 0 || h + sl >= HR) continue;
        if (!checkPiece(c, p, true).ok) continue;
        const ed = exitDir(p), nx = x + DX[ed], ny = y + DY[ed], nk = key(nx, ny, ed, h + sl);
        if (prev.has(nk)) continue;
        if (!inB(nx, ny)) continue;
        prev.set(nk, { k, t, sl });
        if (nk === goal) { found = true; break; }
        next.push([nx, ny, ed, h + sl, nk]);
      }
      if (found) break;
    }
    q = next;
  }
  if (!found) return no('e_noroute');
  const steps = [];
  for (let k = goal; prev.get(k); k = prev.get(k).k) steps.push(prev.get(k));
  steps.reverse();
  const before = c.pieces.length;
  for (const st of steps) {
    const p = buildPiece(c, { t: st.t, slope: st.sl, chain: st.sl > 0, bank: true });
    const r = checkPiece(c, p);
    if (!r.ok) {
      while (c.pieces.length > before) popPiece(c);
      return r.why === 'e_money' ? r : no('e_noroute');
    }
    commitPiece(c, p);
  }
  return OK;
}

// ---------- geometry ----------
const lerp = (a, b, t) => a + (b - a) * t;
function bez(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}
function slopeOf(p) { return p.h1 - p.h0; }
function neighbor(c, i, off) {
  const n = c.pieces.length, j = i + off;
  if (j >= 0 && j < n) return c.pieces[j];
  if (c.closed) return c.pieces[(j + n) % n];
  return c.pieces[i];
}

/** Sample points of one piece in tile / height-level coordinates, including its end point. */
export function pieceSamples(c, i) {
  const p = c.pieces[i], out = [];
  const cx = p.x + 0.5, cy = p.y + 0.5, dx = DX[p.d], dy = DY[p.d];
  const ex = cx - dx * 0.5, ey = cy - dy * 0.5;
  if (p.t === 'loop') {
    const nx = -dy, ny = dx, L = LOOP_SHAPE;
    for (let k = 0; k <= LOOP_SAMPLES; k++) {
      const lat = L.lat[k];
      out.push({ x: ex + dx * L.a[k] + nx * lat, y: ey + dy * L.a[k] + ny * lat, z: p.h0 + L.z[k] });
    }
    return out;
  }
  if (p.t === 'cork') {
    // the track winds once round a line along the direction of travel; th is how far round it is
    const nx = -dy, ny = dx;
    for (let k = 0; k <= CORK_SAMPLES; k++) {
      const u = k / CORK_SAMPLES, th = corkAngle(u);
      out.push({ x: ex + dx * 2 * u + nx * CORK_R * Math.sin(th), y: ey + dy * 2 * u + ny * CORK_R * Math.sin(th), z: p.h0 + CORK_Z * (1 - Math.cos(th)) });
    }
    return out;
  }
  const ed = exitDir(p), L = groundLen(p);
  const b0 = bend(neighbor(c, i, -1), p), b1 = bend(p, neighbor(c, i, 1));
  if (isWide(p)) {
    const lx = DX[ed], ly = DY[ed];
    for (let s = 0; s <= WIDE_SAMPLES; s++) {
      const t = s / WIDE_SAMPLES, a = (t * Math.PI) / 2, f = WIDE_R * Math.sin(a), g = WIDE_R * (1 - Math.cos(a));
      out.push({ x: ex + dx * f + lx * g, y: ey + dy * f + ly * g, z: heightAt(p, t * L, L, b0, b1) });
    }
    return out;
  }
  const qx = cx + DX[ed] * 0.5, qy = cy + DY[ed] * 0.5;
  const k = isTurn(p) ? TIGHT_K : 1 / 3;
  // the height goes by the distance travelled over the ground, so a turn climbs as evenly as a straight
  const run = RUN;
  for (let s = 0; s <= SAMPLES; s++) {
    const t = s / SAMPLES;
    const x = bez(ex, ex + dx * k, qx - DX[ed] * k, qx, t), y = bez(ey, ey + dy * k, qy - DY[ed] * k, qy, t);
    run[s] = s ? run[s - 1] + Math.hypot(x - out[s - 1].x, y - out[s - 1].y) : 0;
    out.push({ x, y, z: 0 });
  }
  for (let s = 0; s <= SAMPLES; s++) out[s].z = heightAt(p, (run[s] / run[SAMPLES]) * L, L, b0, b1);
  return out;
}

// ---------- slopes ----------
// Where the slope changes from one piece to the next, the bend is rounded over both pieces: each piece
// runs at its own slope through its middle, and the track curves evenly through the joint. A crest is
// so lowered and a dip raised a little: at most BEND_DEV levels where the track levels out or gets
// steeper, and less (HILL_DEV) at the top or bottom of a hill, so short hills keep most of their height.
// Loops and corkscrews keep their own shape and are level at both ends, so a sloped piece next to one
// levels out over its own length.
const BEND_DEV = 0.25, HILL_DEV = 0.15;
const TIGHT_K = 0.276; // a tight turn's Bezier handles, for a quarter circle half a tile across
/** Length of a tight turn's centre line over the ground, in tiles. */
const TIGHT_LEN = (() => {
  let len = 0, px = 0, py = 0;
  for (let s = 1; s <= 64; s++) {
    const t = s / 64, x = bez(0, TIGHT_K, 0.5, 0.5, t), y = bez(0, 0, 0.5 - TIGHT_K, 0.5, t);
    len += Math.hypot(x - px, y - py); px = x; py = y;
  }
  return len;
})();
const groundLen = (p) => (isWide(p) ? WIDE_LEN : isTurn(p) ? TIGHT_LEN : isInv(p) ? 2 : 1);
const RUN = new Float64Array(SAMPLES + 1);
const NO_BEND = { d: 0, r: 0, held: false }, HELD = { d: 0, r: 0, held: true };
/** The bend where piece a runs into piece b: d = change of slope (levels per tile), r = how far it reaches into each, in tiles. */
function bend(a, b) {
  if (a === b) return NO_BEND; // the open end of a track: it simply carries on
  if (isInv(a) || isInv(b)) return HELD;
  const ga = slopeOf(a) / groundLen(a), gb = slopeOf(b) / groundLen(b), d = gb - ga;
  if (Math.abs(d) < 1e-9) return NO_BEND;
  const dev = ga * gb < 0 ? HILL_DEV : BEND_DEV;
  return { d, r: Math.min(groundLen(a) / 2, groundLen(b) / 2, (4 * dev) / Math.abs(d)), held: false };
}
/** Height of piece p (levels) at distance s along it over the ground, given the bends at its start (b0) and end (b1). */
function heightAt(p, s, L, b0, b1) {
  const g = slopeOf(p) / L;
  let z = p.h0 + g * s;
  if (g && (b0.held || b1.held)) {
    // level where it meets a loop or a corkscrew: an S over the part of the piece that is not rounded off
    const a = b0.held ? 0 : b0.r, e = b1.held ? L : L - b1.r, w = e - a;
    if (s > a && s < e) {
      const t = (s - a) / w, t2 = t * t, t3 = t2 * t;
      const m0 = b0.held ? 0 : g * w, m1 = b1.held ? 0 : g * w, z0 = p.h0 + g * a, z1 = p.h0 + g * e;
      z = (2 * t3 - 3 * t2 + 1) * z0 + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * z1 + (t3 - t2) * m1;
    }
  }
  if (b0.r && s < b0.r) z += (b0.d * (b0.r - s) ** 2) / (4 * b0.r);
  if (b1.r && L - s < b1.r) z += (b1.d * (b1.r - (L - s)) ** 2) / (4 * b1.r);
  return z;
}
/**
 * Banking at u = 0..1 along piece i: how far the outer rail is lifted, in levels (the inner one drops
 * by the same). Positive in a left turn. The tilt holds through turns that follow each other the same
 * way and eases in and out only where the banking starts and ends.
 */
export function bankAt(c, i, u) {
  const p = c.pieces[i];
  if (!p.bank || !isTurn(p)) return 0;
  const same = (q) => q.bank && isTurn(q) && isLeft(q) === isLeft(p);
  const ease = (x) => { const t = Math.max(0, Math.min(1, x / 0.5)); return t * t * (3 - 2 * t); };
  const k = (same(neighbor(c, i, -1)) && i > 0 ? 1 : ease(u)) * (same(neighbor(c, i, 1)) && (i < c.pieces.length - 1 || c.closed) ? 1 : ease(1 - u));
  return (isLeft(p) ? 1 : -1) * (isWide(p) ? 0.2 : 0.17) * k;
}
/**
 * The shape of a loop, worked out once: a teardrop like on a real looping coaster. The track bends up
 * gently out of the flat, tightest over the top, and back down the same way. Its heading turns by
 * 2πσ - LOOP_EASE·sin 2πσ at σ = 0..1 of the way, so the bend grows from almost nothing where it meets
 * the flat track. Stretched to fill its two tiles and LOOP_H levels. The way up lies to one side and
 * the way down to the other (lat), easing in and out so the track runs straight on at both ends.
 * a = tiles along, z = levels up, lat = tiles to the left, at each sample.
 */
const LOOP_SHAPE = (() => {
  const M = 4000, xs = new Float64Array(M + 1), zs = new Float64Array(M + 1), TAU = Math.PI * 2;
  for (let i = 0; i < M; i++) {
    const s = (i + 0.5) / M, th = TAU * s - LOOP_EASE * Math.sin(TAU * s);
    xs[i + 1] = xs[i] + Math.cos(th) / M; zs[i + 1] = zs[i] + Math.sin(th) / M;
  }
  let top = 0;
  for (let i = 0; i <= M; i++) top = Math.max(top, zs[i]);
  // samples are spaced evenly in a half-eased angle: closer together over the tight top
  const a = [], z = [], lat = [];
  let i = 0;
  for (let k = 0; k <= LOOP_SAMPLES; k++) {
    const want = (TAU * k) / LOOP_SAMPLES, psi = (s) => TAU * s - (LOOP_EASE / 2) * Math.sin(TAU * s);
    while (i < M && psi((i + 1) / M) <= want) i++;
    const s = i / M, ease = Math.min(1, Math.min(s, 1 - s) / 0.12), e = ease * ease * (3 - 2 * ease);
    a.push((xs[i] / xs[M]) * 2); z.push((zs[i] / top) * LOOP_H); lat.push(-LOOP_W * Math.sin(TAU * s) * e);
  }
  a[LOOP_SAMPLES] = 2; z[0] = z[LOOP_SAMPLES] = 0;
  return { a, z, lat };
})();
/** How far a corkscrew has turned (radians) at u = 0..1 along it. Eased so it joins straight track smoothly. */
export function corkAngle(u) { return Math.PI * 2 * u * u * (3 - 2 * u); }

// ---------- physics ----------
export function recompute(c) {
  const T = COASTERS[c.ctype];
  const X = [], Y = [], Z = [], PI = [], U = [];
  for (let i = 0; i < c.pieces.length; i++) {
    const sm = pieceSamples(c, i);
    const last = i === c.pieces.length - 1 && !c.closed ? sm.length : sm.length - 1;
    for (let k = 0; k < last; k++) { X.push(sm[k].x); Y.push(sm[k].y); Z.push(sm[k].z); PI.push(i); U.push(k / (sm.length - 1)); }
  }
  const n = X.length, segs = c.closed ? n : n - 1;
  const s = new Float32Array(segs + 1), tt = new Float32Array(segs + 1), vv = new Float32Array(segs + 1);
  const gv = new Float32Array(segs + 1), gl = new Float32Array(segs + 1);
  let v = 3.5, stall = -1, phiPrev = 0, psiPrev = null, segsDone = 0;
  const stops = [], flow2 = T.flow ? T.flow * T.flow : 0;
  let maxV = 0, maxGv = 1, minGv = 1, maxGl = 0, air = 0, drop = 0, bigDrop = 0, nDrops = 0, totalDrop = 0, maxH = 0;
  vv[0] = v;
  const base = c.pieces[0].h0;
  for (let k = 0; k < segs; k++) {
    const k2 = (k + 1) % n, p = c.pieces[PI[k]];
    const ddx = (X[k2] - X[k]) * TILE_M, ddy = (Y[k2] - Y[k]) * TILE_M, dz = (Z[k2] - Z[k]) * UNIT_M;
    const dh = Math.hypot(ddx, ddy), ds = Math.hypot(dh, dz) || 0.001;
    let v2 = v * v - 2 * G * dz - 2 * T.mu * G * dh - 0.0009 * v * v * ds;
    const plat = isPlat(p);
    if (plat) v2 = 3.5 * 3.5;
    if (T.launch && s[k] >= STATION_HEAD && s[k] < STATION_HEAD + LAUNCH_ZONE) v2 = Math.max(v2, Math.min(T.launch * T.launch, v * v + 2 * 30 * ds));
    else if (plat) { /* held at walking pace */ }
    else if (T.powered) v2 = T.powered * T.powered; // a railway's engine keeps a steady pace
    else if (p.chain) v2 = Math.max(v2, 4 * 4);
    else if (flow2 && dz < 0.002) {
      // a boat: on the level the water slows a fast one down to the current, and the current carries a slow one along
      if (dz > -0.002) v2 = flow2 + (v2 - flow2) * Math.exp(-ds / 4.5);
      v2 = Math.max(v2, flow2);
    }
    else if (p.t === 'boost') v2 = v > 24 ? v2 : Math.min(24 * 24, v2 + 2 * 11 * ds);
    else if (p.t === 'brake' && v2 > 36) v2 = Math.max(36, v2 - 2 * 12 * ds);
    if (v2 < 0.4) { stall = PI[k]; s[k + 1] = s[k] + ds; tt[k + 1] = tt[k] + 1; segsDone = k + 1; break; }
    const vn = Math.sqrt(v2);
    s[k + 1] = s[k] + ds; tt[k + 1] = tt[k] + ds / ((v + vn) / 2); vv[k + 1] = vn;
    if (p.t === 'stop' && PI[k2] !== PI[k] && c.pieces[PI[k2]].t !== 'stop') {
      // the end of a platform: the train stands here for a while (it creeps over this last bit of track)
      stops.push({ pi: PI[k], t: tt[k + 1] + 0.6, s: s[k + 1] });
      tt[k + 1] += DWELL;
    }
    // g-forces
    const along = isInv(p) ? ddx * DX[p.d] + ddy * DY[p.d] : dh;
    const phi = Math.atan2(dz, along);
    let dphi = phi - phiPrev;
    while (dphi > Math.PI) dphi -= 2 * Math.PI;
    while (dphi < -Math.PI) dphi += 2 * Math.PI;
    let gvert = Math.cos(phi) + (0.13 * v2 * dphi) / ds / G, glat = 0;
    if (!isInv(p) && dh > 0.01) {
      const psi = Math.atan2(ddy, ddx);
      if (psiPrev !== null) {
        let dpsi = psi - psiPrev;
        while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
        while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
        glat = Math.abs((0.12 * v2 * dpsi) / dh / G);
        if (p.bank) { gvert += glat * 0.4; glat *= 0.3; }
      }
      psiPrev = psi;
    } else psiPrev = null;
    phiPrev = phi;
    // in a corkscrew the seats turn with the track, so its little hump presses riders down rather than lifting them
    if (p.t === 'cork') gvert = 1 + Math.abs(gvert - Math.cos(phi)) * 0.6;
    if (plat) { gvert = 1; glat = 0; }
    gv[k + 1] = gvert; gl[k + 1] = glat;
    if (vn > maxV) maxV = vn;
    maxH = Math.max(maxH, Z[k] - base);
    v = vn;
  }
  // drops are measured by the heights the track was built to, not by its rounded crests and dips
  for (let i = 0, end = stall >= 0 ? stall : c.pieces.length - 1; i <= end; i++) {
    const p = c.pieces[i], dz = (p.h1 - p.h0) * UNIT_M;
    if (isInv(p) || !dz) continue;
    if (dz < 0) drop -= dz;
    else { if (drop >= 4) { nDrops++; totalDrop += drop; } bigDrop = Math.max(bigDrop, drop); drop = 0; }
  }
  if (drop >= 4) { nDrops++; totalDrop += drop; }
  bigDrop = Math.max(bigDrop, drop);
  const used = stall >= 0 ? segsDone : segs;
  // smooth the g-forces over a short stretch of track, then take the extremes
  const sg = new Float32Array(used + 1), sl = new Float32Array(used + 1);
  for (let k = 1; k <= used; k++) {
    let a1 = 0, a2 = 0, cnt = 0;
    for (let j = -3; j <= 3; j++) {
      let q = k + j;
      if (q < 1 || q > used) { if (!c.closed) continue; q = ((q - 1 + used) % used) + 1; }
      a1 += gv[q]; a2 += gl[q]; cnt++;
    }
    sg[k] = a1 / cnt; sl[k] = a2 / cnt;
  }
  for (let k = 3; k <= used; k++) {
    const p = c.pieces[PI[(k - 1) % n]];
    if (isPlat(p)) continue;
    if (sg[k] > maxGv) maxGv = sg[k];
    if (sg[k] < minGv) minGv = sg[k];
    if (sl[k] > maxGl) maxGl = sl[k];
    // feeling at most 0.6 g counts as airtime: the rounded crests lift riders a little more gently than sharp ones did
    if (sg[k] < 0.6 && !p.chain) air += tt[k] - tt[k - 1];
  }
  gv.set(sg); gl.set(sl);
  const sim = {
    ok: stall < 0, stall, n, segs: used, closed: !!c.closed, X, Y, Z, PI, U, s, t: tt, v: vv, gv, gl,
    L: s[used], T: tt[used], maxV, maxGv, minGv, maxGl, air, bigDrop, nDrops, maxH, endV: v, stops,
  };
  c.sim = sim;
  c.x = c.pieces[0].x; c.y = c.pieces[0].y;
  if (c.closed && sim.ok) rate(c, sim);
  else { c.E = 0; c.I = 0; c.Q = 0; }
  return sim;
}

function rate(c, sim) {
  let loops = 0, corks = 0, turns = 0, banked = 0, photos = 0;
  const seen = new Set(), kind = COASTERS[c.ctype].kind;
  let scenic = 0;
  for (const p of c.pieces) {
    if (p.t === 'loop') loops++;
    if (p.t === 'cork') corks++;
    if (p.t === 'photo') photos++;
    if (isTurn(p)) { turns++; if (p.bank) banked++; }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if (!inB(x, y)) continue;
      const i = idx(x, y);
      if (seen.has(i)) continue;
      seen.add(i);
      if (S.scn[i]) scenic += SCENERY[S.scn[i]].beauty * 0.5;
      else if (S.water[i]) scenic += 1;
    }
  }
  const kmh = sim.maxV * 3.6, inv = loops + corks;
  let E = 0.5 + Math.min(kmh, 110) / 22 + Math.min(sim.bigDrop, 40) / 16 + Math.min(sim.L, 600) / 300
    + Math.min(sim.air, 6) * (c.ctype === 'wood' ? 0.35 : 0.25) + Math.min(inv, 4) * 0.55
    + Math.min(sim.nDrops, 6) * 0.15 + Math.min(0.8, scenic / 60) + Math.min(0.5, banked * 0.05);
  let I = 0.4 + kmh / 30 + Math.max(0, sim.maxGv - 1) * 1.1 + sim.maxGl * 1.4 + inv * 0.65
    + Math.max(0, -sim.minGv) * 1.5;
  let Q = 0.2 + sim.maxGl * 1.2 + inv * 0.8 + turns * 0.04 + sim.T / 200 + Math.max(0, sim.maxGv - 3) * 0.6;
  // a log flume is all about the splash at the bottom of its drops; a railway about the view and where it takes you
  if (kind === 'flume') E += Math.min(1, sim.bigDrop / 10) + Math.min(0.4, sim.nDrops * 0.2);
  if (kind === 'train') E += Math.min(0.9, scenic / 70) + Math.min(0.6, sim.stops.length * 0.3);
  if (I > 9) E -= (I - 9) * 0.8;
  const r2 = (n) => Math.round(Math.max(0, Math.min(15, n)) * 100) / 100;
  c.E = r2(E); c.I = r2(I); c.Q = r2(Q);
  // suggest a fair price until the player picks one
  if (!c.priceSet) c.price = Math.max(1, Math.round((1.5 + c.E * 1.6) * 0.8 * 2) / 2);
  c.loops = loops; c.inv = inv; c.photos = photos ? 1 : 0;
  sim.maxLat = sim.maxGl;
}

const DA = [0, 0, 0], DB = [0, 0, 0];
/** Direction of the track at sample k, from the samples either side: a unit vector in metres, given back in tiles and levels. */
function dirAt(sim, k, out) {
  const n = sim.n;
  let p = k - 1, q = k + 1;
  if (sim.closed) { p = (p + n) % n; q %= n; } else { p = Math.max(0, p); q = Math.min(n - 1, q); }
  const a = Math.min(k, n - 1) % n;
  if (p === q) { p = a; q = Math.min(n - 1, a + 1); }
  const dx = (sim.X[q] - sim.X[p]) * TILE_M, dy = (sim.Y[q] - sim.Y[p]) * TILE_M, dz = (sim.Z[q] - sim.Z[p]) * UNIT_M;
  const l = Math.hypot(dx, dy, dz) || 1;
  out[0] = dx / l / TILE_M; out[1] = dy / l / TILE_M; out[2] = dz / l / UNIT_M;
}
/** Position on the track at distance s (metres) from the station start. */
export function posAt(sim, dist, out) {
  const L = sim.L;
  if (L <= 0) return null;
  let d = dist % L;
  if (d < 0) d += L;
  let lo = 0, hi = sim.segs;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sim.s[m] <= d) lo = m; else hi = m; }
  const a = lo % sim.n, b = (lo + 1) % sim.n;
  const f = (d - sim.s[lo]) / Math.max(0.0001, sim.s[lo + 1] - sim.s[lo]);
  out.x = lerp(sim.X[a], sim.X[b], f); out.y = lerp(sim.Y[a], sim.Y[b], f); out.z = lerp(sim.Z[a], sim.Z[b], f);
  // the direction blends from one sample to the next, so a car turns smoothly instead of in steps
  dirAt(sim, lo, DA); dirAt(sim, lo + 1, DB);
  out.tx = lerp(DA[0], DB[0], f); out.ty = lerp(DA[1], DB[1], f); out.tz = lerp(DA[2], DB[2], f);
  out.k = lo; out.pi = sim.PI[a];
  const ub = sim.PI[b] === sim.PI[a] ? sim.U[b] : 1;
  out.u = lerp(sim.U[a], ub, f);
  return out;
}
/** Distance travelled after t seconds of a run. */
export function distAtTime(sim, t) {
  if (t <= 0) return 0;
  if (t >= sim.T) return sim.L;
  let lo = 0, hi = sim.segs;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sim.t[m] <= t) lo = m; else hi = m; }
  const f = (t - sim.t[lo]) / Math.max(0.0001, sim.t[lo + 1] - sim.t[lo]);
  return lerp(sim.s[lo], sim.s[lo + 1], f);
}
/** Where the front of the train is (metres along the track) t seconds after it left. It waits at STATION_HEAD. */
export function trainDist(sim, t) {
  const t0 = STATION_HEAD / 3.5, tt = t + t0;
  return tt <= sim.T ? distAtTime(sim, tt) : sim.L + (tt - sim.T) * 3.5;
}
