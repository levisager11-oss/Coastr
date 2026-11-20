// Start-up, main menu, the game loop, saving, and the Toki hooks.
import { S, newGame, serialize, deserialize, events, parkValue, idx, previewMap, saveMap, net } from './world.js';
import { tick, initAfterLoad } from './sim.js';
import { render, cam, view, look, isoX, isoY, toScreen, mapThumb } from './render.js';
import {
  ui, initUI, resetUI, buildHUD, refreshHUD, handleEvents, moveCamera, centerOn, toast, dialog, showHelp, updateTestHud, closePanel,
  starsHTML, updateSounds, closeDialog, refreshRoom, openPanel,
} from './ui.js';
import { room, hostRoom, joinRoom, leaveRoom, netTick, shareEvents, setNetHooks, cleanCode, renameMe } from './net.js';
import { SCENARIOS, SCENARIO_ORDER, DAY_LEN, MONTH_DAYS } from './data.js';
import { updateFx, clearFx } from './fx.js';
import { t, setLang, detectLang, lang, money, num } from './i18n.js';
import { audio, setMusic, setSfx, sfx, suspend, unlock } from './audio.js';
import { icon } from './icons.js';
import { buildDemo } from './demo.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const KEY = { settings: 'coastr.settings', progress: 'coastr.progress' };
// Every saved park is its own key starting with SAVE. Older versions kept one park per scenario
// ('coastr.save.career' for the first, 'coastr.save.<scenario>', 'coastr.save.sandbox'); those keys
// are simply parks in the list too, so nothing has to be moved.
const SAVE = 'coastr.save.';
const MAX_PARKS = 8;
const legacyKey = (mode, sc) => SAVE + (mode === 'sandbox' ? 'sandbox' : sc === 'meadows' ? 'career' : sc);
const newKey = () => SAVE + 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
let curKey = null, saveWarned = false;
let playing = false;
// shown inside another page (the game page on Toki)?
let embedded = false;
try { embedded = window.parent !== window; } catch (e) { embedded = true; }
if (embedded) document.documentElement.classList.add('embedded');
const demoUi = { ghost: null, sel: null, editing: 0, follow: 0 };

