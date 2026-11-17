import type { BossSpec } from '../boss';
import { bomb } from '../attacks';
import type { AttackPattern } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { EMPIRE } from '../factions';
import { empireShot, empireVolley } from '../enemies/empire';
import { glowSlit, insignia } from '../enemies/empirePaint';
import { bob, combine, sway } from '../movement';
import type { RoomSpec } from '../rooms';
import type { BossDefinition } from './types';
import { crisp, makeCanvas, shade } from './paint';

/**
 * The armoured empire capital ship (chapter 1, again as the disabled boss of chapter 7). ONE definition for both.
 *
 * What the player sees: the stern of a ship far bigger than the play area. The layout is 700 x 620 on a 540 screen, centred, so
 * 80 px of hull hang off each side and the top 150 px are above the screen; the visible part is the lower hull with two engine
 * nacelles and, between them, a notch cut into the stern: the ONE attackable area.
 *
 * Layers (outermost first):
 *  - Armour (`indestructible`): the whole hull plating. Bullets, weapons and blasts do nothing to it (a spark shows). Their tech.
 *    `armourCarvable` (definition flag, `BossFight.armourCarvable`, debug key) turns it into a normal carvable layer (chapter 7).
 *  - Hull: a plate filling the notch, seen through the gap in the armour. Carvable, chunks break off, no regrowth.
 *  - Interior: dark deck under the notch, with the ENGINE ROOM painted in it (two consoles), plus a sealed reactor chamber
 *    holding the core far above the notch (unreachable while the armour holds).
 *
 * Fight: dig up through the hull plate to the engine room, destroy both consoles; the room blows up (`explodeOnDisable`), the
 * `engine` function goes offline (movement stops: `offline: 0`) and the ship is DISABLED. Detect it with
 * `fight.rooms.onDestroyed` / `fight.rooms.destroyed('engine')` (`ENGINE_ROOM_ID`). Four empire gun housings keep firing meanwhile.
 * The core's armour (`coreArmor.min` 0.05, huge hp) keeps blasts from ever killing the ship in chapter 1.
 */

export const CAPITAL_SHIP_ID = 'capital-ship';
export const CAPITAL_SHIP_CARVABLE_ID = 'capital-ship-carvable';
export const ENGINE_ROOM_ID = 'engine';

const LW = 700;
const LH = 620;
/** Screen position: centre x, and top y (the top 150 px are off screen). */
const SPAWN = { x: 270, y: -150 };

/** The attackable notch in the stern (layout px). */
const NOTCH = { x0: 262, x1: 438, y0: 320, y1: 570 };
/** The hull plate that fills the notch: 6 px larger than the gap on the sides and top, so no seam shows. */
const PLATE = { x0: NOTCH.x0 - 6, x1: NOTCH.x1 + 6, y0: NOTCH.y0 - 6, y1: NOTCH.y1 };

const CORE = { x: 350, y: 160, radius: 16, hp: 3000 };

const ARMOUR_OUTLINE: [number, number][] = [
  [0, 0], [LW, 0], [LW, 440], [620, 490], [620, 610], [480, 620], [470, 570],
  [NOTCH.x1, 570], [NOTCH.x1, NOTCH.y0], [NOTCH.x0, NOTCH.y0], [NOTCH.x0, 570],
  [230, 570], [220, 620], [80, 610], [80, 490], [0, 440],
];

export const CAPITAL_TUNING = {
  densities: { armour: 8, hull: 6, interior: 0.8 },
};

interface Painted {
  armour: HTMLCanvasElement;
  hull: HTMLCanvasElement;
  interior: HTMLCanvasElement;
}

let painted: Painted | null = null;

function path(pts: [number, number][]): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

