import { CampaignFlow } from '../campaign/flow';
import { regionById, REGIONS } from '../conquest/regions';
import { drawConquestHud } from '../conquest/hud';
import { drawConquestResult, RegionScreen, RegionSelectScreen } from '../conquest/screens';
import { ConquestTracker, type ConquestResult } from '../conquest/tracker';
import type { RegionDefinition } from '../conquest/types';
import { cleanLoadout, defaultLoadoutFor, initialSelection } from '../loadouts';
import { saveStore } from '../save';
import { DEFAULT_SHIP_ID, SHIP_BY_ID, shipById, SHIPS, type WeaponLoadout } from '../ships';
import type { FlowNode, NodeContext, NodeDefinition, NodeHost, NodeHud, NodePosition, RunDefinition, RunState } from './node';
import { createNode } from './nodes';
import { CAMPAIGN_BTN, CONQUEST_BTN, ENDLESS_BTN, UNLOCKS_BTN, drawRunOver, drawRunWon, drawTitle } from './screens';
import { LoadoutScreen, ShipSelectScreen } from './shipScreens';
import { UnlocksScreen } from './unlocksScreen';

/** title -> node (the current level's nodes, then its reward) -> ... -> won; death at any node -> over. */
export type RunPhase = 'title' | 'unlocks' | 'regions' | 'region' | 'ships' | 'loadout' | 'campaign' | 'node' | 'over' | 'won';

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
  /** The node lists of the running list's levels as built at the start of the run (a level with `build` rolls its own, seeded; see `LevelDefinition.build`). */
  private built: NodeDefinition[][] = [];
  /** Seconds the current node has been running (banners). */
  private nodeTime = 0;
  private nodeDef: NodeDefinition | null = null;
  private unlocksScreen: UnlocksScreen | null = null;
  private shipScreen: ShipSelectScreen | null = null;
  private loadoutScreen: LoadoutScreen | null = null;
  private regionsScreen: RegionSelectScreen | null = null;
  private regionScreen: RegionScreen | null = null;
  /** Conquest (src/conquest): the region being played or chosen, the tracker of the running run and the result of the last one. Null in Endless. */
  region: RegionDefinition | null = null;
  tracker: ConquestTracker | null = null;
  result: ConquestResult | null = null;
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

  /** The run being played: the region's node list in Conquest, else the Endless run. */
  get activeDef(): RunDefinition {
    return this.region ? this.region.run : this.def;
  }

  /** Node definitions of the current level in play order: its nodes, then its reward (not after the last level). */
  private levelNodes(levelIndex = this.state.levelIndex): NodeDefinition[] {
    const level = this.activeDef.levels[levelIndex];
    const last = levelIndex === this.activeDef.levels.length - 1;
    const nodes = this.built[levelIndex] ?? level.nodes;
    return level.reward && !last ? [...nodes, { type: 'reward', ...level.reward }] : nodes;
  }

  /** Debug: every level's node list as built for this run, rewards included. */
  allNodes(): NodeDefinition[][] {
    return this.activeDef.levels.map((_, i) => this.levelNodes(i));
  }

  /** Roll the levels that build their nodes from the seed (separate random stream: card draws are not disturbed). */
  private buildLevels(seed: number): void {
    const rng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    this.built = this.activeDef.levels.map((l, i) => (l.build ? l.build(rng, i) : l.nodes));
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
    this.result = null;
    this.state = this.freshState(seed);
    this.buildLevels(seed);
    this.tracker = this.region ? new ConquestTracker(this.region, this.host, () => this.state) : null;
    this.host.healFull();
    this.enterNode();
  }

  /** Abandon whatever is running and go back to the title. */
  toTitle(): void {
    this.campaign.shutdown();
    // A Conquest run left half way still saves its bests (challenges were saved the moment they were met).
    if (this.tracker && this.phase === 'node') this.tracker.finish('over');
    this.endNode();
    this.region = null;
    this.tracker = null;
    this.result = null;
    this.setPhase('title');
  }

  /** Conquest: the region screen (challenges and the start button). */
  private openRegion(region: RegionDefinition): void {
    this.region = region;
    this.tracker = null;
    this.regionScreen = new RegionScreen(region);
    this.setPhase('region');
  }

  /** Debug: start a Conquest run at once (skips the menus). `level` / `node` jump into the list. */
  debugStartConquest(regionId: string, level = 0, node = 0, seed?: number): void {
    const region = regionById(regionId);
    if (!region) throw new Error(`unknown region "${regionId}" (known: ${REGIONS.map((r) => r.id).join(', ')})`);
    this.campaign.shutdown();
    this.endNode();
    this.region = region;
    this.start(seed);
    if (level > 0 || node > 0) this.debugJump(level, node);
  }

  /** Debug: jump to node `node` of level `level` of the running list (a Conquest or Endless run). */
  debugJump(level: number, node: number): void {
    const defs = this.activeDef.levels;
    const l = Math.max(0, Math.min(defs.length - 1, level));
    this.endNode();
    this.state.levelIndex = l;
    this.state.nodeIndex = Math.max(0, Math.min(this.levelNodes(l).length - 1, node));
    if (node === 0) this.host.healFull();
    this.enterNode();
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
      levels: this.activeDef.levels.length,
      index: defs.slice(0, this.state.nodeIndex + 1).filter((d) => d.type === type).length,
      count: same.length,
    };
  }

  private enterNode(): void {
    const defs = this.levelNodes();
    const def = defs[this.state.nodeIndex];
    const node = createNode(def);
    this.node = node;
    this.nodeDef = def;
    this.setPhase('node');
    this.nodeTime = 0;
    const ctx: NodeContext = { host: this.host, run: this.state, position: this.position(defs) };
    node.start(ctx);
    this.tracker?.onNodeStart(def);
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
      if (s.levelIndex === 1 && !this.region) this.unlockShip('warden'); // the first boss is down
      if (s.levelIndex >= this.activeDef.levels.length) {
        s.levelIndex = this.activeDef.levels.length - 1;
        s.nodeIndex = this.levelNodes().length - 1;
        if (this.tracker) this.result = this.tracker.finish('won');
        else this.unlockShip('wisp'); // the run is won
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
      this.nodeTime += dt;
      this.state.time += dt;
      const node = this.node!;
      node.update(dt);
      this.tracker?.update(dt);
      const out = node.outcome();
      if (out && this.nodeDef) this.tracker?.onNodeEnd(this.nodeDef, out);
      if (out === 'done') this.advance();
      else if (out === 'lost') {
        this.endNode();
        if (this.tracker) this.result = this.tracker.finish('over');
        this.setPhase('over');
      }
      return;
    }
    if (this.phase === 'regions') {
      const r = this.regionsScreen!.update(dt, this.host);
      if (r?.kind === 'back') this.toTitle();
      else if (r?.kind === 'open') this.openRegion(r.region);
      return;
    }
    if (this.phase === 'region') {
      const r = this.regionScreen!.update(dt, this.host);
      if (r === 'back') {
        this.region = null;
        this.regionsScreen = new RegionSelectScreen();
        this.setPhase('regions');
      } else if (r === 'start') {
        const sel = initialSelection();
        this.shipScreen = new ShipSelectScreen(sel.shipId, `Conquest: ${this.region!.name}`);
        this.setPhase('ships');
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
      if (r === 'back') {
        if (this.region) this.openRegion(this.region);
        else this.toTitle();
      }
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
      } else if (key === 'KeyQ' || inBtn(CONQUEST_BTN)) {
        this.regionsScreen = new RegionSelectScreen();
        this.setPhase('regions');
      } else if (key === 'Enter' || key === 'Space' || key === 'KeyE' || inBtn(ENDLESS_BTN)) {
        this.region = null;
        const sel = initialSelection();
        this.shipScreen = new ShipSelectScreen(sel.shipId);
        this.setPhase('ships');
      }
    } else if (this.phaseTime > SCREEN_LOCKOUT) {
      // A result screen: back to the region screen after a Conquest run (to see the challenges), else the title.
      const region = this.region;
      if (region && this.result) {
        this.tracker = null;
        this.openRegion(region);
      } else this.toTitle();
    }
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
  showCampaignUnlocks(campaignId: string, gold = false) {
    this.endNode();
    const items = this.campaign.showUnlocks(campaignId, gold);
    this.setPhase('campaign');
    return items;
  }

  /** True while a node is current (as opposed to the title and result screens). */
  get active(): boolean {
    return this.phase === 'node';
  }

  /** Draws the current node or screen, plus a small progress label while a node is running. */
  draw(g: CanvasRenderingContext2D): void {
    const summary = { level: this.state.levelIndex + 1, levels: this.activeDef.levels.length, time: this.state.time, upgrades: this.state.upgrades.map((u) => u.name), unlocked: this.unlockedNames };
    switch (this.phase) {
      case 'title':
        drawTitle(g, this.phaseTime, this.def.levels.length, REGIONS.some((r) => saveStore.isRegionUnlocked(r.id)) ? `${REGIONS.filter((r) => saveStore.isRegionUnlocked(r.id)).length}/${REGIONS.length} region open` : 'locked: finish Fallen Peace');
        break;
      case 'unlocks':
        this.unlocksScreen!.draw(g);
        break;
      case 'regions':
        this.regionsScreen!.draw(g);
        break;
      case 'region':
        this.regionScreen!.draw(g);
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
        if (this.region && this.result) drawConquestResult(g, this.phaseTime, this.result, this.region);
        else drawRunOver(g, this.phaseTime, summary);
        break;
      case 'won':
        if (this.region && this.result) drawConquestResult(g, this.phaseTime, this.result, this.region);
        else drawRunWon(g, this.phaseTime, summary);
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
        if (!this.region) g.fillText(`LEVEL ${p.level}/${p.levels} · ${type.toUpperCase()}${p.count > 1 ? ` ${p.index}/${p.count}` : ''}`, 12, 950);
        g.restore();
        if (this.region) {
          const level = this.activeDef.levels[this.state.levelIndex];
          const hud = (d: NodeDefinition | undefined): NodeHud | undefined => (d && 'hud' in d ? d.hud : undefined);
          const here = defs[this.state.nodeIndex];
          // A reward screen shows what comes next; the hud of the next real node.
          const next = defs.slice(this.state.nodeIndex + 1).find((d) => d.type !== 'reward');
          const upcoming = hud(next) ?? (this.state.levelIndex < this.activeDef.levels.length - 1 ? { kind: 'wave' as const, n: 1, of: 3, title: 'next map' } : undefined);
          drawConquestHud(g, {
            map: p.level,
            maps: p.levels,
            mapName: level.name ?? '',
            hud: hud(here),
            reward: here.type === 'reward',
            next: here.type === 'reward' ? upcoming : hud(next),
            nodeTime: this.nodeTime,
            firstOfMap: this.state.nodeIndex === 0,
            boss: here.type === 'boss' ? here.bossId : undefined,
          });
        }
        this.tracker?.draw(g);
        break;
      }
    }
  }
}
