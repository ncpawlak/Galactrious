import type { AttackPattern } from './attacks';

/**
 * A scheduler decides WHEN each pattern fires. `update` is called every frame while the boss may
 * fire and returns the pattern to fire now, or null. The Attacks class owns the bullets and
 * hazards and fires whatever the active scheduler returns, so schedulers know nothing about them.
 */
export interface AttackScheduler {
  /** Restart the timing (new fight, new phase). */
  reset(): void;
  update(dt: number): AttackPattern | null;
}

/** One step of a scripted attack set: fire `pattern`, then pause `interval` s (default: the pattern's own). */
export interface AttackStep {
  pattern: AttackPattern;
  interval?: number;
}

/**
 * Phase script: runs through `steps` in order, looping, after an initial `startDelay`. This is how a
 * boss phase says which attacks it uses; the default boss lists all four patterns once, in order.
 */
export class ScriptedScheduler implements AttackScheduler {
  private index = 0;
  private timer: number;

  constructor(
    private readonly steps: AttackStep[],
    private readonly startDelay = 1,
  ) {
    this.timer = startDelay;
  }

  reset(): void {
    this.index = 0;
    this.timer = this.startDelay;
  }

  update(dt: number): AttackPattern | null {
    if (this.steps.length === 0) return null;
    this.timer -= dt;
    if (this.timer > 0) return null;
    const step = this.steps[this.index];
    this.index = (this.index + 1) % this.steps.length;
    this.timer = step.interval ?? step.pattern.interval;
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
