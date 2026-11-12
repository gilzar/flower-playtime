// A tiny synthesizer built on the Web Audio API. All music and sound effects are generated in code:
// no audio files, works offline. (Adapted from Flower Learns.)

export const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]; // C-major pentatonic

const P = (ratio, amp, decay) => ({ ratio, amp, decay });

const SPECS = {
  piano: { partials: [P(1, 1, 0.9), P(2, 0.45, 0.5), P(3, 0.22, 0.35), P(4, 0.1, 0.25), P(5, 0.05, 0.2)], attack: 0.004, length: 1.4 },
  // Two slightly detuned saw-like voices: the classic disco/pop synth.
  synth: { partials: [P(1, 1, 0.55), P(1.006, 0.7, 0.55), P(2, 0.5, 0.35), P(2.007, 0.35, 0.35), P(3, 0.33, 0.25), P(4, 0.24, 0.18), P(5, 0.18, 0.13), P(6, 0.12, 0.1)], attack: 0.004, length: 1.0 },
  // A sparkly glockenspiel for the worm's snacks.
  bell: { partials: [P(1, 1, 0.7), P(2.76, 0.32, 0.22), P(5.4, 0.14, 0.12), P(8.93, 0.06, 0.07)], attack: 0.002, length: 1.0 },
  // Band sounds.
  bass: { partials: [P(1, 1, 0.35), P(2, 0.55, 0.22), P(3, 0.3, 0.14), P(4, 0.12, 0.1)], attack: 0.004, length: 0.45 },
  stab: { partials: [P(1, 1, 0), P(1.006, 0.7, 0), P(2, 0.5, 0), P(3, 0.3, 0), P(4, 0.2, 0), P(5, 0.12, 0)], attack: 0.004, sustain: 0.07, release: 0.06, length: 0.25 },
  lead: { partials: [P(1, 1, 0), P(2, 0.2, 0), P(3, 0.33, 0), P(5, 0.16, 0), P(7, 0.08, 0)], attack: 0.012, sustain: 0.2, release: 0.14, length: 0.6, vibrato: 0.004 },
};

let ctx = null;
let master = null;
let musicGain = null;
let fxGain = null;
const samples = new Map(); // rendered notes as raw samples
const buffers = new Map(); // the same notes as playable buffers
const effects = {};
let drums = null;
const drumBuffers = {};
const tracks = {}; // built music loops by name
let musicName = null;
let musicSrc = null;
let musicStopTimer = null;

/** Must be called from a tap (iOS only allows sound after a user gesture). Safe to call again. */
export function unlock() {
  setSessionType('playback'); // play even when the silent switch is on
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
    fxGain = ctx.createGain();
    fxGain.gain.value = 1;
    fxGain.connect(master);
    // A silent blip fully unlocks audio on older iOS.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, 22050);
    blip.connect(ctx.destination);
    blip.start(0);
    setTimeout(prepareEffects, 30);
    // Build the music in the background, one piece at a time, so taps never stutter.
    setTimeout(() => { buildTrack('menu'); refreshMusic(); }, 400);
    setTimeout(() => buildTrack('spin'), 1800);
    setTimeout(() => buildTrack('worm'), 3000);
  }
  resume();
}

export const ready = () => !!ctx;

/** iPhone audio mode: 'playback' ignores the silent switch. */
function setSessionType(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch (e) { /* not supported */ }
}

export function resume() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}

// ---- Rendering ----

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function normalize(s, peak) {
  let m = 0;
  for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < s.length; i++) s[i] *= k; }
  return s;
}

function render(midi, spec, rate, peak = 0.45) {
  const f0 = freq(midi);
  const n = Math.floor(spec.length * rate);
  const out = new Float32Array(n);
  for (const p of spec.partials) {
    const f = f0 * p.ratio;
    if (f > rate * 0.45) continue;
    const inc = (2 * Math.PI * f) / rate;
    const step = p.decay > 0 ? Math.exp(-1 / (p.decay * rate)) : 1;
    let env = p.amp, phase = 0;
    for (let i = 0; i < n; i++) {
      if (spec.vibrato) {
        const t = i / rate;
        phase += inc * (1 + spec.vibrato * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.15));
      } else phase += inc;
      out[i] += env * Math.sin(phase);
      env *= step;
    }
  }
  const attack = Math.max(1, Math.floor(spec.attack * rate));
  const releaseStart = spec.sustain != null ? Math.floor((spec.attack + spec.sustain) * rate) : Infinity;
  const releaseStep = Math.exp(-1 / ((spec.release || 0.1) * rate));
  const fade = Math.floor(0.015 * rate);
  let rel = 1;
  for (let i = 0; i < n; i++) {
    let env = i < attack ? i / attack : 1;
    if (i > releaseStart) { rel *= releaseStep; env *= rel; }
    const left = n - i;
    if (left < fade) env *= left / fade;
    out[i] *= env;
  }
  return normalize(out, peak);
}

