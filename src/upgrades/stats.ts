import { MAINS, TUNING, WEAPONS } from '../config';
import { CARVE_SHAPES, type CarveShapeName } from '../carveShapes';
import type { Upgrade } from '../flow/node';
import { TAG_IDS, type TagSet } from '../tags';
import { CARD_BY_ID, CARDS } from './cards';
import { isUnlocked } from '../save';
import { shipBase, shipById } from '../ships';
import { auxById } from '../weapons';
import type { CardDef } from './model';

/**
 * Stat keys upgrades can modify. `base` reads the unmodified definition (TUNING / WEAPONS are never mutated);
 * `good` says which direction is an improvement (for colouring); `show` formats a value for the card.
 * Keys named `<weapon>.tag.<tag>` are tag stacks (see src/tags.ts): the stack count is the stat value.
 */
export interface StatInfo {
  label: string;
  base: () => number;
  good: 'up' | 'down';
  show?: (v: number) => string;
}

const num = (v: number): string => (Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
const secs = (v: number): string => `${num(v)}s`;

/** Gauss shaft width tiers: the lateral penalty of each carve shape (lower = wider). */
export const GAUSS_SHAPES: CarveShapeName[] = ['narrow', 'narrow1', 'narrow2', 'narrow3'];

/** Laser width tiers (`laser.width`), see `shapeTiers` of the Laser in weapons.ts. */
export const LASER_SHAPES: CarveShapeName[] = ['laser', 'laser1', 'laser2', 'laser3'];

const pct = (v: number): string => `${Math.round(v * 100)}%`;
/** The generic aux stats; each exists for all aux weapons (`aux.*`) and per slot (`aux1.*` .. `aux3.*`). Base 1 = a multiplier, base 0 = an add. */
const AUX_GENERIC: Record<string, StatInfo> = {
  cooldown: { label: 'recharge time', base: () => 1, good: 'down', show: pct },
  damage: { label: 'damage', base: () => 1, good: 'up', show: pct },
  count: { label: 'extra shots', base: () => 0, good: 'up', show: (v) => `+${num(v)}` },
  radius: { label: 'blast size', base: () => 1, good: 'up', show: pct },
};
const AUX_STATS: Record<string, StatInfo> = {};
for (const [k, i] of Object.entries(AUX_GENERIC)) {
  AUX_STATS[`aux.${k}`] = { ...i, label: `All aux ${i.label}` };
  for (const n of [1, 2, 3]) AUX_STATS[`aux${n}.${k}`] = { ...i, label: `Aux ${n} ${i.label}` };
}

export const STATS: Record<string, StatInfo> = {
  // Slot-scoped (generic) stats: the weapon defs read these for their slot on top of their own `<weapon>.*` stat (weapons.ts `slotStat`, `effectiveMain`).
  'main.fireRate': { label: 'Main gun fire rate', base: () => 1, good: 'up', show: pct },
  'main.damage': { label: 'Main gun damage', base: () => 1, good: 'up', show: pct },
  'main.barrels': { label: 'Main gun extra barrels', base: () => 0, good: 'up', show: (v) => `+${num(v)}` },
  'main.pierce': { label: 'Main gun pierce', base: () => 0, good: 'up', show: (v) => `+${Math.round(v * 100)}%` },
  'main.tag.burn': { label: 'Main gun burn', base: () => 0, good: 'up', show: (v) => `+${num(v)}` },
  'aux.tag.burn': { label: 'Aux weapon burn', base: () => 0, good: 'up', show: (v) => `+${num(v)}` },
  ...AUX_STATS,
  'lance.duration': { label: 'Lance beam time', base: () => WEAPONS.lance.duration, good: 'up', show: secs },
  'flak.fuse': { label: 'Bomb fuse', base: () => WEAPONS.flak.fuse, good: 'down', show: secs },
  'mine.count': { label: 'Mines per drop', base: () => 1, good: 'up', show: num },
  'mine.arm': { label: 'Mine arm time', base: () => WEAPONS.mine.arm, good: 'down', show: secs },
  'mine.trigger': { label: 'Mine trigger range', base: () => WEAPONS.mine.trigger, good: 'up', show: (v) => `${num(v)}px` },
  'drone.count': { label: 'Drones', base: () => 1, good: 'up', show: num },
  'drone.fireRate': { label: 'Drone fire rate', base: () => WEAPONS.drone.rate, good: 'up', show: (v) => `${num(v)}/s` },
  'drone.duration': { label: 'Drone flight time', base: () => WEAPONS.drone.duration, good: 'up', show: secs },
  'shield.duration': { label: 'Shield time', base: () => WEAPONS.shield.duration, good: 'up', show: secs },
  'shield.radius': { label: 'Shield radius', base: () => WEAPONS.shield.radius, good: 'up', show: (v) => `${num(v)}px` },
  'chain.fireRate': { label: 'Chain gun rate', base: () => TUNING.ship.fireRate, good: 'up', show: (v) => `${num(v)}/s` },
  'chain.damage': { label: 'Chain gun damage', base: () => TUNING.ship.damage, good: 'up', show: num },
  'chain.barrels': { label: 'Chain gun barrels', base: () => 1, good: 'up', show: num },
  'chain.tag.burn': { label: 'Burn', base: () => 0, good: 'up', show: (v) => `+${num(v)}` },
  'gauss.energy': { label: 'Gauss reach', base: () => WEAPONS.gauss.energy, good: 'up', show: num },
  'gauss.width': {
    label: 'Gauss width',
    base: () => 0,
    good: 'up',
    show: (v) => `${(CARVE_SHAPES.narrow.lateralPenalty / CARVE_SHAPES[gaussShape(v)].lateralPenalty).toFixed(1)}x`,
  },
  'gauss.cooldown': { label: 'Gauss cooldown', base: () => WEAPONS.gauss.cooldown, good: 'down', show: secs },
  'rocket.radius': { label: 'Rocket radius', base: () => WEAPONS.rocket.blast.radius, good: 'up', show: num },
  'rocket.energy': { label: 'Rocket energy', base: () => WEAPONS.rocket.blast.energy, good: 'up', show: num },
  'rocket.cooldown': { label: 'Rocket cooldown', base: () => WEAPONS.rocket.cooldown, good: 'down', show: secs },
  'arc.count': { label: 'Arc missiles', base: () => 2, good: 'up', show: num },
  'arc.cooldown': { label: 'Arc cooldown', base: () => WEAPONS.arc.cooldown, good: 'down', show: secs },
  'scatter.fireRate': { label: 'Scatter rate', base: () => TUNING.ship.fireRate * MAINS.scatter.rateMul, good: 'up', show: (v) => `${num(v)}/s` },
  'scatter.damage': { label: 'Scatter damage', base: () => TUNING.ship.damage * MAINS.scatter.damageMul, good: 'up', show: num },
  'scatter.barrels': { label: 'Scatter pellets', base: () => MAINS.scatter.projectiles, good: 'up', show: (v) => num(v + MAINS.scatter.projectiles - 1) },
  'needle.fireRate': { label: 'Needler rate', base: () => TUNING.ship.fireRate * MAINS.needle.rateMul, good: 'up', show: (v) => `${num(v)}/s` },
  'needle.damage': { label: 'Needler damage', base: () => TUNING.ship.damage * MAINS.needle.damageMul, good: 'up', show: num },
  'laser.fireRate': { label: 'Laser rate', base: () => TUNING.ship.fireRate * MAINS.laser.rateMul, good: 'up', show: (v) => `${num(v)}/s` },
  'laser.damage': { label: 'Laser damage', base: () => TUNING.ship.damage * MAINS.laser.damageMul, good: 'up', show: num },
  'laser.pierce': { label: 'Laser pierce', base: () => MAINS.laser.pierce, good: 'up', show: (v) => `${Math.round(Math.min(0.95, v) * 100)}%` },
  'laser.width': {
    label: 'Laser width',
    base: () => 0,
    good: 'up',
    show: (v) => `${(CARVE_SHAPES.laser.lateralPenalty / CARVE_SHAPES[LASER_SHAPES[Math.max(0, Math.min(LASER_SHAPES.length - 1, Math.round(v)))]].lateralPenalty).toFixed(1)}x`,
  },
  'wave.arc': { label: 'Wave arc', base: () => WEAPONS.wave.arcDeg, good: 'up', show: (v) => `${num(v)}°` },
  'wave.reach': { label: 'Wave reach', base: () => WEAPONS.wave.reach, good: 'up', show: (v) => `${num(v)}px` },
  'wave.cooldown': { label: 'Wave cooldown', base: () => WEAPONS.wave.cooldown, good: 'down', show: secs },
  'wave.edge': { label: 'Wave edge power', base: () => WEAPONS.wave.edge, good: 'up', show: (v) => `${Math.round(Math.min(1, v) * 100)}%` },
  'lance.energy': { label: 'Lance energy', base: () => WEAPONS.lance.energy, good: 'up', show: num },
  'lance.cooldown': { label: 'Lance cooldown', base: () => WEAPONS.lance.cooldown, good: 'down', show: secs },
  'blades.count': { label: 'Blades', base: () => WEAPONS.blades.count, good: 'up', show: num },
  'blades.cooldown': { label: 'Blades cooldown', base: () => WEAPONS.blades.cooldown, good: 'down', show: secs },
  'swarm.count': { label: 'Swarm missiles', base: () => WEAPONS.swarm.count, good: 'up', show: num },
  'swarm.cooldown': { label: 'Swarm cooldown', base: () => WEAPONS.swarm.cooldown, good: 'down', show: secs },
  'ship.maxHealth': { label: 'Max hull', base: () => TUNING.player.maxHealth, good: 'up', show: num },
  'dodge.cooldown': { label: 'Dodge cooldown', base: () => TUNING.dodge.cooldown, good: 'down', show: secs },
  'ship.speed': { label: 'Ship speed', base: () => TUNING.ship.speed, good: 'up', show: num },
  'ship.hitbox': { label: 'Hitbox radius', base: () => TUNING.player.hitbox, good: 'down', show: (v) => `${num(v)}px` },
};

export function gaussShape(width: number): CarveShapeName {
  return GAUSS_SHAPES[Math.max(0, Math.min(GAUSS_SHAPES.length - 1, Math.round(width)))];
}

/**
 * The effective stats of a run: base definitions + the held upgrades, derived on demand (nothing global is
 * mutated, so a new run with no upgrades is automatically back to base). Per stat: (base + sum of adds) x product of muls.
 */
export class Loadout {
  private readonly add = new Map<string, number>();
  private readonly mul = new Map<string, number>();
  private readonly stacks = new Map<string, number>();
  readonly count: number;
  /** The ship's base values for the ship stats (max hull, speed, hitbox, dodge cooldown); everything else uses `STATS[..].base`. */
  private readonly shipStats: Record<string, number>;
  /** Campaign ship tuning: stat multipliers applied last (`ShipStats.statMul`). */
  private readonly shipMul: Record<string, number>;

  constructor(
    readonly upgrades: readonly Upgrade[],
    readonly shipId?: string,
  ) {
    this.shipStats = shipBase(shipId ?? '');
    this.shipMul = shipId ? (shipById(shipId).baseStats.statMul ?? {}) : {};
    this.count = upgrades.length;
    for (const u of upgrades) {
      this.stacks.set(u.id, (this.stacks.get(u.id) ?? 0) + 1);
      for (const m of u.modifiers) {
        if (m.op === 'add') this.add.set(m.stat, (this.add.get(m.stat) ?? 0) + m.value);
        else this.mul.set(m.stat, (this.mul.get(m.stat) ?? 1) * m.value);
      }
    }
  }

  /** Effective value of a stat. `base` defaults to the stat's own base; pass one for a live-adjusted base (debug damage). */
  get(stat: string, base: number = this.shipStats[stat] ?? STATS[stat]?.base() ?? 0): number {
    return (base + (this.add.get(stat) ?? 0)) * (this.mul.get(stat) ?? 1) * (this.shipMul[stat] ?? 1);
  }

  /** The tags a weapon's shots carry (`<weapon>.tag.<id>` stacks plus the stacks of each slot scope in `scopes`: 'main', 'aux', 'aux2'), or undefined when none. */
  tags(weapon: string, scopes: readonly string[] = []): TagSet | undefined {
    let out: TagSet | undefined;
    for (const id of TAG_IDS) {
      const n = [weapon, ...scopes].reduce((sum, w) => sum + this.get(`${w}.tag.${id}`, 0), 0);
      if (n > 0) (out ??= {})[id] = n;
    }
    return out;
  }

  /** Times the card with this id is held. */
  stackOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  /** Held upgrades grouped by id, in pick order: for the HUD strip and debug listing. */
  held(): { card: Upgrade; n: number }[] {
    const out: { card: Upgrade; n: number }[] = [];
    for (const u of this.upgrades) {
      const e = out.find((o) => o.card.id === u.id);
      if (e) e.n++;
      else out.push({ card: u, n: 1 });
    }
    return out;
  }
}

/** A loadout with one more copy of `card` (for the "now -> becomes" preview). */
export function withCard(held: readonly Upgrade[], card: CardDef, shipId?: string): Loadout {
  return new Loadout([...held, card], shipId);
}

/** True when the card is always available or its unlock flag is set in the save. */
export function cardUnlocked(card: CardDef): boolean {
  return !card.unlock || isUnlocked('cards', card.unlock);
}

/**
 * `equipped` = the weapon ids in the run's slots, main first and then the aux weapons in slot order (a Set keeps insertion order).
 * A weapon card is offered only while that weapon is equipped; a slot card only while its slot is filled (and, with `needs`, while an
 * aux weapon in scope supports it); a burn synergy only with a burn stack held; a hull trade-off only with enough hull to pay.
 */
export function canOffer(card: CardDef, lo: Loadout, equipped?: ReadonlySet<string>): boolean {
  if (!cardUnlocked(card) || lo.stackOf(card.id) >= (card.maxStacks ?? 1)) return false;
  if (card.minHull !== undefined && lo.get('ship.maxHealth') < card.minHull) return false;
  if (card.requiresAny && !card.requiresAny.some((k) => lo.get(k, 0) > 0)) return false;
  if (!equipped) return true;
  if (card.weapon && !equipped.has(card.weapon)) return false;
  if (card.slot !== undefined && card.slot !== 'main') {
    const aux = [...equipped].slice(1);
    const scope = card.slot === 'aux' ? aux : aux.slice(card.slot - 1, card.slot);
    if (scope.length === 0) return false;
    const need = card.needs;
    if (need && !scope.some((id) => auxById(id)?.supports?.[need])) return false;
  }
  return true;
}

/** Pick up to `n` distinct cards, weighted, without replacement, using the run's seeded `rng`. Cards at max stacks are skipped. */
export function drawCards(rng: () => number, held: readonly Upgrade[], n: number, equipped?: ReadonlySet<string>, shipId?: string): CardDef[] {
  const lo = new Loadout(held, shipId);
  const pool = CARDS.filter((c) => canOffer(c, lo, equipped));
  const out: CardDef[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((s, c) => s + (c.weight ?? 1), 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].weight ?? 1;
      if (r < 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export interface StatPreview {
  label: string;
  now: string;
  next: string;
  good: boolean;
}

/** What taking `card` would change, one row per stat it touches: "Rocket radius 88 -> 106". */
export function previewCard(card: CardDef, held: readonly Upgrade[], shipId?: string): StatPreview[] {
  const now = new Loadout(held, shipId);
  const next = withCard(held, card, shipId);
  const keys = [...new Set(card.modifiers.map((m) => m.stat))];
  return keys.map((k) => {
    const info = STATS[k];
    const a = now.get(k);
    const b = next.get(k);
    return { label: info?.label ?? k, now: info?.show?.(a) ?? num(a), next: info?.show?.(b) ?? num(b), good: info ? (info.good === 'up') === b > a : true };
  });
}

export { CARDS, CARD_BY_ID };
