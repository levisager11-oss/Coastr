// Start-up, main menu, the game loop, saving, and the Toki hooks.
import { S, newGame, serialize, deserialize, events, parkValue, idx, previewMap } from './world.js';
import { tick, initAfterLoad } from './sim.js';
import { render, cam, view, look, isoX, isoY, toScreen, mapThumb } from './render.js';
import {
  ui, initUI, resetUI, buildHUD, refreshHUD, handleEvents, moveCamera, centerOn, toast, dialog, showHelp, updateTestHud, closePanel,
  starsHTML,
} from './ui.js';
import { SCENARIOS, SCENARIO_ORDER } from './data.js';
import { updateFx, clearFx } from './fx.js';
import { t, setLang, detectLang, lang } from './i18n.js';
import { audio, setMusic, setSfx, sfx, suspend, unlock } from './audio.js';
import { icon } from './icons.js';
import { buildDemo } from './demo.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const KEY = { settings: 'coastr.settings', progress: 'coastr.progress' };
// one saved park per scenario, plus one sandbox; the first scenario keeps the key of the original career
const saveKey = (mode, sc) => 'coastr.save.' + (mode === 'sandbox' ? 'sandbox' : sc === 'meadows' ? 'career' : sc);
let playing = false;
// shown inside another page (the game page on Toki)?
let embedded = false;
try { embedded = window.parent !== window; } catch (e) { embedded = true; }
if (embedded) document.documentElement.classList.add('embedded');
const demoUi = { ghost: null, sel: null, editing: 0, follow: 0 };

