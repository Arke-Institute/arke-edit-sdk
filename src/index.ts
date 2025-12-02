/**
 * Arke Edit SDK
 *
 * Modular SDK for intelligent editing of Arke archive entities
 * with AI-powered regeneration.
 */

// Main SDK class
export { ArkeEditSDK } from './sdk';

// Core classes
export { ArkeClient } from './client';
export { EditSession } from './session';
export { DiffEngine } from './diff';
export { PromptBuilder } from './prompts';

// Types
export type {
  // Configuration
  ArkeClientConfig,
  EditMode,
  EditSessionConfig,
  // Entity
  Entity,
  EntityUpdate,
  EntityVersion,
  // Edit
  RegeneratableComponent,
  EditScope,
  Correction,
  // Diff
  DiffType,
  TextDiff,
  ComponentDiff,
  // Prompt
  PromptTarget,
  EntityContext,
  CascadeContext,
  CustomPrompts,
  // Reprocess
  ReprocessRequest,
  ReprocessResult,
  ReprocessPhase,
  ReprocessProgress,
  ReprocessStatus,
  // Result
  SaveResult,
  EditResult,
  EditPhase,
  EditStatus,
  PollOptions,
  ChangeSummary,
} from './types';

// Errors
export {
  ArkeEditError,
  EntityNotFoundError,
  CASConflictError,
  ReprocessError,
  ValidationError,
} from './types';
