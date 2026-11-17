/**
 * "Fallen Peace", slice 1: chapters 1 to 3 (DESIGN.md "Campaign 1" and "As built: Fallen Peace chapters 1-3"). Chapters 4 to 7
 * are other sessions' work: append their `CampaignLevel`s to `FALLEN_PEACE.levels`.
 *
 * Timeline of the three chapters, with the medal numbers measured in a scripted run (see DESIGN.md):
 *  1. Dogfight: closed screen. Objective 1 `destroy` (four fighter waves, gunships in the last), objective 2 `bossFight` (the
 *     armoured capital ship; done when the ENGINE ROOM dies; its snapshot is saved to the campaign progress, slot `capital-ship`).
 *  2. Retreat: scrolling. Objective 1 `escape` (reach the exit before the timer, flybys all the way), objective 2 `survive` with the
 *     scripted shoot-down (`forceDestroyPlayer`: not a death) that ends the chapter.
 *  3. Freefall: scrolling, weapons locked, objective `scroll` over the debris and peak level; the crash is the last beat.
 */
import { FP2_EXIT_DISTANCE } from '../scroll/fallenPeace';
import { CAPITAL_SHIP_ID } from '../bosses/capitalShip';
import type { Beat, CampaignDefinition, CampaignLevel } from './types';

/** The preset Delta rookie ship and loadout: no builder, no cards. */
export const DELTA_SHIP = { id: 'delta-rookie', loadout: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] } };

/** The snapshot slot the capital ship is saved to when chapter 1's engine room goes (chapter 7 restores it). */
export const CAPITAL_SNAPSHOT_SLOT = 'capital-ship';

const LEAD = 'DELTA LEAD';
const COMMAND = 'ORINI COMMAND';

/** Objective 2 of chapter 1: harassment waves while the player carves, one group every 16 s (a gunship every fourth). */
function harassment(): Beat[] {
  const beats: Beat[] = [];
  const ids = ['fp1-harass-a', 'fp1-harass-b', 'fp1-harass-a', 'fp1-harass-c'];
  for (let k = 0; k < 24; k++) beats.push({ at: 4 + k * 16, do: 'spawn', spawn: { wave: ids[k % ids.length] } });
  return beats;
}

const CHAPTER_1: CampaignLevel = {
  id: 'fp-1',
  name: '1. Dogfight',
  briefing: [
    'Orini, above the arctic ice. The empire has brought its command ship to break Delta squad, and every fighter it owns.',
    'Fight through the dogfight. Your wingmen are in it with you, but this strike is yours.',
    'The command ship wears armour that nothing of ours can scratch, all but one gap at its stern. Carve through to the engine room and blow it up.',
  ],
  ship: DELTA_SHIP,
  objectives: [
    {
      id: 'fighters',
      type: 'destroy',
      title: 'Break through the fighters',
      scroll: 'fp1-space',
      spawns: [{ wave: 'fp1-dogfight', tag: 'fighters' }],
      targets: [{ tag: 'fighters' }],
      beats: [
        { at: 1, do: 'text', speaker: LEAD, text: 'All Delta, break and attack. Rookie, stay on my wing.' },
        { at: 22, do: 'text', speaker: COMMAND, text: 'Bandits everywhere. Keep them off the strike run.' },
        { at: 55, do: 'text', speaker: LEAD, text: 'Gunships coming in. Mind their wing guns.' },
      ],
    },
    {
      id: 'engine-room',
      type: 'bossFight',
      title: 'Blow up the engine room',
      scroll: 'fp1-siege',
      bossId: CAPITAL_SHIP_ID,
      until: { room: 'engine' },
      snapshotSlot: CAPITAL_SNAPSHOT_SLOT,
      beats: [
        { at: 0.5, do: 'text', speaker: COMMAND, text: 'That is the command ship. Its armour is theirs: you cannot touch it.' },
        { at: 5, do: 'text', speaker: COMMAND, text: 'Only the notch at the stern is soft. Dig up through it to the engine room.' },
        { at: 30, do: 'text', speaker: LEAD, text: 'Keep digging, rookie. We will keep the fighters off you.' },
        ...harassment(),
      ],
    },
  ],
  // Measured with a scripted run (DESIGN.md): see the numbers there.
  medals: { bronze: 330, silver: 240, gold: 170, bonus: { kind: 'killCount', count: 30, text: 'Ace: shoot down 30 fighters before the engine room goes' } },
};