// ---------- storage ----------
function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
function load(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
const settings = Object.assign({ lang: detectLang(), music: true, sfx: true, night: true }, load(KEY.settings) || {});
function saveSettings() { store(KEY.settings, { lang, music: audio.music, sfx: audio.sfx, night: look.night }); }
function saveGame(show) {
  if (!playing) return;
  const ok = store(saveKey(S.mode, S.sc), serialize());
  if (show && ok) toast(t('saved'), 'good');
}
// Stars earned in each scenario. Kept apart from the saved parks, so starting a park again does not lose them.
const progress = Object.assign({ stars: {}, last: null, sent: {} }, load(KEY.progress) || {});
function starsOf(sc) {
  let n = progress.stars[sc] || 0;
  const d = load(saveKey('career', sc));
  if (d && d.mode === 'career') n = Math.max(n, SCENARIOS[sc].stars.filter((k) => (d.goal || 0) >= k).length);
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

// ---------- screen ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
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
function buildMenu() {
  menuSmall = view.h < 420;
  const sw = (on) => (on ? t('on') : t('off'));
  const total = totalStars(), last = progress.last;
  const lastSave = last && load(saveKey(last.mode, last.sc));
  let cards = '';
  for (const sc of SCENARIO_ORDER) {
    const SC = SCENARIOS[sc], locked = total < SC.need, has = !!load(saveKey('career', sc));
    cards += `<button class="m-sc${locked ? ' locked' : ''}" data-m="sc:${sc}"><i data-th="${sc}"></i><div><b>${t('sc_' + sc)}</b>
      <span>${locked ? icon('lock') + t('sc_need', SC.need) : t(has ? 'sc_saved' : 'scd_' + sc)}</span></div><em class="stars">${starsHTML(starsOf(sc))}</em></button>`;
  }
  const hasSandbox = !!load(saveKey('sandbox'));
  cards += `<button class="m-sc sand" data-m="sandbox"><i>${icon('wand')}</i><div><b>${t('m_sandbox')}</b><span>${t(hasSandbox ? 'sc_saved' : 'm_sandbox_desc')}</span></div></button>`;
  menuEl.innerHTML = `<div class="m-card"><div class="m-head">
    <div class="logo">Coast<i>r</i></div>
    <div class="tag">${t('tagline')}</div>
    ${embedded && view.h < 420 ? `<div class="tip">${t('tip_fullscreen')}</div>` : ''}
  </div><div class="m-list">
    ${lastSave ? `<button class="m-btn main" data-m="continue"><b>${t('m_continue')}</b><span>${last.mode === 'sandbox' ? t('m_sandbox') + ' · ' : ''}${t('sc_' + (lastSave.sc || 'meadows'))}</span></button>` : ''}
    <div class="m-scs">${cards}</div>
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
/** Ask which map a new sandbox park should use. */
function pickMap() {
  return dialog(`<h2>${t('m_sandbox')}</h2><p>${t('sandbox_map')}</p>`,
    [...SCENARIO_ORDER.map((sc) => ({ label: t('sc_' + sc), cls: 'flat', value: sc })), { label: t('b_cancel'), value: null }]);
}
menuEl.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  unlock(); sfx('click');
  const m = b.dataset.m;
  if (m === 'help') showHelp();
  else if (m === 'lang') hooks.lang();
  else if (m === 'music') { hooks.music(); buildMenu(); }
  else if (m === 'sfx') { hooks.sfx(); buildMenu(); }
  else if (m === 'continue') startGame(progress.last.mode, false, progress.last.sc);
  else if (m === 'sandbox') {
    const saved = load(saveKey('sandbox'));
    if (saved) {
      const a = await dialog(`<h2>${t('m_sandbox')}</h2><p>${t('sc_have', t('sc_' + (saved.sc || 'meadows')))}</p>`,
        [{ label: t('b_cancel'), value: 0 }, { label: t('sc_restart'), value: 2 }, { label: t('m_continue_short'), cls: 'yellow', value: 1 }]);
      if (a === 1) { startGame('sandbox', false, saved.sc); return; }
      if (a !== 2) return;
    }
    const sc = await pickMap();
    if (sc) startGame('sandbox', true, sc);
  } else if (m.startsWith('sc:')) {
    const sc = m.slice(3), SC = SCENARIOS[sc];
    if (totalStars() < SC.need) {
      dialog(`<h2>${t('sc_' + sc)}</h2><p>${t('sc_locked', SC.need, totalStars())}</p>`, [{ label: t('ok'), cls: 'yellow', value: 1 }]);
      return;
    }
    if (load(saveKey('career', sc))) {
      const a = await dialog(`<h2>${t('sc_' + sc)}</h2><p>${t('scd_' + sc)}</p><p>${t('confirm_new')}</p>`,
        [{ label: t('b_cancel'), value: 0 }, { label: t('sc_restart'), value: 2 }, { label: t('m_continue_short'), cls: 'yellow', value: 1 }]);
      if (a === 1) startGame('career', false, sc);
      else if (a === 2) startGame('career', true, sc);
    } else startGame('career', true, sc);
  }
});

/** Start or continue a park. sc = scenario id (the map); the first one is the original career. */
function startGame(mode, fresh, sc = 'meadows') {
  const saved = fresh ? null : load(saveKey(mode, sc));
  let ok = false;
  if (saved) {
    try { deserialize(saved); ok = true; } catch (e) { ok = false; }
  }
  if (!ok) newGame(mode, sc);
  initAfterLoad();
  S.speed = 1;
  events.length = 0;
  clearFx();
  playing = true;
  menuEl.hidden = true; hudEl.hidden = false;
  resetUI();
  cam.zoom = view.w < 600 ? 0.8 : 1;
  centerOn(S.ent.x + 0.5, S.ent.y - 6, S.h[idx(S.ent.x, S.ent.y - 6)] || 2);
  progress.last = { mode, sc: S.sc };
  store(KEY.progress, progress);
  saveGame(false);
}
function toMenu() {
  saveGame(false); sendScores(); noteStars();
  playing = false;
  hudEl.hidden = true; menuEl.hidden = false;
  closePanel();
  clearFx();
  buildDemo(); events.length = 0;
  demoView();
  buildMenu();
}
function demoView() { cam.zoom = view.w < 600 ? 0.75 : 1.05; centerOn(S.ent.x, S.ent.y - 12, 2); }

const hooks = {
  music() { setMusic(!audio.music); saveSettings(); },
  sfx() { setSfx(!audio.sfx); saveSettings(); },
  lang() { setLang(lang === 'en' ? 'de' : 'en'); saveSettings(); if (playing) buildHUD(); else buildMenu(); },
  save() { saveGame(true); },
  tomenu: toMenu,
  month() { saveGame(false); sendScores(); },
  night() { look.night = !look.night; saveSettings(); },
  star() { saveGame(false); noteStars(); sfx('goal'); },
  achievement,
};

// ---------- loop ----------
let last = performance.now(), uiAcc = 0, saveAcc = 0, driftT = 0;
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (playing) {
    let sp = S.speed;
    if (!sp && ui.follow) sp = 1; // a test ride keeps running while paused
    if (sp) {
      const steps = sp >= 4 ? 2 : 1;
      for (let i = 0; i < steps; i++) tick((dt * sp) / steps);
    }
    moveCamera(dt);
    updateFx(dt, cam.x, cam.y, view.w / cam.zoom);
    render(ctx, now / 1000, ui);
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
  else last = performance.now();
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
window.__coastr = { S, ui, cam, startGame, hooks, at: (x, y) => toScreen(isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5, S.h[idx(x, y)])) }; // handy for testing in the browser console
