// Guests: walking, needs, choosing rides, buying things, thoughts.
import { N, DX, DY, RIDES, STALLS, SCN } from './data.js';
import { S, idx, inB, accessTiles, earn } from './world.js';

const FIRST = ['Mia', 'Noah', 'Emma', 'Leon', 'Lina', 'Finn', 'Sofia', 'Luca', 'Hanna', 'Ben', 'Lea', 'Elias', 'Nora',
  'Jonas', 'Ella', 'Paul', 'Maya', 'Tim', 'Zoe', 'Max', 'Ida', 'Liam', 'Anna', 'Felix', 'Clara', 'Omar', 'Yuki', 'Ravi',
  'Ines', 'Malik', 'Sara', 'Diego', 'Aiko', 'Jan', 'Lotta', 'Emil', 'Nina', 'Theo', 'Rosa', 'Milo'];
const SHIRTS = ['#ef476f', '#ffd23f', '#06d6a0', '#3b8ed0', '#9b5de5', '#f78c1f', '#ffffff', '#2ec4b6', '#ff70a6', '#70d6ff'];
const SKINS = ['#ffd9b3', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
const HAIRS = ['#3b2a1a', '#6b4423', '#d9a441', '#1b1b1b', '#b5451b', '#8a8a8a'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------- distance fields over the path network ----------
let cache = new Map(), cachePv = -1;
function bfs(sources) {
  const f = new Int16Array(N * N).fill(-1);
  let q = [];
  for (const i of sources) if (f[i] < 0) { f[i] = 0; q.push(i); }
  while (q.length) {
    const next = [];
    for (const i of q) {
      const x = i % N, y = (i / N) | 0, d = f[i] + 1, h = S.h[i];
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (!inB(nx, ny)) continue;
        const j = idx(nx, ny);
        if (S.path[j] && f[j] < 0 && Math.abs(S.h[j] - h) <= 1) { f[j] = d; next.push(j); }
      }
    }
    q = next;
  }
  return f;
}
export function field(key) {
  if (cachePv !== S.pv) { cache = new Map(); cachePv = S.pv; }
  let f = cache.get(key);
  if (f !== undefined) return f;
  let src = [];
  if (key === 'exit') src = [idx(S.ent.x, S.ent.y)];
  else if (key === 'bench') {
    for (let i = 0; i < N * N; i++) {
      if (S.scn[i] !== SCN.bench) continue;
      const x = i % N, y = (i / N) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (inB(nx, ny) && S.path[idx(nx, ny)]) src.push(idx(nx, ny));
      }
    }
  } else if (key.startsWith('cat:')) {
    const need = key.slice(4);
    for (const id in S.objs) {
      const o = S.objs[id];
      if (o.kind === 'stall' && o.open && STALLS[o.type].need === need) src.push(...accessTiles(o));
    }
  } else {
    const o = S.objs[key];
    if (o) src = accessTiles(o);
  }
  f = src.length ? bfs(src) : null;
  cache.set(key, f);
  return f;
}
const keyOf = (t) => (t.kind === 'obj' ? String(t.id) : t.kind === 'cat' ? 'cat:' + t.need : t.kind);

// ---------- ride stats helpers ----------
export function rideStats(o) {
  if (o.kind === 'coaster') return { E: o.E, I: o.I, Q: o.Q, cap: 0 };
  return RIDES[o.type];
}
export const rideWorth = (E) => 1.5 + E * 1.6;
export function rideUsable(o) {
  if (!o.open) return false;
  if (o.kind === 'coaster') return o.closed && o.sim && o.sim.ok;
  return o.kind === 'ride';
}
export function queueMax(o) {
  const cap = o.kind === 'coaster' ? o.capacity || 12 : RIDES[o.type].cap;
  return cap * 2 + 4;
}

// ---------- guests ----------
export function think(g, key, param) {
  if (g.cc > 0 && g.thoughts.length) return;
  g.cc = 6;
  g.thoughts.unshift([key, param || '']);
  if (g.thoughts.length > 6) g.thoughts.pop();
  S.thoughts[key] = (S.thoughts[key] || 0) + 1;
}

