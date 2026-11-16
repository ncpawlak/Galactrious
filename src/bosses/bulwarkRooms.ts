import type { BossSpec } from '../boss';
import { aimedShot, directVolley } from '../attacks';
import type { RoomSpec } from '../rooms';
import { BULWARK_COMPONENTS, bulwarkComponents, createBulwarkComponents } from './bulwarkComponents';
import type { BossDefinition } from './types';

/**
 * Bulwark with rooms and consoles (DESIGN.md "Rooms and consoles", issue #10): the turrets and tanks of
 * `bulwarkComponents` plus four rooms. Each room is a named group of consoles embedded in the rooms
 * layer; dig through the hull (the open lanes over the bays and hangar) until a console shows and the
 * room reacts, once. Destroy all of a room's consoles and its function goes offline.
 *
 *  - Weapons control (port bay, 3 consoles): powers the wing guns. Exposed: a burst of aimed shots and a volley.
 *  - Shield projector (starboard bay, 2): its loss lowers the core's armor. Exposed: a shield-burst ring.
 *  - Reactor control (round the core, 2): powers the nose guns. Exposed: a volley and a smaller ring.
 *  - Fuel store (hangar, 3): `explodeOnDisable`: it blows up when its last console goes, and the blast
 *    reaches the reactor tank, which chains on into the reactor consoles.
 * Drones (a later room effect) are not built yet.
 */

export function createBulwarkRooms(): BossSpec {
  const base = createBulwarkComponents();
  return {
    ...base,
    anchors: {
      ...base.anchors,
      weaponsA: { x: 78, y: 122 },
      weaponsB: { x: 100, y: 140 },
      weaponsC: { x: 118, y: 120 },
      shieldA: { x: 342, y: 124 },
      shieldB: { x: 320, y: 138 },
      reactorA: { x: 172, y: 172 },
      reactorB: { x: 248, y: 158 },
      fuelA: { x: 197, y: 256 },
      fuelB: { x: 223, y: 256 },
      fuelC: { x: 210, y: 276 },
    },
  };
}

export const BULWARK_ROOMS: RoomSpec[] = [
  {
    id: 'weapons',
    name: 'Weapons control',
    function: 'Wing guns',
    powers: ['wing-guns'],
    consoles: [{ anchor: 'weaponsA' }, { anchor: 'weaponsB' }, { anchor: 'weaponsC' }],
    onExposed: [
      { kind: 'attack', pattern: aimedShot, count: 3, gap: 0.3 },
      { kind: 'attack', pattern: directVolley, delay: 1.4 },
    ],
  },
  {
    id: 'shield',
    name: 'Shield projector',
    function: 'Core shield',
    consoles: [{ anchor: 'shieldA' }, { anchor: 'shieldB' }],
    onExposed: [{ kind: 'pulse', radius: 170, damage: 1 }],
  },
  {
    id: 'reactor',
    name: 'Reactor control',
    function: 'Nose guns',
    powers: ['nose-guns'],
    consoles: [{ anchor: 'reactorA' }, { anchor: 'reactorB' }],
    onExposed: [
      { kind: 'attack', pattern: directVolley, count: 2, gap: 0.5 },
      { kind: 'pulse', radius: 120, damage: 1, delay: 1.0 },
    ],
  },
  {
    id: 'fuel',
    name: 'Fuel store',
    function: 'Hangar fuel',
    consoles: [{ anchor: 'fuelA' }, { anchor: 'fuelB' }, { anchor: 'fuelC' }],
    onExposed: [{ kind: 'attack', pattern: aimedShot, count: 2, gap: 0.4 }],
    explodeOnDisable: { radius: 95, energy: 9000, damage: 460, coreDamage: 200, falloff: 1 },
  },
];

export const bulwarkRooms: BossDefinition = {
  ...bulwarkComponents,
  id: 'bulwark-rooms',
  name: 'Bulwark (rooms + consoles)',
  layout: createBulwarkRooms,
  components: BULWARK_COMPONENTS,
  rooms: BULWARK_ROOMS,
  // Digging, each tank, and the shield projector going dark all lower the core's armor.
  coreArmor: { requires: ['tank', 'room:shield'] },
};

/** The same boss flipped (`mirror: true`): rooms, consoles, anchors and turret aim all follow the layout. */
export const bulwarkRoomsMirror: BossDefinition = {
  ...bulwarkRooms,
  id: 'bulwark-rooms-mirror',
  name: 'Bulwark (rooms + consoles, mirrored)',
  mirror: true,
};
