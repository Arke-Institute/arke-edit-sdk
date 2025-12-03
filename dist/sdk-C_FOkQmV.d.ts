/**
 * Arke Edit SDK - Type Definitions
 */
interface ArkeClientConfig {
    ipfsWrapperUrl: string;
    reprocessApiUrl: string;
    authToken?: string;
    /**
     * Optional function to transform status URLs before fetching.
     * Use this to proxy status requests through your own server to avoid CORS issues.
     * @example
     * statusUrlTransform: (url) => url.replace('https://orchestrator.arke.institute', '/api/orchestrator')
     */
    statusUrlTransform?: (url: string) => string;
}
type EditMode = 'ai-prompt' | 'manual-with-review' | 'manual-only';
interface EditSessionConfig {
    mode: EditMode;
    aiReviewEnabled?: boolean;
}
interface Entity {
    pi: string;
    ver: number;
    ts: string;
    manifest_cid: string;
    components: Record<string, string>;
    children_pi: string[];
    parent_pi?: string;
    note?: string;
}
interface EntityUpdate {
    expect_tip: string;
    components?: Record<string, string>;
    components_remove?: string[];
    note: string;
}
interface EntityVersion {
    pi: string;
    tip: string;
    ver: number;
}
type RegeneratableComponent = 'pinax' | 'description' | 'cheimarros';
interface EditScope {
    components: RegeneratableComponent[];
    cascade: boolean;
    stopAtPi?: string;
}
interface Correction {
    original: string;
    corrected: string;
    sourceFile?: string;
    context?: string;
}
type DiffType = 'addition' | 'deletion' | 'change' | 'unchanged';
interface TextDiff {
    type: DiffType;
    original?: string;
    modified?: string;
    lineNumber?: number;
    context?: string;
}
interface ComponentDiff {
    componentName: string;
    diffs: TextDiff[];
    summary: string;
    hasChanges: boolean;
}
type PromptTarget = RegeneratableComponent | 'general' | 'reorganization';
interface EntityContext {
    pi: string;
    ver: number;
    parentPi?: string;
    childrenCount: number;
    currentContent: Record<string, string>;
}
interface CascadeContext {
    path: string[];
    depth: number;
    stopAtPi?: string;
}
interface CustomPrompts {
    general?: string;
    pinax?: string;
    description?: string;
    cheimarros?: string;
    reorganization?: string;
}
interface ReprocessRequest {
    pi: string;
    phases: RegeneratableComponent[];
    cascade: boolean;
    options?: {
        stop_at_pi?: string;
        custom_prompts?: CustomPrompts;
        custom_note?: string;
    };
}
interface ReprocessResult {
    batch_id: string;
    entities_queued: number;
    entity_pis: string[];
    status_url: string;
}
type ReprocessPhase = 'QUEUED' | 'DISCOVERY' | 'OCR_IN_PROGRESS' | 'REORGANIZATION' | 'PINAX_EXTRACTION' | 'CHEIMARROS_EXTRACTION' | 'DESCRIPTION' | 'DONE' | 'ERROR';
interface ReprocessProgress {
    directories_total: number;
    directories_pinax_complete: number;
    directories_cheimarros_complete: number;
    directories_description_complete: number;
}
interface ReprocessStatus {
    batch_id: string;
    status: ReprocessPhase;
    progress: ReprocessProgress;
    root_pi?: string;
    error?: string;
    started_at?: string;
    completed_at?: string;
}
interface SaveResult {
    pi: string;
    newVersion: number;
    newTip: string;
}
interface EditResult {
    saved?: SaveResult;
    reprocess?: ReprocessResult;
}
type EditPhase = 'idle' | 'saving' | 'reprocessing' | 'complete' | 'error';
interface EditStatus {
    phase: EditPhase;
    saveComplete: boolean;
    reprocessStatus?: ReprocessStatus;
    error?: string;
}
interface PollOptions {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (status: EditStatus) => void;
}
interface ChangeSummary {
    mode: EditMode;
    hasManualEdits: boolean;
    editedComponents: string[];
    corrections: Correction[];
    prompts: Record<string, string>;
    scope: EditScope;
    willRegenerate: RegeneratableComponent[];
    willCascade: boolean;
    willSave: boolean;
    willReprocess: boolean;
}
declare class ArkeEditError extends Error {
    code: string;
    details?: unknown | undefined;
    constructor(message: string, code: string, details?: unknown | undefined);
}
declare class EntityNotFoundError extends ArkeEditError {
    constructor(pi: string);
}
declare class CASConflictError extends ArkeEditError {
    constructor(pi: string, expectedTip: string, actualTip: string);
}
declare class ReprocessError extends ArkeEditError {
    constructor(message: string, batchId?: string);
}
declare class ValidationError extends ArkeEditError {
    constructor(message: string, field?: string);
}

/**
 * ArkeClient - Low-level API client for Arke services
 */

