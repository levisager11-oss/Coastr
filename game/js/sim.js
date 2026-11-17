// The park simulation: time, rides, guest arrivals, money, research, goals, rating.
import {
  N, RIDES, STALLS, SCENERY, COASTERS, RESEARCH, RESEARCH_LEVELS, SCENARIOS, DAY_LEN, MONTH_DAYS, MAX_GUESTS, DAY_CYCLE,
} from './data.js';
import { S, idx, accessTiles, spend, earn, canAfford, parkValue, emit, countWater } from './world.js';
import { field, makeGuest, updateGuest, unloadRider, rideUsable, rideStats, think } from './guests.js';
import { recompute } from './coaster.js';

let secAcc = 0, spawnAcc = 0;

export function coasterCap(c) { return COASTERS[c.ctype].cap; }

export function initAfterLoad() {
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'coaster') { recompute(o); o.capacity = coasterCap(o); }
  }
  if (S.restoreGuests) {
    const f = field('exit'), tiles = [];
    if (f) for (let i = 0; i < N * N; i++) if (f[i] >= 0) tiles.push(i);
    for (let k = 0; k < S.restoreGuests && tiles.length; k++) {
      const i = tiles[(Math.random() * tiles.length) | 0];
      const g = makeGuest(i % N, (i / N) | 0);
      g.tIn = Math.random() * g.stay * 0.7;
      S.guests.push(g);
    }
    S.restoreGuests = 0;
  }
  secAcc = 0; spawnAcc = 0;
}

// ---------- park numbers ----------
export function attraction() {
  let a = 0, best = 0, rides = 0, food = 0, drink = 0, toilet = 0, coasters = 0, maxInv = 0, maxHm = 0, maxKmh = 0;
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'stall') {
      a += 1;
      const need = STALLS[o.type].need;
      if (need === 'hunger' || need === 'treat') food = 1;
      if (need === 'thirst' || need === 'treat') drink = 1;
      if (need === 'toilet') toilet = 1;
    } else if (rideUsable(o)) {
      const st = rideStats(o);
      rides++;
      if (o.kind === 'coaster') {
        a += 8 + st.E * 6; best = Math.max(best, st.E); coasters++;
        maxInv = Math.max(maxInv, o.inv || 0); maxHm = Math.max(maxHm, o.sim.maxH * 2); maxKmh = Math.max(maxKmh, o.sim.maxV * 3.6);
      }
      else a += 5 + st.E * 3;
    }
  }
  return { a, best, rides, food, drink, toilet, coasters, maxInv, maxHm, maxKmh };
}
export function beauty() {
  let b = 0;
  for (let i = 0; i < N * N; i++) {
    if (S.scn[i]) b += SCENERY[S.scn[i]].beauty;
    else if (S.water[i]) b += 0.5;
  }
  return b;
}
export function feeWorth() {
  let w = 8;
  for (const id in S.objs) { const o = S.objs[id]; if (rideUsable(o)) w += rideStats(o).E * 1.2; }
  return Math.min(60, w);
}
export function guestTarget(att) {
  const rf = 0.55 + (S.rating / 1000) * 0.85;
  return Math.min(MAX_GUESTS, Math.round((6 + att.a) * rf * (S.marketing > 0 ? 1.4 : 1)));
}
/** How dark it is right now: 0 in daylight, 1 in the middle of the night. */
export function darkness() {
  const p = (S.time % DAY_CYCLE) / DAY_CYCLE;
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return ss(0.62, 0.72, p) * (1 - ss(0.92, 1, p));
}
export const isWet = () => S.wx && (S.wx.kind === 'rain' || S.wx.kind === 'snow');
function updateWeather(dt) {
  const w = S.wx || (S.wx = { kind: 'sun', t: 60 });
  w.t -= dt;
  if (w.t > 0) return;
  const r = Math.random(), th = S.theme;
  if (th === 'desert') { w.kind = r < 0.85 ? 'sun' : 'cloud'; }
  else if (th === 'snow') { w.kind = r < 0.45 ? 'sun' : r < 0.7 ? 'cloud' : 'snow'; }
  else w.kind = r < 0.55 ? 'sun' : r < 0.8 ? 'cloud' : 'rain';
  w.t = w.kind === 'sun' ? 70 + Math.random() * 90 : 35 + Math.random() * 40;
}
// a short firework show once every evening, if the park is doing well
function updateShow(dt) {
  if (S.fw > 0) S.fw = Math.max(0, S.fw - dt);
  const cycle = Math.floor(S.time / DAY_CYCLE), p = (S.time % DAY_CYCLE) / DAY_CYCLE;
  if (p > 0.74 && p < 0.9 && S.fwDay !== cycle) {
    S.fwDay = cycle;
    if (S.demo || (S.open && S.rating >= 550 && S.guests.length >= 25)) {
      S.fw = 16;
      for (const g of S.guests) { g.happy = Math.min(100, g.happy + 3); if (Math.random() < 0.4) think(g, 'th_fire'); }
      emit('fireworks');
    }
  }
}
export function date() {
  const day = Math.floor(S.time / DAY_LEN);
  const m = Math.floor(day / MONTH_DAYS);
  return { day: (day % MONTH_DAYS) + 1, month: (m + 2) % 12, year: Math.floor((m + 2) / 12) + 1, m };
}

