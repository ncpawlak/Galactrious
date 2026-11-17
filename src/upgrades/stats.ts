import { MAINS, TUNING, WEAPONS } from '../config';
import { CARVE_SHAPES, type CarveShapeName } from '../carveShapes';
import type { Upgrade } from '../flow/node';
import { TAG_IDS, type TagSet } from '../tags';
import { CARD_BY_ID, CARDS } from './cards';
import { isUnlocked } from '../save';
import { shipBase, shipById } from '../ships';
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

export const STATS: Record<string, StatInfo> = {
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

  /** The tags a weapon's shots carry (`<weapon>.tag.<id>` stacks), or undefined when none. */
  tags(weapon: string): TagSet | undefined {
    let out: TagSet | undefined;
    for (const id of TAG_IDS) {
      const n = this.get(`${weapon}.tag.${id}`, 0);
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

/** `equipped` = the weapon ids in the run's slots: a card for a weapon that is not equipped is never offered. */
export function canOffer(card: CardDef, lo: Loadout, equipped?: ReadonlySet<string>): boolean {
  if (card.weapon && equipped && !equipped.has(card.weapon)) return false;
  return cardUnlocked(card) && lo.stackOf(card.id) < (card.maxStacks ?? 1);
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
