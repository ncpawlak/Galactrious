/**
 * The cinematics of "Fallen Peace" chapters 1 to 3, authored in the data format of `cinematic.ts` (DESIGN.md "Cinematic and mission
 * design standard"). Four of them:
 *  - `FP1_BREAK_OFF` + `FP1_APPROACH`: the dogfight ends, the fighters fly away and the capital ship descends, invincible, with commentary.
 *  - `FP1_EXIT`: the engine room blows up (cosmetic), the ship turns 180 and flies off the bottom of the screen.
 *  - `FP2_SHOT_DOWN`: a projectile hits the ship at the jump gate, it burns and falls toward the planet, fade to black.
 *  - `FP3_CRASH`: the ship hits a mountain side and tumbles down it in a spray of snow, whiteout, black.
 * All times are seconds from the start of the cinematic; coordinates are the 540x960 screen.
 */
import type { Cinematic } from './cinematic';

const LEAD = 'DELTA LEAD';
const COMMAND = 'ORINI COMMAND';

/** End of the dogfight: the fighters ease off and fly away (the player keeps control, weapons off). */
export const FP1_BREAK_OFF: Cinematic = {
  id: 'fp1-break-off',
  duration: 4.6,
  lock: { input: false, weapons: true, enemies: 'hold', invulnerable: true },
  world: [{ t: 0.2, do: 'dismissUnits' }],
  radio: [
    { t: 0.3, speaker: LEAD, text: 'They are breaking off! Let them run, all Delta, hold your fire.' },
    { t: 2.6, speaker: COMMAND, text: 'Strike group, the command ship is entering your sector. Stand by.' },
  ],
};

/** The capital ship slowly descends from the top of the screen, invincible until the fight starts. */
export const FP1_APPROACH: Cinematic = {
  id: 'fp1-approach',
  duration: 10.6,
  lock: { input: false, weapons: true, enemies: 'hold', invulnerable: true, bossInvincible: true },
  boss: [
    { t: 0, offsetY: -800 },
    { t: 10.2, offsetY: 0, ease: 'inOut' },
  ],
  radio: [
    { t: 0.4, speaker: COMMAND, text: 'Delta, approaching the command ship. Hold your fire until you are in position.' },
    { t: 3.8, speaker: LEAD, text: 'Look at the size of that thing. Armour from stem to stern.' },
    { t: 7.0, speaker: COMMAND, text: 'Only the notch at the stern is soft. Dig up through it to the engine room.' },
  ],
  skippableAfter: 1.5,
};

/**
 * The engine room blows up: a chain of cosmetic fireballs at the consoles (no carving, no damage, nothing for the snapshot: the
 * session captured the ship when the room died), then the ship turns 180 and flies down off the bottom of the screen.
 */
export const FP1_EXIT: Cinematic = {
  id: 'fp1-exit',
  duration: 8.4,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0.0, do: 'explosion', at: 'engineA', dx: -12, radius: 70, shake: 0.6 },
    { t: 0.15, do: 'explosion', at: 'engineB', dx: 10, radius: 70, shake: 0.6 },
    { t: 0.5, do: 'explosion', at: 'engineA', dy: 34, radius: 100, shake: 0.7 },
    { t: 0.8, do: 'explosion', at: 'engineB', dx: 24, dy: -22, radius: 92, shake: 0.7 },
    { t: 1.1, do: 'explosion', at: 'engineA', dx: 44, dy: 8, radius: 120, shake: 0.8 },
    { t: 1.45, do: 'explosion', at: 'engineA', dx: 24, dy: 6, radius: 180, shake: 1, ring: true },
    { t: 1.9, do: 'explosion', at: 'engineB', dx: -30, dy: 40, radius: 90, shake: 0.5 },
    { t: 2.4, do: 'explosion', at: 'engineA', dx: 20, dy: -40, radius: 70, shake: 0.4 },
  ],
  ship: [
    { t: 2.2 },
    { t: 3.6, rot: Math.PI, ease: 'inOut' },
    { t: 6.4, dy: 760, rot: Math.PI, ease: 'in' },
  ],
  overlays: [{ t: 6.7, color: '#000000', to: 1, duration: 1.4 }],
  radio: [
    { t: 1.0, speaker: LEAD, text: 'The engine room is gone! She is dead in the water!' },
    { t: 3.6, speaker: LEAD, text: 'Good flying, rookie. Now let us get out of here!' },
    { t: 5.8, speaker: COMMAND, text: 'All Delta, mission accomplished. Fall back to the jump gate.' },
  ],
};

/**
 * The shoot-down: a bolt streaks in from behind and hits the ship at the jump gate. It catches fire and falls toward the planet,
 * tumbling slowly and shrinking while the planet grows to fill the screen; fade to black with the radio calling out.
 */
