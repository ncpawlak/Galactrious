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
 *
 * A mini-boss cannot be disarmed by shooting its front guns off (the first Conquest playtest did exactly that). Its weapons are spread over the
 * whole hull, in five tiers, each its own gun group:
 *   NOSE   the nose gun (surface, the front): the heavy attack.
 *   WINGS  two tracking guns (surface, left and right).
 *   TAIL   two guns on the tail fins (surface, the rear): they cover the back and the flanks.
 *   PORTS  two guns buried in the Hull layer on the flanks (embedded): they fire from the start but cannot be shot until the Plating over
 *          them is carved, so they stay until you dig.
 *   CORE   a battery in the Core layer (embedded, starts OFF): it switches on when the hull falls below 40 % (phase 2) or the moment every
 *          surface gun is gone (`lastStand`), and then fires until the core itself is carved.
 * Every gun group has steps in the attack lists, and a step whose group is gone is skipped, so shooting a group off removes only its own
 * attacks. Below 40 % of the hull the second attack set (shorter pauses) takes over.
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
    // The ace's anchors (wings, nose) plus the mini-boss ones: the tail fins (rear), two ports on the flanks (buried in the Hull layer) and the core battery.
    const extra = { tailL: { x: 21, y: 8 }, tailR: { x: 39, y: 8 }, portL: { x: 13, y: 38 }, portR: { x: 47, y: 38 }, core: { x: s.core.x, y: s.core.y } };
    for (const [k, v] of Object.entries({ ...(s.anchors ?? {}), ...extra })) anchors[k] = { x: v.x * SCALE, y: v.y * SCALE };
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

/** A surface gun housing on the Plating. */
const bigGun = (id: string, anchor: string, radius: number, hp: number, aim: 'tracking' | 'fixed', group: string, telegraph = 0.35): ComponentSpec => ({
  ...gun(id, anchor, radius, hp, aim === 'tracking' ? { aim, angle: 90, trackRate: 200, telegraph } : { aim, angle: 90, telegraph }, group),
  blast: { radius: 24, energy: 620, damage: 20, coreDamage: 55 },
  crater: { radius: 9, energy: 480 },
});

/** A gun buried in a layer: it fires from the start; it can be shot once the layers above it are carved away over its centre. */
const buried = (id: string, anchor: string, layer: number, radius: number, hp: number, aim: 'tracking' | 'fixed', group: string, enabled = true): ComponentSpec => ({
  ...bigGun(id, anchor, radius, hp, aim, group, 0.4),
  mount: 'embedded',
  layer,
  enabled,
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

/** The visible guns: the ones a player can shoot off at once. Losing all of them wakes the core battery (`lastStand`). */
const SURFACE_GROUPS = ['nose', 'wings', 'tail'];

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
    phase2: { at: 40, attacks: a.p2, attackDelay: 1.0, components: { enable: ['core'] } },
    lastStand: { keys: SURFACE_GROUPS, enable: ['core'] },
    placement: acePlacement(a.firstPass, a.passEvery),
  };
}

interface HullKit {
  /** The nose gun (group 'nose'). */
  nose: ComponentSpec;
  /** Aim of the buried flank ports ('fixed' = straight down, for volleys and sweeps). */
  portAim: 'tracking' | 'fixed';
}

/** The five tiers of one mini-boss (see the header): wings, nose, tail fins, buried flank ports, core battery. */
const hull = (k: HullKit): ComponentSpec[] => [
  bigGun('wing-l', 'wingL', 9, 600, 'tracking', 'wings'),
  bigGun('wing-r', 'wingR', 9, 600, 'tracking', 'wings'),
  k.nose,
  bigGun('tail-l', 'tailL', 8, 520, 'tracking', 'tail'),
  bigGun('tail-r', 'tailR', 8, 520, 'tracking', 'tail'),
  buried('port-l', 'portL', 1, 8, 560, k.portAim, 'ports'),
  buried('port-r', 'portR', 1, 8, 560, k.portAim, 'ports'),
  buried('core-gun', 'core', 2, 9, 640, 'tracking', 'core', false),
];

