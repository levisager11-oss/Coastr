// Short-lived eye candy: dust puffs, sparkles, floating numbers, confetti, fireworks, rain and snow.
// Nothing in here changes the game; it only draws.
import { S } from './world.js';

const parts = []; // world space: {x, y, vx, vy, g, life, max, r, col, glow, grow}
const floats = []; // world space: {x, y, text, col, life}
const shells = []; // fireworks on their way up
const conf = []; // screen space confetti
let wet = 0, snowy = 0, showT = 0, clock = 0;
export const fxHooks = { bang: null };

const rnd = (a, b) => a + Math.random() * (b - a);
const COLS = ['#ef476f', '#ffd23f', '#06d6a0', '#3b8ed0', '#9b5de5', '#f78c1f', '#ff70a6', '#ffffff'];

/** A puff at a spot in the world (iso pixels). kind: dust, spark, splash, star. */
export function burst(x, y, kind = 'dust', n = 10) {
  if (parts.length > 900) return;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.283), sp = kind === 'dust' ? rnd(10, 46) : rnd(30, 110);
    if (kind === 'dust') {
      parts.push({ x: x + rnd(-10, 10), y: y + rnd(-4, 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.45 - 14, g: -10, life: 0, max: rnd(0.4, 0.8), r: rnd(3, 6), col: '#ffffff', grow: 9, a: 0.5 });
    } else if (kind === 'splash') {
      parts.push({ x, y, vx: Math.cos(a) * sp * 0.5, vy: -rnd(40, 110), g: 320, life: 0, max: rnd(0.4, 0.7), r: rnd(1.4, 2.6), col: '#dff4ff', grow: 0, a: 0.9 });
    } else {
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 160, life: 0, max: rnd(0.5, 1), r: rnd(1.6, 3), col: kind === 'star' ? '#ffd23f' : COLS[(Math.random() * COLS.length) | 0], grow: 0, a: 1, glow: kind === 'star' });
    }
  }
}
/** A number or word that floats up from a spot and fades. */
export function floatText(x, y, text, col = '#05805f') {
  if (floats.length > 40) floats.shift();
  floats.push({ x, y, text, col, life: 0 });
}
/** Confetti over the whole screen, for goals and finished coasters. */
export function confetti(w, h, n = 90) {
  for (let i = 0; i < n && conf.length < 400; i++) {
    conf.push({ x: rnd(0, w), y: rnd(-h * 0.3, -10), vx: rnd(-40, 40), vy: rnd(120, 300), rot: rnd(0, 6.3), vr: rnd(-8, 8), life: 0, max: rnd(1.8, 3), col: COLS[(Math.random() * 7) | 0], s: rnd(5, 9) });
  }
}

function launch(cx, cy, span) {
  const x = cx + rnd(-span, span) * 0.42, y = cy + rnd(0, 0.15) * span;
  shells.push({ x, y, vy: -rnd(270, 370), life: 0, fuse: rnd(0.75, 1.05), col: COLS[(Math.random() * 7) | 0] });
}
function explode(s) {
  const n = 46, ring = Math.random() < 0.4, c2 = COLS[(Math.random() * 7) | 0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rnd(0, 0.2), sp = ring ? 150 : rnd(40, 170);
    parts.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, g: 60, drag: 1.6, life: 0, max: rnd(0.9, 1.5), r: rnd(1.8, 2.8), col: i % 3 ? s.col : c2, grow: 0, a: 1, glow: true });
  }
  if (fxHooks.bang) fxHooks.bang();
}

/** dt is real time. cx, cy = middle of the view in world pixels, span = its width in world pixels. */
export function updateFx(dt, cx, cy, span) {
  clock += dt;
  const k = S.wx ? S.wx.kind : 'sun';
  wet += ((k === 'rain' ? 1 : 0) - wet) * Math.min(1, dt * 0.8);
  snowy += ((k === 'snow' ? 1 : 0) - snowy) * Math.min(1, dt * 0.8);
  if (S.fw > 0) {
    showT -= dt;
    if (showT <= 0) { showT = rnd(0.25, 0.7); launch(cx, cy, span); }
  }
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.life += dt; s.y += s.vy * dt; s.vy += 160 * dt;
    if (s.life >= s.fuse) { explode(s); shells.splice(i, 1); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life >= p.max) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.grow * dt;
  }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].life += dt; if (floats[i].life > 1.4) floats.splice(i, 1); }
  for (let i = conf.length - 1; i >= 0; i--) {
    const c = conf[i];
    c.life += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.vx += Math.sin(c.life * 5 + c.s) * 60 * dt;
    if (c.life > c.max) { conf[i] = conf[conf.length - 1]; conf.pop(); }
  }
}
export const fxWet = () => wet;
export const fxSnow = () => snowy;

/** Things that live in the world: call with the camera transform set. */
export function drawFxWorld(ctx, zoom) {
  for (const p of parts) {
    if (p.glow) continue;
    ctx.globalAlpha = p.a * (1 - p.life / p.max);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (floats.length) {
    const s = 1 / Math.max(0.7, zoom);
    ctx.font = `800 ${13 * s}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of floats) {
      const k = f.life / 1.4, y = f.y - (10 + 34 * (1 - (1 - k) * (1 - k))) * s;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.lineWidth = 3.5 * s; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
/** Glowing things, drawn after the night shade so they stay bright. */
export function drawFxGlow(ctx) {
  if (!shells.length && !parts.some((p) => p.glow)) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const s of shells) {
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.2, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,160,0.25)';
    ctx.fillRect(s.x - 1, s.y, 2, 16);
  }
  for (const p of parts) {
    if (!p.glow) continue;
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = a; ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
    ctx.globalAlpha = a * 0.25;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
/** Rain, snow and confetti: call with a plain screen transform. */
export function drawFxScreen(ctx, w, h) {
  if (wet > 0.02) {
    const n = Math.round(Math.min(160, (w * h) / 5200) * wet);
    ctx.strokeStyle = `rgba(215,235,255,${0.5 * wet})`; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 620 + (i % 7) * 60, x0 = (i * 97.3) % (w + 80) - 40;
      const y = ((clock * sp + i * 131.7) % (h + 40)) - 20, x = x0 - (y / h) * 60;
      ctx.moveTo(x, y); ctx.lineTo(x - 3.2, y + 13);
    }
    ctx.stroke();
  }
  if (snowy > 0.02) {
    const n = Math.round(Math.min(150, (w * h) / 5600) * snowy);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * snowy})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 38 + (i % 5) * 14, r = 1.2 + (i % 3) * 0.7;
      const y = ((clock * sp + i * 71.3) % (h + 20)) - 10;
      const x = ((i * 53.7 + Math.sin(clock * 0.8 + i) * 18) % (w + 40) + w + 40) % (w + 40) - 20;
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.3);
    }
    ctx.fill();
  }
  for (const c of conf) {
    ctx.globalAlpha = Math.min(1, (c.max - c.life) * 2);
    ctx.fillStyle = c.col;
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot), a = c.s * 0.5, b = c.s * 0.28 * Math.cos(c.life * 9 + c.s);
    ctx.beginPath();
    ctx.moveTo(c.x - a * cs + b * sn, c.y - a * sn - b * cs); ctx.lineTo(c.x + a * cs + b * sn, c.y + a * sn - b * cs);
    ctx.lineTo(c.x + a * cs - b * sn, c.y + a * sn + b * cs); ctx.lineTo(c.x - a * cs - b * sn, c.y - a * sn + b * cs);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
export function clearFx() { parts.length = 0; floats.length = 0; shells.length = 0; conf.length = 0; }
