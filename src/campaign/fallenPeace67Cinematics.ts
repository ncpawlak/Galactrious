/**
 * The cinematics of "Fallen Peace" chapters 6 and 7, in the data format of `cinematic.ts` (DESIGN.md "Cinematic and mission design
 * standard"). Names come from `names.ts` (placeholders). Times are seconds from the start of the cinematic; coordinates are the
 * 540x960 screen.
 *  - `FP6_OPEN`: continues chapter 5's pull-up: the ship climbs into the storm, the empire calls its interceptors.
 *  - `FP6_REUNION`: orbit. Delta (scattered, searching) finds an empire fighter on their scopes, almost fires, the callsign beacon
 *    stops them, the armour and the engineers' rebuild window are explained, the squad forms up.
 *  - `FP7_APPROACH`: the restored capital ship drifts in with dead engines, commentary about the armour and the rebuild window.
 *  - `FP7_VICTORY`: after the core overload: the squad forms up, commentary, all fly off.
 */
import { H } from '../config';
import type { Cinematic } from './cinematic';
import { COMMAND, COMMAND_SHIP_NAME, EMPIRE_CONTROL, PLAYER_CALLSIGN, SQUAD_LEADER, WINGMAN_1, WINGMAN_2, WINGMAN_3 } from './names';

/** Chapter 6 opens where chapter 5 ended: the ship pulling up toward the atmosphere. White cloud tears past, the storm hits. */
export const FP6_OPEN: Cinematic = {
  id: 'fp6-open',
  duration: 9,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0, do: 'weather', intensity: 1, ease: 0.1 },
    { t: 0, do: 'scrollSpeed', speed: 120, ease: 0.1 },
    { t: 1.2, do: 'scrollSpeed', speed: 250, ease: 5 },
    { t: 0.6, do: 'shake', amount: 0.7 },
    { t: 3.2, do: 'shake', amount: 0.5 },
    { t: 5.4, do: 'shake', amount: 0.5 },
  ],
  ship: [
    { t: 0, x: 270, y: H + 20, rot: 0, scale: 1 },
    { t: 3.2, x: 270, y: 840, ease: 'out' },
    { t: 8.6, x: 270, y: 820, ease: 'inOut' },
  ],
  overlays: [
    { t: 0, color: '#f4f8ff', to: 1, duration: 0.01 },
    { t: 0.15, color: '#f4f8ff', to: 0, duration: 2.4 },
  ],
  radio: [
    { t: 0.5, speaker: 'SYSTEM', text: 'AIRFRAME STRESS. CLIMBING THROUGH THE STORM.' },
    { t: 3.4, speaker: EMPIRE_CONTROL, text: 'All interceptors: stolen fighter climbing, sector nine. Bring it down.', static: 0.55, duration: 3.6 },
    { t: 6.6, speaker: 'SYSTEM', text: 'INTERCEPTORS INBOUND. KEEP CLIMBING.' },
  ],
  skippableAfter: 1.5,
};

/**
 * The reunion, about 29 s. Three Delta fighters drop in from above and aim at the ship (red lock-on: an empire fighter on their
 * scopes), count down to fire, and the callsign beacon (green) stops them. Then the exchange about the armour and the engineers, and
 * the wingmen form up beside the ship.
 */
