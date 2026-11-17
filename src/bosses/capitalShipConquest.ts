import { capitalShipFinale } from './capitalShipFinale';
import type { BossDefinition } from './types';

/**
 * The Conquest final boss (Empire Base): the chapter 7 capital ship (same hull, shield projector and weapons control rooms, six gun housings,
 * core that needs both rooms down) with the armour carvable from the start (no empire tech in a Conquest loadout) and thinner than in the campaign,
 * because the campaign tuned it for a ship with the squad's help. `ARMOUR_SCALE` is the one tuning knob (1 = the campaign's armour density).
 * The campaign definitions are untouched; this wraps `capitalShipFinale`.
 */
export const CAPITAL_CONQUEST_ID = 'capital-ship-conquest';
export const ARMOUR_SCALE = 0.5;

export const capitalShipConquest: BossDefinition = {
  ...capitalShipFinale,
  id: CAPITAL_CONQUEST_ID,
  name: 'Capital ship',
  armourCarvable: true,
  layout: () => {
    const spec = capitalShipFinale.layout();
    const layers = spec.layers.map((l, i) => (i === 0 ? { ...l, density: l.density * ARMOUR_SCALE } : l));
    return { ...spec, layers };
  },
};
