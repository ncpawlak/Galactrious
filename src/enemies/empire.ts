import type { BossSpec } from '../boss';
import { aimedShot, directVolley } from '../attacks';
import type { AttackPattern } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { EMPIRE } from '../factions';
import { bob, combine, sway } from '../movement';
import { crisp, makeCanvas, shade } from '../bosses/paint';
import type { UnitDefinition } from '../units';
import { flipVertical, glowSlit, insignia, poly, stripe, symPoly } from './empirePaint';

/**
 * The empire roster (DESIGN.md "As built: Fallen Peace chapters 1-3"): one family. Slate-steel plating, forward-swept angular
 * wings (tips reach toward the nose), the red nested-chevron insignia and an accent stripe on every hull, orange glow and
 * orange diamond shots. Scale steps: Fighter 44 px, Flak battery 64 px, Gunship 112 px, then the capital ship (700 px).
 * Units face DOWN (nose toward the player); the rear fighter is the same ship flipped, for passes from behind.
 */

const K = EMPIRE;

/** Empire fire: the aimed shot in the faction's colours. */
export const empireShot: AttackPattern = { ...aimedShot, name: 'empire-shot', style: K.shot };
/** Empire straight-down volley in the faction's colours. */
export const empireVolley: AttackPattern = { ...directVolley, name: 'empire-volley', style: K.shot };
/** Flak: three bursts around where the target is, telegraphed for 0.85 s, then they go off (a short damage flash). */
export const flakBurst: AttackPattern = {
  name: 'flak',
  interval: 2.4,
  aimAtPlayer: true,
  fire({ target, spawnHazard }) {
    const offsets = [{ x: 0, y: 0 }, { x: -70, y: -45 }, { x: 70, y: -45 }];
    for (const o of offsets) {
      const to = { x: target.x + o.x, y: target.y + o.y };
      spawnHazard({ telegraph: 0.85, active: 0.22, damage: 1, shapeAt: () => ({ kind: 'circle', x: to.x, y: to.y, r: 42 }) });
    }
  },
};

export const every = (pattern: AttackPattern, seconds: number, source: string): AttackStep => ({ pattern, interval: seconds, source });

const HULL = 3;

/** A small empire gun housing on a hull. */
export const gun = (id: string, anchor: string, radius: number, hp: number, turret: NonNullable<ComponentSpec['turret']>, group = id): ComponentSpec => ({
  id,
  type: 'turret',
  anchor,
  radius,
  hp,
  mount: 'surface',
  group,
  turret,
  blast: { radius: 12 + radius, energy: 260 + radius * 40, damage: 10, coreDamage: 30 },
  crater: { radius: radius * 0.8, energy: 150 + radius * 30 },
});

// --- Fighter (nose down) ----------------------------------------------------------------------------------------

function layoutFighter(): BossSpec {
  const W = 44;
  const H = 48;
  const { canvas, ctx } = makeCanvas(W, H);
  // Forward-swept wings: the tips (low) reach toward the nose.
  symPoly(ctx, W, K.armour, [[20, 8], [1, 30], [1, 41], [20, 27]]);
  symPoly(ctx, W, K.armourLight, [[19, 10], [5, 29], [6, 33], [19, 21]]);
  // Fuselage with a bronze nose.
  poly(ctx, K.armourDark, [[22, 4], [26, 8], [26, 30], [22, 47], [18, 30], [18, 8]]);
  poly(ctx, K.hull, [[22, 47], [25, 34], [19, 34]]);
  // Accent stripe across the wings, clipped to what is painted.
  ctx.globalCompositeOperation = 'source-atop';
  stripe(ctx, K, 30, 3, W);
  ctx.globalCompositeOperation = 'source-over';
  insignia(ctx, K, 22, 12, 9);
  glowSlit(ctx, K, 20, 22, 4, 6);
  ctx.fillStyle = K.glow;
  ctx.fillRect(19, 2, 6, 3); // engine
  crisp(ctx);
  shade(ctx, { noise: 0.14, edge: 0.7 });
  return { width: W, height: H, layers: [{ name: 'Hull', density: HULL, canvas }], core: { x: 22, y: 18, radius: 4, hp: 80 }, anchors: { nose: { x: 22, y: 41 } } };
}

const FIGHTER_GUN = { aim: 'tracking', angle: 90, trackRate: 300, telegraph: 0.22 } as const;

export const empireFighter: UnitDefinition = {
  id: 'empire-fighter',
  name: 'Empire fighter',
  faction: 'empire',
  size: 'small',
  layout: layoutFighter,
  components: [gun('nose', 'nose', 5, 100, FIGHTER_GUN)],
  hold: combine(sway(8, 2.2), bob(4, 1.7)),
  // Bursts of three aimed shots, then a pause.
  attacks: [every(empireShot, 0.42, 'nose'), every(empireShot, 0.42, 'nose'), every(empireShot, 2.6, 'nose')],
  attackDelay: 0.9,
};

/** The fighter on a flyby: shoots almost at once and in quicker bursts, since it is only on screen for a couple of seconds. */
export const empireStrafer: UnitDefinition = {
  ...empireFighter,
  id: 'empire-strafer',
  name: 'Empire fighter (strafing)',
  attacks: [every(empireShot, 0.36, 'nose'), every(empireShot, 0.36, 'nose'), every(empireShot, 0.36, 'nose'), every(empireShot, 1.6, 'nose')],
  attackDelay: 0.15,
};

