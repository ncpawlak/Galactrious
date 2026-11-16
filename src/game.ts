import { Attacks, PATTERNS } from './attacks';
import { Sfx } from './audio';
import type { Boss } from './boss';
import { BossFight } from './bossFight';
import { EnrageTint } from './enrage';
import { BOSSES, DEFAULT_BOSS_ID, type BossDefinition } from './bosses';
import { H, TUNING, W } from './config';
import { DebugPanel, modifierMult } from './debugControls';
import { Effects } from './effects';
import { Hud } from './hud';
import { Input } from './input';
import { MOVEMENT_PRESETS } from './movement';
import { Dodge, Health } from './player';

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
const SHIP_MIN_Y = 520;

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
  private readonly attacks = new Attacks();
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
  private testMode = false;
  private readonly fx = new Effects();
  private readonly sfx = new Sfx();
  private showDebug = true;
  /** Debug: the player takes no damage. */
  godMode = false;
  private readonly panel: DebugPanel;
  private fps = 60;
  private last = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(canvas);
    this.fight = this.makeFight();

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
        resetAll: () => {
          this.godMode = false;
          this.resetStats();
        },
      },
      H,
    );
    // Clicks on the debug panel are consumed here so they never steer the ship.
    this.input.capture = (x, y, e) => {
      if (!this.showDebug || !this.panel.handlePointer(x, y, e)) return false;
      this.sfx.resume();
      return true;
    };
    this.input.onPress = (code) => this.onKey(code);
    this.input.onDodge = () => this.tryDodge();
    this.input.onPointerDown = () => {
      this.sfx.resume();
      if (this.state === 'won' && this.elapsed - this.wonAt > 1) this.reset();
    };
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
      attacks: this.attacks,
      setAttacks: (on: boolean) => (this.attacks.enabled = on),
      components: this.fight.components,
      rooms: this.fight.rooms,
      setComponentDebug: (on: boolean) => (this.fight.components.debug = on),
      /** Advance the sim `seconds` of game time without rendering (for scripted measurements). */
      simulate: (seconds: number, mode: 'off' | 'sweep' | 'focus' = this.auto) => {
        this.auto = mode;
        for (let t = 0; t < seconds; t += 1 / 60) this.update(1 / 60);
        return this.clearTimes();
      },
      setSwept: (on: boolean) => (this.sweptBullets = on),
      setAuto: (m: 'off' | 'sweep' | 'focus') => (this.auto = m),
      setTestMode: (on: boolean) => this.setTestMode(on),
      reset: () => this.reset(),
      clearTimes: () => this.clearTimes(),
    };
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
    fight.rooms.host = { fire: (p, o, alive) => this.attacks.firePattern(p, o, this.ship, alive), hazard: (h) => this.attacks.spawnHazard(h) };
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

  private reset(keepFight = false): void {
    if (!keepFight) {
      const old = this.fight;
      this.fight = this.makeFight();
      this.carryDebug(old);
    }
    this.bullets = [];
    this.particles = [];
    this.dodge.reset();
    this.health.reset();
    this.attacks.reset();
    this.state = 'playing';
    this.elapsed = 0;
    this.clearAt = [];
    this.hull25At = null;
    this.fx.reset();
  }

  private onKey(code: string): void {
    this.sfx.resume();
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
      case 'KeyH':
        this.fight.components.debug = !this.fight.components.debug;
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
      case 'KeyG':
        this.godMode = !this.godMode;
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
    if (this.state !== 'playing') return;
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
    for (const s of this.stars) {
      s.y += s.speed * dt;
      if (s.y > H) {
        s.y = 0;
        s.x = Math.random() * W;
      }
    }
    this.fight.update(dt);
    for (const d of this.boss.dustEvents.splice(0)) this.spawnDebris(d.x, d.y, 24, false, d.r, d.g, d.b);

    if (this.state === 'playing') {
      this.moveShip(dt);
      this.fire(dt);
    }
    this.updateThreat(dt);
    this.updateBullets(dt);
    this.drainComponentEvents();
    this.updateParticles(dt);
    this.trackClears();

    if (this.state === 'playing' && this.boss.defeated) {
      this.state = 'won';
      this.wonAt = this.elapsed;
      this.explode();
      this.fx.onExplosion();
      this.sfx.explosion();
    }
  }

  /** Boss fire, player damage and the defeat/reset flow. */
  private updateThreat(dt: number): void {
    const b = this.boss;
    const playing = this.state === 'playing';
    this.attacks.update(dt, this.ship, playing && !b.defeated);
    if (!playing) {
      if (this.state === 'lost' && this.elapsed - this.lostAt > TUNING.player.defeatTime) this.reset();
      return;
    }
    this.health.update(dt);
    const dmg =
      this.attacks.collect(this.ship.x, this.ship.y, TUNING.player.hitbox) +
      this.attacks.collectHazards(this.ship.x, this.ship.y, TUNING.player.hitbox);
    if (dmg > 0 && !this.godMode && this.health.hit(dmg, this.dodge.invulnerable)) {
      if (this.health.dead) {
        this.state = 'lost';
        this.lostAt = this.elapsed;
        this.fx.onExplosion();
        this.sfx.explosion();
      }
    }
  }

  /** Juice and sound for what the boss's components did this frame (hits, damage states, destruction). */
  private drainComponentEvents(): void {
    for (const e of this.fight.components.events.splice(0)) {
      switch (e.kind) {
        case 'hit':
          this.fx.onComponentHit();
          this.sfx.componentHit();
          break;
        case 'state':
          this.sfx.componentDamage(e.level);
          break;
        case 'destroy':
          this.fx.onComponentDestroy(e.blast);
          this.sfx.componentDestroy(e.blast);
          break;
        case 'detach':
          this.sfx.componentDamage(1);
          break;
        case 'roomExposed':
          this.fx.onRoomExposed();
          this.sfx.roomExposed();
          break;
        case 'roomOffline':
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
      ship.y = H - 140;
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
      const k = Math.min(1, dt * 20);
      ship.x += (tx - ship.x) * k;
      ship.y += (ty - ship.y) * k;
    } else {
      const a = this.input.axis();
      const speed = 460;
      ship.x += a.x * speed * dt;
      ship.y += a.y * speed * dt;
    }
    ship.x = Math.min(W - 18, Math.max(18, ship.x));
    ship.y = Math.min(H - 36, Math.max(SHIP_MIN_Y, ship.y));
  }

  private fire(dt: number): void {
    const interval = 1 / this.stats.fireRate;
    this.fireTimer += dt;
    while (this.fireTimer >= interval) {
      this.fireTimer -= interval;
      this.shoot();
    }
  }

  private shoot(): void {
    const { projectiles, spreadDeg, damage, pierce } = this.stats;
    for (let i = 0; i < projectiles; i++) {
      const offset = i - (projectiles - 1) / 2;
      const angle = (offset * spreadDeg * Math.PI) / 180;
      this.bullets.push({
        x: this.ship.x + offset * 6,
        y: this.ship.y - 22,
        dx: Math.sin(angle),
        dy: -Math.cos(angle),
        energy: damage,
        pierce,
        alive: true,
      });
    }
  }

  /**
   * Swept bullet check: the boss moves during the frame, so each sub-step tests the bullet against
   * the boss position interpolated between the frame's start and end positions. Off = the old
   * behaviour (bullet sub-steps against the boss's final position only); kept for measuring.
   */
  sweptBullets = true;

  private updateBullets(dt: number): void {
    const boss = this.boss;
    const endX = boss.x;
    const endY = boss.y;
    const mx = endX - boss.prevX;
    const my = endY - boss.prevY;
    const bossMove = this.sweptBullets ? Math.hypot(mx, my) : 0;
    for (const b of this.bullets) {
      const dist = TUNING.bulletSpeed * dt;
      const steps = Math.max(1, Math.ceil(dist), Math.ceil(bossMove));
      const sx = (b.dx * dist) / steps;
      const sy = (b.dy * dist) / steps;
      for (let i = 0; i < steps && b.alive; i++) {
        b.x += sx;
        b.y += sy;
        if (b.y < -30 || b.x < -30 || b.x > W + 30 || b.y > H + 30) {
          b.alive = false;
          break;
        }
        if (bossMove > 0) {
          const f = (i + 1) / steps;
          boss.x = boss.prevX + mx * f;
          boss.y = boss.prevY + my * f;
        }
        this.resolveImpact(b);
      }
    }
    boss.x = endX;
    boss.y = endY;
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  private resolveImpact(b: Bullet): void {
    const budget = b.energy * (1 - b.pierce);
    // A component under the bullet takes the hit (hidden hp, no numbers) and consumes the bullet.
    if (this.fight.components.hit(b.x, b.y, b.energy)) {
      b.alive = false;
      return;
    }
    const hpBefore = this.boss.core.hp;
    const res = this.boss.hit(b.x, b.y, budget);
    if (!res) return;
    if (res.core) {
      // Core armor: a bullet tunnelled straight in only scratches the core until the outer layers are dug away.
      const dealt = hpBefore - this.boss.core.hp;
      this.boss.core.hp = hpBefore - dealt * this.fight.coreVulnerability();
    }

    this.fx.onHit(b.x, b.y, res.carved, res.spent, res.core);
    if (res.core) this.sfx.coreHit();
    else this.sfx.carve(res.carved);
    this.spawnDebris(b.x, b.y, res.carved, res.core, res.r, res.g, res.b);
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

  private explode(): void {
    const cx = this.boss.x + this.boss.core.x;
    const cy = this.boss.y + this.boss.core.y;
    for (let i = 0; i < 160 && this.particles.length < MAX_PARTICLES; i++) {
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
    this.fx.beginShake(ctx);

    ctx.fillStyle = '#8fa0c8';
    for (const s of this.stars) ctx.fillRect(s.x, s.y, s.size, s.size);

    if (!this.boss.defeated || this.elapsed - this.wonAt < 1.2) this.enrageTint.render(ctx, this.boss, this.fight);
    this.attacks.drawBossDim(ctx);
    this.fight.components.drawFx(ctx);
    if (this.fight.components.debug) this.fight.components.drawDebug(ctx);
    this.drawBullets();
    this.attacks.draw(ctx);
    this.drawParticles();
    this.hud.draw(ctx, this.boss, this.fight.rooms);
    if (this.state === 'playing') {
      this.drawShip();
      this.dodge.drawShipFx(ctx, this.ship.x, this.ship.y);
    }
    this.fx.drawNumbers(ctx);
    this.fx.endShake(ctx);
    this.health.draw(ctx);
    if (this.fight.enraged && this.state === 'playing') this.hud.drawEnraged(ctx, this.fight.fightTime);
    if (this.state === 'playing') this.dodge.drawButton(ctx);
    if (this.showDebug) {
      this.drawDebug();
      this.panel.draw(this.ctx);
      this.drawHitbox();
    }
    if (this.state === 'won') this.drawWin();
    if (this.state === 'lost') this.drawLost();
  }

  private drawBullets(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#fff7a8';
    for (const b of this.bullets) ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 5, 3, 10);
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

  private drawShip(): void {
    const ctx = this.ctx;
    const { x, y } = this.ship;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.fillStyle = '#6ee7ff';
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(15, 16);
    ctx.lineTo(0, 9);
    ctx.lineTo(-15, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, -6, 4, 9);
    ctx.fillStyle = '#ff8a3c';
    ctx.fillRect(-3, 12, 6, 4 + Math.random() * 5);
    ctx.restore();
  }

  private drawDebug(): void {
    const ctx = this.ctx;
    const s = this.stats;
    const lines = [
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
      `boss attacks ${this.attacks.enabled ? 'ON' : 'off'} [K]  hp ${this.health.hp}/${TUNING.player.maxHealth}  hitbox r=${TUNING.player.hitbox}`,
      `attack mode ${this.attacks.mode} [N]  pattern ${PATTERNS[this.attacks.selected].name} [V]  fire it [F]`,
      `juice ${this.fx.enabled ? 'on' : 'off'} [J]  component/room hit areas ${this.fight.components.debug ? 'ON' : 'off'} [H]  expose room [E]`,
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

  /** Player hitbox, shown with the debug overlay. */
  private drawHitbox(): void {
    if (this.state !== 'playing') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.health.invuln > 0 || this.dodge.invulnerable ? '#9ff6ff' : '#ffff00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.ship.x, this.ship.y, TUNING.player.hitbox, 0, Math.PI * 2);
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
    ctx.fillText('the boss repairs itself... restarting', W / 2, H / 2 + 25);
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
    ctx.fillText('tap or press R to restart', W / 2, H / 2 + 48);
    ctx.restore();
  }
}