function toBuffer(data) {
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.copyToChannel(data, 0);
  return b;
}

function noteSamples(midi, inst) {
  const key = inst + midi;
  if (!samples.has(key)) samples.set(key, render(midi, SPECS[inst] || SPECS.piano, ctx.sampleRate));
  return samples.get(key);
}

function noteBuffer(midi, inst) {
  const key = inst + midi;
  if (!buffers.has(key)) buffers.set(key, toBuffer(noteSamples(midi, inst)));
  return buffers.get(key);
}

function playBuffer(buffer, volume = 0.9, delay = 0) {
  if (!ctx || !buffer) return;
  resume();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g);
  g.connect(fxGain);
  src.start(ctx.currentTime + Math.max(0, delay));
}

// ---- Public sounds ----

export function playNote(midi, { inst = 'piano', volume = 0.9, delay = 0 } = {}) {
  if (!ctx) return;
  playBuffer(noteBuffer(midi, inst), volume, delay);
}

/** Plays notes in a row, scheduled precisely by the audio clock. */
export function playSequence(notes, interval = 0.2, opts = {}) {
  notes.forEach((n, k) => playNote(n, { ...opts, delay: (opts.delay || 0) + k * interval }));
}

/** Plays a chord softly: a bass note plus short synth stabs. */
export function playChord(name, { volume = 1, delay = 0 } = {}) {
  const c = CHORDS[name];
  if (!c) return;
  playNote(ROOTS[name] + 12, { inst: 'bass', volume: 0.75 * volume, delay });
  c.forEach((m) => playNote(m, { inst: 'stab', volume: 0.16 * volume, delay }));
}

/** A funky little "ta-da" riff. */
export const fanfare = () => {
  [[67, 0], [67, 0.12], [70, 0.24], [72, 0.36], [67, 0.6], [72, 0.84], [76, 0.96], [79, 1.08], [84, 1.2]]
    .forEach(([m, t]) => playNote(m, { inst: 'synth', volume: 0.6, delay: t }));
};
/** Quick sparkly run, for "new best!" moments. */
export const sparkle = () => playSequence([84, 88, 91, 96], 0.07, { inst: 'bell', volume: 0.55 });
/** A friendly "wah-wah" when a round ends. Never harsh. */
export const aww = () => playSequence([67, 64, 60], 0.2, { inst: 'lead', volume: 0.5 });
export const tick = (k = 0) => playNote(SCALE[k % SCALE.length] + 12, { inst: 'bell', volume: 0.3 });
export const boop = () => playBuffer(effects.boop, 0.9);
export const pop = () => playBuffer(effects.pop, 0.8);
export const whoosh = () => playBuffer(effects.whoosh, 0.7);
export const thunk = () => playBuffer(effects.thunk, 0.9);
export const clink = () => playBuffer(effects.clink, 0.8);
export const click = () => playBuffer(effects.click, 0.5);

function noise(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967295) * 2 - 1; };
}

