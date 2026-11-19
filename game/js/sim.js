// The park simulation: time, rides, guest arrivals, money, research, goals, rating.
import {
  N, RIDES, STALLS, SCENERY, COASTERS, RESEARCH, RESEARCH_LEVELS, SCENARIOS, DAY_LEN, MONTH_DAYS, MAX_GUESTS, DAY_CYCLE, CHALLENGES,
  isCoaster,
} from './data.js';
import { S, idx, accessTiles, spend, earn, canAfford, parkValue, emit, countWater, objValue, net, platforms } from './world.js';
import { field, makeGuest, updateGuest, unloadRider, rideUsable, rideStats, think, buzz } from './guests.js';
import { recompute, STATION_HEAD } from './coaster.js';
import { syncCrew, updateCrew, cheer, wages, resetCrew } from './staff.js';

let secAcc = 0, spawnAcc = 0;

export function coasterCap(c) { return COASTERS[c.ctype].cap; }
/** How many trains a track has room for: one for every 70 m and three at most on a coaster (more boats on a flume). */
export function maxTrains(c) {
  const T = COASTERS[c.ctype];
  return c.sim && c.sim.ok ? Math.max(1, Math.min(T.maxTrains || 3, Math.floor(c.sim.L / (T.trainGap || 70)))) : 1;
}
export const trainsOf = (c) => Math.max(1, Math.min(maxTrains(c), c.trains || 1));
export const trainCost = (c) => Math.round(COASTERS[c.ctype].station * 0.6);

export function initAfterLoad() {
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'coaster') { recompute(o); o.capacity = coasterCap(o); }
    if (o.kind !== 'stall' && o.born === undefined) o.born = S.time - 12 * 60;
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
  resetCrew();
  S.crew = []; S.crewSpread = true; S.litter = 0;
  if (S.staffNew) {
    // a park from before there was staff: hire the people it needs, so it carries on as well as it did
    S.staffNew = false;
    if (S.guests.length >= 20) {
      let rides = 0;
      for (const id in S.objs) if (S.objs[id].kind !== 'stall') rides++;
      S.staff.clean = Math.min(5, Math.ceil(S.guests.length / 60));
      S.staff.mech = rides >= 4 ? 1 : 0;
      emit('staffnew', { clean: S.staff.clean, mech: S.staff.mech });
    }
  }
  syncCrew();
  secAcc = 0; spawnAcc = 0;
}