function updateRating(att) {
  let hs = 0;
  for (const g of S.guests) hs += g.happy;
  const n = S.guests.length;
  const happy = (hs + 60 * 5) / (n + 5);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const target = 1000 * (0.3 * clamp((happy - 30) / 60) + 0.3 * clamp(att.a / 300) + 0.15 * clamp(S.beautyNow / 900)
    + 0.1 * ((att.food + att.drink + att.toilet) / 3) + 0.15 * clamp(att.best / 8));
  S.rating += (target - S.rating) * 0.06;
}

// ---------- rides ----------
function updateRide(o, dt) {
  const isC = o.kind === 'coaster';
  const st = isC ? null : RIDES[o.type];
  const cap = isC ? coasterCap(o) : st.cap;
  const running = o.st === 'run' || o.st === 'test';
  o.spin = (o.spin || 0) + ((running ? 1 : 0) - (o.spin || 0)) * Math.min(1, dt * 1.6);
  o.anim = (o.anim || 0) + dt * o.spin;
  if (o.st === 'test') {
    o.runT += dt;
    if (o.runT >= o.sim.T) { o.st = 'idle'; o.runT = 0; emit('testdone', { id: o.id }); }
    return;
  }
  if (!rideUsable(o)) {
    if (o.queue.length || o.riders.length) {
      const tiles = accessTiles(o);
      for (const id of [...o.queue, ...o.riders]) {
        const g = S.gmap.get(id);
        if (g) { g.st = 'walk'; g.obj = 0; g.prog = 1; if (tiles.length) { const i = tiles[0]; g.tx = g.nx = i % N; g.ty = g.ny = (i / N) | 0; } }
      }
      o.queue = []; o.riders = [];
    }
    o.st = 'idle';
    return;
  }
  if (o.st === 'idle') {
    if (o.queue.length) { o.st = 'load'; o.timer = 4; }
  } else if (o.st === 'load') {
    o.timer -= dt;
    if (o.queue.length >= cap) o.timer = Math.min(o.timer, 0.8);
    if (o.timer <= 0) {
      if (!o.queue.length) { o.st = 'idle'; return; }
      o.riders = o.queue.splice(0, cap);
      for (const id of o.riders) {
        const g = S.gmap.get(id);
        if (!g) continue;
        g.st = 'ride'; g.cash -= o.price;
        earn(o.price, 'rides'); o.customers++; o.income += o.price;
      }
      o.st = 'run'; o.runT = 0;
      o.timer = isC ? o.sim.T : st.dur;
      emit('dispatch', { id: o.id, sum: o.price * o.riders.length });
    }
  } else if (o.st === 'run') {
    o.timer -= dt; o.runT += dt;
    if (o.timer <= 0) {
      const tiles = accessTiles(o);
      for (const id of o.riders) { const g = S.gmap.get(id); if (g) unloadRider(g, o, tiles); }
      o.riders = []; o.st = 'idle'; o.runT = 0;
    }
  }
}

// ---------- research ----------
/** Index of the project being worked on: the first one with something still locked. -1 when all is done. */
export function researchNext() {
  for (let i = 0; i < RESEARCH.length; i++) if (RESEARCH[i].unlocks.some((u) => !S.unlocked[u])) return i;
  return -1;
}
function researchDay() {
  const R = S.research, i = researchNext();
  if (i < 0 || !R.level) return;
  const cost = RESEARCH_LEVELS[R.level] / MONTH_DAYS;
  if (!canAfford(cost)) return;
  spend(cost, 'research');
  R.pts += cost;
  const proj = RESEARCH[i];
  if (R.pts >= proj.pts) {
    R.pts -= proj.pts;
    for (const u of proj.unlocks) S.unlocked[u] = 1;
    emit('research', { id: proj.id });
    if (researchNext() < 0) award('scientist');
  }
}

