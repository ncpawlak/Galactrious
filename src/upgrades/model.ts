import type { Modifier, Upgrade } from '../flow/node';

/** Which equipped slot a card acts on: the main gun, every aux weapon ('aux'), or one aux slot (1, 2 or 3). */
export type CardSlot = 'main' | 'aux' | 1 | 2 | 3;

/** What an aux weapon must support for a generic aux card to mean something: a number of projectiles / minions, or a blast / bubble size. */
export type CardNeed = 'count' | 'radius';

/** One upgrade card: pure data. A held upgrade IS its card (`RunState.upgrades` holds CardDefs, repeated per stack). */
export interface CardDef extends Upgrade {
  /** Heading on the card: the weapon or system it belongs to. */
  group: string;
  /** One line shown on the card. */
  desc: string;
  /** Weapon id this card modifies (`WeaponDef.id`). The card is only offered while that weapon is equipped. Omitted = a slot, ship or utility card. */
  weapon?: string;
  /**
   * Slot-scoped card (DESIGN.md "Upgrade rework"): acts on whatever weapon sits in that slot, so it never goes dead when the loadout changes.
   * Offered only while the slot is filled ('aux' = at least one aux is equipped; 1-3 = that aux slot is filled).
   */
  slot?: CardSlot;
  /** With an aux `slot`: offered only when an equipped aux weapon in scope supports it (`AuxDef.supports`). */
  needs?: CardNeed;
  /** Offered only while the hull is at least this many points (trade-offs that cost hull). */
  minHull?: number;
  /** Synergy: offered only while any of these stats is above 0 in the held upgrades (e.g. a burn stack). */
  requiresAny?: string[];
  /** How many times the card can be held (it is offered until then). Default 1. */
  maxStacks?: number;
  /** Draw weight, default 1. */
  weight?: number;
  rarity?: 'common' | 'rare' | 'epic';
  /** Unlock flag (`save.unlocks.cards`). Omitted = always available; set = only drawn once `isUnlocked('cards', unlock)`. */
  unlock?: string;
  /** Shown on the Unlocks screen while locked (how to get it). */
  unlockHint?: string;
  modifiers: Modifier[];
}
