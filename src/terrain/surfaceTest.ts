import { DELTA_SHIP } from '../campaign/fallenPeace';
import type { CampaignDefinition, CampaignLevel } from '../campaign/types';
import type { ScrollEntry, ScrollLevelDef } from '../scroll/types';
import { countTurrets } from './structures';
import { GROUND_TAG } from './types';

/**
 * Debug level `surface-test` (about 90 s): `game.debug.scroll.start('surface-test')` or `game.debug.campaign.start('surface-test')`.
 * It doubles as the AUTHORING EXAMPLE for chapter 5 (DESIGN.md "As built: carvable terrain and ground defences"): every terrain entry kind,
 * composed with the flyby behaviours, in the order a content session would write them. Distances are scroll px (180 px/s: 1000 px is
 * about 5.6 s). The surface theme, one speed, no weather; the ship carves a lane, flies the gaps or both.
 */

const FLY = 'empire-fighter-rear';

const timeline: ScrollEntry[] = [
  { at: 0, kind: 'turretTally', on: true },
  // --- 1. Warm-up: lone ground turrets, then a pair, and the first pass from behind. ---
  { at: 500, kind: 'turret', x: 150 },
  { at: 900, kind: 'turret', x: 390 },
  { at: 1300, kind: 'flyby', unit: FLY, preset: 'rear', x: 270, count: 3, spacing: 0.5, xStep: 40 },
  { at: 1500, kind: 'wall', x: 270, width: 150, turrets: 1 },
  // --- 2. Defence line 1: gaps at the left and right, three gun turrets built into the long middle piece. ---
  { at: 2500, kind: 'wallLine', gaps: [{ x: 90, width: 90 }, { x: 460, width: 80 }], turrets: [225, 270, 330], seed: 1 },
  { at: 3400, kind: 'flyby', unit: 'empire-strafer', preset: 'cross', side: 'left', y: 330, count: 3, spacing: 0.9, alternate: true },
  // --- 3. A mortar pad and a staggered cluster of guns. ---
  { at: 3900, kind: 'turret', x: 270, type: 'mortar' },
  { at: 4300, kind: 'turretCluster', x: 270, count: 4, spacing: 110, layout: 'stagger', fan: true },
  // --- 4. Defence line 2: ONE narrow gap, mortars and guns in the wall. Cut a lane or squeeze through. ---
  { at: 5600, kind: 'wallLine', gaps: [{ x: 270, width: 64 }], turrets: [100, 440], mortars: [190, 350], seed: 2 },
  { at: 6200, kind: 'flyby', unit: FLY, preset: 'rear', x: 130, count: 3, spacing: 0.5, xStep: 120 },
  { at: 6600, kind: 'flyby', unit: 'empire-strafer', preset: 'strafe', x: 400, count: 2, spacing: 1.1 },
  // --- 5. Slalom of free-standing wall segments with guns in them. ---
  { at: 7200, kind: 'wall', x: 120, width: 170, turrets: 1 },
  { at: 7900, kind: 'wall', x: 400, width: 170, turrets: [0] },
  { at: 8600, kind: 'wall', x: 150, width: 200, turrets: [-50, 50] },
  // --- 6. A row of turrets with every third one a mortar, flak drifting through. ---
  { at: 9400, kind: 'turretCluster', x: 270, count: 5, spacing: 100, layout: 'arc', mortarEvery: 3 },
  { at: 9800, kind: 'flyby', unit: 'empire-flak', preset: 'drift', x: 130 },
  // --- 7. Defence line 3: wide gap on the right, a hard-to-reach left gap. ---
  { at: 10800, kind: 'wallLine', gaps: [{ x: 40, width: 56 }, { x: 420, width: 130 }], turrets: 2, fan: true, seed: 3 },
  { at: 11500, kind: 'flyby', unit: FLY, preset: 'rear', x: 400, count: 4, spacing: 0.45, xStep: -80 },
  { at: 12000, kind: 'flyby', unit: 'empire-strafer', preset: 'cross', side: 'right', y: 300, count: 2, spacing: 1.2, alternate: true },
  // --- 8. Finale: a turret field, then the last line (one gap, six guns, two mortars). ---
  { at: 12400, kind: 'turretCluster', x: 270, count: 6, spacing: 84, layout: 'stagger' },
  { at: 13800, kind: 'wallLine', gaps: [{ x: 270, width: 76 }], turrets: 3, mortars: [120, 420], depth: 52, seed: 4 },
  { at: 14200, kind: 'flyby', unit: FLY, preset: 'rear', x: 270, count: 5, spacing: 0.4, xStep: 0 },
  { at: 15400, kind: 'event', name: 'surface-end' },
];

export const SURFACE_TEST: ScrollLevelDef = {
  id: 'surface-test',
  name: 'Surface test',
  length: 16200,
  speed: 180,
  theme: 'surface',
  timeline,
};

/** How many turrets the level spawns (the `destroyAll` bonus counts every one). */
export const SURFACE_TEST_TURRETS = countTurrets(timeline)[GROUND_TAG] ?? 0;

const LEVEL: CampaignLevel = {
  id: 'surface-test',
  name: 'Surface Test',
  briefing: [
    'A debug run over the arctic surface: defence lines with gaps, wall turrets, ground turrets and air squadrons from behind.',
    'Cut a lane through a wall with any weapon, or fly the gaps. The bonus counts every turret you destroy.',
  ],
  ship: DELTA_SHIP,
  objectives: [
    {
      id: 'run',
      type: 'scroll',
      title: 'Cross the defences',
      scroll: 'surface-test',
      beats: [
        { at: 1, do: 'text', speaker: 'COMMAND', text: 'Defence lines ahead. Cut through the walls.' },
        { at: 45, do: 'text', speaker: 'COMMAND', text: 'More guns in the next line.' },
      ],
    },
  ],
  medals: { bronze: 150, silver: 110, gold: 95, bonus: { kind: 'destroyAll', tag: GROUND_TAG, count: SURFACE_TEST_TURRETS, text: 'Destroy all turrets' } },
};

/** A one-level campaign registered beside "Framework Test" so `game.debug.campaign.start('surface-test')` finds the level. */
export const TERRAIN_TEST_CAMPAIGN: CampaignDefinition = {
  id: 'terrain-test',
  name: 'Terrain Test',
  intro: ['Debug campaign: the carvable terrain and ground defences of the surface run.'],
  levels: [LEVEL],
};
