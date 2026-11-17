import { BossFight } from '../bossFight';
import { capitalShip, ENGINE_ROOM_ID } from '../bosses/capitalShip';
import { diffSnapshot, restoreSnapshot } from '../campaign/snapshot';
import { disabledCapitalShip } from './fallback';
import { shipHasEmpireTech } from './system';

/**
 * The finale's checks, runnable in the browser (`game.debug.finale.selfTest()`; the project has no test runner). Each entry is a boolean
 * (true = pass) plus the numbers behind it:
 *  - `empireTech`: only the empire fighter has the flag (Vanguard, Delta Rookie, Warden, Wisp do not);
 *  - `armour`: a shot at the armour is blocked until the gate opens it, the gate opens it for `empireTech` ships only;
 *  - `fallback`: the generated disabled ship restores with 0 diffs, engine room destroyed, engines dead, armour untouched.
 */
export function finaleSelfTest() {
  const tech = Object.fromEntries(['empire-fighter', 'vanguard', 'delta-rookie', 'warden', 'wisp'].map((id) => [id, shipHasEmpireTech(id)]));

  const armourAfter = (shipId: string) => {
    const f = new BossFight(capitalShip);
    f.update(0);
    const b = f.boss;
    const x = b.x + 120;
    const y = b.y + 300; // armour plating, off the notch
    const before = b.hit(x, y, 400, 'default');
    if (shipHasEmpireTech(shipId)) f.armourCarvable = true; // exactly what the `armourResonance` beat does
    const after = b.hit(x, y, 400, 'default');
    return { blockedBefore: !!before?.blocked, carvedAfter: !!after && !after.blocked && after.carved > 0 };
  };
  const withTech = armourAfter('empire-fighter');
  const without = armourAfter('delta-rookie');

  const snap = disabledCapitalShip();
  const fresh = new BossFight(capitalShip);
  restoreSnapshot(fresh, JSON.parse(JSON.stringify(snap)));
  const diffs = diffSnapshot(fresh, snap);
  const armourIntact = fresh.boss.layers[0].remaining === fresh.boss.layers[0].total;
  const engineDown = fresh.rooms.destroyed(ENGINE_ROOM_ID) || (fresh.rooms.find(ENGINE_ROOM_ID)?.offline ?? false);
  const original = new BossFight(capitalShip);

  return {
    ok:
      tech['empire-fighter'] &&
      !tech['vanguard'] &&
      !tech['delta-rookie'] &&
      withTech.blockedBefore &&
      withTech.carvedAfter &&
      without.blockedBefore &&
      !without.carvedAfter &&
      diffs.length === 0 &&
      armourIntact &&
      engineDown,
    empireTech: tech,
    armour: { withEmpireTech: withTech, withoutEmpireTech: without },
    fallback: { diffs, armourIntact, engineDown, hullAndInteriorCarved: fresh.boss.layers.slice(1).map((l, i) => l.remaining < original.boss.layers[i + 1].total) },
  };
}