/** The fighter flipped (nose up): flies away from the player on a pass from behind. */
export const empireFighterRear: UnitDefinition = {
  ...empireFighter,
  id: 'empire-fighter-rear',
  name: 'Empire fighter (rear)',
  layout: () => flipVertical(layoutFighter()),
  attacks: empireStrafer.attacks,
  attackDelay: 0.15,
};

// --- Flak battery -----------------------------------------------------------------------------------------------

function layoutFlak(): BossSpec {
  const W = 64;
  const H = 52;
  const { canvas, ctx } = makeCanvas(W, H);
  symPoly(ctx, W, K.armour, [[32, 4], [62, 14], [62, 30], [44, 48], [32, 48]]);
  symPoly(ctx, W, K.armourLight, [[32, 7], [58, 15], [58, 19], [32, 14]]);
  symPoly(ctx, W, K.armourDark, [[24, 22], [32, 22], [32, 44], [26, 40]]);
  ctx.globalCompositeOperation = 'source-atop';
  stripe(ctx, K, 36, 3, W);
  ctx.globalCompositeOperation = 'source-over';
  insignia(ctx, K, 32, 10, 12);
  // Plate lights.
  ctx.fillStyle = K.glow;
  ctx.fillRect(8, 20, 4, 3);
  ctx.fillRect(52, 20, 4, 3);
  crisp(ctx);
  shade(ctx, { noise: 0.14, edge: 0.7, seamEvery: 21 });
  return { width: W, height: H, layers: [{ name: 'Plate', density: 4, canvas }], core: { x: 32, y: 22, radius: 5, hp: 120 }, anchors: { flak: { x: 32, y: 28 } } };
}

/** A drifting flak platform: one heavy gun that lays down telegraphed bursts around the player. Dodge, or carve it away. */
export const empireFlak: UnitDefinition = {
  id: 'empire-flak',
  name: 'Flak battery',
  faction: 'empire',
  size: 'small',
  layout: layoutFlak,
  components: [gun('flak', 'flak', 10, 220, { aim: 'tracking', angle: 90, trackRate: 120, telegraph: 0.5 })],
  hold: sway(6, 3),
  attacks: [every(flakBurst, 2.6, 'flak')],
  attackDelay: 0.8,
};

// --- Gunship ----------------------------------------------------------------------------------------------------

function layoutGunship(): BossSpec {
  const W = 112;
  const H = 92;
  const hull = makeCanvas(W, H);
  const h = hull.ctx;
  symPoly(h, W, K.armour, [[52, 10], [2, 52], [2, 76], [50, 40]]); // forward-swept main wings
  symPoly(h, W, K.armourLight, [[50, 14], [8, 52], [9, 58], [50, 30]]);
  poly(h, K.armourDark, [[56, 4], [70, 12], [70, 58], [56, 90], [42, 58], [42, 12]]);
  poly(h, K.hull, [[56, 90], [66, 66], [46, 66]]);
  symPoly(h, W, K.armour, [[44, 20], [30, 44], [32, 62], [46, 46]]); // inner pods
  h.globalCompositeOperation = 'source-atop';
  stripe(h, K, 48, 5, W);
  stripe(h, K, 60, 2, W);
  h.globalCompositeOperation = 'source-over';
  insignia(h, K, 56, 20, 16);
  glowSlit(h, K, 53, 36, 6, 9);
  h.fillStyle = K.glow;
  h.fillRect(48, 3, 16, 3);
  crisp(h);
  shade(h, { noise: 0.14, edge: 0.7, seamEvery: 31 });

  const guts = makeCanvas(W, H);
  const g = guts.ctx;
  g.fillStyle = K.deck;
  g.beginPath();
  g.roundRect(40, 24, 32, 44, 8);
  g.fill();
  g.fillStyle = K.accentDark;
  g.fillRect(48, 34, 16, 20);
  crisp(g);
  shade(g, { noise: 0.12, edge: 1.4 });

  return {
    width: W,
    height: H,
    layers: [
      { name: 'Hull', density: 3.4, canvas: hull.canvas },
      { name: 'Core', density: 0.8, canvas: guts.canvas },
    ],
    core: { x: 56, y: 44, radius: 8, hp: 420 },
    anchors: { wingL: { x: 12, y: 62 }, wingR: { x: 100, y: 62 }, nose: { x: 56, y: 78 } },
  };
}

const wingGun = (id: string, anchor: string): ComponentSpec => ({
  ...gun(id, anchor, 9, 190, { aim: 'tracking', angle: 90, trackRate: 120, telegraph: 0.5 }, 'wing-guns'),
  blast: { radius: 22, energy: 700, damage: 30, coreDamage: 60 },
  crater: { radius: 8, energy: 600 },
});

/** Gunship: two tracking wing guns and a fixed nose cannon (a straight volley). Bigger and slower than the fighter. */
export const empireGunship: UnitDefinition = {
  id: 'empire-gunship',
  name: 'Empire gunship',
  faction: 'empire',
  size: 'big',
  layout: layoutGunship,
  components: [wingGun('wing-l', 'wingL'), wingGun('wing-r', 'wingR'), gun('cannon', 'nose', 9, 170, { aim: 'fixed', angle: 90, telegraph: 0.6 }, 'cannon')],
  coreArmor: { min: 0.35 },
  deathFraction: 0.8,
  hold: combine(sway(16, 5.2), bob(3, 3)),
  attacks: [every(empireShot, 1.5, 'wing-guns'), every(empireVolley, 2.4, 'cannon'), every(empireShot, 1.5, 'wing-guns')],
  attackDelay: 1.2,
};

export const EMPIRE_UNITS: UnitDefinition[] = [empireFighter, empireStrafer, empireFighterRear, empireFlak, empireGunship];
