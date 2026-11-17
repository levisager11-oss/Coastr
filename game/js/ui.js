// Everything the player touches: toolbar, build menus, panels, the coaster builder, and map input.
import {
  N, DX, DY, RIDES, STALLS, SCENERY, SCN, COASTERS, RIDE_ORDER, STALL_ORDER, COASTER_ORDER, SCENERY_ORDER, RESEARCH, RESEARCH_LEVELS,
  MAX_LOAN, TRACK_COLORS, SCENARIOS, DESIGNS, DESIGN_ORDER,
} from './data.js';
import {
  S, idx, inB, events, canPath, placePath, removePath, canPlaceBox, placeRide, placeStall, footprint, canScenery,
  placeScenery, removeScenery, canTerrain, terrain, canWater, setWater, whatAt, removeObj, objValue, accessTiles,
  parkValue, canAfford, spend, earn, snapshot, restore, pathCost,
} from './world.js';
import {
  canStartCoaster, startCoaster, addPiece, undoPiece, autoFinish, endState, previewPiece, posAt, trainDist, alterable, alterPiece, cutAfter,
  canPlaceDesign, placeDesign, designOf, designShape,
} from './coaster.js';
import { rideWorth, rideStats, rideUsable, buzz } from './guests.js';
import { date, feeWorth, goalProgress, startTest, coasterCap, goalsOf, researchNext, darkness, maxTrains, trainsOf, trainCost, renovate, renovateCost } from './sim.js';
import { cam, view, look, pickTile, pickThing, toWorld, isoX, isoY, coasterThumb, objCenter, miniMap, miniMapTile } from './render.js';
import { drawRide, drawStall, thumbRide, thumbStall, thumbScenery, drawScenery } from './sprites.js';
import { t, money, num, lang } from './i18n.js';
import { sfx, unlock, audio } from './audio.js';
import { icon } from './icons.js';
import { burst, floatText, confetti, fxHooks } from './fx.js';

export const ui = {
  tool: 'inspect', item: null, rot: 0, ghost: null, sel: null, editing: 0, follow: 0, followPos: null,
  pending: null, slope: 0, chain: false, bank: false, wide: false, camTarget: null, touch: false, hooks: {},
  cands: null, hot: null, handle: null, area: null, undo: null, pick: null,
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
/** A ready-made design ('dz:name') or one the player saved ('my:3'). */
function designFor(id) {
  if (!id) return null;
  if (id.startsWith('dz:')) return DESIGNS[id.slice(3)] || null;
  if (id.startsWith('my:')) return ui.hooks.designs()[+id.slice(3)] || null;
  return null;
}
// The whole layout of a design as a little line drawing in the coaster's own colour.
function designThumb(ctx, d, w, h) {
  if (!d) return;
  const pal = TRACK_COLORS[d.col | 0], col = pal ? pal[0] : COASTERS[d.ctype].rail;
  const pts = designShape(d).map(([x, y, z]) => [(x - y), (x + y) * 0.5 - z * 0.5]);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sc = Math.min((w - 8) / (x1 - x0 || 1), (h - 8) / (y1 - y0 || 1));
  const X = (x) => w / 2 + (x - (x0 + x1) / 2) * sc, Y = (y) => h / 2 + (y - (y0 + y1) / 2) * sc;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [lw, c] of [[4.2, 'rgba(43,45,66,0.55)'], [2.6, col]]) {
    ctx.strokeStyle = c; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (const [x, y] of pts) ctx.lineTo(X(x), Y(y));
    ctx.stroke();
  }
  // the station
  ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); ctx.lineTo(X(3), Y(1.5)); ctx.stroke();
}
function itemThumb(kind, id, w, h) {
  return thumb(w, h, (ctx) => {
    if (kind === 'ride') thumbRide(ctx, id, w, h);
    else if (kind === 'stall') thumbStall(ctx, id, w, h);
    else if (kind === 'scenery') thumbScenery(ctx, SCN[id], w, h);
    else if (kind === 'coaster') coasterThumb(ctx, id, w, h);
    else if (kind === 'design') designThumb(ctx, designFor(id), w, h);
    else if (id === 'pathtile') isoTile(ctx, w / 2, h / 2, w * 0.8, '#f1dfb5', ['#d9c08e', '#c2a877', 4]);
    else if (id === 'queuetile') { isoTile(ctx, w / 2, h / 2, w * 0.8, '#bfd8f0', ['#8fb0d2', '#7a9bbd', 4]); ctx.strokeStyle = '#3b8ed0'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.4); ctx.lineTo(w * 0.7, h * 0.6); ctx.stroke(); ctx.setLineDash([]); }
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
    case 'path': return [{ id: 'pathtile', kind: 'x', cost: 10, free: true }, { id: 'queuetile', kind: 'x', cost: 12, free: true }];
    case 'ride': return RIDE_ORDER.map((id) => ({ id, kind: 'ride', cost: RIDES[id].cost }));
    case 'stall': return STALL_ORDER.map((id) => ({ id, kind: 'stall', cost: STALLS[id].cost }));
    case 'coaster': return [
      ...COASTER_ORDER.map((id) => ({ id, kind: 'coaster', cost: COASTERS[id].station })),
      ...DESIGN_ORDER.map((k) => ({ id: 'dz:' + k, kind: 'design', cost: designCost(DESIGNS[k]), name: t('dz_' + k), lock: DESIGNS[k].ctype })),
      ...ui.hooks.designs().map((d, k) => ({ id: 'my:' + k, kind: 'design', cost: designCost(d), name: d.name, lock: d.ctype, mine: k })),
    ];
    case 'scenery': return SCENERY_ORDER.map((id) => ({ id, kind: 'scenery', cost: SCENERY[SCN[id]].cost }));
    case 'terrain': return [['raise', 20], ['lower', 20], ['water', 30], ['fill', 30]].map(([id, cost]) => ({ id, kind: 'x', cost, free: true }));
    default: return [];
  }
}
const dzCost = new Map();
/** Roughly what a design costs to build on flat ground (the real price shows when you place it). */
function designCost(d) {
  let c = dzCost.get(d.words);
  if (c === undefined) {
    const T = COASTERS[d.ctype];
    c = T.station;
    for (const w of d.words.split(' ')) c += T.piece * (w === 'loop' ? 5 : w === 'cork' ? 6 : w[0] === 'w' ? 2.4 : w === 'boost' ? 3 : w === 'brake' ? 1.5 : 1) * (w.includes('c') && w !== 'cork' ? 1.3 : 1) + 12;
    c = Math.round(c / 50) * 50;
    dzCost.set(d.words, c);
  }
  return c;
}
let traySig = '';
function buildTray(force) {
  const items = trayItems();
  const open = (i) => i.free || !!S.unlocked[i.lock || i.id];
  const sig = ui.tool + '|' + lang + '|' + items.map((i) => (open(i) ? 1 : 0) + (i.name || '')).join('');
  els.tray.hidden = !items.length || !!ui.editing;
  if (sig !== traySig || force) {
    traySig = sig;
    els.tray.innerHTML = '';
    for (const it of items) {
      const locked = !open(it);
      const b = document.createElement('button');
      b.className = 'card' + (locked ? ' locked' : '') + (it.kind === 'design' ? ' design' : '');
      b.dataset.item = it.id; b.dataset.cost = it.cost;
      b.appendChild(itemThumb(it.kind, it.id, 64, 50));
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.name || t('n_' + it.id);
      const pr = document.createElement('div'); pr.className = 'pr';
      if (locked) pr.innerHTML = icon('lock') + esc(t('locked')); else pr.textContent = money(it.cost);
      b.append(nm, pr);
      if (it.mine !== undefined) { const x = document.createElement('i'); x.className = 'del'; x.dataset.del = it.mine; x.innerHTML = icon('close'); b.appendChild(x); }
      els.tray.appendChild(b);
    }
    els.tray.scrollLeft = 0;
  }
  for (const b of els.tray.children) {
    b.classList.toggle('on', b.dataset.item === ui.item);
    b.classList.toggle('poor', !b.classList.contains('locked') && !canAfford(+b.dataset.cost));
  }
  updateInfo();
}
// One line about the chosen thing, or how to use the chosen tool.
function updateInfo() {
  let txt = '';
  const it = ui.item;
  if (!ui.editing) {
    if (ui.tool === 'ride' && it) { const d = RIDES[it]; txt = t('i_stats', num(d.E, 1), num(d.I, 1), num(d.Q, 1), d.cap); }
    else if (ui.tool === 'coaster' && it) { const dz = designFor(it); txt = dz ? t('i_design', num(dz.e || 0, 1), dz.w || '?', dz.h || '?') : t('d_' + it); }
    else if (ui.tool === 'stall' && it) txt = t('d_' + it);
    else if (ui.tool === 'scenery' && it) txt = t('i_beauty', SCENERY[SCN[it]].beauty) + ' ' + t(ui.touch ? 'i_line_touch' : 'i_line_mouse');
    else if (ui.tool === 'path') txt = (it === 'queuetile' ? t('i_queue') + ' ' : '') + t(ui.touch ? 'i_line_touch' : 'i_line_mouse');
    else if (ui.tool === 'terrain') txt = t(ui.touch ? 'i_area_touch' : 'i_area_mouse');
    else if (ui.tool === 'demolish') txt = t('i_demolish') + ' ' + t(ui.touch ? 'i_area_touch' : 'i_area_mouse');
  }
  if (els.info.textContent !== txt) els.info.textContent = txt;
  els.info.hidden = !txt;
}
export function selectTool(tool) {
  if (ui.editing) return;
  ui.tool = ui.tool === tool && tool !== 'inspect' ? 'inspect' : tool;
  ui.item = null; ui.ghost = null; ui.pending = null; ui.rot = 0; ui.handle = null; ui.area = null;
  const items = trayItems().filter((i) => i.free || S.unlocked[i.lock || i.id]);
  if (items.length && (ui.tool === 'path' || ui.tool === 'terrain' || ui.tool === 'scenery')) ui.item = items[0].id;
  if (ui.tool !== 'inspect') closePanel();
  markTool(); buildTray(); showConfirm();
}
function selectItem(id) {
  const it = trayItems().find((i) => i.id === id);
  if (!it) return;
  if (!it.free && !S.unlocked[it.lock || id]) { toast(t('e_locked'), 'bad'); sfx('error'); return; }
  ui.item = ui.item === id && ui.tool !== 'path' && ui.tool !== 'terrain' ? null : id;
  ui.ghost = null; ui.pending = null; ui.rot = 0; ui.handle = null; ui.area = null;
  buildTray(); showConfirm(); sfx('click');
  if (ui.tool === 'coaster' && ui.item) toast(t(designFor(ui.item) ? 'b_design' : 'b_station'));
}

