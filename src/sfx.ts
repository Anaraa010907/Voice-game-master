/** Small synthesized sound effects (Web Audio) — no audio files to download. */
export type Sfx = 'roll' | 'step' | 'buy' | 'turn' | 'night' | 'morning' | 'vote' | 'death' | 'win' | 'click' | 'reveal';

const KEY = 'night-table:sfx';
const SFX_VOLUME_KEY = 'night-table:sfx-volume';
const MUSIC_VOLUME_KEY = 'night-table:music-volume';
let context: AudioContext | null = null;

/** Stored 0–100 volume; an old on/off setting of "off" reads as 0. */
function readVolume(key: string, legacyKey: string) {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null && Number.isFinite(Number(saved))) return Math.max(0, Math.min(100, Number(saved)));
    return localStorage.getItem(legacyKey) === 'off' ? 0 : 80;
  } catch { return 80; }
}
function storeVolume(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch { /* storage may be unavailable */ }
}
/** 0–100 slider value → gain, on a curve so the low end is still fine-grained. */
const gainOf = (volume: number) => Math.pow(volume / 100, 1.6);

let sfxVolume = readVolume(SFX_VOLUME_KEY, KEY);
let sfxBus: GainNode | null = null;

export const sfxEnabled = () => sfxVolume > 0;
export const getSfxVolume = () => sfxVolume;
export function setSfxVolume(value: number) {
  sfxVolume = Math.max(0, Math.min(100, Math.round(value)));
  storeVolume(SFX_VOLUME_KEY, sfxVolume);
  if (sfxBus && context) sfxBus.gain.setTargetAtTime(gainOf(sfxVolume) * 1.25, context.currentTime, 0.02);
}
/** Kept for older callers: on restores 80, off mutes. */
export function setSfxEnabled(value: boolean) {
  setSfxVolume(value ? Math.max(sfxVolume, 80) : 0);
  if (value) playSfx('click');
}

/** Effects go through one gain node, so the volume slider scales them all. */
function effectsOut(c: AudioContext) {
  if (!sfxBus) {
    sfxBus = c.createGain();
    sfxBus.gain.value = gainOf(sfxVolume) * 1.25;
    sfxBus.connect(c.destination);
  }
  return sfxBus;
}

function ctx() {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(c: AudioContext, start: number, freq: number, length: number, type: OscillatorType = 'sine', volume = 0.18, slideTo?: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(effectsOut(c));
  osc.start(start);
  osc.stop(start + length + 0.02);
}

function noise(c: AudioContext, start: number, length: number, volume = 0.12, freq = 1800) {
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * length)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(filter).connect(gain).connect(effectsOut(c));
  source.start(start);
}

export function playSfx(name: Sfx) {
  if (sfxVolume <= 0) return;
  try {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + 0.01;
    switch (name) {
      case 'roll':
        for (let index = 0; index < 9; index += 1) noise(c, t + index * 0.07 + Math.random() * 0.02, 0.05, 0.14, 1400 + Math.random() * 1600);
        tone(c, t + 0.62, 140, 0.16, 'triangle', 0.22, 70);
        tone(c, t + 0.7, 160, 0.14, 'triangle', 0.16, 80);
        break;
      case 'step': tone(c, t, 520, 0.05, 'square', 0.05); break;
      case 'buy': tone(c, t, 988, 0.09, 'square', 0.08); tone(c, t + 0.08, 1319, 0.22, 'square', 0.08); noise(c, t, 0.06, 0.06, 5000); break;
      case 'turn': tone(c, t, 660, 0.16, 'sine', 0.16); tone(c, t + 0.14, 880, 0.26, 'sine', 0.16); break;
      case 'night': tone(c, t, 220, 0.9, 'sine', 0.16, 110); tone(c, t, 165, 0.9, 'triangle', 0.08, 82); break;
      case 'morning': [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.11, f, 0.3, 'triangle', 0.13)); break;
      case 'vote': noise(c, t, 0.05, 0.2, 500); tone(c, t, 110, 0.12, 'triangle', 0.25, 60); break;
      case 'death': tone(c, t, 180, 0.7, 'sawtooth', 0.12, 45); noise(c, t, 0.25, 0.1, 300); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.12, f, 0.4, 'triangle', 0.14)); break;
      case 'click': tone(c, t, 700, 0.04, 'sine', 0.08); break;
      case 'reveal': noise(c, t, 0.35, 0.12, 3200); tone(c, t, 330, 0.5, 'sine', 0.14, 1320); tone(c, t + 0.32, 98, 0.5, 'triangle', 0.26, 55); [659, 988].forEach((f, i) => tone(c, t + 0.35 + i * 0.09, f, 0.7, 'triangle', 0.1)); break;
    }
  } catch { /* audio is best-effort */ }
}

