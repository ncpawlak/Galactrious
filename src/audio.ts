import { JUICE } from './config';

/** Tiny procedural sound engine (WebAudio, no assets). Starts on first user gesture. */
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private lastCarve = -1;
  private lastHurt = -1;

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

  /** An auto weapon fired: gauss = sharp zap, rocket = low whoosh, arc = two quick chirps; lance, blades and swarm have their own. */
  weapon(id: string): void {
    const c = this.ready();
    if (!c) return;
    const v = JUICE.audio.volume;
    if (id === 'gauss') {
      this.tone(c, 1800, 200, 0.22, 'sawtooth', v * 0.9);
      this.tone(c, 90, 60, 0.18, 'sine', v * 1.2);
    } else if (id === 'rocket') {
      this.tone(c, 180, 420, 0.3, 'triangle', v * 0.9);
      this.tone(c, 120, 60, 0.25, 'sawtooth', v * 0.5);
    } else if (id === 'lance') {
      this.tone(c, 300, 700, 0.5, 'sawtooth', v * 0.5);
    } else if (id === 'laser') {
      // Charged snap: a bright high zap over a short low thump.
      this.tone(c, 1400, 260, 0.14, 'sawtooth', v * 0.35);
      this.tone(c, 110, 70, 0.12, 'sine', v * 0.5);
    } else if (id === 'wave') {
      // Rising swell with a soft low pulse.
      this.tone(c, 220, 520, 0.4, 'sine', v * 0.8);
      this.tone(c, 330, 780, 0.34, 'triangle', v * 0.4);
    } else if (id === 'blades') {
      this.tone(c, 700, 300, 0.3, 'triangle', v * 0.6);
    } else if (id === 'mine') {
      this.tone(c, 160, 90, 0.14, 'triangle', v * 0.7);
    } else if (id === 'drone') {
      this.tone(c, 900, 1500, 0.12, 'sine', v * 0.5);
    } else if (id === 'shield') {
      this.tone(c, 300, 900, 0.3, 'sine', v * 0.7);
      this.tone(c, 600, 1200, 0.25, 'triangle', v * 0.3);
    } else if (id === 'swarm') {
      for (let i = 0; i < 3; i++) setTimeout(() => this.tone(c, 800 + i * 150, 1400, 0.06, 'square', v * 0.35), i * 45);
    } else {
      this.tone(c, 500, 900, 0.1, 'square', v * 0.5);
      setTimeout(() => this.tone(c, 650, 1100, 0.1, 'square', v * 0.5), 70);
    }
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

  /** A component was destroyed: louder, longer and deeper with the blast radius (px). */
  componentDestroy(radius: number): void {
    const c = this.ready();
    if (!c || !this.noise) return;
    const size = Math.min(2, Math.max(0.4, radius / 100));
    const dur = 0.25 + 0.4 * size;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2800 / Math.sqrt(size), c.currentTime);
    f.frequency.exponentialRampToValueAtTime(100 / Math.sqrt(size), c.currentTime + dur);
    this.envelope(c, src.connect(f), dur, JUICE.audio.volume * (0.8 + 0.7 * size));
    src.start(c.currentTime, Math.random() * 0.4, 0.7);
    this.tone(c, 210 / size, 40, 0.2 + 0.3 * size, 'sine', JUICE.audio.volume * (1 + 0.4 * size));
  }

  /** The player was hit: a low thud under a metallic crack (scrape = heavier, longer grind). Rate-limited. */
  playerHit(scrape: boolean): void {
    const c = this.ready();
    if (!c || !this.noise) return;
    if (c.currentTime - this.lastHurt < 0.12) return;
    this.lastHurt = c.currentTime;
    const v = JUICE.audio.volume;
    this.tone(c, 130, 38, 0.28, 'sine', v * 2);
    this.tone(c, 1500, 380, 0.09, 'square', v * 0.7);
    const dur = scrape ? 0.3 : 0.12;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = scrape ? 1800 : 3200;
    f.Q.value = 2.5;
    this.envelope(c, src.connect(f), dur, v * 0.9);
    src.start(c.currentTime, Math.random() * 0.5, dur + 0.02);
  }

  /** Low-hull warning beep (the caller sets the pace); quiet. */
  lowAlarm(vol: number): void {
    const c = this.ready();
    if (!c) return;
    this.tone(c, 880, 880, 0.09, 'square', JUICE.audio.volume * vol * 0.5);
  }

  /** A room's console was first exposed: a short two-beep warning. */
  roomExposed(): void {
    const c = this.ready();
    if (!c) return;
    this.tone(c, 760, 760, 0.1, 'square', JUICE.audio.volume * 0.8);
    setTimeout(() => this.tone(c, 560, 560, 0.14, 'square', JUICE.audio.volume * 0.8), 130);
  }

  /** A room went offline: a falling power-down sweep. */
  roomOffline(): void {
    const c = this.ready();
    if (!c) return;
    this.tone(c, 520, 70, 0.5, 'triangle', JUICE.audio.volume * 1.1);
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
