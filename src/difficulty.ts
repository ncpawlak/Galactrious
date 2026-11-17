import type { BossSpec } from './boss';
import type { BossDefinition } from './bosses/types';
import type { UnitDefinition } from './units';

/**
 * Enemy scaling for a run (Conquest: `RunDefinition.enemyScale`, the per-map table in src/conquest/empireBase.ts). `hp` multiplies unit hull density
 * and core HP (more bullets to dig through); `fire` multiplies their fire rate (attack timers run that much faster). `bossHp` / `bossFire` are the
 * same for the map boss. 1 = as authored.
 */
export interface EnemyScale {
  hp: number;
  fire: number;
  bossHp: number;
  bossFire: number;
}

export const NO_SCALE: EnemyScale = { hp: 1, fire: 1, bossHp: 1, bossFire: 1 };

/** A copy of a layout with hull density and core HP multiplied by `k`. */
export function scaleSpec(spec: BossSpec, k: number): BossSpec {
  if (k === 1) return spec;
  return { ...spec, layers: spec.layers.map((l) => (l.indestructible ? l : { ...l, density: l.density * k })), core: { ...spec.core, hp: spec.core.hp * k } };
}

/** A unit that takes `k` times the damage to kill (ground structures are left alone). */
export function scaleUnit(def: UnitDefinition, k: number): UnitDefinition {
  if (k === 1 || def.ground) return def;
  return { ...def, layout: () => scaleSpec(def.layout(), k) };
}

/** A boss with `hp` times the hull and core, and every attack interval divided by `fire`. */
export function scaleBoss(def: BossDefinition, hp: number, fire: number): BossDefinition {
  if (hp === 1 && fire === 1) return def;
  return {
    ...def,
    layout: () => scaleSpec(def.layout(), hp),
    phases: def.phases.map((p) => (fire === 1 ? p : { ...p, attacks: p.attacks.map((s) => ({ ...s, interval: (s.interval ?? s.pattern.interval) / fire })) })),
  };
}
