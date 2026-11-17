import { saveStore } from './save';
import { DEFAULT_SHIP_ID, SHIPS, shipById, shipUnlocked, type WeaponLoadout } from './ships';
import { AUX_DEFS, MAIN_DEFS, WEAPON_DEFS, type WeaponDef } from './weapons';

/**
 * Weapon availability and loadout validation. A weapon is available when it has no unlock flag, its flag is set in the save
 * (`unlocks.weapons`), or it is a starting weapon of a ship that is unlocked (so owning a ship never leaves you without its guns).
 */
export function weaponAvailable(def: WeaponDef, shipId?: string): boolean {
  if (def.stashed) return false; // stashed weapons are debug-only
  if (!def.unlock || saveStore.isUnlocked('weapons', def.unlock)) return true;
  // `shipOnly` weapons (the empire ship's) are granted by the ship to that ship alone; every other ship needs the weapon's own flag.
  if (def.shipOnly) return !!shipId && shipById(shipId).unlock !== undefined && [shipById(shipId).startingWeapons.main, ...shipById(shipId).startingWeapons.aux].includes(def.id) && shipUnlocked(shipById(shipId));
  return SHIPS.some((s) => shipUnlocked(s) && (s.startingWeapons.main === def.id || s.startingWeapons.aux.includes(def.id)));
}

/** Aux slots the ship offers (3 unless its definition says fewer). */
export const auxSlotsOf = (shipId: string): number => shipById(shipId).auxSlots ?? 3;

export function defaultLoadoutFor(shipId: string): WeaponLoadout {
  const s = shipById(shipId).startingWeapons;
  return { main: s.main, aux: [...s.aux] };
}

/** A loadout with one real main and 0..3 distinct real aux (unknown ids dropped; duplicates dropped); falls back to the ship's own when the main is unknown. */
export function cleanLoadout(l: WeaponLoadout, shipId: string, debug = false): WeaponLoadout {
  const main = MAIN_DEFS.find((d) => d.id === l.main)?.id ?? defaultLoadoutFor(shipId).main;
  const aux: string[] = [];
  for (const id of l.aux) if (AUX_DEFS.some((d) => d.id === id) && !aux.includes(id) && aux.length < (debug ? 3 : auxSlotsOf(shipId))) aux.push(id);
  return { main, aux };
}

/** The ship and loadout to preselect: the saved last choice when still valid (ship unlocked, weapons available), else the default ship's own. */
export function initialSelection(): { shipId: string; loadout: WeaponLoadout } {
  const last = saveStore.current.lastLoadout;
  if (last) {
    const ship = shipById(last.ship);
    if (ship.id === last.ship && shipUnlocked(ship)) {
      const l = cleanLoadout(last, ship.id);
      const ok = [l.main, ...l.aux].every((id) => weaponAvailable(WEAPON_DEFS.find((d) => d.id === id)!, ship.id));
      if (ok && l.aux.length === auxSlotsOf(ship.id)) return { shipId: ship.id, loadout: l };
    }
  }
  return { shipId: DEFAULT_SHIP_ID, loadout: defaultLoadoutFor(DEFAULT_SHIP_ID) };
}
