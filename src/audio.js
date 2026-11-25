// Tiny WebAudio synth for chiptune-ish sound effects. No asset files.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem('pg-sound') !== 'off';
    } catch {}
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem('pg-sound', on ? 'on' : 'off');
    } catch {}
  }

  tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(dur, { freq = 1200, q = 1, vol = 0.3, sweep = 0, delay = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(50, freq + sweep), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  putt(power) {
    this.hiss(0.05, { freq: 2500, q: 2, vol: 0.4 });
    this.tone(220 + power * 220, 0.08, { type: 'triangle', vol: 0.35, slide: -80 });
  }
  wall(speed) {
    const v = Math.min(1, speed / 6);
    if (v < 0.05) return;
    this.tone(160 + v * 120, 0.06, { type: 'square', vol: 0.08 + v * 0.12, slide: -60 });
  }
  bumper() {
    this.tone(520, 0.12, { type: 'square', vol: 0.15, slide: 500 });
    this.tone(780, 0.1, { type: 'triangle', vol: 0.1, delay: 0.03 });
  }
  spinner() {
    this.tone(300, 0.08, { type: 'sawtooth', vol: 0.1, slide: -150 });
  }
  sink() {
    this.tone(700, 0.08, { type: 'triangle', vol: 0.3, slide: -300 });
    this.tone(420, 0.1, { type: 'triangle', vol: 0.25, delay: 0.08, slide: -200 });
    this.tone(260, 0.15, { type: 'triangle', vol: 0.2, delay: 0.17 });
  }
  splash() {
    this.hiss(0.5, { freq: 1800, q: 0.7, vol: 0.45, sweep: -1500 });
    this.tone(500, 0.2, { type: 'sine', vol: 0.15, slide: -350 });
  }
  fanfare(good) {
    const notes = good ? [523, 659, 784, 1047] : [392, 494, 587];
    notes.forEach((n, i) => this.tone(n, 0.18, { type: 'square', vol: 0.12, delay: 0.25 + i * 0.11 }));
  }
  click() {
    this.tone(880, 0.04, { type: 'square', vol: 0.08 });
  }
}
