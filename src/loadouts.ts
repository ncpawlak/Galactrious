import { saveStore } from './save';
import { DEFAULT_SHIP_ID, SHIPS, shipById, shipUnlocked, skinKey, skinUnlocked, type ShipDefinition, type ShipSkin, type WeaponLoadout } from './ships';
import { AUX_DEFS, MAIN_DEFS, WEAPON_DEFS, type WeaponDef } from './weapons';

/**
 * Weapon availability and loadout validation. A weapon is available when it has no unlock flag, its flag is set in the save
 * (`unlocks.weapons`), or it is a starting weapon of a ship that is unlocked (so owning a ship never leaves you without its guns).
 * Availability does not depend on the body: any available weapon can go on any ship (`_shipId` is kept for old callers).
 */
export function weaponAvailable(def: WeaponDef, _shipId?: string): boolean {
  if (def.stashed) return false; // stashed weapons are debug-only
  if (!def.unlock || saveStore.isUnlocked('weapons', def.unlock)) return true;
  return SHIPS.some((s) => shipUnlocked(s) && (s.startingWeapons.main === def.id || s.startingWeapons.aux.includes(def.id)));
}

/** Aux slots every body offers. */
export const auxSlotsOf = (_shipId: string): number => 3;

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
      if (ok && l.aux.length <= auxSlotsOf(ship.id)) return { shipId: ship.id, loadout: l };
    }
  }
  return { shipId: DEFAULT_SHIP_ID, loadout: defaultLoadoutFor(DEFAULT_SHIP_ID) };
}

/** A ship the player owns but has not yet looked at in the builder. */
export const isNewShip = (s: { id: string; unlock?: string }): boolean => !!s.unlock && saveStore.isUnlocked('ships', s.unlock) && !saveStore.isSeen('ships', s.id);

/** A gated weapon the player can use but has not yet looked at in the builder. */
export const isNewWeapon = (d: WeaponDef): boolean => !d.stashed && !!d.unlock && weaponAvailable(d) && !saveStore.isSeen('weapons', d.id);

/** A gated skin the player owns but has not yet looked at in the ship builder. */
export const isNewSkin = (ship: ShipDefinition, skin: ShipSkin): boolean => !!skin.unlock && skinUnlocked(skin) && !saveStore.isSeen('skins', skinKey(ship.id, skin.id));

/** Any unseen skin on this body. */
export const bodyHasNewSkin = (ship: ShipDefinition): boolean => (ship.skins ?? []).some((k) => isNewSkin(ship, k));

/** Anything NEW in the builder (title entry dot). */
export const anythingNew = (): boolean => SHIPS.some((s) => isNewShip(s) || bodyHasNewSkin(s)) || WEAPON_DEFS.some(isNewWeapon);
