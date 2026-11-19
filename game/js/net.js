// Playing one park together: rooms on the relay (server/rooms.js) and what goes over them.
// The host's game runs the park as always and sends what changes; the guests' games send what
// their players build and show the host's park (net.mirror, see sync.js). No DOM here: the
// interface listens through setNetHooks.
import { S, net, events, serialize } from './world.js';
import { resetSync, diff, apply, hostState, takeState, lastSeq, ratingsOf, putRatings } from './sync.js';

export const RELAY = 'wss://coastr-rooms.levisager.workers.dev';
export const MAX_PLAYERS = 4;
/** One colour per player, by slot (the host is 0). */
export const COLORS = ['#ff9f1c', '#3b8ed0', '#ef476f', '#9b5de5'];
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// things that happen in the host's game that the others should hear about too
const SHARE = new Set(['goal', 'star', 'research', 'ach', 'month', 'year', 'event', 'eventend', 'broken', 'fixed', 'chdone', 'chfail', 'tip']);

/** players: [{slot, name}]; cursors: slot -> {x, y}, the tile each of the others last pointed at. */
export const room = { code: '', players: [], cursors: new Map(), joined: false };
let ws = null, hooks = {}, acks = {}, shared = [], flushT = 0, stateT = 0, fullWait = null;
let cur = null, curSent = '', curT = 0;

export function setNetHooks(h) { hooks = h; }
const call = (k, ...a) => { try { if (hooks[k]) return hooks[k](...a); } catch (e) { console.error(e); } return undefined; };
const company = () => room.players.length > 1;
function send(route, m) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(route + '|' + JSON.stringify(m)); } catch (e) { /* the close handler sorts it out */ }
}
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function connect(code, host, name) {
  return new Promise((resolve, reject) => {
    let done = false, s;
    const fail = (why) => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { s.close(); } catch (e) { /* ignore */ }
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('net'), 12000);
    try {
      s = new WebSocket(`${RELAY}/room/${code}?role=${host ? 'host' : 'join'}&name=${encodeURIComponent(name)}`);
    } catch (e) { fail('net'); return; }
    s.onmessage = (e) => {
      const raw = String(e.data), bar = raw.indexOf('|');
      if (bar < 1) return;
      let m;
      try { m = JSON.parse(raw.slice(bar + 1)); } catch (er) { return; }
      const from = raw.slice(0, bar);
      if (!done) {
        if (from === 's' && m.t === 'err') fail(m.why);
        else if (from === 's' && m.t === 'hello') { done = true; clearTimeout(timer); ws = s; begin(code, host, m); resolve(); }
        return;
      }
      if (ws === s) onMessage(from, m);
    };
    s.onclose = () => { if (!done) fail('net'); else if (ws === s) finish('lost'); };
    s.onerror = () => { if (!done) fail('net'); };
  });
}

function begin(code, host, hello) {
  net.on = true; net.slot = hello.slot; net.mirror = false;
  room.code = code; room.players = hello.players || []; room.joined = host; room.cursors.clear();
  acks = {}; shared = []; flushT = 0; stateT = 0; curSent = '';
  if (host) resetSync();
  call('players');
}
function finish(why) {
  const guest = net.on && net.slot !== 0;
  ws = null;
  net.on = false; net.mirror = false; net.slot = 0;
  room.code = ''; room.players = []; room.cursors.clear(); room.joined = false;
  if (fullWait) { fullWait(false); fullWait = null; }
  if (why) call('end', why, guest);
}

/** Open a room for the park being played. Resolves to the room's code. */
export async function hostRoom(name) {
  for (let k = 0; k < 6; k++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CH[(Math.random() * CODE_CH.length) | 0];
    try { await connect(code, true, name); return code; } catch (e) { if (e.message !== 'taken') throw e; }
  }
  throw new Error('net');
}
/** Join a friend's room. Resolves once the host's park has arrived (the 'full' hook has started it). */
export async function joinRoom(code, name) {
  code = cleanCode(code);
  if (code.length < 4) throw new Error('noroom');
  await connect(code, false, name);
  if (room.joined) return;
  const ok = await new Promise((res) => {
    fullWait = res;
    setTimeout(() => { if (fullWait === res) { fullWait = null; res(false); } }, 25000);
  });
  if (!ok) { leaveRoom(); throw new Error('net'); }
}
/** Leave the room (the host closes it for everyone). */
export function leaveRoom() {
  if (!ws && !net.on) return;
  const s = ws;
  if (net.on && s) flush();
  finish(null);
  if (s) { try { s.close(1000, 'bye'); } catch (e) { /* ignore */ } }
}

