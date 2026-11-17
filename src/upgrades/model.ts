import type { Modifier, Upgrade } from '../flow/node';

/** One upgrade card: pure data. A held upgrade IS its card (`RunState.upgrades` holds CardDefs, repeated per stack). */
export interface CardDef extends Upgrade {
  /** Heading on the card: the weapon or system it belongs to. */
  group: string;
  /** One line shown on the card. */
  desc: string;
  /** How many times the card can be held (it is offered until then). Default 1. */
  maxStacks?: number;
  /** Draw weight, default 1. */
  weight?: number;
  rarity?: 'common' | 'rare';
  modifiers: Modifier[];
}
