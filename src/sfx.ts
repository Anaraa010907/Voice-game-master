/** Small synthesized sound effects (Web Audio) — no audio files to download. */
export type Sfx = 'roll' | 'step' | 'buy' | 'turn' | 'night' | 'morning' | 'vote' | 'death' | 'win' | 'click';

const KEY = 'night-table:sfx';
let context: AudioContext | null = null;
let enabled = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();

export const sfxEnabled = () => enabled;
export function setSfxEnabled(value: boolean) {
  enabled = value;
  try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch { /* storage may be unavailable */ }
  if (value) playSfx('click');
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
  osc.connect(gain).connect(c.destination);
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
  source.connect(filter).connect(gain).connect(c.destination);
  source.start(start);
}

export function playSfx(name: Sfx) {
  if (!enabled) return;
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
    }
  } catch { /* audio is best-effort */ }
}
