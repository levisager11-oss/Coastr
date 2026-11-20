// Sound effects and a little fairground tune, all made with the Web Audio API.
let ac = null, master = null, musicGain = null, sfxGain = null;
export const audio = { music: true, sfx: true };
let timer = null, nextT = 0, step = 0;

function ensure() {
  if (ac) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = audio.music ? 0.16 : 0; musicGain.connect(master);
    sfxGain = ac.createGain(); sfxGain.gain.value = audio.sfx ? 0.5 : 0; sfxGain.connect(master);
  } catch (e) { ac = null; return false; }
  return true;
}
/** Call from a tap or click: browsers only allow sound after one. */
export function unlock() {
  if (!ensure()) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  if (!timer) startMusic();
}
export function setMusic(on) { audio.music = on; if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.16 : 0, ac.currentTime, 0.1); }
export function setSfx(on) { audio.sfx = on; if (sfxGain) sfxGain.gain.setTargetAtTime(on ? 0.5 : 0, ac.currentTime, 0.05); }
export function suspend(hidden) {
  if (!ac) return;
  if (hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {});
}

let volMul = 1; // loudness of the sound being started, set by sfx()
function tone(freq, t0, dur, type, vol, dest, slide) {
  vol *= volMul;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

const SFX = {
  click: (t) => tone(660, t, 0.06, 'triangle', 0.25, sfxGain),
  place: (t) => { tone(330, t, 0.09, 'triangle', 0.4, sfxGain, 520); tone(660, t + 0.05, 0.1, 'sine', 0.25, sfxGain); },
  path: (t) => tone(420, t, 0.05, 'triangle', 0.22, sfxGain, 500),
  remove: (t) => tone(260, t, 0.14, 'sawtooth', 0.18, sfxGain, 110),
  error: (t) => { tone(170, t, 0.12, 'square', 0.16, sfxGain); tone(140, t + 0.1, 0.16, 'square', 0.16, sfxGain); },
  cash: (t) => { tone(1320, t, 0.08, 'sine', 0.25, sfxGain); tone(1760, t + 0.07, 0.14, 'sine', 0.25, sfxGain); },
  track: (t) => { tone(520, t, 0.05, 'square', 0.12, sfxGain); tone(780, t + 0.04, 0.05, 'square', 0.1, sfxGain); },
  goal: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.1, 0.28, 'triangle', 0.32, sfxGain)),
  unlock: (t) => [659, 880, 1175].forEach((f, i) => tone(f, t + i * 0.08, 0.2, 'sine', 0.3, sfxGain)),
  whoosh: (t) => tone(180, t, 0.7, 'sawtooth', 0.07, sfxGain, 520),
  boom: (t) => { noise(t, 0.5, 0.22, 900, 160); tone(90, t, 0.35, 'sine', 0.3, sfxGain, 45); },
  clack: (t) => { tone(1900, t, 0.025, 'square', 0.05, sfxGain); tone(520, t, 0.03, 'triangle', 0.09, sfxGain); },
  // a handful of voices that rise and fall together
  scream: (t) => [0, 1, 2, 3].forEach((k) => { const f = 820 + k * 140 + Math.random() * 60; tone(f, t + k * 0.04, 0.16, 'triangle', 0.035, sfxGain, f * 1.25); tone(f * 1.25, t + 0.16 + k * 0.04, 0.5, 'triangle', 0.04, sfxGain, f * 0.8); }),
  rush: (t) => noise(t, 0.9, 0.16, 500, 2400),
  splash: (t) => { noise(t, 0.5, 0.2, 3200, 600); tone(220, t, 0.18, 'sine', 0.12, sfxGain, 90); },
  toot: (t) => { tone(784, t, 0.16, 'square', 0.05, sfxGain); tone(988, t, 0.16, 'square', 0.04, sfxGain); tone(784, t + 0.22, 0.34, 'square', 0.05, sfxGain); tone(988, t + 0.22, 0.34, 'square', 0.04, sfxGain); },
};
// a burst of filtered noise that sweeps downwards: fireworks
let noiseBuf = null;
function noise(t0, dur, vol, f0, f1) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf;
  f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(vol * volMul, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t0); src.stop(t0 + dur + 0.02);
}
let lastSfx = {};
export function sfx(name, vol = 1) {
  if (!ac || !audio.sfx || ac.state !== 'running') return;
  const now = ac.currentTime;
  if (lastSfx[name] && now - lastSfx[name] < (name === 'boom' ? 0.18 : 0.04)) return;
  lastSfx[name] = now;
  volMul = vol;
  SFX[name](now);
  volMul = 1;
}

// A simple waltz: bass on beat one, chords on two and three, and a melody on top.
const CHORDS = [[48, 64, 67], [48, 64, 67], [53, 65, 69], [53, 65, 69], [55, 67, 71], [55, 65, 71], [48, 64, 67], [55, 62, 67]];
const MELODY = [76, 0, 79, 84, 0, 79, 81, 0, 84, 77, 0, 81, 79, 0, 83, 74, 0, 77, 76, 0, 79, 74, 71, 67,
  72, 0, 76, 79, 0, 76, 77, 81, 84, 81, 0, 77, 74, 0, 79, 83, 0, 79, 84, 0, 0, 0, 0, 0];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
function schedule() {
  if (!ac || ac.state !== 'running') return;
  const beat = 0.32;
  while (nextT < ac.currentTime + 0.4) {
    if (audio.music) {
      const bar = Math.floor(step / 3) % CHORDS.length, b = step % 3, ch = CHORDS[bar];
      if (b === 0) tone(hz(ch[0] - 12), nextT, beat * 1.6, 'triangle', 0.5, musicGain);
      else { tone(hz(ch[1]), nextT, beat * 0.7, 'sine', 0.22, musicGain); tone(hz(ch[2]), nextT, beat * 0.7, 'sine', 0.22, musicGain); }
      const m = MELODY[step % MELODY.length];
      if (m) { tone(hz(m), nextT, beat * 1.5, 'square', 0.09, musicGain); tone(hz(m) * 2.005, nextT, beat * 1.2, 'sine', 0.06, musicGain); }
    }
    nextT += beat; step++;
  }
}
function startMusic() {
  nextT = ac.currentTime + 0.1;
  timer = setInterval(schedule, 120);
}
