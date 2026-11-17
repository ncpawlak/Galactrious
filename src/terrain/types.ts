/**
 * Carvable terrain and ground defences (DESIGN.md "As built: carvable terrain and ground defences").
 * Everything here is a SCROLL TIMELINE ENTRY (`at` = scroll distance in px, like every `ScrollEntry`); the terrain
 * system (`system.ts`) turns the entries into ground structures: wall segments, defence lines with gaps and turrets built in,
 * and standalone ground turrets. A structure is an ordinary pixel-mask unit (the boss carving pipeline), so every player
 * weapon carves it; it scrolls with the ground and is removed when it leaves the bottom of the screen.
 */

/** Tag counted for the `destroyAll` bonus when a turret is destroyed (override per entry with `tag`). */
export const GROUND_TAG = 'ground';

/** What a turret fires. `gun` = aimed shot or three-shot fan, `mortar` = a telegraphed blast circle on the player's position. */
export type TurretKind = 'gun' | 'mortar';

/** Options every turret-carrying entry accepts. */
export interface TurretOptions {
  /** Seconds between shots of one turret (default 3.2 for a gun, 4.2 for a mortar). A structure with several turrets staggers them. */
  fireEvery?: number;
  /** Hit points of one turret (default 150 gun, 220 mortar). Hidden (no bar), a base-gun hit is about 90. */
  hp?: number;
  /** Counter key for `destroyAll { tag }` (default `ground`). */
  tag?: string;
  /** Gun turrets: `fan` fires three diverging shots instead of one aimed shot. */
  fan?: boolean;
  /** Seconds the first turret waits after it comes on screen (default 1.2). */
  firstShot?: number;
}

/** Wall look and toughness, shared by `wall` and `wallLine`. */
export interface WallOptions {
  /** Depth of the wall along the scroll in px (default 44; at least 36 so a turret fits). */
  depth?: number;
  /** Multiplies the carve density (default 1: a lane takes about two seconds of base-gun fire). */
  toughness?: number;
  /** Contact damage to the ship (default 1; walls hurt but never kill outright, like obstacles). */
  damage?: number;
  /** Seed for the paint variation. */
  seed?: number;
}

/**
 * One wall segment, centred at screen `x`, `width` px wide. `turrets` = how many gun turrets are built into it (evenly spaced), or a
 * list of x offsets (px) from the centre. A segment longer than about 260 px is split into pieces that look like one wall.
 */
export interface WallEntry extends WallOptions, TurretOptions {
  at: number;
  kind: 'wall';
  x: number;
  width: number;
  turrets?: number | number[];
  /** Round the ends as a free-standing wall (default true); false = flat ends. */
  caps?: boolean;
}

/** A gap in a defence line: screen `x` of its centre and its `width` in px. */
export interface WallGap {
  x: number;
  width: number;
}

/**
 * A DEFENCE LINE: a wall across the whole screen width (0 to 540) with open GAPS at the given positions. The player flies through a gap or
 * carves a new lane. `turrets`: a number = that many gun turrets per wall piece, or a list of absolute screen x positions (each goes into the
 * piece under it). `mortars`: absolute x positions of mortar turrets built into the wall.
 */
export interface WallLineEntry extends WallOptions, TurretOptions {
  at: number;
  kind: 'wallLine';
  gaps: WallGap[];
  turrets?: number | number[];
  mortars?: number[];
}

/** One free-standing ground turret on a bunker pad at screen `x`. */
export interface TurretEntry extends TurretOptions {
  at: number;
  kind: 'turret';
  x: number;
  type?: TurretKind;
  /** Scroll px above the entry point (positive = further up the screen), to stagger a hand-made group. */
  dy?: number;
}

/**
 * A cluster of ground turrets: `count` pads of the given `type` laid out around (`x`, scroll distance `at`). `layout`: `row` (side by side, `spacing` px
 * apart), `arc` (a shallow curve), `stagger` (alternating rows; the default).
 */
export interface TurretClusterEntry extends TurretOptions {
  at: number;
  kind: 'turretCluster';
  x: number;
  count: number;
  type?: TurretKind;
  layout?: 'row' | 'arc' | 'stagger';
  /** Distance between pads in px (default 96). */
  spacing?: number;
  /** Mix: every `mortarEvery`-th pad is a mortar (0 = none, default 0). */
  mortarEvery?: number;
}

/** Show or hide the turret tally on the HUD (`TURRETS 3/14`, counting the `tag`). Placed at `at: 0` by the level that wants it. */
export interface TurretTallyEntry {
  at: number;
  kind: 'turretTally';
  on: boolean;
  tag?: string;
}

/**
 * An indestructible ENERGY BARRIER (a beam between two pylons) centred at screen `x`, `width` px long. Nothing destroys it; player shots stop on
 * it; touching it scrapes the hull like a wall. The author leaves a gap of at least 150 px (the level must stay passable).
 */
export interface BarrierEntry {
  at: number;
  kind: 'barrier';
  x: number;
  width: number;
  damage?: number;
  seed?: number;
}

/**
 * A HIDDEN ITEM (Conquest, src/conquest): something worth finding in the ground. `crate` = a supply crate that looks like scenery (a small
 * pad, one amber lamp that flickers now and then) and bursts open when shot; `cache` = a secret room sealed in a wall piece (a faint seam and
 * two rivets in the plating): carve through the plating and shoot the console inside. Found = the host's `noteHidden(id)` (never counted as a
 * kill or a turret). `x` is the screen x of the centre, `width` the cache wall's width (default 120), `dy` extra scroll px above the entry.
 */
export interface HiddenEntry {
  at: number;
  kind: 'hidden';
  id: string;
  variant: 'crate' | 'cache';
  x: number;
  width?: number;
  dy?: number;
  seed?: number;
}

/** Tag prefix of a hidden item's component (`hidden:<id>`). */
export const HIDDEN_PREFIX = 'hidden:';

export type TerrainEntry = WallEntry | WallLineEntry | TurretEntry | TurretClusterEntry | TurretTallyEntry | BarrierEntry | HiddenEntry;

export const TERRAIN_KINDS = ['wall', 'wallLine', 'turret', 'turretCluster', 'turretTally', 'barrier', 'hidden'] as const;

export function isTerrainEntry(e: { kind: string }): e is TerrainEntry {
  return (TERRAIN_KINDS as readonly string[]).includes(e.kind);
}

/** A caster of a shadow on the ground (the surface theme draws it). */
export interface ShadowCaster {
  x: number;
  y: number;
  /** Rough half-width in px. */
  size: number;
  kind: 'ship' | 'flyer';
}
