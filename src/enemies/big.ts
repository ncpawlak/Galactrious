import type { BossSpec } from '../boss';
import { aimedShot, bomb, directVolley } from '../attacks';
import type { AttackPattern } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { bob, combine, sway } from '../movement';
import { crisp, makeCanvas, shade } from '../bosses/paint';
import type { UnitDefinition } from '../units';

/**
 * Big units: two layers (hull over a core chamber), turrets and explosives, many hits. Silhouettes: Frigate (wide
 * olive gunship with two tracking side guns and a keel volley gun) and Mortar (tall crimson wedge that lobs bombs, with
 * a fuel tank buried beside its core).
 */

const every = (pattern: AttackPattern, seconds: number, source: string): AttackStep => ({ pattern, interval: seconds, source });

function polygon(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

const turret = (id: string, anchor: string, group: string, radius: number, hp: number, spec: NonNullable<ComponentSpec['turret']>, blastRadius = 22): ComponentSpec => ({
  id,
  type: 'turret',
  anchor,
  radius,
  hp,
  mount: 'surface',
  group,
  turret: spec,
  blast: { radius: blastRadius, energy: 700, damage: 30, coreDamage: 60 },
  crater: { radius: radius * 0.9, energy: 600 },
});

// --- Frigate -------------------------------------------------------------------------------------------

function layoutFrigate(): BossSpec {
  const W = 116;
  const H = 84;
  const hull = makeCanvas(W, H);
  const h = hull.ctx;
  h.fillStyle = '#8d8672';
  polygon(h, [[58, 2], [100, 20], [114, 50], [104, 80], [12, 80], [2, 50], [16, 20]]);
  h.fill();
  h.strokeStyle = '#5f5a4a';
  h.lineWidth = 2;
  h.beginPath();
  h.moveTo(58, 6);
  h.lineTo(58, 76);
  h.moveTo(18, 30);
  h.lineTo(98, 30);
  h.stroke();
  h.fillStyle = '#c7bd9a';
  h.fillRect(52, 8, 12, 10);
  crisp(h);
  shade(h, { noise: 0.14, edge: 0.7, seamEvery: 29 });

  const guts = makeCanvas(W, H);
  const g = guts.ctx;
  g.fillStyle = '#8a3b2a';
  g.beginPath();
  g.roundRect(26, 22, 64, 44, 10);
  g.fill();
  crisp(g);
  shade(g, { noise: 0.12, edge: 1.5 });

  return {
    width: W,
    height: H,
    layers: [
      { name: 'Hull', density: 3.2, canvas: hull.canvas },
      { name: 'Core', density: 0.8, canvas: guts.canvas },
    ],
    core: { x: 58, y: 44, radius: 8, hp: 450 },
    anchors: { gunL: { x: 20, y: 54 }, gunR: { x: 96, y: 54 }, keel: { x: 58, y: 72 } },
  };
}

export const frigate: UnitDefinition = {
  id: 'frigate',
  name: 'Frigate',
  size: 'big',
  layout: layoutFrigate,
  components: [
    turret('gun-l', 'gunL', 'side-guns', 9, 200, { aim: 'tracking', angle: 90, trackRate: 100, telegraph: 0.6 }),
    turret('gun-r', 'gunR', 'side-guns', 9, 200, { aim: 'tracking', angle: 90, trackRate: 100, telegraph: 0.6 }),
    turret('keel', 'keel', 'keel-gun', 8, 160, { aim: 'fixed', angle: 90, telegraph: 0.6 }),
  ],
  coreArmor: { min: 0.35 },
  deathFraction: 0.8,
  hold: sway(14, 5),
  attacks: [every(aimedShot, 1.6, 'side-guns'), every(directVolley, 2.4, 'keel-gun'), every(aimedShot, 1.6, 'side-guns')],
  attackDelay: 1.2,
};

// --- Mortar --------------------------------------------------------------------------------------------

function layoutMortar(): BossSpec {
  const W = 92;
  const H = 110;
  const hull = makeCanvas(W, H);
  const h = hull.ctx;
  h.fillStyle = '#8c2f39';
  polygon(h, [[4, 4], [88, 4], [78, 52], [60, 106], [32, 106], [14, 52]]);
  h.fill();
  h.strokeStyle = '#d9a52c';
  h.lineWidth = 2;
  h.beginPath();
  h.moveTo(8, 9);
  h.lineTo(84, 9);
  h.moveTo(46, 12);
  h.lineTo(46, 100);
  h.stroke();
  h.fillStyle = '#5c1d26';
  h.fillRect(14, 24, 10, 8);
  h.fillRect(68, 24, 10, 8);
  crisp(h);
  shade(h, { noise: 0.14, edge: 0.7, seamEvery: 23 });

  const chamber = makeCanvas(W, H);
  const c = chamber.ctx;
  c.fillStyle = '#d9a52c';
  c.beginPath();
  c.roundRect(26, 30, 40, 52, 8);
  c.fill();
  crisp(c);
  shade(c, { noise: 0.12, edge: 1.4 });

  return {
    width: W,
    height: H,
    layers: [
      { name: 'Hull', density: 3.4, canvas: hull.canvas },
      { name: 'Chamber', density: 0.9, canvas: chamber.canvas },
    ],
    core: { x: 46, y: 50, radius: 8, hp: 480 },
    anchors: { mortar: { x: 46, y: 92 }, flankL: { x: 15, y: 20 }, flankR: { x: 77, y: 20 }, tank: { x: 46, y: 72 } },
  };
}

export const mortar: UnitDefinition = {
  id: 'mortar',
  name: 'Mortar',
  size: 'big',
  layout: layoutMortar,
  components: [
    turret('mortar-tube', 'mortar', 'mortar-tube', 11, 240, { aim: 'fixed', angle: 90, telegraph: 0.8 }, 26),
    turret('flank-l', 'flankL', 'flanks', 7, 130, { aim: 'tracking', angle: 90, trackRate: 120, telegraph: 0.5 }),
    turret('flank-r', 'flankR', 'flanks', 7, 130, { aim: 'tracking', angle: 90, trackRate: 120, telegraph: 0.5 }),
    {
      id: 'fuel',
      type: 'explosive',
      anchor: 'tank',
      radius: 8,
      hp: 90,
      mount: 'embedded',
      layer: 1,
      group: 'tank',
      blast: { radius: 40, energy: 2200, damage: 60, coreDamage: 200 },
    },
  ],
  coreArmor: { min: 0.3, requires: ['tank'] },
  deathFraction: 0.8,
  hold: combine(sway(10, 4.5), bob(4, 3)),
  attacks: [every(bomb, 3.4, 'mortar-tube'), every(aimedShot, 1.5, 'flanks'), every(aimedShot, 1.5, 'flanks')],
  attackDelay: 1.6,
};

export const BIG_UNITS: UnitDefinition[] = [frigate, mortar];
