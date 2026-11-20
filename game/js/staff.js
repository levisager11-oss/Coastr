// Staff: the people who keep the park going. Handymen sweep up litter, mechanics repair rides that have
// broken down, entertainers cheer up the guests around them. The park only stores how many of each kind
// it employs (S.staff); the people themselves (S.crew) are made again from those numbers and walk the
// paths on their own. Never touches the DOM.
import { N, DX, DY, STAFF, STAFF_ORDER } from './data.js';
import { S, idx, inB, walkH, accessTiles, net, emit, objValue, canAfford, spend } from './world.js';
import { think, field } from './guests.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const SKINS = ['#ffd9b3', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
const HAIRS = ['#3b2a1a', '#6b4423', '#d9a441', '#1b1b1b', '#b5451b'];
// uniforms (handymen and mechanics also wear a cap: hat is an index into the guests' hat colours, see render.js)
const UNIFORM = { clean: '#2fa56a', mech: '#3d6fd1', fun: '#ffb703' };
let nextId = 1;

function makeCrew(kind, tx, ty) {
  // ids of their own, far from the guests' (and never a multiple of 7: those are drawn child-sized)
  const id = 7e6 + 1 + 7 * nextId++;
  return {
    id, crew: kind, tx, ty, nx: tx, ny: ty, px: tx, py: ty, prog: 1, off: rnd(-0.2, 0.2), sp: kind === 'fun' ? 0.8 : 1.5,
    st: 'walk', route: null, job: 0, timer: 0, cool: rnd(0, 2), walk: rnd(0, 6),
    shirt: UNIFORM[kind], skin: pick(SKINS), hair: pick(HAIRS), hat: kind === 'clean' ? 3 : kind === 'mech' ? 4 : 0, nausea: 0, em: null, emT: 0,
  };
}

/** Bring the people in the park in line with the numbers employed. */
export function syncCrew() {
  if (!S.crew) S.crew = [];
  if (!S.staff) S.staff = { clean: 0, mech: 0, fun: 0 };
  let changed = false;
  for (const kind of STAFF_ORDER) {
    const want = Math.max(0, Math.min(STAFF[kind].max, S.staff[kind] | 0));
    let have = 0;
    for (const m of S.crew) if (m.crew === kind) have++;
    while (have > want) {
      const k = S.crew.findIndex((m) => m.crew === kind && m.st !== 'work');
      const m = S.crew.splice(k < 0 ? S.crew.findIndex((q) => q.crew === kind) : k, 1)[0];
      release(m);
      have--; changed = true;
    }
    if (have < want) {
      // new people start at the gate; when a park is loaded they are already spread over the paths
      const f = S.crewSpread ? field('exit') : null, tiles = [];
      if (f) for (let i = 0; i < N * N; i++) if (f[i] >= 0) tiles.push(i);
      while (have < want) {
        const i = tiles.length ? pick(tiles) : idx(S.ent.x, S.ent.y);
        S.crew.push(makeCrew(kind, i % N, (i / N) | 0));
        have++; changed = true;
      }
    }
  }
  S.crewSpread = false;
  return changed;
}
function release(m) {
  if (!m) return;
  if (m.crew === 'clean') claimed.delete(m.job);
  const o = m.crew === 'mech' ? S.objs[m.job] : null;
  if (o && o.fixer === m.id) o.fixer = 0;
  m.job = 0; m.route = null;
}

// ---------- finding the way ----------
const prev = new Int32Array(N * N), mark = new Int32Array(N * N);
let stamp = 0;
/** The shortest way over the paths from tile `from` to the nearest tile that `want` accepts: the tiles to walk, last first. */
function routeTo(from, want, max = 60) {
  stamp++;
  let q = [from];
  mark[from] = stamp; prev[from] = -1;
  for (let step = 0; q.length && step < max; step++) {
    const next = [];
    for (const i of q) {
      if (i !== from && want(i)) {
        const out = [];
        for (let k = i; k !== from; k = prev[k]) out.push(k);
        return out;
      }
      const x = i % N, y = (i / N) | 0, h = walkH(i);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!inB(nx, ny)) continue;
        const j = idx(nx, ny);
        if (mark[j] === stamp || !S.path[j] || Math.abs(walkH(j) - h) > 1) continue;
        mark[j] = stamp; prev[j] = i; next.push(j);
      }
    }
    q = next;
  }
  return null;
}
const claimed = new Set(); // litter tiles a handyman is already on the way to
let brokenAt = null, brokenKey = '';
/** Path tiles next to rides that have broken down and have no mechanic on the way: tile -> ride id. */
function brokenTiles() {
  let key = '';
  for (const id in S.objs) { const o = S.objs[id]; if (o.broken && !o.fixer) key += id + ','; }
  if (key === brokenKey && brokenAt && brokenAt.pv === S.pv) return brokenAt.map;
  const map = new Map();
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.broken && !o.fixer) for (const i of accessTiles(o)) if (!map.has(i)) map.set(i, o.id);
  }
  brokenKey = key; brokenAt = { pv: S.pv, map };
  return map;
}

