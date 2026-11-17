// Everything the player touches: toolbar, build menus, panels, the coaster builder, and map input.
import {
  N, DX, DY, RIDES, STALLS, SCENERY, SCN, COASTERS, RIDE_ORDER, STALL_ORDER, COASTER_ORDER, RESEARCH, RESEARCH_LEVELS,
  GOALS, MAX_LOAN,
} from './data.js';
import {
  S, idx, inB, events, canPath, placePath, removePath, canPlaceBox, placeRide, placeStall, footprint, canScenery,
  placeScenery, removeScenery, canTerrain, terrain, canWater, setWater, whatAt, removeObj, objValue, accessTiles,
  parkValue, canAfford, spend, earn,
} from './world.js';
import { canStartCoaster, startCoaster, addPiece, undoPiece, autoFinish, endState } from './coaster.js';
import { rideWorth, rideStats, rideUsable } from './guests.js';
import { date, feeWorth, goalProgress, startTest, coasterCap } from './sim.js';
import { cam, view, pickTile, pickThing, toWorld, isoX, isoY, coasterThumb, objCenter } from './render.js';
import { drawRide, drawStall, thumbRide, thumbStall, thumbScenery, drawScenery } from './sprites.js';
import { t, money, num, lang } from './i18n.js';
import { sfx, unlock, audio } from './audio.js';
import { icon } from './icons.js';

export const ui = {
  tool: 'inspect', item: null, rot: 0, ghost: null, sel: null, editing: 0, follow: 0, followPos: null,
  pending: null, slope: 0, chain: false, bank: false, camTarget: null, touch: false, hooks: {},
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let els = {};

export function objName(o) {
  if (!o) return '…';
  return t('n_' + (o.kind === 'coaster' ? o.ctype : o.type)) + ' ' + o.num;
}

// ---------- toasts and dialogs ----------
export function toast(text, kind = '') {
  if (!text) return;
  const last = els.toasts.lastElementChild;
  if (last && last.textContent === text && !last.classList.contains('out')) return;
  const d = document.createElement('div');
  d.className = 'toast ' + kind;
  d.textContent = text;
  els.toasts.appendChild(d);
  while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
  setTimeout(() => d.classList.add('out'), 2600);
  setTimeout(() => d.remove(), 3100);
}
function fail(r) {
  const msg = t(r.why);
  if (msg && msg !== r.why) toast(msg, 'bad');
  sfx('error');
}
let modalResolve = null;
export function dialog(html, buttons) {
  return new Promise((resolve) => {
    if (modalResolve) modalResolve(null);
    modalResolve = resolve;
    els.modal.innerHTML = `<div class="dialog" role="dialog">${html}<div class="btns">${buttons.map((b, i) =>
      `<button class="btn ${b.cls || 'flat'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    els.modal.hidden = false;
    els.modal.onclick = (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b && e.target !== els.modal) return;
      els.modal.hidden = true; modalResolve = null;
      sfx('click');
      resolve(b ? buttons[+b.dataset.i].value : null);
    };
  });
}
export function showHelp() {
  const items = t('help').map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('');
  return dialog(`<h2>${esc(t('help_title'))}</h2><dl>${items}</dl>`, [{ label: t('ok'), cls: 'yellow', value: 1 }]);
}

// ---------- thumbnails ----------
function thumb(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  draw(ctx, w, h);
  return c;
}
function isoTile(ctx, cx, cy, w, col, side) {
  const hw = w / 2, hh = w / 4;
  if (side) {
    ctx.fillStyle = side[0];
    ctx.beginPath(); ctx.moveTo(cx - hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx, cy + hh + side[2]); ctx.lineTo(cx - hw, cy + side[2]); ctx.fill();
    ctx.fillStyle = side[1];
    ctx.beginPath(); ctx.moveTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx, cy + hh + side[2]); ctx.lineTo(cx + hw, cy + side[2]); ctx.fill();
  }
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); ctx.fill();
}
function arrowUpDown(ctx, cx, cy, up, col) {
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(43,45,66,0.5)'; ctx.lineWidth = 1;
  const s = up ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 9 * s); ctx.lineTo(cx - 8, cy); ctx.lineTo(cx - 3, cy); ctx.lineTo(cx - 3, cy - 8 * s);
  ctx.lineTo(cx + 3, cy - 8 * s); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx + 8, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
}
const DIRT = ['#c99b5f', '#a87c48'];
function itemThumb(kind, id, w, h) {
  return thumb(w, h, (ctx) => {
    if (kind === 'ride') thumbRide(ctx, id, w, h);
    else if (kind === 'stall') thumbStall(ctx, id, w, h);
    else if (kind === 'scenery') thumbScenery(ctx, SCN[id], w, h);
    else if (kind === 'coaster') coasterThumb(ctx, id, w, h);
    else if (id === 'pathtile') isoTile(ctx, w / 2, h / 2, w * 0.8, '#f1dfb5', ['#d9c08e', '#c2a877', 4]);
    else if (id === 'raise') { isoTile(ctx, w / 2, h / 2 + 4, w * 0.7, '#8cd45f', [...DIRT, 9]); arrowUpDown(ctx, w / 2, h / 2 - 6, true, '#ffd23f'); }
    else if (id === 'lower') { isoTile(ctx, w / 2, h / 2 + 6, w * 0.7, '#7cc653', [...DIRT, 4]); arrowUpDown(ctx, w / 2, h / 2 - 4, false, '#ffd23f'); }
    else if (id === 'water') isoTile(ctx, w / 2, h / 2, w * 0.8, '#4fb8ee', [...DIRT, 5]);
    else if (id === 'fill') { isoTile(ctx, w / 2, h / 2, w * 0.8, '#4fb8ee', [...DIRT, 5]); arrowUpDown(ctx, w / 2, h / 2 - 2, false, '#fff'); }
  });
}

