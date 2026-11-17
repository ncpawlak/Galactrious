import type { BossSpec } from '../boss';
import { TUNING } from '../config';
import { aimedShot, bomb, directVolley, lineSweep } from '../attacks';
import { lowered, sway, zip, ZIP_FAST, ZIP_NORMAL } from '../movement';
import type { AttackStep } from '../attackSchedulers';
import type { AttackPattern } from '../attacks';
import type { ComponentSpec } from '../components';
import type { BossDefinition } from './types';
import { crisp, makeCanvas, shade } from './paint';

/**
 * Bulwark: a wide manta/arrowhead gunship, 420 x 330, painted from shapes.
 *  - Hull (bronze): the manta silhouette, swept wings, a notch at the nose. Cheap to carve.
 *  - Frame (graphite blue): an outer armour ring hugging the hull edge, an inner bulkhead ring around
 *    the reactor, and four diagonal spokes joining them. The gaps between the spokes leave hull
 *    directly over the rooms, so there are open lanes to the gun bays and the hangar.
 *  - Rooms (rust red): left and right gun bays in the wings, the reactor (holds the core) and a
 *    lower hangar.
 * Palette avoids violet, magenta, lime and cyan so enemy and player bullets stay readable.
 */

const BW = 420;
const BH = 330;
const CX = BW / 2;
const CORE = { x: CX, y: 165 };

/** Right half of the silhouette as (distance from centre line, y), nose notch to tail tip. */
const HALF: [number, number][] = [
  [0, 36], [20, 8], [46, 14], [72, 40], [140, 78], [206, 138], [204, 150], [150, 172],
  [104, 186], [74, 226], [44, 280], [22, 322], [8, 330], [0, 322],
];

function hullPath(): Path2D {
  const p = new Path2D();
  const pts = [...HALF.map(([d, y]) => [CX + d, y]), ...[...HALF].reverse().map(([d, y]) => [CX - d, y])];
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Layers are densities for THIS boss; the global TUNING pacing numbers stay as they are. */
export const BULWARK_TUNING = {
  densities: { hull: 6, frame: 4.2, rooms: 0.8 },
  coreHp: 1500,
};

export function createBulwark(): BossSpec {
  const hullClip = hullPath();

  // Layer 1: hull. Bronze/sand with a darker spine and wing panel lines.
  const hull = makeCanvas(BW, BH);
  hull.ctx.fillStyle = '#b98a4e';
  hull.ctx.fill(hullClip);
  hull.ctx.save();
  hull.ctx.clip(hullClip);
  hull.ctx.strokeStyle = '#8a6330';
  hull.ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    hull.ctx.beginPath();
    hull.ctx.moveTo(CX + s * 30, 30);
    hull.ctx.lineTo(CX + s * 120, 96);
    hull.ctx.lineTo(CX + s * 190, 140);
    hull.ctx.moveTo(CX + s * 40, 200);
    hull.ctx.lineTo(CX + s * 150, 160);
    hull.ctx.stroke();
  }
  hull.ctx.fillStyle = '#d6b27a';
  hull.ctx.fillRect(CX - 6, 40, 12, 90);
  hull.ctx.restore();
  crisp(hull.ctx);
  shade(hull.ctx, { noise: 0.14, edge: 0.7, seamEvery: 60 });

  // Layer 2: frame. Outer ring (band along the hull edge), inner bulkhead ring, four diagonal spokes.
  const frame = makeCanvas(BW, BH);
  const f = frame.ctx;
  f.save();
  f.clip(hullClip);
  f.strokeStyle = '#4a5670';
  f.lineWidth = 28; // 14 px inside the edge (the outside half is clipped away)
  f.lineJoin = 'round';
  f.stroke(hullClip);
  f.lineWidth = 14;
  f.beginPath();
  f.arc(CORE.x, CORE.y, 62, 0, Math.PI * 2);
  f.stroke();
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    f.beginPath();
    f.moveTo(CORE.x + sx * 60 * Math.SQRT1_2, CORE.y + sy * 60 * Math.SQRT1_2);
    f.lineTo(CORE.x + sx * 200, CORE.y + sy * 200);
    f.stroke();
  }
  f.restore();
  crisp(f);
  shade(f, { noise: 0.16, edge: 1.3 });

  // Layer 3: rooms. Everything sits inside the outer ring and the lane gaps between the spokes.
  const rooms = makeCanvas(BW, BH);
  const r = rooms.ctx;
  r.fillStyle = '#9a3a22';
  roundRect(r, CX - 150 - 0, 108, 65, 42, 8); // left gun bay (d 85..150)
  roundRect(r, CX + 85, 108, 65, 42, 8); // right gun bay
  roundRect(r, CX - 22, 242, 44, 46, 8); // hangar
  r.fillStyle = '#7a1f1f';
  r.beginPath();
  r.arc(CORE.x, CORE.y, 48, 0, Math.PI * 2); // reactor, inside the inner ring (r 55..69)
  r.fill();
  crisp(r);
  shade(r, { noise: 0.12, edge: 1.7 });

  return {
    width: BW,
    height: BH,
    layers: [
      { name: 'Hull', density: BULWARK_TUNING.densities.hull, canvas: hull.canvas },
      { name: 'Frame', density: BULWARK_TUNING.densities.frame, canvas: frame.canvas },
      { name: 'Rooms', density: BULWARK_TUNING.densities.rooms, canvas: rooms.canvas },
    ],
    core: { x: CORE.x, y: CORE.y, radius: 16, hp: BULWARK_TUNING.coreHp },
    // Weapon mounts: two nose guns and the keel gun at the tail (clear of the hangar consoles).
    anchors: {
      noseL: { x: CX - 44, y: 34 },
      noseR: { x: CX + 44, y: 34 },
      keel: { x: CX, y: 305 },
    },
  };
}

