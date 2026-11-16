import { demoBoss, demoBossMotion, demoBossPhased } from './demoBoss';
import { bulwark } from './bulwark';
import { bulwarkComponents } from './bulwarkComponents';
import { bulwarkRooms, bulwarkRoomsMirror } from './bulwarkRooms';
import { bulwarkRegrowth } from './bulwarkRegrowth';
import type { BossDefinition } from './types';

/** All known bosses. [B] in debug cycles through them in this order. */
export const BOSSES: BossDefinition[] = [demoBoss, demoBossPhased, demoBossMotion, bulwark, bulwarkComponents, bulwarkRooms, bulwarkRoomsMirror, bulwarkRegrowth];

/** The boss the game starts on (and restarts on after a page load). */
export const DEFAULT_BOSS_ID = 'bulwark-rooms';
export type { BossDefinition, PhaseDefinition, PhaseTrigger, EnrageCue } from './types';