declare class ArkeClient {
    private ipfsWrapperUrl;
    private reprocessApiUrl;
    private authToken?;
    private statusUrlTransform?;
    constructor(config: ArkeClientConfig);
    /**
     * Sleep for a given number of milliseconds
     */
    private sleep;
    /**
     * Execute a fetch with exponential backoff retry on transient errors
     */
    private fetchWithRetry;
    private getHeaders;
    /**
     * Fetch an entity by PI
     */
    getEntity(pi: string): Promise<Entity>;
    /**
     * Fetch content by CID
     */
    getContent(cid: string): Promise<string>;
    /**
     * Upload content and get CID
     */
    uploadContent(content: string, filename: string): Promise<string>;
    /**
     * Update an entity with new components
     */
    updateEntity(pi: string, update: EntityUpdate): Promise<EntityVersion>;
    /**
     * Trigger reprocessing for an entity
     */
    reprocess(request: ReprocessRequest): Promise<ReprocessResult>;
    /**
     * Get reprocessing status by batch ID
     *
     * Uses exponential backoff retry to handle transient 500 errors
     * that occur when the orchestrator is initializing.
     *
     * @param statusUrl - The status URL returned from reprocess()
     * @param isFirstPoll - If true, uses a longer initial delay (orchestrator warmup)
     */
    getReprocessStatus(statusUrl: string, isFirstPoll?: boolean): Promise<ReprocessStatus>;
}

/**
 * EditSession - Stateful session managing an edit workflow
 */

declare class EditSession {
    readonly pi: string;
    readonly mode: EditMode;
    readonly aiReviewEnabled: boolean;
    private client;
    private entity;
    private loadedComponents;
    private prompts;
    private editedContent;
    private corrections;
    private scope;
    private submitting;
    private result;
    private statusUrl;
    constructor(client: ArkeClient, pi: string, config?: EditSessionConfig);
    /**
     * Load the entity and its key components
     */
    load(): Promise<void>;
    /**
     * Load a specific component on demand
     */
    loadComponent(name: string): Promise<string | undefined>;
    /**
     * Get the loaded entity
     */
    getEntity(): Entity;
    /**
     * Get loaded component content
     */
    getComponents(): Record<string, string>;
    /**
     * Set a prompt for AI regeneration
     */
    setPrompt(target: PromptTarget, prompt: string): void;
    /**
     * Get all prompts
     */
    getPrompts(): Record<string, string>;
    /**
     * Clear a prompt
     */
    clearPrompt(target: PromptTarget): void;
    /**
     * Set edited content for a component
     */
    setContent(componentName: string, content: string): void;
    /**
     * Get all edited content
     */
    getEditedContent(): Record<string, string>;
    /**
     * Clear edited content for a component
     */
    clearContent(componentName: string): void;
    /**
     * Add a correction (for OCR fixes, etc.)
     */
    addCorrection(original: string, corrected: string, sourceFile?: string): void;
    /**
     * Get all corrections
     */
    getCorrections(): Correction[];
    /**
     * Clear corrections
     */
    clearCorrections(): void;
    /**
     * Set the edit scope
     */
    setScope(scope: Partial<EditScope>): void;
    /**
     * Get the current scope
     */
    getScope(): EditScope;
    /**
     * Get diffs for manual changes
     */
    getDiff(): ComponentDiff[];
    /**
     * Preview what prompts will be sent to AI
     */
    previewPrompt(): Record<RegeneratableComponent, string>;
    /**
     * Get a summary of pending changes
     */
    getChangeSummary(): ChangeSummary;
    /**
     * Submit changes (saves first if manual edits, then reprocesses)
     */
    submit(note: string): Promise<EditResult>;
    /**
     * Wait for reprocessing to complete
     */
    waitForCompletion(options?: PollOptions): Promise<EditStatus>;
    /**
     * Get current status without waiting
     */
    getStatus(): Promise<EditStatus>;
    private buildCustomPrompts;
}

/**
 * ArkeEditSDK - Factory class for creating edit sessions
 */

declare class ArkeEditSDK {
    private client;
    constructor(config: ArkeClientConfig);
    /**
     * Create a new edit session for an entity
     *
     * @param pi - The entity PI to edit
     * @param config - Optional session configuration
     * @returns A new EditSession instance
     */
    createSession(pi: string, config?: EditSessionConfig): EditSession;
    /**
     * Get the underlying API client (for advanced usage)
     */
    getClient(): ArkeClient;
}

export { ArkeEditSDK as A, type ComponentDiff as C, type DiffType as D, type EntityContext as E, type PromptTarget as P, type RegeneratableComponent as R, type SaveResult as S, type TextDiff as T, ValidationError as V, type Correction as a, type CascadeContext as b, ArkeClient as c, EditSession as d, type ArkeClientConfig as e, type EditMode as f, type EditSessionConfig as g, type Entity as h, type EntityUpdate as i, type EntityVersion as j, type EditScope as k, type CustomPrompts as l, type ReprocessRequest as m, type ReprocessResult as n, type ReprocessPhase as o, type ReprocessProgress as p, type ReprocessStatus as q, type EditResult as r, type EditPhase as s, type EditStatus as t, type PollOptions as u, type ChangeSummary as v, ArkeEditError as w, EntityNotFoundError as x, CASConflictError as y, ReprocessError as z };
