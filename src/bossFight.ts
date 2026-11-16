import { Boss } from './boss';
import { ScriptedScheduler } from './attackSchedulers';
import type { BossDefinition, PhaseDefinition, PhaseTrigger } from './bosses/types';
import type { Offset2 } from './movement';

/** Seconds over which the position eases between two phases' movements, so a switch never snaps. */
const BLEND_TIME = 0.6;

/**
 * Runs one fight from a BossDefinition: owns the Boss, the current phase, the phase clocks and the
 * trigger checks, and positions the boss from the phase's movement every frame.
 */
export class BossFight {
  readonly boss: Boss;
  phaseIndex = 0;
  /** Seconds since the fight started / since the current phase started. */
  fightTime = 0;
  phaseTime = 0;
  /** Debug: when false the boss is held at its anchor (movement frozen). */
  movementEnabled = true;
  /** Called after a phase starts (not for phase 0). */
  onPhaseChange: ((phase: PhaseDefinition, index: number) => void) | null = null;
  private blendFrom: Offset2 = { x: 0, y: 0 };
  private blendLeft = 0;
  private lastOffset: Offset2 = { x: 0, y: 0 };
  private readonly maxCoreHp: number;

  constructor(readonly def: BossDefinition) {
    this.boss = new Boss(def.layout(), def.spawn.x, def.spawn.y);
    this.maxCoreHp = this.boss.core.hp;
  }

  get phase(): PhaseDefinition {
    return this.def.phases[this.phaseIndex];
  }

  /** Scheduler for the current phase's attack set. */
  makeScheduler(): ScriptedScheduler {
    return new ScriptedScheduler(this.phase.attacks, this.phase.attackDelay ?? 1);
  }

  /** Share of all layer pixels carved or broken away, 0..100. */
  get pixelDamagePercent(): number {
    let total = 0;
    let left = 0;
    for (const l of this.boss.layers) {
      total += l.total;
      left += l.remaining;
    }
    return total === 0 ? 0 : (1 - left / total) * 100;
  }

  /** Share of core HP lost, 0..100. */
  get coreDamagePercent(): number {
    return this.maxCoreHp === 0 ? 0 : (1 - Math.max(0, this.boss.core.hp) / this.maxCoreHp) * 100;
  }

  /** The trigger that would start the next phase, or null in the last phase. */
  get nextTrigger(): PhaseTrigger | null {
    return this.def.phases[this.phaseIndex + 1]?.trigger ?? null;
  }

  /** Progress text for the debug overlay, e.g. "pixels 12.3% / 15%". */
  describeNext(): string {
    const t = this.nextTrigger;
    if (!t) return this.def.phases[this.phaseIndex + 1] ? 'no trigger' : 'last phase';
    switch (t.kind) {
      case 'damage':
        return t.metric === 'core'
          ? `core dmg ${this.coreDamagePercent.toFixed(1)}% / ${t.percent}%`
          : `pixel dmg ${this.pixelDamagePercent.toFixed(1)}% / ${t.percent}%`;
      case 'fightTime':
        return `fight ${this.fightTime.toFixed(1)}s / ${t.seconds}s`;
      case 'phaseTime':
        return `in phase ${this.phaseTime.toFixed(1)}s / ${t.seconds}s`;
    }
  }

  private triggered(t: PhaseTrigger): boolean {
    switch (t.kind) {
      case 'damage':
        return (t.metric === 'core' ? this.coreDamagePercent : this.pixelDamagePercent) >= t.percent;
      case 'fightTime':
        return this.fightTime >= t.seconds;
      case 'phaseTime':
        return this.phaseTime >= t.seconds;
    }
  }

  /** Jump to phase `i` (also used by the debug overlay). */
  enterPhase(i: number): void {
    this.blendFrom = this.lastOffset;
    this.blendLeft = BLEND_TIME;
    this.phaseIndex = i;
    this.phaseTime = 0;
    this.onPhaseChange?.(this.phase, i);
  }

  update(dt: number): void {
    this.fightTime += dt;
    this.phaseTime += dt;

    const next = this.def.phases[this.phaseIndex + 1];
    if (next?.trigger && this.triggered(next.trigger)) this.enterPhase(this.phaseIndex + 1);

    let off = this.movementEnabled ? this.phase.movement.at(this.fightTime) : { x: 0, y: 0 };
    if (this.blendLeft > 0) {
      this.blendLeft = Math.max(0, this.blendLeft - dt);
      const k = this.blendLeft / BLEND_TIME;
      off = { x: off.x + (this.blendFrom.x - off.x) * k, y: off.y + (this.blendFrom.y - off.y) * k };
    }
    this.lastOffset = off;
    this.boss.setOffset(off.x, off.y);
    this.boss.update(dt);
  }
}
