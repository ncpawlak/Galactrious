import { bulwarkRooms } from './bulwarkRooms';
import type { BossDefinition } from './types';

/**
 * Bulwark (rooms + consoles) with hull regrowth (issue #15), the regrowth demo. Hull only: a slow trickle
 * while you shoot, and a fast mend once you have not hit the boss for 2.5 s, so pausing to dodge costs you
 * ground and spraying without commitment gets healed. Frame, rooms, craters and fragments never regrow.
 * Debug: `[U]` toggles it live, the overlay shows rate, idle timer and the regrown share.
 */
export const bulwarkRegrowth: BossDefinition = {
  ...bulwarkRooms,
  id: 'bulwark-regrowth',
  name: 'Bulwark (regrowth)',
  regrowth: { layer: 0, mode: 'both', rate: 0.0008, idleRate: 0.008, idleDelay: 2.5, maxFraction: 0.6 },
};