// ---------- goals and achievements ----------
export const goalsOf = () => (SCENARIOS[S.sc] || SCENARIOS.meadows).goals;
export function award(id) {
  if (S.sandbox || S.ach[id]) return;
  S.ach[id] = 1;
  emit('ach', { id });
}
export function goalProgress(i, att) {
  const g = goalsOf()[i];
  att = att || attraction();
  switch (g.k) {
    case 'open': return S.open && att.rides >= 2 && att.food ? 1 : (Math.min(att.rides, 2) + (att.food ? 1 : 0)) / 4;
    case 'guests': return S.guests.length / g.n;
    case 'coaster': return att.best / g.n;
    case 'rating': return S.rating / g.n;
    case 'coasters': return att.coasters / g.n;
    case 'rides': return att.rides / g.n;
    case 'inv': return att.maxInv / g.n;
    case 'high': return att.maxHm / g.n;
    case 'speed': return att.maxKmh / g.n;
    default: return Math.max(0, parkValue() / g.n);
  }
}
/** Stars earned in this scenario for a number of finished goals. */
export function starsFor(goal) { return (SCENARIOS[S.sc] || SCENARIOS.meadows).stars.filter((n) => goal >= n).length; }
function checkGoals(att) {
  if (S.sandbox || S.goalsDone) return;
  const goals = goalsOf();
  while (S.goal < goals.length && goalProgress(S.goal, att) >= 1) {
    const g = goals[S.goal];
    if (g.reward) earn(g.reward, 'rewards');
    emit('goal', { i: S.goal, reward: g.reward });
    S.goal++;
  }
  if (S.goal >= goals.length) { S.goalsDone = true; if (S.sc === 'meadows') award('career-done'); }
  const st = starsFor(S.goal);
  if (st > (S.stars || 0)) { S.stars = st; emit('star', { n: st }); }
}
function checkAchievements(att) {
  if (S.sandbox) return;
  const n = S.guests.length;
  if (att.rides - att.coasters > 0) award('first-ride');
  if (att.coasters) award('first-coaster');
  if (n >= 50) award('guests-50');
  if (n >= 150) award('guests-150');
  if (n >= 300) award('guests-300');
  if (att.best >= 7) award('thrill-maker');
  if (S.rating >= 800) award('rating-800');
  if (S.sceneryCount >= 300) award('gardener');
  if (parkValue() >= 250000) award('tycoon');
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind !== 'coaster' || !rideUsable(o)) continue;
    if (o.loops) award('looping');
    if ((o.inv || 0) >= 3) award('twisted');
    if (o.sim && o.sim.maxV * 3.6 >= 100) award('speed-100');
    if (o.sim && o.sim.maxH >= 19.5) award('sky-high');
  }
}

// ---------- the clock ----------
function everySecond() {
  const att = attraction();
  S.att = att;
  if (S.beautyPv !== S.pv) { S.beautyNow = beauty(); S.beautyPv = S.pv; S.waterNow = countWater(); }
  updateRating(att);
  S.target = S.open ? guestTarget(att) : 0;
  if (S.guests.length > S.peakGuests) S.peakGuests = S.guests.length;
  checkGoals(att);
  checkAchievements(att);
  if (!S.sandbox && S.waterNow >= 60) award('lake');
}
function newDay() {
  researchDay();
  const d = date();
  if (d.day === 1) newMonth();
}
function newMonth() {
  let run = 0;
  for (const id in S.objs) {
    const o = S.objs[id];
    run += o.kind === 'coaster' ? COASTERS[o.ctype].run : (o.kind === 'ride' ? RIDES : STALLS)[o.type].run;
  }
  if (run) spend(run, 'running');
  if (S.loan > 0) spend(Math.round(S.loan * 0.01), 'interest');
  if (S.marketing > 0) S.marketing--;
  S.fin.last = S.fin.cur; S.fin.cur = {};
  for (const k in S.thoughts) { S.thoughts[k] = Math.floor(S.thoughts[k] * 0.4); if (!S.thoughts[k]) delete S.thoughts[k]; }
  S.turnedAway = 0;
  emit('month');
}

function spawn() {
  const worth = feeWorth() * (0.8 + Math.random() * 0.5);
  if (S.fee > worth) { S.turnedAway++; return; }
  const g = makeGuest(S.ent.x, S.ent.y);
  g.cash -= S.fee;
  if (S.fee) earn(S.fee, 'tickets');
  if (S.fee > worth * 0.85) g.happy -= 6;
  S.guests.push(g);
}

/** Advance the simulation by dt seconds of game time. */
export function tick(dt) {
  if (!S.gmap) S.gmap = new Map();
  const dayBefore = Math.floor(S.time / DAY_LEN);
  S.time += dt;
  const dayAfter = Math.floor(S.time / DAY_LEN);
  for (let d = dayBefore; d < dayAfter; d++) newDay();

  S.gmap.clear();
  for (const g of S.guests) S.gmap.set(g.id, g);
  for (const id in S.objs) { const o = S.objs[id]; if (o.kind !== 'stall') updateRide(o, dt); }
  let gone = false;
  for (const g of S.guests) { updateGuest(g, dt); if (g.gone) gone = true; }
  if (gone) S.guests = S.guests.filter((g) => !g.gone);

  secAcc += dt;
  if (secAcc >= 1) { secAcc -= 1; if (secAcc > 1) secAcc = 0; everySecond(); }
  updateWeather(dt); updateShow(dt);
  if (S.open && S.guests.length < (S.target || 0)) {
    spawnAcc += dt * Math.min(1.2, 0.15 + ((S.target || 0) - S.guests.length) / 25) * (isWet() ? 0.6 : 1);
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn(); }
  }
}

export function startTest(c) {
  if (!c.closed || !c.sim || !c.sim.ok || c.st !== 'idle') return false;
  c.st = 'test'; c.runT = 0;
  return true;
}
