import { Sfx } from './audio';
import { Boss } from './boss';
import { H, TUNING, W } from './config';
import { createDemoBoss } from './demoBoss';
import { Effects } from './effects';
import { Input } from './input';

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
  damage: 60,
  fireRate: 10,
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

type State = 'playing' | 'won';

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private boss: Boss;
  private stats: ShipStats = { ...DEFAULT_STATS };
  private ship = { x: W / 2, y: H - 140 };
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private readonly stars: Star[] = [];
  private fireTimer = 0;
  private state: State = 'playing';
  private elapsed = 0;
  private wonAt = 0;
  private readonly fx = new Effects();
  private readonly sfx = new Sfx();
  private showDebug = true;
  private fps = 60;
  private last = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(canvas);
    this.boss = this.makeBoss();

    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        speed: 20 + Math.random() * 60,
        size: Math.random() < 0.2 ? 2 : 1,
      });
    }

    this.input.onPress = (code) => this.onKey(code);
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
    return { boss: this.boss, stats: this.stats, ship: this.ship, bullets: this.bullets };
  }

  private makeBoss(): Boss {
    return new Boss(createDemoBoss(), TUNING.boss.x, TUNING.boss.y);
  }

  private reset(): void {
    const sway = this.boss.swayEnabled;
    this.boss = this.makeBoss();
    this.boss.swayEnabled = sway;
    this.bullets = [];
    this.particles = [];
    this.state = 'playing';
    this.elapsed = 0;
    this.fx.reset();
  }

  private onKey(code: string): void {
    this.sfx.resume();
    const s = this.stats;
    switch (code) {
      case 'KeyR':
        this.reset();
        break;
      case 'KeyT':
        this.boss.swayEnabled = !this.boss.swayEnabled;
        break;
      case 'KeyJ':
        this.fx.enabled = this.sfx.enabled = !this.fx.enabled;
        break;
      case 'Backquote':
        this.showDebug = !this.showDebug;
        break;
      case 'Digit1':
        s.damage = Math.max(10, s.damage - 10);
        break;
      case 'Digit2':
        s.damage += 10;
        break;
      case 'Digit3':
        s.fireRate = Math.max(1, s.fireRate - 1);
        break;
      case 'Digit4':
        s.fireRate += 1;
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
        Object.assign(this.stats, DEFAULT_STATS);
        break;
    }
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
    this.boss.update(dt, TUNING.sway);
    for (const d of this.boss.dustEvents.splice(0)) this.spawnDebris(d.x, d.y, 24, false, d.r, d.g, d.b);

    if (this.state === 'playing') {
      this.moveShip(dt);
      this.fire(dt);
    }
    this.updateBullets(dt);
    this.updateParticles(dt);

    if (this.state === 'playing' && this.boss.defeated) {
      this.state = 'won';
      this.wonAt = this.elapsed;
      this.explode();
      this.fx.onExplosion();
      this.sfx.explosion();
    }
  }

  private moveShip(dt: number): void {
    const ship = this.ship;
    if (this.input.pointerDown) {
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

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      const dist = TUNING.bulletSpeed * dt;
      const steps = Math.max(1, Math.ceil(dist));
      const sx = (b.dx * dist) / steps;
      const sy = (b.dy * dist) / steps;
      for (let i = 0; i < steps && b.alive; i++) {
        b.x += sx;
        b.y += sy;
        if (b.y < -30 || b.x < -30 || b.x > W + 30 || b.y > H + 30) {
          b.alive = false;
          break;
        }
        this.resolveImpact(b);
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  private resolveImpact(b: Bullet): void {
    const budget = b.energy * (1 - b.pierce);
    const res = this.boss.hit(b.x, b.y, budget);
    if (!res) return;

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

    if (!this.boss.defeated || this.elapsed - this.wonAt < 1.2) this.boss.render(ctx);
    this.drawBullets();
    this.drawParticles();
    if (this.state === 'playing') this.drawShip();
    this.fx.drawNumbers(ctx);
    this.fx.endShake(ctx);
    if (this.showDebug) this.drawDebug();
    if (this.state === 'won') this.drawWin();
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
      `core ${Math.ceil(this.boss.core.hp)} / ${TUNING.coreHp}`,
      `dmg ${s.damage} [1/2]  rate ${s.fireRate} [3/4]`,
      `shots ${s.projectiles} [5/6]  pierce ${s.pierce} [7/8]  reset stats [0]`,
      `sway ${this.boss.swayEnabled ? 'on' : 'off'} [T]  restart [R]  debug [\`]`,
      `juice ${this.fx.enabled ? 'on' : 'off'} [J]`,
    ];
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(6, 6, 330, lines.length * 15 + 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#b9f5c0';
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    lines.forEach((t, i) => ctx.fillText(t, 12, 10 + i * 15));
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
