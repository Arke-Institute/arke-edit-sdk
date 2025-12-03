import { T as TextDiff, C as ComponentDiff, a as Correction, R as RegeneratableComponent, E as EntityContext, b as CascadeContext } from './sdk-C_FOkQmV.mjs';
export { c as ArkeClient, e as ArkeClientConfig, w as ArkeEditError, A as ArkeEditSDK, y as CASConflictError, v as ChangeSummary, l as CustomPrompts, D as DiffType, f as EditMode, s as EditPhase, r as EditResult, k as EditScope, d as EditSession, g as EditSessionConfig, t as EditStatus, h as Entity, x as EntityNotFoundError, i as EntityUpdate, j as EntityVersion, u as PollOptions, P as PromptTarget, z as ReprocessError, o as ReprocessPhase, p as ReprocessProgress, m as ReprocessRequest, n as ReprocessResult, q as ReprocessStatus, S as SaveResult, V as ValidationError } from './sdk-C_FOkQmV.mjs';

/**
 * DiffEngine - Text comparison and diff formatting
 */

declare class DiffEngine {
    /**
     * Compute diff between two strings
     */
    static diff(original: string, modified: string): TextDiff[];
    /**
     * Compute word-level diff for more granular changes
     */
    static diffWords(original: string, modified: string): TextDiff[];
    /**
     * Create a ComponentDiff from original and modified content
     */
    static createComponentDiff(componentName: string, original: string, modified: string): ComponentDiff;
    /**
     * Format diffs for AI prompt consumption
     */
    static formatForPrompt(diffs: TextDiff[]): string;
    /**
     * Format component diffs for AI prompt
     */
    static formatComponentDiffsForPrompt(componentDiffs: ComponentDiff[]): string;
    /**
     * Create a unified diff view
     */
    static unifiedDiff(original: string, modified: string, options?: {
        filename?: string;
        context?: number;
    }): string;
    /**
     * Extract corrections from diffs (specific text replacements)
     */
    static extractCorrections(original: string, modified: string, sourceFile?: string): Correction[];
    /**
     * Check if two strings are meaningfully different
     * (ignoring whitespace differences)
     */
    static hasSignificantChanges(original: string, modified: string): boolean;
}

/**
 * PromptBuilder - Context-aware AI prompt construction
 */

declare class PromptBuilder {
    /**
     * Build prompt for AI-first mode (user provides instructions)
     */
    static buildAIPrompt(userPrompt: string, component: RegeneratableComponent, entityContext: EntityContext, currentContent?: string): string;
    /**
     * Build prompt incorporating manual edits and diffs
     */
    static buildEditReviewPrompt(componentDiffs: ComponentDiff[], corrections: Correction[], component: RegeneratableComponent, userInstructions?: string): string;
    /**
     * Build cascade-aware prompt additions
     */
    static buildCascadePrompt(basePrompt: string, cascadeContext: CascadeContext): string;
    /**
     * Build a general prompt combining multiple instructions
     */
    static buildCombinedPrompt(generalPrompt: string | undefined, componentPrompt: string | undefined, component: RegeneratableComponent): string;
    /**
     * Build prompt for correction-based updates
     */
    static buildCorrectionPrompt(corrections: Correction[]): string;
    /**
     * Get component-specific regeneration guidance
     */
    static getComponentGuidance(component: RegeneratableComponent): string;
}

export { CascadeContext, ComponentDiff, Correction, DiffEngine, EntityContext, PromptBuilder, RegeneratableComponent, TextDiff };
