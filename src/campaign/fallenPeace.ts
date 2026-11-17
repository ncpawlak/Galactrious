/**
 * "Fallen Peace", slice 1: chapters 1 to 3 (DESIGN.md "Campaign 1" and "As built: Fallen Peace chapters 1-3"). Chapters 4 to 7
 * are other sessions' work: append their `CampaignLevel`s to `FALLEN_PEACE.levels`. Every chapter follows the mission design
 * standard (DESIGN.md "Cinematic and mission design standard"): a briefing, constant engagement, an approach beat before the big
 * fight, and an exit cinematic (an objective `outro`) instead of an abrupt end.
 *
 *  1. Dogfight: closed screen. Objective 1 is a TIME-GATED fighter stream (`survive`, 55 s; the Ace bonus is "30 fighters before
 *     the time runs out"), its outro the fighters breaking off. Objective 2 `bossFight`: an `intro` where the armoured capital ship
 *     descends, invincible, with commentary; done when the ENGINE ROOM dies (snapshot to slot `capital-ship`); an `outro` with the
 *     engine-room explosion and the ship's 180 off the bottom of the screen.
 *  2. Retreat: scrolling, space the whole way, about 60 s. One `escape` objective (reach the jump gate); the outro is the shoot-down
 *     and the fall toward the planet (scripted: not a death).
 *  3. Freefall: scrolling, weapons locked, starts crippled (2 hp, burning), flown backwards. One `scroll` objective; the outro is the
 *     crash on the ridge, the whiteout and the fade.
 */
import { FP2_EXIT_DISTANCE } from '../scroll/fallenPeace';
import { CAPITAL_SHIP_ID } from '../bosses/capitalShip';
import { STREAM_SECONDS } from '../enemies/empireWaves';
import { FP1_APPROACH, FP1_BREAK_OFF, FP1_EXIT, FP2_SHOT_DOWN, FP3_CRASH } from './fallenPeaceCinematics';
import { FALLEN_PEACE_45_LEVELS } from './fallenPeace45';
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
    'Fight through the dogfight. The enemy will not stop coming: when one group goes down the next is already on you. Your wingmen are in it with you, but this strike is yours.',
    'The command ship wears armour that nothing of ours can scratch, all but one gap at its stern. Carve through to the engine room and blow it up.',
  ],
  ship: DELTA_SHIP,
  objectives: [
    {
      id: 'fighters',
      type: 'survive',
      title: 'Break through the fighters',
      label: 'HOLD THE LINE',
      scroll: 'fp1-space',
      seconds: STREAM_SECONDS + 3,
      spawns: [{ wave: 'fp1-stream', tag: 'fighters' }],
      beats: [
        { at: 1, do: 'text', speaker: LEAD, text: 'All Delta, break and attack. Rookie, stay on my wing.' },
        { at: 14, do: 'text', speaker: COMMAND, text: 'Bandits everywhere. Keep them off the strike run.' },
        { at: 23, do: 'text', speaker: LEAD, text: 'Gunships coming in. Mind their wing guns.' },
        { at: 40, do: 'text', speaker: COMMAND, text: 'Command ship is closing. Hold them a little longer.' },
      ],
      outro: FP1_BREAK_OFF,
    },
    {
      id: 'engine-room',
      type: 'bossFight',
      title: 'Blow up the engine room',
      scroll: 'fp1-siege',
      bossId: CAPITAL_SHIP_ID,
      until: { room: 'engine' },
      snapshotSlot: CAPITAL_SNAPSHOT_SLOT,
      intro: FP1_APPROACH,
      beats: [
        { at: 30, do: 'text', speaker: LEAD, text: 'Keep digging, rookie. We will keep the fighters off you.' },
        ...harassment(),
      ],
      outro: FP1_EXIT,
    },
  ],
  // Measured with a scripted run (DESIGN.md): see the numbers there.
  medals: { bronze: 300, silver: 220, gold: 160, bonus: { kind: 'destroyAll', tag: 'fighters', count: 30, text: 'Ace: shoot down 30 fighters before the time runs out' } },
};

