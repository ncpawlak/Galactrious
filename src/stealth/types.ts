/**
 * Stealth data format (DESIGN.md "As built: stealth systems"). A scroll level carries one optional `StealthDef`
 * (`ScrollLevelDef.stealth`): searchlights, cover zones and the detection rules. Everything is plain data.
 *
 * WORLD SPACE. Lights and cover scroll with the level. Every entry has `at`: the scroll distance (px) at which its anchor
 * `(x, y)` is where you wrote it on screen; afterwards it moves down with the scroll, so the screen position is
 * `y + (distance - at)`. `at: 0, y: 300` is "visible from the start, 300 px from the top"; `at: 2000, y: 0` enters at the top edge when
 * 2000 px have scrolled. (Obstacles use the same idea: they enter at the top at `at`.)
 */

/** Degrees, screen space: 0 = right, 90 = straight down the screen, 180 = left, 270 = up. */
export type Deg = number;
export type Pt = { x: number; y: number };

/** How a light moves and when it is on. `t` in all periods is seconds of level time. */
export type LightPattern =
  /** Pendulum: the beam swings `amp` degrees either side of `center`, one full cycle per `period` s. */
  | { type: 'sweep'; center: Deg; amp: Deg; period: number; phase?: number }
  /** The beam turns around the lamp at `speed` deg/s (negative = anticlockwise). */
  | { type: 'rotate'; speed: number; start?: Deg }
  /** The lamp itself travels along `path` (offsets from the anchor) at `speed` px/s, `loop` = round and round, `pingpong` = there and back. The beam points `aim` (default 90) or sweeps if `sweep` is given. */
  | { type: 'patrol'; path: Pt[]; speed: number; mode?: 'loop' | 'pingpong'; aim?: Deg; sweep?: { amp: Deg; period: number }; phase?: number }
  /** On/off beam pointing at `aim`: on for `on` s (fully lit, dangerous), off for `off` s (a faint dashed outline shows where it will be, flickering in the last `warn` s). `fade` s of ramp-up count as lit only once past 60%. */
  | { type: 'pulse'; aim: Deg; on: number; off: number; offset?: number; warn?: number; fade?: number }
  /** A big spot (`shape: 'spot'`) wandering on a Lissajous loop `rx` x `ry` px around the anchor, one cycle per `period` s. */
  | { type: 'roam'; rx: number; ry: number; period: number; phase?: number; ratio?: number };

export interface LightDef {
  /** Optional name for debugging and authoring. */
  id?: string;
  at: number;
  /** Lamp anchor (screen px at distance `at`). */
  x: number;
  y?: number;
  /** `cone` = a beam from the lamp (`size` = range px, `spread` = full opening in degrees); `spot` = a circle (`size` = radius px). */
  shape: 'cone' | 'spot';
  size: number;
  spread?: Deg;
  pattern: LightPattern;
  /** CSS colour of the beam (default a cold white-yellow). */
  color?: string;
}

/** A zone nothing can see into: no detection from lights, and chasers lose line of sight (they hold fire). */
export interface CoverDef {
  id?: string;
  at: number;
  /** Top-left corner (screen px at distance `at`) and size. */
  x: number;
  y?: number;
  w: number;
  h: number;
  /** `roof` = a hard-edged dark roof with panel seams (hangar roofs, buildings); `shadow` = a soft dark ellipse (the shade under a structure). Default roof. */
  kind?: 'roof' | 'shadow';
  /** Small label drawn on the zone while it is on screen (default `COVER`, `''` for none). */
  label?: string;
}

/** Detection and chase rules. Every field has a default (`DEFAULT_DETECTION`). */
export interface DetectionConfig {
  /** Seconds the player's circle must overlap a lit region before it counts (a graze is not instant). */
  grace: number;
  /** Radius added to the ship's hitbox for the "is it lit" test (the pod's drawn size). */
  pad: number;
  /** Chasers spawned per alert. */
  chasers: number;
  /** Most chasers alive at once; an alert spawns only up to this. */
  maxChasers: number;
  /** Minimum seconds between alerts (a re-cross inside the cooldown only refreshes the chasers' target). */
  cooldown: number;
  /** Unit id of a chaser (default `empire-fighter`). */
  unit: string;
  /** Seconds in cover without a break after which every chaser gives up and flies off. */
  loseAfter: number;
  /** Seconds the ALERT beat lasts (the klaxon; chasers arrive during it). */
  alertBeat: number;
  /** Chaser flight speed (px/s) and turn rate (rad/s): the turn rate is what lets the pod dodge them. */
  chaseSpeed: number;
  turnRate: number;
  /** Seconds between chasers of one alert appearing. */
  stagger: number;
}

export interface StealthDef {
  lights: LightDef[];
  covers?: CoverDef[];
  detection?: Partial<DetectionConfig>;
  /** The paved apron: a faint grid scrolling with the level so the ground reads as ground and the speed is felt. `false` = none. Default on. */
  floor?: false | { spacing?: number; color?: string };
}

export const DEFAULT_DETECTION: DetectionConfig = {
  grace: 0.15,
  pad: 5,
  chasers: 2,
  maxChasers: 4,
  cooldown: 8,
  unit: 'empire-fighter',
  loseAfter: 2,
  alertBeat: 1.4,
  chaseSpeed: 220,
  turnRate: 1.9,
  stagger: 0.45,
};

/** The detection state shown in the HUD. */
export type DetectState = 'undetected' | 'alert' | 'chased';

/** What a chaser's `UnitPlacement.chase` is (src/units.ts imports this type). */
export interface ChaseControl {
  /** Screen-space centre of the unit at `t` s since it spawned (called every frame; the controller integrates its own motion). */
  step(t: number): Pt;
  /** True once it has flown off after giving up: the unit is removed (not a kill). */
  done(): boolean;
  /** False while the unit must hold fire (the player is out of sight, or it is leaving). */
  canFire(): boolean;
}
