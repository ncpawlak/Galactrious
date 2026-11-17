import type { BossSpec } from '../boss';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { bomb, lineSweep } from '../attacks';
import { EMPIRE, type FactionKit } from '../factions';
import { bob, combine, sway } from '../movement';
import type { UnitDefinition } from '../units';
import { crisp, makeCanvas } from '../bosses/paint';
import { empireShot, empireVolley, every, flakBurst, gun } from './empire';
import { acePlacement, layoutAce } from './empireAces';

/**
 * Conquest MINI-BOSSES (DESIGN.md Conquest "As built"): the empire aces rebuilt as real fights. Same silhouette and callsign tag/banner
 * as the campaign aces (`ace: true`, so the finale HUD shows the name, a hull bar and an entry banner) but 1.5x bigger, with two
 * armour layers over the core (Plating, Hull, Core: it takes real carving), far more gun and core hp, and TWO distinct weapon attacks
 * each (existing patterns): VIPER aimed bursts + straight volleys, CINDER flak + aimed shots, RAVEN line sweep + bombs.
 * Guns are carvable weak points: shooting a gun housing off removes that attack, so chip damage matters. Below 40 % of the hull
 * the second attack set speeds up (phase 2).
 */

const K = EMPIRE;
/** Linear size of a mini-boss relative to the ace. */
const SCALE = 1.5;

function scaleCanvas(src: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(Math.round(src.width * k), Math.round(src.height * k));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  crisp(ctx);
  return canvas;
}

/** The ace layout scaled up, with an outer plating layer (same silhouette as the hull) and tougher layers. */
function layoutMini(kit: FactionKit, armour: number): () => BossSpec {
  const base = layoutAce(kit);
  return () => {
    const s = base();
    const [hull, core] = s.layers;
    const hullC = scaleCanvas(hull.canvas, SCALE);
    // Plating: the hull silhouette darkened, carved first.
    const { canvas: plate, ctx } = makeCanvas(hullC.width, hullC.height);
    ctx.drawImage(hullC, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(34, 40, 62, 0.55)';
    ctx.fillRect(0, 0, plate.width, plate.height);
    const anchors: Record<string, { x: number; y: number }> = {};
    for (const [k, v] of Object.entries(s.anchors ?? {})) anchors[k] = { x: v.x * SCALE, y: v.y * SCALE };
    return {
      width: Math.round(s.width * SCALE),
      height: Math.round(s.height * SCALE),
      layers: [
        { name: 'Plating', density: armour * 1.2, canvas: plate },
        { name: 'Hull', density: armour, canvas: hullC },
        { name: 'Core', density: 1.4, canvas: scaleCanvas(core.canvas, SCALE) },
      ],
      core: { x: s.core.x * SCALE, y: s.core.y * SCALE, radius: s.core.radius * SCALE, hp: 1500 },
      anchors,
    };
  };
}

const bigGun = (id: string, anchor: string, radius: number, hp: number, aim: 'tracking' | 'fixed', group: string, telegraph = 0.35): ComponentSpec => ({
  ...gun(id, anchor, radius, hp, aim === 'tracking' ? { aim, angle: 90, trackRate: 200, telegraph } : { aim, angle: 90, telegraph }, group),
  blast: { radius: 24, energy: 620, damage: 20, coreDamage: 55 },
  crater: { radius: 9, energy: 480 },
});

const sweepP = { ...lineSweep, name: 'empire-sweep' };
const bombP = { ...bomb, name: 'empire-bomb' };

interface MiniSpec {
  id: string;
  callsign: string;
  accent: string;
  accentDark: string;
  armour: number;
  p1: AttackStep[];
  p2: AttackStep[];
  components: ComponentSpec[];
  firstPass: number;
  passEvery: number;
}

function makeMini(a: MiniSpec): UnitDefinition {
  const kit: FactionKit = { ...K, accent: a.accent, accentDark: a.accentDark };
  return {
    id: a.id,
    name: `Empire mini-boss ${a.callsign}`,
    faction: 'empire',
    size: 'big',
    ace: true,
    callsign: a.callsign,
    accent: a.accent,
    layout: layoutMini(kit, a.armour),
    components: a.components,
    coreArmor: { min: 0.5 },
    deathFraction: 0.5,
    hold: combine(sway(26, 5), bob(6, 3)),
    attacks: a.p1,
    attackDelay: 1.6,
    phase2: { at: 40, attacks: a.p2, attackDelay: 1.0 },
    placement: acePlacement(a.firstPass, a.passEvery),
  };
}

const wings = (): ComponentSpec[] => [bigGun('wing-l', 'wingL', 9, 600, 'tracking', 'wing-guns'), bigGun('wing-r', 'wingR', 9, 600, 'tracking', 'wing-guns')];

/** VIPER: aimed bursts from the wing guns + straight volleys from the nose cannon. */
export const MB_VIPER = makeMini({
  id: 'empire-mb-viper', callsign: 'VIPER', accent: '#ffd21f', accentDark: '#8a6d08', armour: 13, firstPass: 5, passEvery: 6,
  components: [...wings(), bigGun('cannon', 'nose', 9, 560, 'fixed', 'cannon', 0.55)],
  p1: [every(empireShot, 0.4, 'wing-guns'), every(empireShot, 0.4, 'wing-guns'), every(empireShot, 1.6, 'wing-guns'), every(empireVolley, 2.2, 'cannon')],
  p2: [every(empireShot, 0.3, 'wing-guns'), every(empireShot, 0.3, 'wing-guns'), every(empireShot, 0.3, 'wing-guns'), every(empireVolley, 1.3, 'cannon'), every(empireShot, 1.2, 'wing-guns')],
});

/** CINDER: flak bursts around the player from the flak mount + aimed shots from the wing guns. */
export const MB_CINDER = makeMini({
  id: 'empire-mb-cinder', callsign: 'CINDER', accent: '#f4f6ff', accentDark: '#7f88a8', armour: 14, firstPass: 6, passEvery: 6,
  components: [...wings(), bigGun('flak', 'nose', 10, 620, 'tracking', 'flak', 0.5)],
  p1: [every(flakBurst, 3.2, 'flak'), every(empireShot, 0.5, 'wing-guns'), every(empireShot, 0.5, 'wing-guns'), every(empireShot, 1.4, 'wing-guns')],
  p2: [every(flakBurst, 2.1, 'flak'), every(empireShot, 0.38, 'wing-guns'), every(empireShot, 0.38, 'wing-guns'), every(empireShot, 0.38, 'wing-guns'), every(empireShot, 1.1, 'wing-guns')],
});

/** RAVEN: line sweeps from the nose emitter + bombs lobbed onto the player from the wing launchers. */
export const MB_RAVEN = makeMini({
  id: 'empire-mb-raven', callsign: 'RAVEN', accent: '#b06cff', accentDark: '#55308a', armour: 15, firstPass: 5.5, passEvery: 6,
  components: [bigGun('wing-l', 'wingL', 9, 600, 'tracking', 'launchers'), bigGun('wing-r', 'wingR', 9, 600, 'tracking', 'launchers'), bigGun('emitter', 'nose', 9, 560, 'fixed', 'emitter', 0.5)],
  p1: [every(sweepP, 3.6, 'emitter'), every(bombP, 2.2, 'launchers'), every(bombP, 2.6, 'launchers')],
  p2: [every(sweepP, 2.6, 'emitter'), every(bombP, 1.5, 'launchers'), every(bombP, 1.5, 'launchers'), every(bombP, 2, 'launchers')],
});

export const MINIBOSS_UNITS: UnitDefinition[] = [MB_VIPER, MB_CINDER, MB_RAVEN];
