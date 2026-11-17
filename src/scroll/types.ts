import type { WaveDefinition } from '../waves';

/**
 * Scrolling levels (DESIGN.md "As built: scrolling, obstacles, capital ship, allies").
 * A `ScrollLevelDef` is a timeline keyed to SCROLL DISTANCE in px: every entry has `at`, the distance the world has
 * scrolled when it fires. The world moves past the ship (down the screen); the ship never leaves the screen.
 */

// --- obstacles -----------------------------------------------------------------------------------------------

/** Shape templates. `debris-*` are chunks (several sizes), `peak-*` are tall jagged rock spires with snow. */
export type ObstacleShape = 'debris-s' | 'debris-m' | 'debris-l' | 'debris-xl' | 'peak-s' | 'peak-m' | 'peak-l';

/** Extra motion on top of the scroll, in px/s relative to the world. All optional; none = it just scrolls past. */
export interface ObstacleMotion {
  /** Constant sideways drift. */
  vx?: number;
  /** Extra downward speed (negative = it lags behind the scroll). */
  vy?: number;
  /** Spin in rad/s ("tumble"). Peaks never spin. */
  spin?: number;
  /** Sideways sine wobble. */
  wobble?: { amp: number; period: number };
}

/** Named motion presets for authoring. */
export type MotionPreset = 'straight' | 'drift-l' | 'drift-r' | 'tumble' | 'fast' | 'weave';

export interface ObstacleSpawn {
  at: number;
  kind: 'obstacle';
  shape: ObstacleShape;
  /** Screen x of the centre (with `edge` left/right: the inset of the centre from that edge). */
  x: number;
  /** Where it enters from: 'top' (default, scrolls down into view) or a side edge (slides in sideways while scrolling). */
  edge?: 'top' | 'left' | 'right';
  motion?: MotionPreset | ObstacleMotion;
  /** Scale on the template (default 1). */
  scale?: number;
  /** Contact damage to the player (default: 1 for debris, 2 for peaks). */
  damage?: number;
  /** Player shots erase pieces of it (default false; chapter 3 cannot shoot, the surface run will). */
  carvable?: boolean;
  /** Seed for the shape's jagged edge (default from the position). */
  seed?: number;
}

/** A band of random obstacles between two distances, deterministic per `seed`. Expanded into `ObstacleSpawn`s at load. */
export interface ObstacleField {
  at: number;
  kind: 'field';
  /** Distance where it stops spawning. */
  to: number;
  /** Obstacles per 1000 px of scroll. */
  density: number;
  /** Shapes drawn from, with relative weights. */
  shapes: { shape: ObstacleShape; weight?: number }[];
  motions?: MotionPreset[];
  /** Keep this screen-x band free of obstacle centres, so the ship always has a lane (optional). */
  lane?: { x: number; width: number };
  seed?: number;
  carvable?: boolean;
}

// --- the rest of the timeline --------------------------------------------------------------------------------

export type ScrollEntry =
  | ObstacleSpawn
  | ObstacleField
  /** One unit of the unit catalogue (src/enemies) entering from above. */
  | { at: number; kind: 'unit'; unit: string; x: number; y?: number }
  /** A wave (id from `WAVE_LIST` or a definition), spawned as in a wave node. */
  | { at: number; kind: 'wave'; wave: WaveDefinition | string }
  /** Start a boss fight (a `BossDefinition` id) on top of the scroll (e.g. 'capital-ship'). */
  | { at: number; kind: 'boss'; bossId: string }
  /** Change the scroll speed (px/s) to `speed`, easing over `ease` seconds (default 1). 0 stops the world. */
  | { at: number; kind: 'speed'; speed: number; ease?: number }
  /** Lock or unlock the player's weapons (HUD greys the rings). */
  | { at: number; kind: 'weapons'; locked: boolean }
  /** Cosmetic wingmen on or off (see `AllyPattern`). */
  | { at: number; kind: 'allies'; on: boolean; count?: number; pattern?: AllyPattern }
  /** Switch the background theme (terrain / atmosphere change), cross-faded over `fade` seconds (default 2). */
  | { at: number; kind: 'theme'; theme: string; fade?: number }
  /** Set the weather intensity (0 calm to 1 violent storm), easing over `ease` seconds (default 3). Drives lightning, turbulence, glow, rain, whiteouts. */
  | { at: number; kind: 'setWeather'; intensity: number; ease?: number }
  /** A pickup (stub: emits a `pickup` event with `name`; there is no pickup entity yet). */
  | { at: number; kind: 'pickup'; name: string; x: number }
  /** A named event for the campaign framework (scripted beats, objective triggers). Emitted through `ScrollRunner.onEvent`. */
  | { at: number; kind: 'event'; name: string; data?: unknown };

// --- allies --------------------------------------------------------------------------------------------------

/** How a wingman flies. `weave` = side-to-side sine, `loop` = a slow oval, `strafe` = enters low, climbs and fires, `patrol` = a formation with a gentle bob. */
export type AllyPattern = 'weave' | 'loop' | 'strafe' | 'patrol';

// --- background ----------------------------------------------------------------------------------------------

/**
 * Weather response shared by layers: the layer's strength is `lo + (hi - lo) * weather` (default `[1, 1]` = always the same).
 * It scales alpha for painted layers and the number of particles drawn for particle layers.
 */
export type WeatherRange = [lo: number, hi: number];