// ---------- ghosts: a preview of what the tool would do ----------
function boxFor(tile) {
  const d = RIDES[ui.item], w = ui.rot % 2 ? d.h : d.w, h = ui.rot % 2 ? d.w : d.h;
  return { x: tile.x - ((w - 1) >> 1), y: tile.y - ((h - 1) >> 1), w, h };
}
function stationFor(tile) {
  return { x: tile.x - DX[ui.rot], y: tile.y - DY[ui.rot], d: ui.rot };
}
// ---------- tools that work on one tile, a line of tiles or a whole area ----------
const AREA_TOOLS = { path: 'line', scenery: 'line', terrain: 'rect', demolish: 'rect' };
const areaTool = () => AREA_TOOLS[ui.tool] && (ui.item || ui.tool === 'demolish');
/** What the current tool would do on one tile: {ok, cost, why}. */
function canAt(x, y) {
  let r, cost = 0;
  if (ui.tool === 'path') { const kind = ui.item === 'queuetile' ? 2 : 1; r = canPath(x, y, kind); cost = pathCost(x, y, kind); }
  else if (ui.tool === 'scenery') { r = canScenery(SCN[ui.item], x, y); cost = SCENERY[SCN[ui.item]].cost; }
  else if (ui.tool === 'terrain') {
    if (ui.item === 'raise' || ui.item === 'lower') { r = canTerrain(x, y, ui.item === 'raise' ? 1 : -1); cost = 20; }
    else { r = canWater(x, y, ui.item === 'water'); cost = 30; }
  } else return { ok: !whatAt(x, y), cost: 0 };
  if (r.ok || r.why === 'e_money') return { ok: true, cost };
  if (r.why === 'e_same') return { ok: true, cost: 0 };
  return { ok: false, cost: 0, why: r.why };
}
function applyOne(x, y) {
  if (ui.tool === 'path') return placePath(x, y, ui.item === 'queuetile' ? 2 : 1);
  if (ui.tool === 'scenery') return placeScenery(SCN[ui.item], x, y);
  if (ui.tool === 'terrain') return ui.item === 'raise' ? terrain(x, y, 1) : ui.item === 'lower' ? terrain(x, y, -1) : setWater(x, y, ui.item === 'water');
  const w = whatAt(x, y);
  if (w && w.kind === 'scenery') return removeScenery(x, y);
  if (w && w.kind === 'path') return removePath(x, y);
  return { ok: false, why: 'e_none' };
}
/** Tiles from a to b: an L-shaped line for paths and scenery, a filled box for land and removing. */
function areaTiles(a, b, firstY) {
  const out = [];
  if (AREA_TOOLS[ui.tool] === 'line') {
    const sx = Math.sign(b.x - a.x) || 1, sy = Math.sign(b.y - a.y) || 1;
    if (firstY) {
      for (let y = a.y; y !== b.y + sy; y += sy) out.push([a.x, y]);
      for (let x = a.x + sx; a.x !== b.x && x !== b.x + sx; x += sx) out.push([x, b.y]);
    } else {
      for (let x = a.x; x !== b.x + sx; x += sx) out.push([x, a.y]);
      for (let y = a.y + sy; a.y !== b.y && y !== b.y + sy; y += sy) out.push([b.x, y]);
    }
  } else {
    let x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    // keep an area to a sensible size, measured from where the drag began
    if (x1 - x0 > 19) { if (a.x === x0) x1 = x0 + 19; else x0 = x1 - 19; }
    if (y1 - y0 > 19) { if (a.y === y0) y1 = y0 + 19; else y0 = y1 - 19; }
    out.push([a.x, a.y]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x !== a.x || y !== a.y) out.push([x, y]);
  }
  return out;
}
function areaGhost(tiles) {
  let total = 0;
  const out = [];
  for (const [x, y] of tiles) {
    if (!inB(x, y)) continue;
    const r = canAt(x, y);
    total += r.cost;
    out.push([x, y, r.ok]);
  }
  return { kind: 'tiles', tiles: out, ok: true, label: total && out.length > 1 ? money(total) : null, poor: !canAfford(total) };
}
function applyArea(tiles, skipFirst) {
  const list = tiles.filter(([x, y]) => inB(x, y));
  if (!list.length) return;
  if (ui.tool === 'demolish' && list.length === 1) {
    const w = whatAt(list[0][0], list[0][1]);
    if (w && (w.kind === 'obj' || w.kind === 'coaster')) { askDemolish(w.id); return; }
  }
  const snap = snapshot(list.map(([x, y]) => idx(x, y)));
  let n = 0, bad = null, last = null;
  for (let k = skipFirst ? 1 : 0; k < list.length; k++) {
    const r = applyOne(list[k][0], list[k][1]);
    if (r.ok) { n++; last = list[k]; }
    else if (r.why === 'e_money') { bad = r; break; }
    else if (!bad && r.why && r.why !== 'e_same' && r.why !== 'e_none') bad = r;
  }
  if (n) {
    sfx(ui.tool === 'demolish' ? 'remove' : 'path');
    setUndo(snap);
    const i = idx(last[0], last[1]);
    burst(isoX(last[0] + 0.5, last[1] + 0.5), isoY(last[0] + 0.5, last[1] + 0.5, S.h[i]), S.water[i] ? 'splash' : 'dust', 6);
  }
  if (bad && (!n || bad.why === 'e_money')) fail(bad);
  buildTray();
}

// ---------- undo for the last thing built ----------
function setUndo(snap) {
  snap.delta = S.cash - snap.cash;
  ui.undo = { snap, at: performance.now() };
  els.undo.hidden = false;
}
function clearUndo() { ui.undo = null; if (els.undo) els.undo.hidden = true; }
function doUndo() {
  if (!ui.undo) return;
  restore(ui.undo.snap);
  clearUndo();
  ui.handle = null; ui.ghost = null;
  if (ui.sel && ui.sel.kind === 'obj' && !S.objs[ui.sel.id]) closePanel();
  sfx('remove'); toast(t('undone'));
  buildTray();
}

/** Is there a path beside any of these tiles? Guests can only reach things that stand next to one. */
function pathBeside(tiles) {
  for (const [x, y] of tiles) for (let d = 0; d < 4; d++) {
    const ax = x + DX[d], ay = y + DY[d];
    if (inB(ax, ay) && S.path[idx(ax, ay)]) return true;
  }
  return false;
}
const boxList = (b) => { const out = []; for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) out.push([b.x + i, b.y + j]); return out; };
function ghostAt(tile) {
  if (!tile || ui.editing) return null;
  const { x, y } = tile;
  switch (ui.tool) {
    case 'path': case 'terrain': return areaGhost([[x, y]]);
    case 'scenery': return ui.item ? areaGhost([[x, y]]) : null;
    case 'ride': {
      if (!ui.item) return null;
      const b = boxFor(tile), type = ui.item, rot = ui.rot;
      const o = { type, w: b.w, h: b.h, z: 0, anim: 0.5, spin: 0, riders: [], st: 'idle' };
      return { kind: 'box', ...b, ok: canPlaceBox(b.x, b.y, b.w, b.h, RIDES[type].cost).ok, draw: (ctx) => drawRide(ctx, o, 0), rot, note: pathBeside(boxList(b)) ? null : t('g_nopath') };
    }
    case 'stall': {
      if (!ui.item) return null;
      const type = ui.item;
      return { kind: 'box', x, y, w: 1, h: 1, ok: canPlaceBox(x, y, 1, 1, STALLS[type].cost).ok, draw: (ctx) => drawStall(ctx, { type, x: 0 }, 0), note: pathBeside([[x, y]]) ? null : t('g_nopath') };
    }
    case 'coaster': {
      if (!ui.item) return null;
      const s = stationFor(tile), dz = designFor(ui.item);
      if (dz) {
        // a whole ready-made coaster: show every tile it would cover
        const chk = canPlaceDesign(dz, s.x, s.y, s.d);
        return { kind: 'tiles', tiles: chk.tiles, ok: true, label: money(chk.cost), poor: chk.why === 'e_money', arrow: s, note: chk.ok && !pathBeside(chk.tiles.slice(0, 3)) ? t('g_nopath') : null };
      }
      return { kind: 'station', ...s, ok: canStartCoaster(ui.item, s.x, s.y, s.d).ok, note: pathBeside([0, 1, 2].map((k) => [s.x + DX[s.d] * k, s.y + DY[s.d] * k])) ? null : t('g_nopath') };
    }
    case 'demolish': {
      const w = whatAt(x, y);
      if (w && w.kind === 'obj') { const o = S.objs[w.id]; return { kind: 'box', x: o.x, y: o.y, w: o.w, h: o.h, ok: false }; }
      return { kind: 'tiles', tiles: [[x, y, !w]], ok: true };
    }
    default: return null;
  }
}