// ---------- tools and tray ----------
const TOOLS = [
  ['inspect', 't_inspect'], ['path', 't_path'], ['ride', 't_rides'], ['coaster', 't_coasters'],
  ['stall', 't_stalls'], ['scenery', 't_scenery'], ['terrain', 't_terrain'], ['demolish', 't_demolish'],
];
function buildTools() {
  els.tools.innerHTML = '';
  for (const [id, key] of TOOLS) {
    const b = document.createElement('button');
    b.dataset.tool = id; b.title = t(key);
    if (id === 'inspect') b.innerHTML = icon('hand');
    else if (id === 'demolish') b.innerHTML = icon('bulldozer');
    else {
      const map = { path: ['x', 'pathtile'], ride: ['ride', 'carousel'], coaster: ['coaster', 'steel'], stall: ['stall', 'burger'], scenery: ['scenery', 'oak'], terrain: ['x', 'raise'] };
      b.appendChild(itemThumb(map[id][0], map[id][1], 34, 30));
    }
    const s = document.createElement('span'); s.textContent = t(key); b.appendChild(s);
    els.tools.appendChild(b);
  }
  markTool();
}
function markTool() {
  for (const b of els.tools.children) b.classList.toggle('on', b.dataset.tool === ui.tool);
  els.canvas.classList.toggle('build', ui.tool !== 'inspect');
}
function trayItems() {
  switch (ui.tool) {
    case 'path': return [{ id: 'pathtile', kind: 'x', cost: 10, free: true }];
    case 'ride': return RIDE_ORDER.map((id) => ({ id, kind: 'ride', cost: RIDES[id].cost }));
    case 'stall': return STALL_ORDER.map((id) => ({ id, kind: 'stall', cost: STALLS[id].cost }));
    case 'coaster': return COASTER_ORDER.map((id) => ({ id, kind: 'coaster', cost: COASTERS[id].station }));
    case 'scenery': return SCENERY.filter(Boolean).map((s) => ({ id: s.id, kind: 'scenery', cost: s.cost }));
    case 'terrain': return [['raise', 20], ['lower', 20], ['water', 30], ['fill', 30]].map(([id, cost]) => ({ id, kind: 'x', cost, free: true }));
    default: return [];
  }
}
let traySig = '';
function buildTray(force) {
  const items = trayItems();
  const sig = ui.tool + '|' + lang + '|' + items.map((i) => (i.free || S.unlocked[i.id] ? 1 : 0)).join('');
  els.tray.hidden = !items.length || !!ui.editing;
  if (sig !== traySig || force) {
    traySig = sig;
    els.tray.innerHTML = '';
    for (const it of items) {
      const locked = !it.free && !S.unlocked[it.id];
      const b = document.createElement('button');
      b.className = 'card' + (locked ? ' locked' : '');
      b.dataset.item = it.id; b.dataset.cost = it.cost;
      b.appendChild(itemThumb(it.kind, it.id, 64, 50));
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = t('n_' + it.id);
      const pr = document.createElement('div'); pr.className = 'pr';
      if (locked) pr.innerHTML = icon('lock') + esc(t('locked')); else pr.textContent = money(it.cost);
      b.append(nm, pr);
      els.tray.appendChild(b);
    }
    els.tray.scrollLeft = 0;
  }
  for (const b of els.tray.children) {
    b.classList.toggle('on', b.dataset.item === ui.item);
    b.classList.toggle('poor', !b.classList.contains('locked') && !canAfford(+b.dataset.cost));
  }
}
export function selectTool(tool) {
  if (ui.editing) return;
  ui.tool = ui.tool === tool && tool !== 'inspect' ? 'inspect' : tool;
  ui.item = null; ui.ghost = null; ui.pending = null; ui.rot = 0;
  const items = trayItems().filter((i) => i.free || S.unlocked[i.id]);
  if (items.length && (ui.tool === 'path' || ui.tool === 'terrain' || ui.tool === 'scenery')) ui.item = items[0].id;
  if (ui.tool !== 'inspect') closePanel();
  markTool(); buildTray(); showConfirm();
}
function selectItem(id) {
  const it = trayItems().find((i) => i.id === id);
  if (!it) return;
  if (!it.free && !S.unlocked[id]) { toast(t('e_locked'), 'bad'); sfx('error'); return; }
  ui.item = ui.item === id && ui.tool !== 'path' && ui.tool !== 'terrain' ? null : id;
  ui.ghost = null; ui.pending = null; ui.rot = 0;
  buildTray(); showConfirm(); sfx('click');
  if (ui.tool === 'coaster' && ui.item) toast(t('b_station'));
}

// ---------- ghosts: a preview of what the tool would do ----------
function boxFor(tile) {
  const d = RIDES[ui.item], w = ui.rot % 2 ? d.h : d.w, h = ui.rot % 2 ? d.w : d.h;
  return { x: tile.x - ((w - 1) >> 1), y: tile.y - ((h - 1) >> 1), w, h };
}
function stationFor(tile) {
  return { x: tile.x - DX[ui.rot], y: tile.y - DY[ui.rot], d: ui.rot };
}
function ghostAt(tile) {
  if (!tile || ui.editing) return null;
  const { x, y } = tile;
  switch (ui.tool) {
    case 'path': return { kind: 'tiles', tiles: [[x, y]], ok: canPath(x, y).ok };
    case 'ride': {
      if (!ui.item) return null;
      const b = boxFor(tile), type = ui.item, rot = ui.rot;
      const o = { type, w: b.w, h: b.h, z: 0, anim: 0.5, spin: 0, riders: [], st: 'idle' };
      return { kind: 'box', ...b, ok: canPlaceBox(b.x, b.y, b.w, b.h, RIDES[type].cost).ok, draw: (ctx) => drawRide(ctx, o, 0), rot };
    }
    case 'stall': {
      if (!ui.item) return null;
      const type = ui.item;
      return { kind: 'box', x, y, w: 1, h: 1, ok: canPlaceBox(x, y, 1, 1, STALLS[type].cost).ok, draw: (ctx) => drawStall(ctx, { type, x: 0 }, 0) };
    }
    case 'coaster': {
      if (!ui.item) return null;
      const s = stationFor(tile);
      return { kind: 'station', ...s, ok: canStartCoaster(ui.item, s.x, s.y, s.d).ok };
    }
    case 'scenery': return ui.item ? { kind: 'tiles', tiles: [[x, y]], ok: canScenery(SCN[ui.item], x, y).ok } : null;
    case 'terrain': {
      const r = ui.item === 'raise' ? canTerrain(x, y, 1) : ui.item === 'lower' ? canTerrain(x, y, -1) : canWater(x, y, ui.item === 'water');
      return { kind: 'tiles', tiles: [[x, y]], ok: r.ok };
    }
    case 'demolish': {
      const w = whatAt(x, y);
      if (!w) return { kind: 'tiles', tiles: [[x, y]], ok: true };
      if (w.kind === 'obj') { const o = S.objs[w.id]; return { kind: 'box', x: o.x, y: o.y, w: o.w, h: o.h, ok: false }; }
      return { kind: 'tiles', tiles: [[x, y]], ok: false };
    }
    default: return null;
  }
}

// ---------- applying a tool to a tile ----------
function applyTool(tile, dragging) {
  const { x, y } = tile;
  let r;
  switch (ui.tool) {
    case 'path':
      r = placePath(x, y);
      if (r.ok) sfx('path'); else if (!dragging && r.why !== 'e_same') fail(r);
      break;
    case 'scenery':
      if (!ui.item) return;
      r = placeScenery(SCN[ui.item], x, y);
      if (r.ok) sfx('path'); else if (!dragging && r.why !== 'e_same') fail(r);
      break;
    case 'terrain':
      r = ui.item === 'raise' ? terrain(x, y, 1) : ui.item === 'lower' ? terrain(x, y, -1) : setWater(x, y, ui.item === 'water');
      if (r.ok) sfx('path'); else if (!dragging && r.why !== 'e_same') fail(r);
      break;
    case 'ride': {
      if (!ui.item) return;
      const b = boxFor(tile);
      r = placeRide(ui.item, b.x, b.y, ui.rot);
      if (r.ok) { sfx('place'); flagAccess(r.obj); } else fail(r);
      break;
    }
    case 'stall':
      if (!ui.item) return;
      r = placeStall(ui.item, x, y);
      if (r.ok) { sfx('place'); flagAccess(r.obj); } else fail(r);
      break;
    case 'coaster': {
      if (!ui.item) return;
      const s = stationFor(tile);
      r = startCoaster(ui.item, s.x, s.y, s.d);
      if (r.ok) { sfx('place'); r.obj.capacity = coasterCap(r.obj); enterEditor(r.obj.id); } else fail(r);
      break;
    }
    case 'demolish': demolishAt(x, y, dragging); break;
  }
  buildTray();
}
function flagAccess(o) {
  o.noAccess = !accessTiles(o).length;
  if (o.noAccess) toast(t('no_access'), 'bad');
}
async function demolishAt(x, y, dragging) {
  const w = whatAt(x, y);
  if (!w) return;
  if (w.kind === 'scenery') { removeScenery(x, y); sfx('remove'); return; }
  if (w.kind === 'path') { const r = removePath(x, y); if (r.ok) sfx('remove'); else if (!dragging) fail(r); return; }
  if (dragging) return;
  askDemolish(w.id);
}
async function askDemolish(id) {
  const o = S.objs[id];
  if (!o) return;
  const back = Math.round(objValue(o) * 0.5);
  const yes = await dialog(`<p>${esc(t('demolish_q', objName(o), money(back)))}</p>`,
    [{ label: t('no'), value: 0 }, { label: t('demolish'), cls: 'red', value: 1 }]);
  if (!yes || !S.objs[id]) return;
  if (ui.editing === id) exitEditor(true);
  removeObj(id);
  if (ui.sel && ui.sel.kind === 'obj' && ui.sel.id === id) closePanel();
  sfx('remove');
}