const CHAPTER_2: CampaignLevel = {
  id: 'fp-2',
  name: '2. Retreat',
  briefing: [
    'The engines are dead and the command ship is adrift. The strike worked.',
    'Now the empire wants its revenge. Delta squad is falling back toward the jump gate through a second dogfight, and the enemy is not holding formation: they are making passes, from above, from the sides and from behind.',
    'Reach the exit before the timer runs out.',
  ],
  ship: DELTA_SHIP,
  objectives: [
    {
      id: 'retreat',
      type: 'escape',
      title: 'Reach the jump gate',
      scroll: 'fp2-retreat',
      exit: { x: 270, y: 215, r: 95 },
      exitAtDistance: FP2_EXIT_DISTANCE,
      // The exit opens at about 110 s; the timer gives the player 30 s past that to get there.
      timer: 145,
      beats: [
        { at: 0.5, do: 'text', speaker: LEAD, text: 'Engines are dead. Nice shooting, rookie. Now we get out of here.' },
        { at: 8, do: 'text', speaker: COMMAND, text: 'All Delta, withdraw. Empire reinforcements inbound from above.' },
        { at: 14, do: 'text', speaker: LEAD, text: 'Bandit on your six! Keep moving!' },
        { at: 38, do: 'text', speaker: LEAD, text: 'Flak ahead. Watch the markers, they go off where you are.' },
        { at: 52, do: 'text', speaker: LEAD, text: 'Delta 4 is down. Stay with me. Stay with me!' },
        { at: 84, do: 'text', speaker: COMMAND, text: 'The entry corridor is open. Take it, rookie.' },
        { at: 107, do: 'text', speaker: COMMAND, text: 'Jump gate ahead. Get to it!' },
      ],
    },
    {
      id: 'shot-down',
      type: 'survive',
      title: 'Hit!',
      scroll: 'fp2-shot',
      seconds: 99,
      beats: [
        { at: 0.6, do: 'text', speaker: LEAD, text: 'Missile lock! Break, break!' },
        { at: 2.6, do: 'text', speaker: 'SYSTEM', text: 'HULL BREACH. EJECT.' },
        { at: 3.6, do: 'lockWeapons' },
        // Scripted: not a death. The attempt does not restart and the death counter does not move.
        { at: 4.2, do: 'forceDestroyPlayer' },
        { at: 7.5, do: 'completeObjective' },
      ],
    },
  ],
  medals: { bronze: 190, silver: 145, gold: 125, bonus: { kind: 'hitless', text: 'Untouched: take no hits during the retreat' } },
};

const CHAPTER_3: CampaignLevel = {
  id: 'fp-3',
  name: '3. Freefall',
  briefing: [
    'Your ship is gone. What is left of it is falling through the upper atmosphere of Orini, over the arctic ice.',
    'You cannot shoot. Your guns are dead. Touching a piece of debris or a mountain peak damages the hull, and the hull will not take much.',
    'Dodge, and stay alive until you hit the ground.',
  ],
  ship: DELTA_SHIP,
  objectives: [
    {
      id: 'fall',
      type: 'scroll',
      title: 'Survive the fall',
      scroll: 'fp3-freefall',
      weaponsLocked: true,
      beats: [
        { at: 0.5, do: 'text', text: 'Weapons offline. Just stay alive.' },
        { at: 14, do: 'text', speaker: 'SYSTEM', text: 'Debris field. Altitude 9000.' },
        { at: 55, do: 'text', speaker: 'SYSTEM', text: 'Peaks below. Altitude 5000.' },
        { at: 100, do: 'text', speaker: 'SYSTEM', text: 'Ground contact in thirty seconds.' },
      ],
    },
    {
      id: 'crash',
      type: 'survive',
      title: 'Brace!',
      scroll: 'fp3-crash',
      weaponsLocked: true,
      seconds: 99,
      beats: [
        { at: 0.3, do: 'text', text: 'The ice is coming up fast.' },
        // The crash: scripted, not a death, and the chapter ends.
        { at: 3, do: 'forceDestroyPlayer' },
        { at: 6, do: 'completeObjective' },
      ],
    },
  ],
  // The fall lasts a fixed 141 s whatever you do (the world scrolls at a set pace), so the gold time (130 s) cannot be beaten: gold in
  // this chapter is the bonus route, Undamaged. Silver/bronze reward staying alive without restarts (a restart adds 20+ s).
  medals: { bronze: 220, silver: 160, gold: 130, bonus: { kind: 'noDamage', text: 'Undamaged: take no damage from debris or peaks' } },
};

export const FALLEN_PEACE: CampaignDefinition = {
  id: 'fallen-peace',
  name: 'Fallen Peace',
  intro: [
    'Orini was a quiet world of ice and old treaties. The treaties are over.',
    'Delta squad is in a large dogfight above the planet, and you are its newest pilot: a rookie, still learning your ship, and flying anyway.',
    'The mission: fight through the dogfight, reach the enemy command ship and blow up its engine room. Then bring everyone home.',
    'It will not go to plan.',
  ],
  levels: [CHAPTER_1, CHAPTER_2, CHAPTER_3],
  // TEST UNLOCK: a placeholder flag so the unlock flow can be seen working after chapters 1-3. Slice 3 replaces it with the real
  // reward (the enemy ship, the Laser and the Energy Wave) when chapter 7 is the last level.
  completionUnlock: { kind: 'cards', id: 'campaign-test-fallen-peace', label: 'TEST UNLOCK: Fallen Peace slice 1' },
};