function onMessage(from, m) {
  if (from === 's') {
    if (m.t === 'join') {
      room.players = [...room.players.filter((p) => p.slot !== m.slot), { slot: m.slot, name: m.name }].sort((a, b) => a.slot - b.slot);
      if (net.slot === 0) welcome(m.slot);
      call('join', m); call('players');
    } else if (m.t === 'leave') {
      const p = room.players.find((q) => q.slot === m.slot);
      room.players = room.players.filter((q) => q.slot !== m.slot);
      room.cursors.delete(m.slot); delete acks[m.slot];
      call('leave', { slot: m.slot, name: p ? p.name : '' }); call('players');
    } else if (m.t === 'name') {
      room.players = room.players.map((q) => (q.slot === m.slot ? { slot: q.slot, name: m.name } : q));
      call('players');
    } else if (m.t === 'end') finish('host');
    return;
  }
  const by = +from;
  if (m.t === 'cur') {
    if (typeof m.x === 'number') room.cursors.set(by, { x: m.x, y: m.y }); else room.cursors.delete(by);
    return;
  }
  if (net.slot === 0) {
    // a guest built something: take it in, then pass it on to everyone, the builder included,
    // so that all games end up the same even when two players change one tile at once
    if (m.t === 'd') { flush(); apply(m, by, true); acks[by] = m.seq; m.by = by; send('c', m); }
    return;
  }
  if (m.t === 'full') {
    if (room.joined) return;
    room.joined = true; net.mirror = true;
    const ratings = ratingsOf(m.d.objs || []);
    call('full', m);
    putRatings(ratings);
    resetSync();
    if (fullWait) { fullWait(true); fullWait = null; }
    return;
  }
  if (!room.joined) return;
  if (m.t === 'd') { flush(); apply(m, m.by, false); }
  else if (m.t === 's') {
    flush();
    takeState(m, ((m.acks && m.acks[net.slot]) || 0) >= lastSeq());
    for (const e of m.ev || []) events.push(e);
  }
}
/** Send the whole park to a player who just came in. */
function welcome(slot) {
  flush();
  send(String(slot), { t: 'full', d: serialize(), speed: S.speed, park: call('parkId') || '' });
  stateT = 1; // and the numbers right after
}
/** Send what changed here. */
function flush() {
  if (!net.on || (net.slot !== 0 && !room.joined)) return;
  const d = diff(net.slot !== 0);
  if (!d || !company()) return;
  d.t = 'd';
  if (net.slot === 0) { d.by = 0; send('c', d); } else send('h', d);
}

/** Call once a frame while a park is played. */
export function netTick(dt) {
  if (!net.on) return;
  flushT += dt; stateT += dt; curT += dt;
  if (flushT >= 0.25) { flushT = 0; flush(); }
  if (net.slot === 0 && stateT >= 1) {
    stateT = 0;
    if (company()) send('c', Object.assign(hostState(), { t: 's', acks, ev: shared }));
    shared = [];
  }
  if (cur && curT >= 0.2) {
    const k = cur.x + ',' + cur.y;
    if (k !== curSent) { curSent = k; curT = 0; if (company()) send('a', { t: 'cur', x: cur.x, y: cur.y }); }
  }
}
/** The host passes on what happened in its game (goals, research, achievements, ...). Call before the events are handled. */
export function shareEvents(list) {
  if (!net.on || net.slot !== 0) return;
  for (const e of list) if (SHARE.has(e.type)) shared.push(e);
}
/** Change this player's name for the others. */
export function renameMe(name) { send('n', { name }); }
/** The tile this player is pointing at or last built on, shown to the others. */
export function setCursor(x, y) { if (net.on) cur = { x, y }; }
export const playerName = (slot) => { const p = room.players.find((q) => q.slot === slot); return p ? p.name : ''; };