// ---------- touch placement: position first, then confirm ----------
let shownAt = 0; // when a bar or panel last popped up; taps right after that are ignored (they belong to the map)
function showConfirm() {
  const need = !!ui.pending;
  if (need && els.confirm.hidden) shownAt = performance.now();
  els.confirm.hidden = !need;
  if (!need) return;
  const canRot = ui.tool === 'coaster' || (ui.tool === 'ride' && RIDES[ui.item].w !== RIDES[ui.item].h);
  els.confirm.innerHTML = `<button class="btn" data-c="cancel">${icon('close')}</button>` +
    (canRot ? `<button class="btn" data-c="rot">${icon('rotate')}${esc(t('b_rotate'))}</button>` : '') +
    `<button class="btn go" data-c="ok">${icon('check')}${esc(t('b_place'))}</button>`;
}
function onConfirm(e) {
  const b = e.target.closest('button[data-c]');
  if (!b || !ui.pending || performance.now() - shownAt < 350) return;
  const c = b.dataset.c;
  if (c === 'cancel') { ui.pending = null; ui.ghost = null; sfx('click'); }
  else if (c === 'rot') { rotate(); }
  else { const tile = ui.pending; ui.pending = null; ui.ghost = null; applyTool(tile, false); }
  showConfirm();
}
export function rotate() {
  if (ui.tool === 'coaster') ui.rot = (ui.rot + 1) % 4;
  else if (ui.tool === 'ride') ui.rot = (ui.rot + 1) % 2;
  else return;
  sfx('click');
  if (ui.pending) ui.ghost = ghostAt(ui.pending);
  else if (lastHover) ui.ghost = ghostAt(lastHover);
}

// ---------- the coaster builder ----------
const SLOPES = [[-2, 'b_steepdown', 'slope_dd'], [-1, 'b_down', 'slope_d'], [0, 'b_flat', 'slope_f'], [1, 'b_up', 'slope_u'], [2, 'b_steepup', 'slope_uu']];
export function enterEditor(id) {
  const c = S.objs[id];
  if (!c) return;
  ui.editing = id; ui.tool = 'inspect'; ui.item = null; ui.ghost = null; ui.pending = null;
  ui.slope = 0; ui.chain = false; ui.bank = false;
  c.open = false;
  closePanel(); markTool(); showConfirm();
  els.tools.hidden = true; els.tray.hidden = true; els.builder.hidden = false;
  buildBuilder();
  focusEnd(c);
}
export function exitEditor(silent) {
  const c = S.objs[ui.editing];
  ui.editing = 0; ui.follow = 0;
  els.tools.hidden = false; els.builder.hidden = true; els.testhud.hidden = true;
  if (c && !silent) {
    if (c.st === 'test') { c.st = 'idle'; c.runT = 0; }
    if (c.closed && c.sim.ok) {
      c.open = true; S.pv++;
      c.noAccess = !accessTiles(c).length;
      toast(c.noAccess ? t('no_access') : objName(c) + ': ' + t('open'), c.noAccess ? 'bad' : 'good');
      openPanel('obj', c.id);
    } else toast(t(c.closed ? 'stuck' : 'unfinished'), 'bad');
  }
  markTool(); buildTray(true);
}
function buildBuilder() {
  const c = S.objs[ui.editing];
  if (!c) return;
  const T = COASTERS[c.ctype];
  const btn = (act, label, ic, cls = '', dis = false) =>
    `<button data-b="${act}" class="${cls}" title="${esc(t(label))}" ${dis ? 'disabled' : ''}>${icon(ic)}<span>${esc(t(label))}</span></button>`;
  els.builder.innerHTML = `
    <div class="b-head"><b>${esc(objName(c))}</b><span data-k="info"></span></div>
    <div class="b-status" data-k="status"></div>
    <div class="b-rows">
      <div class="grp" data-g="slope">${SLOPES.map(([v, l, ic]) => btn('slope' + v, l, ic, '', Math.abs(v) === 2 && !T.steep)).join('')}</div>
      <div class="grp">${btn('l', 'b_left', 'turn_l', 'big')}${btn('s', 'b_straight', 'straight', 'big')}${btn('r', 'b_right', 'turn_r', 'big')}</div>
      <div class="grp">${btn('chain', 'b_chain', 'chain')}${T.bank ? btn('bank', 'b_bank', 'bank') : ''}${T.loop ? btn('loop', 'b_loop', 'loop') : ''}${S.unlocked.booster && c.ctype !== 'mini' ? btn('boost', 'b_boost', 'boost') : ''}${btn('brake', 'b_brake', 'brake')}</div>
      <div class="grp wide">${btn('undo', 'b_undo', 'undo', 'act')}${btn('auto', 'b_auto', 'wand', 'act')}${btn('test', 'b_test', 'play', 'act')}${btn('done', 'b_done', 'check', 'act done')}</div>
    </div>`;
  refreshBuilder();
}
function ratingLine(c) {
  return `${t('excitement')} ${num(c.E, 1)} · ${t('intensity')} ${num(c.I, 1)} · ${t('nausea')} ${num(c.Q, 1)}`;
}
function refreshBuilder() {
  const c = S.objs[ui.editing];
  if (!c || els.builder.hidden) return;
  const q = (k) => els.builder.querySelector(`[data-k="${k}"]`);
  const e = endState(c), sim = c.sim;
  const parts = [t('b_pieces', c.pieces.length), money(c.cost)];
  if (!c.closed) {
    parts.push(t('b_height', num(Math.max(0, (e.h - c.pieces[0].h0) * 2))));
    if (sim.ok) parts.push(t('b_endspeed', num(sim.endV * 3.6)));
  }
  q('info').textContent = parts.join(' · ');
  const st = q('status');
  if (!sim.ok) { st.textContent = t('stuck'); st.className = 'b-status bad'; }
  else if (c.closed) { st.textContent = t('b_complete') + ' ' + ratingLine(c) + (c.I > 9 ? ' — ' + t('too_intense') : ''); st.className = 'b-status ' + (c.I > 9 ? 'bad' : 'good'); }
  else { st.textContent = ''; st.className = 'b-status'; }
  for (const b of els.builder.querySelectorAll('button[data-b]')) {
    const a = b.dataset.b;
    if (a.startsWith('slope')) b.classList.toggle('on', +a.slice(5) === ui.slope);
    else if (a === 'chain') b.classList.toggle('on', ui.chain);
    else if (a === 'bank') b.classList.toggle('on', ui.bank);
    if (['l', 's', 'r', 'loop', 'boost', 'brake', 'auto'].includes(a)) b.disabled = c.closed;
    if (a === 'test') b.disabled = !(c.closed && sim.ok) || c.st !== 'idle';
    if (a === 'undo') b.disabled = c.pieces.length <= 3 || c.st === 'test';
  }
}
function focusEnd(c) {
  const e = endState(c);
  const wx = isoX(e.x + 0.5, e.y + 0.5), wy = isoY(e.x + 0.5, e.y + 0.5, e.h);
  const bh = els.bottom.offsetHeight, th = els.top.offsetHeight;
  // keep the end of the track inside the free part of the screen, above the builder
  const cy = (th + (view.h - bh)) / 2;
  const sx = (wx - cam.x) * cam.zoom + view.w / 2, sy = (wy - cam.y) * cam.zoom + view.h / 2;
  const mx = Math.min(140, view.w * 0.25), my = Math.min(90, (view.h - bh - th) * 0.3);
  if (sx < mx || sx > view.w - mx || sy < th + my || sy > view.h - bh - my) {
    ui.camTarget = [wx, wy - (cy - view.h / 2) / cam.zoom];
  }
}
function onBuilder(e) {
  const b = e.target.closest('button[data-b]');
  if (!b || b.disabled) return;
  const c = S.objs[ui.editing];
  if (!c) return;
  const a = b.dataset.b;
  let r = null;
  if (a.startsWith('slope')) { ui.slope = +a.slice(5); sfx('click'); }
  else if (a === 'chain') { ui.chain = !ui.chain; sfx('click'); }
  else if (a === 'bank') { ui.bank = !ui.bank; sfx('click'); }
  else if (a === 'l' || a === 'r' || a === 's') {
    let slope = ui.slope;
    if (a !== 's' && Math.abs(slope) > 1) slope = Math.sign(slope);
    r = addPiece(c, { t: a, slope, chain: ui.chain, bank: ui.bank });
  } else if (a === 'loop' || a === 'boost' || a === 'brake') r = addPiece(c, { t: a });
  else if (a === 'undo') r = undoPiece(c);
  else if (a === 'auto') r = autoFinish(c);
  else if (a === 'test') { if (startTest(c)) { ui.follow = c.id; els.testhud.hidden = false; sfx('whoosh'); } }
  else if (a === 'done') { sfx('click'); exitEditor(); return; }
  if (r) {
    if (r.ok) { sfx(a === 'undo' ? 'remove' : 'track'); focusEnd(c); }
    else fail(r);
  }
  refreshBuilder();
}

