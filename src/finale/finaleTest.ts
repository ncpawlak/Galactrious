import { CAPITAL_SHIP_ID } from '../bosses/capitalShip';
import type { Beat, CampaignDefinition, CampaignLevel } from '../campaign/types';
import { FALLEN_PEACE_UNLOCKS } from './unlocks';

/**
 * The finale test level (`game.debug.campaign.start('finale-test')`): every finale system end to end in about three minutes, as the
 * model a chapter 7 is built from. The player flies the `empire-fighter` against the capital ship restored from the chapter 1 snapshot
 * (or the generated disabled ship when none is saved), the armour becomes carvable 8 s in, two named aces come in, timed assists fire on
 * a fixed timer (a strafing run, a decoy, cover fire), and when the core dies the overload sequence plays and then the unlock reveal.
 * Its unlock list is the real "Fallen Peace" reward (this is a debug campaign: playing it to the end unlocks those items in your save).
 */
const COMMAND = 'ORINI COMMAND';
const LEAD = 'DELTA LEAD';

/** Assist timeline: every one is announced 4 s ahead by the HUD. Lanes and circles are drawn while the countdown runs. */
const ASSISTS: Beat[] = [
  { at: 16, do: 'assist', assist: { kind: 'strafeRun', x: 270, width: 220, warn: 4 } },
  { at: 36, do: 'assist', assist: { kind: 'distract', seconds: 6, warn: 4 } },
  { at: 62, do: 'assist', assist: { kind: 'coverFire', x: 270, y: 700, r: 170, seconds: 2.2, warn: 4 } },
  { at: 84, do: 'assist', assist: { kind: 'strafeRun', x: 130, width: 200, warn: 4 } },
  { at: 104, do: 'assist', assist: { kind: 'distract', seconds: 7, warn: 4 } },
  { at: 130, do: 'assist', assist: { kind: 'strafeRun', x: 410, width: 200, warn: 4 } },
  { at: 150, do: 'assist', assist: { kind: 'coverFire', x: 270, y: 640, r: 190, seconds: 2.4, warn: 4 } },
];

const LEVEL: CampaignLevel = {
  id: 'finale-test',
  name: 'Finale Test',
  briefing: [
    'A debug level that exercises every finale system: the capital ship restored from the chapter 1 snapshot (or a generated disabled one), the empire fighter, the armour resonance, two named aces, timed squad assists, the core overload and the unlock reveal.',
    'You are flying the commandeered empire fighter. Its guns fire on the empire frequency: 8 seconds in, the armour becomes hittable. Dig to the core.',
    'The squad covers on a fixed timer you cannot change. Watch for the ASSIST INCOMING ring.',
  ],
  ship: { id: 'empire-fighter', loadout: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] } },
  objectives: [
    {
      id: 'finale',
      type: 'bossFight',
      title: 'Break the command ship',
      bossId: CAPITAL_SHIP_ID,
      restoreSlot: 'capital-ship',
      scroll: 'fp1-siege',
      armourResonance: 8,
      overload: true,
      coreHp: 30000, // the chapter 1 core is untouchable (3000 hp, 5% damage); with the armour open it dies in seconds under focus fire, so the test restores it fat
      beats: [
        { at: 0.5, do: 'text', speaker: COMMAND, text: 'That is the command ship, exactly as you left it. Engines dead. Engineers are rebuilding the drive.' },
        { at: 2, do: 'spawn', spawn: { unit: 'empire-ace-viper', x: 150, y: 230, tag: 'aces' } },
        { at: 6, do: 'text', speaker: LEAD, text: 'Rookie, you are in their ship. Their armour answers to your guns now.' },
        { at: 12, do: 'text', speaker: LEAD, text: 'We cannot touch the armour. We will keep their aces off you. Stay alive and dig.' },
        { at: 45, do: 'spawn', spawn: { unit: 'empire-ace-cinder', x: 390, y: 250, tag: 'aces' } },
        { at: 47, do: 'text', speaker: COMMAND, text: 'A second ace. They are calling in their best.' },
        ...ASSISTS,
      ],
    },
  ],
  medals: { bronze: 330, silver: 240, gold: 180, bonus: { kind: 'destroyAll', tag: 'aces', count: 2, text: 'Ace hunter: shoot down both aces' } },
};

export const FINALE_TEST: CampaignDefinition = {
  id: 'finale-test',
  name: 'Finale Test',
  intro: ['Debug campaign. One level that exercises the finale systems. Finishing it unlocks the Fallen Peace rewards in your save.'],
  levels: [LEVEL],
  unlocks: FALLEN_PEACE_UNLOCKS,
};