export function makeGuest(tx, ty) {
  const kind = Math.random();
  const tol = kind < 0.35 ? [0, rnd(4, 5.5)] : kind < 0.8 ? [1.5, rnd(6.5, 9)] : [3.5, 14];
  const g = {
    id: S.gid++, name: pick(FIRST) + ' ' + String.fromCharCode(65 + ((Math.random() * 26) | 0)) + '.',
    tx, ty, nx: tx, ny: ty, px: tx, py: ty, prog: 1, off: rnd(-0.22, 0.22), sp: rnd(0.9, 1.3),
    st: 'walk', obj: 0, target: null, timer: 0, wait: 0, cc: 0, cool: rnd(0, 3),
    hunger: rnd(5, 45), thirst: rnd(5, 45), toilet: rnd(0, 35), nausea: 0, energy: rnd(75, 100),
    happy: rnd(60, 80), cash: rnd(60, 130), tol, sus: rnd(0.5, 1.5), stay: rnd(120, 240), tIn: 0,
    thoughts: [], rode: {}, rides: 0, shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIRS),
    gift: 0, walk: rnd(0, 6),
  };
  return g;
}

function neighbors(tx, ty, out) {
  out.length = 0;
  const h = S.h[idx(tx, ty)];
  for (let k = 0; k < 4; k++) {
    const nx = tx + DX[k], ny = ty + DY[k];
    if (!inB(nx, ny)) continue;
    const j = idx(nx, ny);
    if (S.path[j] && Math.abs(S.h[j] - h) <= 1) out.push(j);
  }
  return out;
}
const nb = [];

function nearestPath(tx, ty) {
  for (let r = 1; r < N; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (inB(x, y) && S.path[idx(x, y)]) return [x, y];
    }
  }
  return null;
}

function reach(key, i) {
  const f = field(key);
  return f && f[i] >= 0;
}

function chooseTarget(g, i) {
  if (g.tIn > g.stay || g.cash < 2 || g.happy < 18 || g.energy < 6) {
    think(g, g.cash < 2 ? 'th_broke' : g.happy < 18 ? 'th_unhappy' : g.energy < 6 ? 'th_tired' : 'th_home');
    g.cc = 0;
    return { kind: 'exit' };
  }
  if (g.toilet > 70) {
    if (reach('cat:toilet', i)) return { kind: 'cat', need: 'toilet' };
    think(g, 'th_notoilet'); g.happy -= 4;
  }
  if (g.hunger > 65) {
    if (reach('cat:hunger', i)) return { kind: 'cat', need: 'hunger' };
    if (reach('cat:treat', i)) return { kind: 'cat', need: 'treat' };
    think(g, 'th_nofood'); g.happy -= 3;
  }
  if (g.thirst > 65) {
    if (reach('cat:thirst', i)) return { kind: 'cat', need: 'thirst' };
    if (reach('cat:treat', i)) return { kind: 'cat', need: 'treat' };
    think(g, 'th_nodrink'); g.happy -= 3;
  }
  if ((g.nausea > 55 || g.energy < 30) && reach('bench', i)) return { kind: 'bench' };
  if (g.nausea > 70) return null; // too queasy for rides, just walk it off
  if (g.cash > 15 && Math.random() < 0.05) {
    const need = Math.random() < 0.5 && !g.gift ? 'gift' : 'treat';
    if (reach('cat:' + need, i)) return { kind: 'cat', need };
  }
  if (Math.random() < 0.15) return null;
  // pick a ride
  let total = 0, any = false;
  const opts = [];
  for (const id in S.objs) {
    const o = S.objs[id];
    if (!rideUsable(o)) continue;
    any = true;
    if (!reach(String(o.id), i)) continue;
    const st = rideStats(o);
    if (st.I > g.tol[1]) continue;
    if (o.queue.length >= queueMax(o)) continue;
    if (o.price > rideWorth(st.E) * (0.85 + g.sus * 0.2)) {
      if (Math.random() < 0.3) { think(g, 'th_expensive', o.id); g.happy -= 1.5; }
      continue;
    }
    if (o.price > g.cash) continue;
    let w = (0.5 + st.E) * (0.5 + st.E) / (1 + 2 * (g.rode[o.id] || 0));
    if (st.I < g.tol[0]) w *= 0.3;
    opts.push([o.id, w]); total += w;
  }
  if (!opts.length) {
    if (!any || Math.random() < 0.15) { think(g, 'th_norides'); g.happy -= 2; }
    return null;
  }
  let r = Math.random() * total;
  for (const [id, w] of opts) { r -= w; if (r <= 0) return { kind: 'obj', id }; }
  return { kind: 'obj', id: opts[0][0] };
}

