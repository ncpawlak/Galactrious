import type { UnitDefinition } from '../units';
import { BIG_UNITS } from './big';
import { EMPIRE_UNITS } from './empire';
import { ACE_UNITS } from './empireAces';
import { MINIBOSS_UNITS } from './empireMiniBosses';
import { SMALL_UNITS } from './small';
import { EMPIRE_WAVES } from './empireWaves';
import { WAVES } from './waveContent';

export const WAVE_LIST = [...WAVES, ...EMPIRE_WAVES];

/** A harder copy of a unit: every attack pause is scaled (0.75 = a quarter faster). The id gets a "+". */
export function harder(def: UnitDefinition, scale = 0.75): UnitDefinition {
  return {
    ...def,
    id: `${def.id}+`,
    name: `${def.name}+`,
    attacks: def.attacks.map((s) => ({ ...s, interval: (s.interval ?? s.pattern.interval) * scale })),
  };
}

const BASE = [...SMALL_UNITS, ...BIG_UNITS, ...EMPIRE_UNITS, ...ACE_UNITS, ...MINIBOSS_UNITS];

/** Every unit, for the debug spawner and the wave lookup. Level 3 uses the "+" variants (the ones that shoot). */
export const UNIT_LIST: UnitDefinition[] = [...BASE, ...BASE.filter((d) => d.attacks.length > 0).map((d) => harder(d))];
export const UNITS: Record<string, UnitDefinition> = Object.fromEntries(UNIT_LIST.map((u) => [u.id, u]));

export function unitById(id: string): UnitDefinition {
  const u = UNITS[id];
  if (!u) throw new Error(`unknown unit "${id}" (known: ${Object.keys(UNITS).join(', ')})`);
  return u;
}