// ---------- storage ----------
function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
function load(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
const settings = Object.assign({ lang: detectLang(), music: true, sfx: true, night: true, name: '' }, load(KEY.settings) || {});
function saveSettings() { store(KEY.settings, { lang, music: audio.music, sfx: audio.sfx, night: look.night, name: settings.name }); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function saveGame(show) {
  if (!playing || !curKey) return;
  const d = serialize();
  d.at = Date.now();
  const ok = store(curKey, d);
  parkCache = null;
  if (show || (!ok && !saveWarned)) toast(t(ok ? 'saved' : 'save_fail'), ok ? 'good' : 'bad');
  if (!ok) saveWarned = true;
}

// ---------- the list of saved parks ----------
let parkCache = null;
/** All saved parks, the one played most recently first: [{ key, d }]. */
function parks() {
  if (parkCache) return parkCache;
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(SAVE)) continue;
      const d = load(k);
      if (d && d.h && d.objs) out.push({ key: k, d });
    }
  } catch (e) { /* no storage: no parks */ }
  out.sort((a, b) => (b.d.at || 0) - (a.d.at || 0));
  return (parkCache = out);
}
const scOf = (d) => (SCENARIOS[d.sc] ? d.sc : 'meadows');
const nameOf = (d) => d.name || t('sc_' + scOf(d));
const parksOf = (mode, sc) => parks().filter((p) => p.d.mode === mode && (!sc || scOf(p.d) === sc));
function lastPark() {
  const all = parks(), l = progress.last;
  if (!l) return all[0] || null;
  const key = l.key || legacyKey(l.mode, l.sc);
  return all.find((p) => p.key === key) || all[0] || null;
}
function dateOf(time) {
  const day = Math.floor((time || 0) / DAY_LEN), m = Math.floor(day / MONTH_DAYS);
  return t('date', (day % MONTH_DAYS) + 1, t('months')[(m + 2) % 12], Math.floor((m + 2) / 12) + 1);
}
const parkThumbs = new Map();
function parkThumb(p) {
  const c0 = parkThumbs.get(p.key);
  if (c0 && c0.at === p.d.at) return c0.c;
  const c = document.createElement('canvas');
  c.width = 168; c.height = 104;
  const g = c.getContext('2d');
  g.scale(2, 2);
  try { mapThumb(g, saveMap(p.d), 84, 52); } catch (e) { /* an odd save: leave the picture empty */ }
  parkThumbs.set(p.key, { at: p.d.at, c });
  return c;
}
/** Ask for a park name. Resolves to the new name, or null when cancelled. */
const askName = (cur) => askText(t('park_name'), t('park_name_q'), cur, 24);
/** Ask for a line of text in a dialog. Resolves to it (trimmed), or null when cancelled. */
async function askText(title, q, cur, max, cls = '', okLabel = t('ok')) {
  const p = dialog(`<h2>${esc(title)}</h2><p>${esc(q)}</p>
    <input class="name-in ${cls}" type="text" maxlength="${max}" value="${esc(cur)}" autocomplete="off" spellcheck="false" enterkeyhint="done">`,
  [{ label: t('b_cancel'), value: 0 }, { label: okLabel, cls: 'yellow', value: 1 }]);
  const inp = document.querySelector('#modal .name-in');
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      const b = document.querySelector(`#modal [data-i="${e.key === 'Enter' ? 1 : 0}"]`);
      if (b) b.click();
    });
    setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 30);
  }
  const a = await p;
  return a === 1 && inp ? inp.value.replace(/\s+/g, ' ').trim().slice(0, max) : null;
}
function parksFull() {
  if (parks().length < MAX_PARKS) return false;
  dialog(`<h2>${esc(t('m_parks'))}</h2><p>${esc(t('parks_full', MAX_PARKS))}</p>`,
    [{ label: t('b_cancel'), value: 0 }, { label: t('m_parks'), cls: 'yellow', value: 1 }])
    .then((a) => { if (a === 1) { menuView = 'parks'; buildMenu(); } });
  return true;
}
function newPark(mode, sc) { if (!parksFull()) startGame(mode, true, sc); }
async function renamePark(key) {
  const d = load(key);
  if (!d) return;
  const v = await askName(nameOf(d));
  if (v === null) return;
  d.name = v === t('sc_' + scOf(d)) ? '' : v;
  store(key, d); parkCache = null;
}
function copyPark(key) {
  if (parksFull()) return;
  const d = load(key);
  if (!d) return;
  d.name = t('park_copy_name', nameOf(d)).slice(0, 30);
  d.at = Date.now();
  d.sentValue = 0; d.sentGuests = 0;
  // (the menu has no toasts: the new park simply shows up at the top of the list)
  if (!store(newKey(), d)) dialog(`<p>${esc(t('save_fail'))}</p>`, [{ label: t('ok'), cls: 'yellow', value: 1 }]);
  parkCache = null;
}
async function deletePark(key) {
  const d = load(key);
  if (!d) return;
  const a = await dialog(`<h2>${esc(t('park_delete'))}</h2><p>${esc(t('park_del_q', nameOf(d)))}</p>`,
    [{ label: t('b_cancel'), value: 0 }, { label: t('park_delete'), cls: 'red', value: 1 }]);
  if (a !== 1) return;
  noteStars(); // keep the stars this park earned
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  parkCache = null; parkThumbs.delete(key);
}
// Stars earned in each scenario. Kept apart from the saved parks, so starting a park again does not lose them.
const progress = Object.assign({ stars: {}, last: null, sent: {} }, load(KEY.progress) || {});
function starsOf(sc) {
  let n = progress.stars[sc] || 0;
  for (const { d } of parksOf('career', sc)) n = Math.max(n, SCENARIOS[sc].stars.filter((k) => (d.goal || 0) >= k).length);
  return n;
}
const totalStars = () => SCENARIO_ORDER.reduce((a, sc) => a + starsOf(sc), 0);
function noteStars() {
  let changed = false;
  for (const sc of SCENARIO_ORDER) { const n = starsOf(sc); if (n !== (progress.stars[sc] || 0)) { progress.stars[sc] = n; changed = true; } }
  const total = totalStars();
  for (const [id, need] of [['star-1', 1], ['stars-6', 6], ['stars-12', 12]]) {
    if (total >= need && !progress.sent[id]) { progress.sent[id] = 1; changed = true; achievement(id); }
  }
  if (changed) store(KEY.progress, progress);
}

