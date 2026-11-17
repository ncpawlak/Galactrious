import type { BossSpec } from '../boss';
import { TUNING } from '../config';
import { aimedShot, bomb, directVolley, lineSweep } from '../attacks';
import type { AttackPattern } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { figureEight, sequence, zip, ZIP_FAST, ZIP_NORMAL, bob, combine, sway } from '../movement';
import type { RoomSpec } from '../rooms';
import type { BossDefinition } from './types';
import { crisp, makeCanvas, shade } from './paint';

/**
 * Mantis: a tall, narrow insectoid gunship, 336 x 420 (Bulwark is a wide manta). Horns reach up and out at
 * the top, the body tapers to a stinger. Painted from shapes like the other bosses.
 *  - Hull (olive-green chitin): the silhouette, a dark spine and panel lines.
 *  - Frame (dark teal-grey): an edge band, a vertical spine, braces from the core to the horn tips, a ring
 *    round the reactor, and three round GENERATOR PADS.
 *  - Rooms (rust): left and right arm lanes (targeting, capacitor), the reactor (holds the core) and an aft engine bay.
 *
 * Distinctive mechanics (DESIGN.md "Mantis"):
 *  1. Shield generators. Three generators sit on pads in the FRAME layer. The core is armoured by digging
 *     alone to only about a third; every destroyed generator lifts it by 0.2, so the core is only
 *     comfortably open once the generators are gone. Dig the hull, find the pads, destroy them.
 *  2. Weapon rooms. Each arm room POWERS a weapon: Targeting (left lane) powers the chin gun (`maw`, the
 *    tracking aimed shots), Capacitor (right lane) powers both horn guns (`horns`, the rotating guns and the
 *    sweep). Take a room offline and that weapon goes dark. Exposing a room is a risk (its reaction fires),
 *    taking it out is the reward. The engine bay is a bomb: its `explodeOnDisable` reaches the lower generator.
 * Movement is a figure-eight prowl, then alternating dashes and sways, then a fast frenzy.
 */

const BW = 336;
const BH = 420;
const CX = BW / 2;
const CORE = { x: CX, y: 210 };

