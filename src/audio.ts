import { JUICE } from './config';

/** Tiny procedural sound engine (WebAudio, no assets). Starts on first user gesture. */
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private lastCarve = -1;

  /** Call from a user-gesture handler (key/pointer). */
  resume(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private ready(): AudioContext | null {
    return this.enabled && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  /** Crunchy noise tick; pitch drops and length grows with carve size. Rate-limited. */
  carve(carved: number): void {
    const c = this.ready();
    if (!c || !this.noise || carved <= 0) return;
    if (c.currentTime - this.lastCarve < JUICE.audio.minInterval) return;
    this.lastCarve = c.currentTime;
    const size = Math.min(1, carved / 80);
    const dur = 0.04 + size * 0.08;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400 - size * 1500 + Math.random() * 300;
    f.Q.value = 1.2;
    this.envelope(c, src.connect(f), dur, JUICE.audio.volume * (0.5 + size * 0.5));
    src.start(c.currentTime, Math.random() * 0.5, dur + 0.02);
  }

  /** Metallic thud when the core is struck. */
  coreHit(): void {
    const c = this.ready();
    if (!c || c.currentTime - this.lastCarve < JUICE.audio.minInterval) return;
    this.lastCarve = c.currentTime;
    this.tone(c, 140, 60, 0.12, 'triangle', JUICE.audio.volume);
  }

  explosion(): void {
    const c = this.ready();
    if (!c || !this.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.9);
    this.envelope(c, src.connect(f), 0.9, JUICE.audio.volume * 2);
    src.start(c.currentTime, 0, 1);
    this.tone(c, 90, 30, 0.7, 'sine', JUICE.audio.volume * 2);
  }

  /** Dry metallic tick when a bullet hits a component. */
  componentHit(): void {
    const c = this.ready();
    if (!c || c.currentTime - this.lastCarve < JUICE.audio.minInterval) return;
    this.lastCarve = c.currentTime;
    this.tone(c, 900 + Math.random() * 200, 420, 0.05, 'square', JUICE.audio.volume * 0.6);
  }

  /** A component crossed a damage threshold (75 / 50 / 25 %): a crack and a falling whine. */
  componentDamage(level: number): void {
    const c = this.ready();
    if (!c) return;
    this.tone(c, 500 - level * 80, 120, 0.18, 'sawtooth', JUICE.audio.volume * 0.7);
  }

  /** A component was destroyed: a pop, or a boom for an explosive one. */
  componentDestroy(blast: boolean): void {
    const c = this.ready();
    if (!c || !this.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(blast ? 1400 : 2600, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(100, c.currentTime + (blast ? 0.6 : 0.3));
    this.envelope(c, src.connect(f), blast ? 0.6 : 0.3, JUICE.audio.volume * (blast ? 1.6 : 1.1));
    src.start(c.currentTime, Math.random() * 0.4, 0.7);
    this.tone(c, blast ? 110 : 200, 40, blast ? 0.5 : 0.25, 'sine', JUICE.audio.volume * 1.4);
  }

  /** Enrage cue: a low falling growl under a rising alarm sweep. */
  enrage(): void {
    const c = this.ready();
    if (!c) return;
    this.tone(c, 220, 50, 0.9, 'sawtooth', JUICE.audio.volume * 1.3);
    this.tone(c, 330, 660, 0.35, 'square', JUICE.audio.volume * 0.7);
  }

  private tone(c: AudioContext, f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
    this.envelope(c, o, dur, vol);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  private envelope(c: AudioContext, node: AudioNode, dur: number, vol: number): void {
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    node.connect(g).connect(c.destination);
  }
}
