import type { AttackPattern } from '../attacks';
import { EMPIRE } from '../factions';

/**
 * Ground turret fire. Gentle on purpose (the surface run has air squadrons on top): slow imperial diamonds, one aimed shot or a
 * three-shot fan, and a mortar that marks a circle on the ground for a full second before it goes off. A turret also glows for its
 * `telegraph` before every shot (`ComponentSpec.turret.telegraph`), so the order is: glow, then the shot or the circle.
 */

const SPEED = 215;

/** One aimed shot along the barrel. */
export const groundShot: AttackPattern = {
  name: 'ground-shot',
  interval: 3.2,
  style: EMPIRE.shot,
  fire({ origin, target, spawn }) {
    const o = origin();
    const dx = target.x - o.x;
    const dy = target.y - o.y;
    const len = Math.hypot(dx, dy) || 1;
    spawn({ x: o.x, y: o.y, vx: (dx / len) * SPEED, vy: (dy / len) * SPEED, damage: 1 });
  },
};

/** Three diverging shots (about 15 degrees apart): a wide net, easy to sidestep. */
export const groundFan: AttackPattern = {
  name: 'ground-fan',
  interval: 3.4,
  style: EMPIRE.shot,
  fire({ origin, target, spawn }) {
    const o = origin();
    const base = Math.atan2(target.y - o.y, target.x - o.x);
    for (const k of [-1, 0, 1]) {
      const a = base + k * 0.26;
      spawn({ x: o.x, y: o.y, vx: Math.cos(a) * (SPEED - 15), vy: Math.sin(a) * (SPEED - 15), damage: 1 });
    }
  },
};

/** A mortar: a 50 px circle on the player's position, marked for 1 s, then a short blast. Move off it. */
export const groundMortar: AttackPattern = {
  name: 'ground-mortar',
  interval: 4.2,
  aimAtPlayer: true,
  fire({ target, spawnHazard }) {
    const to = { x: target.x, y: target.y };
    spawnHazard({ telegraph: 1.0, active: 0.22, damage: 1, shapeAt: () => ({ kind: 'circle', x: to.x, y: to.y, r: 50 }) });
  },
};
