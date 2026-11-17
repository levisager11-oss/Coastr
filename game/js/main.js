// Start-up, main menu, the game loop, saving, and the Toki hooks.
import { S, newGame, serialize, deserialize, events, parkValue } from './world.js';
import { tick, initAfterLoad } from './sim.js';
import { render, cam, view, isoX, isoY, toScreen } from './render.js';
import {
  ui, initUI, resetUI, buildHUD, refreshHUD, handleEvents, moveCamera, centerOn, toast, dialog, showHelp, updateTestHud, closePanel,
} from './ui.js';
import { t, setLang, detectLang, lang } from './i18n.js';
import { audio, setMusic, setSfx, sfx, suspend, unlock } from './audio.js';
import { icon } from './icons.js';
import { buildDemo } from './demo.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const KEY = { career: 'coastr.save.career', sandbox: 'coastr.save.sandbox', settings: 'coastr.settings' };
let playing = false;
const demoUi = { ghost: null, sel: null, editing: 0, follow: 0 };

// ---------- storage ----------
function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
function load(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
const settings = Object.assign({ lang: detectLang(), music: true, sfx: true }, load(KEY.settings) || {});
function saveSettings() { store(KEY.settings, { lang, music: audio.music, sfx: audio.sfx }); }
function saveGame(show) {
  if (!playing) return;
  const ok = store(KEY[S.mode], serialize());
  if (show && ok) toast(t('saved'), 'good');
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
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------- menu ----------
function buildMenu() {
  const hasCareer = !!load(KEY.career), hasSandbox = !!load(KEY.sandbox);
  const sw = (on) => (on ? t('on') : t('off'));
  menuEl.innerHTML = `<div class="m-card"><div class="m-head">
    <div class="logo">Coast<i>r</i></div>
    <div class="tag">${t('tagline')}</div>
  </div><div class="m-list">
    ${hasCareer ? `<button class="m-btn main" data-m="career"><b>${t('m_continue')}</b><span>${t('m_career_desc')}</span></button>
      <button class="m-btn" data-m="career-new"><b>${t('m_new_career')}</b></button>`
    : `<button class="m-btn main" data-m="career-new"><b>${t('m_new_career')}</b><span>${t('m_career_desc')}</span></button>`}
    ${hasSandbox ? `<button class="m-btn" data-m="sandbox"><b>${t('m_sandbox_cont')}</b><span>${t('m_sandbox_desc')}</span></button>
      <button class="m-btn" data-m="sandbox-new"><b>${t('m_sandbox_new')}</b></button>`
    : `<button class="m-btn" data-m="sandbox-new"><b>${t('m_sandbox')}</b><span>${t('m_sandbox_desc')}</span></button>`}
    <div class="m-row">
      <button class="btn" data-m="help">${icon('help')}${t('m_help')}</button>
      <button class="btn" data-m="lang">${icon('globe')}${t('lang_name')}</button>
    </div>
    <div class="m-row">
      <button class="btn" data-m="music">${icon('music')}${sw(audio.music)}</button>
      <button class="btn" data-m="sfx">${icon('sound')}${sw(audio.sfx)}</button>
    </div>
  </div></div>`;
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
  else {
    const [mode, fresh] = m.split('-');
    if (fresh && load(KEY[mode])) {
      const yes = await dialog(`<p>${t('confirm_new')}</p>`, [{ label: t('no'), value: 0 }, { label: t('yes'), cls: 'yellow', value: 1 }]);
      if (!yes) return;
    }
    startGame(mode, !!fresh);
  }
});

function startGame(mode, fresh) {
  const saved = fresh ? null : load(KEY[mode]);
  let ok = false;
  if (saved) {
    try { deserialize(saved); ok = true; } catch (e) { ok = false; }
  }
  if (!ok) newGame(mode);
  initAfterLoad();
  S.speed = 1;
  events.length = 0;
  playing = true;
  menuEl.hidden = true; hudEl.hidden = false;
  resetUI();
  cam.zoom = view.w < 600 ? 0.8 : 1;
  centerOn(S.ent.x + 0.5, S.ent.y - 6, S.h[S.ent.x + (S.ent.y - 6) * 40] || 2);
  saveGame(false);
}
function toMenu() {
  saveGame(false); sendScores();
  playing = false;
  hudEl.hidden = true; menuEl.hidden = false;
  closePanel();
  buildDemo(); events.length = 0;
  demoView();
  buildMenu();
}
function demoView() { cam.zoom = view.w < 600 ? 0.75 : 1.05; centerOn(20, 27, 2); }

const hooks = {
  music() { setMusic(!audio.music); saveSettings(); },
  sfx() { setSfx(!audio.sfx); saveSettings(); },
  lang() { setLang(lang === 'en' ? 'de' : 'en'); saveSettings(); if (playing) buildHUD(); else buildMenu(); },
  save() { saveGame(true); },
  tomenu: toMenu,
  month() { saveGame(false); sendScores(); },
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
audio.music = settings.music; audio.sfx = settings.sfx;
resize();
initUI(hooks);
buildDemo(); events.length = 0;
demoView();
buildMenu();
requestAnimationFrame(frame);
window.__coastr = { S, ui, cam, startGame, hooks, at: (x, y) => toScreen(isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5, S.h[x + y * 40])) }; // handy for testing in the browser console
