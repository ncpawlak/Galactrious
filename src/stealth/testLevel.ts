import type { CampaignDefinition, CampaignLevel } from '../campaign/types';
import type { ScrollLevelDef } from '../scroll/types';
import type { CoverDef, LightDef } from './types';

/**
 * Debug-only stealth test (`game.debug.scroll.start('stealth-test')` for the plain scroll level with any ship,
 * `game.debug.campaign.start('stealth-test')` for the campaign level with the escape pod, the patrol countdown and the hangar circle).
 * Not in the campaign menu. Also the worked example of how to author a stealth level (see DESIGN.md "As built: stealth systems").
 *
 * Over `baseNight`, 5200 px at 100 px/s (52 s, then the world stands still at the hangar): sweeping pendulums, a rotating beacon,
 * a patrolling lamp, pulsing beams, a big roaming spot, wide sweeps, counter-rotating beacons, and the hangar approach, with roofs and
 * shadows to hide under in every stretch.
 */

const cone = (at: number, x: number, y: number, size: number, spread: number, pattern: LightDef['pattern'], color?: string): LightDef => ({ at, x, y, shape: 'cone', size, spread, pattern, color });

const LIGHTS: LightDef[] = [
  // 1. Two pendulums at the gate.
  cone(0, 130, 60, 420, 24, { type: 'sweep', center: 90, amp: 28, period: 5 }),
  cone(0, 430, 60, 420, 24, { type: 'sweep', center: 90, amp: 28, period: 5, phase: 0.5 }),
  // 2. A rotating beacon on a mast in the middle of the yard.
  cone(700, 270, 0, 300, 30, { type: 'rotate', speed: 40, start: 0 }),
  // 3. A lamp on a rail, patrolling across the lane.
  cone(1300, 270, 0, 360, 20, { type: 'patrol', path: [{ x: -170, y: 0 }, { x: 170, y: 0 }], speed: 90, aim: 90 }, '#ffe08a'),
  // 4. Three pulsing beams: on 1.6 s, off 1.8 s, staggered.
  cone(1900, 110, 0, 380, 16, { type: 'pulse', aim: 90, on: 1.6, off: 1.8 }, '#ff9a7a'),
  cone(1900, 270, 0, 380, 16, { type: 'pulse', aim: 90, on: 1.6, off: 1.8, offset: 1.1 }, '#ff9a7a'),
  cone(1900, 430, 0, 380, 16, { type: 'pulse', aim: 90, on: 1.6, off: 1.8, offset: 2.2 }, '#ff9a7a'),
  // 5. A big spot wandering on a loop.
  { at: 2600, x: 270, y: 150, shape: 'spot', size: 95, pattern: { type: 'roam', rx: 150, ry: 70, period: 9 }, color: '#bfe3ff' },
  // 6. One wide, slow sweep.
  cone(3300, 270, 0, 480, 18, { type: 'sweep', center: 90, amp: 55, period: 4 }),
  // 7. Counter-rotating beacons.
  cone(3900, 90, 0, 340, 28, { type: 'rotate', speed: -55, start: 60 }),
  cone(3900, 450, 0, 340, 28, { type: 'rotate', speed: 55, start: 120 }),
  // 8. The hangar approach: pulsing beams at the sides.
  cone(4500, 60, 0, 420, 20, { type: 'pulse', aim: 80, on: 1.4, off: 2 }, '#ff9a7a'),
  cone(4500, 480, 0, 420, 20, { type: 'pulse', aim: 100, on: 1.4, off: 2, offset: 1.7 }, '#ff9a7a'),
];

const roof = (at: number, x: number, y: number, w: number, h: number, label?: string): CoverDef => ({ at, x, y, w, h, kind: 'roof', label });
const shade = (at: number, x: number, y: number, w: number, h: number): CoverDef => ({ at, x, y, w, h, kind: 'shadow', label: '' });

const COVERS: CoverDef[] = [
  roof(0, 60, 430, 190, 130),
  shade(0, 310, 560, 220, 110),
  roof(450, 300, -140, 170, 120),
  shade(500, 20, 0, 200, 110),
  roof(900, 40, -150, 200, 130),
  roof(1100, 300, -130, 190, 120),
  shade(1500, 110, -100, 240, 110),
  roof(1700, 330, -150, 170, 130),
  roof(2100, 30, -130, 170, 120),
  shade(2200, 340, -110, 190, 110),
  roof(2500, 200, -150, 150, 130),
  shade(2900, 40, -110, 220, 110),
  roof(3100, 320, -150, 180, 130),
  roof(3500, 40, -130, 200, 120),
  shade(3600, 330, -110, 200, 110),
  roof(4100, 190, -140, 170, 130),
  shade(4300, 30, -110, 200, 110),
  roof(4700, 330, 40, 180, 130, 'HANGAR ROOF'),
  roof(4700, 30, 80, 150, 120),
];

export const STEALTH_TEST_SCROLL: ScrollLevelDef = {
  id: 'stealth-test',
  name: 'Stealth test',
  length: 5200,
  speed: 100,
  theme: 'baseNight',
  stealth: { lights: LIGHTS, covers: COVERS },
  timeline: [
    { at: 4700, kind: 'speed', speed: 45, ease: 3 },
    { at: 5000, kind: 'event', name: 'hangar-in-sight' },
  ],
};

const LEVEL: CampaignLevel = {
  id: 'stealth-test',
  name: 'Stealth Test',
  briefing: [
    'Debug level for the stealth systems: the escape pod (two hull, no weapons) creeps through a lit base.',
    'Stay out of the beams, hide under roofs and shadows, and hold the hangar circle for ten seconds. A patrol sweeps the whole screen when the countdown ends: be in cover or in the circle.',
  ],
  ship: { id: 'escape-pod', loadout: { main: 'chain', aux: [] } },
  objectives: [
    {
      id: 'hangar',
      type: 'patrolWave',
      title: 'Reach the hangar',
      scroll: 'stealth-test',
      zone: { x: 270, y: 330, r: 70 },
      zoneAtDistance: 5000,
      hold: 10,
      countdown: 45,
      beats: [
        { at: 0.5, do: 'text', speaker: 'SYSTEM', text: 'Pod systems at minimum. No weapons. Stay in the dark.' },
        { at: 6, do: 'text', speaker: 'SYSTEM', text: 'Searchlights ahead. Hide under the roofs.' },
      ],
    },
  ],
  medals: { bronze: 150, silver: 95, gold: 80, bonus: { kind: 'noDetection', text: 'Silent: cross no searchlight' } },
};

export const STEALTH_TEST_CAMPAIGN: CampaignDefinition = {
  id: 'stealth-test',
  name: 'Stealth Test',
  intro: ['Debug campaign for the stealth systems.'],
  levels: [LEVEL],
};

/** Campaigns reachable by `game.debug.campaign.start(levelId)` but not shown in the campaign menu. */
export const DEBUG_CAMPAIGNS: CampaignDefinition[] = [STEALTH_TEST_CAMPAIGN];
