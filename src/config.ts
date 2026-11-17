/** Logical (portrait) resolution. The canvas is scaled to fit the window by CSS. */
export const W = 540;
export const H = 960;

/** Tunables for milestone 1. Densities: energy spent per pixel carved. */
export const TUNING = {
  densities: { hull: 3.1, frame: 0.8, rooms: 1.5 },
  /** Starting ship stats (live-adjustable with the debug keys). */
  ship: { damage: 90, fireRate: 8, /** Keyboard move speed, px/s. */ speed: 460 },
  /** Debug test-mode preset (toggle with [Y]): the fast values from PR #21, for quick iteration. */
  testMode: { damage: 450, fireRate: 30 },
  coreHp: 8000,
  /** Core takes only this fraction of damage while fully walled in; ramps to 100% as the layers are dug away. */
  coreArmor: { min: 0.1 },
  /** Carve shape: higher lateralPenalty = narrower, deeper tunnels. reach = max depth in px. */
  carve: { lateralPenalty: 1.7, backPenalty: 2.5, reach: 110 },
  bulletSpeed: 1500,
  sway: { amplitude: 55, period: 8 },
  boss: { x: W / 2, y: 40 },
  /** Combat range (DESIGN.md "Combat range"): the highest the ship may fly (default for ships without their own `minY`), px from the top. */
  shipMinY: 320,
  /** Dodge: dash `distance` px over `invulnTime` s (invulnerable meanwhile), then `cooldown` s. */
  dodge: { distance: 170, invulnTime: 0.25, cooldown: 2.5 },
  /** Boss attacks. Speeds px/s, intervals s. */
  attacks: {
    aimed: { interval: 1.4, speed: 260, damage: 1 },
    /** Each pattern's `interval` = pause (s) after it fires before the scheduler picks the next. */
    /** Straight-down volley: `count` bullets `spacing` px apart. */
    direct: { interval: 1.6, count: 3, spacing: 26, speed: 300, damage: 1 },
    /** Beam sweep, angles in degrees (90 = straight down). Sweeps `arc` degrees centred on `centerAngle`, left to right unless `leftToRight` is false. */
    sweep: { interval: 1.5, telegraph: 0.9, active: 1.3, damage: 2, centerAngle: 90, arc: 45, leftToRight: true, length: 1300, beamWidth: 70 },
    /** Bomb lobbed at the player's position at fire time; only the blast hurts. */
    bomb: { interval: 1.5, telegraph: 0.9, active: 0.25, radius: 75, damage: 2, lobHeight: 120 },
    bulletRadius: 6,
  },
  /** Hazard looks (telegraph vs live zone). `bossDim` darkens the boss while hazards are active (0 = off). */
  hazards: { bossDim: 0.3, pulseRate: 2, telegraphColor: '#ffd23a', zoneFill: '#ff1a1a', zoneRim: '#ffffff' },
  /** Player health: `hitbox` is the collision circle radius (small, forgiving); `hitInvuln` = i-frames after a hit. */
  player: { maxHealth: 5, hitbox: 5, hitInvuln: 1.0, defeatTime: 1.8 },
};

/** Blown-off boss parts float in space: slow push away from the break point, drag, slow spin, fade. No gravity. */
export const DEBRIS = {
  /** Initial drift speed range, px/s. */
  speedMin: 28,
  speedMax: 60,
  /** Max random deviation from straight-outward, radians. */
  angleJitter: 0.45,
  /** Velocity decay per second (drift eases out; 0 = constant velocity). */
  drag: 0.35,
  /** Spin range, rad/s. */
  spinMin: 0.2,
  spinMax: 0.7,
  /** Seconds a fragment lives; it fades over the last `fade` seconds. */
  life: 2.4,
  fade: 0.8,
};

/** Game-feel ("juice") tunables. Everything is subtle by default; toggle live with [J]. */
export const JUICE = {
  /** Hit stop: freeze gameplay briefly on heavy carves. Seconds. */
  hitStop: { carveThreshold: 40, perPixel: 0.0004, max: 0.03, core: 0.025, cooldown: 0.12 },
  /** Screen shake: trauma-based. Amount is px at trauma 1. */
  shake: { maxOffset: 7, decay: 2.8, perPixel: 0.004, core: 0.12, explosion: 0.9, maxTrauma: 0.6 },
  /** Component destruction (issue #44): shake and hit stop scale with the blast radius in px. */
  destroy: { shakeBase: 0.12, shakePerPx: 0.004, maxShake: 0.55, maxTrauma: 0.85, stopBase: 0.02, stopPerPx: 0.0006, maxStop: 0.1 },
  /** Floating damage numbers; hits are merged within `mergeWindow` seconds. */
  numbers: { mergeWindow: 0.15, life: 0.7, rise: 40, minValue: 1 },
  /** WebAudio carve/hit sounds. */
  audio: { volume: 0.18, minInterval: 0.045 },
};

/**
 * Blast sizes (issue #44). Every component that is destroyed makes a blast: crater, damage to
 * neighbouring components (chains) and to the core. All boss-only, never the player. `defaults` are per
 * component type; a boss definition overrides any field per component (`ComponentSpec.blast`, a
 * partial). Overriding only `radius` rescales the default `energy` with the area (radius squared).
 * `scale` is the one global knob (live: [-] and [=] or the debug panel): radius scales with scale^radiusExp (0.85),
 * energy with scale^energyExp (1.6, a bit under the carved area), damage with scale^damageExp (0: constant) and the reach of the shock to other components and the core with scale^reachExp (0.5), so a high scale does not chain the whole boss.
 */
/** Default `BLAST.scale` (playtested and kept; the live knob still works, RESET ALL returns here). */
export const BLAST_DEFAULT_SCALE = 1.75;

