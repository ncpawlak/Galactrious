import type { BossSpec } from '../boss';
import { TUNING } from '../config';
import { aimedShot, bomb, directVolley, lineSweep } from '../attacks';
import type { AttackPattern } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { sway, zip, ZIP_FAST, ZIP_NORMAL } from '../movement';
import { BULWARK_BASE_TURRETS, bulwarkTurret as turret, createBulwark } from './bulwark';
import type { BossDefinition } from './types';

/**
 * Bulwark with components (DESIGN.md "Boss anatomy: components"): the same ship and pacing as
 * `bulwark`, plus four turrets and three explosive pieces. Layers: 0 hull, 1 frame, 2 rooms.
 *  - Turrets (surface-mounted on the hull): two nose guns that track the player ('nose-guns'), a
 *    rotating wing gun on the left and a fixed one on the right ('wing-guns', inert until Pressure).
 *    Cut a wing off and its gun goes with it. Their attacks are the steps with a `source`.
 *  - Explosives ('tank' group): a frame tank embedded under the hull beside the reactor ring, a reactor
 *    tank embedded in the rooms layer right under the core, and a surface fuel pod on the left wing.
 *    They sit close enough that a blast chains: frame tank -> pod and reactor tank -> core.
 *  - Core armor: besides digging, each destroyed tank lifts the core's vulnerability.
 */

const CX = 210;

export function createBulwarkComponents(): BossSpec {
  return {
    ...createBulwark(),
    anchors: {
      ...createBulwark().anchors,
      wingL: { x: CX - 165, y: 135 },
      wingR: { x: CX + 165, y: 135 },
      frameTank: { x: 166, y: 121 },
      reactorTank: { x: 200, y: 196 },
      pod: { x: 105, y: 150 },
    },
  };
}

export const BULWARK_COMPONENTS: ComponentSpec[] = [
  ...BULWARK_BASE_TURRETS,
  turret('wing-l', 'wingL', 'wing-guns', { aim: 'rotating', angle: 60, spin: 55, telegraph: 0.5 }, false),
  turret('wing-r', 'wingR', 'wing-guns', { aim: 'fixed', angle: 105, telegraph: 0.5 }, false),
  {
    id: 'frame-tank',
    type: 'explosive',
    anchor: 'frameTank',
    radius: 12,
    hp: 120,
    mount: 'embedded',
    layer: 1,
    group: 'tank',
    blast: { radius: 110, energy: 12000, damage: 500, coreDamage: 220, falloff: 1 },
  },
  {
    id: 'reactor-tank',
    type: 'explosive',
    anchor: 'reactorTank',
    radius: 12,
    hp: 100,
    mount: 'embedded',
    layer: 2,
    group: 'tank',
    blast: { radius: 85, energy: 9000, damage: 400, coreDamage: 450, falloff: 1 },
  },
  {
    id: 'fuel-pod',
    type: 'explosive',
    anchor: 'pod',
    radius: 13,
    hp: 120,
    mount: 'surface',
    group: 'tank',
    blast: { radius: 75, energy: 6000, damage: 450, coreDamage: 150, falloff: 1 },
  },
];

const every = (pattern: AttackPattern, scale: number, source: string): AttackStep => ({ pattern, interval: pattern.interval * scale, source });
const KEEL = 'keel-gun';
const ZIP_NORMAL_WIDE = { ...ZIP_NORMAL, amplitude: 60 };
const ZIP_FAST_WIDE = { ...ZIP_FAST, amplitude: 60 };

export const bulwarkComponents: BossDefinition = {
  id: 'bulwark-components',
  name: 'Bulwark (turrets + explosives)',
  layout: createBulwarkComponents,
  spawn: { x: TUNING.boss.x, y: 40 },
  components: BULWARK_COMPONENTS,
  // Dig as usual, and every destroyed tank also exposes the core.
  coreArmor: { requires: ['tank'] },
  phases: [
    {
      name: 'Patrol',
      movement: sway(50, 8),
      attacks: [
        every(directVolley, 1, KEEL),
        every(aimedShot, 0.9, 'nose-guns'),
        every(directVolley, 1, KEEL),
        every(aimedShot, 0.9, 'nose-guns'),
        every(bomb, 1, KEEL),
      ],
    },
    {
      name: 'Pressure',
      trigger: { kind: 'damage', percent: 30 },
      movement: zip(ZIP_NORMAL_WIDE),
      attacks: [
        every(directVolley, 0.75, KEEL),
        every(aimedShot, 0.8, 'nose-guns'),
        every(aimedShot, 0.8, 'wing-guns'),
        every(lineSweep, 0.75, KEEL),
        every(aimedShot, 0.8, 'wing-guns'),
        every(bomb, 0.75, KEEL),
      ],
      components: { enable: ['wing-guns'] },
    },
    {
      name: 'Enrage',
      trigger: { kind: 'damage', percent: 65 },
      movement: zip(ZIP_FAST_WIDE),
      attacks: [
        every(aimedShot, 0.5, 'nose-guns'),
        every(directVolley, 0.5, KEEL),
        every(aimedShot, 0.5, 'wing-guns'),
        every(lineSweep, 0.5, KEEL),
        every(bomb, 0.5, KEEL),
        every(aimedShot, 0.5, 'wing-guns'),
      ],
      enrage: {},
      // The turrets get meaner: their pauses shrink to 60% on top of the phase's own.
      components: { modifiers: [{ target: 'nose-guns', intervalScale: 0.6 }, { target: 'wing-guns', intervalScale: 0.6 }] },
    },
  ],
};