function findJob(m, i) {
  if (m.crew === 'clean') {
    if (S.lit[i] && !claimed.has(i) && i !== m.skip) { startWork(m, i); return; }
    const r = routeTo(i, (j) => S.lit[j] > 0 && !claimed.has(j) && j !== m.skip);
    if (r) { m.route = r; m.job = r[0]; claimed.add(r[0]); return; }
  } else if (m.crew === 'mech') {
    const map = brokenTiles();
    if (map.size) {
      const here = map.get(i), r = here ? [] : routeTo(i, (j) => map.has(j), 90);
      if (r) {
        const o = S.objs[here || map.get(r[0])];
        if (o) { o.fixer = m.id; m.job = o.id; m.route = r; brokenKey = ''; if (!r.length) startWork(m, i); return; }
      }
    }
  }
  m.cool = rnd(1.5, 3);
}
function startWork(m, i) {
  m.st = 'work'; m.route = null;
  if (m.crew === 'clean') { m.timer = 1.2; m.job = i; claimed.add(i); }
  else m.timer = 5;
}
function finishWork(m) {
  m.st = 'walk'; m.prog = 1; m.cool = 0.3;
  if (m.crew === 'clean') {
    claimed.delete(m.job);
    // (in a friend's park the host's handymen do the sweeping; ours only look busy and walk on)
    if (!net.quiet) S.lit[m.job] = 0; else m.skip = m.job;
  } else if (m.crew === 'mech') {
    const o = S.objs[m.job];
    if (o && o.fixer === m.id) {
      o.fixer = 0;
      if (o.broken && !net.quiet) { o.broken = 0; emit('fixed', { id: o.id }); }
    }
  }
  m.job = 0;
}

const nb = [];
function decide(m) {
  let i = idx(m.tx, m.ty);
  if (!S.path[i]) {
    // the path under their feet was taken away: back to the gate
    release(m);
    m.tx = m.nx = m.px = S.ent.x; m.ty = m.ny = m.py = S.ent.y; i = idx(m.tx, m.ty);
  }
  if (m.route) {
    if (!m.route.length) {
      // there: is the job still to be done?
      const o = m.crew === 'mech' ? S.objs[m.job] : null;
      if (m.crew === 'clean' ? S.lit[i] > 0 && i !== m.skip : o && o.broken && o.fixer === m.id) { startWork(m, i); m.nx = m.tx; m.ny = m.ty; return; }
      if (m.crew === 'clean') claimed.delete(m.job);
      release(m);
    } else {
      const j = m.route[m.route.length - 1], dx = Math.abs((j % N) - m.tx), dy = Math.abs(((j / N) | 0) - m.ty);
      if (S.path[j] && dx + dy === 1 && Math.abs(walkH(j) - walkH(i)) <= 1) {
        m.route.pop();
        m.px = m.tx; m.py = m.ty; m.nx = j % N; m.ny = (j / N) | 0; m.prog = 0;
        return;
      }
      if (m.crew === 'clean') claimed.delete(m.job);
      release(m); // the way there has changed
    }
  }
  if (!m.route && m.cool <= 0 && m.crew !== 'fun') {
    findJob(m, i);
    if (m.st === 'work') { m.nx = m.tx; m.ny = m.ty; return; }
    if (m.route) { decide(m); return; }
  }
  // nothing to do: stroll on, rather not back the way they came
  nb.length = 0;
  const h = walkH(i);
  for (let d = 0; d < 4; d++) {
    const nx = m.tx + DX[d], ny = m.ty + DY[d];
    if (!inB(nx, ny)) continue;
    const j = idx(nx, ny);
    if (S.path[j] && Math.abs(walkH(j) - h) <= 1) nb.push(j);
  }
  if (!nb.length) { m.nx = m.tx; m.ny = m.ty; m.prog = 0.5; return; }
  const back = idx(m.px, m.py), fwd = nb.filter((j) => j !== back);
  const next = fwd.length ? pick(fwd) : nb[0];
  m.px = m.tx; m.py = m.ty; m.nx = next % N; m.ny = (next / N) | 0; m.prog = 0;
}

/** Forget everything about the last park's staff (call when a park is started or loaded). */
export function resetCrew() { claimed.clear(); brokenKey = ''; brokenAt = null; }

/** Move the staff along. */
export function updateCrew(dt) {
  if (!S.crew || !S.crew.length) { if (claimed.size) claimed.clear(); return; }
  for (const m of S.crew) {
    m.cool -= dt;
    if (m.st === 'work') {
      m.timer -= dt; m.walk += dt * 14;
      // a mechanic's ride was mended some other way meanwhile (the repair service, or the host's own mechanic)
      if (m.crew === 'mech') { const o = S.objs[m.job]; if (!o || !o.broken) m.timer = 0; }
      if (m.timer <= 0) finishWork(m);
      continue;
    }
    m.walk += dt * m.sp * 9;
    m.prog += m.sp * dt;
    if (m.prog >= 1) { m.tx = m.nx; m.ty = m.ny; decide(m); }
  }
}

/** Once a second: entertainers cheer up the guests round them. */
export function cheer() {
  if (net.quiet || !S.crew) return;
  for (const m of S.crew) {
    if (m.crew !== 'fun') continue;
    for (const g of S.guests) {
      if (g.st !== 'walk' && g.st !== 'pause') continue;
      if (Math.abs(g.tx - m.tx) > 2 || Math.abs(g.ty - m.ty) > 2) continue;
      g.happy = Math.min(100, g.happy + 1.1);
      if (Math.random() < 0.06) think(g, 'th_fun');
    }
  }
}

export const wages = () => STAFF_ORDER.reduce((a, k) => a + STAFF[k].wage * (S.staff ? S.staff[k] | 0 : 0), 0);

/** Calling the repair service mends a ride at once, for a fee. */
export const repairCost = (o) => Math.max(100, Math.round(objValue(o) * 0.05 / 10) * 10);
export function repairNow(o) {
  if (!o.broken) return { ok: false, why: 'e_none' };
  const cost = repairCost(o);
  if (!canAfford(cost)) return { ok: false, why: 'e_money' };
  spend(cost, 'running');
  o.broken = 0; o.fixer = 0;
  return { ok: true };
}
