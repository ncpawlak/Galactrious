import type { AttackPattern } from './attacks';
import type { SourceGate } from './components';

/**
 * A scheduler decides WHEN each pattern fires. `update` is called every frame while the boss may
 * fire and returns the pattern to fire now, or null. The Attacks class owns the bullets and
 * hazards and fires whatever the active scheduler returns, so schedulers know nothing about them.
 */
export interface AttackScheduler {
  /** Restart the timing (new fight, new phase). */
  reset(): void;
  update(dt: number): AttackPattern | null;
  /** Source (component id or group) of the pattern just returned by `update`; undefined = the boss itself. */
  lastSource?: string;
}

/** One step of a scripted attack set: fire `pattern`, then pause `interval` s (default: the pattern's own). */
export interface AttackStep {
  pattern: AttackPattern;
  interval?: number;
  /** Fire from this component (id or group) instead of the boss core. Skipped while it is destroyed, detached or disabled. */
  source?: string;
}

/**
 * Phase script: runs through `steps` in order, looping, after an initial `startDelay`. This is how a
 * boss phase says which attacks it uses; the default boss lists all four patterns once, in order.
 */
export class ScriptedScheduler implements AttackScheduler {
  lastSource: string | undefined;
  private index = 0;
  private timer: number;

  constructor(
    private readonly steps: AttackStep[],
    private readonly startDelay = 1,
    private readonly gate?: SourceGate,
  ) {
    this.timer = startDelay;
  }

  reset(): void {
    this.index = 0;
    this.timer = this.startDelay;
  }

  /** Index of the next step that can fire (sourceless steps always can), or -1 when none can. */
  private nextUsable(): number {
    const n = this.steps.length;
    for (let k = 0; k < n; k++) {
      const j = (this.index + k) % n;
      const src = this.steps[j].source;
      if (!src || !this.gate || this.gate.usable(src)) return j;
    }
    return -1;
  }

  update(dt: number): AttackPattern | null {
    if (this.steps.length === 0) return null;
    this.timer -= dt;
    if (this.timer > 0) {
      const j = this.gate ? this.nextUsable() : -1;
      const src = j >= 0 ? this.steps[j].source : undefined;
      if (src) this.gate!.warn(src, this.timer);
      return null;
    }
    const j = this.nextUsable();
    if (j < 0) {
      this.timer = 0.25; // every source is gone: look again shortly
      return null;
    }
    const step = this.steps[j];
    this.index = (j + 1) % this.steps.length;
    this.timer = step.interval ?? step.pattern.interval;
    this.lastSource = step.source;
    return step.pattern;
  }
}

/** Debug scheduler: all `patterns`, one after another ('cycle') or at random ('random'). */
export class DebugScheduler implements AttackScheduler {
  mode: 'cycle' | 'random' = 'cycle';
  private next = 0;
  private timer = 1;

  constructor(private readonly patterns: AttackPattern[]) {}

  reset(): void {
    this.next = 0;
    this.timer = 1;
  }

  update(dt: number): AttackPattern | null {
    this.timer -= dt;
    if (this.timer > 0) return null;
    const i = this.mode === 'random' ? Math.floor(Math.random() * this.patterns.length) : this.next;
    this.next = (i + 1) % this.patterns.length;
    this.timer = this.patterns[i].interval;
    return this.patterns[i];
  }
}