/* ---------- Background music: a menu theme plus a quiet generative loop per game ---------- */

export type MusicTheme = 'menu' | 'mafia' | 'monopoly';
const MUSIC_KEY = 'night-table:music';
let musicVolume = readVolume(MUSIC_VOLUME_KEY, MUSIC_KEY);
let musicOn = musicVolume > 0;
let musicBus: GainNode | null = null;
let theme: MusicTheme | null = null;
let playing: MusicTheme | null = null;
let timer: number | null = null;
let master: GainNode | null = null;
let nextBeat = 0;
let beat = 0;

export const musicEnabled = () => musicOn;
export const getMusicVolume = () => musicVolume;
/** 0 stops the music; anything else (re)starts the current theme at that loudness. */
export function setMusicVolume(value: number) {
  musicVolume = Math.max(0, Math.min(100, Math.round(value)));
  storeVolume(MUSIC_VOLUME_KEY, musicVolume);
  const wasOn = musicOn;
  musicOn = musicVolume > 0;
  if (musicBus && context) musicBus.gain.setTargetAtTime(gainOf(musicVolume) * 1.6, context.currentTime, 0.05);
  if (!musicOn) halt();
  else if (!wasOn && theme) startMusic(theme);
}
/** Kept for older callers: on restores 80, off mutes. */
export function setMusicEnabled(value: boolean) {
  setMusicVolume(value ? Math.max(musicVolume, 80) : 0);
}

// Generative loops: A minor pentatonic for the night game, D major pentatonic (a steppe-song feel) for the board game.
const SCALES: Record<'mafia' | 'monopoly', { root: number; notes: number[]; bpm: number; pad: number[] }> = {
  mafia: { root: 55, notes: [220, 261.6, 293.7, 329.6, 392, 440, 523.3], bpm: 62, pad: [110, 164.8] },
  monopoly: { root: 73.4, notes: [293.7, 329.6, 370, 440, 493.9, 587.3, 740], bpm: 84, pad: [146.8, 220] },
};

/*
 * Menu theme "Шөнийн дараа": 8 bars in D minor, Dm–B♭–F–A | Dm–B♭–Gm–A, 76 bpm, eighth-note melody.
 * 0 = rest. The loop resolves from A back to Dm so it repeats seamlessly.
 */
const N = { Cs4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, Bb4: 466.16, C5: 523.25, Cs5: 554.37, D5: 587.33, E5: 659.26, F5: 698.46 };
const MENU = {
  bpm: 76,
  melody: [
    N.A4, 0, N.D5, 0, N.F5, N.E5, N.D5, 0,
    N.D5, 0, N.C5, N.Bb4, N.A4, 0, 0, 0,
    N.F4, 0, N.A4, 0, N.C5, N.Bb4, N.A4, 0,
    N.E4, 0, N.A4, 0, N.Cs5, 0, 0, 0,
    N.A4, 0, N.D5, 0, N.F5, N.E5, N.D5, 0,
    N.F5, 0, N.E5, N.D5, N.C5, 0, N.D5, 0,
    N.Bb4, 0, N.A4, N.G4, N.A4, 0, N.Bb4, 0,
    N.A4, 0, N.G4, 0, N.E4, 0, N.Cs4, 0,
  ],
  bass: [73.42, 58.27, 87.31, 55, 73.42, 58.27, 98, 55],
  chords: [
    [146.83, 174.61, 220], [116.54, 146.83, 174.61], [174.61, 220, 261.63], [110, 138.59, 164.81],
    [146.83, 174.61, 220], [116.54, 146.83, 174.61], [98, 116.54, 146.83], [110, 138.59, 164.81],
  ],
};