export const BLAST = {
  scale: BLAST_DEFAULT_SCALE,
  min: 0.25,
  max: 4,
  step: 0.25,
  /** Carve radius scales with scale^radiusExp (a bit under linear: the boss is only ~420 px wide). */
  radiusExp: 0.85,
  energyExp: 1.6,
  damageExp: 0,
  /** Shock reach to other components and the core scales with scale^reachExp (carve radius is linear). */
  reachExp: 0.5,
  defaults: {
    turret: { radius: 45, energy: 3000, damage: 60, coreDamage: 40, falloff: 1 },
    explosive: { radius: 115, energy: 10000, damage: 150, coreDamage: 250, falloff: 1 },
    console: { radius: 28, energy: 1200, damage: 15, coreDamage: 10, falloff: 1 },
    /** A room that blows up (`explodeOnDisable`). */
    room: { radius: 115, energy: 10000, damage: 160, coreDamage: 260, falloff: 1 },
  },
};

/** Blast scale clamp used by the debug controls. */
export function setBlastScale(v: number): number {
  BLAST.scale = Math.round(Math.min(BLAST.max, Math.max(BLAST.min, Number.isFinite(v) ? v : 1)) * 100) / 100;
  return BLAST.scale;
}

/**
 * Auto-firing player weapons (issue #12, `src/weapons.ts`), all on timers, all equipped at once for now.
 * Energies are for the default ship damage and scale with the live damage (debug keys), `power = damage / TUNING.ship.damage`.
 * `cooldown` seconds, `pierce` = fraction of energy kept per impact, `shape` = carve shape name (`src/carveShapes.ts`).
 */
export const WEAPONS = {
  /** Global multiplier on every cooldown (debug keys `,` and `.`). */
  cooldownScale: 1,
  /** Burn tag (src/tags.ts): per patch, every `tick` s it carves `energy` x stacks x power; it lasts `life` + `lifePerStack` x (stacks - 1) s and is refreshed by each new burning hit within `merge` px. At most `maxPatches` patches. */
  burn: { tick: 0.3, energy: 12, life: 1.2, lifePerStack: 0.35, merge: 14, maxPatches: 36 },
  /** Gauss cannon: one fast shot straight up. Keeps most of its energy through layers and components, drills a long shaft. */
  gauss: { cooldown: 5, energy: 1400, pierce: 0.85, shape: 'narrow' as const, speed: 2600 },
  /** Rocket: one shot straight up. Detonates on the first solid pixel or component; the crater is a boss blast (`blast`, scaled by BLAST.scale). */
  rocket: {
    cooldown: 6,
    speed: 260,
    maxSpeed: 900,
    accel: 1500,
    blast: { radius: 88, energy: 1500, damage: 40, coreDamage: 40, falloff: 1 },
  },
  /** Arc missiles: a pair sideways, then random curved paths to a random solid spot of the boss (boss-local, follows its motion). */
  arc: {
    cooldown: 7,
    energy: 1200,
    pierce: 0.5,
    shape: 'round' as const,
    speed: 430,
    /** Max turn rate toward the target, rad/s (grows near the target so it never orbits). */
    turn: 2.8,
    /** Sideways wander: amplitude (rad) range and frequency (rad/s) range, fades out near the target. */
    wander: { min: 0.6, max: 1.2, freqMin: 3, freqMax: 6 },
    /** Seconds before it stops wandering and flies straight at the target. */
    wanderTime: 4,
  },
  /** Lance (aux): a held beam. For `duration` s it carves straight up from the ship every `tick` s (`energy` per tick, scaled by power), keeping `pierce` of its energy through each layer and passing through components. */
  lance: { cooldown: 6.5, duration: 1.6, tick: 0.05, energy: 75, pierce: 0.7, shape: 'narrow2' as const },
  /** Blades (aux): `count` blades orbit the ship at `radius` px for `duration` s (`spin` rad/s); a blade touching a target carves `energy` every `tick` s. */
  blades: { cooldown: 7, duration: 4.5, count: 3, radius: 80, spin: 5.5, tick: 0.1, energy: 70, shape: 'ember3' as const },
  /** Swarm (aux): `count` small homing missiles at random solid spots of the targets. */
  swarm: { cooldown: 6.5, count: 6, energy: 340, pierce: 0.3, shape: 'swarm' as const, speed: 560, turn: 4.5, wanderTime: 2.2 },
};

/**
 * Main weapons (src/weapons.ts `MAIN_DEFS`). Everything is relative to the ship's live damage and fire rate (the chain gun
 * is 1x of both), so the debug damage keys and test mode scale every main. `projectiles` per shot, `spreadDeg` between
 * neighbours, `pierce` as for bullets. `near`/`far` (optional): energy multiplier at point blank and at `end` px, linear in between from `start`; the bullet dies at `end`.
 */
export const MAINS = {
  chain: { rateMul: 1, damageMul: 1, projectiles: 1, spreadDeg: 5, jitterDeg: 0, pierce: 0, speedMul: 1 },
  /** Wide shotgun: 8 pellets, slow, strong up close, weak and short ranged far away. */
  scatter: { rateMul: 0.3, damageMul: 0.5, projectiles: 8, spreadDeg: 6, jitterDeg: 2, pierce: 0, speedMul: 0.8, fall: { start: 110, end: 440, near: 1.7, far: 0.25 } },
  /** Needler: very fast, narrow, thin deep tunnels. */
  needle: { rateMul: 2.4, damageMul: 0.42, projectiles: 1, spreadDeg: 0, jitterDeg: 0.6, pierce: 0.35, speedMul: 1.25, shape: 'needle' as const },
};