/** Right half of the silhouette as (distance from centre line, y), nose notch down to the stinger. */
const HALF: [number, number][] = [
  [0, 96], [30, 84], [70, 60], [110, 30], [150, 0], [168, 14], [160, 60], [140, 110],
  [120, 150], [132, 200], [120, 250], [90, 290], [60, 340], [30, 390], [0, 420],
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

/** Densities for THIS boss; the global TUNING pacing numbers stay as they are. */
export const MANTIS_TUNING = {
  densities: { hull: 8, frame: 4.2, rooms: 0.8 },
  coreHp: 1500,
};

const GEN_PADS: [number, number][] = [[100, 235], [240, 235], [170, 300]];

export function createMantis(): BossSpec {
  const hullClip = hullPath();

  const hull = makeCanvas(BW, BH);
  hull.ctx.fillStyle = '#7d8f45';
  hull.ctx.fill(hullClip);
  hull.ctx.save();
  hull.ctx.clip(hullClip);
  hull.ctx.strokeStyle = '#586a2c';
  hull.ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    hull.ctx.beginPath();
    hull.ctx.moveTo(CX + s * 24, 100);
    hull.ctx.lineTo(CX + s * 120, 40);
    hull.ctx.moveTo(CX + s * 40, 160);
    hull.ctx.lineTo(CX + s * 130, 190);
    hull.ctx.moveTo(CX + s * 30, 260);
    hull.ctx.lineTo(CX + s * 100, 280);
    hull.ctx.stroke();
  }
  hull.ctx.fillStyle = '#a3b564';
  hull.ctx.fillRect(CX - 5, 100, 10, 290);
  hull.ctx.restore();
  crisp(hull.ctx);
  shade(hull.ctx, { noise: 0.14, edge: 0.7, seamEvery: 56 });

  const frame = makeCanvas(BW, BH);
  const f = frame.ctx;
  f.save();
  f.clip(hullClip);
  f.strokeStyle = '#3f5a62';
  f.lineJoin = 'round';
  f.lineWidth = 24;
  f.stroke(hullClip);
  f.lineWidth = 14;
  f.beginPath();
  f.arc(CORE.x, CORE.y, 52, 0, Math.PI * 2);
  f.stroke();
  f.lineWidth = 16;
  f.beginPath();
  f.moveTo(CX, 100);
  f.lineTo(CX, 400);
  f.stroke();
  f.lineWidth = 12;
  for (const s of [-1, 1]) {
    f.beginPath();
    f.moveTo(CX + s * 4, CORE.y - 40);
    f.lineTo(CX + s * 148, 30);
    f.stroke();
  }
  f.fillStyle = '#4f7580';
  for (const [x, y] of GEN_PADS) {
    f.beginPath();
    f.arc(x, y, 16, 0, Math.PI * 2);
    f.fill();
  }
  f.restore();
  crisp(f);
  shade(f, { noise: 0.16, edge: 1.3 });

  const rooms = makeCanvas(BW, BH);
  const r = rooms.ctx;
  r.fillStyle = '#9a4a22';
  roundRect(r, CX - 130, 148, 56, 50, 8); // left arm lane (d 74..130)
  roundRect(r, CX + 74, 148, 56, 50, 8); // right arm lane
  roundRect(r, CX - 26, 312, 52, 54, 8); // engine bay
  r.fillStyle = '#7a1f1f';
  r.beginPath();
  r.arc(CORE.x, CORE.y, 40, 0, Math.PI * 2);
  r.fill();
  crisp(r);
  shade(r, { noise: 0.12, edge: 1.7 });

  return {
    width: BW,
    height: BH,
    layers: [
      { name: 'Hull', density: MANTIS_TUNING.densities.hull, canvas: hull.canvas },
      { name: 'Frame', density: MANTIS_TUNING.densities.frame, canvas: frame.canvas },
      { name: 'Rooms', density: MANTIS_TUNING.densities.rooms, canvas: rooms.canvas },
    ],
    core: { x: CORE.x, y: CORE.y, radius: 16, hp: MANTIS_TUNING.coreHp },
    anchors: {
      hornL: { x: CX - 140, y: 42 },
      hornR: { x: CX + 140, y: 42 },
      maw: { x: CX, y: 118 },
      tail: { x: CX, y: 372 },
      genA: { x: GEN_PADS[0][0], y: GEN_PADS[0][1] },
      genB: { x: GEN_PADS[1][0], y: GEN_PADS[1][1] },
      genC: { x: GEN_PADS[2][0], y: GEN_PADS[2][1] },
      // Targeting room (left lane)
      tgtA: { x: CX - 112, y: 164 },
      tgtB: { x: CX - 94, y: 184 },
      // Capacitor room (right lane)
      capA: { x: CX + 112, y: 164 },
      capB: { x: CX + 94, y: 184 },
      // Engine bay
      engA: { x: CX - 12, y: 330 },
      engB: { x: CX + 12, y: 330 },
      engC: { x: CX, y: 350 },
    },
  };
}

const turret = (id: string, anchor: string, group: string, spec: NonNullable<ComponentSpec['turret']>, enabled = true): ComponentSpec => ({
  id,
  type: 'turret',
  anchor,
  radius: 14,
  hp: 400,
  mount: 'surface',
  group,
  enabled,
  turret: spec,
});

const generator = (id: string, anchor: string): ComponentSpec => ({
  id,
  type: 'explosive',
  anchor,
  radius: 11,
  hp: 150,
  mount: 'embedded',
  layer: 1,
  group: 'gen',
  blast: { radius: 70, coreDamage: 120 },
});

export const MANTIS_COMPONENTS: ComponentSpec[] = [
  // Chin gun: tracks the player. Powered by the Targeting room.
  turret('maw', 'maw', 'maw', { aim: 'tracking', angle: 90, trackRate: 110, telegraph: 0.6 }),
  // Horn guns: spin on their mounts. Powered by the Capacitor room. Inert until Frenzy.
  turret('horn-l', 'hornL', 'horns', { aim: 'rotating', angle: 70, spin: 45, telegraph: 0.5 }, false),
  turret('horn-r', 'hornR', 'horns', { aim: 'rotating', angle: 110, spin: -45, telegraph: 0.5 }, false),
  // Stinger: fixed, straight down. Volleys, sweeps and bombs.
  turret('tail', 'tail', 'tail', { aim: 'fixed', angle: 90, telegraph: 0.6 }),
  generator('gen-a', 'genA'),
  generator('gen-b', 'genB'),
  generator('gen-c', 'genC'),
];