function pad(c: AudioContext, out: AudioNode, start: number, freqs: number[], length: number, level = 0.5) {
  for (const freq of freqs) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(level, start + length * 0.4);
    gain.gain.linearRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

function pluck(c: AudioContext, out: AudioNode, start: number, freq: number, length: number, type: OscillatorType, level = 0.35) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

function scheduleMenu(c: AudioContext, out: AudioNode) {
  const step = 60 / MENU.bpm / 2;
  while (nextBeat < c.currentTime + 1.2) {
    const slot = beat % MENU.melody.length;
    const bar = Math.floor(slot / 8);
    const inBar = slot % 8;
    const loop = Math.floor(beat / MENU.melody.length);
    if (inBar === 0) pad(c, out, nextBeat, MENU.chords[bar], step * 8.6, 0.32);
    if (inBar === 0 || inBar === 4) pluck(c, out, nextBeat, MENU.bass[bar], step * 3.5, 'sine', 0.5);
    const note = MENU.melody[slot];
    // The first pass is the bare melody; later passes add a soft octave shimmer.
    if (note) {
      pluck(c, out, nextBeat, note, step * 2.6, 'triangle', 0.3);
      if (loop % 2 === 1) pluck(c, out, nextBeat, note * 2, step * 1.6, 'sine', 0.06);
    }
    nextBeat += step;
    beat += 1;
  }
}

function schedule() {
  const c = context;
  if (!c || !master || !playing) return;
  if (playing === 'menu') { scheduleMenu(c, master); return; }
  const cfg = SCALES[playing];
  const spb = 60 / cfg.bpm;
  while (nextBeat < c.currentTime + 1.2) {
    if (beat % 8 === 0) pad(c, master, nextBeat, cfg.pad, spb * 8.5);
    const sparse = playing === 'mafia';
    // The night game plays a few long, sparse notes; the board game a gentle walking pattern.
    if (sparse ? beat % 4 === 2 && Math.random() < 0.7 : beat % 2 === 0 || Math.random() < 0.3) {
      const note = cfg.notes[Math.floor(Math.random() * cfg.notes.length)];
      pluck(c, master, nextBeat, note, sparse ? spb * 3.2 : spb * 1.6, sparse ? 'sine' : 'triangle');
    }
    if (beat % 4 === 0) pluck(c, master, nextBeat, cfg.root, spb * 2.5, 'sine');
    nextBeat += spb;
    beat += 1;
  }
}

function halt() {
  if (timer !== null) { window.clearInterval(timer); timer = null; }
  if (master && context) {
    const old = master;
    old.gain.cancelScheduledValues(context.currentTime);
    old.gain.setTargetAtTime(0, context.currentTime, 0.25);
    window.setTimeout(() => old.disconnect(), 1200);
  }
  master = null;
  playing = null;
}

/** Plays a theme. Asking for the theme that is already playing keeps it going, so menus can switch screens freely. */
export function startMusic(next: MusicTheme) {
  theme = next;
  if (!musicOn) return;
  if (playing === next && timer !== null) { if (context?.state === 'suspended') void context.resume(); return; }
  try {
    const c = ctx();
    if (!c) return;
    halt();
    master = c.createGain();
    master.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    // A soft echo gives the plucks some room.
    const delay = c.createDelay(1);
    const feedback = c.createGain();
    const wet = c.createGain();
    delay.delayTime.value = next === 'menu' ? 60 / MENU.bpm * 0.75 : 0.42;
    feedback.gain.value = 0.28;
    wet.gain.value = 0.35;
    if (!musicBus) {
      musicBus = c.createGain();
      musicBus.gain.value = gainOf(musicVolume) * 1.6;
      musicBus.connect(c.destination);
    }
    master.connect(filter).connect(musicBus);
    master.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(filter);
    master.gain.setTargetAtTime(next === 'menu' ? 0.09 : 0.07, c.currentTime, 1.2);
    playing = next;
    nextBeat = c.currentTime + 0.1;
    beat = 0;
    timer = window.setInterval(schedule, 250);
    schedule();
  } catch { /* music is best-effort */ }
}

/** Browsers start audio only after a touch: call on any tap to wake the current theme. */
export function wakeMusic() {
  if (!musicOn || !theme) return;
  if (context?.state === 'suspended') void context.resume();
  if (playing !== theme || timer === null) startMusic(theme);
}

export function stopMusic() {
  theme = null;
  halt();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!context || !theme) return;
    if (document.hidden) void context.suspend(); else void context.resume();
  });
}