// ---------- Toki ----------
function sendScores() {
  if (!playing || S.sandbox || !window.toki) return;
  try {
    const v = parkValue();
    if (v > (S.sentValue || 0)) { window.toki.score(v); S.sentValue = v; }
    if (S.peakGuests > (S.sentGuests || 0)) { window.toki.score(S.peakGuests, 'guests'); S.sentGuests = S.peakGuests; }
  } catch (e) { /* scores are a bonus; never break the game over them */ }
}
function achievement(id) {
  try { if (window.toki && window.toki.achievement) window.toki.achievement(id); } catch (e) { /* ignore */ }
}

// ---------- speed ----------
// If frames take too long (a weak phone, a huge park) the picture is drawn a little less sharp and
// with fewer small details, step by step, and goes back up when there is time to spare.
// It steps down as soon as more than about one frame in four is late (on a 60 Hz screen a late
// frame takes 33 ms), and only tries a better step after a long smooth spell. A better step that
// turns out too slow makes the next try wait twice as long, so it does not keep stuttering.
const Q_SCALE = [1, 0.8, 0.65, 0.55];
let avgMs = 16, slowT = 0, fastT = 0, holdT = 0, warmT = 3, sinceUp = 99, backoff = 20;
function tuneQuality(sec) {
  if (!look.auto) return;
  if (warmT > 0) { warmT -= sec; return; }
  avgMs += (Math.min(100, sec * 1000) - avgMs) * 0.05;
  holdT -= sec; sinceUp += sec;
  if (avgMs > 21) { slowT += sec; fastT = 0; } else if (avgMs < 17.5) { fastT += sec; slowT = 0; } else { slowT = 0; fastT = 0; }
  if (slowT > 2 && look.q < 3) {
    look.q++; slowT = 0;
    if (sinceUp < 8) backoff = Math.min(300, backoff * 2);
    holdT = backoff; resize();
  } else if (fastT > 8 && look.q > 0 && holdT <= 0) { look.q--; fastT = 0; sinceUp = 0; resize(); }
}

// ---------- screen ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight, dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2) * Q_SCALE[look.q]);
  if (!w || !h) return;
  view.w = w; view.h = h; view.dpr = dpr;
  const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  if (!playing && menuEl.firstChild && (h < 420) !== menuSmall) buildMenu();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------- menu ----------