export const FP2_SHOT_DOWN: Cinematic = {
  id: 'fp2-shot-down',
  duration: 10.2,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  // The gate (270, 340) flies away as the ship falls: it starts to recede with the fall and is a dot by the fade to black.
  gateFly: { t: 1.55, duration: 6.5, x: 270, y: 340 },
  world: [
    { t: 0.0, do: 'scrollSpeed', speed: 60, ease: 4 },
    { t: 1.0, do: 'projectile', from: [470, -40], duration: 0.55, color: '#ff8a3a', hit: true },
    { t: 1.55, do: 'burn', on: true },
    { t: 1.55, do: 'shake', amount: 1 },
    { t: 1.6, do: 'trail', kind: 'smoke', duration: 8, rate: 46 },
    { t: 1.6, do: 'trail', kind: 'fire', duration: 7, rate: 50 },
    { t: 1.8, do: 'planetZoom', to: 1, duration: 7.8 },
  ],
  ship: [
    { t: 1.55 },
    { t: 3.4, dy: 70, dx: -20, rot: 0.8, scale: 0.9, ease: 'in' },
    { t: 7.0, dy: 330, dx: -70, rot: 3.4, scale: 0.42, ease: 'inOut' },
    { t: 9.4, dy: 500, dx: -40, rot: 5.6, scale: 0.12, ease: 'out' },
  ],
  overlays: [{ t: 6.8, color: '#000000', to: 1, duration: 2.8 }],
  radio: [
    { t: 0.2, speaker: LEAD, text: 'You are first to the gate, rookie! We are right behind you!' },
    { t: 5.4, speaker: COMMAND, text: 'Rookie! Rookie, respond! *static*', duration: 4.4, static: 0.65 },
    { t: 7.6, speaker: LEAD, text: 'Break off, scatter! We will find the rookie.', duration: 2.4, static: 0.5 },
  ],
  skippableAfter: 2,
};

/**
 * The crash: the ship flies into a mountain side at the top of the screen and, like the chapter 2 fall, tumbles away (turning and
 * shrinking) but now DOWN the snow slope, bouncing, with snow shooting up around it. Then the world stops, a snowfall whiteout rolls
 * in and it goes black. The slope sweeps in from the top and settles with its surface on the `line`; the ship hits that line at
 * (330, 470) and tumbles along it toward the lower left. Cosmetic only.
 */
export const FP3_CRASH: Cinematic = {
  id: 'fp3-crash',
  duration: 10.2,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0.0, do: 'weather', intensity: 1, ease: 2 },
    { t: 1.5, do: 'scrollSpeed', speed: 0, ease: 1.4 },
    { t: 1.7, do: 'explosion', x: 330, y: 470, radius: 46, shake: 1, ring: true },
    // Snow thrown up around the ship the whole way down, with sparks at the start.
    { t: 1.7, do: 'trail', kind: 'powder', duration: 5, rate: 300 },
    { t: 1.7, do: 'trail', kind: 'snow', duration: 4, rate: 60 },
    { t: 1.7, do: 'trail', kind: 'sparks', duration: 1.6, rate: 50 },
    { t: 1.7, do: 'trail', kind: 'smoke', duration: 4.5, rate: 30 },
    // Bounces off the slope: a puff and a shake each.
    { t: 2.5, do: 'explosion', x: 255, y: 520, radius: 26, shake: 0.6 },
    { t: 3.5, do: 'explosion', x: 170, y: 556, radius: 24, shake: 0.5 },
    { t: 4.5, do: 'explosion', x: 95, y: 590, radius: 20, shake: 0.4 },
    { t: 1.8, do: 'shake', amount: 0.8 },
  ],
  props: [{ t: 0.2, do: 'slope', line: [0, 618, 540, 375], enter: 1.5 }],
  ship: [
    { t: 0.2 },
    { t: 1.7, x: 330, y: 470, rot: -0.25, ease: 'in' },
    { t: 2.5, x: 255, y: 512, rot: -2.2, scale: 1.05, ease: 'out' },
    { t: 3.5, x: 170, y: 546, rot: -4.6, scale: 0.85, ease: 'inOut' },
    { t: 4.5, x: 95, y: 582, rot: -6.9, scale: 0.65, ease: 'inOut' },
    { t: 6.2, x: -20, y: 640, rot: -10.2, scale: 0.35, ease: 'out' },
  ],
  overlays: [
    { t: 1.7, layer: 'impact', kind: 'vignette', color: 'rgba(170,20,10,0.95)', to: 0.7, duration: 0.15 },
    { t: 1.9, layer: 'impact', kind: 'vignette', color: 'rgba(170,20,10,0.95)', to: 0, duration: 1.6 },
    { t: 5.0, layer: 'white', color: '#f4f8ff', to: 1, duration: 2.6 },
    { t: 7.6, layer: 'black', color: '#000000', to: 1, duration: 1.8 },
  ],
  radio: [
    { t: 0.3, speaker: 'SYSTEM', text: 'IMPACT IMMINENT. BRACE.' },
    { t: 2.6, speaker: 'SYSTEM', text: 'HULL CRITICAL.', static: 0.5 },
  ],
  skippableAfter: 2,
};
