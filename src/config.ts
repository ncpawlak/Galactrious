/** Logical (portrait) resolution. The canvas is scaled to fit the window by CSS. */
export const W = 540;
export const H = 960;

/** Tunables for milestone 1. Densities: energy spent per pixel carved. */
export const TUNING = {
  densities: { hull: 0.055, frame: 0.8, rooms: 1.5 },
  /** Starting ship stats (live-adjustable with the debug keys). */
  ship: { damage: 90, fireRate: 12 },
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

/** Game-feel ("juice") tunables. Everything is subtle by default; toggle live with [J]. */
export const JUICE = {
  /** Hit stop: freeze gameplay briefly on heavy carves. Seconds. */
  hitStop: { carveThreshold: 40, perPixel: 0.0004, max: 0.03, core: 0.025, cooldown: 0.12 },
  /** Screen shake: trauma-based. Amount is px at trauma 1. */
  shake: { maxOffset: 7, decay: 2.8, perPixel: 0.004, core: 0.12, explosion: 0.9, maxTrauma: 0.6 },
  /** Floating damage numbers; hits are merged within `mergeWindow` seconds. */
  numbers: { mergeWindow: 0.15, life: 0.7, rise: 40, minValue: 1 },
  /** WebAudio carve/hit sounds. */
  audio: { volume: 0.18, minInterval: 0.045 },
};