function prepareEffects() {
  if (!ctx || effects.boop) return;
  const rate = ctx.sampleRate;
  const make = (seconds, fn, peak) => {
    const n = Math.floor(seconds * rate), out = new Float32Array(n);
    fn(out, n);
    return toBuffer(normalize(out, peak));
  };
  // Soft "boop": friendly, never harsh.
  effects.boop = make(0.3, (out, n) => {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      ph += (2 * Math.PI * 420 * Math.pow(260 / 420, Math.min(1, t / 0.25))) / rate;
      out[i] = Math.min(1, t / 0.01) * Math.exp(-t / 0.12) * (Math.sin(ph) + 0.25 * Math.sin(2 * ph));
    }
  }, 0.32);
  // Balloon pop.
  effects.pop = make(0.16, (out, n) => {
    const rnd = noise(0x12345678);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      ph += (2 * Math.PI * 1100 * Math.pow(300 / 1100, Math.min(1, t / 0.08))) / rate;
      out[i] = rnd() * Math.exp(-t / 0.015) * 0.8 + Math.sin(ph) * Math.exp(-t / 0.045);
    }
  }, 0.5);
  // Swish of something flying.
  effects.whoosh = make(0.18, (out, n) => {
    const rnd = noise(99);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const shape = Math.sin((Math.PI * i) / n);
      y += (0.05 + 0.3 * shape) * (rnd() - y);
      out[i] = y * shape;
    }
  }, 0.2);
  // Woody "thock" of a wand sticking into the record.
  effects.thunk = make(0.14, (out, n) => {
    const rnd = noise(7);
    let ph = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      ph += (2 * Math.PI * (180 + 260 * Math.exp(-t / 0.012))) / rate;
      lp += 0.3 * (rnd() - lp);
      out[i] = Math.sin(ph) * Math.exp(-t / 0.04) + lp * Math.exp(-t / 0.006) * 1.5;
    }
  }, 0.5);
  // Bright "tink" when two wands bump.
  effects.clink = make(0.5, (out, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      out[i] = Math.exp(-t / 0.12) * (Math.sin(2 * Math.PI * 1568 * t) + 0.6 * Math.sin(2 * Math.PI * 2349 * t) + 0.3 * Math.sin(2 * Math.PI * 3951 * t));
    }
  }, 0.3);
  // Tiny tap click for buttons.
  effects.click = make(0.05, (out, n) => {
    for (let i = 0; i < n; i++) { const t = i / rate; out[i] = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t / 0.008); }
  }, 0.3);
  // Warm up the notes used most.
  SCALE.forEach((m) => { noteBuffer(m, 'piano'); noteBuffer(m + 12, 'bell'); noteBuffer(m, 'synth'); });
}

// ---- Drums and the band ----

function buildDrums() {
  if (drums) return;
  const rate = ctx.sampleRate;
  const kick = new Float32Array(Math.floor(0.35 * rate));
  { let ph = 0; const rnd = noise(3);
    for (let i = 0; i < kick.length; i++) {
      const t = i / rate;
      ph += (2 * Math.PI * (48 + 100 * Math.exp(-t / 0.035))) / rate;
      kick[i] = Math.sin(ph) * Math.exp(-t / 0.16) + rnd() * 0.25 * Math.exp(-t / 0.002);
    } }
  const clap = new Float32Array(Math.floor(0.25 * rate));
  { const rnd = noise(11); let lp = 0, prev = 0;
    for (let i = 0; i < clap.length; i++) {
      const t = i / rate;
      let env = 0;
      for (const t0 of [0, 0.011, 0.022]) if (t >= t0) env = Math.max(env, Math.exp(-(t - t0) / 0.005));
      if (t >= 0.03) env = Math.max(env, 0.6 * Math.exp(-(t - 0.03) / 0.07));
      const x = rnd(); lp += 0.45 * (x - lp); const hp = lp - prev; prev = lp;
      clap[i] = hp * env;
    } }
  const hat = new Float32Array(Math.floor(0.07 * rate));
  { const rnd = noise(29); let prev = 0;
    for (let i = 0; i < hat.length; i++) { const x = rnd(); hat[i] = (x - prev) * Math.exp(-(i / rate) / 0.018); prev = x; } }
  drums = { kick: normalize(kick, 1), clap: normalize(clap, 1), hat: normalize(hat, 1) };
}

/** Plays one drum hit ('kick' | 'clap' | 'hat') after delay seconds. Used by Piano Pop's live beat. */
export function drum(name, delay = 0, volume = 0.5) {
  if (!ctx) return;
  buildDrums();
  if (!drumBuffers[name]) drumBuffers[name] = toBuffer(drums[name]);
  playBuffer(drumBuffers[name], volume, delay);
}

const CHORDS = { C: [60, 64, 67], Dm: [62, 65, 69], Em: [59, 64, 67], F: [60, 65, 69], G: [59, 62, 67], Am: [57, 60, 64], D: [57, 62, 66], E: [56, 59, 64] };
const ROOTS = { C: 36, Dm: 38, Em: 40, F: 41, G: 43, Am: 45, D: 38, E: 40 };