let menuSmall = false;
const thumbs = new Map();
function thumbFor(sc) {
  let c = thumbs.get(sc);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 168; c.height = 104;
    const g = c.getContext('2d');
    g.scale(2, 2);
    mapThumb(g, previewMap(sc), 84, 52);
    thumbs.set(sc, c);
  }
  return c;
}
let menuView = 'main';
function buildMenu() {
  menuSmall = view.h < 420;
  parkCache = null; // Toki may have brought back saves from the player's account since the last look
  if (menuView === 'parks') { buildParks(); return; }
  const sw = (on) => (on ? t('on') : t('off'));
  const total = totalStars(), lp = lastPark(), all = parks();
  let cards = '';
  for (const sc of SCENARIO_ORDER) {
    const SC = SCENARIOS[sc], locked = total < SC.need, has = parksOf('career', sc).length > 0;
    cards += `<button class="m-sc${locked ? ' locked' : ''}" data-m="sc:${sc}"><i data-th="${sc}"></i><div><b>${t('sc_' + sc)}</b>
      <span>${locked ? icon('lock') + t('sc_need', SC.need) : t(has ? 'sc_saved' : 'scd_' + sc)}</span></div><em class="stars">${starsHTML(starsOf(sc))}</em></button>`;
  }
  const hasSandbox = parksOf('sandbox').length > 0;
  cards += `<button class="m-sc sand" data-m="sandbox"><i>${icon('wand')}</i><div><b>${t('m_sandbox')}</b><span>${t(hasSandbox ? 'sc_saved' : 'm_sandbox_desc')}</span></div></button>`;
  menuEl.innerHTML = `<div class="m-card"><div class="m-head">
    <div class="logo">Coast<i>r</i></div>
    <div class="tag">${t('tagline')}</div>
    ${embedded && view.h < 420 && view.w < 560 ? `<div class="tip">${t('tip_fullscreen')}</div>` : ''}
  </div><div class="m-list">
    ${lp ? `<div class="m-top"><button class="m-btn main" data-m="continue"><b>${t('m_continue')}</b><span>${esc(nameOf(lp.d))}${lp.d.mode === 'sandbox' ? ' · ' + t('m_sandbox') : ''}</span></button>
      <button class="m-btn parks" data-m="parks"><b>${icon('folder')}${t('m_parks')}</b><span>${t('m_parks_n', all.length, MAX_PARKS)}</span></button></div>` : ''}
    <div class="m-scs">${cards}</div>
    <div class="m-row"><button class="btn blue" data-m="join">${icon('people')}${t('mp_join')}</button></div>
    <div class="m-row">
      <button class="btn" data-m="help">${icon('help')}${t('m_help')}</button>
      <button class="btn" data-m="lang">${icon('globe')}${t('lang_name')}</button>
    </div>
    <div class="m-row">
      <button class="btn" data-m="music">${icon('music')}${sw(audio.music)}</button>
      <button class="btn" data-m="sfx">${icon('sound')}${sw(audio.sfx)}</button>
    </div>
  </div></div>`;
  for (const el of menuEl.querySelectorAll('[data-th]')) el.appendChild(thumbFor(el.dataset.th));
}
/** The list of saved parks: play, rename, copy or delete each one. */
function buildParks() {
  const all = parks();
  const rows = all.map((p, n) => {
    const d = p.d, sand = d.mode === 'sandbox', sc = scOf(d);
    const stars = sand ? '' : `<em class="stars">${starsHTML(SCENARIOS[sc].stars.filter((k) => (d.goal || 0) >= k).length)}</em>`;
    const line1 = (d.name ? t('sc_' + sc) + ' · ' : '') + t(sand ? 'm_sandbox' : 'm_career');
    // the facts may wrap onto a second line on narrow screens, but never in the middle of one
    const nb = (x) => `<i>${esc(x).replace(/ /g, '&nbsp;')}</i>`;
    const facts = [nb(dateOf(d.time)), `<i>${icon('guest')}${num(d.guestCount || 0)}</i>`, ...(sand ? [] : [nb(money(Math.floor(d.cash || 0)))])];
    return `<div class="m-park"><button class="m-pk" data-m="play:${n}"><i data-pt="${n}"></i><div><b>${esc(nameOf(d))}</b>
      <span class="l1"><em>${esc(line1)}</em>${stars}</span><span class="l2">${facts.join(' · ')}</span></div></button>
      <div class="m-pa"><button class="btn icon flat" data-m="ren:${n}" aria-label="${esc(t('park_rename'))}" title="${esc(t('park_rename'))}">${icon('pen')}</button>
      <button class="btn icon flat" data-m="cp:${n}" aria-label="${esc(t('park_copy'))}" title="${esc(t('park_copy'))}">${icon('copy')}</button>
      <button class="btn icon flat del" data-m="del:${n}" aria-label="${esc(t('park_delete'))}" title="${esc(t('park_delete'))}">${icon('trash')}</button></div></div>`;
  }).join('');
  menuEl.innerHTML = `<div class="m-card m-parks"><div class="m-ph"><button class="btn icon" data-m="back" aria-label="${esc(t('b_back'))}">${icon('back')}</button>
    <h2>${t('m_parks')}</h2><span>${t('m_parks_n', all.length, MAX_PARKS)}</span></div>
    <div class="m-plist">${rows || `<p class="m-none">${esc(t('parks_none'))}</p>`}</div></div>`;
  for (const el of menuEl.querySelectorAll('[data-pt]')) { const p = all[+el.dataset.pt]; if (p) el.appendChild(parkThumb(p)); }
}
/** Ask which map a new sandbox park should use. */
function pickMap() {
  return dialog(`<h2>${t('m_sandbox')}</h2><p>${t('sandbox_map')}</p>`,
    [...SCENARIO_ORDER.map((sc) => ({ label: t('sc_' + sc), cls: 'flat', value: sc })), { label: t('b_cancel'), value: null }]);
}
menuEl.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  unlock(); sfx('click');
  const m = b.dataset.m, colon = m.indexOf(':'), act = colon < 0 ? m : m.slice(0, colon), arg = m.slice(colon + 1);
  if (act === 'help') showHelp();
  else if (act === 'lang') hooks.lang();
  else if (act === 'music') { hooks.music(); buildMenu(); }
  else if (act === 'sfx') { hooks.sfx(); buildMenu(); }
  else if (act === 'join') joinFriend();
  else if (act === 'continue') { const p = lastPark(); if (p) startGame(p.d.mode, false, scOf(p.d), p.key); }
  else if (act === 'parks') { menuView = 'parks'; buildMenu(); menuEl.scrollTop = 0; }
  else if (act === 'back') { menuView = 'main'; buildMenu(); }
  else if (act === 'play' || act === 'ren' || act === 'cp' || act === 'del') {
    const p = parks()[+arg];
    if (!p) return;
    if (act === 'play') { startGame(p.d.mode, false, scOf(p.d), p.key); return; }
    if (act === 'ren') await renamePark(p.key);
    else if (act === 'cp') copyPark(p.key);
    else await deletePark(p.key);
    if (!playing) buildMenu();
  } else if (act === 'sandbox') {
    const mine = parksOf('sandbox');
    if (mine.length) {
      const a = await dialog(`<h2>${t('m_sandbox')}</h2><p>${esc(t('sc_have', nameOf(mine[0].d)))}</p>`,
        [{ label: t('b_cancel'), value: 0 }, { label: t('park_new'), value: 2 }, { label: t('m_continue_short'), cls: 'yellow', value: 1 }]);
      if (a === 1) { startGame('sandbox', false, scOf(mine[0].d), mine[0].key); return; }
      if (a !== 2) return;
    }
    if (parks().length >= MAX_PARKS) { parksFull(); return; }
    const sc = await pickMap();
    if (sc) newPark('sandbox', sc);
  } else if (act === 'sc') {
    const sc = arg, SC = SCENARIOS[sc];
    if (!SC) return;
    if (totalStars() < SC.need) {
      dialog(`<h2>${t('sc_' + sc)}</h2><p>${t('sc_locked', SC.need, totalStars())}</p>`, [{ label: t('ok'), cls: 'yellow', value: 1 }]);
      return;
    }
    const mine = parksOf('career', sc);
    if (mine.length) {
      const a = await dialog(`<h2>${t('sc_' + sc)}</h2><p>${t('scd_' + sc)}</p><p>${esc(t('sc_have', nameOf(mine[0].d)))}</p>`,
        [{ label: t('b_cancel'), value: 0 }, { label: t('park_new'), value: 2 }, { label: t('m_continue_short'), cls: 'yellow', value: 1 }]);
      if (a === 1) startGame('career', false, sc, mine[0].key);
      else if (a === 2) newPark('career', sc);
    } else newPark('career', sc);
  }
});

