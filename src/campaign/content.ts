/**
 * The campaign list. Add a campaign to `CAMPAIGNS`; add a level to a campaign's `levels` (see DESIGN.md "As built: campaign framework").
 *
 * "Fallen Peace" lives in `fallenPeace.ts` (chapters 1 to 3 built; 4 to 7 come later). "Framework Test" is the two-objective
 * level that proves the framework end to end.
 */
import { FINALE_TEST } from '../finale/finaleTest';
import { FALLEN_PEACE } from './fallenPeace';
import type { CampaignDefinition, CampaignLevel } from './types';

export { FALLEN_PEACE };

const TEST_LEVEL: CampaignLevel = {
  id: 'test-1',
  name: 'Test Run',
  briefing: [
    'A two-objective level that exercises the whole framework: a checkpoint at each objective, the level timer, medals and a bonus.',
    'Objective 1: shoot down the three drones. Objective 2: fly into the marked zone.',
    'If your ship is destroyed you restart the current objective with a full hull. The timer keeps running and the death counts.',
  ],
  ship: { id: 'vanguard' },
  objectives: [
    {
      id: 'drones',
      type: 'destroy',
      title: 'Shoot down the drones',
      spawns: [{ unit: 'drone', x: 270, y: 210, tag: 'test-drones', count: 3, spacing: 130 }],
      targets: [{ tag: 'test-drones' }],
      beats: [{ at: 0.4, do: 'text', speaker: 'COMMAND', text: 'Three bogeys ahead. Clear them.' }],
    },
    {
      id: 'zone',
      type: 'reach',
      title: 'Reach the extraction zone',
      zone: { x: 270, y: 560, r: 70 },
      beats: [{ at: 0.4, do: 'text', speaker: 'COMMAND', text: 'Good. Now get to the zone.' }],
    },
  ],
  medals: { bronze: 60, silver: 30, gold: 18, bonus: { kind: 'destroyAll', tag: 'test-drones', count: 3, text: 'Ace: destroy all three drones' } },
};

export const FRAMEWORK_TEST: CampaignDefinition = {
  id: 'framework-test',
  name: 'Framework Test',
  intro: ['Test campaign. One level, two objectives. Used to check checkpoints, medals, results and the save.'],
  levels: [TEST_LEVEL],
  completionUnlock: { kind: 'cards', id: 'campaign-test-framework', label: 'TEST UNLOCK: Framework Test' },
};

export const CAMPAIGNS: CampaignDefinition[] = [FALLEN_PEACE, FRAMEWORK_TEST, FINALE_TEST];

export function findLevel(levelId: string): { campaign: CampaignDefinition; level: CampaignLevel; index: number } | null {
  for (const campaign of CAMPAIGNS) {
    const index = campaign.levels.findIndex((l) => l.id === levelId);
    if (index >= 0) return { campaign, level: campaign.levels[index], index };
  }
  return null;
}