// ---------- panels ----------
let panel = null; // {type, id, sig}
export function openPanel(type, id) {
  if (ui.editing && type !== 'settings') return;
  panel = { type, id, sig: '' };
  ui.sel = type === 'obj' || type === 'guest' ? { kind: type, id } : null;
  if (els.panel.hidden) shownAt = performance.now();
  els.panel.hidden = false;
  els.hud.classList.add('has-panel');
  els.panel.scrollTop = 0;
  refreshPanel();
}
export function closePanel() {
  panel = null; ui.sel = null;
  if (els.panel) { els.panel.hidden = true; els.hud.classList.remove('has-panel'); }
}
const head = (title) => `<div class="p-head"><h2>${esc(title)}</h2><button class="x" data-act="close" aria-label="${esc(t('close'))}">${icon('close')}</button></div>`;
const meter = (k, label) => `<div class="meter"><span>${esc(label)}</span><div class="bar"><i data-w="${k}"></i></div><em data-k="${k}"></em></div>`;
const word = (v) => t(v < 2.5 ? 'r_low' : v < 5 ? 'r_medium' : v < 7.5 ? 'r_high' : v < 10 ? 'r_vhigh' : 'r_extreme');
const fact = (k, label) => `<div>${esc(label)}<b data-k="${k}"></b></div>`;

function panelHTML() {
  const p = panel;
  if (p.type === 'obj') {
    const o = S.objs[p.id];
    if (!o) return null;
    const isC = o.kind === 'coaster', isS = o.kind === 'stall';
    const usable = !isC || (o.closed && o.sim.ok);
    let h = head(objName(o)) + '<div class="p-body">';
    if (isC && !o.closed) h += `<div class="warn">${esc(t('unfinished'))}</div>`;
    else if (isC && !o.sim.ok) h += `<div class="warn">${esc(t('stuck'))}</div>`;
    h += `<div class="warn" data-show="noaccess">${esc(t('no_access'))}</div>`;
    if (usable) h += `<div class="row"><span>${esc(t('open'))}</span><button class="switch" data-act="toggle" data-k="open"></button></div>`;
    if (!(isS && o.type === 'toilet')) {
      h += `<div class="row"><span>${esc(t('price'))}</span><div class="stepper"><button data-act="price-" aria-label="-">−</button><b data-k="price"></b><button data-act="price+" aria-label="+">+</button></div></div>`;
      if (!isS && usable) h += `<div class="hint" data-k="worth"></div>`;
    }
    if (!isS && usable) {
      h += meter('E', t('excitement')) + meter('I', t('intensity')) + meter('Q', t('nausea'));
      if (isC && o.I > 9) h += `<div class="warn">${esc(t('too_intense'))}</div>`;
    }
    if (isC && usable) {
      h += `<div class="facts">${fact('len', t('length'))}${fact('spd', t('top_speed'))}${fact('drp', t('biggest_drop'))}${fact('tim', t('ride_time'))}${fact('gmax', t('max_g'))}${fact('air', t('airtime'))}</div>`;
    }
    h += `<div class="facts">${isS ? '' : fact('queue', t('queue'))}${fact('cust', t('customers'))}${fact('inc', t('income'))}${isS ? '' : fact('cap', t('capacity'))}</div>`;
    h += '<div class="btns">';
    if (isC) h += `<button class="btn yellow" data-act="edit">${esc(t('edit_track'))}</button>`;
    if (isC && usable) h += `<button class="btn flat" data-act="test">${esc(t('test_ride'))}</button>`;
    h += `<button class="btn flat" data-act="demolish">${esc(t('demolish'))}</button></div></div>`;
    return h;
  }
  if (p.type === 'guest') {
    return head(p.name || '') + `<div class="p-body">${meter('happy', t('g_happy'))}${meter('hunger', t('g_hunger'))}${meter('thirst', t('g_thirst'))}${meter('toilet', t('g_toilet'))}${meter('nausea', t('g_nausea'))}${meter('energy', t('g_energy'))}
      <div class="facts">${fact('cash', t('g_cash'))}${fact('rides', t('g_rides'))}</div><h3>${esc(t('g_thoughts'))}</h3><ul class="list" data-k="thoughts"></ul></div>`;
  }
  if (p.type === 'finance') {
    let h = head(t('finances')) + '<div class="p-body">';
    if (S.sandbox) h += `<div class="note">${esc(t('f_sandbox'))}</div>`;
    h += `<div class="hint" data-k="date" style="margin-top:0"></div>`;
    h += `<div class="facts">${S.sandbox ? '' : fact('cash', t('f_cash'))}${fact('value', t('f_value'))}</div>`;
    h += `<div class="row"><span>${esc(t('f_entry'))}</span><div class="stepper"><button data-act="fee-" aria-label="-">−</button><b data-k="fee"></b><button data-act="fee+" aria-label="+">+</button></div></div><div class="hint" data-k="feehint"></div>`;
    h += `<div class="warn" data-show="turned" data-k="turned"></div>`;
    if (!S.sandbox) {
      h += `<div class="row"><span>${esc(t('f_loan'))}</span><b data-k="loan"></b></div><div class="hint">${esc(t('f_interest'))}</div>
        <div class="btns"><button class="btn flat" data-act="borrow">${esc(t('f_borrow', money(1000)))}</button><button class="btn flat" data-act="repay">${esc(t('f_repay', money(1000)))}</button></div>`;
    }
    h += `<h3>${esc(t('f_marketing'))}</h3><div class="hint" style="margin-top:0">${esc(t('f_campaign_desc'))}</div><div class="btns"><button class="btn blue" data-act="campaign" data-k="campaign"></button></div>`;
    h += `<table class="fin"><thead><tr><th></th><th>${esc(t('f_this'))}</th><th>${esc(t('f_last'))}</th></tr></thead><tbody data-k="table"></tbody></table></div>`;
    return h;
  }
  if (p.type === 'research') {
    let h = head(t('research')) + '<div class="p-body">';
    if (S.research.done >= RESEARCH.length) return h + `<div class="note">${esc(t('r_alldone'))}</div></div>`;
    h += `<h3>${esc(t('r_funding'))}</h3><div class="choice">${RESEARCH_LEVELS.map((v, i) => `<button data-act="rl${i}">${i ? money(v) : esc(t('r_off'))}</button>`).join('')}</div>`;
    h += `<h3>${esc(t('r_current'))}</h3><div class="row"><b data-k="proj"></b><b data-k="pct"></b></div><div class="prog"><i data-w="prog"></i></div>`;
    h += `<h3>${esc(t('r_next'))}</h3><ul class="list" data-k="next"></ul></div>`;
    return h;
  }
  if (p.type === 'goals') {
    let h = head(t('goals')) + '<div class="p-body">';
    h += `<div class="facts">${fact('guests', t('guests'))}${fact('rating', t('rating'))}${fact('peak', t('p_peak'))}${fact('value', t('f_value'))}</div>`;
    if (S.sandbox) h += `<div class="note">${esc(t('goals_sandbox'))}</div>`;
    else if (S.goalsDone) h += `<div class="note">${esc(t('goals_all'))}</div>`;
    else h += `<h3>${esc(t('goal_n', S.goal + 1, GOALS.length))}</h3><div class="row" style="align-items:flex-start"><b style="white-space:normal">${esc(goalText(S.goal))}</b></div><div class="prog goal"><i data-w="goal"></i></div><div class="hint" style="margin-top:0">${esc(GOALS[S.goal].reward ? t('goal_reward', money(GOALS[S.goal].reward)) : '')}</div>`;
    h += `<h3>${esc(t('p_thoughts'))}</h3><ul class="list" data-k="thoughts"></ul>`;
    if (!S.sandbox) {
      h += `<h3>${esc(t('goals'))}</h3><ul class="list">${GOALS.map((g, i) => `<li class="${i < S.goal ? 'done' : i === S.goal ? 'now' : ''}"><span class="ck">${i < S.goal ? icon('check') : ''}</span><span>${esc(goalText(i))}</span></li>`).join('')}</ul>`;
    }
    return h + '</div>';
  }
  if (p.type === 'settings') {
    return head(t('settings')) + `<div class="p-body">
      <div class="row"><span>${esc(t('s_music'))}</span><button class="switch" data-act="music" data-k="music"></button></div>
      <div class="row"><span>${esc(t('s_sfx'))}</span><button class="switch" data-act="sfx" data-k="sfx"></button></div>
      <div class="row"><span>${esc(t('s_lang'))}</span><button class="switch on" data-act="lang">${esc(t('lang_name'))}</button></div>
      <div class="btns"><button class="btn flat" data-act="help">${esc(t('m_help'))}</button><button class="btn flat" data-act="save">${esc(t('s_save'))}</button></div>
      <div class="btns"><button class="btn yellow" data-act="tomenu">${esc(t('s_menu'))}</button></div></div>`;
  }
  return null;
}
export function goalText(i) {
  const g = GOALS[i];
  if (g.id === 'g_open') return t('g_open');
  if (g.id.startsWith('g_guests')) return t('g_guests', num(g.n));
  if (g.id.startsWith('g_coaster')) return t('g_coaster', num(g.n, g.n % 1 ? 1 : 0));
  if (g.id.startsWith('g_rating')) return t('g_ratingx', num(g.n));
  return t('g_value', money(g.n));
}
function thoughtText(th) {
  const o = S.objs[th[1]];
  return t(th[0], th[1] ? (o ? objName(o) : '…') : '');
}
const FIN_ROWS = ['tickets', 'rides', 'stalls', 'rewards', 'build', 'running', 'research', 'marketing', 'interest'];

