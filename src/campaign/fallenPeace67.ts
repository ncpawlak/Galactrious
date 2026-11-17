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
import type { Beat, CampaignLevel } from './types';

/** The commandeered empire fighter with the campaign's preset loadout (no builder, no cards). */
export const EMPIRE_SHIP = { id: 'empire-fighter', loadout: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] } };

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

/** Squad assists on a fixed timer the player cannot change (every one announced 4 s ahead): one every 20 s. */
const FP7_ASSISTS: Beat[] = [
  { at: 14, do: 'assist', assist: { kind: 'strafeRun', x: 270, width: 220, warn: 4 } },
  { at: 34, do: 'assist', assist: { kind: 'distract', seconds: 6, warn: 4 } },
  { at: 54, do: 'assist', assist: { kind: 'coverFire', x: 270, y: 700, r: 170, seconds: 2.2, warn: 4 } },
  { at: 74, do: 'assist', assist: { kind: 'strafeRun', x: 130, width: 200, warn: 4 } },
  { at: 94, do: 'assist', assist: { kind: 'distract', seconds: 7, warn: 4 } },
  { at: 114, do: 'assist', assist: { kind: 'strafeRun', x: 410, width: 200, warn: 4 } },
  { at: 134, do: 'assist', assist: { kind: 'coverFire', x: 270, y: 640, r: 190, seconds: 2.4, warn: 4 } },
  { at: 154, do: 'assist', assist: { kind: 'strafeRun', x: 270, width: 240, warn: 4 } },
  { at: 174, do: 'assist', assist: { kind: 'distract', seconds: 7, warn: 4 } },
  { at: 194, do: 'assist', assist: { kind: 'strafeRun', x: 150, width: 200, warn: 4 } },
  { at: 214, do: 'assist', assist: { kind: 'coverFire', x: 270, y: 700, r: 190, seconds: 2.4, warn: 4 } },
  { at: 234, do: 'assist', assist: { kind: 'strafeRun', x: 400, width: 200, warn: 4 } },
];

/** Constant pressure: a harassment group (chapter 1's fighters) every 15 s from 8 s, plus a gunship at 52 s and 130 s. */
function pressure(): Beat[] {
  const out: Beat[] = [];
  const ids = ['fp1-harass-a', 'fp1-harass-b'];
  for (let k = 0; k < 18; k++) out.push({ at: 8 + k * 15, do: 'spawn', spawn: { wave: ids[k % ids.length] } });
  // Two gunships over the whole fight: a heavy hitter to break the rhythm.
  out.push({ at: 52, do: 'spawn', spawn: { wave: 'fp1-harass-c' } }, { at: 130, do: 'spawn', spawn: { wave: 'fp1-harass-c' } });
  return out;
}

const CHAPTER_7: CampaignLevel = {
  id: 'fp-7',
  name: '7. Finale',
  briefing: [
    `${COMMAND_SHIP_NAME} is adrift with dead engines, but its engineers are rebuilding the drive. When it lights, the ship jumps away with the whole fleet. You have a few minutes.`,
    'Your guns fire on the empire\'s own frequency, so for the first time its armour will give. Dig through it to the shield projector and the weapons control, destroy them, and take out the core. Delta cannot touch the armour: the squad covers you on a fixed schedule, so watch for the ASSIST INCOMING ring and use it.',
    'Named empire aces will hunt you the whole way. Stay alive.',
  ],
  ship: EMPIRE_SHIP,
  objectives: [
    {
      id: 'finale',
      type: 'bossFight',
      title: 'Break the command ship',
      scroll: 'fp7-finale',
      bossId: CAPITAL_FINALE_ID,
      restoreSlot: CAPITAL_SNAPSHOT_SLOT,
      restoreBossId: CAPITAL_SHIP_ID,
      armourResonance: 1.2,
      overload: true,
      coreHp: 24000,
      intro: FP7_APPROACH,
      outro: FP7_VICTORY,
      beats: [
        { at: 3, do: 'text', speaker: SQUAD_LEADER, text: 'It is cracking! Rookie, the armour is giving!' },
        // Phase 1: the aces.
        { at: 6, do: 'spawn', spawn: { unit: 'empire-ace-viper', x: 150, y: 230, tag: 'aces' } },
        { at: 20, do: 'text', speaker: WINGMAN_1, text: 'Viper is on you, rookie! We have the fighters.' },
        { at: 30, do: 'spawn', spawn: { unit: 'empire-ace-cinder', x: 390, y: 250, tag: 'aces' } },
        { at: 33, do: 'text', speaker: COMMAND, text: 'A second ace. They are calling in their best.' },
        { at: 48, do: 'text', speaker: SQUAD_LEADER, text: 'Squad strike incoming. Use the cover and dig.' },
        // Phase 2: dig to the rooms; the squad cannot hurt the armour.
        { at: 62, do: 'text', speaker: COMMAND, text: 'Engineers report drive power at one quarter.' },
        { at: 70, do: 'spawn', spawn: { unit: 'empire-ace-raven', x: 270, y: 210, tag: 'aces' } },
        { at: 72, do: 'text', speaker: WINGMAN_2, text: 'A third ace! Raven! Rookie, watch your six!' },
        { at: 110, do: 'text', speaker: SQUAD_LEADER, text: 'Find the shield projector and the weapons room. Those guns die with them.' },
        { at: 140, do: 'text', speaker: COMMAND, text: 'Drive power at one half. Faster, Delta.' },
        { at: 175, do: 'text', speaker: COMMAND, text: 'Three quarters. The drive is almost lit!' },
        { at: 205, do: 'text', speaker: SQUAD_LEADER, text: 'Drive at ninety percent! Break her now, rookie!' },
        ...pressure(),
        ...FP7_ASSISTS,
      ],
    },
  ],
  // Measured with the dodging bot (DESIGN.md "As built: Fallen Peace chapters 6-7"): 149 to 167 s, no deaths. Gold by time is a clean, efficient run, or the Full dismantle bonus.
  medals: { bronze: 450, silver: 280, gold: 190, bonus: { kind: 'dismantle', rooms: 2, turrets: 6, text: 'Full dismantle: destroy both rooms and all six guns before the core goes' } },
};

export const CHAPTERS_6_7: CampaignLevel[] = [CHAPTER_6, CHAPTER_7];
