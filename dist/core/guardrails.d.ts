import { CommandTier } from '../types.js';
export interface GuardrailCheck {
    tier: CommandTier;
    reason: string;
    blocked: boolean;
    requiredConfirmationToken?: string;
}
export declare class MatlockGuardrails {
    /**
     * Classify command into Tier 1 (Safe), Tier 2 (Mutating), or Tier 3 (Destructive)
     */
    static evaluate(command: string, confirmDangerToken?: boolean): GuardrailCheck;
    /**
     * Generates safe dry-run recommendation if a command looks ambiguous
     */
    static sanitizeEnvironment(): Record<string, string>;
}
