import { H, W } from '../config';
import type { Point } from '../hazards';
import type { UnitPlacement } from '../units';
import { curve } from '../waves';

/**
 * FLYBY: a movement/entrance preset for units that pass the player instead of holding a formation slot (DESIGN.md "As built:
 * Fallen Peace chapters 1-3"). A flyby unit follows a fast path across the screen, shooting (its normal attack script, only
 * while on screen), and is removed when the path ends: it left. It is not a kill, and nothing waits for it.
 *
 *  - `strafe`  enters at the top, crosses the screen diagonally downward (about 450 px/s, twice the retreat's scroll) and leaves below.
 *  - `cross`   enters at a side edge and crosses horizontally with a slight dive (about 600 px/s), leaves at the other side.
 *  - `rear`    enters below the screen and overtakes the player flying up (use the `empire-fighter-rear` unit, nose up).
 *  - `drift`   slow, straight down at about scroll speed with a gentle sway (flak batteries): they stay on screen for several seconds.
 *
 * `x` is the lane (strafe, rear, drift) or ignored (cross); `y` is the height of a cross pass; `side` picks the side it
 * enters from (strafe/rear lean toward the other side).
 */
export type FlybyPreset = 'strafe' | 'cross' | 'rear' | 'drift';

export interface FlybyRequest {
  unit: string;
  preset: FlybyPreset;
  x?: number;
  y?: number;
  side?: 'left' | 'right';
  /** Seconds from now until it appears. */
  delay?: number;
  /** Override the pass duration (s). */
  time?: number;
  tag?: string;
}

const DEFAULT_TIME: Record<FlybyPreset, number> = { strafe: 2.6, cross: 2.2, rear: 2.8, drift: 8 };

export function flybyPath(preset: FlybyPreset, x: number, y: number, side: 'left' | 'right'): (u: number) => Point {
  const s = side === 'left' ? 1 : -1; // +1: the pass moves toward the right
  switch (preset) {
    case 'strafe':
      return curve([{ x, y: -70 }, { x: x + s * 70, y: 240 }, { x: x + s * 30, y: 520 }, { x: x + s * 150, y: H + 90 }], false);
    case 'cross': {
      const x0 = s > 0 ? -60 : W + 60;
      const x1 = s > 0 ? W + 60 : -60;
      return curve([{ x: x0, y }, { x: W / 2 - s * 90, y: y + 60 }, { x: W / 2 + s * 90, y: y + 70 }, { x: x1, y: y + 150 }], false);
    }
    case 'rear':
      return curve([{ x, y: H + 80 }, { x: x - s * 70, y: 640 }, { x: x + s * 40, y: 330 }, { x: x - s * 30, y: -90 }], false);
    case 'drift':
      return (u) => ({ x: x + Math.sin(u * Math.PI * 3) * 14, y: -60 + u * (H + 140) });
  }
}

export function flybyPlacement(r: FlybyRequest): UnitPlacement {
  const side = r.side ?? 'left';
  const x = r.x ?? (side === 'left' ? 110 : W - 110);
  const y = r.y ?? 260;
  const time = r.time ?? DEFAULT_TIME[r.preset];
  const path = flybyPath(r.preset, x, y, side);
  return { slot: path(0), flyby: { path, time } };
}