function panelValues() {
  const p = panel, v = {}, w = {}, show = {};
  if (p.type === 'obj') {
    const o = S.objs[p.id];
    const isC = o.kind === 'coaster', st = o.kind === 'stall' ? null : rideStats(o);
    v.open = t(o.open ? 'open' : 'closed');
    v.price = o.price ? money(o.price) : t('free');
    show.noaccess = !!o.noAccess;
    if (st) {
      v.worth = t('guests_pay', money(Math.round(rideWorth(st.E) * 2) / 2));
      for (const k of ['E', 'I', 'Q']) { v[k] = num(st[k], 1) + ' ' + word(st[k]); w[k] = Math.min(100, st[k] * 10); }
      v.queue = num(o.queue.length); v.cap = num(isC ? coasterCap(o) : RIDES[o.type].cap);
    }
    if (isC && o.sim) {
      const s = o.sim;
      v.len = t('meters', num(s.L)); v.spd = t('kmh', num(s.maxV * 3.6)); v.drp = t('meters', num(s.bigDrop));
      v.tim = t('secs', num(s.T)); v.gmax = t('gforce', num(s.maxGv, 1)); v.air = t('secs', num(s.air, 1));
    }
    v.cust = num(o.customers); v.inc = money(Math.round(o.income));
  } else if (p.type === 'guest') {
    const g = S.gmap && S.gmap.get(p.id);
    if (!g) { v.thoughts = `<li>${esc(t('g_gone'))}</li>`; return { v, w, show, html: { thoughts: 1 } }; }
    for (const k of ['happy', 'hunger', 'thirst', 'toilet', 'nausea', 'energy']) { v[k] = num(g[k]) + '%'; w[k] = g[k]; }
    v.cash = money(Math.max(0, Math.round(g.cash))); v.rides = num(g.rides);
    v.thoughts = g.thoughts.length ? g.thoughts.map((th) => `<li>${esc(thoughtText(th))}</li>`).join('') : `<li>${esc(t('g_nothoughts'))}</li>`;
    return { v, w, show, html: { thoughts: 1 } };
  } else if (p.type === 'finance') {
    const dd = date();
    v.date = t('date', dd.day, t('months')[dd.month], dd.year);
    v.cash = money(Math.round(S.cash)); v.value = money(parkValue()); v.fee = S.fee ? money(S.fee) : t('free');
    v.feehint = t('f_fee_hint', money(Math.round(feeWorth())));
    v.loan = money(S.loan);
    show.turned = S.turnedAway > 2; v.turned = t('turned_away', S.turnedAway);
    v.campaign = S.marketing > 0 ? t('f_campaign_on', S.marketing) : t('f_campaign', money(600));
    let rows = '', a = 0, b = 0;
    const cell = (n) => `<td class="${n < 0 ? 'neg' : n > 0 ? 'pos' : ''}">${n ? money(Math.round(n)) : '–'}</td>`;
    for (const k of FIN_ROWS) {
      const c = S.fin.cur[k] || 0, l = S.fin.last[k] || 0;
      if (!c && !l) continue;
      a += c; b += l;
      rows += `<tr><td>${esc(t('c_' + k))}</td>${cell(c)}${cell(l)}</tr>`;
    }
    rows += `<tr class="sum"><td>${esc(t('f_total'))}</td>${cell(a)}${cell(b)}</tr>`;
    v.table = rows;
    return { v, w, show, html: { table: 1 } };
  } else if (p.type === 'research') {
    const R = S.research;
    if (R.done < RESEARCH.length) {
      const proj = RESEARCH[R.done];
      v.proj = t(proj.id); v.pct = num(Math.min(100, (R.pts / proj.pts) * 100)) + '%'; w.prog = Math.min(100, (R.pts / proj.pts) * 100);
      v.next = RESEARCH.slice(R.done + 1, R.done + 4).map((r) => `<li>${esc(t(r.id))}</li>`).join('') || `<li>–</li>`;
    }
    return { v, w, show, html: { next: 1 }, on: { ['rl' + R.level]: 1 } };
  } else if (p.type === 'goals') {
    v.guests = num(S.guests.length); v.rating = num(Math.round(S.rating)); v.peak = num(S.peakGuests); v.value = money(parkValue());
    if (!S.sandbox && !S.goalsDone) w.goal = Math.max(0, Math.min(100, goalProgress(S.goal) * 100));
    const top = Object.entries(S.thoughts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    v.thoughts = top.length ? top.map(([k, n]) => `<li><span>${esc(t('sum')[k] || t(k, '…'))}</span><span class="cnt">${n}</span></li>`).join('')
      : `<li>${esc(t(S.guests.length ? 'g_nothoughts' : 'p_none'))}</li>`;
    return { v, w, show, html: { thoughts: 1 } };
  } else if (p.type === 'settings') {
    v.music = t(audio.music ? 'on' : 'off'); v.sfx = t(audio.sfx ? 'on' : 'off');
    return { v, w, show, cls: { music: audio.music, sfx: audio.sfx } };
  }
  return { v, w, show, cls: p.type === 'obj' ? { open: S.objs[p.id].open } : {} };
}
function panelSig() {
  const p = panel;
  if (p.type === 'obj') { const o = S.objs[p.id]; return o ? [o.closed, o.sim && o.sim.ok, o.I > 9, lang].join() : 'x'; }
  if (p.type === 'goals') return [S.goal, S.goalsDone, lang].join();
  if (p.type === 'research') return [S.research.done >= RESEARCH.length, lang].join();
  return lang;
}
export function refreshPanel() {
  if (!panel) return;
  if (panel.type === 'obj' && !S.objs[panel.id]) { closePanel(); return; }
  if (panel.type === 'guest') {
    const g = S.gmap && S.gmap.get(panel.id);
    if (g) panel.name = g.name;
  }
  const sig = panelSig();
  if (sig !== panel.sig) {
    const html = panelHTML();
    if (!html) { closePanel(); return; }
    const top = els.panel.scrollTop;
    els.panel.innerHTML = html;
    els.panel.scrollTop = top;
    panel.sig = sig;
  }
  const d = panelValues();
  for (const el of els.panel.querySelectorAll('[data-k]')) {
    const k = el.dataset.k, val = d.v[k];
    if (val === undefined) continue;
    if (d.html && d.html[k]) { if (el._h !== val) { el.innerHTML = val; el._h = val; } }
    else if (el.textContent !== val) el.textContent = val;
    if (d.cls && k in d.cls) el.classList.toggle('on', !!d.cls[k]);
  }
  for (const el of els.panel.querySelectorAll('[data-w]')) {
    const val = d.w[el.dataset.w];
    if (val !== undefined) {
      el.style.width = val + '%';
      const k = el.dataset.w;
      if (k === 'happy' || k === 'energy') el.style.background = val < 30 ? '#ef476f' : val < 60 ? '#ffb703' : '#06d6a0';
      else if (k === 'hunger' || k === 'thirst' || k === 'toilet' || k === 'nausea') el.style.background = val > 75 ? '#ef476f' : val > 50 ? '#ffb703' : '#3b8ed0';
      else if (k === 'I' || k === 'Q') el.style.background = val > 90 ? '#ef476f' : val > 60 ? '#ffb703' : '#3b8ed0';
      else if (k === 'E') el.style.background = '#06d6a0';
    }
  }
  for (const el of els.panel.querySelectorAll('[data-show]')) el.hidden = !d.show[el.dataset.show];
  if (d.on) for (const el of els.panel.querySelectorAll('[data-act^="rl"]')) el.classList.toggle('on', !!d.on[el.dataset.act]);
}
function onPanel(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !panel || performance.now() - shownAt < 350) return;
  const a = b.dataset.act;
  sfx('click');
  if (a === 'close') { closePanel(); return; }
  if (panel.type === 'obj') {
    const o = S.objs[panel.id];
    if (!o) return;
    if (a === 'toggle') { o.open = !o.open; S.pv++; o.noAccess = o.open && !accessTiles(o).length; }
    else if (a === 'price+') { o.price = Math.min(30, o.price + 0.5); o.priceSet = 1; }
    else if (a === 'price-') { o.price = Math.max(0, o.price - 0.5); o.priceSet = 1; }
    else if (a === 'demolish') askDemolish(o.id);
    else if (a === 'edit') enterEditor(o.id);
    else if (a === 'test') {
      if (o.st !== 'idle') { o.open = false; toast(t('closed')); }
      else if (startTest(o)) { ui.follow = o.id; els.testhud.hidden = false; sfx('whoosh'); }
    }
  } else if (panel.type === 'finance') {
    if (a === 'fee+') S.fee = Math.min(80, S.fee + 1);
    else if (a === 'fee-') S.fee = Math.max(0, S.fee - 1);
    else if (a === 'borrow') { if (S.loan < MAX_LOAN) { S.loan += 1000; S.cash += 1000; sfx('cash'); } else sfx('error'); }
    else if (a === 'repay') { if (S.loan > 0 && S.cash >= 1000) { S.loan -= 1000; S.cash -= 1000; } else sfx('error'); }
    else if (a === 'campaign') {
      if (S.marketing > 0) return;
      if (!canAfford(600)) { fail({ why: 'e_money' }); return; }
      spend(600, 'marketing'); S.marketing = 3; sfx('cash');
    }
  } else if (panel.type === 'research') {
    if (a.startsWith('rl')) S.research.level = +a.slice(2);
  } else if (panel.type === 'settings') {
    if (a === 'music' || a === 'sfx' || a === 'lang' || a === 'save' || a === 'tomenu') ui.hooks[a]();
    else if (a === 'help') showHelp();
  }
  refreshPanel();
}