function stallNextTo(tx, ty, need) {
  for (let k = 0; k < 4; k++) {
    const x = tx + DX[k], y = ty + DY[k];
    if (!inB(x, y)) continue;
    const o = S.objs[S.occ[idx(x, y)]];
    if (o && o.kind === 'stall' && o.open && STALLS[o.type].need === need) return o;
  }
  return null;
}
const MAX_PAY = { hunger: 8, thirst: 6, treat: 6, gift: 12, toilet: 1 };

function arrive(g) {
  const t = g.target;
  g.target = null;
  if (t.kind === 'exit') { g.gone = true; return; }
  if (t.kind === 'bench') {
    g.st = 'pause'; g.timer = 6; g.energy = Math.min(100, g.energy + 35); g.nausea = Math.max(0, g.nausea - 35);
    think(g, 'th_rest');
    return;
  }
  if (t.kind === 'cat') {
    const o = stallNextTo(g.tx, g.ty, t.need);
    if (!o) return;
    if (o.price > MAX_PAY[t.need] || o.price > g.cash) {
      think(g, 'th_expensive', o.id); g.happy -= 3; g.cool = 8;
      return;
    }
    g.cash -= o.price; earn(o.price, 'stalls'); o.customers++; o.income += o.price;
    if (t.need === 'hunger') { g.hunger = Math.max(0, g.hunger - 75); g.thirst += 8; g.toilet += 8; g.happy += 5; think(g, 'th_yum'); }
    else if (t.need === 'thirst') { g.thirst = Math.max(0, g.thirst - 80); g.toilet += 22; g.happy += 3; }
    else if (t.need === 'treat') { g.hunger = Math.max(0, g.hunger - 30); g.thirst = Math.max(0, g.thirst - 30); g.happy += 7; think(g, 'th_yum'); }
    else if (t.need === 'toilet') { g.toilet = 0; g.happy += 3; }
    else if (t.need === 'gift') { g.gift = 1 + ((Math.random() * 5) | 0); g.happy += 10; think(g, 'th_gift'); }
    g.st = 'pause'; g.timer = rnd(1.5, 3);
    return;
  }
  const o = S.objs[t.id];
  if (!o || !rideUsable(o) || o.queue.length >= queueMax(o) || o.price > g.cash) return;
  g.st = 'queue'; g.obj = o.id; g.wait = 0;
  o.queue.push(g.id);
}

function decide(g) {
  let i = idx(g.tx, g.ty);
  if (!S.path[i]) {
    const p = nearestPath(g.tx, g.ty);
    if (!p) { g.gone = true; return; }
    g.tx = p[0]; g.ty = p[1]; g.px = g.tx; g.py = g.ty; i = idx(g.tx, g.ty);
  }
  if (!g.target && g.cool <= 0) {
    g.target = chooseTarget(g, i);
    g.cool = g.target ? 0 : rnd(1, 4);
  }
  let next = -1;
  if (g.target) {
    const f = field(keyOf(g.target));
    if (!f || f[i] < 0) { g.target = null; }
    else if (f[i] === 0) {
      arrive(g);
      if (g.st !== 'walk' || g.gone) { g.nx = g.tx; g.ny = g.ty; return; }
    } else {
      neighbors(g.tx, g.ty, nb);
      const want = f[i] - 1, good = [];
      for (const j of nb) if (f[j] === want) good.push(j);
      if (good.length) next = pick(good);
    }
  }
  if (next < 0) {
    neighbors(g.tx, g.ty, nb);
    if (!nb.length) { g.st = 'pause'; g.timer = 1.5; g.nx = g.tx; g.ny = g.ty; return; }
    const back = idx(g.px, g.py);
    const fwd = nb.filter((j) => j !== back);
    next = fwd.length ? pick(fwd) : nb[0];
  }
  g.px = g.tx; g.py = g.ty;
  g.nx = next % N; g.ny = (next / N) | 0;
  g.prog = 0;
}