// ---------- park numbers ----------
export function attraction() {
  let a = 0, best = 0, top = 0, rides = 0, food = 0, drink = 0, toilet = 0, coasters = 0, maxInv = 0, maxHm = 0, maxKmh = 0, flume = 0, rail = 0, flat = 0;
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
        a += (8 + st.E * 6) * buzz(o); top = Math.max(top, st.E);
        const kind = COASTERS[o.ctype].kind;
        if (kind === 'flume') flume = Math.max(flume, st.E);
        else if (kind === 'train') rail = Math.max(rail, platforms(o).length);
        else {
          // only real coasters count for the coaster goals
          best = Math.max(best, st.E); coasters++;
          maxInv = Math.max(maxInv, o.inv || 0); maxHm = Math.max(maxHm, o.sim.maxH * 2); maxKmh = Math.max(maxKmh, o.sim.maxV * 3.6);
        }
      }
      else { a += (5 + st.E * 3) * buzz(o); flat++; }
    }
  }
  return { a, flat, best, top, rides, food, drink, toilet, coasters, maxInv, maxHm, maxKmh, flume, rail };
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
  const ev = S.event ? S.event.id : '';
  const boost = (S.marketing > 0 ? 1.4 : 1) * (ev === 'holiday' ? 1.35 : ev === 'fans' && att.coasters ? 1.2 : 1);
  return Math.min(MAX_GUESTS, Math.round((6 + att.a) * rf * boost));
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
// Now and then something happens for a month or so: holidays, a heat wave, coaster fans, a critic.
// A TV crew wants to film a really exciting ride; at a food festival guests are hungrier and pay more for food.
const EVENTS = { holiday: 60, heat: 45, fans: 60, critic: 45, tv: 45, festival: 50 };
function updateEvents(dt) {
  if (S.demo) return;
  if (S.event) {
    S.event.left -= dt;
    if (S.event.left > 0) return;
    const id = S.event.id;
    S.event = null; S.evNext = S.time + 170 + Math.random() * 130;
    let prize = 0;
    let good = true;
    if (id === 'critic') {
      good = S.rating >= 650;
      if (good) { prize = 1500; if (!S.sandbox) earn(prize, 'rewards'); S.marketing = Math.max(S.marketing, 2); }
    } else if (id === 'tv') {
      good = (S.att ? S.att.top : 0) >= 6;
      if (good) S.marketing = Math.max(S.marketing, 3);
    }
    emit('eventend', { id, prize, good });
    return;
  }
  if (S.time < (S.evNext || 0)) return;
  if (!S.open || S.guests.length < 15) { S.evNext = S.time + 40; return; }
  const ids = Object.keys(EVENTS).filter((id) => id !== 'heat' || S.theme !== 'snow');
  const id = ids[(Math.random() * ids.length) | 0];
  S.event = { id, left: EVENTS[id] };
  if (id === 'heat') S.wx = { kind: 'sun', t: EVENTS[id] };
  emit('event', { id });
}
// At the turn of the year the park is judged and may win awards.
function yearEnd(year) {
  const Y = S.yr || { guests: 0, income: 0, peak: 0 }, att = S.att || attraction();
  let hs = 0;
  for (const g of S.guests) hs += g.happy;
  const happy = S.guests.length ? hs / S.guests.length : 0, won = [];
  if (S.guests.length >= 20 && happy >= 72) won.push('aw_happy');
  if (att.best >= 6.5) won.push('aw_thrill');
  if ((S.beautyNow || 0) >= 450) won.push('aw_beauty');
  if (Y.peak >= 150) won.push('aw_busy');
  if (S.rating >= 750) won.push('aw_park');
  if (Y.peak >= 60 && (S.litter || 0) <= 4) won.push('aw_clean');
  if (att.flat >= 10) won.push('aw_family');
  if (att.flume >= 5) won.push('aw_water');
  if (!S.awards) S.awards = {};
  for (const id of won) { S.awards[id] = (S.awards[id] || 0) + 1; if (!S.sandbox) earn(1000, 'rewards'); }
  emit('year', { year, guests: Y.guests, income: Math.round(Y.income), won, prize: S.sandbox ? 0 : won.length * 1000 });
  S.yr = { guests: 0, income: 0, peak: 0 };
}
/** Bring a ride that has grown old back to normal. Costs a quarter of what it is worth. */
export const renovateCost = (o) => Math.round(objValue(o) * 0.25 / 10) * 10;
export function renovate(o) {
  const cost = renovateCost(o);
  if (!canAfford(cost)) return { ok: false, why: 'e_money' };
  spend(cost, 'build');
  o.born = S.time - 3 * 60; // a little of the buzz of a new ride comes back
  return { ok: true };
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
  // (litter lying about costs up to a tenth of the rating)
  const target = 1000 * (0.3 * clamp((happy - 30) / 60) + 0.3 * clamp(att.a / 300) + 0.15 * clamp(S.beautyNow / 900)
    + 0.1 * ((att.food + att.drink + att.toilet) / 3) + 0.15 * clamp(att.top / 8) - 0.1 * clamp((S.litter || 0) / 90));
  S.rating += (target - S.rating) * 0.06;
}