/** Start or continue a park. sc = scenario id (the map); the first one is the original career.
 *  key = the saved park to load; without it the latest park of that mode and map is continued.
 *  A fresh park always gets a new slot, and so does a save that will not load (it is kept as it is). */
function startGame(mode, fresh, sc = 'meadows', key = null, data = null) {
  if (!fresh && !key && !data) { const p = parksOf(mode, sc)[0]; key = p ? p.key : null; }
  // data: a park handed over whole (a friend's park when joining them); key is then where our copy goes, or null for none
  const saved = data || (!fresh && key ? load(key) : null);
  let ok = false;
  if (saved) {
    try { deserialize(saved); ok = true; } catch (e) { ok = false; }
  }
  if (!ok && !data) { newGame(mode, sc); key = newKey(); }
  else if (!ok) { newGame(mode, sc); key = null; } // a friend's park that will not load: never write over our copy
  curKey = key; saveWarned = false;
  initAfterLoad();
  S.speed = 1;
  events.length = 0;
  clearFx();
  playing = true;
  menuEl.hidden = true; hudEl.hidden = false;
  resetUI();
  cam.zoom = view.w < 600 ? 0.8 : 1;
  centerOn(S.ent.x + 0.5, S.ent.y - 6, S.h[idx(S.ent.x, S.ent.y - 6)] || 2);
  if (key) { progress.last = { key, mode: S.mode, sc: S.sc }; store(KEY.progress, progress); }
  saveGame(false);
}
function toMenu() {
  if (net.on) { leaveRoom(); tokiRoom(null); refreshRoom(); }
  saveGame(false); sendScores(); noteStars();
  playing = false; curKey = null; menuView = 'main';
  hudEl.hidden = true; menuEl.hidden = false;
  closePanel();
  clearFx();
  buildDemo(); events.length = 0;
  demoView();
  buildMenu();
}
function demoView() { cam.zoom = view.w < 600 ? 0.75 : 1.05; centerOn(S.ent.x, S.ent.y - 12, 2); }

