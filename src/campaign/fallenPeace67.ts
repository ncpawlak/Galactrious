/**
 * "Fallen Peace", slice 3: chapters 6 and 7 (DESIGN.md "As built: Fallen Peace chapters 6-7"). Registered in `content.ts`
 * (`FALLEN_PEACE.levels.push(...CHAPTERS_6_7)`); names come from `names.ts` (placeholders). Both follow the mission design standard:
 * a briefing, an approach beat, constant engagement, time-gated progress and an exit cinematic.
 *
 *  6. Escape and reunion: the player flies the commandeered `empire-fighter`. Opening cinematic (the pull-up), then the climb
 *     out of the atmosphere (`fp6-climb`, 120 s, interceptors all the way, the storm calming), then the reunion cinematic as the
 *     objective's `outro`. Bonus: a clean climb (no damage).
 *  7. Finale: the capital ship restored from chapter 1's snapshot (or the generated fallback) as the finale variant
 *     (`capital-ship-finale`), the armour made carvable by the empire frequency (`armourResonance`), named aces, timed squad
 *     assists on a fixed script, the core overload, the victory cinematic, then the unlock reveal. Bonus: Full dismantle.
 */
import { CAPITAL_FINALE_ID } from '../bosses/capitalShipFinale';
import { CAPITAL_SHIP_ID } from '../bosses/capitalShip';
import { CAPITAL_SNAPSHOT_SLOT } from './fallenPeace';
import { FP6_OPEN, FP6_REUNION, FP7_APPROACH, FP7_VICTORY } from './fallenPeace67Cinematics';
import { COMMAND, COMMAND_SHIP_NAME, EMPIRE_CONTROL, SQUAD_LEADER, WINGMAN_1, WINGMAN_2 } from './names';
import type { AssistSpec, Beat, CampaignLevel } from './types';

/** The commandeered empire fighter with the campaign's preset loadout (no builder, no cards). */
export const EMPIRE_SHIP = { id: 'empire-fighter', loadout: { main: 'laser', aux: ['wave', 'gauss', 'rocket'] }, power: { damage: 1.25, fireRate: 1.25 } };
/** Chapter 7 only: the capital ship is the toughest thing in the campaign, so the guns hit much harder (measured, DESIGN.md). */
export const FINALE_SHIP = { ...EMPIRE_SHIP, power: { damage: 2.2, fireRate: 1.25 } };

const CHAPTER_6: CampaignLevel = {
  id: 'fp-6',
  name: '6. Escape and reunion',
  briefing: [
    'You are flying their ship now: an empire fighter, taken in the hangar. It is faster and tougher than anything Delta has, and every empire pilot on Orini knows it was stolen.',
    'Climb out of the atmosphere. The storm will rage at first and calm as you rise; the planet falls away below you. Empire interceptors will be on you the whole way, from above, from the sides and from behind. Your hull takes six hits.',
    'Somewhere above the cloud, Delta squad is searching for you. Get there alive.',
  ],
  ship: EMPIRE_SHIP,
  objectives: [
    {
      id: 'climb',
      type: 'scroll',
      title: 'Climb out of the atmosphere',
      scroll: 'fp6-climb',
      intro: FP6_OPEN,
      beats: [
        { at: 1, do: 'text', speaker: 'SYSTEM', text: 'Interceptors above, beside and behind. Their fire is slow: read it and weave.' },
        { at: 16, do: 'text', speaker: EMPIRE_CONTROL, text: 'It is still climbing! Do not let it reach orbit!', seconds: 3.4 },
        { at: 34, do: 'text', speaker: 'SYSTEM', text: 'Cloud thinning. Storm easing.' },
        { at: 52, do: 'text', speaker: EMPIRE_CONTROL, text: 'All units, converge. It is nearly through the cloud deck.', seconds: 3.4 },
        { at: 66, do: 'text', speaker: 'SYSTEM', text: 'Above the cloud. The planet is falling away. Open space ahead.' },
        { at: 86, do: 'text', speaker: 'SYSTEM', text: 'Empire ace on an intercept course.' },
        { at: 104, do: 'text', speaker: 'SYSTEM', text: 'Unknown signal ahead. Orbit in 15 seconds.' },
      ],
      outro: FP6_REUNION,
    },
  ],
  // The climb lasts a fixed 120 s whatever you do, so the gold time (110 s) cannot be beaten: gold here is the clean-climb bonus (like chapter 3).
  // Silver = a run with no death; a death restarts the climb, so it lands on bronze. Measured: DESIGN.md "As built: Fallen Peace chapters 6-7".
  medals: { bronze: 300, silver: 150, gold: 110, bonus: { kind: 'noDamage', text: 'Clean climb: reach orbit without taking damage' } },
};