// ---------- HUD ----------
const SPEEDS = [[0, 'pause', 'pause'], [1, 'play', 'speed1'], [2, 'ff', 'speed2'], [4, 'fff', 'speed4']];
export function buildHUD() {
  els.speed.innerHTML = SPEEDS.map(([v, ic, label]) => `<button data-speed="${v}" title="${esc(t(label))}" aria-label="${esc(t(label))}">${icon(ic)}</button>`).join('');
  $('b-goals').innerHTML = icon('flag'); $('b-goals').title = t('goals');
  $('b-research').innerHTML = icon('flask'); $('b-research').title = t('research');
  $('b-menu').innerHTML = icon('gear'); $('b-menu').title = t('menu');
  $('st-cash').innerHTML = icon('coin') + '<b></b>'; $('st-cash').title = t('finances');
  $('st-guests').innerHTML = icon('guest') + '<b></b>'; $('st-guests').title = t('guests');
  $('st-rating').innerHTML = icon('star') + '<b></b>'; $('st-rating').title = t('rating');
  buildTools(); traySig = ''; buildTray(true);
  if (ui.editing) buildBuilder();
  if (panel) { panel.sig = ''; refreshPanel(); }
  lastTut = -1;
  refreshHUD();
}
let lastTut = -1;
export function refreshHUD() {
  const set = (id, txt) => { const b = $(id).querySelector('b'); if (b.textContent !== txt) b.textContent = txt; };
  set('st-cash', S.sandbox ? '∞' : money(Math.floor(S.cash)));
  set('st-guests', num(S.guests.length));
  set('st-rating', num(Math.round(S.rating)));
  const d = date(), ds = t('date', d.day, t('months')[d.month], d.year);
  if (els.date.textContent !== ds) els.date.textContent = ds;
  const ob = $('b-open'), ot = t(S.open ? 'close_park' : 'open_park');
  if (ob.textContent !== ot) ob.textContent = ot;
  ob.classList.toggle('is-open', !!S.open);
  for (const b of els.speed.children) b.classList.toggle('on', +b.dataset.speed === S.speed);
  $('st-cash').style.color = !S.sandbox && S.cash < 0 ? '#d63a5f' : '';
  buildTray();
  refreshPanel();
  refreshBuilder();
  tutorial();
  // keep "not connected" warnings up to date
  if (accessPv !== S.pv) {
    accessPv = S.pv;
    for (const id in S.objs) { const o = S.objs[id]; o.noAccess = (o.kind !== 'coaster' || o.closed) && !accessTiles(o).length; }
  }
}
let accessPv = -1;