// ---------- playing together ----------
function tokiRoom(code) {
  try { if (window.toki && window.toki.room) window.toki.room(code); } catch (e) { /* invites are a bonus */ }
}
/** This player's name for the others; asked for the first time (or when force). Null when cancelled. */
let tokiName = null; // the name Toki gives the player
async function myName(force) {
  if (tokiName && !force) return tokiName;
  if (settings.name && !force) return settings.name;
  const v = await askText(t('mp_name'), t('mp_name_q'), settings.name || t('mp_name_def'), 16);
  if (v === null) return null;
  tokiName = null; // a name chosen here wins over Toki's
  settings.name = v || t('mp_name_def');
  saveSettings();
  return settings.name;
}
/** A "please wait" dialog. Its .off turns true if the player cancels it. */
function waitBox(key) {
  const job = { off: false };
  dialog(`<h2>${esc(t('mp_title'))}</h2><p>${esc(t(key))}</p>`, [{ label: t('b_cancel'), value: 0 }]).then((v) => { if (v !== 'auto') job.off = true; });
  return job;
}
function netError(e) {
  const why = e && (e.message === 'noroom' || e.message === 'full') ? e.message : 'net';
  dialog(`<h2>${esc(t('mp_title'))}</h2><p>${esc(t('mp_err_' + why))}</p>`, [{ label: t('ok'), cls: 'yellow', value: 1 }]);
}
/** Open a room for the park being played, or show it if it is open. */
async function shareRoom() {
  if (net.on) { openPanel('room'); return; }
  if (!playing) return;
  const name = await myName();
  if (name === null || !playing || net.on) return;
  const job = waitBox('mp_opening');
  try {
    const code = await hostRoom(name);
    if (job.off || !playing) { leaveRoom(); refreshRoom(); return; }
    closeDialog();
    tokiRoom(code); refreshRoom(); openPanel('room');
  } catch (e) { if (!job.off) netError(e); }
}
/** Join a friend's park by its room code (asked for when not given). */
async function joinFriend(code) {
  if (net.on) return;
  if (!code) {
    const v = await askText(t('mp_join'), t('mp_join_q'), '', 8, 'code-in', t('b_join'));
    if (v === null) return;
    code = cleanCode(v);
    if (code.length < 4) { netError(new Error('noroom')); return; }
  }
  const name = await myName();
  if (name === null) return;
  const job = waitBox('mp_joining');
  try {
    await joinRoom(code, name); // the park arrives in joinedPark
    if (job.off) { toMenu(); return; }
    closeDialog();
    tokiRoom(code);
  } catch (e) { if (!job.off) netError(e); }
}
/** The host's park has arrived: play our copy of it, kept in a slot of its own. */
function joinedPark(m) {
  const d = m.d, id = String(m.park || '').replace(/[^A-Za-z0-9]/g, '').replace(/^m+/, '').slice(0, 24) || 'x';
  const key = SAVE + 'm' + id, prev = load(key), keep = !!prev || parks().length < MAX_PARKS;
  if (playing) { saveGame(false); playing = false; }
  startGame(d.mode, false, scOf(d), keep ? key : null, d);
  // scores and achievements are sent for this player's own copy
  S.sentValue = prev ? prev.sentValue || 0 : 0; S.sentGuests = prev ? prev.sentGuests || 0 : 0;
  S.speed = typeof m.speed === 'number' ? m.speed : 1;
  saveGame(false);
  if (!keep) toast(t('mp_nosave'), 'bad');
  refreshRoom();
}
function roomEnded(why, guest) {
  tokiRoom(null); refreshRoom();
  if (!playing) return;
  if (!guest) { toast(t('mp_lost_host'), 'bad'); return; }
  saveGame(false);
  dialog(`<h2>${esc(t('mp_over'))}</h2><p>${esc(t(why === 'host' ? 'mp_host_left' : 'mp_lost'))}</p><p>${esc(t(curKey ? 'mp_kept' : 'mp_notkept'))}</p>`,
    [{ label: t('s_menu'), value: 0 }, { label: t('mp_keep'), cls: 'yellow', value: 1 }]).then((a) => { if (a === 0 && playing) toMenu(); });
}
async function askLeave() {
  const host = net.slot === 0;
  return (await dialog(`<h2>${esc(t('mp_title'))}</h2><p>${esc(t(host ? 'mp_close_q' : 'mp_leave_q'))}</p>`,
    [{ label: t('b_cancel'), value: 0 }, { label: t(host ? 'mp_close' : 'mp_leave'), cls: 'red', value: 1 }])) === 1;
}
setNetHooks({
  full: joinedPark,
  end: roomEnded,
  join: (m) => { if (playing) { toast(t('mp_in', m.name), 'good'); sfx('unlock'); } },
  leave: (m) => { if (playing && m.name) toast(t('mp_out', m.name)); },
  players: refreshRoom,
  parkId: () => (curKey ? curKey.slice(SAVE.length) : 'x' + Date.now().toString(36)),
});