const CHAPTER_2: CampaignLevel = {
  id: 'fp-2',
  name: '2. Retreat',
  briefing: [
    'The engines are dead and the command ship is adrift. The strike worked.',
    'Now the empire wants its revenge. Delta squad is falling back toward the jump gate through a second dogfight, and the enemy is not holding formation: they are making passes, from above, from the sides and from behind.',
    'Reach the jump gate before the timer runs out.',
  ],
  ship: DELTA_SHIP,
  objectives: [
    {
      id: 'retreat',
      type: 'escape',
      title: 'Reach the jump gate',
      scroll: 'fp2-retreat',
      exit: { x: 270, y: 340, r: 120 },
      gate: true,
      exitAtDistance: FP2_EXIT_DISTANCE,
      // The gate opens at 50 s; the timer gives the player 25 s past that to get there.
      timer: 75,
      beats: [
        { at: 0.5, do: 'text', speaker: LEAD, text: 'Engines are dead. Nice shooting, rookie. Now we get out of here.' },
        { at: 7, do: 'text', speaker: COMMAND, text: 'All Delta, withdraw. Empire reinforcements inbound from above.' },
        { at: 13, do: 'text', speaker: LEAD, text: 'Bandit on your six! Keep moving!' },
        { at: 26, do: 'text', speaker: LEAD, text: 'Flak ahead. Watch the markers, they go off where you are.' },
        { at: 36, do: 'text', speaker: LEAD, text: 'Rookie, you are ahead of us. Hit the gate, we are right behind you!' },
        { at: 43, do: 'text', speaker: LEAD, text: 'We are pinned down back here! Go, rookie, go!' },
        { at: 49, do: 'text', speaker: COMMAND, text: 'The jump gate is open. Get to it, rookie!' },
      ],
      // Scripted: the shoot-down is not a death. Nothing restarts and nothing counts.
      outro: FP2_SHOT_DOWN,
    },
  ],
  medals: { bronze: 130, silver: 80, gold: 58, bonus: { kind: 'hitless', text: 'Untouched: take no hits during the retreat' } },
};

const CHAPTER_3: CampaignLevel = {
  id: 'fp-3',
  name: '3. Freefall',
  briefing: [
    'Your ship is crippled and burning, and it is falling tail first through the upper atmosphere of Orini, over the arctic ice. The planet surface is ahead of you, at the top of the screen.',
    'You cannot shoot. Your guns are dead and the hull will not take much: two hits. Debris that is falling faster than you will overtake you from below and from the sides, and mountain ranges rise out of the cloud ahead.',
    'Dodge, and stay alive until you hit the ground.',
  ],
  ship: DELTA_SHIP,
  // Crippled: two hull points, burning, and after a death the checkpoint gives you the same two back, not a full hull.
  startHealth: 2,
  forceDamageFx: true,
  objectives: [
    {
      id: 'fall',
      type: 'scroll',
      title: 'Survive the fall',
      scroll: 'fp3-freefall',
      weaponsLocked: true,
      beats: [
        { at: 0.5, do: 'text', speaker: 'SYSTEM', text: 'WEAPONS OFFLINE. HULL CRITICAL. STAY ALIVE.' },
        { at: 9, do: 'text', speaker: 'SYSTEM', text: 'Debris falling faster than you. Watch below and the sides.' },
        { at: 30, do: 'text', speaker: 'SYSTEM', text: 'Mountains ahead. Altitude 5000.' },
        { at: 62, do: 'text', speaker: 'SYSTEM', text: 'Storm cell. Visibility falling.' },
        { at: 95, do: 'text', speaker: 'SYSTEM', text: 'Ground contact in fifteen seconds.' },
      ],
      outro: FP3_CRASH,
    },
  ],
  // The fall lasts a fixed 111 s whatever you do (the world scrolls at a set pace), so the gold time (105 s) cannot be beaten: gold here is the Undamaged
  // route. Silver is a run with no death (hits allowed: the ship has two); a restart adds the time of the failed attempt.
  medals: { bronze: 220, silver: 125, gold: 105, bonus: { kind: 'noDamage', text: 'Undamaged: take no damage from debris or peaks' } },
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
  levels: [CHAPTER_1, CHAPTER_2, CHAPTER_3, ...FALLEN_PEACE_45_LEVELS],
  // TEST UNLOCK: a placeholder flag so the unlock flow can be seen working after chapters 1-3. Slice 3 replaces it with the real
  // reward (the enemy ship, the Laser and the Energy Wave) when chapter 7 is the last level.
  completionUnlock: { kind: 'cards', id: 'campaign-test-fallen-peace', label: 'TEST UNLOCK: Fallen Peace slice 1' },
};