/**
 * Mixes a looping pop band: four-on-the-floor kick, claps, hi-hats, a disco octave bass and offbeat
 * chord stabs, plus an optional melody [{ midi, at (beats), inst }]. The ending wraps into the start.
 */
function mixBand({ bpm, chords, melody = [], melodyGain = 0.3, drumGain = 1 }) {
  buildDrums();
  const rate = ctx.sampleRate;
  const beat = 60 / bpm;
  const beats = chords.length * 4;
  const length = Math.ceil(beats * beat * rate);
  const out = new Float32Array(length);
  const mix = (s, time, gain) => {
    const start = Math.floor(time * rate);
    for (let i = 0; i < s.length; i++) out[(start + i) % length] += s[i] * gain;
  };
  for (let b = 0; b < beats; b++) {
    const t = b * beat;
    mix(drums.kick, t, 0.55 * drumGain);
    if (b % 2 === 1) mix(drums.clap, t, 0.3 * drumGain);
    mix(drums.hat, t, 0.05 * drumGain);
    mix(drums.hat, t + beat / 2, 0.11 * drumGain);
  }
  chords.forEach((name, bar) => {
    const at = bar * 4;
    for (let e = 0; e < 8; e++) mix(noteSamples(ROOTS[name] + (e % 2 ? 12 : 0), 'bass'), (at + e / 2) * beat, e % 2 ? 0.32 : 0.45);
    for (let b = 0; b < 4; b++) CHORDS[name].forEach((m) => mix(noteSamples(m, 'stab'), (at + b + 0.5) * beat, 0.085));
  });
  for (const m of melody) mix(noteSamples(m.midi, m.inst || 'lead'), m.at * beat, melodyGain);
  return normalize(out, 0.6);
}

// ---- Music: original pop loops ----

const MENU_HOOK = [
  [76, 0], [79, 0.5], [84, 1], [79, 2], [76, 2.5], [79, 3],
  [81, 4], [79, 4.5], [76, 5], [72, 6], [74, 6.5],
  [77, 8], [81, 8.5], [84, 9], [81, 10], [77, 10.5], [81, 11],
  [83, 12], [81, 12.5], [79, 13], [74, 14], [79, 15],
  [76, 16], [79, 16.5], [84, 17], [79, 18], [76, 18.5], [79, 19],
  [81, 20], [84, 20.5], [88, 21], [84, 22], [81, 22.5],
  [77, 24], [79, 24.5], [81, 25], [84, 26],
  [83, 28], [79, 28.5], [74, 29], [79, 30], [83, 30.5],
];

const TRACKS = {
  // Menus: an upbeat 8-bar groove with a bouncy synth hook.
  menu: { bpm: 116, chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'], melody: MENU_HOOK.map(([midi, at]) => ({ midi, at })), level: 0.32 },
  // Disco Spin: a band without a tune, so her throws make the melody.
  spin: { bpm: 120, chords: ['Am', 'F', 'C', 'G'], level: 0.22 },
  // Wiggle Worm: laid-back groove; each snack plays a sparkly note on top.
  worm: { bpm: 104, chords: ['C', 'F', 'Am', 'G'], level: 0.2, drumGain: 0.8 },
};

function buildTrack(name) {
  if (!ctx || tracks[name] || !TRACKS[name]) return tracks[name];
  tracks[name] = toBuffer(mixBand(TRACKS[name]));
  return tracks[name];
}

/** Picks the background loop ('menu', 'spin', 'worm') or silence (null). */
export function music(name) {
  if (name === musicName) return;
  musicName = name;
  refreshMusic();
}

function refreshMusic() {
  if (!ctx) return;
  const want = musicName && document.visibilityState === 'visible' ? musicName : null;
  if (musicSrc && musicSrc.name === want) return;
  if (musicSrc) {
    const old = musicSrc;
    musicSrc = null;
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    setTimeout(() => { try { old.src.stop(); } catch (e) { /* already stopped */ } }, 600);
  }
  clearTimeout(musicStopTimer);
  if (!want) return;
  const buffer = buildTrack(want);
  if (!buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(TRACKS[want].level, ctx.currentTime + 0.8);
  src.connect(gain);
  gain.connect(musicGain);
  musicGain.gain.value = 1;
  src.start();
  musicSrc = { src, gain, name: want };
}

/** Call when the app is hidden or shown again. */
export function visibilityChanged() {
  if (document.hidden) suspend();
  else resume();
  refreshMusic();
}