// Coaster designs the player saved, shared by all parks (the newest eight are kept).
const KEY_DZ = 'coastr.designs';
let myDesigns = (load(KEY_DZ) || []).filter((d) => d && d.ctype && typeof d.words === 'string');

const hooks = {
  designs: () => myDesigns,
  saveDesign(d) { myDesigns = [...myDesigns.filter((q) => q.words !== d.words || q.ctype !== d.ctype), d].slice(-8); store(KEY_DZ, myDesigns); },
  delDesign(k) { myDesigns = myDesigns.filter((q, i) => i !== k); store(KEY_DZ, myDesigns); },
  music() { setMusic(!audio.music); saveSettings(); },
  sfx() { setSfx(!audio.sfx); saveSettings(); },
  lang() { setLang(lang === 'en' ? 'de' : 'en'); saveSettings(); if (playing) buildHUD(); else buildMenu(); },
  save() { saveGame(true); },
  async rename() {
    const v = await askName(S.name || t('sc_' + S.sc));
    if (v === null || !playing) return;
    S.name = v === t('sc_' + S.sc) ? '' : v;
    saveGame(false);
  },
  async tomenu() { if (net.on && !(await askLeave())) return; if (playing) toMenu(); },
  together: shareRoom,
  async leave() {
    if (!net.on || !(await askLeave()) || !net.on) return;
    if (net.slot === 0) { leaveRoom(); tokiRoom(null); refreshRoom(); closePanel(); } else toMenu();
  },
  async renameMe() { const v = await myName(true); if (v && net.on) renameMe(v); },
  month() { saveGame(false); sendScores(); },
  night() { look.night = !look.night; saveSettings(); },
  star() { saveGame(false); noteStars(); sfx('goal'); },
  achievement,
};

