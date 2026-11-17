import type { NodeHud } from '../flow/node';

/**
 * The Conquest run HUD (DESIGN.md "Conquest: as built"): top left, under the kills line, the MAP (name and number out of the total), a row of pips for
 * the map's waves (3, a mini-boss that replaces a wave takes that wave's pip) and a BOSS pip that lights up as soon as the map boss is the next node;
 * a centred banner when a map starts, a wave starts, a mini-boss enters and when the map boss (or the final boss) is up.
 */

export interface ConquestHudInfo {
  /** 1-based map and how many there are. */
  map: number;
  maps: number;
  mapName: string;
  /** The HUD of the current node (reward screens have none). */
  hud?: NodeHud;
  reward: boolean;
  /** What comes after the current node (on a reward screen: what the card is for). */
  next?: NodeHud;
  nodeTime: number;
  firstOfMap: boolean;
  /** Boss id when the current node is a boss fight. */
  boss?: string;
}

const MONO = 'ui-monospace, Consolas, monospace';
const BANNER_TIME = 2.8;
const GOLD = '#ffd21f';
const CYAN = '#6ee7ff';
const RED = '#ff6a5a';

/** Where the player is in the map: wave number (1..3, 0 = none yet), whether the boss is next or current. */
function progress(i: ConquestHudInfo): { wave: number; of: number; bossNext: boolean; bossNow: boolean; mini: boolean } {
  const h = i.reward ? i.next : i.hud;
  const of = (i.hud?.of ?? i.next?.of) || 3;
  const bossNow = !i.reward && i.hud?.kind === 'boss';
  const bossNext = i.reward && i.next?.kind === 'boss';
  // On a card screen the wave that was just played is the one before `next`.
  let wave = 0;
  if (i.reward) wave = i.next?.kind === 'wave' ? (i.next.n ?? 1) - 1 : i.next?.kind === 'boss' ? of : (i.next?.n ?? 1) - 1;
  else if (i.hud?.kind === 'wave') wave = i.hud.n ?? 1;
  else if (i.hud?.kind === 'mini') wave = i.hud.n ?? 0;
  else if (bossNow) wave = of;
  return { wave, of, bossNext: !!bossNext, bossNow, mini: h?.kind === 'mini' };
}

export function drawConquestHud(g: CanvasRenderingContext2D, i: ConquestHudInfo): void {
  const p = progress(i);
  g.save();
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.font = `bold 12px ${MONO}`;
  g.fillStyle = CYAN;
  g.fillText(`MAP ${i.map}/${i.maps}  ${i.mapName.toUpperCase()}`, 12, 42);
  // Wave pips and the boss pip.
  const x0 = 12;
  g.font = `11px ${MONO}`;
  g.fillStyle = '#8fa0c8';
  g.fillText(i.reward ? 'UPGRADE' : p.bossNow ? 'MAP BOSS' : i.hud?.kind === 'mini' ? 'MINI-BOSS' : `WAVE ${Math.max(1, p.wave)}/${p.of}`, x0, 58);
  for (let k = 0; k < p.of; k++) {
    const x = x0 + 86 + k * 16;
    const done = k < p.wave - (i.reward || p.bossNow ? 0 : 1);
    const cur = !i.reward && !p.bossNow && k === p.wave - 1;
    g.fillStyle = done ? CYAN : cur ? '#e8eefc' : 'rgba(110,231,255,0.18)';
    g.fillRect(x, 49, 12, 8);
    if (cur && i.hud?.kind === 'mini') {
      g.fillStyle = RED;
      g.fillRect(x, 49, 12, 8);
    }
  }
  // Boss pip: a diamond, lit when the boss is next or here.
  const bx = x0 + 86 + p.of * 16 + 8;
  const lit = p.bossNext || p.bossNow;
  const blink = lit && !p.bossNow ? 0.55 + 0.45 * Math.sin(i.nodeTime * 6) : 1;
  g.globalAlpha = lit ? blink : 1;
  g.fillStyle = lit ? GOLD : 'rgba(255,210,31,0.22)';
  g.beginPath();
  g.moveTo(bx, 46);
  g.lineTo(bx + 7, 53);
  g.lineTo(bx, 60);
  g.lineTo(bx - 7, 53);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  if (p.bossNext) {
    g.fillStyle = GOLD;
    g.font = `bold 11px ${MONO}`;
    g.fillText('BOSS NEXT', bx + 14, 57);
  }
  g.restore();

  // Banners.
  const t = i.nodeTime;
  if (t < BANNER_TIME && !i.reward) {
    const a = Math.min(1, (BANNER_TIME - t) / 0.7) * Math.min(1, t / 0.2);
    let head = '';
    let sub = '';
    let color = CYAN;
    if (i.hud?.kind === 'boss') {
      head = i.map === i.maps ? 'FINAL BOSS' : 'MAP BOSS';
      sub = i.hud.title ?? '';
      color = GOLD;
    } else if (i.hud?.kind === 'mini') {
      head = 'MINI-BOSS';
      sub = i.hud.title ?? '';
      color = RED;
    } else if (i.hud?.kind === 'wave') {
      head = `WAVE ${i.hud.n}/${i.hud.of ?? 3}`;
      sub = i.hud.title ?? '';
    }
    if (i.firstOfMap && head) {
      g.save();
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(5,6,13,0.6)';
      g.fillRect(40, 232, 460, 62);
      g.fillStyle = GOLD;
      g.font = `bold 26px ${MONO}`;
      g.fillText(`MAP ${i.map}/${i.maps}`, 270, 262);
      g.fillStyle = '#e8eefc';
      g.font = `14px ${MONO}`;
      g.fillText(i.mapName, 270, 284);
      g.restore();
    }
    if (head) {
      g.save();
      g.globalAlpha = a;
      g.textAlign = 'center';
      const y = i.firstOfMap ? 400 : 360;
      g.fillStyle = 'rgba(5,6,13,0.55)';
      g.fillRect(70, y - 34, 400, sub ? 62 : 44);
      g.fillStyle = color;
      g.font = `bold ${i.hud?.kind === 'boss' ? 34 : 28}px ${MONO}`;
      g.fillText(head, 270, y);
      if (sub) {
        g.fillStyle = '#e8eefc';
        g.font = `14px ${MONO}`;
        g.fillText(sub, 270, y + 22);
      }
      g.restore();
    }
  }
}