export const FP6_REUNION: Cinematic = {
  id: 'fp6-reunion',
  duration: 29,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0, do: 'dismissUnits' },
    { t: 0, do: 'weather', intensity: 0, ease: 2 },
    { t: 0, do: 'scrollSpeed', speed: 45, ease: 5 },
  ],
  ship: [{ t: 0 }, { t: 2.4, x: 270, y: 660, ease: 'inOut' }],
  props: [
    {
      t: 0,
      do: 'wingmen',
      wings: [
        {
          tag: WINGMAN_1,
          keys: [
            { t: 2.6, x: -60, y: -50, rot: 0 },
            { t: 5.4, x: 120, y: 250, rot: 0.25, ease: 'out' },
            { t: 20.2, x: 120, y: 250, rot: 0.25 },
            { t: 24.0, dx: -86, dy: 46, rot: 0, ease: 'inOut' },
            { t: 27.4, dx: -86, dy: 46, rot: 0 },
          ],
        },
        {
          tag: SQUAD_LEADER,
          keys: [
            { t: 3.0, x: 270, y: -70, rot: 0 },
            { t: 5.8, x: 270, y: 215, rot: 0, ease: 'out' },
            { t: 20.2, x: 270, y: 215, rot: 0 },
            { t: 24.0, dx: 0, dy: 112, rot: 0, ease: 'inOut' },
            { t: 27.4, dx: 0, dy: 112, rot: 0 },
          ],
        },
        {
          tag: WINGMAN_2,
          keys: [
            { t: 3.4, x: 600, y: -50, rot: 0 },
            { t: 6.2, x: 420, y: 250, rot: -0.25, ease: 'out' },
            { t: 20.2, x: 420, y: 250, rot: -0.25 },
            { t: 24.0, dx: 86, dy: 46, rot: 0, ease: 'inOut' },
            { t: 27.4, dx: 86, dy: 46, rot: 0 },
          ],
        },
      ],
    },
    { t: 6.4, do: 'scope', until: 11.4, label: 'UNKNOWN: EMPIRE FIGHTER' },
    { t: 10.6, do: 'beacon', label: `CALLSIGN BEACON: ${PLAYER_CALLSIGN}` },
  ],
  overlays: [{ t: 27.4, color: '#000000', to: 1, duration: 1.4 }],
  radio: [
    { t: 0.5, speaker: 'SYSTEM', text: 'ORBIT REACHED. EMPIRE TRANSPONDER STILL ACTIVE.', duration: 3 },
    { t: 3.6, speaker: WINGMAN_1, text: 'Contact! Empire fighter, alone, closing on our position!' },
    { t: 6.4, speaker: SQUAD_LEADER, text: 'Lock it up. Nothing friendly flies one of those.' },
    { t: 8.4, speaker: SQUAD_LEADER, text: 'Weapons free on my mark. Three...', duration: 2.2 },
    { t: 10.8, speaker: 'SYSTEM', text: `INCOMING BEACON: ${PLAYER_CALLSIGN}.`, duration: 1.6 },
    { t: 12.2, speaker: SQUAD_LEADER, text: 'Rookie? ... Rookie! Hold fire! All Delta, hold fire!' },
    { t: 15.0, speaker: WINGMAN_1, text: 'It cannot be. We watched you go down.' },
    { t: 17.6, speaker: PLAYER_CALLSIGN, text: 'Their ship, their codes. It was the only way out.' },
    { t: 20.4, speaker: SQUAD_LEADER, text: 'Then hear this. Their armour only yields to their own weapon frequency.' },
    { t: 23.0, speaker: WINGMAN_2, text: 'Nothing of ours scratched it. Yours will.' },
    { t: 25.2, speaker: COMMAND, text: `Engineers are rebuilding ${COMMAND_SHIP_NAME}'s engines. We go now.`, duration: 3.2 },
    { t: 27.0, speaker: SQUAD_LEADER, text: 'Form on me, rookie. We finish this together.', duration: 2.2 },
  ],
  skippableAfter: 2,
};

