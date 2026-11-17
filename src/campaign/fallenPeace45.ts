/**
 * "Fallen Peace", slice 2: chapters 4 and 5 (DESIGN.md "As built: Fallen Peace chapters 4-5"). Appended to `FALLEN_PEACE.levels`
 * (src/campaign/fallenPeace.ts). Every chapter follows the mission design standard (DESIGN.md "Cinematic and mission design standard").
 *
 *  4. Crash and commandeer: the escape pod (no weapons, 2 hull) creeps through the enemy base at night. Two stealth objectives (a death
 *     restarts the current one): `outer` (a `scroll` objective over `fp4-outer`, the lights taught one at a time) and `yard` (a
 *     `patrolWave` over `fp4-yard`: reach the hangar circle and HOLD it 10 s while the patrol countdown runs). Intro: the wreck in the
 *     snow and the pod ejecting; outro: boarding the empire fighter and lifting out of the hangar (the ship swaps to `empire-fighter`).
 *  5. Surface run: the commandeered `empire-fighter` with the preset loadout over three `scroll` objectives (a checkpoint every
 *     minute) cut from one 178 s authored run (src/scroll/fallenPeace45.ts): defence lines, wall and ground turrets, air squadrons.
 *     Intro: the takeoff under fire; outro: the pull-up toward the atmosphere.
 */
import { FP4_OUTER, FP4_YARD, FP5_A, FP5_B, FP5_C, FP5_TURRETS, YARD_ZONE } from '../scroll/fallenPeace45';
import { FP4_BOARD, FP4_CRASH_SITE, FP4_OUTER_OUT, FP4_YARD_IN, FP5_PULL_UP, FP5_SECTOR_IN, FP5_SECTOR_OUT, FP5_TAKEOFF } from './fallenPeace45Cinematics';
import { ENEMY_BASE_NAME, EMPIRE_NAME, SPEAKER_PLAYER } from './names';
import type { CampaignLevel } from './types';

/** The escape pod: tiny, two hull, no weapons (src/ships.ts). */
export const POD_SHIP = { id: 'escape-pod', loadout: { main: 'chain', aux: [] as string[] } };
/** The commandeered empire fighter with the preset loadout (chain gun, Gauss, Rocket, Arc). Campaign levels may use it whatever the Endless lock says. */
export const EMPIRE_SHIP = { id: 'empire-fighter', loadout: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] } };

const ME = SPEAKER_PLAYER;
const SYS = 'SYSTEM';

export const CHAPTER_4: CampaignLevel = {
  id: 'fp-4',
  name: '4. Crash and commandeer',
  briefing: [
    `You are alive, and alone, in a lifeboat. The pod has two hull points and no weapons. Behind you is the wreck of your ship; ahead, ${ENEMY_BASE_NAME} of ${EMPIRE_NAME} lights the snow like a city.`,
    'Searchlights sweep the base. A light that catches you calls fighters down on you, and they shoot. Stay out of the beams, hide under roofs and in shadow, and break line of sight to make the hunters give up. The buildings, container stacks and bunkers (green outline) are safe: hop from one to the next, and a beam only counts when it touches you outside one (a perfect Silent run exists, hugging the roofs). A patrol sweeps the yard on a timer: when you see PATROL INCOMING, be in cover.',
    'Find the hangar at the far end of the yard and hold its circle for ten seconds. There is a fighter in there with your name on it. Nobody else will notice.',
  ],
  ship: POD_SHIP,
  objectives: [
    {
      id: 'outer',
      type: 'scroll',
      title: 'Cross the outer fence',
      scroll: FP4_OUTER.id,
      intro: FP4_CRASH_SITE,
      outro: FP4_OUTER_OUT,
      beats: [
        { at: 3, do: 'text', speaker: SYS, text: 'SEARCHLIGHT AHEAD. CROSS ITS BEAM AND THEY WILL COME FOR YOU.' },
        { at: 9, do: 'text', speaker: SYS, text: 'ROOFS AND SHADOWS ARE COVER. IN COVER YOU CANNOT BE SEEN.' },
        { at: 15, do: 'text', speaker: SYS, text: 'SAFE ROUTE: HOP ROOF TO ROOF. THE GREEN-EDGED BUILDINGS ARE COVER.' },
        { at: 22, do: 'text', speaker: ME, text: 'Two lights, opposite swings. Wait for the gap, then move.', seconds: 3.6 },
        { at: 36, do: 'text', speaker: ME, text: 'That lamp walks the fence. Keep a roof between us.', seconds: 3.6 },
        { at: 46, do: 'text', speaker: SYS, text: 'PULSING BEAMS. THE DASHED OUTLINE SHOWS WHERE THEY WILL FIRE.' },
      ],
    },
    {
      id: 'yard',
      type: 'patrolWave',
      title: 'Reach the hangar',
      scroll: FP4_YARD.id,
      zone: YARD_ZONE,
      zoneAtDistance: FP4_YARD.length,
      hold: 10,
      // First sweep 30 s in, then every 30 s after it has crossed.
      countdown: 30,
      intro: FP4_YARD_IN,
      outro: FP4_BOARD,
      beats: [
        { at: 4, do: 'text', speaker: ME, text: 'There it is: the hangars, at the far end of the yard.', seconds: 3.4 },
        { at: 17, do: 'text', speaker: SYS, text: 'PATROL SWEEP IN 13. BE UNDER A ROOF WHEN IT PASSES.' },
        { at: 40, do: 'text', speaker: ME, text: 'If they spot me now, I run for the nearest roof and wait them out.', seconds: 3.6 },
        { at: 60, do: 'text', speaker: SYS, text: 'HANGAR DOORS OPEN. HOLD THE CIRCLE FOR TEN SECONDS.' },
      ],
    },
  ],
  // Silent = cross no searchlight. The run is fixed length (the world scrolls at a set pace), so the time medals are set by how many attempts you need.
  medals: { bronze: 330, silver: 210, gold: 140, bonus: { kind: 'noDetection', text: 'Silent: cross no searchlight' } },
};

