import type { BossSpec } from '../boss';
import { TUNING } from '../config';
import { aimedShot, directVolley } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { AttackPattern } from '../attacks';
import type { RoomSpec } from '../rooms';
import { sway } from '../movement';
import { BULWARK_COMPONENTS, createBulwarkComponents } from './bulwarkComponents';
import type { BossDefinition } from './types';

/**
 * Room lab: a debug boss (`[B]`, `game.debug.setBoss`) with ONE ROOM PER FUNCTION of the catalog
 * (src/roomFunctions.ts), on the Bulwark hull, for testing each function and its cue. Not in the run.
 *
 *  - Power (left bay, 2 consoles): powers the wing guns. Offline: they go dark.
 *  - Sensor (left bay, 1): the keel gun (fixed) and nose guns track you while it is online; offline they fire dumb.
 *  - Shield (right bay, 2): armors the core. Offline: the core takes full damage once dug.
 *  - Repair (right bay, 1): regrows the hull and mends the guns, all fight long. Offline: it stops.
 *  - Spawner (hangar, 2): launches drones (3 alive, 6 in all). Offline (or at the cap): none.
 *  - Reactor (hangar, 1): explodes when its console goes; the blast reaches the spawner consoles beside it.
 *  - Engine (round the core, 2): boss moves x1.5 faster; offline it slows to x0.4.
 * Rooms react only when exposed, but every function runs from the start. `game.debug.rooms.forceOffline('repair')`
 * (and `forceOnline`, `setState(id, 'auto')`) flips a room without digging.
 */

export function createRoomLab(): BossSpec {
  const base = createBulwarkComponents();
  return {
    ...base,
    anchors: {
      ...base.anchors,
      powerA: { x: 78, y: 122 },
      powerB: { x: 100, y: 140 },
      sensorA: { x: 118, y: 120 },
      shieldA: { x: 342, y: 124 },
      shieldB: { x: 320, y: 138 },
      repairA: { x: 304, y: 124 },
      spawnA: { x: 197, y: 256 },
      spawnB: { x: 223, y: 256 },
      reactorA: { x: 210, y: 278 },
      engineA: { x: 172, y: 172 },
      engineB: { x: 248, y: 158 },
    },
  };
}

export const ROOM_LAB_ROOMS: RoomSpec[] = [
  {
    id: 'power',
    name: 'Power room',
    function: 'Wing guns',
    functions: [{ kind: 'power', targets: ['wing-guns'] }],
    consoles: [{ anchor: 'powerA' }, { anchor: 'powerB' }],
  },
  {
    id: 'sensor',
    name: 'Sensor array',
    function: 'Targeting',
    functions: [{ kind: 'sensor', targets: ['nose-guns', 'keel-gun'] }],
    consoles: [{ anchor: 'sensorA' }],
  },
  {
    id: 'shield',
    name: 'Shield projector',
    function: 'Core shield',
    functions: [{ kind: 'shield' }],
    consoles: [{ anchor: 'shieldA' }, { anchor: 'shieldB' }],
  },
  {
    id: 'repair',
    name: 'Repair bay',
    function: 'Hull repair',
    functions: [{ kind: 'repair', layer: 0, rate: 0.006, heal: { targets: ['nose-guns', 'wing-guns', 'keel-gun'], perSecond: 10 } }],
    consoles: [{ anchor: 'repairA' }],
  },
  {
    id: 'spawner',
    name: 'Drone bay',
    function: 'Drones',
    functions: [{ kind: 'spawner', unit: 'drone', interval: 3, max: 3, total: 6, first: 2 }],
    consoles: [{ anchor: 'spawnA' }, { anchor: 'spawnB' }],
  },
  {
    id: 'reactor',
    name: 'Reactor',
    function: 'Fuel',
    functions: [{ kind: 'reactor', blast: { radius: 70 } }],
    consoles: [{ anchor: 'reactorA' }],
  },
  {
    id: 'engine',
    name: 'Engine bay',
    function: 'Thrust',
    functions: [{ kind: 'engine', online: 1.5, offline: 0.4 }],
    consoles: [{ anchor: 'engineA' }, { anchor: 'engineB' }],
  },
];

const every = (pattern: AttackPattern, scale: number, source: string): AttackStep => ({ pattern, interval: pattern.interval * scale, source });

export const roomLab: BossDefinition = {
  id: 'room-lab',
  name: 'Room lab (one room per function)',
  layout: createRoomLab,
  spawn: { x: TUNING.boss.x, y: 40 },
  components: BULWARK_COMPONENTS,
  rooms: ROOM_LAB_ROOMS,
  phases: [
    {
      name: 'Lab',
      movement: sway(60, 8),
      attacks: [every(aimedShot, 1.2, 'nose-guns'), every(directVolley, 1.4, 'keel-gun'), every(aimedShot, 1.4, 'wing-guns')],
      components: { enable: ['wing-guns'] },
    },
  ],
};
