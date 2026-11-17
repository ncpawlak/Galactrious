import { WEAPON_DEFS } from '../weapons';
import { CARD_BY_ID } from './cards';
import type { CardDef } from './model';
import type { Loadout } from './stats';

/** Accent colour per card group (card border bar, strip chips). */
export const GROUP_COLORS: Record<string, string> = {
  'Chain gun': '#ffd21f',
  Gauss: '#8fe9ff',
  Rocket: '#ffa94d',
  Arc: '#7dff9a',
  Scatter: '#ff9f43',
  Needler: '#c77dff',
  Lance: '#ff6bd6',
  Blades: '#e0f0ff',
  Swarm: '#ff78dc',
  Laser: '#ff5a7a',
  'Energy Wave': '#8f9bff',
  'Energy Bomb': '#ff5a4a',
  'Mine Layer': '#ffb347',
  Drone: '#6ee7ff',
  'Shield Pulse': '#9fe0ff',
  'Main gun': '#ffd21f',
  'All aux': '#7dd3ff',
  'Aux 1': '#7dd3ff',
  'Aux 2': '#7dd3ff',
  'Aux 3': '#7dd3ff',
  Burn: '#ff7a3c',
  'Trade-off': '#ff6b6b',
  Ship: '#c4a8ff',
};

export function groupColor(id: string): string {
  return GROUP_COLORS[CARD_BY_ID.get(id)?.group ?? ''] ?? '#ffffff';
}

/**
 * The heading of a card on the reward screen. A slot card names what it will act on right now: "MAIN GUN: Chain gun", "AUX 2: Rocket".
 * `equipped` = the run's weapon ids, main first, then the aux weapons in slot order (as `canOffer` reads them).
 */
export function cardHeading(card: CardDef, equipped: readonly string[]): string {
  const name = (id: string | undefined): string => (id ? (WEAPON_DEFS.find((w) => w.id === id)?.name ?? id) : '');
  if (card.slot === 'main') return card.group === 'Main gun' ? `Main gun: ${name(equipped[0])}` : card.group;
  if (typeof card.slot === 'number') return `Aux ${card.slot}: ${name(equipped[card.slot])}`;
  if (card.slot === 'aux' && card.group === 'All aux') return 'All aux weapons';
  return card.group;
}

/**
 * "Your upgrades" strip: one chip per held card with its stack count, wrapped inside `maxW`. Returns the height used.
 * Used on the reward screen (full names) and in the combat HUD (`compact`: just a coloured initial and count).
 */
export function drawUpgradeStrip(g: CanvasRenderingContext2D, lo: Loadout, x: number, y: number, maxW: number, compact = false): number {
  const held = lo.held();
  if (held.length === 0) return 0;
  g.save();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const h = compact ? 18 : 24;
  const gap = compact ? 3 : 6;
  let cx = x;
  let cy = y;
  for (const { card, n } of held) {
    const col = groupColor(card.id);
    const label = compact ? `${card.name[0]}${n > 1 ? n : ''}` : `${card.name}${n > 1 ? ` x${n}` : ''}`;
    g.font = compact ? 'bold 11px ui-monospace, Consolas, monospace' : '13px ui-monospace, Consolas, monospace';
    const w = Math.ceil(g.measureText(label).width) + (compact ? 10 : 18);
    if (cx + w > x + maxW && cx > x) {
      cx = x;
      cy += h + gap;
    }
    g.fillStyle = 'rgba(11, 20, 36, 0.85)';
    g.fillRect(cx, cy, w, h);
    g.fillStyle = col;
    g.fillRect(cx, cy, 3, h);
    g.fillStyle = '#e8ecf8';
    g.fillText(label, cx + (compact ? 7 : 11), cy + h / 2 + 1);
    cx += w + gap;
  }
  g.restore();
  return cy + h - y;
}
