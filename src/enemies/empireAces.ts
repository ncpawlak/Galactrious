import type { BossSpec } from '../boss';
import type { AttackStep } from '../attackSchedulers';
import type { ComponentSpec } from '../components';
import { EMPIRE, type FactionKit } from '../factions';
import { bob, combine, sway } from '../movement';
import { crisp, makeCanvas, shade } from '../bosses/paint';
import type { UnitDefinition, UnitPlacement } from '../units';
import type { Point } from '../hazards';
import { divePath } from '../waves';
import { W } from '../config';
import { empireShot, empireVolley, every, gun } from './empire';
import { glowSlit, insignia, poly, stripe, symPoly } from './empirePaint';

/**
 * Named empire aces (DESIGN.md "As built: finale systems and the empire ship"). A hero version of the empire fighter: 60 x 66 px,
 * two hulls layers (so it takes real carving), two tracking wing guns and a fixed nose cannon. The standard empire silhouette and
 * insignia, but the stripes and wing tips carry the ace's own accent colour so each ace reads at a glance.
 *
 * Behaviour: it swoops in from the side (the ace entrance), then holds and makes STRAFING PASSES (a deep dive across the screen)
 * every few seconds, firing straight volleys from the nose cannon and aimed shots from the wing guns. Below `PHASE2_AT` percent of
 * its hull it switches to its second attack set: fast AIMED BURSTS from the wing guns, shorter pauses. The HUD (src/finale) shows its
 * callsign above it and a banner when it enters. Spawn one with a campaign `spawn` beat / objective spawn `{ unit: 'empire-ace-viper', x, y }`.
 */

const K = EMPIRE;
const W_ = 60;
const H_ = 66;
/** Share (0..100) of the hull pixels gone when the second attack set starts. */
const PHASE2_AT = 38;

export function layoutAce(kit: FactionKit): () => BossSpec {
  return () => {
    const hull = makeCanvas(W_, H_);
    const h = hull.ctx;
    symPoly(h, W_, K.armour, [[27, 10], [1, 42], [1, 58], [27, 36]]); // forward-swept wings: tips reach toward the nose
    symPoly(h, W_, K.armourLight, [[26, 13], [6, 42], [7, 47], [26, 27]]);
    symPoly(h, W_, kit.accent, [[1, 54], [1, 58], [10, 46], [8, 44]]); // the ace's wing tips
    symPoly(h, W_, K.armour, [[27, 8], [14, 0], [22, 14]]); // tail fins
    poly(h, K.armourDark, [[30, 4], [36, 10], [36, 40], [30, 65], [24, 40], [24, 10]]);
    poly(h, K.hull, [[30, 65], [34, 50], [26, 50]]);
    h.globalCompositeOperation = 'source-atop';
    stripe(h, kit, 32, 4, W_);
    stripe(h, kit, 40, 2, W_);
    h.globalCompositeOperation = 'source-over';
    insignia(h, K, 30, 16, 10);
    glowSlit(h, K, 28, 24, 4, 7);
    h.fillStyle = K.glow;
    h.fillRect(26, 2, 8, 3); // engine
    crisp(h);
    shade(h, { noise: 0.14, edge: 0.7, seamEvery: 22 });

    const guts = makeCanvas(W_, H_);
    const g = guts.ctx;
    g.fillStyle = K.deck;
    g.beginPath();
    g.roundRect(23, 16, 14, 30, 4);
    g.fill();
    g.fillStyle = kit.accentDark;
    g.fillRect(27, 24, 6, 12);
    crisp(g);
    shade(g, { noise: 0.12, edge: 1.4 });

    return {
      width: W_,
      height: H_,
      layers: [
        { name: 'Hull', density: 3.6, canvas: hull.canvas },
        { name: 'Core', density: 0.8, canvas: guts.canvas },
      ],
      core: { x: 30, y: 30, radius: 6, hp: 230 },
      anchors: { wingL: { x: 9, y: 52 }, wingR: { x: 51, y: 52 }, nose: { x: 30, y: 60 } },
    };
  };
}