// ---------- rides ----------
/** A guest pays for a ride. (On a guest's copy of a shared park the host's game does the counting.) */
function fare(o) {
  if (net.quiet) return;
  earn(o.price, 'rides'); o.customers++; o.income += o.price;
}
/** Send waiting guests away from a ride (back onto the path beside it). */
function sendAway(o, ids, thought) {
  const tiles = accessTiles(o);
  for (const id of ids) {
    const g = S.gmap.get(id);
    if (!g) continue;
    g.st = 'walk'; g.obj = 0; g.prog = 1; g.cool = 4;
    if (tiles.length && !thought) { const i = tiles[0]; g.tx = g.nx = i % N; g.ty = g.ny = (i / N) | 0; }
    if (thought && Math.random() < 0.5) think(g, thought, o.id);
  }
}
/** Who gets on at a platform: the first `cap` guests waiting there. They pay as they board. */
function board(o, plat, cap) {
  const riders = [];
  if (o.kind !== 'coaster' || platforms(o).length < 2) riders.push(...o.queue.splice(0, cap));
  else {
    for (let k = 0; k < o.queue.length && riders.length < cap;) {
      const g = S.gmap.get(o.queue[k]);
      if (!g || (g.plat || 0) === plat) riders.push(o.queue.splice(k, 1)[0]); else k++;
    }
  }
  for (const id of riders) {
    const g = S.gmap.get(id);
    if (!g) continue;
    g.st = 'ride'; g.cash -= o.price;
    fare(o);
  }
  return riders;
}
// Rides break down now and then, old ones more often. Nobody gets on until a mechanic has been (or the
// repair service was called). With no mechanic in the park the maker's own people turn up after two months.
function breakdowns() {
  if (S.demo || S.tut < 99 && S.time < 6 * 60) return;
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'stall' || o.broken || !rideUsable(o)) continue;
    const m = (S.time - (o.born || 0)) / 60;
    if (m < 4) continue;
    if (Math.random() < 0.0014 * (m > 36 ? 2.4 : m > 18 ? 1.5 : 1)) { o.broken = S.time || 1; emit('broken', { id: o.id }); }
  }
}
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
      sendAway(o, [...o.queue, ...o.riders]);
      o.queue = []; o.riders = [];
    }
    o.st = 'idle'; o.runs = [];
    return;
  }
  if (o.broken) {
    if (o.queue.length) { sendAway(o, o.queue, 'th_broken'); o.queue = []; }
    if (!net.quiet && !(S.staff && S.staff.mech) && S.time - o.broken > 120) { o.broken = 0; emit('fixed', { id: o.id }); }
  }
  if (isC) { updateTrains(o, dt, cap); return; }
  if (o.st === 'idle') {
    if (o.queue.length && !o.broken) { o.st = 'load'; o.timer = 4; }
  } else if (o.st === 'load') {
    o.timer -= dt;
    if (o.queue.length >= cap) o.timer = Math.min(o.timer, 0.8);
    if (o.timer <= 0) {
      if (!o.queue.length) { o.st = 'idle'; return; }
      o.riders = board(o, 0, cap);
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

// A coaster can have several trains out at once. Each is a run {t, riders}; the next one leaves when
// the one before is far enough ahead.
function updateTrains(o, dt, cap) {
  const T = o.sim.T, n = trainsOf(o), stops = o.sim.stops || [], t0 = STATION_HEAD / 3.5;
  if (!o.runs) o.runs = [];
  let home = false, called = false;
  for (const r of o.runs) {
    r.t += dt;
    if (r.t >= T) home = true;
    // a railway's train calls at every platform on its way round: everyone gets off, and whoever waits there gets on
    while ((r.next || 0) < stops.length && r.t + t0 >= stops[r.next || 0].t) {
      const k = (r.next = (r.next || 0) + 1), tiles = accessTiles(o, k);
      if (!tiles.length) continue;
      for (const id of r.riders) { const g = S.gmap.get(id); if (g) unloadRider(g, o, tiles); }
      r.riders = board(o, k, cap);
      called = true;
    }
  }
  if (called) o.riders = o.runs.flatMap((r) => r.riders);
  if (home) {
    const tiles = accessTiles(o, stops.length ? 0 : undefined);
    o.runs = o.runs.filter((r) => {
      if (r.t < T) return true;
      for (const id of r.riders) { const g = S.gmap.get(id); if (g) unloadRider(g, o, tiles); }
      return false;
    });
    o.riders = o.runs.flatMap((r) => r.riders);
  }
  o.gap = (o.gap || 0) + dt;
  const free = !o.broken && o.runs.length < n && (!o.runs.length || o.gap >= Math.max(9, T / n));
  if (!free || !o.queue.length) o.load = 0;
  else {
    o.load = (o.load || 0) + dt;
    // (a railway's train also sets off empty when someone is waiting at another platform)
    if (o.load >= (o.queue.length >= cap ? 0.8 : 4)) {
      const riders = board(o, 0, cap);
      o.runs.push({ t: 0, riders, next: 0 });
      o.riders = o.runs.flatMap((r) => r.riders);
      o.gap = 0; o.load = 0;
      emit('dispatch', { id: o.id, sum: o.price * riders.length });
    }
  }
  o.st = o.runs.length ? 'run' : o.load > 0 ? 'load' : 'idle';
  o.runT = o.runs.length ? o.runs[0].t : 0;
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

// ---------- challenges ----------
// Optional tasks with a time limit and a reward. Three are on offer at a time; one can be worked on.
const up = (n, k = 10) => Math.ceil(n / k) * k;
const avgHappy = () => { let hs = 0; for (const g of S.guests) hs += g.happy; return S.guests.length ? hs / S.guests.length : 0; };
function tally() {
  let stalls = 0, rail = 0;
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'stall') stalls += o.income || 0;
    else if (o.kind === 'coaster' && COASTERS[o.ctype].kind === 'train') rail += o.customers || 0;
  }
  return { stalls, rail, scenery: S.sceneryCount, value: parkValue() };
}
/** What a challenge of this kind would ask for in the park as it is now, or null if it would make no sense. */
function makeChallenge(def, att) {
  const g = S.guests.length, c = { k: def.k, months: def.months };
  switch (def.k) {
    case 'guests': c.n = up(Math.max(40, g * 1.3 + 10)); if (c.n > MAX_GUESTS - 20) return null; c.reward = 1000 + c.n * 12; break;
    case 'rating': if (S.rating > 870) return null; c.n = up(S.rating + 60); c.reward = 2500; break;
    case 'happy': { const h = avgHappy(); if (h > 86 || g < 20) return null; c.n = Math.max(75, Math.min(92, Math.round(h + 7))); c.g = Math.max(40, up(g * 0.8)); c.reward = 2000; break; }
    case 'clean': if (g < 25) return null; c.n = 5; c.g = Math.max(30, up(g * 0.7)); c.reward = 1800; break;
    case 'stalls': c.n = Math.max(600, up(g * 14, 100)); c.reward = 1200 + up(c.n * 0.5, 100); break;
    case 'scenery': c.n = 50; c.reward = 1500; break;
    case 'rides': c.n = att.rides + 3; c.reward = 2500; break;
    case 'value': { const v = parkValue(); c.n = up(Math.max(v * 1.25, v + 8000), 1000); c.reward = 3000; break; }
    case 'budget': c.n = 5.5; c.cost = 9000; c.reward = 3500; break;
    case 'air': c.n = 4; c.reward = 3000; break;
    case 'fast': c.n = 95; c.reward = 3500; break;
    case 'flume': c.n = 4.8; c.reward = 3000; break;
    case 'rail': c.n = 120; c.reward = 2500; break;
    default: return null;
  }
  return c;
}
/** How far a challenge has come, 0 to 1. */
export function challengeProgress(c, att) {
  att = att || S.att || attraction();
  const b = c.base || {}, g = S.guests.length;
  // for the building challenges: the best of the tracked rides opened since the challenge began
  const fresh = (test) => {
    let best = 0;
    for (const id in S.objs) {
      const o = S.objs[id];
      if (o.kind === 'coaster' && rideUsable(o) && (o.born || 0) >= (c.start || 0) - 1) best = Math.max(best, test(o, COASTERS[o.ctype].kind) || 0);
    }
    return best;
  };
  let p = 0;
  switch (c.k) {
    case 'guests': p = g / c.n; break;
    case 'rating': p = S.rating / c.n; break;
    case 'happy': p = (avgHappy() / c.n) * (g >= c.g ? 1 : Math.min(0.95, g / c.g)); break;
    case 'clean': p = c.since === undefined ? 0 : (S.time - c.since) / 60; break;
    case 'stalls': p = (tally().stalls - (b.stalls || 0)) / c.n; break;
    case 'scenery': p = (S.sceneryCount - (b.scenery || 0)) / c.n; break;
    case 'rides': p = att.rides / c.n; break;
    case 'value': p = (parkValue() - (b.value || 0)) / Math.max(1, c.n - (b.value || 0)); break;
    case 'budget': p = fresh((o, kind) => !kind && o.cost <= c.cost && o.E / c.n); break;
    case 'air': p = fresh((o, kind) => !kind && o.sim.air / c.n); break;
    case 'fast': p = fresh((o, kind) => !kind && o.I <= 8 && (o.sim.maxV * 3.6) / c.n); break;
    case 'flume': p = fresh((o, kind) => kind === 'flume' && o.E / c.n); break;
    case 'rail': p = (tally().rail - (b.rail || 0)) / c.n; break;
    default: p = 0;
  }
  return Math.max(0, Math.min(1, p));
}
/** Keep three challenges on offer (all new ones when `fresh`). */
function offerChallenges(att, fresh) {
  const C = S.ch;
  if (fresh) C.offers = [];
  const taken = new Set(C.offers.map((c) => c.k));
  if (C.cur) taken.add(C.cur.k);
  const pool = CHALLENGES.filter((d) => !taken.has(d.k) && (!d.need || S.unlocked[d.need]) && d.k !== C.last);
  while (C.offers.length < 3 && pool.length) {
    const d = pool.splice((Math.random() * pool.length) | 0, 1)[0], c = makeChallenge(d, att);
    if (c) C.offers.push(c);
  }
}
function updateChallenges(att) {
  if (S.sandbox || S.demo) return;
  const C = S.ch;
  // a player's choice (it may come from a friend's game): start offer number i, or give up with -1
  const pk = S.chPick;
  if (pk && pk.id !== C.pick) {
    C.pick = pk.id;
    if (pk.i < 0 && C.cur) { C.last = C.cur.k; C.cur = null; }
    else if (pk.i >= 0 && !C.cur && C.offers[pk.i]) {
      const c = C.offers.splice(pk.i, 1)[0];
      c.start = S.time; c.end = S.time + c.months * 60; c.base = tally();
      if (c.k === 'clean') c.since = S.time;
      C.cur = c;
      emit('chstart', { k: c.k });
    }
  }
  const c = C.cur;
  if (c) {
    if (c.k === 'clean' && ((S.litter || 0) > c.n || S.guests.length < c.g)) c.since = S.time;
    if (challengeProgress(c, att) >= 1) {
      earn(c.reward, 'rewards');
      C.total = (C.total || 0) + 1; C.last = c.k; C.cur = null;
      emit('chdone', { k: c.k, reward: c.reward, total: C.total });
      award('challenger');
      if (C.total >= 10) award('challenge-10');
    } else if (S.time > c.end) { C.last = c.k; C.cur = null; emit('chfail', { k: c.k }); }
  }
  if (S.open || C.offers.length) offerChallenges(att, false);
}
/** Choose one of the challenges on offer (i = 0..2), or give up the one being worked on (i = -1). */
export function pickChallenge(i) { S.chPick = { i, id: Math.floor(Math.random() * 1e9) + 1 }; }
function checkAchievements(att) {
  if (S.sandbox) return;
  const n = S.guests.length;
  if (att.flat) award('first-ride');
  if (att.flume) award('splash');
  if (att.rail >= 2) award('all-aboard');
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
    if (o.kind !== 'coaster' || !rideUsable(o) || !isCoaster(o.ctype)) continue;
    if (o.sim && o.sim.maxH >= 29.5) award('giant');
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
  syncCrew();
  // how much litter lies about; a little of it is blown away or picked up by tidy guests every second
  let litter = 0;
  for (let i = 0, lit = S.lit; i < N * N; i++) {
    if (!lit[i]) continue;
    if (!net.mirror && Math.random() < 0.004) lit[i]--;
    litter += lit[i];
  }
  S.litter = litter;
  // a guest's copy of a shared park: the host's game keeps the rating, goals and awards, and how
  // many guests there are; this copy only brings in as many guests to walk about
  if (net.mirror) { S.target = S.open ? net.hostGuests : 0; return; }
  updateRating(att);
  S.target = S.open ? guestTarget(att) : 0;
  if (S.guests.length > S.peakGuests) S.peakGuests = S.guests.length;
  if (S.yr && S.guests.length > S.yr.peak) S.yr.peak = S.guests.length;
  cheer();
  checkGoals(att);
  checkAchievements(att);
  updateChallenges(att);
  if (!S.tipLitter && litter > 25 && !S.staff.clean) { S.tipLitter = 1; emit('tip', { id: 'litter' }); }
  if (!S.sandbox && S.waterNow >= 60) award('lake');
}
function newDay() {
  researchDay();
  breakdowns();
  const d = date();
  if (d.day === 1) newMonth();
}
function newMonth() {
  let run = 0;
  for (const id in S.objs) {
    const o = S.objs[id];
    run += o.kind === 'coaster' ? COASTERS[o.ctype].run * (1 + 0.3 * (trainsOf(o) - 1)) : (o.kind === 'ride' ? RIDES : STALLS)[o.type].run;
  }
  if (run) spend(run, 'running');
  const pay = wages();
  if (pay) spend(pay, 'wages');
  if (S.loan > 0) spend(Math.round(S.loan * 0.01), 'interest');
  if (S.marketing > 0) S.marketing--;
  if (!S.yr) S.yr = { guests: 0, income: 0, peak: 0 };
  const cur = S.fin.cur;
  S.yr.income += (cur.tickets || 0) + (cur.rides || 0) + (cur.stalls || 0);
  S.fin.last = S.fin.cur; S.fin.cur = {};
  const dd = date();
  if (dd.month === 0 && !S.demo) yearEnd(dd.year - 1);
  for (const k in S.thoughts) { S.thoughts[k] = Math.floor(S.thoughts[k] * 0.4); if (!S.thoughts[k]) delete S.thoughts[k]; }
  S.turnedAway = 0;
  if (!S.sandbox && S.guests.length >= 100 && (S.litter || 0) <= 3) award('spotless');
  if (!S.sandbox) offerChallenges(S.att || attraction(), true);
  emit('month');
}

function spawn() {
  if (net.mirror) { S.guests.push(makeGuest(S.ent.x, S.ent.y)); return; }
  const worth = feeWorth() * (0.8 + Math.random() * 0.5);
  if (S.fee > worth) { S.turnedAway++; return; }
  const g = makeGuest(S.ent.x, S.ent.y);
  g.cash -= S.fee;
  if (S.fee) earn(S.fee, 'tickets');
  if (S.fee > worth * 0.85) g.happy -= 6;
  S.guests.push(g);
  if (S.yr) S.yr.guests++;
}

/** Advance the simulation by dt seconds of game time. */
export function tick(dt) {
  if (!S.gmap) S.gmap = new Map();
  net.quiet = net.mirror;
  const dayBefore = Math.floor(S.time / DAY_LEN);
  S.time += dt;
  const dayAfter = Math.floor(S.time / DAY_LEN);
  if (!net.mirror) for (let d = dayBefore; d < dayAfter; d++) newDay();

  S.gmap.clear();
  for (const g of S.guests) S.gmap.set(g.id, g);
  for (const id in S.objs) { const o = S.objs[id]; if (o.kind !== 'stall') updateRide(o, dt); }
  let gone = false;
  for (const g of S.guests) { updateGuest(g, dt); if (g.gone) gone = true; }
  if (gone) S.guests = S.guests.filter((g) => !g.gone);
  updateCrew(dt);

  secAcc += dt;
  if (secAcc >= 1) { secAcc -= 1; if (secAcc > 1) secAcc = 0; everySecond(); }
  if (!net.mirror) { updateWeather(dt); updateEvents(dt); }
  updateShow(dt);
  if (S.open && S.guests.length < (S.target || 0)) {
    spawnAcc += dt * Math.min(1.2, 0.15 + ((S.target || 0) - S.guests.length) / 25) * (isWet() ? 0.6 : 1);
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn(); }
  }
  net.quiet = false;
}

export function startTest(c) {
  if (!c.closed || !c.sim || !c.sim.ok || c.st !== 'idle') return false;
  c.st = 'test'; c.runT = 0;
  return true;
}
