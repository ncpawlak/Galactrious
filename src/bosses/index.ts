import { demoBoss, demoBossMotion, demoBossPhased } from './demoBoss';
import { bulwark } from './bulwark';
import { bulwarkComponents } from './bulwarkComponents';
import { bulwarkRooms, bulwarkRoomsMirror } from './bulwarkRooms';
import { bulwarkRegrowth } from './bulwarkRegrowth';
import { capitalShip, capitalShipCarvable } from './capitalShip';
import { capitalShipConquest } from './capitalShipConquest';
import { capitalShipFinale } from './capitalShipFinale';
import { mantis } from './mantis';
import { roomLab } from './roomLab';
import type { BossDefinition } from './types';

/** All known bosses. [B] in debug cycles through them in this order. */
export const BOSSES: BossDefinition[] = [demoBoss, demoBossPhased, demoBossMotion, bulwark, bulwarkComponents, bulwarkRooms, bulwarkRoomsMirror, bulwarkRegrowth, mantis, roomLab, capitalShip, capitalShipCarvable, capitalShipFinale, capitalShipConquest];

/** The boss the game starts on (and restarts on after a page load). */
export const DEFAULT_BOSS_ID = 'bulwark-rooms';
export { CAPITAL_SHIP_CARVABLE_ID, CAPITAL_SHIP_ID, ENGINE_ROOM_ID } from './capitalShip';
export type { BossDefinition, PhaseDefinition, PhaseTrigger, EnrageCue } from './types';