/** The squad's repertoire; a phase takes `count` of them from `shift` on, one every 20 s from `first` s (each announced 4 s ahead). */
const ASSIST_CYCLE: AssistSpec[] = [
  { kind: 'strafeRun', x: 270, width: 220, warn: 4 },
  { kind: 'distract', seconds: 6, warn: 4 },
  { kind: 'coverFire', x: 270, y: 700, r: 170, seconds: 2.2, warn: 4 },
  { kind: 'strafeRun', x: 130, width: 200, warn: 4 },
  { kind: 'distract', seconds: 7, warn: 4 },
  { kind: 'strafeRun', x: 410, width: 200, warn: 4 },
  { kind: 'coverFire', x: 270, y: 640, r: 190, seconds: 2.4, warn: 4 },
  { kind: 'strafeRun', x: 270, width: 240, warn: 4 },
];
const assists = (first: number, count: number, shift: number): Beat[] =>
  Array.from({ length: count }, (_, k): Beat => ({ at: first + k * 20, do: 'assist', assist: ASSIST_CYCLE[(shift + k) % ASSIST_CYCLE.length] }));

/** Constant pressure: a harassment group (chapter 1 fighters) every 15 s from `first`, `count` of them. */
function pressure(first: number, count: number, wave0 = 0): Beat[] {
  const ids = ['fp1-harass-a', 'fp1-harass-b'];
  return Array.from({ length: count }, (_, k): Beat => ({ at: first + k * 15, do: 'spawn', spawn: { wave: ids[(k + wave0) % 2] } }));
}

/** Phase lengths (s) of the time-gated finale phases; phase 3 runs until the core goes. */
const P1_SECONDS = 55;
const P2_SECONDS = 70;
/** Snapshot slots written at the end of phase 1 and phase 2 (the checkpoint a death restores). */
const SLOT_P2 = 'fp7-phase-2';
const SLOT_P3 = 'fp7-phase-3';