// ---------- loop ----------
let last = performance.now(), uiAcc = 0, saveAcc = 0, driftT = 0;
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  tuneQuality((now - last) / 1000);
  last = now;
  if (playing) {
    let sp = S.speed;
    if (!sp && ui.follow) sp = 1; // a test ride keeps running while paused
    if (sp) {
      const steps = sp >= 4 ? 2 : 1;
      for (let i = 0; i < steps; i++) tick((dt * sp) / steps);
    }
    netTick(dt);
    moveCamera(dt);
    updateFx(dt, cam.x, cam.y, view.w / cam.zoom);
    updateSounds(dt);
    render(ctx, now / 1000, ui);
    shareEvents(events);
    handleEvents();
    updateTestHud();
    uiAcc += dt; saveAcc += dt;
    if (uiAcc > 0.25) { uiAcc = 0; refreshHUD(); }
    if (saveAcc > 30) { saveAcc = 0; saveGame(false); }
  } else {
    tick(dt);
    events.length = 0;
    driftT += dt;
    cam.x += Math.cos(driftT * 0.08) * dt * 6;
    updateFx(dt, cam.x, cam.y - 60, view.w / cam.zoom);
    render(ctx, now / 1000, demoUi);
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveGame(false); sendScores(); }
  else { last = performance.now(); warmT = 1.5; }
  suspend(document.hidden);
});
window.addEventListener('pagehide', () => { saveGame(false); sendScores(); });

// ---------- go ----------
setLang(settings.lang);
audio.music = settings.music; audio.sfx = settings.sfx; look.night = settings.night !== false;
noteStars();
resize();
initUI(hooks);
buildDemo(); events.length = 0;
demoView();
buildMenu();
requestAnimationFrame(frame);
// Toki: a friend's invite opens the game with ?room=CODE; "Invite friends" before a room is open asks us to open one
const invite = cleanCode(new URLSearchParams(location.search).get('room') || '');
if (invite.length >= 4) setTimeout(() => joinFriend(invite), 300);
let tokiHooked = false;
function hookToki() {
  if (tokiHooked) return;
  try {
    if (!window.toki || !window.toki.onHost) return;
    tokiHooked = true;
    if (window.toki.onName) window.toki.onName((n) => { tokiName = n; });
    window.toki.onHost(() => {
      if (net.on) return;
      if (!playing) {
        const p = lastPark();
        if (p) startGame(p.d.mode, false, scOf(p.d), p.key);
        else if (!parksFull()) startGame('sandbox', true, 'meadows');
        else return;
      }
      shareRoom();
    });
  } catch (e) { /* invites are a bonus */ }
}
hookToki();
window.addEventListener('load', hookToki);
window.__coastr = { S, ui, cam, look, startGame, hooks, net, room, at: (x, y) => toScreen(isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5, S.h[idx(x, y)])) }; // handy for testing in the browser console
