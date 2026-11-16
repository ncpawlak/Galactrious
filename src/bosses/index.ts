import { demoBoss, demoBossMotion, demoBossPhased } from './demoBoss';
import type { BossDefinition } from './types';

/** All known bosses. The first is the default; [B] in debug cycles through them. */
export const BOSSES: BossDefinition[] = [demoBoss, demoBossPhased, demoBossMotion];
export type { BossDefinition, PhaseDefinition, PhaseTrigger } from './types';