/** The bonus asks for about two thirds of the turrets: some sit behind plating or behind another line and cannot be reached from a safe line (a perfect-aim bot got 31 of 38). */
const TURRET_GOAL = Math.round(FP5_TURRETS * 0.63);

export const CHAPTER_5: CampaignLevel = {
  id: 'fp-5',
  name: '5. Surface run',
  briefing: [
    "You are in an empire fighter, and the whole base knows it. Its hull is tougher and its weapons are the empire's own, but the base defences are not going to let a stolen ship leave.",
    'Run across the surface to the edge of the atmosphere. Defence lines cut across the way: fly through a gap, or carve a lane through the wall with any weapon (a lane is a few seconds of fire). Turrets are built into the walls and stand on bunker pads. Empire squadrons will come in over you from behind and from the sides.',
    'You have six hull points. Walls hurt when you scrape them. Bonus: destroy most of the turrets on the way.',
  ],
  ship: EMPIRE_SHIP,
  objectives: [
    {
      id: 'sector-a',
      type: 'scroll',
      title: 'Run the first defences',
      scroll: FP5_A.id,
      intro: FP5_TAKEOFF,
      outro: FP5_SECTOR_OUT,
      beats: [
        { at: 8, do: 'text', speaker: SYS, text: 'DEFENCE LINE AHEAD. FLY THE GAP OR CARVE A LANE.' },
        { at: 22, do: 'text', speaker: ME, text: 'Guns in the wall. Cut the turrets first, then the lane.', seconds: 3.6 },
        { at: 36, do: 'text', speaker: SYS, text: 'AIR SQUADRON ON YOUR TAIL.' },
        { at: 50, do: 'text', speaker: ME, text: 'One line down. There will be more.', seconds: 3 },
      ],
    },
    {
      id: 'sector-b',
      type: 'scroll',
      title: 'Break the inner lines',
      scroll: FP5_B.id,
      intro: FP5_SECTOR_IN,
      outro: FP5_SECTOR_OUT,
      beats: [
        { at: 6, do: 'text', speaker: SYS, text: 'MORTARS: A MARKED CIRCLE BLASTS ONE SECOND AFTER IT APPEARS.' },
        { at: 24, do: 'text', speaker: ME, text: 'Tighter gaps now. Carve if I have to.', seconds: 3.2 },
        { at: 42, do: 'text', speaker: SYS, text: 'FLAK BATTERY OVERHEAD. WATCH THE MARKERS.' },
        { at: 55, do: 'text', speaker: ME, text: 'Halfway across. Keep going.', seconds: 3 },
      ],
    },
    {
      id: 'sector-c',
      type: 'scroll',
      title: 'Fight to the edge',
      scroll: FP5_C.id,
      intro: FP5_SECTOR_IN,
      outro: FP5_PULL_UP,
      beats: [
        { at: 6, do: 'text', speaker: ME, text: 'Everything they have, and it is all pointed at me.', seconds: 3.4 },
        { at: 30, do: 'text', speaker: SYS, text: 'ATMOSPHERE EDGE IN 30 SECONDS.' },
        { at: 44, do: 'text', speaker: SYS, text: 'FINAL DEFENCE LINE AHEAD. THIS IS THE LAST WALL.' },
        { at: 54, do: 'text', speaker: ME, text: 'Through it, and up!', seconds: 2.4 },
      ],
    },
  ],
  // The run is fixed length (178 s of scroll): gold by time is just above the clean-run time, so the Turrets bonus is the other way to gold.
  medals: { bronze: 420, silver: 250, gold: 190, bonus: { kind: 'destroyAll', tag: 'ground', count: TURRET_GOAL, text: `Turrets: destroy ${TURRET_GOAL} of the ${FP5_TURRETS} turrets on the run` } },
};

export const FALLEN_PEACE_45_LEVELS: CampaignLevel[] = [CHAPTER_4, CHAPTER_5];