/** Painting the 700 x 620 layers takes a moment, so it is done once and the canvases are shared (layers copy them). */
function paint(): Painted {
  if (painted) return painted;
  const K = EMPIRE;

  // --- armour ---
  const a = makeCanvas(LW, LH);
  const outline = path(ARMOUR_OUTLINE);
  a.ctx.fillStyle = K.armour;
  a.ctx.fill(outline);
  a.ctx.save();
  a.ctx.clip(outline);
  // Heavy plate bands, darker plating rows and the insignia stripe.
  a.ctx.fillStyle = K.armourDark;
  for (let y = 40; y < LH; y += 90) a.ctx.fillRect(0, y, LW, 6);
  for (let x = 90; x < LW; x += 130) a.ctx.fillRect(x, 0, 5, LH);
  a.ctx.fillStyle = K.accent;
  a.ctx.fillRect(0, 232, LW, 14);
  a.ctx.fillRect(0, 252, LW, 4);
  // Forward-swept armour panels (the empire silhouette rule) fanning from the notch toward the flanks, then the insignia.
  for (const sx of [-1, 1]) {
    const mx = (x: number): number => 350 + sx * x;
    a.ctx.fillStyle = K.armourLight;
    a.ctx.beginPath();
    a.ctx.moveTo(mx(120), 270);
    a.ctx.lineTo(mx(330), 360);
    a.ctx.lineTo(mx(330), 392);
    a.ctx.lineTo(mx(120), 330);
    a.ctx.closePath();
    a.ctx.fill();
    a.ctx.fillStyle = K.armourDark;
    a.ctx.beginPath();
    a.ctx.moveTo(mx(120), 330);
    a.ctx.lineTo(mx(330), 392);
    a.ctx.lineTo(mx(330), 404);
    a.ctx.lineTo(mx(120), 342);
    a.ctx.closePath();
    a.ctx.fill();
    insignia(a.ctx, K, 350 + sx * 205, 300, 64);
  }
  // Glow slits along the stern (portholes of the same orange as the fighters' canopies).
  for (let x = 100; x < LW - 90; x += 70) if (Math.abs(x - 350) > 110) glowSlit(a.ctx, K, x, 470, 22, 7);
  // Engine nacelles: dark intakes and nozzle rings at the stern.
  for (const cx of [150, 550]) {
    a.ctx.fillStyle = K.armourDark;
    a.ctx.beginPath();
    a.ctx.ellipse(cx, 590, 56, 26, 0, 0, Math.PI * 2);
    a.ctx.fill();
    a.ctx.fillStyle = '#16181f';
    a.ctx.beginPath();
    a.ctx.ellipse(cx, 592, 40, 16, 0, 0, Math.PI * 2);
    a.ctx.fill();
  }
  // Bright trim along the notch.
  a.ctx.strokeStyle = '#d8553d';
  a.ctx.lineWidth = 6;
  a.ctx.beginPath();
  a.ctx.moveTo(NOTCH.x0, 570);
  a.ctx.lineTo(NOTCH.x0, NOTCH.y0);
  a.ctx.lineTo(NOTCH.x1, NOTCH.y0);
  a.ctx.lineTo(NOTCH.x1, 570);
  a.ctx.stroke();
  a.ctx.restore();
  crisp(a.ctx);
  shade(a.ctx, { noise: 0.1, edge: 0.7, seamEvery: 48 });

  // --- hull plate (fills the notch) ---
  const hw = PLATE.x1 - PLATE.x0;
  const hh = PLATE.y1 - PLATE.y0;
  const h = makeCanvas(LW, LH);
  h.ctx.fillStyle = K.hull;
  h.ctx.fillRect(PLATE.x0, PLATE.y0, hw, hh);
  h.ctx.fillStyle = '#5e4234';
  for (let y = PLATE.y0 + 30; y < PLATE.y1; y += 46) h.ctx.fillRect(PLATE.x0, y, hw, 4);
  h.ctx.fillStyle = '#946b55';
  h.ctx.fillRect(PLATE.x0 + hw / 2 - 5, PLATE.y0, 10, hh);
  h.ctx.fillStyle = K.accent;
  h.ctx.fillRect(PLATE.x0, PLATE.y1 - 22, hw, 8);
  crisp(h.ctx);
  shade(h.ctx, { noise: 0.16, edge: 0.7, seamEvery: 44 });

  // --- interior ---
  const i = makeCanvas(LW, LH);
  i.ctx.fillStyle = K.deck;
  i.ctx.fillRect(250, 308, 200, 262); // deck behind the notch
  i.ctx.beginPath();
  i.ctx.arc(CORE.x, CORE.y, 46, 0, Math.PI * 2); // sealed reactor chamber
  i.ctx.fillStyle = '#4a2630';
  i.ctx.fill();
  // The engine room: a bright bay with pipework.
  i.ctx.fillStyle = '#8f3a28';
  i.ctx.beginPath();
  i.ctx.roundRect(298, 376, 104, 56, 8);
  i.ctx.fill();
  i.ctx.fillStyle = '#b86a3a';
  i.ctx.fillRect(306, 384, 88, 6);
  i.ctx.fillRect(306, 418, 88, 6);
  i.ctx.fillStyle = '#2a1d24';
  i.ctx.fillRect(346, 392, 8, 24);
  crisp(i.ctx);
  shade(i.ctx, { noise: 0.12, edge: 1.5 });

  painted = { armour: a.canvas, hull: h.canvas, interior: i.canvas };
  return painted;
}