/**
 * One parallax or effect layer, drawn back to front. `speed` is the share of the scroll speed it moves at (0 = frozen, 1 = same
 * as obstacles). Painted layers are precomputed canvases; particle layers have a capped, fixed particle count.
 */
export type BackgroundLayer = (
  /** Star particles. `streak` > 0 stretches each star into a line of up to that many px at high scroll speed (none at a standstill). */
  | { type: 'stars'; speed: number; count: number; color?: string; streak?: number; alpha?: number }
  | { type: 'clouds'; speed: number; count: number; color: string; alpha: number; size: [number, number] }
  /** Jagged peak silhouettes. */
  | { type: 'mountains'; speed: number; color: string; snow?: string; alpha?: number; count?: number; height?: [number, number] }
  | { type: 'snow'; speed: number; count: number; drift: number; color?: string }
  | { type: 'streaks'; speed: number; count: number; color: string; alpha: number }
  /** A planet whose curved limb fills the bottom of the screen: ocean, ice and cloud bands, terminator, city lights, atmosphere rim. */
  | { type: 'planet'; speed: number; top?: number; radius?: number }
  /** Distant fleet lights, far-off explosions and capital-ship silhouettes. `rate` = events per second. */
  | { type: 'fleet'; rate: number; maxY?: number }
  /** Dark roiling storm clouds (tile with wobbling strips). `wobble` = max sideways px at full weather. */
  | { type: 'stormClouds'; speed: number; count: number; color: string; light: string; alpha: number; size: [number, number]; wobble?: number }
  /** Wind-blown rain, ice or snow streaks slanting by `slant` (px sideways per px down), gusting. `fall` = px/s of its own fall. */
  | { type: 'rain'; speed: number; count: number; color: string; alpha: number; slant: number; len: [number, number]; fall: number; width?: number }
  /** Fast-moving dark debris silhouettes in the far field. */
  | { type: 'shards'; count: number; alpha?: number }
  /** Lightning: a soft flash over the whole scene, afterglow, a bolt, and a thunder callback. Frequency is capped (under 3 flashes per second). */
  | { type: 'lightning'; color?: string }
  /** Coloured glow at the screen edges that pulses (re-entry heat: orange-red; cold: blue). */
  | { type: 'edgeGlow'; color: string; base?: number; rate?: number }
  /** Slow whiteouts (or darkening with a dark colour): the screen washes over for a few seconds. `strength` is the peak alpha (soft, at most 0.6). */
  | { type: 'whiteout'; color: string; strength: number; rate?: number; seed?: number }
  /** Camera turbulence: the whole background shakes by up to `amp` px at full weather (kept small). */
  | { type: 'turbulence'; amp: number }
) & { weather?: WeatherRange };

/** Background as data: a vertical sky gradient plus layers drawn back to front. */
export interface ScrollTheme {
  id: string;
  /** Sky gradient stops, top to bottom. */
  sky: string[];
  /** Sky at full weather, cross-faded in with the weather intensity (optional). */
  stormSky?: string[];
  layers: BackgroundLayer[];
}

// --- the level -----------------------------------------------------------------------------------------------

export interface ScrollLevelDef {
  id: string;
  name?: string;
  /** Total scroll distance in px; the level is `done` when the distance reaches it. */
  length: number;
  /** Starting scroll speed, px/s. */
  speed: number;
  /** Theme id (`SCROLL_THEMES`) or an inline theme. */
  theme: string | ScrollTheme;
  /** Starting weather intensity 0 to 1 (default 0); change it over distance with `setWeather` entries. */
  weather?: number;
  /** Player weapons locked from the start. */
  weaponsLocked?: boolean;
  /** Cosmetic allies from the start. */
  allies?: { count: number; pattern?: AllyPattern };
  timeline: ScrollEntry[];
}

// --- runner interface (what the campaign framework calls) -----------------------------------------------------

/** What the runner asks of the game. Implemented by `Game`. */
export interface ScrollHost {
  /** The player ship position. */
  readonly ship: { x: number; y: number };
  spawnUnit(unitId: string, x: number, y: number): void;
  spawnWave(wave: WaveDefinition | string): void;
  spawnBoss(bossId: string): void;
  setWeaponsLocked(locked: boolean): void;
}

/** A named event a level emits (timeline `event`/`pickup` entries, plus `level-start`, `level-end`). */
export interface ScrollEvent {
  name: string;
  /** Scroll distance at which it fired. */
  distance: number;
  data?: unknown;
}

/**
 * The small interface an objective (or the debug mode) runs a scroll level through. `ScrollRunnerImpl` (src/scroll/runner.ts)
 * is the implementation. Per frame: `update(dt)`, then `draw(ctx)`; the game itself draws the background first and the
 * obstacles after the enemies (`drawBackground` / `drawObstacles` on the implementation), `draw` is the all-in-one form.
 */
export interface ScrollRunner {
  start(def: ScrollLevelDef): void;
  update(dt: number): void;
  /** Scroll distance so far, px. */
  readonly distance: number;
  /** True once the distance reached the level's `length`. */
  readonly done: boolean;
  /** Current scroll speed, px/s (eased). */
  readonly speed: number;
  /** Background + allies + obstacles. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Set the scroll speed (px/s), easing over `ease` seconds (default 0.6; 0 = at once). The hook scripted beats call. */
  setSpeed(v: number, ease?: number): void;
  /** Subscribe to timeline events. */
  onEvent: ((e: ScrollEvent) => void) | null;
}
