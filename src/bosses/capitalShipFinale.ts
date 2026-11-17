import type { BossSpec } from '../boss';
import type { AttackPattern } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { empireShot, empireVolley } from '../enemies/empire';
import { EMPIRE } from '../factions';
import type { RoomSpec } from '../rooms';
import { capitalShip, CAPITAL_COMPONENTS, createCapitalShip } from './capitalShip';
import { crisp, makeCanvas, shade } from './paint';
import type { BossDefinition } from './types';
import type { BossFight } from '../bossFight';

/**
 * The capital ship of chapter 7 ("Fallen Peace" finale): the SAME hull as chapter 1 (same size, three layers and the same engine-room
 * damage, so the saved chapter 1 snapshot restores onto it), plus what the armour was hiding: two rooms under the plating (the shield
 * projector that keeps the core hard to hurt, and the weapons control that powers the outer and flank guns) and two flank guns.
 * The armour is NOT carvable by definition; the finale makes it carvable when the player's ship has `empireTech` (the armour
 * resonance, src/finale/system.ts). Chapter 1's definition is untouched.
 *
 * Dismantle list (the bonus): 2 rooms + 6 guns = 8 things (the engine room went in chapter 1).
 * Core: `requires` both rooms, so the core only takes full damage once the shield and weapons rooms are down and the armour dug.
 */
export const CAPITAL_FINALE_ID = 'capital-ship-finale';
export const SHIELD_ROOM_ID = 'shield';
export const WEAPONS_ROOM_ID = 'weapons';
/** Everything the Full dismantle bonus counts. */
export const FINALE_ROOMS = [SHIELD_ROOM_ID, WEAPONS_ROOM_ID];
export const FINALE_GUNS = ['gun-ol', 'gun-or', 'gun-il', 'gun-ir', 'gun-ml', 'gun-mr'];

let paintedInterior: HTMLCanvasElement | null = null;

/** The chapter 1 interior layer plus two hidden rooms (a deck patch and a lit bay each), painted once. */
function interior(base: HTMLCanvasElement): HTMLCanvasElement {
  if (paintedInterior) return paintedInterior;
  const c = makeCanvas(base.width, base.height);
  c.ctx.drawImage(base, 0, 0);
  const K = EMPIRE;
  for (const r of [
    { x: 176, bay: '#2f6f8f', lit: '#6fc4e8' }, // shield projector (cold blue)
    { x: 424, bay: '#8f3a28', lit: '#e0883a' }, // weapons control (hot orange)
  ]) {
    c.ctx.fillStyle = K.deck;
    c.ctx.fillRect(r.x, 242, 100, 76);
    c.ctx.fillStyle = r.bay;
    c.ctx.beginPath();
    c.ctx.roundRect(r.x + 10, 252, 80, 56, 8);
    c.ctx.fill();
    c.ctx.fillStyle = r.lit;
    c.ctx.fillRect(r.x + 16, 260, 68, 5);
    c.ctx.fillRect(r.x + 16, 294, 68, 5);
    c.ctx.fillStyle = '#1d1420';
    c.ctx.fillRect(r.x + 46, 270, 8, 20);
  }
  crisp(c.ctx);
  shade(c.ctx, { noise: 0.12, edge: 1.5 });
  paintedInterior = c.canvas;
  return c.canvas;
}

function layoutFinale(): BossSpec {
  const spec = createCapitalShip();
  const layers = spec.layers.slice();
  layers[2] = { ...layers[2], canvas: interior(layers[2].canvas as HTMLCanvasElement) };
  return {
    ...spec,
    layers,
    anchors: {
      ...spec.anchors,
      shieldA: { x: 206, y: 268 },
      shieldB: { x: 246, y: 292 },
      weaponsA: { x: 454, y: 292 },
      weaponsB: { x: 494, y: 268 },
      gunML: { x: 150, y: 300 },
      gunMR: { x: 550, y: 300 },
    },
  };
}

/** The snapshot of chapter 1 knows nothing of the hidden rooms and wipes their pixels: put the two room patches back (interior layer, original pixels). */
function restoreRooms(fight: BossFight): void {
  const b = fight.boss;
  const l = b.layers[2];
  const d = l.img.data;
  for (const x0 of [176, 424]) {
    for (let y = 242; y < 318; y++) {
      for (let x = x0; x < x0 + 100; x++) {
        const i = y * b.width + x;
        const o = i * 4;
        if (l.mask[i] || l.origRgba[o + 3] === 0) continue;
        // Do not overwrite carved pixels of chapter 1 (the notch deck overlaps the left patch's edge): only fill where the layer was empty AND not part of the notch deck.
        if (x >= 250 && x < 450 && y >= 308) continue;
        l.mask[i] = 1;
        d[o] = l.origRgba[o];
        d[o + 1] = l.origRgba[o + 1];
        d[o + 2] = l.origRgba[o + 2];
        d[o + 3] = l.origRgba[o + 3];
        l.remaining++;
      }
    }
  }
  l.dirty = true;
  l.flush();
  b.version++;
}

const flank = (id: string, anchor: string): ComponentSpec => ({
  id,
  type: 'turret',
  anchor,
  radius: 16,
  hp: 400,
  mount: 'surface',
  layer: 0,
  group: 'guns-mid',
  turret: { aim: 'tracking', angle: 90, trackRate: 80, telegraph: 0.6 },
});

export const CAPITAL_FINALE_ROOMS: RoomSpec[] = [
  ...(capitalShip.rooms ?? []),
  {
    id: SHIELD_ROOM_ID,
    name: 'Shield projector',
    function: 'Core shield',
    functions: [{ kind: 'shield' }],
    explodeOnDisable: { radius: 70 },
    consoles: [{ anchor: 'shieldA', radius: 11, hp: 130 }, { anchor: 'shieldB', radius: 11, hp: 130 }],
  },
  {
    id: WEAPONS_ROOM_ID,
    name: 'Weapons control',
    function: 'Outer guns',
    functions: [{ kind: 'power', targets: ['guns-outer', 'guns-mid'] }],
    explodeOnDisable: { radius: 70 },
    consoles: [{ anchor: 'weaponsA', radius: 11, hp: 130 }, { anchor: 'weaponsB', radius: 11, hp: 130 }],
  },
];

const every = (pattern: AttackPattern, scale: number, source: string): AttackStep => ({ pattern, interval: pattern.interval * scale, source });

export const capitalShipFinale: BossDefinition = {
  ...capitalShip,
  id: CAPITAL_FINALE_ID,
  name: 'Capital ship (finale)',
  layout: layoutFinale,
  components: [...CAPITAL_COMPONENTS, flank('gun-ml', 'gunML'), flank('gun-mr', 'gunMR')],
  rooms: CAPITAL_FINALE_ROOMS,
  afterRestore: restoreRooms,
  coreArmor: { min: 0.05, digWeight: 0.2, requires: [`room:${SHIELD_ROOM_ID}`, `room:${WEAPONS_ROOM_ID}`] },
  phases: [
    {
      name: 'Siege',
      movement: capitalShip.phases[0].movement,
      attacks: [
        every(empireShot, 1.4, 'guns-outer'),
        every(empireVolley, 1.6, 'guns-inner'),
        every(empireShot, 2.0, 'guns-mid'),
        every(empireShot, 1.4, 'guns-outer'),
        every(empireVolley, 2.4, 'guns-mid'),
      ],
    },
  ],
};
