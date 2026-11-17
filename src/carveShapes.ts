import { TUNING } from './config';

/** Pixel offsets around an impact point, sorted by (jittered) distance so holes get ragged edges. */
export interface Offset {
  dx: number;
  dy: number;
  d: number;
}

/**
 * Carve shape of a bullet hit: an ellipse elongated along the bullet's direction (straight up). Lateral and
 * backward offsets cost `lateralPenalty` / `backPenalty` times more, so energy digs a tunnel forward
 * instead of widening a crater. `reach` is the max forward depth in px. lateral = back = 1 is a round crater.
 */
export interface CarveShape {
  lateralPenalty: number;
  backPenalty: number;
  reach: number;
}

/** Named shapes. `default` is the base gun (TUNING.carve); the others belong to the weapons (src/weapons.ts). */
export const CARVE_SHAPES = {
  default: TUNING.carve as CarveShape,
  /** Gauss cannon: a long shaft, a bit thicker than a gun hit. */
  narrow: { lateralPenalty: 3.4, backPenalty: 2.5, reach: 100 } as CarveShape,
  /** Gauss width upgrade tiers (src/upgrades/stats.ts `GAUSS_SHAPES`): the same shaft, progressively wider. */
  narrow1: { lateralPenalty: 2.8, backPenalty: 2.5, reach: 100 } as CarveShape,
  narrow2: { lateralPenalty: 2.3, backPenalty: 2.5, reach: 100 } as CarveShape,
  narrow3: { lateralPenalty: 1.9, backPenalty: 2.5, reach: 100 } as CarveShape,
  /** Burn embers (src/tags.ts): a small round bite, bigger with more burn stacks. */
  ember1: { lateralPenalty: 1, backPenalty: 1, reach: 8 } as CarveShape,
  ember2: { lateralPenalty: 1, backPenalty: 1, reach: 11 } as CarveShape,
  ember3: { lateralPenalty: 1, backPenalty: 1, reach: 14 } as CarveShape,
  /** Needler main gun: a thin, deepish tunnel. */
  needle: { lateralPenalty: 2.6, backPenalty: 2.5, reach: 70 } as CarveShape,
  /** Swarm missile: a small round bite. */
  swarm: { lateralPenalty: 1.2, backPenalty: 1.2, reach: 22 } as CarveShape,
  /** Arc missile: a round, medium crater whatever direction it arrives from. */
  round: { lateralPenalty: 1, backPenalty: 1, reach: 24 } as CarveShape,
};
export type CarveShapeName = keyof typeof CARVE_SHAPES;

const TABLE_COUNT = 8;
const cache = new Map<CarveShapeName, Offset[][]>();

function buildTable(s: CarveShape): Offset[] {
  const reachX = Math.ceil(s.reach / s.lateralPenalty);
  const items: (Offset & { k: number })[] = [];
  for (let dy = -s.reach; dy <= s.reach; dy++) {
    for (let dx = -reachX; dx <= reachX; dx++) {
      const back = dy > 0 ? s.backPenalty : 1;
      const d = Math.hypot(dx * s.lateralPenalty, dy * back);
      if (d <= s.reach) items.push({ dx, dy, d, k: d + Math.random() * 2.5 });
    }
  }
  items.sort((a, b) => a.k - b.k);
  return items;
}

/** A few pre-jittered tables per shape (built on first use); pick one at random per hit. */
export function carveTable(shape: CarveShapeName): Offset[] {
  let t = cache.get(shape);
  if (!t) {
    t = Array.from({ length: TABLE_COUNT }, () => buildTable(CARVE_SHAPES[shape]));
    cache.set(shape, t);
  }
  return t[(Math.random() * TABLE_COUNT) | 0];
}
