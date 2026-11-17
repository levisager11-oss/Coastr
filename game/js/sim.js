// The park simulation: time, rides, guest arrivals, money, research, goals, rating.
import {
  N, RIDES, STALLS, SCENERY, COASTERS, RESEARCH, RESEARCH_LEVELS, GOALS, DAY_LEN, MONTH_DAYS, MAX_GUESTS,
} from './data.js';
import { S, idx, accessTiles, spend, earn, canAfford, parkValue, emit, countWater } from './world.js';
import { field, makeGuest, updateGuest, unloadRider, rideUsable, rideStats } from './guests.js';
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
  let a = 0, best = 0, rides = 0, food = 0, drink = 0, toilet = 0, coasters = 0;
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
      if (o.kind === 'coaster') { a += 8 + st.E * 6; best = Math.max(best, st.E); coasters++; }
      else a += 5 + st.E * 3;
    }
  }
  return { a, best, rides, food, drink, toilet, coasters };
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
  const target = 1000 * (0.3 * clamp((happy - 30) / 60) + 0.3 * clamp(att.a / 300) + 0.15 * clamp(S.beautyNow / 420)
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
      if (isC) emit('dispatch', { id: o.id });
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
function researchDay() {
  const R = S.research;
  if (R.done >= RESEARCH.length || !R.level) return;
  const cost = RESEARCH_LEVELS[R.level] / MONTH_DAYS;
  if (!canAfford(cost)) return;
  spend(cost, 'research');
  R.pts += cost;
  const proj = RESEARCH[R.done];
  if (R.pts >= proj.pts) {
    R.pts -= proj.pts; R.done++;
    for (const u of proj.unlocks) S.unlocked[u] = 1;
    emit('research', { id: proj.id });
    if (R.done >= RESEARCH.length) award('scientist');
  }
}

// ---------- goals and achievements ----------
export function award(id) {
  if (S.sandbox || S.ach[id]) return;
  S.ach[id] = 1;
  emit('ach', { id });
}
export function goalProgress(i, att) {
  const g = GOALS[i];
  att = att || attraction();
  switch (g.id) {
    case 'g_open': return S.open && att.rides >= 2 && att.food ? 1 : (Math.min(att.rides, 2) + (att.food ? 1 : 0)) / 4;
    case 'g_guests1': case 'g_guests2': case 'g_guests3': return S.guests.length / g.n;
    case 'g_coaster1': case 'g_coaster2': return att.best / g.n;
    case 'g_rating1': case 'g_rating2': return S.rating / g.n;
    default: return Math.max(0, parkValue() / g.n);
  }
}
function checkGoals(att) {
  if (S.sandbox || S.goalsDone) return;
  while (S.goal < GOALS.length && goalProgress(S.goal, att) >= 1) {
    const g = GOALS[S.goal];
    if (g.reward) earn(g.reward, 'rewards');
    emit('goal', { i: S.goal, reward: g.reward });
    S.goal++;
  }
  if (S.goal >= GOALS.length) { S.goalsDone = true; award('career-done'); }
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
  if (S.sceneryCount >= 200) award('gardener');
  if (parkValue() >= 250000) award('tycoon');
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind !== 'coaster' || !rideUsable(o)) continue;
    if (o.loops) award('looping');
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
  if (S.open && S.guests.length < (S.target || 0)) {
    spawnAcc += dt * Math.min(1.2, 0.15 + ((S.target || 0) - S.guests.length) / 25);
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn(); }
  }
}

export function startTest(c) {
  if (!c.closed || !c.sim || !c.sim.ok || c.st !== 'idle') return false;
  c.st = 'test'; c.runT = 0;
  return true;
}