/** VIPER: aimed bursts + straight volleys. Aimed: wing guns (bursts), tail guns, core battery. Straight: nose cannon, flank ports. */
export const MB_VIPER = makeMini({
  id: 'empire-mb-viper', callsign: 'VIPER', accent: '#ffd21f', accentDark: '#8a6d08', armour: 13, firstPass: 5, passEvery: 6,
  components: hull({ nose: bigGun('cannon', 'nose', 9, 560, 'fixed', 'nose', 0.55), portAim: 'fixed' }),
  p1: [every(empireShot, 0.5, 'wings'), every(empireShot, 0.5, 'wings'), every(empireVolley, 1.2, 'ports'), every(empireShot, 1.1, 'tail'), every(empireVolley, 1.6, 'nose'), every(empireShot, 1.6, 'wings'), every(empireShot, 1.4, 'core')],
  p2: [every(empireShot, 0.35, 'wings'), every(empireShot, 0.35, 'wings'), every(empireVolley, 0.9, 'ports'), every(empireShot, 0.8, 'tail'), every(empireVolley, 1.0, 'nose'), every(empireShot, 0.5, 'core'), every(empireShot, 1.2, 'wings'), every(empireShot, 0.7, 'core')],
});

/** CINDER: flak bursts + aimed shots. Flak: nose mount, tail guns, core battery. Aimed: wing guns, flank ports. */
export const MB_CINDER = makeMini({
  id: 'empire-mb-cinder', callsign: 'CINDER', accent: '#f4f6ff', accentDark: '#7f88a8', armour: 14, firstPass: 6, passEvery: 6,
  components: hull({ nose: bigGun('flak', 'nose', 10, 620, 'tracking', 'nose', 0.5), portAim: 'tracking' }),
  p1: [every(flakBurst, 3.0, 'nose'), every(empireShot, 0.6, 'wings'), every(empireShot, 0.6, 'wings'), every(empireShot, 1.2, 'ports'), every(flakBurst, 2.6, 'tail'), every(empireShot, 1.6, 'wings'), every(flakBurst, 2.6, 'core')],
  p2: [every(flakBurst, 2.0, 'nose'), every(empireShot, 0.4, 'wings'), every(empireShot, 0.4, 'wings'), every(empireShot, 0.9, 'ports'), every(flakBurst, 1.8, 'tail'), every(empireShot, 1.1, 'wings'), every(flakBurst, 1.5, 'core'), every(empireShot, 0.6, 'ports')],
});

/**
 * RAVEN: line sweeps + lobbed bombs. Sweeps: the nose emitter and the core battery (a sweep from a buried port across the flank was not dodgeable).
 * Bombs: wing launchers, tail launchers, flank ports.
 */
export const MB_RAVEN = makeMini({
  id: 'empire-mb-raven', callsign: 'RAVEN', accent: '#b06cff', accentDark: '#55308a', armour: 15, firstPass: 5.5, passEvery: 6,
  components: hull({ nose: bigGun('emitter', 'nose', 9, 560, 'fixed', 'nose', 0.5), portAim: 'tracking' }),
  p1: [every(sweepP, 4.2, 'nose'), every(bombP, 3.0, 'wings'), every(bombP, 3.6, 'tail'), every(bombP, 4.0, 'ports'), every(sweepP, 6.0, 'core')],
  p2: [every(sweepP, 3.6, 'nose'), every(bombP, 2.4, 'wings'), every(bombP, 2.8, 'tail'), every(bombP, 3.4, 'ports'), every(sweepP, 5.0, 'core')],
});

export const MINIBOSS_UNITS: UnitDefinition[] = [MB_VIPER, MB_CINDER, MB_RAVEN];