function tutorial() {
  if (S.sandbox || S.tut >= 99) { els.tutorial.hidden = true; return; }
  let paths = 0, rides = 0, food = 0, closedCoaster = 0;
  if (S.tut === 1) { for (let i = 0; i < N * N; i++) if (S.path[i]) paths++; if (paths >= 9) S.tut = 2; }
  for (const id in S.objs) {
    const o = S.objs[id];
    if (o.kind === 'ride') rides++;
    else if (o.kind === 'stall' && (STALLS[o.type].need === 'hunger' || STALLS[o.type].need === 'treat')) food++;
    else if (o.kind === 'coaster' && o.closed) closedCoaster++;
  }
  if (S.tut === 2 && rides) S.tut = 3;
  if (S.tut === 3 && food) S.tut = 4;
  if (S.tut === 4 && S.open) S.tut = 5;
  if (S.tut === 5 && closedCoaster && !ui.editing) S.tut = 6;
  els.tutorial.hidden = !!ui.editing;
  if (lastTut === S.tut) return;
  lastTut = S.tut;
  const next = S.tut === 0 || S.tut === 6;
  els.tutorial.innerHTML = `<div>${esc(t('tut_' + S.tut))}${S.tut === 1 && ui.touch ? ' ' + esc(t('tut_touch')) : ''}</div>
    <div class="t-btns">${S.tut < 6 ? `<button class="btn flat" data-tut="skip">${esc(t('tut_skip'))}</button>` : ''}${next ? `<button class="btn yellow" data-tut="next">${esc(t(S.tut === 6 ? 'ok' : 'tut_next'))}</button>` : ''}</div>`;
}

// ---------- game events ----------
export function handleEvents() {
  while (events.length) {
    const e = events.shift();
    if (e.type === 'goal') { toast(t('goal_done') + (e.reward ? ' +' + money(e.reward) : ''), 'good'); sfx('goal'); if (panel && panel.type === 'goals') panel.sig = ''; }
    else if (e.type === 'research') { toast(t('research_done', t(e.id)), 'good'); sfx('unlock'); traySig = ''; if (ui.editing) buildBuilder(); }
    else if (e.type === 'ach') { toast(t('ach', t('a')[e.id]), 'good'); ui.hooks.achievement(e.id); }
    else if (e.type === 'month') ui.hooks.month();
    else if (e.type === 'closed') { if (ui.editing === e.id) { toast(t('b_complete'), 'good'); sfx('goal'); } }
    else if (e.type === 'dispatch') { /* trains leave quietly so a busy park does not get noisy */ }
    else if (e.type === 'testdone') {
      if (ui.follow === e.id) { ui.follow = 0; els.testhud.hidden = true; }
      const c = S.objs[e.id];
      if (c) {
        const s = c.sim;
        dialog(`<h2>${esc(t('test_title'))}</h2><p>${esc(objName(c))}</p><p>${esc(ratingLine(c))}</p>
          <div class="facts"><div>${esc(t('top_speed'))}<b>${esc(t('kmh', num(s.maxV * 3.6)))}</b></div><div>${esc(t('biggest_drop'))}<b>${esc(t('meters', num(s.bigDrop)))}</b></div>
          <div>${esc(t('ride_time'))}<b>${esc(t('secs', num(s.T)))}</b></div><div>${esc(t('max_g'))}<b>${esc(t('gforce', num(s.maxGv, 1)))}</b></div></div>`,
          [{ label: t('ok'), cls: 'yellow', value: 1 }]);
      }
    }
  }
}
/** Live read-out while the camera follows a test train. */
export function updateTestHud() {
  const c = S.objs[ui.follow];
  if (!c || c.st !== 'test' || !ui.followPos) return;
  const k = Math.min(c.sim.segs, ui.followPos[2]);
  const hgt = Math.max(0, (c.sim.Z[k % c.sim.n] - c.pieces[0].h0) * 2);
  els.testhud.innerHTML = `<div><span>${esc(t('speed_now'))}</span>${esc(t('kmh', num(c.sim.v[k] * 3.6)))}</div><div><span>↕</span>${esc(t('meters', num(hgt)))}</div><div><span>G</span>${num(c.sim.gv[k] || 1, 1)}</div>`;
}

// ---------- map input ----------
const pointers = new Map();
let mode = null, lastPaint = -1, lastHover = null, pinch = null;
const paintTool = (touch) => ui.tool === 'path' || ui.tool === 'demolish' || (!touch && (ui.tool === 'scenery' || ui.tool === 'terrain'));
const pendingTool = () => (ui.tool === 'ride' || ui.tool === 'stall' || ui.tool === 'coaster') && ui.item;

