import { Boss, mirrorSpec } from './boss';
import { ScriptedScheduler, type AttackStep } from './attackSchedulers';
import { ComponentSystem } from './components';
import { consoleSpecs, RoomSystem } from './rooms';
import { TUNING } from './config';
import type { BossDefinition, PhaseDefinition, PhaseTrigger } from './bosses/types';
import type { Movement, Offset2 } from './movement';

/** Seconds over which the position eases between two phases' movements, so a switch never snaps. */
const BLEND_TIME = 0.6;
/** Default pause (s) before attacks resume after an enrage transition. */
export const ENRAGE_BREATHER = 1.5;
/** Length (s) of the white flash on the boss at the transition. */
export const ENRAGE_FLASH = 0.45;

/**
 * Runs one fight from a BossDefinition: owns the Boss, the current phase, the phase clocks and the
 * trigger checks, and positions the boss from the phase's movement every frame.
 */
export class BossFight {
  readonly boss: Boss;
  readonly components: ComponentSystem;
  readonly rooms: RoomSystem;
  phaseIndex = 0;
  /** Seconds since the fight started / since the current phase started. */
  fightTime = 0;
  phaseTime = 0;
  /** Debug: when false the boss is held at its anchor (movement frozen). */
  movementEnabled = true;
  /** Debug: when set, replaces the phase's movement (live, with the usual ease). */
  movementOverride: Movement | null = null;
  /** True from an enrage phase's start on (later phases keep it). */
  enraged = false;
  /** Seconds left of the transition flash (0 when idle). */
  enrageFlash = 0;
  /** Called after a phase starts (not for phase 0). */
  onPhaseChange: ((phase: PhaseDefinition, index: number) => void) | null = null;
  private blendFrom: Offset2 = { x: 0, y: 0 };
  private blendLeft = 0;
  private lastOffset: Offset2 = { x: 0, y: 0 };
  private readonly maxCoreHp: number;

  constructor(readonly def: BossDefinition) {
    this.boss = new Boss(def.mirror ? mirrorSpec(def.layout()) : def.layout(), def.spawn.x, def.spawn.y);
    this.maxCoreHp = this.boss.core.hp;
    const rooms = def.rooms ?? [];
    const specs = [...(def.components ?? []), ...consoleSpecs(rooms, this.boss.layers.length - 1)];
    this.components = new ComponentSystem(this.boss, specs, !!def.mirror);
    this.rooms = new RoomSystem(this.components, rooms);
    this.components.vulnerability = () => this.coreVulnerability();
    this.components.applyPhase(this.phase.components);
  }

  /**
   * 0..1 multiplier on core damage. Base: `coreArmor.min` (default TUNING.coreArmor.min) while the boss is
   * walled in, ramping to 1 as the layers are dug away; each destroyed `requires` component adds more.
   */
  coreVulnerability(): number {
    const ca = this.def.coreArmor;
    const ls = this.boss.layers;
    let dug = 0;
    for (let i = 0; i < ls.length; i++) dug += 1 - Math.min(1, this.boss.layerRemaining(i) / 0.95);
    dug = Math.max(0, Math.min(1, dug / ls.length));
    const min = ca?.min ?? TUNING.coreArmor.min;
    let v = min + (1 - min) * dug * (ca?.digWeight ?? 1);
    if (ca?.requires?.length) {
      // `room:<id>` keys count rooms taken offline; every other key counts destroyed components.
      const roomKeys = ca.requires.filter((k) => k.startsWith('room:'));
      const compKeys = ca.requires.filter((k) => !k.startsWith('room:'));
      const total = this.components.totalCount(compKeys) + this.rooms.totalCount(roomKeys);
      const per = ca.perComponent ?? (1 - min) / Math.max(1, total);
      v += per * (this.components.destroyedCount(compKeys) + this.rooms.offlineCount(roomKeys));
    }
    return Math.max(0, Math.min(1, v));
  }

  get phase(): PhaseDefinition {
    return this.def.phases[this.phaseIndex];
  }

  /** Scheduler for the current phase's attack set. */
  makeScheduler(): ScriptedScheduler {
    const delay = this.phase.enrage ? (this.phase.enrage.breather ?? ENRAGE_BREATHER) : (this.phase.attackDelay ?? 1);
    const mods = this.phase.components?.modifiers;
    const steps: AttackStep[] = !mods
      ? this.phase.attacks
      : this.phase.attacks.map((s) => {
          const scale = s.source ? mods.filter((m) => m.target === s.source || this.isMember(s.source!, m.target)).reduce((k, m) => k * (m.intervalScale ?? 1), 1) : 1;
          return scale === 1 ? s : { ...s, interval: (s.interval ?? s.pattern.interval) * scale };
        });
    return new ScriptedScheduler(steps, delay, this.components);
  }

  /** True when a step source `source` (id or group) names a component that the modifier `target` (id or group) also names. */
  private isMember(source: string, target: string): boolean {
    return this.components.items.some((c) => c.matches(source) && c.matches(target));
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

  /** The movement in effect: the debug override, else the phase's own. */
  get movement(): Movement {
    return this.movementOverride ?? this.phase.movement;
  }

  /** Set (or clear with null) the debug movement override; eases from the current position. */
  setMovementOverride(m: Movement | null): void {
    this.blendFrom = this.lastOffset;
    this.blendLeft = BLEND_TIME;
    this.movementOverride = m;
  }

  /** Jump to phase `i` (also used by the debug overlay). */
  enterPhase(i: number): void {
    this.blendFrom = this.lastOffset;
    this.blendLeft = BLEND_TIME;
    this.phaseIndex = i;
    this.phaseTime = 0;
    if (this.phase.enrage) {
      this.enraged = true;
      this.enrageFlash = ENRAGE_FLASH;
    } else if (this.def.phases.slice(0, i + 1).every((p) => !p.enrage)) {
      this.enraged = false;
    }
    this.components.applyPhase(this.phase.components);
    this.onPhaseChange?.(this.phase, i);
  }

  update(dt: number): void {
    this.fightTime += dt;
    this.phaseTime += dt;
    this.enrageFlash = Math.max(0, this.enrageFlash - dt);

    const next = this.def.phases[this.phaseIndex + 1];
    if (next?.trigger && this.triggered(next.trigger)) this.enterPhase(this.phaseIndex + 1);

    let off = this.movementEnabled ? this.movement.at(this.fightTime) : { x: 0, y: 0 };
    if (this.blendLeft > 0) {
      this.blendLeft = Math.max(0, this.blendLeft - dt);
      const k = this.blendLeft / BLEND_TIME;
      off = { x: off.x + (this.blendFrom.x - off.x) * k, y: off.y + (this.blendFrom.y - off.y) * k };
    }
    this.lastOffset = off;
    this.boss.setOffset(off.x, off.y);
    this.boss.update(dt);
    this.components.update(dt);
    this.rooms.update(dt);
  }
}
