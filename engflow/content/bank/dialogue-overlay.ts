import type { DialogueTurn } from "../../core/types";
import { OVERLAY_SENTENCES } from "./overlay-sentences";
import { OVERLAY_PHRASES } from "./overlay-phrases";

/**
 * Conversation context for questions written before dialogue support:
 * question id → the lines spoken just before the learner's turn.
 */
export const DIALOGUE_OVERLAY: Record<string, DialogueTurn[]> = { ...OVERLAY_SENTENCES, ...OVERLAY_PHRASES };