export function clampCam() {
  cam.zoom = Math.max(0.45, Math.min(2.6, cam.zoom));
  cam.x = Math.max(-N * 32, Math.min(N * 32, cam.x));
  cam.y = Math.max(-80, Math.min(N * 32 + 60, cam.y));
}
function zoomAt(px, py, factor) {
  const [wx, wy] = toWorld(px, py);
  cam.zoom = Math.max(0.45, Math.min(2.6, cam.zoom * factor));
  cam.x = wx - (px - view.w / 2) / cam.zoom;
  cam.y = wy - (py - view.h / 2) / cam.zoom;
  clampCam();
}
function tap(px, py, touch) {
  if (ui.editing) return;
  const tile = pickTile(px, py);
  if (ui.tool === 'inspect') {
    const th = pickThing(px, py);
    if (!th) { closePanel(); return; }
    sfx('click');
    openPanel(th.kind, th.id);
    return;
  }
  if (!tile) return;
  if (touch && pendingTool()) {
    ui.pending = tile; ui.ghost = ghostAt(tile); showConfirm(); sfx('click');
    return;
  }
  applyTool(tile, false);
  ui.ghost = touch ? null : ghostAt(tile);
}
function onDown(e) {
  unlock();
  ui.touch = e.pointerType === 'touch';
  try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not every pointer can be captured */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
  ui.camTarget = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    mode = 'pinch';
    return;
  }
  if (pointers.size > 2) return;
  if (e.button === 1 || e.button === 2) { mode = 'pan'; return; }
  if (!ui.editing && paintTool(ui.touch) && (ui.item || ui.tool === 'demolish')) {
    mode = 'paint'; lastPaint = -1;
    const tile = pickTile(e.clientX, e.clientY);
    if (ui.touch) {
      // wait for the finger to move or lift: a second finger may still land to pan or zoom instead
      pointers.get(e.pointerId).first = tile;
    } else if (tile) { lastPaint = idx(tile.x, tile.y); applyTool(tile, false); ui.ghost = ghostAt(tile); }
    return;
  }
  mode = 'tap';
}
function onMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') {
      const tile = pickTile(e.clientX, e.clientY);
      lastHover = tile;
      if (!ui.pending) ui.ghost = ghostAt(tile);
    }
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (Math.hypot(p.x - p.sx, p.y - p.sy) > 7) p.moved = true;
  if (mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    cam.x -= (cx - pinch.cx) / cam.zoom; cam.y -= (cy - pinch.cy) / cam.zoom;
    if (pinch.d > 0) zoomAt(cx, cy, d / pinch.d);
    pinch = { d, cx, cy };
    clampCam();
    return;
  }
  if (mode === 'paint') {
    if (ui.touch && !p.moved) return;
    if (p.first) { lastPaint = idx(p.first.x, p.first.y); applyTool(p.first, true); p.first = null; }
    const tile = pickTile(e.clientX, e.clientY);
    if (tile && idx(tile.x, tile.y) !== lastPaint) { lastPaint = idx(tile.x, tile.y); applyTool(tile, true); }
    if (!ui.touch) ui.ghost = ghostAt(tile);
    return;
  }
  if (mode === 'pan' || (mode === 'tap' && p.moved)) {
    mode = 'pan';
    cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom;
    clampCam();
    if (S.tut === 0 && Math.hypot(p.x - p.sx, p.y - p.sy) > 120) S.tut = 1;
  }
}
function onUp(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p) return;
  if (mode === 'tap' && !p.moved && e.type === 'pointerup') tap(e.clientX, e.clientY, e.pointerType === 'touch');
  else if (mode === 'paint' && p.first && e.type === 'pointerup') applyTool(p.first, false);
  if (pointers.size === 0) mode = null;
  else if (mode === 'pinch') mode = 'pan';
}
function onWheel(e) {
  e.preventDefault();
  ui.camTarget = null;
  const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  zoomAt(e.clientX, e.clientY, Math.exp(-Math.max(-200, Math.min(200, dy)) * 0.0016));
}
const keys = new Set();
function onKey(e) {
  if (e.target.tagName === 'INPUT' || els.hud.hidden) return;
  if (e.type === 'keyup') { keys.delete(e.key.toLowerCase()); return; }
  const k = e.key.toLowerCase();
  if (!els.modal.hidden) { if (k === 'escape' || k === 'enter') els.modal.click(); return; }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); e.preventDefault(); return; }
  if (k === 'r') rotate();
  else if (k === 'escape') {
    if (ui.pending) { ui.pending = null; ui.ghost = null; showConfirm(); }
    else if (ui.editing) exitEditor();
    else if (ui.tool !== 'inspect') selectTool('inspect');
    else closePanel();
  } else if (k === ' ') { S.speed = S.speed ? 0 : 1; e.preventDefault(); }
  else if (k === '+' || k === '=') zoomAt(view.w / 2, view.h / 2, 1.2);
  else if (k === '-') zoomAt(view.w / 2, view.h / 2, 1 / 1.2);
  else if ((k === 'backspace' || k === 'z') && ui.editing) { const b = els.builder.querySelector('[data-b="undo"]'); if (b) b.click(); e.preventDefault(); }
}
/** Camera movement from keys, following a test train, and gliding to a target. */
export function moveCamera(dt) {
  const sp = (520 / cam.zoom) * dt;
  let moved = false;
  if (keys.has('arrowleft') || keys.has('a')) { cam.x -= sp; moved = true; }
  if (keys.has('arrowright') || keys.has('d')) { cam.x += sp; moved = true; }
  if (keys.has('arrowup') || keys.has('w')) { cam.y -= sp; moved = true; }
  if (keys.has('arrowdown') || keys.has('s')) { cam.y += sp; moved = true; }
  if (moved) { ui.camTarget = null; if (S.tut === 0) S.tut = 1; }
  const c = ui.follow && S.objs[ui.follow];
  if (c && c.st === 'test' && ui.followPos && !pointers.size) {
    const k = Math.min(1, dt * 4);
    cam.x += (ui.followPos[0] - cam.x) * k; cam.y += (ui.followPos[1] - cam.y) * k;
  } else if (ui.camTarget) {
    const k = Math.min(1, dt * 6);
    cam.x += (ui.camTarget[0] - cam.x) * k; cam.y += (ui.camTarget[1] - cam.y) * k;
    if (Math.hypot(ui.camTarget[0] - cam.x, ui.camTarget[1] - cam.y) < 1) ui.camTarget = null;
  }
  clampCam();
}
export function centerOn(x, y, z) {
  cam.x = isoX(x, y); cam.y = isoY(x, y, z);
  clampCam();
}

// ---------- setup ----------
export function initUI(hooks) {
  ui.hooks = hooks;
  els = {
    canvas: $('c'), hud: $('hud'), top: $('top'), bottom: $('bottom'), tools: $('tools'), tray: $('tray'), panel: $('panel'),
    toasts: $('toasts'), modal: $('modal'), confirm: $('confirm'), builder: $('builder'), tutorial: $('tutorial'),
    speed: $('speed'), date: $('st-date'), testhud: $('testhud'),
  };
  const c = els.canvas;
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);
  c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pointers.size && !ui.pending) { ui.ghost = null; lastHover = null; } });
  c.addEventListener('wheel', onWheel, { passive: false });
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  // a finger tap on the map must never turn into a click on a button that pops up under it
  c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  c.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('pointerdown', unlock, { capture: true });

  els.tools.addEventListener('click', (e) => { const b = e.target.closest('button[data-tool]'); if (b) { sfx('click'); selectTool(b.dataset.tool); } });
  els.tray.addEventListener('click', (e) => { const b = e.target.closest('button[data-item]'); if (b) selectItem(b.dataset.item); });
  els.confirm.addEventListener('click', onConfirm);
  els.builder.addEventListener('click', onBuilder);
  els.panel.addEventListener('click', onPanel);
  els.top.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) {
      sfx('click');
      if (ui.editing && o.dataset.open !== 'settings') return;
      if (panel && panel.type === o.dataset.open) closePanel(); else openPanel(o.dataset.open);
      return;
    }
    const s = e.target.closest('[data-speed]');
    if (s) { S.speed = +s.dataset.speed; sfx('click'); refreshHUD(); return; }
    if (e.target.closest('#b-open')) {
      S.open = !S.open; sfx(S.open ? 'goal' : 'click'); refreshHUD();
    }
  });
  els.tutorial.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tut]');
    if (!b) return;
    sfx('click');
    S.tut = b.dataset.tut === 'skip' || S.tut >= 6 ? 99 : S.tut + 1;
    tutorial();
  });
  // let the layout know how tall the bars are, so panels never hide behind them
  const ro = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--th', els.top.offsetHeight + 'px');
    document.documentElement.style.setProperty('--bh', els.bottom.offsetHeight + 'px');
  });
  ro.observe(els.top); ro.observe(els.bottom);
}
/** Reset the interface for a freshly started or loaded park. */
export function resetUI() {
  ui.tool = 'inspect'; ui.item = null; ui.ghost = null; ui.sel = null; ui.editing = 0; ui.follow = 0; ui.pending = null; ui.camTarget = null;
  panel = null; els.panel.hidden = true; els.hud.classList.remove('has-panel'); els.builder.hidden = true; els.tools.hidden = false; els.confirm.hidden = true;
  els.testhud.hidden = true; els.toasts.innerHTML = ''; els.modal.hidden = true;
  accessPv = -1; lastTut = -1; traySig = '';
  pointers.clear(); mode = null;
  buildHUD();
}
