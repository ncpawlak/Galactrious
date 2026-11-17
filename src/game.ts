import { Attacks, PATTERNS } from './attacks';
import { Sfx } from './audio';
import type { Boss, HitResult } from './boss';
import { BossFight } from './bossFight';
import { EnrageTint } from './enrage';
import { BOSSES, DEFAULT_BOSS_ID, type BossDefinition } from './bosses';
import type { CarveShapeName } from './carveShapes';
import { BLAST, BLAST_DEFAULT_SCALE, H, setBlastScale, TUNING, W, WEAPONS } from './config';
import { saveStore, type UnlockKind } from './save';
import { setScrollHooks } from './campaign/hooks';
import { DebugPanel, modifierMult } from './debugControls';
import { Effects } from './effects';
import { DEFAULT_RUN } from './flow/defaultRun';
import type { CombatCounters, CombatResult, NodeHost } from './flow/node';
import { captureSnapshot, diffSnapshot, restoreSnapshot } from './campaign/snapshot';
import { Run } from './flow/run';
import { Hud } from './hud';
import { Input } from './input';
import { MOVEMENT_PRESETS } from './movement';
import { Dodge, Health } from './player';
import { DamageFx, type Emit } from './damageFx';
import { TagSystem, type TagSet } from './tags';
import { CARDS, CARD_BY_ID } from './upgrades/cards';
import { RewardNode } from './flow/nodes/reward';
import type { FlowNode, NodeContext } from './flow/node';
import { Loadout } from './upgrades/stats';
import { AUX_DEFS, AUX_KEYS, MAIN_DEFS, WEAPON_DEFS, Sweep, WeaponSystem, auxById, effectiveMain, mainById, nearBox, type AuxDef, type Combatant } from './weapons';
import { drawShipLook, SHIP_BY_ID, shipById, shipMinY, SHIPS } from './ships';
import { cleanLoadout } from './loadouts';
import { UnitSystem, type Unit } from './units';
import { divePath, spawnWave, type WaveDefinition } from './waves';
import type { RoomHost } from './rooms';
import { UNIT_LIST, WAVE_LIST, unitById } from './enemies';
import { flybyPlacement, type FlybyRequest } from './enemies/flyby';
import { SCROLL_LEVELS, ScrollRunnerImpl, scrollLevelById, type ScrollHost, type ScrollLevelDef } from './scroll';

export interface ShipStats {
  /** Energy per bullet. */
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** Bullets per shot. */
  projectiles: number;
  /** Fraction (0..1) of energy kept after impact; the bullet continues. */
  pierce: number;
  /** Angle between neighbouring bullets, in degrees. */
  spreadDeg: number;
}

const DEFAULT_STATS: ShipStats = {
  damage: TUNING.ship.damage,
  fireRate: TUNING.ship.fireRate,
  projectiles: 1,
  pierce: 0,
  spreadDeg: 5,
};

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  energy: number;
  pierce: number;
  alive: boolean;
  /** Elemental tags the shot carries (from upgrades). */
  tags?: TagSet;
  /** Main-weapon extras (src/weapons.ts `MainDef`); the chain gun sets none of these, so its bullets behave exactly as before. */
  speed?: number;
  shape?: CarveShapeName;
  look?: { color: string; w: number; h: number; glow?: string };
  /** Distance fall-off: `base` energy x a factor that eases from `near` to `far` between `start` and `end` px; the bullet dies at `end`. */
  fall?: { start: number; end: number; near: number; far: number; base: number; travelled: number };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
}

const MAX_PARTICLES = 500;
/** Run mode: seconds the explosion plays after a boss falls before the node ends. */
const WIN_BEAT = 2.2;