/** The restored capital ship slides in from the top: dead engines, intact armour, the rebuild clock. Weapons off, the ship invincible. */
export const FP7_APPROACH: Cinematic = {
  id: 'fp7-approach',
  duration: 15.2,
  lock: { input: false, weapons: true, enemies: 'hold', invulnerable: true, bossInvincible: true },
  boss: [
    { t: 0, offsetY: -800 },
    { t: 11.4, offsetY: 0, ease: 'inOut' },
  ],
  radio: [
    { t: 0.4, speaker: COMMAND, text: `That is ${COMMAND_SHIP_NAME}, exactly as Rookie left her. Engines dead.` },
    { t: 3.8, speaker: SQUAD_LEADER, text: 'And the hull is whole. Not one of our guns can cut it.' },
    { t: 7.0, speaker: COMMAND, text: 'Their engineers are rebuilding the drive. When it lights, she jumps.' },
    { t: 10.2, speaker: SQUAD_LEADER, text: 'Rookie, you are flying their frequency. Put a round into that armour.' },
    { t: 13.0, speaker: SQUAD_LEADER, text: 'We will cover you. Dig, rookie.', duration: 2.2 },
  ],
  skippableAfter: 1.5,
};

/** After the overload: the squad forms up beside the ship, the fleet breaks off, everyone flies away. Cosmetic. */
export const FP7_VICTORY: Cinematic = {
  id: 'fp7-victory',
  duration: 17,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0, do: 'dismissUnits' },
    { t: 0, do: 'scrollSpeed', speed: 60, ease: 2 },
  ],
  ship: [{ t: 0 }, { t: 3.2, x: 270, y: 650, ease: 'inOut' }, { t: 10.2 }, { t: 14.4, dy: -1100, ease: 'in' }],
  props: [
    {
      t: 0,
      do: 'wingmen',
      wings: [
        {
          tag: SQUAD_LEADER,
          keys: [
            { t: 1.0, x: 120, y: H + 80, rot: 0 },
            { t: 5.0, dx: -86, dy: 46, rot: 0, ease: 'out' },
            { t: 10.2, dx: -86, dy: 46, rot: 0 },
            { t: 14.4, dx: -86, dy: -1050, rot: 0, ease: 'in' },
          ],
        },
        {
          tag: WINGMAN_1,
          keys: [
            { t: 1.6, x: 420, y: H + 80, rot: 0 },
            { t: 5.4, dx: 86, dy: 46, rot: 0, ease: 'out' },
            { t: 10.2, dx: 86, dy: 46, rot: 0 },
            { t: 14.4, dx: 86, dy: -1050, rot: 0, ease: 'in' },
          ],
        },
        {
          tag: WINGMAN_2,
          keys: [
            { t: 2.2, x: 270, y: H + 90, rot: 0 },
            { t: 5.8, dx: -172, dy: 96, rot: 0, ease: 'out' },
            { t: 10.2, dx: -172, dy: 96, rot: 0 },
            { t: 14.4, dx: -172, dy: -1000, rot: 0, ease: 'in' },
          ],
        },
        {
          tag: WINGMAN_3,
          keys: [
            { t: 2.6, x: 330, y: H + 90, rot: 0 },
            { t: 6.2, dx: 172, dy: 96, rot: 0, ease: 'out' },
            { t: 10.2, dx: 172, dy: 96, rot: 0 },
            { t: 14.4, dx: 172, dy: -1000, rot: 0, ease: 'in' },
          ],
        },
      ],
    },
  ],
  overlays: [
    { t: 14.0, color: '#ffffff', to: 1, duration: 1.6 },
    { t: 15.8, layer: 'black', color: '#000000', to: 1, duration: 1.0 },
  ],
  radio: [
    { t: 0.6, speaker: COMMAND, text: `${COMMAND_SHIP_NAME} is gone. The fleet is breaking off!` },
    { t: 3.6, speaker: WINGMAN_1, text: 'They are running! Look at them go!' },
    { t: 6.0, speaker: SQUAD_LEADER, text: 'We thought we had lost you, rookie. Welcome back.' },
    { t: 8.6, speaker: COMMAND, text: 'All Delta: it is over. Return to base. Well flown.' },
    { t: 11.6, speaker: PLAYER_CALLSIGN, text: 'Delta, this is Rookie. Heading home.', duration: 3 },
  ],
  skippableAfter: 2,
};