/** A hull-mounted turret (surface mount, layer 0). Shared by every Bulwark variant. */
export const bulwarkTurret = (id: string, anchor: string, group: string, turretSpec: NonNullable<ComponentSpec['turret']>, enabled = true): ComponentSpec => ({
  id,
  type: 'turret',
  anchor,
  radius: 15,
  hp: 450,
  mount: 'surface',
  group,
  enabled,
  turret: turretSpec,
});

/**
 * Weapon sources every Bulwark has (issue #43: every attack fires from a turret). The nose guns track the
 * player (aimed shots); the keel gun at the tail is the main weapon: volleys, sweeps and bombs.
 */
export const BULWARK_BASE_TURRETS: ComponentSpec[] = [
  bulwarkTurret('nose-l', 'noseL', 'nose-guns', { aim: 'tracking', angle: 90, trackRate: 120, telegraph: 0.6 }),
  bulwarkTurret('nose-r', 'noseR', 'nose-guns', { aim: 'tracking', angle: 90, trackRate: 120, telegraph: 0.6 }),
  bulwarkTurret('keel', 'keel', 'keel-gun', { aim: 'fixed', angle: 90, telegraph: 0.6 }),
];

/** The same pattern on a different pause: `scale` < 1 = faster. */
const NOSE = 'nose-guns';
const KEEL = 'keel-gun';
/** Which weapon fires each pattern in the plain Bulwark. */
const SOURCE: Record<string, string> = { aimed: NOSE, direct: KEEL, sweep: KEEL, bomb: KEEL };
const every = (pattern: AttackPattern, scale: number): AttackStep => ({ pattern, interval: pattern.interval * scale, source: SOURCE[pattern.name] });

/** Zip travel for a 420 px boss on a 540 screen: ZIP_* presets with the amplitude cut from 90 to 60. */
const ZIP_NORMAL_WIDE = { ...ZIP_NORMAL, amplitude: 60 };
const ZIP_FAST_WIDE = { ...ZIP_FAST, amplitude: 60 };

export const bulwark: BossDefinition = {
  id: 'bulwark',
  name: 'Bulwark',
  layout: createBulwark,
  spawn: { x: TUNING.boss.x, y: 40 },
  components: BULWARK_BASE_TURRETS,
  phases: [
    {
      name: 'Patrol',
      movement: sway(50, 8),
      attacks: [directVolley, aimedShot, directVolley, aimedShot, bomb].map((p) => every(p, 1)),
    },
    {
      name: 'Pressure',
      trigger: { kind: 'damage', percent: 30 },
      movement: lowered(40, zip(ZIP_NORMAL_WIDE)),
      attacks: [directVolley, aimedShot, lineSweep, aimedShot, bomb].map((p) => every(p, 0.75)),
    },
    {
      name: 'Enrage',
      trigger: { kind: 'damage', percent: 65 },
      movement: lowered(70, zip(ZIP_FAST_WIDE)),
      attacks: [aimedShot, directVolley, lineSweep, bomb, aimedShot, directVolley].map((p) => every(p, 0.5)),
      enrage: {},
    },
  ],
};