const CHAPTER_7: CampaignLevel = {
  id: 'fp-7',
  name: '7. Finale',
  briefing: [
    `${COMMAND_SHIP_NAME} is adrift with dead engines, but its engineers are rebuilding the drive. When it lights, the ship jumps away with the whole fleet. You have a few minutes.`,
    'Your guns fire on the empire\'s own frequency, so for the first time its armour will give. Dig through it to the shield projector and the weapons control, destroy them, and take out the core. Delta cannot touch the armour: the squad covers you on a fixed schedule, so watch for the ASSIST INCOMING ring and use it.',
    'Named empire aces will hunt you the whole way. Stay alive.',
  ],
  ship: FINALE_SHIP,
  // Three checkpointed phases (a death restarts only the current phase, with a full hull, from the capital ship as it was at the
  // phase start: each phase writes its end state to a snapshot slot and the next restores it). Chapter 1's snapshot starts phase 1.
  objectives: [
    {
      id: 'phase-aces',
      type: 'bossFight',
      title: 'Phase 1: hold off the aces',
      scroll: 'fp7-finale',
      bossId: CAPITAL_FINALE_ID,
      restoreSlot: CAPITAL_SNAPSHOT_SLOT,
      restoreBossId: CAPITAL_SHIP_ID,
      snapshotSlot: SLOT_P2,
      phaseSeconds: P1_SECONDS,
      armourResonance: 1.2,
      coreHp: 24000,
      intro: FP7_APPROACH,
      beats: [
        { at: 3, do: 'text', speaker: SQUAD_LEADER, text: 'It is cracking! Rookie, the armour is giving!' },
        { at: 6, do: 'spawn', spawn: { unit: 'empire-ace-viper', x: 150, y: 230, tag: 'aces' } },
        { at: 20, do: 'text', speaker: WINGMAN_1, text: 'Viper is on you, rookie! We have the fighters.' },
        { at: 28, do: 'spawn', spawn: { unit: 'empire-ace-cinder', x: 390, y: 250, tag: 'aces' } },
        { at: 31, do: 'text', speaker: COMMAND, text: 'A second ace. They are calling in their best.' },
        { at: 44, do: 'text', speaker: SQUAD_LEADER, text: 'Squad strike incoming. Use the cover and dig.' },
        ...pressure(8, 4),
        ...assists(14, 3, 0),
      ],
    },
    {
      id: 'phase-dig',
      type: 'bossFight',
      title: 'Phase 2: dig to the rooms and guns',
      scroll: 'fp7-finale',
      bossId: CAPITAL_FINALE_ID,
      restoreSlot: SLOT_P2,
      snapshotSlot: SLOT_P3,
      phaseSeconds: P2_SECONDS,
      armourResonance: 0.1,
      beats: [
        { at: 1, do: 'text', speaker: COMMAND, text: 'Engineers report drive power at one quarter.' },
        { at: 5, do: 'spawn', spawn: { unit: 'empire-ace-raven', x: 270, y: 210, tag: 'aces' } },
        { at: 7, do: 'text', speaker: WINGMAN_2, text: 'A third ace! Raven! Rookie, watch your six!' },
        { at: 30, do: 'spawn', spawn: { unit: 'empire-ace-viper', x: 150, y: 230, tag: 'aces' } },
        { at: 32, do: 'text', speaker: SQUAD_LEADER, text: 'Find the shield projector and the weapons room. Those guns die with them.' },
        { at: 55, do: 'text', speaker: COMMAND, text: 'Drive power at one half. Faster, Delta.' },
        ...pressure(6, 5, 1),
        { at: 20, do: 'spawn', spawn: { wave: 'fp1-harass-c' } },
        ...assists(10, 4, 3),
      ],
    },
    {
      id: 'phase-core',
      type: 'bossFight',
      title: 'Phase 3: break the core',
      scroll: 'fp7-finale',
      bossId: CAPITAL_FINALE_ID,
      restoreSlot: SLOT_P3,
      armourResonance: 0.1,
      overload: true,
      outro: FP7_VICTORY,
      beats: [
        { at: 1, do: 'text', speaker: COMMAND, text: 'Three quarters. The drive is almost lit!' },
        { at: 4, do: 'spawn', spawn: { unit: 'empire-ace-cinder', x: 390, y: 250, tag: 'aces' } },
        { at: 6, do: 'spawn', spawn: { unit: 'empire-ace-raven', x: 150, y: 220, tag: 'aces' } },
        { at: 30, do: 'text', speaker: SQUAD_LEADER, text: 'Drive at ninety percent! Break her now, rookie!' },
        ...pressure(8, 12, 0),
        { at: 40, do: 'spawn', spawn: { wave: 'fp1-harass-c' } },
        ...assists(10, 12, 7),
      ],
    },
  ],
  // Measured with the dodging bot (DESIGN.md "As built: Fallen Peace chapters 6-7"): 149 to 172 s over three phases, no deaths. Gold by time is a clean, efficient run, or the Full dismantle bonus.
  medals: { bronze: 450, silver: 290, gold: 200, bonus: { kind: 'dismantle', rooms: 2, turrets: 6, text: 'Full dismantle: destroy both rooms and all six guns before the core goes' } },
};

export const CHAPTERS_6_7: CampaignLevel[] = [CHAPTER_6, CHAPTER_7];