export const MANTIS_ROOMS: RoomSpec[] = [
  {
    id: 'targeting',
    name: 'Targeting',
    function: 'Chin gun',
    powers: ['maw'],
    consoles: [{ anchor: 'tgtA' }, { anchor: 'tgtB' }],
    onExposed: [{ kind: 'attack', pattern: aimedShot, count: 3, gap: 0.35 }],
  },
  {
    id: 'capacitor',
    name: 'Capacitor',
    function: 'Horn guns',
    powers: ['horns'],
    consoles: [{ anchor: 'capA' }, { anchor: 'capB' }],
    onExposed: [{ kind: 'pulse', radius: 150, damage: 1 }],
  },
  {
    id: 'engine',
    name: 'Engine bay',
    function: 'Stinger fuel',
    consoles: [{ anchor: 'engA' }, { anchor: 'engB' }, { anchor: 'engC' }],
    onExposed: [{ kind: 'attack', pattern: directVolley, count: 2, gap: 0.5 }],
    explodeOnDisable: { radius: 95 },
  },
];

const MAW = 'maw';
const HORNS = 'horns';
const TAIL = 'tail';
const every = (pattern: AttackPattern, scale: number, source: string): AttackStep => ({ pattern, interval: pattern.interval * scale, source });

// A 336 px boss on a 540 screen: keep zips to 80 px each way.
const DASH = { ...ZIP_NORMAL, amplitude: 80 };
const DASH_FAST = { ...ZIP_FAST, amplitude: 80 };

export const mantis: BossDefinition = {
  id: 'mantis',
  name: 'Mantis',
  layout: createMantis,
  spawn: { x: TUNING.boss.x, y: 40 },
  components: MANTIS_COMPONENTS,
  rooms: MANTIS_ROOMS,
  // Digging alone gets the core to about a third; each destroyed generator adds 0.2.
  coreArmor: { min: 0.1, digWeight: 0.3, requires: ['gen'], perComponent: 0.2 },
  phases: [
    {
      name: 'Prowl',
      movement: figureEight(80, 22, 9),
      attacks: [
        every(aimedShot, 1, MAW),
        every(directVolley, 1, TAIL),
        every(aimedShot, 1, MAW),
        every(bomb, 1, TAIL),
      ],
    },
    {
      name: 'Frenzy',
      trigger: { kind: 'damage', percent: 20 },
      movement: sequence(
        [
          { movement: zip(DASH), duration: 6 },
          { movement: combine(sway(70, 5), bob(20, 3)), duration: 5 },
        ],
        0.6,
      ),
      attacks: [
        every(aimedShot, 0.8, MAW),
        every(lineSweep, 0.8, HORNS),
        every(directVolley, 0.8, TAIL),
        every(aimedShot, 0.8, HORNS),
        every(bomb, 0.8, TAIL),
      ],
      components: { enable: ['horns'] },
    },
    {
      name: 'Overdrive',
      trigger: { kind: 'damage', percent: 45 },
      movement: sequence(
        [
          { movement: zip(DASH_FAST), duration: 5 },
          { movement: figureEight(80, 30, 4.5), duration: 5 },
        ],
        0.5,
      ),
      attacks: [
        every(aimedShot, 0.55, MAW),
        every(lineSweep, 0.55, HORNS),
        every(directVolley, 0.55, TAIL),
        every(aimedShot, 0.55, HORNS),
        every(bomb, 0.55, TAIL),
        every(aimedShot, 0.55, MAW),
      ],
      enrage: { tint: '255, 90, 40' },
      components: { modifiers: [{ target: MAW, intervalScale: 0.7 }, { target: HORNS, intervalScale: 0.7 }] },
    },
  ],
};
