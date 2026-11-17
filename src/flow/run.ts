import { CampaignFlow } from '../campaign/flow';
import { cleanLoadout, defaultLoadoutFor, initialSelection } from '../loadouts';
import { saveStore } from '../save';
import { DEFAULT_SHIP_ID, SHIP_BY_ID, shipById, SHIPS, type WeaponLoadout } from '../ships';
import type { FlowNode, NodeContext, NodeDefinition, NodeHost, NodePosition, RunDefinition, RunState } from './node';
import { createNode } from './nodes';
import { CAMPAIGN_BTN, ENDLESS_BTN, UNLOCKS_BTN, drawRunOver, drawRunWon, drawTitle } from './screens';
import { LoadoutScreen, ShipSelectScreen } from './shipScreens';
import { UnlocksScreen } from './unlocksScreen';

/** title -> node (the current level's nodes, then its reward) -> ... -> won; death at any node -> over. */
export type RunPhase = 'title' | 'unlocks' | 'ships' | 'loadout' | 'campaign' | 'node' | 'over' | 'won';

/** Seconds a result screen ignores input, so the press that ended the last node cannot skip it. */
const SCREEN_LOCKOUT = 1;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The flow engine: walks a RunDefinition, one node at a time. It knows nothing about what nodes do; it only
 * starts them, updates them, reads their outcome and moves on. All game access goes through the `NodeHost`.
 */
export class Run {
  phase: RunPhase = 'title';
  /** The ship and weapons the next run starts with. Default ship and loadout until the Endless screens (or a debug hook) pick others. */
  selection: { shipId: string; loadout: WeaponLoadout } = { shipId: DEFAULT_SHIP_ID, loadout: defaultLoadoutFor(DEFAULT_SHIP_ID) };
  state: RunState = this.freshState(0);
  /** Names of ships unlocked during the current run (shown on the result screens). */
  private unlockedNames: string[] = [];
  /** The campaign menus and play (phase `campaign`). It borrows the run's ship selection and gives it back (see `bridge` below). */
  readonly campaign: CampaignFlow;
  private savedSelection: { shipId: string; loadout: WeaponLoadout } | null = null;
  private node: FlowNode | null = null;
  private unlocksScreen: UnlocksScreen | null = null;
  private shipScreen: ShipSelectScreen | null = null;
  private loadoutScreen: LoadoutScreen | null = null;
  /** Seconds in the current phase (screen blink and lockout). */
  private phaseTime = 0;

  constructor(
    readonly def: RunDefinition,
    private readonly host: NodeHost,
  ) {
    this.campaign = new CampaignFlow(host, {
      prepare: () => {
        this.savedSelection = { shipId: this.selection.shipId, loadout: { main: this.selection.loadout.main, aux: [...this.selection.loadout.aux] } };
        this.state = this.freshState(0); // no upgrades, the level sets the ship
      },
      restore: () => {
        const s = this.savedSelection;
        this.savedSelection = null;
        if (s) this.select(s.shipId, s.loadout);
        this.state.upgrades = [];
      },
    });
  }

  /** Node definitions of the current level in play order: its nodes, then its reward (not after the last level). */
  private levelNodes(levelIndex = this.state.levelIndex): NodeDefinition[] {
    const level = this.def.levels[levelIndex];
    const last = levelIndex === this.def.levels.length - 1;
    return level.reward && !last ? [...level.nodes, { type: 'reward', ...level.reward }] : level.nodes;
  }

  private freshState(seed: number): RunState {
    const sel = this.selection;
    return { seed, rng: mulberry32(seed), levelIndex: 0, nodeIndex: 0, maxHealth: shipById(sel.shipId).baseStats.maxHealth, shipId: sel.shipId, loadout: { main: sel.loadout.main, aux: [...sel.loadout.aux] }, upgrades: [], time: 0 };
  }