export function createCapitalShip(): BossSpec {
  const p = paint();
  return {
    width: LW,
    height: LH,
    layers: [
      { name: 'Armour', density: CAPITAL_TUNING.densities.armour, canvas: p.armour, indestructible: true },
      { name: 'Hull', density: CAPITAL_TUNING.densities.hull, canvas: p.hull },
      { name: 'Interior', density: CAPITAL_TUNING.densities.interior, canvas: p.interior },
    ],
    core: CORE,
    anchors: {
      gunOL: { x: 110, y: 430 },
      gunOR: { x: 590, y: 430 },
      gunIL: { x: 214, y: 380 },
      gunIR: { x: 486, y: 380 },
      engineA: { x: 326, y: 404 },
      engineB: { x: 374, y: 404 },
    },
  };
}

/** An empire gun housing: a surface turret on the armour. */
const gun = (id: string, anchor: string, group: string, aim: NonNullable<ComponentSpec['turret']>): ComponentSpec => ({
  id,
  type: 'turret',
  anchor,
  radius: 16,
  hp: 400,
  mount: 'surface',
  layer: 0,
  group,
  turret: aim,
});

export const CAPITAL_COMPONENTS: ComponentSpec[] = [
  gun('gun-ol', 'gunOL', 'guns-outer', { aim: 'tracking', angle: 90, trackRate: 90, telegraph: 0.6 }),
  gun('gun-or', 'gunOR', 'guns-outer', { aim: 'tracking', angle: 90, trackRate: 90, telegraph: 0.6 }),
  gun('gun-il', 'gunIL', 'guns-inner', { aim: 'fixed', angle: 90, telegraph: 0.6 }),
  gun('gun-ir', 'gunIR', 'guns-inner', { aim: 'fixed', angle: 90, telegraph: 0.6 }),
];

export const CAPITAL_ROOMS: RoomSpec[] = [
  {
    id: ENGINE_ROOM_ID,
    name: 'Engine room',
    function: 'Engines',
    // Offline = the ship stops dead (x0). It blows up when its last console goes.
    functions: [{ kind: 'engine', online: 1, offline: 0 }],
    explodeOnDisable: { radius: 120 },
    consoles: [{ anchor: 'engineA', radius: 11, hp: 120 }, { anchor: 'engineB', radius: 11, hp: 120 }],
  },
];

const every = (pattern: AttackPattern, scale: number, source: string): AttackStep => ({ pattern, interval: pattern.interval * scale, source });

export const capitalShip: BossDefinition = {
  id: CAPITAL_SHIP_ID,
  name: 'Capital ship (armoured)',
  faction: 'empire',
  layout: createCapitalShip,
  spawn: SPAWN,
  components: CAPITAL_COMPONENTS,
  rooms: CAPITAL_ROOMS,
  // The core sits in a sealed chamber under the armour and takes almost nothing: chapter 1 can never kill the ship.
  coreArmor: { min: 0.05, digWeight: 0.2 },
  phases: [
    {
      name: 'Siege',
      movement: combine(sway(20, 14), bob(6, 9)),
      attacks: [
        every(empireShot, 1.0, 'guns-outer'),
        every(empireVolley, 1.2, 'guns-inner'),
        every(empireShot, 1.0, 'guns-outer'),
        every(bomb, 1.6, 'guns-inner'),
      ],
    },
  ],
};

/** The same ship with the armour carvable (chapter 7: you fly their ship now). */
export const capitalShipCarvable: BossDefinition = {
  ...capitalShip,
  id: CAPITAL_SHIP_CARVABLE_ID,
  name: 'Capital ship (armour carvable)',
  armourCarvable: true,
};
