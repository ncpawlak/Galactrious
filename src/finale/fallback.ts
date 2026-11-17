import type { BossSnapshot } from '../campaign/snapshot';
import { captureSnapshot } from '../campaign/snapshot';
import { BossFight } from '../bossFight';
import { capitalShip, CAPITAL_SHIP_ID, ENGINE_ROOM_ID } from '../bosses/capitalShip';
import { CAPITAL_FINALE_ID } from '../bosses/capitalShipFinale';

/**
 * Fallback snapshots: when a campaign objective restores a snapshot slot that is empty (a debug start, or a player who skipped
 * chapter 1), the level asks `fallbackSnapshot(bossId)` for a generated one, so the finale is testable on its own.
 * Add a generator here for any boss a level may restore.
 */
export const FALLBACK_SNAPSHOTS: Record<string, () => BossSnapshot> = {
  [CAPITAL_SHIP_ID]: disabledCapitalShip,
  [CAPITAL_FINALE_ID]: disabledCapitalShip, // the finale variant has the same hull and engine-room damage
};

export function fallbackSnapshot(bossId: string): BossSnapshot | null {
  return FALLBACK_SNAPSHOTS[bossId]?.() ?? null;
}

/** Clear a rectangle or disc of one layer (mask and alpha), the way carving does, without any juice. */
function clearArea(fight: BossFight, layerIndex: number, test: (x: number, y: number) => boolean): void {
  const b = fight.boss;
  const l = b.layers[layerIndex];
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const i = y * b.width + x;
      if (l.mask[i] && test(x, y)) {
        l.mask[i] = 0;
        l.img.data[i * 4 + 3] = 0;
        l.remaining--;
      }
    }
  }
  l.dirty = true;
  l.flush();
}

/**
 * The capital ship as chapter 1 leaves it, generated: a shaft dug through the hull plate to the engine room (the room itself a crater),
 * both engine consoles destroyed, the engine room offline (the ship is dead in space) and the armour untouched. The core is intact.
 */
export function disabledCapitalShip(): BossSnapshot {
  const fight = new BossFight(capitalShip);
  const ENGINE = { x: 350, y: 404 };
  // Hull plate (layer 1): a ragged shaft from the stern edge up to the engine room.
  clearArea(fight, 1, (x, y) => y > 380 && Math.abs(x - ENGINE.x) < 22 + 8 * Math.sin(y * 0.21));
  // The engine room blew up: a crater through the hull plate and the interior.
  clearArea(fight, 1, (x, y) => Math.hypot(x - ENGINE.x, y - ENGINE.y) < 62);
  clearArea(fight, 2, (x, y) => Math.hypot(x - ENGINE.x, y - ENGINE.y) < 58);
  for (const c of fight.components.items) {
    if (c.spec.group === `room:${ENGINE_ROOM_ID}` || c.spec.id.startsWith('engine')) {
      c.hp = 0;
      c.state = 'destroyed';
    }
  }
  fight.rooms.restoreState(ENGINE_ROOM_ID, true, true);
  fight.boss.version++;
  return captureSnapshot(fight);
}