  /** Choose the ship and loadout (a debug hook and the Endless screens): applies to the current state at once and to every later run. */
  select(shipId: string, loadout?: WeaponLoadout): void {
    const id = SHIP_BY_ID.has(shipId) ? shipId : DEFAULT_SHIP_ID;
    const l = cleanLoadout(loadout ?? defaultLoadoutFor(id), id);
    this.selection = { shipId: id, loadout: l };
    this.state.shipId = id;
    this.state.maxHealth = shipById(id).baseStats.maxHealth;
    this.state.loadout = { main: l.main, aux: [...l.aux] };
  }

  /** Begin a new run at level 1, node 1. */
  start(seed: number = (Date.now() & 0x7fffffff) >>> 0): void {
    this.endNode();
    this.unlockedNames = [];
    this.state = this.freshState(seed);
    this.host.healFull();
    this.enterNode();
  }

  /** Abandon whatever is running and go back to the title. */
  toTitle(): void {
    this.campaign.shutdown();
    this.endNode();
    this.setPhase('title');
  }

  private setPhase(p: RunPhase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private position(defs: NodeDefinition[]): NodePosition {
    const type = defs[this.state.nodeIndex].type;
    const same = defs.filter((d) => d.type === type);
    return {
      level: this.state.levelIndex + 1,
      levels: this.def.levels.length,
      index: defs.slice(0, this.state.nodeIndex + 1).filter((d) => d.type === type).length,
      count: same.length,
    };
  }

  private enterNode(): void {
    const defs = this.levelNodes();
    const def = defs[this.state.nodeIndex];
    const node = createNode(def);
    this.node = node;
    this.setPhase('node');
    const ctx: NodeContext = { host: this.host, run: this.state, position: this.position(defs) };
    node.start(ctx);
  }

  private endNode(): void {
    this.node?.end?.();
    this.node = null;
  }

  /** Move to the next node, the next level (full heal) or the win. */
  private advance(): void {
    this.endNode();
    const s = this.state;
    s.nodeIndex++;
    if (s.nodeIndex >= this.levelNodes().length) {
      s.levelIndex++;
      s.nodeIndex = 0;
      if (s.levelIndex === 1) this.unlockShip('warden'); // the first boss is down
      if (s.levelIndex >= this.def.levels.length) {
        s.levelIndex = this.def.levels.length - 1;
        s.nodeIndex = this.levelNodes().length - 1;
        this.unlockShip('wisp'); // the run is won
        this.setPhase('won');
        return;
      }
      this.host.healFull();
    }
    this.enterNode();
  }

  /** Unlock a ship by flag (`SHIPS[].unlock`); remembered for the result screen when it is new. */
  private unlockShip(flag: string): void {
    const ship = SHIPS.find((s) => s.unlock === flag);
    if (ship && saveStore.unlock('ships', flag)) this.unlockedNames.push(ship.name);
  }

  update(dt: number): void {
    this.phaseTime += dt;
    if (this.phase === 'node') {
      this.state.time += dt;
      const node = this.node!;
      node.update(dt);
      const out = node.outcome();
      if (out === 'done') this.advance();
      else if (out === 'lost') {
        this.endNode();
        this.setPhase('over');
      }
      return;
    }
    if (this.phase === 'campaign') {
      if (this.campaign.update(dt) === 'exit') this.toTitle();
      return;
    }
    if (this.phase === 'unlocks') {
      if (this.unlocksScreen!.update(dt, this.host)) this.toTitle();
      return;
    }
    if (this.phase === 'ships') {
      const r = this.shipScreen!.update(dt, this.host);
      if (r === 'back') this.toTitle();
      else if (r === 'next') {
        const ship = this.shipScreen!.ship;
        // Keep the saved weapons when the same ship is picked again, else start from the ship's own.
        const last = saveStore.current.lastLoadout;
        this.loadoutScreen = new LoadoutScreen(ship.id, last && last.ship === ship.id ? last : defaultLoadoutFor(ship.id));
        this.setPhase('loadout');
      }
      return;
    }
    if (this.phase === 'loadout') {
      const r = this.loadoutScreen!.update(dt, this.host);
      if (r === 'back') this.setPhase('ships');
      else if (r === 'start') {
        const ship = this.shipScreen!.ship;
        const l = this.loadoutScreen!.loadout;
        this.select(ship.id, l);
        saveStore.setLastLoadout({ ship: ship.id, main: l.main, aux: l.aux });
        this.startFromTitle();
      }
      return;
    }
    // title / over / won: result screens continue on any tap or key after a short lockout; the title has buttons.
    const tap = this.host.takeTap();
    const key = this.host.takeKey();
    if (!tap && !key) return;
    if (this.phase === 'title') {
      const inBtn = (b: { x: number; y: number; w: number; h: number }): boolean => !!tap && tap.x >= b.x && tap.x <= b.x + b.w && tap.y >= b.y && tap.y <= b.y + b.h;
      if (key === 'KeyU' || inBtn(UNLOCKS_BTN)) {
        this.unlocksScreen = new UnlocksScreen();
        this.setPhase('unlocks');
      } else if (key === 'KeyC' || inBtn(CAMPAIGN_BTN)) {
        this.campaign.open();
        this.setPhase('campaign');
      } else if (key === 'Enter' || key === 'Space' || key === 'KeyE' || inBtn(ENDLESS_BTN)) {
        const sel = initialSelection();
        this.shipScreen = new ShipSelectScreen(sel.shipId);
        this.setPhase('ships');
      }
      // The CONQUEST button is "coming soon": taps do nothing.
    } else if (this.phaseTime > SCREEN_LOCKOUT) this.toTitle();
  }

  private startFromTitle(): void {
    const seed = new URLSearchParams(location.search).get('seed');
    this.start(seed !== null && seed !== '' && !Number.isNaN(+seed) ? +seed : undefined);
  }

  /** Debug: jump straight into a campaign level (skips the menus). */
  startCampaignLevel(levelId: string, objective = 0): void {
    this.endNode();
    this.campaign.startLevel(levelId, objective);
    this.setPhase('campaign');
  }

  /** Debug: open the campaign unlock reveal for a campaign id (src/finale/unlocks.ts). */
  showCampaignUnlocks(campaignId: string) {
    this.endNode();
    const items = this.campaign.showUnlocks(campaignId);
    this.setPhase('campaign');
    return items;
  }

  /** True while a node is current (as opposed to the title and result screens). */
  get active(): boolean {
    return this.phase === 'node';
  }

  /** Draws the current node or screen, plus a small progress label while a node is running. */
  draw(g: CanvasRenderingContext2D): void {
    const summary = { level: this.state.levelIndex + 1, levels: this.def.levels.length, time: this.state.time, upgrades: this.state.upgrades.map((u) => u.name), unlocked: this.unlockedNames };
    switch (this.phase) {
      case 'title':
        drawTitle(g, this.phaseTime, this.def.levels.length);
        break;
      case 'unlocks':
        this.unlocksScreen!.draw(g);
        break;
      case 'ships':
        this.shipScreen!.draw(g);
        break;
      case 'loadout':
        this.loadoutScreen!.draw(g);
        break;
      case 'campaign':
        this.campaign.draw(g);
        break;
      case 'over':
        drawRunOver(g, this.phaseTime, summary);
        break;
      case 'won':
        drawRunWon(g, this.phaseTime, summary);
        break;
      case 'node': {
        this.node!.draw(g);
        const defs = this.levelNodes();
        const p = this.position(defs);
        const type = defs[this.state.nodeIndex].type;
        g.save();
        g.font = '12px ui-monospace, Consolas, monospace';
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillStyle = '#6ee7ff';
        g.fillText(`LEVEL ${p.level}/${p.levels} · ${type.toUpperCase()}${p.count > 1 ? ` ${p.index}/${p.count}` : ''}`, 12, 950);
        g.restore();
        break;
      }
    }
  }
}
