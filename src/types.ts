/**
 * Arke Edit SDK - Type Definitions
 */

// ============================================================================
// Configuration
// ============================================================================

export interface ArkeClientConfig {
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

export type EditMode = 'ai-prompt' | 'manual-with-review' | 'manual-only';

export interface EditSessionConfig {
  mode: EditMode;
  aiReviewEnabled?: boolean; // Default: true for manual modes
}

// ============================================================================
// Entity Types
// ============================================================================

export interface Entity {
  pi: string;
  ver: number;
  ts: string;
  manifest_cid: string;
  components: Record<string, string>; // component name -> CID
  children_pi: string[];
  parent_pi?: string;
  note?: string;
}

export interface EntityUpdate {
  expect_tip: string; // CAS check - current manifest_cid
  components?: Record<string, string>; // name -> CID (new/modified)
  components_remove?: string[]; // component names to remove
  note: string;
}

export interface EntityVersion {
  pi: string;
  tip: string; // new manifest_cid
  ver: number;
}

// ============================================================================
// Edit Types
// ============================================================================

export type RegeneratableComponent = 'pinax' | 'description' | 'cheimarros';

export interface EditScope {
  components: RegeneratableComponent[]; // Which components to regenerate
  cascade: boolean; // Propagate changes up the tree?
  stopAtPi?: string; // Stop cascade at this ancestor PI
}

export interface Correction {
  original: string;
  corrected: string;
  sourceFile?: string;
  context?: string; // Surrounding text for context
}

// ============================================================================
// Diff Types
// ============================================================================

export type DiffType = 'addition' | 'deletion' | 'change' | 'unchanged';

export interface TextDiff {
  type: DiffType;
  original?: string;
  modified?: string;
  lineNumber?: number;
  context?: string;
}

export interface ComponentDiff {
  componentName: string;
  diffs: TextDiff[];
  summary: string; // Human-readable summary
  hasChanges: boolean;
}

// ============================================================================
// Prompt Types
// ============================================================================

export type PromptTarget = RegeneratableComponent | 'general' | 'reorganization';

export interface EntityContext {
  pi: string;
  ver: number;
  parentPi?: string;
  childrenCount: number;
  currentContent: Record<string, string>;
}

export interface CascadeContext {
  path: string[]; // PIs from current to root
  depth: number;
  stopAtPi?: string;
}

// ============================================================================
// Reprocess Types
// ============================================================================

export interface CustomPrompts {
  general?: string;
  pinax?: string;
  description?: string;
  cheimarros?: string;
  reorganization?: string;
}

export interface ReprocessRequest {
  pi: string;
  phases: RegeneratableComponent[];
  cascade: boolean;
  options?: {
    stop_at_pi?: string;
    custom_prompts?: CustomPrompts;
    custom_note?: string;  // Custom version note (overrides default phase notes)
  };
}

export interface ReprocessResult {
  batch_id: string;
  entities_queued: number;
  entity_pis: string[];
  status_url: string;
}

export type ReprocessPhase =
  | 'QUEUED'
  | 'DISCOVERY'
  | 'OCR_IN_PROGRESS'
  | 'REORGANIZATION'
  | 'PINAX_EXTRACTION'
  | 'CHEIMARROS_EXTRACTION'
  | 'DESCRIPTION'
  | 'DONE'
  | 'ERROR';

export interface ReprocessProgress {
  directories_total: number;
  directories_pinax_complete: number;
  directories_cheimarros_complete: number;
  directories_description_complete: number;
}

export interface ReprocessStatus {
  batch_id: string;
  status: ReprocessPhase;
  progress: ReprocessProgress;
  root_pi?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

// ============================================================================
// Result Types
// ============================================================================

export interface SaveResult {
  pi: string;
  newVersion: number;
  newTip: string;
}

export interface EditResult {
  // Phase 1: Save results (if manual edits were made)
  saved?: SaveResult;

  // Phase 2: Reprocess results (if regeneration requested)
  reprocess?: ReprocessResult;
}

export type EditPhase = 'idle' | 'saving' | 'reprocessing' | 'complete' | 'error';

export interface EditStatus {
  phase: EditPhase;
  saveComplete: boolean;
  reprocessStatus?: ReprocessStatus;
  error?: string;
}

export interface PollOptions {
  intervalMs?: number; // Default: 2000
  timeoutMs?: number; // Default: 300000 (5 min)
  onProgress?: (status: EditStatus) => void;
}

// ============================================================================
// Change Summary
// ============================================================================

export interface ChangeSummary {
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

// ============================================================================
// Errors
// ============================================================================

export class ArkeEditError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ArkeEditError';
  }
}

export class EntityNotFoundError extends ArkeEditError {
  constructor(pi: string) {
    super(`Entity not found: ${pi}`, 'ENTITY_NOT_FOUND', { pi });
    this.name = 'EntityNotFoundError';
  }
}

export class CASConflictError extends ArkeEditError {
  constructor(pi: string, expectedTip: string, actualTip: string) {
    super(
      `CAS conflict: entity ${pi} was modified (expected ${expectedTip}, got ${actualTip})`,
      'CAS_CONFLICT',
      { pi, expectedTip, actualTip }
    );
    this.name = 'CASConflictError';
  }
}

export class ReprocessError extends ArkeEditError {
  constructor(message: string, batchId?: string) {
    super(message, 'REPROCESS_ERROR', { batchId });
    this.name = 'ReprocessError';
  }
}

export class ValidationError extends ArkeEditError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', { field });
    this.name = 'ValidationError';
  }
}