// ---------- applying a tool to a tile ----------
function applyTool(tile) {
  const { x, y } = tile;
  let r;
  if (areaTool()) { applyArea([[x, y]]); return; }
  switch (ui.tool) {
    case 'ride': {
      if (!ui.item) return;
      const b = boxFor(tile), snap = snapshot(boxTiles(b));
      r = placeRide(ui.item, b.x, b.y, ui.rot);
      if (r.ok) { sfx('place'); flagAccess(r.obj); setUndo(snap); } else fail(r);
      break;
    }
    case 'stall': {
      if (!ui.item) return;
      const snap = snapshot([idx(x, y)].filter(() => inB(x, y)));
      r = placeStall(ui.item, x, y);
      if (r.ok) { sfx('place'); flagAccess(r.obj); setUndo(snap); } else fail(r);
      break;
    }
    case 'coaster': {
      if (!ui.item) return;
      const s = stationFor(tile), dz = designFor(ui.item);
      if (dz) {
        r = placeDesign(dz, s.x, s.y, s.d);
        if (r.ok) {
          const c = r.obj;
          c.capacity = coasterCap(c); c.open = c.sim.ok; S.pv++;
          sfx('goal'); confetti(view.w, view.h, 60); flagAccess(c);
          ui.item = null; ui.tool = 'inspect'; markTool(); openPanel('obj', c.id);
        } else fail(r);
        break;
      }
      r = startCoaster(ui.item, s.x, s.y, s.d);
      if (r.ok) { sfx('place'); r.obj.capacity = coasterCap(r.obj); enterEditor(r.obj.id); } else fail(r);
      break;
    }
  }
  buildTray();
}
function boxTiles(b) {
  const out = [];
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (inB(b.x + i, b.y + j)) out.push(idx(b.x + i, b.y + j));
  return out;
}
function flagAccess(o) {
  o.noAccess = !accessTiles(o).length;
  if (o.noAccess) toast(t('no_access'), 'bad');
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
  else { const tile = ui.pending; ui.pending = null; ui.ghost = null; applyTool(tile); }
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
const SLOPES = [[-2, 'b_steepdown', 'slope_dd', '1'], [-1, 'b_down', 'slope_d', '2'], [0, 'b_flat', 'slope_f', '3'], [1, 'b_up', 'slope_u', '4'], [2, 'b_steepup', 'slope_uu', '5']];
export function enterEditor(id) {
  const c = S.objs[id];
  if (!c) return;
  ui.editing = id; ui.tool = 'inspect'; ui.item = null; ui.ghost = null; ui.pending = null; ui.handle = null; ui.area = null;
  ui.slope = 0; ui.chain = false; ui.bank = false; ui.wide = false; ui.follow = 0; ui.pick = null;
  clearUndo();
  c.open = false;
  closePanel(); markTool(); showConfirm();
  els.tools.hidden = true; els.tray.hidden = true; els.info.hidden = true; els.builder.hidden = false;
  buildBuilder();
  focusEnd(c);
}
export function exitEditor(silent) {
  const c = S.objs[ui.editing];
  ui.editing = 0; ui.follow = 0; ui.cands = null; ui.hot = null; ui.pick = null;
  els.tools.hidden = false; els.builder.hidden = true; els.testhud.hidden = true;
  if (c && !silent) {
    if (c.st === 'test') { c.st = 'idle'; c.runT = 0; }
    if (c.pieces.length <= 3) {
      // nothing but a station: take it away again and give the money back
      earn(c.cost, 'build'); removeObj(c.id, false);
      toast(t('b_cancelled'));
    } else if (c.closed && c.sim.ok) {
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
  const btn = (act, label, ic, cls = '', key = '') =>
    `<button data-b="${act}" class="${cls}" title="${esc(t(label))}${key ? ' (' + key + ')' : ''}">${icon(ic)}<span>${esc(t(label))}</span></button>`;
  const slopes = SLOPES.filter(([v]) => Math.abs(v) < 2 || T.steep).map(([v, l, ic, k]) => btn('slope' + v, l, ic, '', k)).join('');
  els.builder.classList.toggle('few', !T.steep);
  els.builder.innerHTML = `
    <div class="b-head"><b>${esc(objName(c))}</b><span data-k="info"></span></div>
    <div class="b-status" data-k="status"></div>
    <div class="b-pick" hidden><b data-k="pickname"></b>${btn('p-chain', 'b_chain', 'chain')}${btn('p-bank', 'b_bank', 'bank')}${btn('p-s', 'b_plain', 'slope_f')}${btn('p-brake', 'b_brake', 'brake')}${btn('p-boost', 'b_boost', 'boost')}${btn('p-cut', 'b_cut', 'cut')}${btn('p-x', 'close', 'close')}</div>
    <div class="b-rows">
      <div class="grp g-slope">${slopes}</div>
      <div class="grp g-dir">${btn('l', 'b_left', 'turn_l', 'big', '←')}${btn('s', 'b_straight', 'straight', 'big', '↑')}${btn('r', 'b_right', 'turn_r', 'big', '→')}</div>
      <div class="grp g-opt">${T.launch ? '' : btn('chain', 'b_chain', 'chain', '', 'C')}${btn('wide', 'b_wide', 'wide', '', 'V')}${T.bank ? btn('bank', 'b_bank', 'bank', '', 'B') : ''}</div>
      <div class="grp g-spec">${T.loop ? btn('loop', 'b_loop', 'loop', '', 'L') : ''}${T.cork ? btn('cork', 'b_cork', 'cork', '', 'K') : ''}${S.unlocked.booster && c.ctype !== 'mini' ? btn('boost', 'b_boost', 'boost') : ''}${btn('brake', 'b_brake', 'brake')}</div>
      <div class="grp g-act">${btn('undo', 'b_undo', 'undo', 'act', '↓')}${btn('auto', 'b_auto', 'wand', 'act', 'F')}${btn('test', 'b_test', 'play', 'act', 'T')}${btn('done', 'b_done', 'check', 'act done', 'Enter')}</div>
    </div>`;
  refreshBuilder();
}
const PIECE_NAME = { s: 'b_straight', l: 'b_left', r: 'b_right', wl: 'b_left', wr: 'b_right', loop: 'b_loop', cork: 'b_cork', boost: 'b_boost', brake: 'b_brake' };
function ratingLine(c) {
  return `${t('excitement')} ${num(c.E, 1)} · ${t('intensity')} ${num(c.I, 1)} · ${t('nausea')} ${num(c.Q, 1)}`;
}
// The ways on from the end of the track: three pieces to choose from, and steeper / less steep.
function updateCands() {
  const c = S.objs[ui.editing];
  if (!c || c.closed || c.st === 'test') { ui.cands = null; return; }
  const e = endState(c), last = c.pieces[c.pieces.length - 1], T = COASTERS[c.ctype];
  const px = e.x + 0.5 - DX[e.d] * 0.5, py = e.y + 0.5 - DY[e.d] * 0.5;
  const bx = isoX(px, py), by = isoY(px, py, e.h + 0.3), out = [];
  for (const key of ['l', 's', 'r']) {
    const spec = { t: key === 's' ? 's' : (ui.wide ? 'w' : '') + key, slope: ui.slope, chain: ui.chain, bank: ui.bank };
    const pv = previewPiece(c, spec);
    const dir = key === 's' ? e.d : (e.d + (key === 'l' ? 3 : 1)) % 4;
    let ax = DX[dir] - DY[dir], ay = (DX[dir] + DY[dir]) * 0.5;
    const l = Math.hypot(ax, ay);
    ax /= l; ay /= l;
    out.push({ key, ok: pv.ok, why: pv.why, stall: pv.stall, ax, ay, bx, by, gc: { ctype: c.ctype, col: c.col, closed: false, pieces: [last, pv.p] } });
  }
  const max = T.steep ? 2 : 1;
  // the steeper / flatter buttons sit above and below, so they need some height to fit
  const roomy = view.h - els.top.offsetHeight - els.bottom.offsetHeight > 215;
  if (roomy && ui.slope < max) out.push({ key: 'up', kind: 'up', ax: 0, ay: -1, bx, by, on: ui.slope > 0, two: ui.slope >= 1, ok: true });
  if (roomy && ui.slope > -max) out.push({ key: 'down', kind: 'down', ax: 0, ay: 1, bx, by, on: ui.slope < 0, two: ui.slope <= -1, ok: true });
  ui.cands = out;
  layoutHandles();
}
// the buttons keep the same distance on screen from the end of the track at any zoom
function layoutHandles() {
  if (!ui.cands) return;
  // closer in when there is very little room between the bars (the small box on Toki)
  const room = view.h - els.top.offsetHeight - els.bottom.offsetHeight;
  const d = (room < 150 ? 50 : ui.touch ? 66 : 58) / cam.zoom;
  for (const q of ui.cands) { const k = q.kind ? 0.92 : 1; q.hx = q.bx + q.ax * d * k; q.hy = q.by + q.ay * d * k; }
}
function handleAt(px, py) {
  if (!ui.cands) return null;
  const [wx, wy] = toWorld(px, py);
  let best = null, bd = (ui.touch ? 30 : 23) / cam.zoom;
  for (const q of ui.cands) { const d = Math.hypot(q.hx - wx, q.hy - wy); if (d < bd) { bd = d; best = q; } }
  return best;
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
  let txt = '', cls = 'b-status';
  if (!sim.ok) { txt = t('stuck'); cls += ' bad'; }
  else if (c.closed) { txt = t('b_complete') + ' ' + ratingLine(c) + (c.I > 9 ? ' — ' + t('too_intense') : ''); cls += c.I > 9 ? ' bad' : ' good'; }
  else if (c.pieces.length <= 3) txt = t(COASTERS[c.ctype].launch ? 'b_hint_launch' : 'b_hint');
  if (c.closed && sim.ok && c.I <= 9 && ui.pick === null) txt += ' ' + t('b_pickhint');
  if (st.textContent !== txt) st.textContent = txt;
  if (st.className !== cls) st.className = cls;
  // the piece that was tapped on the map, and what can be done to it
  if (ui.pick !== null && !c.pieces[ui.pick]) ui.pick = null;
  const al = ui.pick !== null ? alterable(c, ui.pick) : null, pk = els.builder.querySelector('.b-pick');
  if (!al) ui.pick = null;
  pk.hidden = !al;
  if (al) {
    const pp = c.pieces[ui.pick], nm = t('b_piece', ui.pick - 2) + ': ' + t(PIECE_NAME[pp.t] || 'b_straight');
    if (q('pickname').textContent !== nm) q('pickname').textContent = nm;
    const show = { 'p-chain': al.chain, 'p-bank': al.bank, 'p-s': al.kind && pp.t !== 's', 'p-brake': al.kind && pp.t !== 'brake', 'p-boost': al.kind && al.boost && pp.t !== 'boost', 'p-cut': ui.pick < c.pieces.length - 1 };
    for (const b of pk.querySelectorAll('button[data-b]')) {
      const a = b.dataset.b;
      if (a in show) b.hidden = !show[a];
      if (a === 'p-chain') b.classList.toggle('on', !!pp.chain);
      if (a === 'p-bank') b.classList.toggle('on', !!pp.bank);
    }
  }
  for (const b of els.builder.querySelectorAll('.b-rows button[data-b]')) {
    const a = b.dataset.b;
    if (a.startsWith('slope')) b.classList.toggle('on', +a.slice(5) === ui.slope);
    else if (a === 'chain') b.classList.toggle('on', ui.chain);
    else if (a === 'bank') b.classList.toggle('on', ui.bank);
    else if (a === 'wide') b.classList.toggle('on', ui.wide);
    if (['l', 's', 'r', 'loop', 'cork', 'boost', 'brake', 'auto'].includes(a)) b.disabled = c.closed;
    if (a === 'test') b.disabled = !(c.closed && sim.ok) || c.st !== 'idle';
    if (a === 'undo') b.disabled = c.pieces.length <= 3 || c.st === 'test';
  }
  updateCands();
}
function focusEnd(c) {
  const e = endState(c);
  const wx = isoX(e.x + 0.5, e.y + 0.5), wy = isoY(e.x + 0.5, e.y + 0.5, e.h);
  const bh = els.bottom.offsetHeight, th = els.top.offsetHeight;
  // keep the end of the track, and the buttons round it, inside the free part of the screen
  const cy = (th + (view.h - bh)) / 2;
  const sx = (wx - cam.x) * cam.zoom + view.w / 2, sy = (wy - cam.y) * cam.zoom + view.h / 2;
  const free = view.h - bh - th;
  const mx = Math.min(150, view.w * 0.3), my = Math.max(Math.min(110, free * 0.36), Math.min(free / 2 - 3, 46));
  if (sx < mx || sx > view.w - mx || sy < th + my || sy > view.h - bh - my) {
    ui.camTarget = [wx, wy - (cy - view.h / 2) / cam.zoom];
  }
}
/** One action of the builder, from a button, a key or a button on the map. */
function builderAct(a) {
  const c = S.objs[ui.editing];
  if (!c) return;
  const T = COASTERS[c.ctype], max = T.steep ? 2 : 1;
  let r = null;
  if (a.startsWith('slope')) { ui.slope = Math.max(-max, Math.min(max, +a.slice(5))); sfx('click'); }
  else if (a === 'up' || a === 'down') { ui.slope = Math.max(-max, Math.min(max, ui.slope + (a === 'up' ? 1 : -1))); sfx('click'); }
  else if (a === 'chain') { if (!T.launch) { ui.chain = !ui.chain; sfx('click'); } }
  else if (a === 'bank') { if (T.bank) { ui.bank = !ui.bank; sfx('click'); } }
  else if (a === 'wide') { ui.wide = !ui.wide; sfx('click'); }
  else if (a === 'l' || a === 'r' || a === 's') {
    if (c.closed) return;
    r = addPiece(c, { t: a === 's' ? 's' : (ui.wide ? 'w' : '') + a, slope: ui.slope, chain: ui.chain, bank: ui.bank });
  } else if (a === 'loop' || a === 'cork' || a === 'boost' || a === 'brake') {
    if (c.closed || (a === 'loop' && !T.loop) || (a === 'cork' && !T.cork)) return;
    r = addPiece(c, { t: a });
  } else if (a === 'undo') { if (c.pieces.length > 3 && c.st !== 'test') r = undoPiece(c); }
  else if (a === 'auto') { if (!c.closed) r = autoFinish(c); }
  else if (a === 'test') { if (startTest(c)) { ui.follow = c.id; els.testhud.hidden = false; sfx('whoosh'); } }
  else if (a === 'p-x') { ui.pick = null; sfx('click'); }
  else if (a.startsWith('p-') && ui.pick !== null) {
    if (a === 'p-cut') { r = cutAfter(c, ui.pick); if (r.ok) ui.pick = null; }
    else r = alterPiece(c, ui.pick, a.slice(2));
    if (r.ok) { sfx(a === 'p-cut' ? 'remove' : 'track'); r = null; if (a === 'p-cut') focusEnd(c); }
  }
  else if (a === 'done') { sfx('click'); exitEditor(); return; }
  if (r) {
    if (r.ok) {
      sfx(a === 'undo' ? 'remove' : 'track'); focusEnd(c); ui.pick = null;
      if (a !== 'undo') { const e = endState(c); burst(isoX(e.x + 0.5 - DX[e.d] * 0.5, e.y + 0.5 - DY[e.d] * 0.5), isoY(e.x + 0.5 - DX[e.d] * 0.5, e.y + 0.5 - DY[e.d] * 0.5, e.h + 0.3), 'spark', 5); }
    } else fail(r);
  }
  refreshBuilder();
}
function onBuilder(e) {
  const b = e.target.closest('button[data-b]');
  if (!b || b.disabled) return;
  builderAct(b.dataset.b);
}

// ---------- panels ----------
let panel = null; // {type, id, sig}
export function openPanel(type, id) {
  if (ui.editing && type !== 'settings') return;
  if (ui.follow && ui.follow !== id) stopFollow();
  panel = { type, id, sig: '' };
  ui.sel = type === 'obj' || type === 'guest' ? { kind: type, id } : null;
  if (els.panel.hidden) shownAt = performance.now();
  els.panel.hidden = false;
  els.hud.classList.add('has-panel');
  els.panel.scrollTop = 0;
  refreshPanel();
}
function stopFollow() { ui.follow = 0; if (els.testhud) els.testhud.hidden = true; }
export function closePanel() {
  if (ui.follow && !ui.editing) stopFollow();
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
    if (!isS && usable) h += `<div class="note" data-show="age" data-k="age"></div><div class="btns" data-show="reno"><button class="btn blue" data-act="renovate" data-k="reno"></button></div>`;
    if (!isS && usable) {
      h += meter('E', t('excitement')) + meter('I', t('intensity')) + meter('Q', t('nausea'));
      if (isC && o.I > 9) h += `<div class="warn">${esc(t('too_intense'))}</div>`;
    }
    if (isC && usable) {
      h += `<div class="row"><span>${esc(t('trains'))}</span><div class="stepper"><button data-act="train-" aria-label="-">−</button><b data-k="trains"></b><button data-act="train+" aria-label="+">+</button></div></div><div class="hint" data-k="trainhint"></div>`;
      h += `<div class="facts">${fact('len', t('length'))}${fact('spd', t('top_speed'))}${fact('drp', t('biggest_drop'))}${fact('tim', t('ride_time'))}${fact('gmax', t('max_g'))}${fact('air', t('airtime'))}</div>`;
    }
    h += `<div class="facts">${isS ? '' : fact('queue', t('queue'))}${fact('cust', t('customers'))}${fact('inc', t('income'))}${isS ? '' : fact('cap', t('capacity'))}</div>`;
    if (isC) {
      const T = COASTERS[o.ctype];
      h += `<h3>${esc(t('colour'))}</h3><div class="swatches">${TRACK_COLORS.map((pal, i) =>
        `<button data-act="col${i}" aria-label="${i}" style="background:${pal ? pal[0] : T.rail};border-color:${pal ? pal[2] : T.car}"></button>`).join('')}</div>`;
    }
    h += '<div class="btns">';
    if (isC) h += `<button class="btn yellow" data-act="edit">${esc(t('edit_track'))}</button>`;
    if (isC && usable) h += `<button class="btn flat" data-act="watch" data-k="watch"></button><button class="btn flat" data-act="test">${esc(t('test_ride'))}</button><button class="btn flat" data-act="savedz">${esc(t('design_save'))}</button>`;
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
    if (researchNext() < 0) return h + `<div class="note">${esc(t('r_alldone'))}</div></div>`;
    h += `<h3>${esc(t('r_funding'))}</h3><div class="choice">${RESEARCH_LEVELS.map((v, i) => `<button data-act="rl${i}">${i ? money(v) : esc(t('r_off'))}</button>`).join('')}</div>`;
    h += `<h3>${esc(t('r_current'))}</h3><div class="row"><b data-k="proj"></b><b data-k="pct"></b></div><div class="prog"><i data-w="prog"></i></div>`;
    h += `<h3>${esc(t('r_next'))}</h3><ul class="list" data-k="next"></ul></div>`;
    return h;
  }
  if (p.type === 'goals') {
    const goals = goalsOf(), SC = SCENARIOS[S.sc] || SCENARIOS.meadows;
    let h = head(t('sc_' + S.sc)) + '<div class="p-body">';
    if (!S.sandbox) h += `<div class="stars big">${starsHTML(S.stars || 0)}</div>`;
    h += `<div class="btns"><button class="btn flat" data-act="park">${esc(t('park_map'))}</button></div>`;
    h += `<div class="note" data-show="event" data-k="event"></div>`;
    h += `<div class="facts">${fact('guests', t('guests'))}${fact('rating', t('rating'))}${fact('peak', t('p_peak'))}${fact('value', t('f_value'))}${fact('awards', t('awards'))}${fact('year', t('year_guests'))}</div>`;
    if (S.sandbox) h += `<div class="note">${esc(t('goals_sandbox'))}</div>`;
    else if (S.goalsDone) h += `<div class="note">${esc(t('goals_all'))}</div>`;
    else h += `<h3>${esc(t('goal_n', S.goal + 1, goals.length))}</h3><div class="row" style="align-items:flex-start"><b style="white-space:normal">${esc(goalText(S.goal))}</b></div><div class="prog goal"><i data-w="goal"></i></div><div class="hint" style="margin-top:0">${esc(goals[S.goal].reward ? t('goal_reward', money(goals[S.goal].reward)) : '')}</div>`;
    h += `<h3>${esc(t('p_thoughts'))}</h3><ul class="list" data-k="thoughts"></ul>`;
    if (!S.sandbox) {
      h += `<h3>${esc(t('goals'))}</h3><ul class="list">${goals.map((g, i) => `<li class="${i < S.goal ? 'done' : i === S.goal ? 'now' : ''}"><span class="ck">${i < S.goal ? icon('check') : ''}</span><span>${esc(goalText(i))}</span>${SC.stars.includes(i + 1) ? `<span class="cnt st${i < S.goal ? ' got' : ''}">${icon('star')}</span>` : ''}</li>`).join('')}</ul>`;
    }
    return h + '</div>';
  }
  if (p.type === 'park') {
    const row = (o) => `<li data-act="go" data-id="${o.id}"><span class="dot" data-k="d${o.id}"></span><span class="nm2">${esc(objName(o))}</span><span class="cnt" data-k="q${o.id}"></span><span class="cnt inc" data-k="i${o.id}"></span></li>`;
    const all = Object.values(S.objs), rides = all.filter((o) => o.kind !== 'stall'), stalls = all.filter((o) => o.kind === 'stall');
    return head(t('park_map')) + `<div class="p-body"><canvas class="minimap" data-act="map" width="552" height="300"></canvas>
      <div class="btns"><button class="btn flat" data-act="goals">${esc(t('goals'))}</button><button class="btn flat" data-act="entrance">${esc(t('to_entrance'))}</button></div>
      <h3>${esc(t('t_rides'))}</h3><ul class="list rides">${rides.map(row).join('') || `<li>${esc(t('list_none'))}</li>`}</ul>
      ${stalls.length ? `<h3>${esc(t('t_stalls'))}</h3><ul class="list rides">${stalls.map(row).join('')}</ul>` : ''}</div>`;
  }
  if (p.type === 'settings') {
    return head(t('settings')) + `<div class="p-body">
      <div class="row"><span>${esc(t('s_music'))}</span><button class="switch" data-act="music" data-k="music"></button></div>
      <div class="row"><span>${esc(t('s_sfx'))}</span><button class="switch" data-act="sfx" data-k="sfx"></button></div>
      <div class="row"><span>${esc(t('s_night'))}</span><button class="switch" data-act="night" data-k="night"></button></div>
      <div class="row"><span>${esc(t('s_lang'))}</span><button class="switch on" data-act="lang">${esc(t('lang_name'))}</button></div>
      <div class="btns"><button class="btn flat" data-act="help">${esc(t('m_help'))}</button><button class="btn flat" data-act="save">${esc(t('s_save'))}</button></div>
      <div class="btns"><button class="btn yellow" data-act="tomenu">${esc(t('s_menu'))}</button></div></div>`;
  }
  return null;
}
export function starsHTML(n) {
  let h = '';
  for (let i = 0; i < 3; i++) h += `<span class="${i < n ? 'got' : ''}">${icon('star')}</span>`;
  return h;
}
export function goalText(i) {
  const g = goalsOf()[i];
  switch (g.k) {
    case 'open': return t('g_open');
    case 'guests': return t('g_guests', num(g.n));
    case 'coaster': return t('g_coaster', num(g.n, g.n % 1 ? 1 : 0));
    case 'rating': return t('g_ratingx', num(g.n));
    case 'coasters': return t('g_coasters', num(g.n));
    case 'rides': return t('g_rides', num(g.n));
    case 'inv': return t('g_inv', num(g.n));
    case 'high': return t('g_high', num(g.n));
    case 'speed': return t('g_speed', num(g.n));
    default: return t('g_value', money(g.n));
  }
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
      const bz = buzz(o), pc = Math.round(Math.abs(bz - 1) * 100);
      show.age = pc >= 2; show.reno = bz < 0.98;
      v.age = bz > 1 ? t('age_new', pc) : t('age_old', pc); v.reno = t('renovate', money(renovateCost(o)));
      for (const k of ['E', 'I', 'Q']) { v[k] = num(st[k], 1) + ' ' + word(st[k]); w[k] = Math.min(100, st[k] * 10); }
      v.queue = num(o.queue.length); v.cap = num(isC ? coasterCap(o) * trainsOf(o) : RIDES[o.type].cap);
      if (isC) { v.trains = trainsOf(o) + ' / ' + maxTrains(o); v.trainhint = t(maxTrains(o) > 1 ? 'train_hint' : 'train_short', money(trainCost(o))); }
    }
    if (isC && o.sim) {
      const s = o.sim;
      v.len = t('meters', num(s.L)); v.spd = t('kmh', num(s.maxV * 3.6)); v.drp = t('meters', num(s.bigDrop));
      v.tim = t('secs', num(s.T)); v.gmax = t('gforce', num(s.maxGv, 1)); v.air = t('secs', num(s.air, 1));
    }
    v.cust = num(o.customers); v.inc = money(Math.round(o.income));
    v.watch = t(ui.follow === o.id ? 'watch_stop' : 'watch');
    return { v, w, show, cls: { open: o.open }, col: o.kind === 'coaster' ? 'col' + (o.col | 0) : null };
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
    const R = S.research, ri = researchNext();
    if (ri >= 0) {
      const proj = RESEARCH[ri];
      v.proj = t(proj.id); v.pct = num(Math.min(100, (R.pts / proj.pts) * 100)) + '%'; w.prog = Math.min(100, (R.pts / proj.pts) * 100);
      v.next = RESEARCH.filter((r, k) => k > ri && r.unlocks.some((u) => !S.unlocked[u])).slice(0, 4).map((r) => `<li>${esc(t(r.id))}</li>`).join('') || `<li>–</li>`;
    }
    return { v, w, show, html: { next: 1 }, on: { ['rl' + R.level]: 1 } };
  } else if (p.type === 'goals') {
    v.guests = num(S.guests.length); v.rating = num(Math.round(S.rating)); v.peak = num(S.peakGuests); v.value = money(parkValue());
    v.awards = num(Object.values(S.awards || {}).reduce((x, y) => x + y, 0)); v.year = num(S.yr ? S.yr.guests : 0);
    show.event = !!S.event; if (S.event) v.event = t('ev_now', t('evn_' + S.event.id), Math.max(1, Math.ceil(S.event.left / 2)));
    if (!S.sandbox && !S.goalsDone) w.goal = Math.max(0, Math.min(100, goalProgress(S.goal) * 100));
    const top = Object.entries(S.thoughts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    v.thoughts = top.length ? top.map(([k, n]) => `<li><span>${esc(t('sum')[k] || t(k, '…'))}</span><span class="cnt">${n}</span></li>`).join('')
      : `<li>${esc(t(S.guests.length ? 'g_nothoughts' : 'p_none'))}</li>`;
    return { v, w, show, html: { thoughts: 1 } };
  } else if (p.type === 'park') {
    for (const id in S.objs) {
      const o = S.objs[id], isS = o.kind === 'stall';
      const bad = o.noAccess || (o.kind === 'coaster' && (!o.closed || !o.sim.ok));
      v['d' + id] = bad ? '!' : o.open ? '' : '×';
      v['q' + id] = isS ? num(o.customers) : icon('guest') + num(o.queue.length);
      v['i' + id] = money(Math.round(o.income));
    }
    const cv = els.panel.querySelector('canvas.minimap');
    if (cv) { const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); miniMap(g, 276, 150); }
    const html = {};
    for (const id in S.objs) if (S.objs[id].kind !== 'stall') html['q' + id] = 1;
    return { v, w, show, html, dots: 1 };
  } else if (p.type === 'settings') {
    v.music = t(audio.music ? 'on' : 'off'); v.sfx = t(audio.sfx ? 'on' : 'off'); v.night = t(look.night ? 'on' : 'off');
    return { v, w, show, cls: { music: audio.music, sfx: audio.sfx, night: look.night } };
  }
  return { v, w, show, cls: p.type === 'obj' ? { open: S.objs[p.id].open } : {} };
}
function panelSig() {
  const p = panel;
  if (p.type === 'obj') { const o = S.objs[p.id]; return o ? [o.closed, o.sim && o.sim.ok, o.I > 9, lang].join() : 'x'; }
  if (p.type === 'goals') return [S.goal, S.goalsDone, S.stars, lang].join();
  if (p.type === 'research') return [researchNext() < 0, lang].join();
  if (p.type === 'park') return Object.keys(S.objs).join() + lang;
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
  if (d.col) for (const el of els.panel.querySelectorAll('[data-act^="col"]')) el.classList.toggle('on', el.dataset.act === d.col);
  if (d.dots) for (const el of els.panel.querySelectorAll('.dot')) el.className = 'dot' + (el.textContent === '!' ? ' bad' : el.textContent ? ' off' : '');
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
    } else if (a === 'watch') {
      if (ui.follow === o.id) stopFollow(); else { ui.follow = o.id; els.testhud.hidden = false; }
    } else if (a === 'savedz') {
      const xs = o.pieces.map((q) => q.x), ys = o.pieces.map((q) => q.y), f = o.pieces[0].d % 2;
      const sw = Math.max(...xs) - Math.min(...xs) + 1, sh = Math.max(...ys) - Math.min(...ys) + 1;
      ui.hooks.saveDesign({ ...designOf(o), name: objName(o), e: o.E, w: f ? sh : sw, h: f ? sw : sh });
      traySig = ''; toast(t('design_saved'), 'good');
    } else if (a === 'renovate') {
      const r = renovate(o);
      if (r.ok) { sfx('cash'); toast(t('renovated'), 'good'); const [x, y] = objCenter(o); burst(x, y - 20, 'star', 14); } else fail(r);
    } else if (a === 'train+') {
      const cost = trainCost(o);
      if (trainsOf(o) >= maxTrains(o)) { sfx('error'); toast(t('train_max'), 'bad'); }
      else if (!canAfford(cost)) fail({ why: 'e_money' });
      else { spend(cost, 'build'); o.cost += cost; o.trains = trainsOf(o) + 1; sfx('cash'); }
    } else if (a === 'train-') {
      if (trainsOf(o) > 1) { const cost = trainCost(o); earn(Math.round(cost / 2), 'build'); o.cost -= cost; o.trains = trainsOf(o) - 1; }
    } else if (a.startsWith('col')) { o.col = +a.slice(3); for (const pc of o.pieces) pc.geo = null; }
  } else if (panel.type === 'park') {
    if (a === 'goals') { openPanel('goals'); return; }
    if (a === 'entrance') ui.camTarget = [isoX(S.ent.x + 0.5, S.ent.y - 5), isoY(S.ent.x + 0.5, S.ent.y - 5, 2)];
    else if (a === 'go') {
      const o = S.objs[b.dataset.id];
      if (o) { const [x, y] = objCenter(o); ui.camTarget = [x, y - 20]; openPanel('obj', o.id); return; }
    } else if (a === 'map') {
      const r = b.getBoundingClientRect(), tl = miniMapTile(((e.clientX - r.left) / r.width) * 276, ((e.clientY - r.top) / r.height) * 150, 276, 150);
      ui.camTarget = [isoX(tl.x + 0.5, tl.y + 0.5), isoY(tl.x + 0.5, tl.y + 0.5, S.h[idx(tl.x, tl.y)])];
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
  } else if (panel.type === 'goals') {
    if (a === 'park') { openPanel('park'); return; }
  } else if (panel.type === 'research') {
    if (a.startsWith('rl')) S.research.level = +a.slice(2);
  } else if (panel.type === 'settings') {
    if (a === 'music' || a === 'sfx' || a === 'lang' || a === 'save' || a === 'tomenu' || a === 'night') ui.hooks[a]();
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
  $('st-rating').innerHTML = icon('star') + '<b></b>'; $('st-rating').title = t('park_map');
  els.undo.innerHTML = icon('undo') + `<span>${esc(t('b_undo'))}</span>`;
  wxKey = '';
  buildTools(); traySig = ''; buildTray(true);
  if (ui.editing) buildBuilder();
  if (panel) { panel.sig = ''; refreshPanel(); }
  lastTut = -1;
  refreshHUD();
}
let lastTut = -1, wxKey = '';
export function refreshHUD() {
  const set = (id, txt) => { const b = $(id).querySelector('b'); if (b.textContent !== txt) b.textContent = txt; };
  set('st-cash', S.sandbox ? '∞' : money(Math.floor(S.cash)));
  set('st-guests', num(S.guests.length));
  set('st-rating', num(Math.round(S.rating)));
  const d = date(), ds = t('date', d.day, t('months')[d.month], d.year);
  if (els.dateText.textContent !== ds) els.dateText.textContent = ds;
  const wk = look.night && darkness() > 0.5 ? 'moon' : S.wx ? S.wx.kind : 'sun';
  if (wk !== wxKey) { wxKey = wk; els.wx.innerHTML = icon('wx_' + wk); els.date.title = t('wx_' + wk); }
  if (ui.undo && (performance.now() - ui.undo.at > 30000 || !els.panel.hidden)) clearUndo();
  const ob = $('b-open'), ot = (S.open ? 'close' : 'open') + lang;
  if (ob.dataset.t !== ot) {
    ob.dataset.t = ot;
    ob.innerHTML = `<span class="long">${esc(t(S.open ? 'close_park' : 'open_park'))}</span><span class="short">${esc(t(S.open ? 'close_short' : 'open_short'))}</span>`;
    ob.title = t(S.open ? 'close_park' : 'open_park');
  }
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
  els.tutorial.innerHTML = `<div>${esc(t('tut_' + S.tut))}${S.tut === 1 ? ' ' + esc(t(ui.touch ? 'tut_touch' : 'tut_mouse')) : ''}</div>
    <div class="t-btns">${S.tut < 6 ? `<button class="btn flat" data-tut="skip">${esc(t('tut_skip'))}</button>` : ''}${next ? `<button class="btn yellow" data-tut="next">${esc(t(S.tut === 6 ? 'ok' : 'tut_next'))}</button>` : ''}</div>`;
}

// ---------- game events ----------
export function handleEvents() {
  while (events.length) {
    const e = events.shift();
    if (e.type === 'goal') {
      toast(t('goal_done') + (e.reward ? ' +' + money(e.reward) : ''), 'good'); sfx('goal'); confetti(view.w, view.h, 70);
      if (panel && panel.type === 'goals') panel.sig = '';
    } else if (e.type === 'star') { toast(t('star_got', e.n), 'good'); confetti(view.w, view.h, 140); ui.hooks.star(e.n); }
    else if (e.type === 'research') { toast(t('research_done', t(e.id)), 'good'); sfx('unlock'); traySig = ''; if (ui.editing) buildBuilder(); }
    else if (e.type === 'ach') { toast(t('ach', t('a')[e.id]), 'good'); ui.hooks.achievement(e.id); }
    else if (e.type === 'month') ui.hooks.month();
    else if (e.type === 'closed') { if (ui.editing === e.id) { toast(t('b_complete'), 'good'); sfx('goal'); confetti(view.w, view.h, 60); } }
    else if (e.type === 'built') {
      const o = S.objs[e.id];
      if (o) { o.pop = performance.now() / 1000; const [x, y] = objCenter(o); burst(x, y + 8, 'dust', 14); }
    } else if (e.type === 'dispatch') {
      const o = S.objs[e.id];
      if (o && e.sum > 0 && cam.zoom >= 0.5) { const [x, y] = objCenter(o); floatText(x, y - 30, '+' + money(Math.round(e.sum))); }
      if (o && ui.follow === e.id) sfx('whoosh');
    } else if (e.type === 'fireworks') toast(t('fireworks'), 'good');
    else if (e.type === 'event') { toast(t('ev_' + e.id), 'good'); sfx('unlock'); }
    else if (e.type === 'eventend') toast(e.id === 'critic' ? t(e.good ? 'evend_critic_good' : 'evend_critic_bad', money(e.prize)) : t('evend_' + e.id), e.good ? '' : 'bad');
    else if (e.type === 'year') {
      sfx('goal'); if (e.won.length) confetti(view.w, view.h, 100);
      dialog(`<h2>${esc(t('year_title', e.year))}</h2><div class="facts"><div>${esc(t('year_guests'))}<b>${num(e.guests)}</b></div><div>${esc(t('year_income'))}<b>${money(e.income)}</b></div></div>
        ${e.won.length ? `<ul class="list">${e.won.map((id) => `<li><span class="ck" style="background:var(--yellow)">${icon('star')}</span><span>${esc(t(id))}</span></li>`).join('')}</ul>${e.prize ? `<p>${esc(t('year_prize', money(e.prize)))}</p>` : ''}` : `<p>${esc(t('year_none'))}</p>`}`,
        [{ label: t('ok'), cls: 'yellow', value: 1 }]);
    }
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
let hudTxt = 'x';
/** Live read-out while the camera follows a train. */
export function updateTestHud() {
  const c = S.objs[ui.follow];
  if (!c || !c.sim || !ui.followPos) return;
  if (c.st !== 'test' && c.st !== 'run') { if (hudTxt !== '') { hudTxt = ''; els.testhud.innerHTML = `<div>${esc(t('watch_wait'))}</div>`; } return; }
  hudTxt = 'x';
  const k = Math.min(c.sim.segs, ui.followPos[2]);
  const hgt = Math.max(0, (c.sim.Z[k % c.sim.n] - c.pieces[0].h0) * 2);
  els.testhud.innerHTML = `<div><span>${esc(t('speed_now'))}</span>${esc(t('kmh', num(c.sim.v[k] * 3.6)))}</div><div><span>↕</span>${esc(t('meters', num(hgt)))}</div><div><span>G</span>${num(c.sim.gv[k] || 1, 1)}</div>`;
}

// ---------- coaster sounds ----------
// Trains you can see make noise: the lift clatters, riders scream on a big drop, a fast train rushes by.
const sp = {};
let clackT = 0, screamT = 0;
export function updateSounds(dt) {
  clackT -= dt; screamT -= dt;
  if (!audio.sfx || !S.speed && !ui.follow) return;
  let lift = 0;
  for (const id in S.objs) {
    const c = S.objs[id];
    if (c.kind !== 'coaster' || !c.sim || !c.sim.ok) continue;
    const runs = c.st === 'test' ? testRun(c) : c.runs;
    if (!runs || !runs.length) continue;
    for (const r of runs) {
      if (!posAt(c.sim, trainDist(c.sim, r.t), sp)) continue;
      const px = (isoX(sp.x, sp.y) - cam.x) * cam.zoom + view.w / 2, py = (isoY(sp.x, sp.y, sp.z) - cam.y) * cam.zoom + view.h / 2;
      if (px < -40 || py < -40 || px > view.w + 40 || py > view.h + 40) continue;
      const vol = ui.follow === c.id ? 1 : Math.max(0.2, Math.min(0.75, cam.zoom * 0.55));
      const p = c.pieces[sp.pi], v = c.sim.v[Math.min(c.sim.segs, sp.k)] || 0;
      if (p.chain) lift = Math.max(lift, vol);
      // one scream for each drop and one rush of wind for each fast stretch
      const falling = sp.tz < -0.02 && v > 13;
      if (falling && !r.scr && screamT <= 0 && (r.riders ? r.riders.length : 0) > 0) { sfx('scream', vol); screamT = 1.6; }
      r.scr = falling;
      if (v > 19 && !r.wsh) { sfx('rush', vol * 0.8); r.wsh = true; } else if (v < 13) r.wsh = false;
    }
  }
  if (lift && clackT <= 0) { sfx('clack', lift); clackT = 0.15; }
}
const testOne = [{ t: 0, riders: null }];
function testRun(c) { testOne[0].t = c.runT; return testOne; }

// ---------- map input ----------
const pointers = new Map();
let mode = null, lastHover = null, pinch = null, downHandle = null;
const vel = { x: 0, y: 0, t: 0 }; // the map keeps gliding a little after a drag
let zoomTo = 0, zoomAtX = 0, zoomAtY = 0;
const pendingTool = () => (ui.tool === 'ride' || ui.tool === 'stall' || ui.tool === 'coaster') && ui.item;

export function clampCam() {
  cam.zoom = Math.max(0.35, Math.min(2.6, cam.zoom));
  cam.x = Math.max(-N * 32, Math.min(N * 32, cam.x));
  cam.y = Math.max(-80, Math.min(N * 32 + 60, cam.y));
}
function zoomAt(px, py, factor) {
  const [wx, wy] = toWorld(px, py);
  cam.zoom = Math.max(0.35, Math.min(2.6, cam.zoom * factor));
  cam.x = wx - (px - view.w / 2) / cam.zoom;
  cam.y = wy - (py - view.h / 2) / cam.zoom;
  clampCam();
}
/** The piece of the coaster being edited that lies under a screen point, or null. */
function pieceAt(px, py) {
  const c = S.objs[ui.editing];
  if (!c || !c.sim) return null;
  const [wx, wy] = toWorld(px, py), sm = c.sim;
  let best = null, bd = (ui.touch ? 22 : 14) / cam.zoom;
  for (let k = 0; k < sm.n; k++) {
    const d = Math.hypot(isoX(sm.X[k], sm.Y[k]) - wx, isoY(sm.X[k], sm.Y[k], sm.Z[k] + 0.3) - wy);
    if (d < bd) { bd = d; best = sm.PI[k]; }
  }
  return best !== null && c.pieces[best].t !== 'station' ? best : null;
}
function tap(px, py, touch) {
  if (ui.editing) {
    const pi = pieceAt(px, py);
    if (pi !== ui.pick) { ui.pick = pi; sfx('click'); refreshBuilder(); }
    return;
  }
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
  applyTool(tile);
  // on touch, the tile just built on becomes a grip: drag from it to draw a line or an area
  if (touch && areaTool()) ui.handle = tile;
  ui.ghost = touch ? null : ghostAt(tile);
}
function cancelArea() { ui.area = null; ui.ghost = null; }
function onDown(e) {
  unlock();
  const wasTouch = ui.touch;
  ui.touch = e.pointerType === 'touch';
  if (wasTouch !== ui.touch) updateInfo();
  try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not every pointer can be captured */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
  ui.camTarget = null; vel.x = vel.y = 0; zoomTo = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    if (mode === 'area') cancelArea();
    mode = 'pinch';
    return;
  }
  if (pointers.size > 2) return;
  if (e.button === 1 || e.button === 2) { if (mode === 'area') cancelArea(); mode = 'pan'; return; }
  if (ui.editing) {
    downHandle = handleAt(e.clientX, e.clientY);
    mode = downHandle ? 'handle' : 'tap';
    if (downHandle) ui.hot = downHandle.key;
    return;
  }
  if (areaTool()) {
    const tile = pickTile(e.clientX, e.clientY);
    if (ui.touch) {
      // one finger moves the map, unless it starts on the grip left by the last tap
      if (tile && ui.handle && Math.abs(tile.x - ui.handle.x) + Math.abs(tile.y - ui.handle.y) <= 1) {
        mode = 'area'; ui.area = { a: ui.handle, b: ui.handle, grip: true };
        return;
      }
    } else if (tile) {
      mode = 'area'; ui.area = { a: tile, b: tile };
      ui.ghost = areaGhost([[tile.x, tile.y]]);
      return;
    }
  }
  mode = 'tap';
}
function onMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') {
      if (ui.editing) {
        const h = handleAt(e.clientX, e.clientY);
        ui.hot = h ? h.key : null;
        els.canvas.classList.toggle('point', !!h);
        return;
      }
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
  if (mode === 'area' && ui.area) {
    if (ui.touch && !p.moved) return;
    const tile = pickTile(e.clientX, e.clientY), A = ui.area;
    if (tile && (tile.x !== A.b.x || tile.y !== A.b.y)) {
      // an L-shaped line first runs the way the drag set off
      if (A.b.x === A.a.x && A.b.y === A.a.y) A.firstY = Math.abs(tile.y - A.a.y) > Math.abs(tile.x - A.a.x);
      if (tile.x === A.a.x) A.firstY = true; else if (tile.y === A.a.y) A.firstY = false;
      A.b = tile;
      ui.ghost = areaGhost(areaTiles(A.a, A.b, A.firstY));
    }
    return;
  }
  if (mode === 'handle') {
    if (p.moved) { mode = 'pan'; ui.hot = null; }
    else return;
  }
  if (mode === 'pan' || (mode === 'tap' && p.moved)) {
    if (mode !== 'pan' && ui.follow && !ui.editing) stopFollow();
    mode = 'pan';
    cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom;
    const now = performance.now(), dtm = Math.max(8, now - vel.t);
    vel.x = vel.x * 0.5 + ((-dx / cam.zoom) / dtm) * 500; vel.y = vel.y * 0.5 + ((-dy / cam.zoom) / dtm) * 500; vel.t = now;
    clampCam();
    if (S.tut === 0 && Math.hypot(p.x - p.sx, p.y - p.sy) > 120) S.tut = 1;
  }
}
function onUp(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p) return;
  const up = e.type === 'pointerup', touch = e.pointerType === 'touch';
  if (mode === 'tap' && !p.moved && up) tap(e.clientX, e.clientY, touch);
  else if (mode === 'handle' && up) {
    const h = handleAt(e.clientX, e.clientY);
    if (h && downHandle && h.key === downHandle.key) {
      if (h.kind || h.ok) builderAct(h.key); else fail({ why: h.why });
    }
    if (touch) ui.hot = null;
  } else if (mode === 'area' && ui.area) {
    const A = ui.area;
    ui.area = null;
    if (!up) ui.ghost = null;
    else if (A.grip && !p.moved) tap(e.clientX, e.clientY, true);
    else {
      applyArea(areaTiles(A.a, A.b, A.firstY), !!A.grip && !(A.a.x === A.b.x && A.a.y === A.b.y));
      if (touch) { ui.handle = A.b; ui.ghost = null; } else ui.ghost = ghostAt(pickTile(e.clientX, e.clientY));
    }
  }
  if (mode === 'pan' && pointers.size === 0 && performance.now() - vel.t > 90) vel.x = vel.y = 0;
  if (mode !== 'pan') vel.x = vel.y = 0;
  downHandle = null;
  if (pointers.size === 0) mode = null;
  else if (mode === 'pinch') { mode = 'pan'; vel.x = vel.y = 0; }
}
function onWheel(e) {
  e.preventDefault();
  ui.camTarget = null;
  const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  // glide towards the new zoom instead of jumping
  zoomTo = Math.max(0.35, Math.min(2.6, (zoomTo || cam.zoom) * Math.exp(-Math.max(-200, Math.min(200, dy)) * 0.0018)));
  zoomAtX = e.clientX; zoomAtY = e.clientY;
}
const keys = new Set();
const BUILD_KEYS = {
  arrowleft: 'l', arrowup: 's', arrowright: 'r', arrowdown: 'undo', backspace: 'undo', z: 'undo', c: 'chain', b: 'bank', v: 'wide',
  l: 'loop', k: 'cork', f: 'auto', t: 'test', enter: 'done', e: 'up', q: 'down', 1: 'slope-2', 2: 'slope-1', 3: 'slope0', 4: 'slope1', 5: 'slope2',
};
function onKey(e) {
  if (e.target.tagName === 'INPUT' || els.hud.hidden) return;
  if (e.type === 'keyup') { keys.delete(e.key.toLowerCase()); return; }
  const k = e.key.toLowerCase();
  if (!els.modal.hidden) { if (k === 'escape' || k === 'enter') els.modal.click(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { if (ui.editing) builderAct('undo'); else doUndo(); e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (ui.editing && BUILD_KEYS[k]) { builderAct(BUILD_KEYS[k]); e.preventDefault(); return; }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); e.preventDefault(); return; }
  if (k === 'r') rotate();
  else if (k === 'escape') {
    if (ui.area) { cancelArea(); mode = 'tap'; for (const p of pointers.values()) p.moved = true; }
    else if (ui.pending) { ui.pending = null; ui.ghost = null; showConfirm(); }
    else if (ui.editing) exitEditor();
    else if (ui.tool !== 'inspect') selectTool('inspect');
    else closePanel();
  } else if (k === ' ') { S.speed = S.speed ? 0 : 1; e.preventDefault(); }
  else if (k === '+' || k === '=') { zoomTo = Math.min(2.6, (zoomTo || cam.zoom) * 1.25); zoomAtX = view.w / 2; zoomAtY = view.h / 2; }
  else if (k === '-') { zoomTo = Math.max(0.35, (zoomTo || cam.zoom) / 1.25); zoomAtX = view.w / 2; zoomAtY = view.h / 2; }
}
/** Camera movement: keys, gliding after a drag, smooth zoom, following a train, and moving to a target. */
export function moveCamera(dt) {
  const sp = (520 / cam.zoom) * dt;
  let moved = false;
  if (keys.has('a') || (!ui.editing && keys.has('arrowleft'))) { cam.x -= sp; moved = true; }
  if (keys.has('d') || (!ui.editing && keys.has('arrowright'))) { cam.x += sp; moved = true; }
  if (keys.has('w') || (!ui.editing && keys.has('arrowup'))) { cam.y -= sp; moved = true; }
  if (keys.has('s') || (!ui.editing && keys.has('arrowdown'))) { cam.y += sp; moved = true; }
  if (moved) { ui.camTarget = null; if (S.tut === 0) S.tut = 1; if (ui.follow && !ui.editing) stopFollow(); }
  if (zoomTo) {
    const z = cam.zoom + (zoomTo - cam.zoom) * Math.min(1, dt * 14);
    zoomAt(zoomAtX, zoomAtY, z / cam.zoom);
    if (Math.abs(zoomTo - cam.zoom) < 0.002) zoomTo = 0;
  }
  if (!pointers.size && (vel.x || vel.y)) {
    cam.x += vel.x * dt; cam.y += vel.y * dt;
    const f = Math.exp(-5.5 * dt);
    vel.x *= f; vel.y *= f;
    if (Math.hypot(vel.x, vel.y) < 8) vel.x = vel.y = 0;
  }
  const c = ui.follow && S.objs[ui.follow];
  if (c && ui.followPos && !pointers.size) {
    // keep the train in the middle of the part of the screen that the bars leave free
    const k = Math.min(1, dt * 4), off = ((els.top.offsetHeight + view.h - els.bottom.offsetHeight) / 2 - view.h / 2) / cam.zoom;
    cam.x += (ui.followPos[0] - cam.x) * k; cam.y += (ui.followPos[1] - off - cam.y) * k;
  } else if (ui.camTarget) {
    const k = Math.min(1, dt * 6);
    cam.x += (ui.camTarget[0] - cam.x) * k; cam.y += (ui.camTarget[1] - cam.y) * k;
    if (Math.hypot(ui.camTarget[0] - cam.x, ui.camTarget[1] - cam.y) < 1) ui.camTarget = null;
  }
  clampCam();
  layoutHandles();
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
    speed: $('speed'), date: $('st-date'), testhud: $('testhud'), info: $('info'), undo: $('undo'),
    dateText: $('st-date').querySelector('span'), wx: $('st-date').querySelector('i'),
  };
  fxHooks.bang = () => sfx('boom');
  els.undo.addEventListener('click', doUndo);
  // a mouse wheel over the build menu scrolls it sideways
  els.tray.addEventListener('wheel', (e) => { if (!e.deltaX) { els.tray.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
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
  // know from the very first tap (also one on a menu button) whether this is a finger or a mouse
  document.addEventListener('pointerdown', (e) => {
    unlock();
    const touch = e.pointerType === 'touch';
    if (touch !== ui.touch) { ui.touch = touch; lastTut = -1; if (!els.hud.hidden) { updateInfo(); tutorial(); } }
  }, { capture: true });

  els.tools.addEventListener('click', (e) => { const b = e.target.closest('button[data-tool]'); if (b) { sfx('click'); selectTool(b.dataset.tool); } });
  els.tray.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { ui.hooks.delDesign(+del.dataset.del); ui.item = null; ui.ghost = null; ui.pending = null; traySig = ''; buildTray(true); showConfirm(); sfx('remove'); return; }
    const b = e.target.closest('button[data-item]');
    if (b) selectItem(b.dataset.item);
  });
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
  ui.cands = null; ui.hot = null; ui.handle = null; ui.area = null; clearUndo(); vel.x = vel.y = 0; zoomTo = 0;
  panel = null; els.panel.hidden = true; els.hud.classList.remove('has-panel'); els.builder.hidden = true; els.tools.hidden = false; els.confirm.hidden = true;
  els.testhud.hidden = true; els.toasts.innerHTML = ''; els.modal.hidden = true;
  accessPv = -1; lastTut = -1; traySig = '';
  pointers.clear(); mode = null; els.info.hidden = true;
  buildHUD();
}