type State = 'playing' | 'won' | 'lost';

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private fight: BossFight;
  private bossDefIndex = Math.max(0, BOSSES.findIndex((b) => b.id === DEFAULT_BOSS_ID));
  private stats: ShipStats = { ...DEFAULT_STATS };
  private ship = { x: W / 2, y: H - 140 };
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private readonly stars: Star[] = [];
  private readonly dodge = new Dodge();
  private readonly health = new Health();
  private readonly dmgFx = new DamageFx();
  private readonly emitP: Emit = (x, y, vx, vy, life, color, size) => {
    if (this.particles.length < MAX_PARTICLES) this.particles.push({ x, y, vx, vy, life, max: life, color, size });
  };
  private readonly beep = (v: number): void => this.sfx.lowAlarm(v);
  private readonly attacks = new Attacks();
  /** False in wave nodes: the dormant boss fight is not updated, drawn, targeted or shown in the HUD. */
  private bossActive = true;
  private readonly units = new UnitSystem(this.ship);
  /** Where room functions fire, drop hazards and launch drones: the boss's rooms and every unit's room. */
  private readonly roomHost: RoomHost = {
    fire: (p, o, alive) => this.attacks.firePattern(p, o, this.ship, alive),
    hazard: (h) => this.attacks.spawnHazard(h),
    spawnUnit: (id, from) => this.launchDrone(id, from),
  };
  /** Everything the player's shots can hit this frame: the live boss plus live units (refreshed once per update). */
  private targetList: BossFight[] = [];
  private readonly weapons: WeaponSystem = new WeaponSystem({
    ship: this.ship,
    targets: () => this.targetList,
    power: () => this.stats.damage / TUNING.ship.damage,
    carve: (t, x, y, energy, shape) => this.carveAt(t as BossFight, x, y, energy, shape),
    onFire: (id) => this.sfx.weapon(id),
    stat: (key, base) => this.loadout.get(key, base),
    tags: (w) => this.loadout.tags(w),
    onHit: (tags, x, y, energy, target) => this.tags.onHit(tags, x, y, energy, target),
  });
  /** Tag hooks (src/tags.ts): elemental effects of upgrades. Handlers only ever touch targets, never the ship. */
  private readonly tags = new TagSystem({
    power: () => this.stats.damage / TUNING.ship.damage,
    carveQuiet: (t, x, y, energy, shape) => this.carveAt(t as BossFight, x, y, energy, shape, true) !== null,
  });
  /** The running scroll level (src/scroll): background, obstacles, allies and the distance timeline. Null = no scrolling. */
  private scroll: ScrollRunnerImpl | null = null;
  /** Debug (boss mode): the boss was set aside while a scroll test runs, so stopping the scroll brings it back. */
  private bossSuspended = false;
  private lastBlockedSfx = 0;
  private readonly scrollHost: ScrollHost = {
    ship: this.ship,
    spawnUnit: (id, x, y) => this.spawnDebugUnit(id, x, y),
    spawnFlyby: (r) => this.spawnFlyby(r),
    spawnWave: (w) => this.spawnDebugWave(w),
    spawnBoss: (id) => this.activateBoss(id),
    setWeaponsLocked: (on) => this.setWeaponsLocked(on),
  };
  /** Campaign: weapons off (chapter 3). Cleared by every `reset`, so a checkpoint restart re-applies it from the objective. */
  private weaponsLocked = false;
  /** Cumulative combat counters the campaign reads (kills, hits, rooms); never reset. */
  private readonly combatCounters: CombatCounters = { kills: 0, hits: 0, damage: 0, roomsDestroyed: 0, killsByTag: {} };
  private lostAt = 0;
  private fireTimer = 0;
  private state: State = 'playing';
  private elapsed = 0;
  private wonAt = 0;
  /** Debug: elapsed time when each layer dropped to <=5% remaining, plus the core at the end (null until then). */
  private clearAt: (number | null)[] = [];
  /** Time (s) at which 25% of the hull layer (layer 0) was carved away. */
  private hull25At: number | null = null;
  /** Debug: scripted ship control for measuring clear times. 'sweep' = steady side-to-side, 'focus' = aim at the core. */
  private auto: 'off' | 'sweep' | 'focus' = 'off';
  /** Ship height under the autopilot (default H - 140); `game.debug.setAutoY` moves it for range measurements. */
  private autoY = H - 140;
  private testMode = false;
  private readonly fx = new Effects();
  private readonly sfx = new Sfx();
  /** Debug text/panel: off in the normal run, on in `?mode=boss` or with `?debug`. [`] toggles it live. */
  private showDebug = ((p) => p.get('mode') === 'boss' || p.has('debug'))(new URLSearchParams(location.search));
  /** Debug: the player takes no damage. */
  godMode = false;
  private readonly panel: DebugPanel;
  private fps = 60;
  private last = 0;
  /**
   * 'run' = the flow engine drives the game (title -> levels -> win). 'boss' = the old one-boss test mode that
   * all the debug tooling and `debug.simulate` use: `?mode=boss` in the URL, or [Z] to switch at runtime.
   */
  private mode: 'run' | 'boss' = new URLSearchParams(location.search).get('mode') === 'boss' ? 'boss' : 'run';
  /** Run mode: true while the current node runs the combat sim (ship, weapons, boss). Off = plain starfield + the node's own screen. */
  private combat = false;
  private readonly taps: { x: number; y: number }[] = [];
  private readonly keyPresses: string[] = [];
  private readonly nodeHost: NodeHost = this.makeNodeHost();
  private readonly run: Run = new Run(DEFAULT_RUN, this.nodeHost);
  /** Debug: a flow node (the reward screen) shown over everything with the sim paused. */
  private overlay: FlowNode | null = null;
  private loadoutCache: { ref: unknown; len: number; ship: string; lo: Loadout } | null = null;

  /** The debug panel sits at the bottom-left, over the menu buttons: it is neither drawn nor clickable on menu screens (run mode, no combat). */
  private get panelVisible(): boolean {
    return this.showDebug && !this.overlay && (this.mode !== 'run' || this.combat);
  }

  /** Effective stats: base definitions + the held upgrades (`run.state.upgrades`). Cached until the list changes. */
  get loadout(): Loadout {
    const u = this.run.state.upgrades;
    const ship = this.run.state.shipId;
    const c = this.loadoutCache;
    if (c && c.ref === u && c.len === u.length && c.ship === ship) return c.lo;
    const lo = new Loadout(u, ship);
    this.loadoutCache = { ref: u, len: u.length, ship, lo };
    return lo;
  }

  /** Put the run's weapon loadout in the slots: the aux weapons into the `WeaponSystem` (the main is read from `run.state` when it fires). */
  private applyEquipment(): void {
    const aux = this.run.state.loadout.aux.map((id) => auxById(id)).filter((d): d is AuxDef => !!d);
    const cur = this.weapons.defs;
    if (aux.length === cur.length && aux.every((d, i) => d === cur[i])) return;
    this.weapons.equip(aux);
    this.panel?.layout();
  }

  /** Push upgrade-derived ship stats (max hull, dodge cooldown) into the player objects. */
  private syncShip(): void {
    const lo = this.loadout;
    this.health.setMax(Math.max(1, Math.round(lo.get('ship.maxHealth'))));
    this.dodge.cooldownTime = lo.get('dodge.cooldown');
  }

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(canvas);
    this.fight = this.makeFight();
    // The campaign framework's scroll hooks drive the running scroll level (speed beats, distance triggers).
    setScrollHooks({ setSpeed: (v, e) => this.scroll?.setSpeed(v, e ?? 0), distance: () => this.scroll?.distance ?? 0 });
    this.units.onDeath = (u) => this.onUnitDeath(u);
    this.units.roomHost = this.roomHost;

    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        speed: 20 + Math.random() * 60,
        size: Math.random() < 0.2 ? 2 : 1,
      });
    }

    const game = this;
    this.panel = new DebugPanel(
      {
        stats: this.stats,
        defaultDamage: () => TUNING.ship.damage,
        get godMode() {
          return game.godMode;
        },
        set godMode(v: boolean) {
          game.godMode = v;
        },
        weapons: this.weapons,
        resetAll: () => {
          this.godMode = false;
          setBlastScale(BLAST_DEFAULT_SCALE);
          this.weapons.resetDebug();
          this.resetStats();
        },
      },
      H,
    );
    // Clicks on the debug panel are consumed here so they never steer the ship.
    this.input.capture = (x, y, e) => {
      if (!this.panelVisible || !this.panel.handlePointer(x, y, e)) return false;
      this.sfx.resume();
      return true;
    };
    this.input.onPress = (code) => this.onKey(code);
    this.input.onDodge = () => this.tryDodge();
    this.input.dodgeActive = () => this.inCombat && !this.overlay;
    this.input.onPointerDown = () => {
      this.sfx.resume();
      if (this.mode === 'run' || this.overlay) this.taps.push({ x: this.input.px, y: this.input.py });
      else if (this.state === 'won' && this.elapsed - this.wonAt > 1) this.reset();
    };
  }

  /** What flow nodes may ask of the game (see NodeHost in flow/node.ts). */
  private makeNodeHost(): NodeHost {
    return {
      ship: this.ship,
      startBossFight: (id, scroll) => {
        this.beginCombat({ bossId: id, keepHealth: true });
        if (scroll) this.beginScroll(scroll);
      },
      startScroll: (level) => {
        this.beginCombat({ keepHealth: true });
        this.beginScroll(level);
      },
      scroll: () => this.scroll,
      startCombat: (opts) => {
        this.beginCombat({ keepHealth: false, ...opts });
        if (opts?.scroll) this.beginScroll(opts.scroll);
      },
      spawnUnit: (req) => this.spawnCampaignUnit(req),
      spawnWaveById: (id, tag) => {
        const def = WAVE_LIST.find((w) => w.id === id);
        if (!def) throw new Error(`campaign spawn: unknown wave "${id}"`);
        spawnWave(this.units, def, unitById, tag);
      },
      unitsLeft: (m) => this.units.countMatching(m),
      counters: () => this.combatCounters,
      forceDestroyPlayer: () => this.forceDestroyPlayer(),
      setWeaponsLocked: (on) => this.setWeaponsLocked(on),
      setShip: (id, loadout) => {
        this.setShip(id);
        if (loadout) this.setLoadout(loadout);
      },
      shipAlive: () => this.state === 'playing',
      bossTarget: (kind, id) => this.bossTarget(kind, id),
      captureBoss: () => (this.bossActive ? captureSnapshot(this.fight) : null),
      startWave: (wave, scroll) => {
        this.bossActive = false;
        this.attacks.sources = null;
        this.attacks.setScript(null);
        this.reset(true, true); // clears units too; health carries over
        this.combat = true;
        if (scroll) this.beginScroll(scroll);
        spawnWave(this.units, wave, unitById);
      },
      waveRemaining: () => this.units.remaining(),
      combatResult: (): CombatResult => {
        if (this.state === 'won' && this.elapsed - this.wonAt > WIN_BEAT) return 'won';
        if (this.state === 'lost' && this.elapsed - this.lostAt > TUNING.player.defeatTime) return 'lost';
        return 'running';
      },
      endCombat: () => {
        this.combat = false;
        this.stopScroll();
        this.weaponsLocked = false;
        this.attacks.clear();
        this.units.clear();
        this.targetList = [];
        this.weapons.reset();
        this.tags.reset();
        this.bullets = [];
        this.particles = [];
      },
      healFull: () => {
        this.syncShip();
        this.health.reset();
      },
      takeTap: () => this.taps.shift() ?? null,
      takeKey: () => this.keyPresses.shift() ?? null,
      pointer: () => this.input.hover,
    };
  }

  /** Start a scrolling level over the current combat (the caller decides whether a boss is active). */
  private beginScroll(level: string | ScrollLevelDef): void {
    const def = typeof level === 'string' ? scrollLevelById(level) : level;
    this.stopScroll();
    const r = new ScrollRunnerImpl(this.scrollHost);
    this.scroll = r;
    r.onThunder = (k) => this.fx.rumble(0.12 + 0.12 * k);
    r.start(def);
  }

  /** Stop scrolling: the runner goes away, weapons unlock. The starfield comes back. */
  private stopScroll(): void {
    if (!this.scroll) return;
    this.scroll = null;
    this.weaponsLocked = false;
  }

  private setWeaponsLocked(on: boolean): void {
    this.weaponsLocked = on;
  }

  /** A scroll timeline starts a boss fight on top of the running combat (health, units and the scroll carry on). */
  private activateBoss(id: string): void {
    const i = BOSSES.findIndex((b) => b.id === id);
    if (i < 0) throw new Error(`scroll level: unknown boss id "${id}"`);
    this.bossDefIndex = i;
    const old = this.fight;
    this.fight = this.makeFight(BOSSES[i]);
    this.carryDebug(old);
    this.bossActive = true;
    this.clearAt = [];
    this.hull25At = null;
  }

  /** Debug: run a scroll level on its own (the boss is set aside in boss mode and comes back when it stops). */
  private debugScrollStart(level: string | ScrollLevelDef, opts: { locked?: boolean } = {}): ScrollRunnerImpl {
    if (this.mode === 'boss' && this.bossActive) {
      this.bossActive = false;
      this.bossSuspended = true;
      this.attacks.sources = null;
      this.attacks.setScript(null);
    }
    this.units.clear();
    this.attacks.clear();
    this.beginScroll(level);
    if (opts.locked !== undefined) this.weaponsLocked = opts.locked;
    return this.scroll!;
  }

  private debugScrollStop(): void {
    this.stopScroll();
    this.units.clear();
    this.attacks.clear();
    if (this.bossSuspended) this.reset(); // brings the boss back (a fresh fight)
  }

  /** Shared by the boss node (`startBossFight`) and the campaign (`startCombat`). */
  private beginCombat(o: { bossId?: string; keepHealth: boolean; restore?: Parameters<typeof restoreSnapshot>[1] }): void {
    if (o.bossId) {
      const i = BOSSES.findIndex((b) => b.id === o.bossId);
      if (i < 0) throw new Error(`boss node: unknown boss id "${o.bossId}"`);
      this.bossDefIndex = i;
      const old = this.fight;
      this.fight = this.makeFight(BOSSES[i]);
      this.carryDebug(old);
      if (o.restore) restoreSnapshot(this.fight, o.restore);
      this.reset(true, o.keepHealth); // health carries over from the previous node
      this.bossActive = true;
    } else {
      this.bossActive = false;
      this.attacks.sources = null;
      this.attacks.setScript(null);
      this.reset(true, o.keepHealth);
    }
    this.combat = true;
  }

  /** A flyby unit (src/enemies/flyby.ts): queued like a campaign spawn, removed by the unit system when its pass ends. */
  private spawnFlyby(r: FlybyRequest): void {
    this.units.queue({ at: this.units.time + (r.delay ?? 0), def: unitById(r.unit), placement: flybyPlacement(r), tag: r.tag });
  }

  private spawnCampaignUnit(r: { unit: string; x: number; y: number; tag?: string; delay?: number }): void {
    const def = unitById(r.unit);
    const slot = { x: r.x, y: r.y };
    this.units.queue({
      at: this.units.time + (r.delay ?? 0),
      def,
      placement: { slot, entrance: (u) => ({ x: r.x, y: -40 + (r.y + 40) * Math.sin((u * Math.PI) / 2) }), entranceTime: 1 },
      tag: r.tag,
    });
  }

  /** The script blows the ship up: same visuals as dying, but the campaign does not count it. */
  private forceDestroyPlayer(): void {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    this.lostAt = this.elapsed;
    this.explode(this.ship.x, this.ship.y, 40);
    this.fx.onExplosion();
    this.sfx.explosion();
  }

  private bossTarget(kind: 'component' | 'room', id: string): 'destroyed' | 'intact' | 'missing' {
    if (!this.bossActive) return 'missing';
    const f = this.fight;
    if (kind === 'component') {
      const cs = f.components.items.filter((c) => c.matches(id));
      if (cs.length === 0) return 'missing';
      return cs.every((c) => c.state === 'destroyed' || c.state === 'detached') ? 'destroyed' : 'intact';
    }
    const room = f.rooms.rooms.find((r) => r.spec.id === id);
    if (!room) return 'missing';
    return room.offline ? 'destroyed' : 'intact';
  }

  /** True when the combat sim runs (always in boss mode; in run mode only during a combat node). */
  private get inCombat(): boolean {
    return this.mode === 'boss' || this.combat;
  }

  /** [Z]: switch between the run and the one-boss test mode. */
  private toggleMode(): void {
    if (this.mode === 'run') {
      this.run.toTitle();
      this.mode = 'boss';
      this.combat = false;
      this.reset();
    } else {
      this.mode = 'run';
      this.combat = false;
      this.run.toTitle();
    }
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Exposed on `window` for console/automated testing. */
  get debug() {
    return {
      boss: this.boss,
      fight: this.fight,
      setBoss: (def: BossDefinition) => this.setBoss(def),
      stats: this.stats,
      ship: this.ship,
      bullets: this.bullets,
      dodge: this.dodge,
      health: this.health,
      /** Take n damage now (respects i-frames and the dodge); returns whether it landed. `scrape` uses the obstacle-contact effect. */
      hurt: (n = 1, scrape = false) => {
        if (this.state !== 'playing' || !this.health.hit(n, this.dodge.invulnerable)) return false;
        this.afterPlayerHit(n, scrape);
        return true;
      },
      /** Set the current hull directly (clears i-frames), to test the smoke / fire states. */
      setHealth: (n: number) => {
        this.health.hp = Math.max(0, Math.min(this.health.maxHp, n));
        this.health.invuln = 0;
        this.health.lostFrom = -1;
      },
      attacks: this.attacks,
      setAttacks: (on: boolean) => (this.attacks.enabled = on),
      /** Live pixels per layer not connected to the boss's main mass (must be 0 once settled). */
      anchoring: () => this.fight.boss.unanchoredPixels(),
      setUnionAnchoring: (on: boolean) => (this.fight.boss.unionAnchoring = on),
      components: this.fight.components,
      rooms: this.fight.rooms,
      regrowth: this.fight.regrowth,
      setComponentDebug: (on: boolean) => (this.fight.components.debug = on),
      /** Advance the sim `seconds` of game time without rendering (for scripted measurements). */
      simulate: (seconds: number, mode: 'off' | 'sweep' | 'focus' = this.auto) => {
        this.auto = mode;
        for (let t = 0; t < seconds; t += 1 / 60) this.update(1 / 60);
        return this.clearTimes();
      },
      weapons: this.weapons,
      tags: this.tags,
      /** Effective stats (base + held upgrades). */
      loadout: () => this.loadout,
      /** Choose the ship by id (its starting weapons are equipped). Applies at once, also in `?mode=boss`. */
      setShip: (id: string) => this.setShip(id),
      /** Choose the weapons: `{ main, aux: [a, b, c] }` (weapon ids, see `weaponIds`). Applies at once. */
      setLoadout: (l: { main: string; aux: string[] }) => this.setLoadout(l),
      shipIds: SHIPS.map((s) => s.id),
      weaponIds: { main: MAIN_DEFS.map((d) => d.id), aux: AUX_DEFS.map((d) => d.id) },
      /** Held upgrades as { id: stacks }. */
      upgrades: () => Object.fromEntries(this.loadout.held().map((h) => [h.card.id, h.n])),
      /** Grant a card by id (stacks, ignoring the max-stack limit). Applies in run mode and in the one-boss test mode. */
      grant: (id: string, n = 1) => this.grant(id, n),
      /** Drop every held upgrade. */
      clearUpgrades: () => (this.run.state.upgrades.length = 0),
      /** Open the reward screen on demand over the current scene (sim paused until a card is picked). */
      reward: () => this.openReward(),
      /** Effective stat value by key, e.g. debug.stat('rocket.radius'). */
      stat: (key: string) => this.loadout.get(key),
      cardIds: [...CARD_BY_ID.keys()],
      /** Save/unlock debug. The save is in-memory under ?nosave and ?mode=boss; otherwise it is the real localStorage save. */
      save: saveStore,
      unlock: (kind: UnlockKind, id: string) => saveStore.unlock(kind, id),
      isUnlocked: (kind: UnlockKind, id: string) => saveStore.isUnlocked(kind, id),
      /** Unlock every card, ship and weapon flag. */
      unlockAll: () =>
        saveStore.unlockAll({
          cards: CARDS.flatMap((c) => (c.unlock ? [c.unlock] : [])),
          ships: SHIPS.flatMap((s) => (s.unlock ? [s.unlock] : [])),
          weapons: WEAPON_DEFS.flatMap((w) => (w.unlock ? [w.unlock] : [])),
        }),
      resetSave: () => saveStore.reset(),
      run: this.run,
      /** Campaign debug (run mode only): start(levelId, objectiveIndex?), skipObjective(), setTime(s), unlockAll(on?), session(), counters(), snapshotRoundTrip(). */
      campaign: {
        start: (levelId: string, objective = 0) => {
          if (this.mode !== 'run') throw new Error('campaign needs run mode: open the game without ?mode=boss (or press [Z])');
          this.run.startCampaignLevel(levelId, objective);
        },
        skipObjective: () => this.run.campaign.session?.skipObjective(),
        setTime: (seconds: number) => {
          const s = this.run.campaign.session;
          if (s) s.time = seconds;
        },
        unlockAll: (on = true) => (this.run.campaign.unlockAll = on),
        session: () => this.run.campaign.session,
        counters: () => this.run.campaign.session?.counters() ?? null,
        flow: this.run.campaign,
        snapshotRoundTrip: () => this.snapshotRoundTrip(),
      },
      units: this.units,
      /** Spawn one unit by id at (x, y) (default: near the top centre) in the current combat, entering from above. */
      spawnUnit: (id: string, x = W / 2, y = 200) => this.spawnDebugUnit(id, x, y),
      /** Spawn a whole wave (a WaveDefinition or the id of one in WAVE_LIST) in the current combat. */
      spawnWave: (w: WaveDefinition | string) => this.spawnDebugWave(w),
      killUnits: () => this.killUnits(),
      unitIds: UNIT_LIST.map((u) => u.id),
      waveIds: WAVE_LIST.map((w) => w.id),
      /** Scrolling levels (src/scroll). `start(id | def)` runs a level on its own (the boss is set aside in boss mode), `skipTo(distance)`, `setSpeed(v, ease)`. Keys: [Home] start/stop the test level, [PgUp/PgDn] speed, [End] skip 1000 px. */
      scroll: {
        start: (level: string | ScrollLevelDef = 'scroll-test', opts?: { locked?: boolean }) => this.debugScrollStart(level, opts),
        stop: () => this.debugScrollStop(),
        runner: () => this.scroll,
        setSpeed: (v: number, ease = 0) => this.scroll?.setSpeed(v, ease),
        skipTo: (d: number) => this.scroll?.skipTo(d),
        pause: (on: boolean) => {
          if (this.scroll) this.scroll.paused = on;
        },
        distance: () => this.scroll?.distance ?? 0,
        /** Weather 0..1 (eased over `ease` s), theme switch, lightning now. */
        weather: (v: number, ease = 0) => this.scroll?.setWeather(v, ease),
        theme: (id: string, fade = 0) => this.scroll?.background?.setTheme(id, fade),
        strike: () => this.scroll?.background?.strike(),
        speed: () => this.scroll?.speed ?? 0,
        levels: Object.keys(SCROLL_LEVELS),
        /** Spawn one obstacle now at its entry edge. */
        obstacle: (spawn: Omit<import('./scroll').ObstacleSpawn, 'at' | 'kind'>) => this.scroll?.obstacles.spawn({ at: 0, kind: 'obstacle', ...spawn }),
        /** Cosmetic wingmen on (count, pattern) or off. */
        allies: (count: number, pattern?: import('./scroll').AllyPattern) => (count > 0 ? this.scroll?.allies.set(count, pattern) : this.scroll?.allies.dismiss()),
        showBoxes: (on: boolean) => {
          if (this.scroll) this.scroll.obstacles.debug = on;
        },
      },
      /** Lock / unlock the player's weapons (no firing from any weapon; the dodge still works). */
      setWeaponsLocked: (on: boolean) => this.setWeaponsLocked(on),
      weaponsLocked: () => this.weaponsLocked,
      /** The capital ship: the armour flag (default off) and the engine-room objective event. */
      capital: {
        armourCarvable: (on?: boolean) => {
          if (on !== undefined) this.fight.armourCarvable = on;
          return this.fight.armourCarvable;
        },
        engineDestroyed: () => this.fight.rooms.destroyed('engine'),
      },
      setBlastScale: (v: number) => setBlastScale(v),
      setSwept: (on: boolean) => (this.sweptBullets = on),
      setAuto: (m: 'off' | 'sweep' | 'focus') => (this.auto = m),
      /** Ship height while the autopilot flies (default H - 140 = 820), to test close and far range. */
      setAutoY: (y: number) => (this.autoY = y),
      setTestMode: (on: boolean) => this.setTestMode(on),
      reset: () => this.reset(),
      clearTimes: () => this.clearTimes(),
    };
  }

  /** Debug: capture the current boss, push it through JSON, restore it onto a fresh fight and compare everything. */
  private snapshotRoundTrip() {
    const snap = JSON.parse(JSON.stringify(captureSnapshot(this.fight)));
    const fresh = new BossFight(this.fight.def);
    restoreSnapshot(fresh, snap);
    const diffs = diffSnapshot(fresh, snap);
    let pixelMismatch = 0;
    let pixels = 0;
    this.fight.boss.layers.forEach((l, i) => {
      const o = fresh.boss.layers[i];
      // Compare alpha everywhere and colour where something is visible (the colour of a carved-away pixel is never seen).
      for (let k = 0; k < l.img.data.length; k += 4) {
        pixels++;
        const a = l.img.data[k + 3];
        if (a !== o.img.data[k + 3] || (a > 0 && (l.img.data[k] !== o.img.data[k] || l.img.data[k + 1] !== o.img.data[k + 1] || l.img.data[k + 2] !== o.img.data[k + 2]))) pixelMismatch++;
      }
      if (l.remaining !== o.remaining) diffs.push(`layer ${l.name}: remaining ${l.remaining} vs ${o.remaining}`);
    });
    const comp = this.fight.components.items.map((c, i) => {
      const o = fresh.components.items[i];
      return c.hp === o.hp && (c.state === 'active') === (o.state === 'active');
    });
    return {
      ok: diffs.length === 0 && pixelMismatch === 0 && comp.every(Boolean) && this.fight.boss.core.hp === fresh.boss.core.hp,
      diffs,
      pixelMismatch,
      pixels,
      componentsMatch: comp.filter(Boolean).length + '/' + comp.length,
      coreHp: [this.fight.boss.core.hp, fresh.boss.core.hp],
      jsonBytes: JSON.stringify(snap).length,
    };
  }

  private setShip(id: string): void {
    if (!SHIP_BY_ID.has(id)) throw new Error(`unknown ship "${id}" (${[...SHIP_BY_ID.keys()].join(', ')})`);
    this.run.select(id);
    this.afterLoadoutChange();
  }

  private setLoadout(l: { main: string; aux: string[] }): void {
    const clean = cleanLoadout(l, this.run.state.shipId);
    if (clean.main !== l.main || clean.aux.length !== l.aux.length) throw new Error(`bad loadout: unknown main or aux id, or duplicate aux (mains: ${MAIN_DEFS.map((d) => d.id).join(', ')}; aux: ${AUX_DEFS.map((d) => d.id).join(', ')})`);
    this.run.select(this.run.state.shipId, clean);
    this.afterLoadoutChange();
  }

  private afterLoadoutChange(): void {
    this.applyEquipment();
    this.syncShip();
    this.health.reset();
  }

  private grant(id: string, n = 1): void {
    const card = CARD_BY_ID.get(id);
    if (!card) throw new Error(`unknown card "${id}"`);
    for (let i = 0; i < n; i++) this.run.state.upgrades.push(card);
  }

  private openReward(): void {
    const node = new RewardNode({ type: 'reward', choices: 3 });
    const ctx: NodeContext = { host: this.nodeHost, run: this.run.state, position: { level: this.run.state.levelIndex + 1, levels: DEFAULT_RUN.levels.length, index: 1, count: 1 } };
    node.start(ctx);
    this.taps.length = 0;
    this.keyPresses.length = 0;
    this.overlay = node;
  }

  private clearTimes() {
    const names = [...this.boss.layers.map((l) => l.name.toLowerCase()), 'core'];
    return Object.fromEntries([['hull25', this.hull25At === null ? null : +this.hull25At.toFixed(1)] as const, ...names.map((n, i) => [n, this.clearAt[i] === null || this.clearAt[i] === undefined ? null : +this.clearAt[i]!.toFixed(1)]),]);
  }

  private setTestMode(on: boolean): void {
    this.testMode = on;
    const p = on ? TUNING.testMode : TUNING.ship;
    this.stats.damage = p.damage;
    this.stats.fireRate = p.fireRate;
  }

  private readonly hud = new Hud();
  private readonly enrageTint = new EnrageTint();

  /** The boss of the current fight (a new object after each restart). */
  private get boss(): Boss {
    return this.fight.boss;
  }

  private makeFight(def: BossDefinition = BOSSES[this.bossDefIndex]): BossFight {
    const fight = new BossFight(def);
    fight.components.target = this.ship;
    this.attacks.sources = fight.components;
    fight.rooms.host = this.roomHost;
    this.attacks.setScript(fight.makeScheduler());
    fight.onPhaseChange = (phase) => {
      this.attacks.setScript(fight.makeScheduler());
      if (phase.enrage) {
        this.fx.onEnrage();
        this.sfx.enrage();
      }
    };
    return fight;
  }

  /** Debug: start a fresh fight against `def` (any BossDefinition, registered or not). */
  private setBoss(def: BossDefinition): void {
    const old = this.fight;
    this.fight = this.makeFight(def);
    this.carryDebug(old);
    this.reset(true);
  }

  /** Keep the debug movement settings across a new fight. */
  private carryDebug(old: BossFight): void {
    this.fight.movementEnabled = old.movementEnabled;
    this.fight.movementOverride = old.movementOverride;
  }

  /** [M]: cycle phase default -> each preset -> phase default. */
  private cycleMovement(): void {
    const cur = this.fight.movementOverride;
    const i = cur ? MOVEMENT_PRESETS.indexOf(cur) : -1;
    this.fight.setMovementOverride(i + 1 < MOVEMENT_PRESETS.length ? MOVEMENT_PRESETS[i + 1] : null);
  }

  /** A `spawner` room launches a unit: it flies from the room to a slot below it, then dives like the wave drones. Capping is the room's job. */
  private launchDrone(id: string, from: { x: number; y: number }): { alive(): boolean } {
    const side = Math.random() < 0.5 ? -1 : 1;
    const slot = { x: Math.max(40, Math.min(W - 40, from.x + side * (40 + Math.random() * 90))), y: Math.min(360, from.y + 70 + Math.random() * 70) };
    const ease = (k: number) => k * k * (3 - 2 * k);
    const u = this.units.spawn(unitById(id), {
      slot,
      entrance: (k) => ({ x: from.x + (slot.x - from.x) * ease(k), y: from.y + (slot.y - from.y) * ease(k) }),
      entranceTime: 0.9,
      dive: { first: 2 + Math.random() * 2, every: 6, time: 3.2, path: divePath(slot, 1) },
    });
    return { alive: () => u.state === 'alive' && !u.gone };
  }

  private spawnDebugUnit(id: string, x: number, y: number): void {
    this.units.spawn(unitById(id), { slot: { x, y }, entrance: (u) => ({ x, y: -40 + (y + 40) * Math.sin((u * Math.PI) / 2) }), entranceTime: 1 });
  }

  private spawnDebugWave(w: WaveDefinition | string): void {
    const def = typeof w === 'string' ? WAVE_LIST.find((x) => x.id === w) : w;
    if (!def) throw new Error(`unknown wave "${w}"`);
    spawnWave(this.units, def, unitById);
  }

  /** Debug: blow every unit up now. */
  private killUnits(): void {
    for (const u of this.units.units) u.fight.boss.core.hp = 0;
    this.units.checkDeaths();
  }

  private debugUnitCycle = 0;
  private debugWaveCycle = 0;

  private reset(keepFight = false, keepHealth = false): void {
    this.stopScroll();
    if (this.bossSuspended) {
      this.bossSuspended = false;
      this.bossActive = true;
      keepFight = false;
    }
    this.applyEquipment();
    this.units.clear();
    this.targetList = [];
    if (!keepFight) {
      const old = this.fight;
      this.fight = this.makeFight();
      this.carryDebug(old);
    }
    this.bullets = [];
    this.weapons.reset();
    this.tags.reset();
    this.particles = [];
    this.weaponsLocked = false;
    this.dodge.reset();
    if (!keepHealth) this.health.reset();
    this.attacks.reset();
    this.state = 'playing';
    this.elapsed = 0;
    this.clearAt = [];
    this.hull25At = null;
    this.fx.reset();
    this.dmgFx.reset();
  }

  private onKey(code: string): void {
    this.sfx.resume();
    if (this.overlay) {
      this.keyPresses.push(code);
      return;
    }
    if (code === 'KeyZ') return this.toggleMode();
    if (code === 'Slash') return this.openReward();
    if (this.mode === 'run') {
      this.keyPresses.push(code);
      // Outside combat only the overlay toggle stays live; during a run [B] and [R] would break the flow.
      if (!this.combat ? code !== 'Backquote' : code === 'KeyB' || code === 'KeyR') return;
    }
    const s = this.stats;
    switch (code) {
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyX':
        this.tryDodge();
        break;
      case 'KeyR':
        this.reset();
        break;
      case 'KeyT':
        this.fight.movementEnabled = !this.fight.movementEnabled;
        break;
      case 'KeyM':
        this.cycleMovement();
        break;
      case 'KeyB':
        this.bossDefIndex = (this.bossDefIndex + 1) % BOSSES.length;
        this.setBoss(BOSSES[this.bossDefIndex]);
        break;
      case 'KeyE':
        this.fight.rooms.forceExpose(); // debug: trigger the next room's exposure reaction
        break;
      case 'KeyU':
        if (this.fight.regrowth) this.fight.regrowth.enabled = !this.fight.regrowth.enabled; // debug: regrowth on/off live
        break;
      case 'KeyH':
        this.fight.components.debug = !this.fight.components.debug;
        this.units.setDebug(this.fight.components.debug);
        break;
      case 'Semicolon':
        this.spawnDebugUnit(UNIT_LIST[this.debugUnitCycle++ % UNIT_LIST.length].id, W / 2, 200);
        break;
      case 'Quote':
        this.spawnDebugWave(WAVE_LIST[this.debugWaveCycle++ % WAVE_LIST.length]);
        break;
      case 'Backslash':
        this.killUnits();
        break;
      case 'KeyJ':
        this.fx.enabled = this.sfx.enabled = !this.fx.enabled;
        break;
      case 'KeyK':
        this.attacks.enabled = !this.attacks.enabled;
        if (!this.attacks.enabled) this.attacks.clear();
        break;
      case 'KeyN':
        this.attacks.toggleMode();
        break;
      case 'KeyV':
        this.attacks.selected = (this.attacks.selected + 1) % PATTERNS.length;
        break;
      case 'KeyF':
        if (this.state === 'playing') this.attacks.fireSelected(this.ship);
        break;
      case 'KeyY':
        this.setTestMode(!this.testMode);
        break;
      case 'KeyP':
        this.auto = this.auto === 'off' ? 'sweep' : this.auto === 'sweep' ? 'focus' : 'off';
        break;
      case 'Backquote':
        this.showDebug = !this.showDebug;
        break;
      case 'Digit1':
      case 'Digit2':
        this.panel.adjustDamage(code === 'Digit1' ? -1 : 1, this.heldMult());
        break;
      case 'Digit9':
        this.panel.cyclePreset();
        break;
      case 'BracketLeft':
        this.panel.scaleDamage(0.5);
        break;
      case 'BracketRight':
        this.panel.scaleDamage(2);
        break;
      case 'Minus':
      case 'Equal':
        this.panel.adjustBlast(code === 'Minus' ? -1 : 1, this.heldMult() > 1 ? 4 : 1);
        break;
      case 'KeyI':
      case 'KeyO':
      case 'KeyL': {
        // Debug: toggle the aux weapon in slot 1 / 2 / 3.
        const d = this.weapons.defs[AUX_KEYS.indexOf(code.slice(3))];
        if (d) this.weapons.enabled[d.id] = !this.weapons.enabled[d.id];
        break;
      }
      case 'KeyQ':
        if (this.state === 'playing' && !this.weaponsLocked) this.weapons.fireAll();
        break;
      case 'Comma':
        this.weapons.cooldownScale /= 2;
        break;
      case 'Period':
        this.weapons.cooldownScale *= 2;
        break;
      case 'KeyG':
        this.godMode = !this.godMode;
        break;
      case 'Home': // debug: start / stop the scroll test level
        if (this.scroll) this.debugScrollStop();
        else this.debugScrollStart('scroll-test');
        break;
      case 'PageUp':
      case 'PageDown':
        if (this.scroll) this.scroll.setSpeed(Math.max(0, this.scroll.speed + (code === 'PageUp' ? 60 : -60)), 0.3);
        break;
      case 'Insert':
        this.weaponsLocked = !this.weaponsLocked;
        break;
      case 'Delete': // debug: the capital ship's armour carvable on/off
        this.fight.armourCarvable = !this.fight.armourCarvable;
        break;
      case 'End':
        this.scroll?.skipTo(this.scroll.distance + 1000);
        break;
      case 'KeyC':
        this.panel.toggleOpen();
        break;
      case 'Digit3':
      case 'Digit4':
        this.panel.adjustRate(code === 'Digit3' ? -1 : 1, this.heldMult() > 1 ? 5 : 1);
        break;
      case 'Digit5':
        s.projectiles = Math.max(1, s.projectiles - 1);
        break;
      case 'Digit6':
        s.projectiles = Math.min(9, s.projectiles + 1);
        break;
      case 'Digit7':
        s.pierce = Math.max(0, +(s.pierce - 0.1).toFixed(2));
        break;
      case 'Digit8':
        s.pierce = Math.min(0.9, +(s.pierce + 0.1).toFixed(2));
        break;
      case 'Digit0':
        this.resetStats();
        break;
    }
  }

  private resetStats(): void {
    Object.assign(this.stats, DEFAULT_STATS);
    this.setTestMode(this.testMode);
  }

  /** Held modifier for debug steps: Shift = x10, Alt/Ctrl = x100. */
  private heldMult(): number {
    const k = this.input.keys;
    return modifierMult({
      shift: k.has('ShiftLeft') || k.has('ShiftRight'),
      alt: k.has('AltLeft') || k.has('AltRight'),
      ctrl: k.has('ControlLeft') || k.has('ControlRight'),
    });
  }

  private tryDodge(): void {
    if (this.state !== 'playing' || !this.inCombat) return;
    let { x, y } = this.input.axis();
    if (x === 0 && y === 0) {
      // Pointer steering: dash toward the finger; otherwise default to a sideways dash.
      x = this.input.pointerDown ? Math.sign(this.input.px - this.ship.x) : this.ship.x < W / 2 ? 1 : -1;
    }
    this.dodge.trigger(x, y);
  }

  private frame(now: number): void {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.update(this.fx.step(dt));
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  // --- update -------------------------------------------------------------------------------

  private update(dt: number): void {
    this.elapsed += dt;
    for (const s of this.scroll ? [] : this.stars) {
      s.y += s.speed * dt;
      if (s.y > H) {
        s.y = 0;
        s.x = Math.random() * W;
      }
    }
    this.syncShip();
    if (this.overlay) {
      this.overlay.update(dt);
      this.taps.length = 0;
      this.keyPresses.length = 0;
      if (this.overlay.outcome()) this.overlay = null;
      return;
    }
    if (this.mode === 'run') {
      this.run.update(dt);
      this.taps.length = 0;
      this.keyPresses.length = 0;
      if (!this.combat) {
        this.updateParticles(dt);
        return;
      }
    }
    if (this.scroll && this.state === 'playing') this.scroll.update(dt);
    if (this.bossActive) this.fight.update(dt);
    this.units.update(dt, this.state === 'playing' && this.attacks.enabled, this.attacks, this.ship);
    this.refreshTargets();
    for (const f of this.allFights()) for (const d of f.boss.dustEvents.splice(0)) this.spawnDebris(d.x, d.y, 24, false, d.r, d.g, d.b);

    if (this.state === 'playing') {
      this.moveShip(dt);
      if (!this.weaponsLocked) this.fire(dt);
    }
    this.weapons.update(dt, this.state === 'playing' && !this.weaponsLocked);
    this.updateThreat(dt);
    this.updateBullets(dt);
    this.tags.update(dt);
    for (const f of this.allFights()) this.drainComponentEvents(f);
    this.units.checkDeaths();
    this.updateParticles(dt);
    if (this.bossActive) this.trackClears();

    if (this.state === 'playing' && this.bossActive && this.boss.defeated) {
      this.state = 'won';
      this.wonAt = this.elapsed;
      this.explode(this.boss.x + this.boss.core.x, this.boss.y + this.boss.core.y, 160);
      this.fx.onExplosion();
      this.sfx.explosion();
    }
  }

  /** The boss fight (when active) and every unit's fight. */
  private allFights(): BossFight[] {
    const out = this.bossActive ? [this.fight] : [];
    for (const u of this.units.units) out.push(u.fight);
    return out;
  }

  private refreshTargets(): void {
    const t: BossFight[] = [];
    if (this.bossActive && !this.boss.defeated) t.push(this.fight);
    for (const u of this.units.units) if (u.state === 'alive') t.push(u.fight);
    this.targetList = t;
  }

  private onUnitDeath(u: Unit): void {
    const cc = this.combatCounters;
    cc.kills++;
    if (u.tag) cc.killsByTag[u.tag] = (cc.killsByTag[u.tag] ?? 0) + 1;
    const c = u.center();
    if (u.big) {
      this.explode(c.x, c.y, 60);
      this.fx.onComponentDestroy(60);
      this.sfx.componentDestroy(60);
    } else {
      this.explode(c.x, c.y, 14);
      this.sfx.componentDestroy(18);
    }
  }

  /** Player hitbox radius (base + upgrades). */
  private get hitbox(): number {
    return this.loadout.get('ship.hitbox');
  }

  /** Boss fire, player damage and the defeat/reset flow. */
  private updateThreat(dt: number): void {
    const playing = this.state === 'playing';
    this.attacks.update(dt, this.ship, playing && !(this.bossActive && this.boss.defeated));
    if (!playing) {
      if (this.mode === 'boss' && this.state === 'lost' && this.elapsed - this.lostAt > TUNING.player.defeatTime) this.reset();
      return;
    }
    this.health.update(dt);
    if (this.fx.enabled) this.dmgFx.update(dt, this.ship.x, this.ship.y, this.health.hp, this.health.maxHp, this.shipLook(), this.emitP, this.beep);
    const dmg =
      this.attacks.collect(this.ship.x, this.ship.y, this.hitbox) +
      this.attacks.collectHazards(this.ship.x, this.ship.y, this.hitbox);
    if (dmg > 0 && !this.godMode && this.health.hit(dmg, this.dodge.invulnerable)) this.afterPlayerHit(dmg);
    // Obstacles (debris, peaks): contact damage with the same i-frames and dodge as a bullet; never an instant kill.
    if (this.scroll && this.state === 'playing') {
      const o = this.scroll.obstacles.touch(this.ship.x, this.ship.y, this.hitbox);
      if (o && !this.godMode && this.health.hit(o.damage, this.dodge.invulnerable)) {
        o.flash = 0.3;
        this.explode(this.ship.x, this.ship.y, 8);
        this.afterPlayerHit(o.damage, true);
      }
    }
  }

  /** The ship was hit and the damage landed: destroyed when the hull is gone. */
  private afterPlayerHit(dmg: number, scrape = false): void {
    this.combatCounters.hits++;
    this.combatCounters.damage += dmg;
    this.fx.onPlayerHit(dmg, scrape);
    if (this.fx.enabled) {
      this.dmgFx.onHit(this.ship.x, this.ship.y, scrape, this.shipLook(), this.emitP);
      this.sfx.playerHit(scrape);
    }
    if (!this.health.dead) return;
    this.state = 'lost';
    this.lostAt = this.elapsed;
    this.explode(this.ship.x, this.ship.y, 40);
    this.fx.onExplosion();
    this.sfx.explosion();
  }

  /** Juice and sound for what the boss's components did this frame (hits, damage states, destruction). */
  private drainComponentEvents(fight: BossFight): void {
    for (const e of fight.components.events.splice(0)) {
      switch (e.kind) {
        case 'hit':
          this.fx.onComponentHit();
          this.sfx.componentHit();
          break;
        case 'state':
          this.sfx.componentDamage(e.level);
          break;
        case 'destroy':
          this.fx.onComponentDestroy(e.radius);
          this.sfx.componentDestroy(e.radius);
          break;
        case 'detach':
          this.sfx.componentDamage(1);
          break;
        case 'roomExposed':
          this.fx.onRoomExposed();
          this.sfx.roomExposed();
          break;
        case 'roomOffline':
          this.combatCounters.roomsDestroyed++;
          this.sfx.roomOffline();
          break;
      }
    }
  }

  private trackClears(): void {
    if (this.hull25At === null && this.boss.layerRemaining(0) <= 0.75) this.hull25At = this.elapsed;
    const n = this.boss.layers.length;
    for (let i = 0; i <= n; i++) {
      if (this.clearAt[i] != null) continue;
      const done = i < n ? this.boss.layerRemaining(i) <= 0.05 : this.boss.defeated;
      if (done) this.clearAt[i] = this.elapsed;
    }
  }

  private autoTarget(): number {
    if (!this.bossActive) {
      // Waves: 'focus' = under the lowest live unit, 'sweep' = across the span of the live units.
      const live = this.units.live().map((u) => u.center());
      if (live.length === 0) return W / 2;
      if (this.auto === 'focus') return live.reduce((a, c) => (c.y > a.y ? c : a)).x;
      const lo = Math.min(...live.map((c) => c.x)) - 20;
      const hi = Math.max(...live.map((c) => c.x)) + 20;
      const span = Math.max(40, hi - lo);
      const phase = (this.elapsed * 150) % (2 * span);
      return lo + (phase < span ? phase : 2 * span - phase);
    }
    const b = this.boss;
    if (this.auto === 'focus') return b.x + b.core.x;
    // Steady triangle-wave sweep across the boss at 150 px/s.
    const span = b.width - 40;
    const phase = (this.elapsed * 150) % (2 * span);
    return b.x + 20 + (phase < span ? phase : 2 * span - phase);
  }

  private moveShip(dt: number): void {
    const ship = this.ship;
    if (this.auto !== 'off') {
      ship.x = this.autoTarget();
      ship.y = this.autoY;
      return;
    }
    const dash = this.dodge.update(dt);
    if (this.dodge.invulnerable || dash.x !== 0 || dash.y !== 0) {
      ship.x += dash.x;
      ship.y += dash.y;
    } else if (this.input.pointerDown) {
      // Offset above the finger so the ship stays visible.
      const tx = this.input.px;
      const ty = this.input.py - 90;
      const k = Math.min(1, dt * 20 * (this.loadout.get('ship.speed') / TUNING.ship.speed));
      ship.x += (tx - ship.x) * k;
      ship.y += (ty - ship.y) * k;
    } else {
      const a = this.input.axis();
      const speed = this.loadout.get('ship.speed');
      ship.x += a.x * speed * dt;
      ship.y += a.y * speed * dt;
    }
    ship.x = Math.min(W - 18, Math.max(18, ship.x));
    ship.y = Math.min(H - 36, Math.max(shipMinY(this.run.state.shipId), ship.y));
  }

  private fire(dt: number): void {
    const interval = 1 / effectiveMain(mainById(this.run.state.loadout.main), this.stats, (k, b) => this.loadout.get(k, b)).fireRate;
    this.fireTimer += dt;
    while (this.fireTimer >= interval) {
      this.fireTimer -= interval;
      this.shoot();
    }
  }

  private shoot(): void {
    const lo = this.loadout;
    const def = mainById(this.run.state.loadout.main);
    const { projectiles, damage } = effectiveMain(def, this.stats, (k, b) => lo.get(k, b));
    const tags = lo.tags(def.id);
    const custom = def.id !== 'chain';
    // Upgrade-driven shape and pierce (cards add `<id>.width` / `<id>.pierce`; no card = the def's own values, unchanged).
    const tiers = def.shapeTiers;
    const shape = tiers ? tiers[Math.max(0, Math.min(tiers.length - 1, Math.round(lo.get(`${def.id}.width`, 0))))] : def.shape;
    const pierce = Math.min(0.95, lo.get(`${def.id}.pierce`, def.pierce));
    if (def.bullet.glow) this.sfx.weapon(def.id);
    for (let i = 0; i < projectiles; i++) {
      const offset = i - (projectiles - 1) / 2;
      const jitter = def.jitterDeg ? (Math.random() * 2 - 1) * def.jitterDeg : 0;
      const angle = ((offset * def.spreadDeg + jitter) * Math.PI) / 180;
      const bullet: Bullet = {
        x: this.ship.x + offset * 6,
        y: this.ship.y - 22,
        dx: Math.sin(angle),
        dy: -Math.cos(angle),
        energy: damage,
        pierce,
        alive: true,
        tags,
      };
      if (custom) {
        bullet.speed = TUNING.bulletSpeed * def.speedMul;
        bullet.shape = shape;
        bullet.look = def.bullet;
        if (def.fall) bullet.fall = { ...def.fall, base: damage, travelled: 0 };
      }
      this.bullets.push(bullet);
    }
  }

  /**
   * Swept bullet check: the boss moves during the frame, so each sub-step tests the bullet against
   * the boss position interpolated between the frame's start and end positions. Off = the old
   * behaviour (bullet sub-steps against the boss's final position only); kept for measuring.
   */
  sweptBullets = true;

  private updateBullets(dt: number): void {
    const targets = this.targetList;
    const sweep = new Sweep(targets, this.sweptBullets);
    for (const b of this.bullets) {
      const dist = (b.speed ?? TUNING.bulletSpeed) * dt;
      if (b.fall) {
        const f = b.fall;
        f.travelled += dist;
        if (f.travelled > f.end) {
          b.alive = false;
          continue;
        }
        const k = Math.min(1, Math.max(0, (f.travelled - f.start) / (f.end - f.start)));
        b.energy = f.base * (f.near + (f.far - f.near) * k);
      }
      const steps = Math.max(1, Math.ceil(dist), Math.ceil(sweep.maxMove));
      const sx = (b.dx * dist) / steps;
      const sy = (b.dy * dist) / steps;
      for (let i = 0; i < steps && b.alive; i++) {
        b.x += sx;
        b.y += sy;
        if (b.y < -30 || b.x < -30 || b.x > W + 30 || b.y > H + 30) {
          b.alive = false;
          break;
        }
        sweep.at((i + 1) / steps);
        this.resolveImpact(b, targets);
      }
    }
    sweep.end();
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  /** Carve a target (the boss or a unit) at a screen point (core armor, juice, sound, debris). Shared by the base gun and the weapons. */
  private carveAt(t: BossFight, x: number, y: number, budget: number, shape: CarveShapeName, quiet = false): HitResult | null {
    const boss = t.boss;
    const hpBefore = boss.core.hp;
    const res = boss.hit(x, y, budget, shape);
    if (!res) return null;
    if (res.blocked) {
      // Armour: a small spark and a quiet tick, nothing else (it is their tech).
      if (!quiet) this.armourSpark(x, y);
      return res;
    }
    if (res.core) {
      // Core armor: a bullet tunnelled straight in only scratches the core until the outer layers are dug away.
      const dealt = hpBefore - boss.core.hp;
      boss.core.hp = hpBefore - dealt * t.coreVulnerability();
      // Armor scales the damage, not the last hit point: without this a nearly dead core decays towards 0 and never dies.
      if (boss.core.hp < 1) boss.core.hp = 0;
    }
    if (quiet) return res; // elemental ticks (burn): the carve only, no juice, sound or debris
    // Small units are hit constantly: sound and debris only, no shake, hit stop or numbers.
    const small = t !== this.fight && this.units.units.some((u) => u.fight === t && !u.big);
    if (!small) this.fx.onHit(x, y, res.carved, res.spent, res.core);
    if (res.core) this.sfx.coreHit();
    else this.sfx.carve(res.carved);
    this.spawnDebris(x, y, res.carved, res.core, res.r, res.g, res.b);
    return res;
  }

  /** Armour hit: a few cool-white sparks bouncing back and a rate-limited metallic tick. */
  private armourSpark(x: number, y: number): void {
    for (let i = 0; i < 3 && this.particles.length < MAX_PARTICLES; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 90 + Math.random() * 140;
      const life = 0.12 + Math.random() * 0.14;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life, max: life, color: Math.random() < 0.5 ? '#e8f4ff' : '#9fd0ff', size: 1 + Math.random() * 1.5 });
    }
    if (this.elapsed - this.lastBlockedSfx > 0.09) {
      this.lastBlockedSfx = this.elapsed;
      this.sfx.componentHit();
    }
  }

  private resolveImpact(b: Bullet, targets: readonly Combatant[]): void {
    // Carvable obstacles (surface run) take the base gun's shots; the freefall's are not carvable, so this is a no-op there.
    if (this.scroll && this.scroll.obstacles.list.length > 0 && this.scroll.obstacles.shoot(b.x, b.y, b.energy)) {
      b.alive = false;
      return;
    }
    const budget = b.energy * (1 - b.pierce);
    for (const t of targets) {
      if (t.boss.defeated || !nearBox(t.boss, b.x, b.y, 12)) continue;
      // A component under the bullet takes the hit (hidden hp, no numbers) and consumes the bullet.
      if (t.components.hit(b.x, b.y, b.energy)) {
        if (b.tags) this.tags.onHit(b.tags, b.x, b.y, b.energy, t);
        b.alive = false;
        return;
      }
      const res = this.carveAt(t as BossFight, b.x, b.y, budget, b.shape ?? 'default');
      if (!res) continue;
      if (b.tags) this.tags.onHit(b.tags, b.x, b.y, b.energy, t);
      if (b.look?.glow && res.carved > 0) this.impactFlare(b.x, b.y, b.look.glow);
      if (res.core || res.carved === 0) {
        b.alive = false;
        return;
      }
      if (b.pierce > 0) {
        b.energy = b.energy * b.pierce + (budget - res.spent);
        if (b.energy < 1) b.alive = false;
      } else {
        b.alive = false;
      }
      return;
    }
  }

  /** Laser impact flare: a few hot sparks thrown back along the tunnel plus one large short-lived bloom. Rate-limited by the particle cap. */
  private impactFlare(x: number, y: number, glow: string): void {
    const [r, g, b] = glow.split(',').map(Number);
    const col = `rgb(${Math.min(255, r + 80)},${Math.min(255, g + 120)},${Math.min(255, b + 100)})`;
    if (this.particles.length < MAX_PARTICLES - 8) {
      this.particles.push({ x: x - 5, y: y - 5, vx: 0, vy: 0, life: 0.1, max: 0.1, color: col, size: 10 });
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = 120 + Math.random() * 200;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.2, max: 0.2, color: col, size: 2 });
      }
    }
  }

  private spawnDebris(
    x: number,
    y: number,
    carved: number,
    core: boolean,
    r: number,
    g: number,
    b: number,
  ): void {
    const count = core ? 4 : Math.min(8, 1 + Math.floor(carved / 12));
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 180;
      const life = 0.25 + Math.random() * 0.35;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 40,
        life,
        max: life,
        color: `rgb(${r | 0},${g | 0},${b | 0})`,
        size: 1 + Math.random() * 2,
      });
    }
  }

  private explode(cx: number, cy: number, count: number): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 420;
      const life = 0.5 + Math.random() * 0.9;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        color: Math.random() < 0.5 ? '#ffd21f' : '#ff7a2e',
        size: 2 + Math.random() * 3,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // --- render -------------------------------------------------------------------------------

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, W, H);
    if (!this.inCombat) {
      ctx.fillStyle = '#8fa0c8';
      for (const s of this.stars) ctx.fillRect(s.x, s.y, s.size, s.size);
      this.run.draw(ctx);
      this.overlay?.draw(ctx);
      return;
    }
    this.fx.beginShake(ctx);

    if (this.scroll) this.scroll.drawBackground(ctx);
    else {
      ctx.fillStyle = '#8fa0c8';
      for (const s of this.stars) ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    if (this.bossActive && (!this.boss.defeated || this.elapsed - this.wonAt < 1.2)) this.enrageTint.render(ctx, this.boss, this.fight);
    this.drawUnits();
    this.scroll?.drawObstacles(ctx);
    this.attacks.drawBossDim(ctx);
    if (this.bossActive) this.fight.components.drawFx(ctx);
    if (this.bossActive) this.fight.rooms.drawCues(ctx);
    if (this.bossActive && this.fight.components.debug) this.fight.components.drawDebug(ctx);
    this.drawBullets();
    this.weapons.draw(ctx);
    this.tags.draw(ctx);
    this.attacks.draw(ctx);
    this.drawParticles();
    if (this.bossActive) this.hud.draw(ctx, this.boss, this.fight.rooms);
    if (this.state === 'playing') {
      this.drawShip();
      this.dodge.drawShipFx(ctx, this.ship.x, this.ship.y);
    }
    this.fx.drawNumbers(ctx);
    this.fx.endShake(ctx);
    if (this.fx.enabled && this.state === 'playing') this.dmgFx.drawVignette(ctx, this.health.hp, this.health.maxHp);
    this.health.draw(ctx);
    if (this.bossActive && this.fight.enraged && this.state === 'playing') this.hud.drawEnraged(ctx, this.fight.fightTime);
    if (this.state === 'playing') this.dodge.drawButton(ctx);
    if (this.state === 'playing') this.hud.drawWeapons(ctx, this.weapons, this.weaponsLocked);
    this.hud.drawUpgrades(ctx, this.loadout);
    if (this.showDebug) {
      this.drawDebug();
      if (this.panelVisible) this.panel.draw(this.ctx);
      this.drawHitbox();
    }
    if (this.state === 'won' && this.bossActive) this.drawWin();
    if (this.state === 'lost') this.drawLost();
    if (this.mode === 'run') this.run.draw(ctx);
    this.overlay?.draw(ctx);
  }

  /** Every unit's hull and parts (dying ones fade), plus the debug boxes. */
  private drawUnits(): void {
    const ctx = this.ctx;
    for (const u of this.units.units) {
      const dying = u.state === 'dying';
      if (dying) ctx.globalAlpha = Math.max(0, 1 - u.dyingFor / u.dyingTime);
      u.fight.boss.render(ctx);
      u.fight.components.drawFx(ctx);
      u.fight.rooms.drawCues(ctx);
      ctx.globalAlpha = 1;
      if (this.showDebug && this.units.debug && !dying) {
        const b = u.fight.boss;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,120,120,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5, b.width, b.height);
        ctx.fillStyle = '#ff9a9a';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${u.def.id} ${Math.ceil(b.core.hp)}hp ${u.fight.pixelDamagePercent.toFixed(0)}%`, b.x + b.width / 2, b.y - 2);
        ctx.restore();
        u.fight.components.drawDebug(ctx);
      }
    }
  }

  private drawBullets(): void {
    const ctx = this.ctx;
    this.drawMuzzleCharge();
    ctx.fillStyle = '#fff7a8';
    for (const b of this.bullets) {
      if (b.look?.glow) {
        // Charged beam-bolt: additive halo, bright core, long streak.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${b.look.glow},0.28)`;
        ctx.fillRect(Math.round(b.x - b.look.w * 2.5), Math.round(b.y - b.look.h / 2 - 8), b.look.w * 5, b.look.h + 24);
        ctx.fillStyle = `rgba(${b.look.glow},0.7)`;
        ctx.fillRect(Math.round(b.x - b.look.w), Math.round(b.y - b.look.h / 2), b.look.w * 2, b.look.h + 14);
        ctx.restore();
        ctx.fillStyle = b.look.color;
        ctx.fillRect(Math.round(b.x - b.look.w / 4), Math.round(b.y - b.look.h / 2), b.look.w / 2, b.look.h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(b.x - 1), Math.round(b.y - b.look.h / 2), 2, 8);
        ctx.fillStyle = '#fff7a8';
      } else if (b.look) {
        ctx.fillStyle = b.look.color;
        ctx.fillRect(Math.round(b.x - b.look.w / 2), Math.round(b.y - b.look.h / 2), b.look.w, b.look.h);
        ctx.fillStyle = '#fff7a8';
      } else ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 5, 3, 10);
    }
  }

  /** Charged mains (a `bullet.glow`): a glow grows at the muzzle over the last of each shot interval and bursts as the bolt leaves. */
  private drawMuzzleCharge(): void {
    if (this.state !== 'playing') return;
    const def = mainById(this.run.state.loadout.main);
    const glow = def.bullet.glow;
    if (!glow) return;
    const interval = 1 / effectiveMain(def, this.stats, (k, b) => this.loadout.get(k, b)).fireRate;
    const p = Math.min(1, this.fireTimer / interval);
    const ctx = this.ctx;
    const x = this.ship.x;
    const y = this.ship.y - 24;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const charge = Math.max(0, (p - 0.35) / 0.65);
    const burst = Math.max(0, 1 - p * 8); // brief flash right after the shot
    const r = 3 + 9 * charge * charge + 8 * burst;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r + 6);
    grad.addColorStop(0, `rgba(255,255,255,${0.35 + 0.6 * Math.max(charge, burst)})`);
    grad.addColorStop(0.4, `rgba(${glow},${0.25 + 0.5 * Math.max(charge, burst)})`);
    grad.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - r - 6, y - r - 6, (r + 6) * 2, (r + 6) * 2);
    ctx.restore();
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private shipLook() {
    return shipById(this.run.state.shipId).look;
  }

  private drawShip(): void {
    const { x, y } = this.ship;
    if (!this.fx.enabled) {
      drawShipLook(this.ctx, this.shipLook(), x, y);
      return;
    }
    this.dmgFx.drawShip(this.ctx, this.shipLook(), x, y, this.health.invuln, this.dodge.invulnerable);
    this.dmgFx.drawFire(this.ctx, x, y, this.health.hp, this.health.maxHp);
  }

  private unitLines(): string[] {
    const live = this.units.live();
    const small = live.filter((u) => !u.big).length;
    return [
      `units ${live.length} alive (${small} small, ${live.length - small} big)  queued ${this.units.remaining() - this.units.units.length}  enemy bullets ${this.attacks.bullets.length}  spawn unit [;]  spawn wave [']  kill all [\\]  boxes [H]`,
    ];
  }

  private drawDebug(): void {
    const ctx = this.ctx;
    const s = this.stats;
    const lines = !this.bossActive ? [
      `${this.fps.toFixed(0)} fps  t=${this.elapsed.toFixed(1)}s  WAVE MODE (no boss)`,
      ...this.unitLines(),
      `DMG ${s.damage.toLocaleString('en-US')}  [1/2]  rate ${s.fireRate} [3/4]  god mode ${this.godMode ? 'ON' : 'off'} [G]  TEST MODE ${this.testMode ? 'ON' : 'off'} [Y]  autopilot ${this.auto} [P]`,
      `hp ${this.health.hp}/${this.health.maxHp}  enemy attacks ${this.attacks.enabled ? 'ON' : 'off'} [K]  dodge ${this.dodge.ready ? 'ready' : this.dodge.cooldown.toFixed(1) + 's'}  juice ${this.fx.enabled ? 'on' : 'off'} [J]`,
      `weapons ${this.weapons.defs.map((d) => `${d.name} ${this.weapons.enabled[d.id] ? this.weapons.secondsLeft(d.id).toFixed(1) + 's' : 'off'} [${AUX_KEYS[this.weapons.defs.indexOf(d)]}]`).join('  ')}  fire all [Q]`,
    ] : [
      `${this.fps.toFixed(0)} fps  t=${this.elapsed.toFixed(1)}s`,
      ...this.boss.layers.map(
        (l, i) =>
          `${l.name.padEnd(5)} ${(this.boss.layerRemaining(i) * 100).toFixed(1).padStart(5)}%  d=${l.density}`,
      ),
      `hull 25% carved: ${this.hull25At == null ? '--' : this.hull25At.toFixed(1) + 's'}`,
      `cleared <=5%: ${[...this.boss.layers.map((l) => l.name.toLowerCase()), 'core']
        .map((n, i) => `${n} ${this.clearAt[i] == null ? '--' : this.clearAt[i]!.toFixed(1) + 's'}`)
        .join('  ')}`,
      `core ${Math.ceil(this.boss.core.hp)} / ${TUNING.coreHp}  dmg taken x${this.fight.coreVulnerability().toFixed(2)}`,
      `DMG ${s.damage.toLocaleString('en-US')}  [1/2] step (+Shift x10, +Alt/Ctrl x100)  rate ${s.fireRate} [3/4]`,
      `dmg x0.5 [ [ ]  x2 [ ] ]  presets [9]  god mode ${this.godMode ? 'ON' : 'off'} [G]  panel [C] (click it)`,
      `TEST MODE (fast dig) ${this.testMode ? 'ON' : 'off'} [Y]  autopilot ${this.auto} [P]`,
      `shots ${s.projectiles} [5/6]  pierce ${s.pierce} [7/8]  reset stats [0]`,
      `dodge [Shift/X] ${this.dodge.ready ? 'ready' : this.dodge.cooldown.toFixed(1) + 's'}${this.dodge.invulnerable ? ' INVULN' : ''}`,
      `movement ${this.fight.movementEnabled ? 'on' : 'off'} [T]  cycle [M]  restart [R]  debug [\`]  boss ${this.fight.def.name} [B]`,
      `phase ${this.fight.phaseIndex + 1}/${this.fight.def.phases.length} ${this.fight.phase.name} (${this.fight.movementOverride ? 'OVERRIDE ' : ''}${this.fight.movement.name}) ${this.fight.phaseTime.toFixed(1)}s`,
      `next: ${this.fight.describeNext()}  [pixel ${this.fight.pixelDamagePercent.toFixed(1)}% core ${this.fight.coreDamagePercent.toFixed(1)}%]`,
      `boss attacks ${this.attacks.enabled ? 'ON' : 'off'} [K]  hp ${this.health.hp}/${this.health.maxHp}  hitbox r=${this.hitbox.toFixed(1)}`,
      `attack mode ${this.attacks.mode} [N]  pattern ${PATTERNS[this.attacks.selected].name} [V]  fire it [F]`,
      `juice ${this.fx.enabled ? 'on' : 'off'} [J]  component/room hit areas ${this.fight.components.debug ? 'ON' : 'off'} [H]  expose room [E]`,
      `weapons ${this.weapons.defs.map((d) => `${d.name} ${this.weapons.enabled[d.id] ? this.weapons.secondsLeft(d.id).toFixed(1) + 's' : 'off'} [${AUX_KEYS[this.weapons.defs.indexOf(d)]}]`).join('  ')}  fire all [Q]  cooldown x${WEAPONS.cooldownScale} [, .]`,
      ...this.scrollLines(),
      ...this.regrowthLines(),
      ...(this.units.units.length > 0 ? this.unitLines() : []),
      `blast scale x${BLAST.scale.toFixed(2)} [-/=] (+Shift x4)  r: turret ${BLAST.defaults.turret.radius} expl ${BLAST.defaults.explosive.radius} room ${BLAST.defaults.room.radius}`,
    ];
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(6, 6, 528, lines.length * 15 + 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#b9f5c0';
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    lines.forEach((t, i) => ctx.fillText(t, 12, 10 + i * 15));
    ctx.restore();
  }

  /** Debug overlay: scroll level state, weapons lock and the capital ship's armour flag. */
  private scrollLines(): string[] {
    const out: string[] = [];
    const r = this.scroll;
    if (r) out.push(`scroll ${r.def?.id} ${Math.floor(r.distance)}/${r.def?.length}px  speed ${Math.round(r.speed)}  obstacles ${r.obstacles.list.length}  allies ${r.allies.count}  [PgUp/PgDn] speed  [End] skip 1000  [Home] stop`);
    else out.push('scroll [Home] test level');
    out.push(`weapons ${this.weaponsLocked ? 'LOCKED' : 'free'} [Insert]${this.fight.boss.layers.some((l) => l.armour) ? `  armour ${this.fight.armourCarvable ? 'CARVABLE' : 'indestructible'} [Delete]` : ''}`);
    return out;
  }

  /** Debug overlay lines for hull regrowth (none for bosses that do not regrow). */
  private regrowthLines(): string[] {
    const g = this.fight.regrowth;
    if (!g) return [];
    return [
      `regrowth ${g.enabled ? 'ON' : 'off'} [U] ${g.spec.mode} layer ${g.layerIndex}: ${(g.rate * 100).toFixed(2)}%/s  idle ${g.sinceHit.toFixed(1)}/${g.idleDelay}s${g.idle ? ' IDLE' : ''}  regrown ${(g.regrownFraction * 100).toFixed(1)}%${g.active ? ' growing' : ''}`,
    ];
  }

  /** Player hitbox, shown with the debug overlay. */
  private drawHitbox(): void {
    if (this.state !== 'playing') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.health.invuln > 0 || this.dodge.invulnerable ? '#9ff6ff' : '#ffff00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.ship.x, this.ship.y, this.hitbox, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawLost(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(40,0,0,0.55)';
    ctx.fillRect(0, H / 2 - 70, W, 140);
    ctx.fillStyle = '#ff5a5a';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SHIP DESTROYED', W / 2, H / 2 - 15);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    if (this.mode === 'boss') ctx.fillText('the boss repairs itself... restarting', W / 2, H / 2 + 25);
    ctx.restore();
  }

  private drawWin(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H / 2 - 90, W, 180);
    ctx.fillStyle = '#ffd21f';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CORE DESTROYED', W / 2, H / 2 - 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px monospace';
    ctx.fillText(`time ${this.wonAt.toFixed(1)}s`, W / 2, H / 2 + 12);
    if (this.mode === 'boss') ctx.fillText('tap or press R to restart', W / 2, H / 2 + 48);
    ctx.restore();
  }
}
