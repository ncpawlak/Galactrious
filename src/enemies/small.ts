import type { BossSpec } from '../boss';
import { aimedShot } from '../attacks';
import type { AttackPattern } from '../attacks';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { bob, combine, sway } from '../movement';
import { crisp, makeCanvas, shade } from '../bosses/paint';
import type { UnitDefinition } from '../units';

/**
 * Small units: one layer, a handful of hits. Silhouettes: Drone (red dart, no gun: a diver), Gunner (steel hexagon
 * with a chin gun) and Spinner (amber cross whose rotating gun sprays a spiral). Palette avoids violet, magenta, lime
 * and cyan so enemy and player bullets stay readable.
 */

/** Small-unit hull density (energy per pixel): one chain-gun bullet (90) carves about 30 pixels. */
const HULL = 3;

const every = (pattern: AttackPattern, seconds: number, source: string): AttackStep => ({ pattern, interval: seconds, source });

/** A small gun: dies in a hit or two and its blast is a pop, not a crater. */
const gun = (id: string, anchor: string, radius: number, turret: NonNullable<ComponentSpec['turret']>): ComponentSpec => ({
  id,
  type: 'turret',
  anchor,
  radius,
  hp: 110,
  mount: 'surface',
  group: id,
  turret,
  blast: { radius: 12, energy: 260, damage: 10, coreDamage: 30 },
  crater: { radius: radius * 0.8, energy: 150 },
});

function polygon(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

// --- Drone ---------------------------------------------------------------------------------------------

function layoutDrone(): BossSpec {
  const W = 34;
  const H = 36;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#d9503a';
  polygon(ctx, [[4, 2], [17, 9], [30, 2], [32, 15], [17, 35], [2, 15]]);
  ctx.fill();
  ctx.fillStyle = '#f2a65c';
  polygon(ctx, [[17, 9], [24, 15], [17, 28], [10, 15]]);
  ctx.fill();
  ctx.fillStyle = '#8c2a1c';
  ctx.fillRect(15, 3, 4, 7);
  crisp(ctx);
  shade(ctx, { noise: 0.14, edge: 0.7 });
  return { width: W, height: H, layers: [{ name: 'Hull', density: HULL, canvas }], core: { x: 17, y: 16, radius: 4, hp: 70 } };
}

export const drone: UnitDefinition = {
  id: 'drone',
  name: 'Drone',
  size: 'small',
  layout: layoutDrone,
  hold: combine(sway(5, 2.6), bob(3, 1.9)),
  attacks: [],
};

// --- Gunner --------------------------------------------------------------------------------------------

function layoutGunner(): BossSpec {
  const W = 44;
  const H = 40;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#6f86b0';
  polygon(ctx, [[10, 2], [34, 2], [43, 20], [34, 38], [10, 38], [1, 20]]);
  ctx.fill();
  ctx.fillStyle = '#44557a';
  ctx.fillRect(4, 17, 36, 5);
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(7, 8, 4, 4);
  ctx.fillRect(33, 8, 4, 4);
  crisp(ctx);
  shade(ctx, { noise: 0.14, edge: 0.7 });
  return {
    width: W,
    height: H,
    layers: [{ name: 'Hull', density: HULL, canvas }],
    core: { x: 22, y: 14, radius: 4, hp: 80 },
    anchors: { chin: { x: 22, y: 31 } },
  };
}

export const gunner: UnitDefinition = {
  id: 'gunner',
  name: 'Gunner',
  size: 'small',
  layout: layoutGunner,
  components: [gun('chin', 'chin', 6, { aim: 'tracking', angle: 90, trackRate: 140, telegraph: 0.5 })],
  hold: sway(6, 3),
  attacks: [every(aimedShot, 3.2, 'chin')],
  attackDelay: 1.2,
};

// --- Spinner -------------------------------------------------------------------------------------------

function layoutSpinner(): BossSpec {
  const S = 46;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#d9a52c';
  ctx.fillRect(17, 2, 12, 42);
  ctx.fillRect(2, 17, 42, 12);
  ctx.beginPath();
  ctx.arc(23, 23, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a5f12';
  for (const [x, y] of [[23, 2], [23, 38], [2, 23], [38, 23]]) ctx.fillRect(x - 3, y, 6, 6);
  crisp(ctx);
  shade(ctx, { noise: 0.14, edge: 0.7 });
  return {
    width: S,
    height: S,
    layers: [{ name: 'Hull', density: HULL, canvas }],
    core: { x: 23, y: 23, radius: 4, hp: 60 },
    anchors: { hub: { x: 23, y: 23 } },
  };
}

export const spinner: UnitDefinition = {
  id: 'spinner',
  name: 'Spinner',
  size: 'small',
  layout: layoutSpinner,
  // The gun sits on the hub, on top of the core: shoot the gun off first, then the core is bare.
  components: [gun('hub', 'hub', 8, { aim: 'rotating', angle: 90, spin: 80, telegraph: 0.4 })],
  hold: sway(4, 2.2),
  attacks: [every(aimedShot, 0.45, 'hub'), every(aimedShot, 0.45, 'hub'), every(aimedShot, 0.45, 'hub'), every(aimedShot, 2.4, 'hub')],
  attackDelay: 1.6,
};

export const SMALL_UNITS: UnitDefinition[] = [drone, gunner, spinner];