export function updateGuest(g, dt) {
  g.tIn += dt; g.cc -= dt; g.cool -= dt;
  g.hunger = Math.min(100, g.hunger + 0.22 * dt);
  g.thirst = Math.min(100, g.thirst + 0.28 * dt);
  g.toilet = Math.min(100, g.toilet + 0.13 * dt);
  g.nausea = Math.max(0, g.nausea - 1.1 * dt);
  g.energy = Math.max(0, g.energy - 0.14 * dt);
  let drain = 0;
  if (g.hunger > 85) drain += 0.25;
  if (g.thirst > 85) drain += 0.25;
  if (g.toilet > 88) drain += 0.4;
  if (g.nausea > 75) drain += 0.3;
  g.happy = Math.max(0, Math.min(100, g.happy - drain * dt));
  if (g.st === 'queue') {
    g.wait += dt;
    if (g.wait > 25) g.happy -= 0.1 * dt;
    if (g.wait > 70 && Math.random() < 0.01) {
      const o = S.objs[g.obj];
      if (o) o.queue = o.queue.filter((id) => id !== g.id);
      think(g, 'th_wait', g.obj); g.happy -= 4; g.obj = 0; g.st = 'walk'; g.cool = 5;
    }
    return;
  }
  if (g.st === 'ride') return;
  if (g.st === 'pause') {
    g.timer -= dt;
    if (g.timer <= 0) { g.st = 'walk'; g.prog = 1; }
    return;
  }
  g.walk += dt * g.sp * 9;
  g.prog += g.sp * (g.nausea > 60 ? 0.6 : 1) * dt;
  if (g.prog >= 1) {
    g.tx = g.nx; g.ty = g.ny;
    decide(g);
  }
}

/** Puts riders back on the path after a ride and applies how they liked it. */
export function unloadRider(g, o, tiles) {
  const st = rideStats(o);
  let i = tiles.length ? pick(tiles) : idx(S.ent.x, S.ent.y);
  g.tx = i % N; g.ty = (i / N) | 0; g.nx = g.tx; g.ny = g.ty; g.px = g.tx; g.py = g.ty; g.prog = 1;
  g.st = 'walk'; g.obj = 0; g.target = null; g.cool = rnd(0.5, 3);
  g.rode[o.id] = (g.rode[o.id] || 0) + 1; g.rides++;
  g.happy = Math.min(100, g.happy + st.E * 2.2 + 2 + (st.I >= g.tol[0] ? 2 : 0));
  g.nausea = Math.min(100, g.nausea + st.Q * 6 * g.sus);
  g.energy = Math.max(0, g.energy - 3);
  g.cc = 0;
  if (g.nausea > 72) { think(g, 'th_sick', o.id); g.happy -= 6; }
  else think(g, st.E >= 6 ? 'th_wow' : 'th_great', o.id);
}

export function guestPos(g, out) {
  const t = g.st === 'walk' ? Math.min(1, g.prog) : 1;
  const ax = g.tx + 0.5, ay = g.ty + 0.5, bx = g.nx + 0.5, by = g.ny + 0.5;
  const fx = g.st === 'walk' ? ax : bx, fy = g.st === 'walk' ? ay : by;
  let x = fx + (bx - fx) * t, y = fy + (by - fy) * t;
  // keep a personal sideways offset so guests do not walk in single file
  x += g.off * 0.8; y -= g.off * 0.8;
  const za = S.h[idx(g.tx, g.ty)], zb = S.h[idx(g.nx, g.ny)];
  out.x = x; out.y = y; out.z = g.st === 'walk' ? za + (zb - za) * t : zb;
  return out;
}
