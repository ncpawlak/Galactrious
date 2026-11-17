/**
 * The campaign list. Add a campaign to `CAMPAIGNS`; add a level to a campaign's `levels` (see DESIGN.md "As built: campaign framework").
 *
 * "Fallen Peace" chapters 1 to 3 are PLACEHOLDERS pointing at simple test objectives and made-up medal times: the real
 * chapter content (capital ship, scrolling levels, obstacles, allies) is assembled by a later session. "Framework Test" is
 * the two-objective level that proves the framework end to end.
 */
import type { CampaignDefinition, CampaignLevel } from './types';

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

export const FALLEN_PEACE: CampaignDefinition = {
  id: 'fallen-peace',
  name: 'Fallen Peace',
  intro: [
    'Delta squadron is in a large dogfight above the planet Orini. You are a rookie pilot of Delta squad.',
    'The mission: fight through the dogfight, reach the enemy command ship and disable its engines by blowing up the engine room.',
    'Then the retreat begins, and it will not go to plan.',
  ],
  levels: [
    {
      id: 'fp-1',
      name: '1. Dogfight',
      briefing: [
        'Fight through the fighter waves above Orini and reach the enemy command ship.',
        'Its armour cannot be touched, except at one spot. Carve through to the engine room and blow it up.',
        '(Placeholder level: shoot down a few drones, then reach the marked zone.)',
      ],
      ship: { id: 'vanguard' },
      objectives: [
        {
          id: 'fighters',
          type: 'destroy',
          title: 'Break through the fighters',
          spawns: [{ unit: 'drone', x: 270, y: 200, tag: 'fighters', count: 4, spacing: 110 }],
          targets: [{ tag: 'fighters' }],
        },
        { id: 'engine-room', type: 'reach', title: 'Reach the command ship', zone: { x: 270, y: 520, r: 80 } },
      ],
      medals: { bronze: 90, silver: 45, gold: 28, bonus: { kind: 'killCount', count: 30, text: 'Ace: shoot down 30 fighters before reaching the command ship' } },
    },
    {
      id: 'fp-2',
      name: '2. Retreat',
      briefing: [
        'The engines are dead. Get out through a second dogfight.',
        'You will be shot down at the end: that is part of the script and does not count as a death.',
        '(Placeholder level: survive, then a scripted shoot-down.)',
      ],
      ship: { id: 'vanguard' },
      objectives: [
        {
          id: 'retreat',
          type: 'survive',
          title: 'Survive the retreat',
          seconds: 12,
          spawns: [{ wave: 'l1w1' }],
          beats: [{ at: 1, do: 'text', speaker: 'DELTA LEAD', text: 'All Delta, fall back. Fall back!' }],
        },
        {
          id: 'shot-down',
          type: 'survive',
          title: 'Hit!',
          seconds: 99,
          beats: [
            { at: 0.5, do: 'text', speaker: 'DELTA LEAD', text: 'You are hit! Eject, eject!' },
            { at: 2, do: 'lockWeapons' },
            { at: 2.2, do: 'forceDestroyPlayer' },
            { at: 4.5, do: 'completeObjective' },
          ],
        },
      ],
      medals: { bronze: 60, silver: 30, gold: 20, bonus: { kind: 'hitless', text: 'Untouched: take no hits during the retreat' } },
    },
    {
      id: 'fp-3',
      name: '3. Freefall',
      briefing: [
        'Your ship falls through the arctic atmosphere. You cannot shoot. Dodge the debris and the mountain peaks.',
        '(Placeholder level: weapons locked, survive a short fall. The scrolling level and the obstacles come later.)',
      ],
      ship: { id: 'vanguard' },
      objectives: [
        {
          id: 'fall',
          type: 'survive',
          title: 'Survive the fall',
          seconds: 15,
          weaponsLocked: true,
          beats: [{ at: 0.5, do: 'text', text: 'Weapons offline. Just stay alive.' }],
        },
      ],
      medals: { bronze: 45, silver: 25, gold: 18, bonus: { kind: 'noDamage', text: 'Undamaged: take no damage from debris or peaks' } },
    },
  ],
  completionUnlock: { kind: 'cards', id: 'campaign-test-fallen-peace', label: 'TEST UNLOCK: Fallen Peace slice 1' },
};

export const CAMPAIGNS: CampaignDefinition[] = [FALLEN_PEACE, FRAMEWORK_TEST];

export function findLevel(levelId: string): { campaign: CampaignDefinition; level: CampaignLevel; index: number } | null {
  for (const campaign of CAMPAIGNS) {
    const index = campaign.levels.findIndex((l) => l.id === levelId);
    if (index >= 0) return { campaign, level: campaign.levels[index], index };
  }
  return null;
}