export const wingGun = (id: string, anchor: string): ComponentSpec => ({
  ...gun(id, anchor, 7, 130, { aim: 'tracking', angle: 90, trackRate: 220, telegraph: 0.3 }, 'wing-guns'),
  blast: { radius: 18, energy: 520, damage: 20, coreDamage: 45 },
  crater: { radius: 6, energy: 420 },
});

/** The ace entrance and strafing passes, from the slot: swoops in from the nearer side, then dives deep across the screen. */
export function acePlacement(first: number, every_: number): (slot: Point) => Pick<UnitPlacement, 'entrance' | 'entranceTime' | 'dive'> {
  return (slot) => {
    const from: Point = { x: slot.x < W / 2 ? -70 : W + 70, y: 60 };
    return {
      entrance: (u) => {
        const e = 1 - (1 - u) * (1 - u);
        return { x: from.x + (slot.x - from.x) * e, y: from.y + (slot.y - from.y) * (u * u * (3 - 2 * u)) };
      },
      entranceTime: 1.8,
      dive: { first, every: every_, time: 3.4, path: divePath(slot, 1.15) },
    };
  };
}

interface AceSpec {
  id: string;
  callsign: string;
  accent: string;
  accentDark: string;
  /** Pause scale: lower = fiercer. */
  fierce: number;
  firstPass: number;
  passEvery: number;
}

function makeAce(a: AceSpec): UnitDefinition {
  const kit: FactionKit = { ...K, accent: a.accent, accentDark: a.accentDark };
  const p1: AttackStep[] = [
    every(empireVolley, 1.3 * a.fierce, 'cannon'),
    every(empireShot, 0.7 * a.fierce, 'wing-guns'),
    every(empireVolley, 1.3 * a.fierce, 'cannon'),
    every(empireShot, 0.7 * a.fierce, 'wing-guns'),
  ];
  // Second set: bursts of four aimed shots, then a breather.
  const p2: AttackStep[] = [
    every(empireShot, 0.3 * a.fierce, 'wing-guns'),
    every(empireShot, 0.3 * a.fierce, 'wing-guns'),
    every(empireShot, 0.3 * a.fierce, 'wing-guns'),
    every(empireShot, 1.5 * a.fierce, 'wing-guns'),
  ];
  return {
    id: a.id,
    name: `Empire ace ${a.callsign}`,
    faction: 'empire',
    size: 'big',
    ace: true,
    callsign: a.callsign,
    accent: a.accent,
    layout: layoutAce(kit),
    components: [wingGun('wing-l', 'wingL'), wingGun('wing-r', 'wingR'), gun('cannon', 'nose', 7, 110, { aim: 'fixed', angle: 90, telegraph: 0.55 }, 'cannon')],
    coreArmor: { min: 0.4 },
    deathFraction: 0.8,
    hold: combine(sway(22, 4.4), bob(5, 2.6)),
    attacks: p1,
    attackDelay: 1.0,
    phase2: { at: PHASE2_AT, attacks: p2, attackDelay: 0.7 },
    placement: acePlacement(a.firstPass, a.passEvery),
  };
}

export const ACE_VIPER = makeAce({ id: 'empire-ace-viper', callsign: 'VIPER', accent: '#ffd21f', accentDark: '#8a6d08', fierce: 1.0, firstPass: 3.5, passEvery: 5 });
export const ACE_CINDER = makeAce({ id: 'empire-ace-cinder', callsign: 'CINDER', accent: '#f4f6ff', accentDark: '#7f88a8', fierce: 0.92, firstPass: 5, passEvery: 4.6 });
export const ACE_RAVEN = makeAce({ id: 'empire-ace-raven', callsign: 'RAVEN', accent: '#b06cff', accentDark: '#55308a', fierce: 0.85, firstPass: 4.2, passEvery: 4.2 });

export const ACE_UNITS: UnitDefinition[] = [ACE_VIPER, ACE_CINDER, ACE_RAVEN];
