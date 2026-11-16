import { demoBoss, demoBossMotion, demoBossPhased } from './demoBoss';
import { bulwark } from './bulwark';
import type { BossDefinition } from './types';

/** All known bosses. The first is the default; [B] in debug cycles through them. */
export const BOSSES: BossDefinition[] = [demoBoss, demoBossPhased, demoBossMotion, bulwark];
export type { BossDefinition, PhaseDefinition, PhaseTrigger, EnrageCue } from './types';
