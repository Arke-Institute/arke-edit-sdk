# Arke Edit SDK - Implementation Plan

## Overview

The Arke Edit SDK is a modular TypeScript library that provides intelligent editing capabilities for Arke entities. It bridges the gap between direct content editing and AI-powered regeneration, enabling seamless workflows for updating archive content with automatic propagation through the entity hierarchy.

---

## Design Philosophy

### AI-First Approach

The SDK is designed with AI as the primary editing interface:

1. **AI Prompt Mode** (Primary) - User describes what they want changed, AI regenerates content
2. **Manual Edit + AI Review** (Secondary) - User edits text directly, AI reviews and updates related content

This inverts the traditional "edit first, maybe AI later" pattern to "AI first, manual override available."

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              arke-edit-sdk                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │ EditSession │───▶│  DiffEngine │───▶│PromptBuilder│                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│         │                                      │                        │
│         │                                      ▼                        │
│         │           ┌─────────────────────────────────────┐            │
│         │           │           ArkeClient                 │            │
│         │           │  ┌───────────┐    ┌───────────────┐ │            │
│         └──────────▶│  │IPFSWrapper│    │ ReprocessAPI  │ │            │
│                     │  │  Client   │    │    Client     │ │            │
│                     │  └───────────┘    └───────────────┘ │            │
│                     └─────────────────────────────────────┘            │
│                                    │                                    │
└────────────────────────────────────│────────────────────────────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │        External Services        │
                    │  ┌──────────┐  ┌─────────────┐ │
                    │  │   IPFS   │  │  Reprocess  │ │
                    │  │  Wrapper │  │     API     │ │
                    │  └──────────┘  └─────────────┘ │
                    └────────────────────────────────┘
```

---

## Core Components

### 1. ArkeClient (`src/client.ts`)

Low-level API client for communicating with Arke services.

```typescript
interface ArkeClientConfig {
  ipfsWrapperUrl: string;    // e.g., "https://ipfs-api.arke.institute"
  reprocessApiUrl: string;   // e.g., "https://reprocess-api.arke.institute"
  authToken?: string;        // Optional auth
}

class ArkeClient {
  constructor(config: ArkeClientConfig);

  // IPFS Wrapper operations
  async getEntity(pi: string): Promise<Entity>;
  async getEntityContent(pi: string, component: string): Promise<string>;
  async updateEntity(pi: string, updates: EntityUpdate): Promise<EntityVersion>;
  async uploadContent(content: string, filename: string): Promise<string>; // Returns CID

  // Reprocess API operations
  async reprocess(request: ReprocessRequest): Promise<ReprocessResult>;
  async getReprocessStatus(batchId: string): Promise<ReprocessStatus>;
}
```

### 2. EditSession (`src/session.ts`)

The main user-facing class for managing edit workflows.

```typescript
type EditMode = 'ai-prompt' | 'manual-with-review' | 'manual-only';

interface EditSessionConfig {
  mode: EditMode;
  aiReviewEnabled?: boolean;  // Default: true for manual modes
}

interface EditScope {
  components: RegeneratableComponent[];  // Which to regenerate
  cascade: boolean;                       // Propagate up tree?
  stopAtPi?: string;                      // Stop cascade at ancestor
}

type RegeneratableComponent = 'pinax' | 'description' | 'cheimarros';

class EditSession {
  readonly pi: string;
  readonly mode: EditMode;

  constructor(client: ArkeClient, pi: string, config?: EditSessionConfig);

  // Load current entity state
  async load(): Promise<void>;
  get entity(): Entity;
  get components(): Record<string, string>;  // component name -> content

  // === AI Prompt Mode ===

  // Set prompts for AI regeneration
  setPrompt(target: RegeneratableComponent | 'general', prompt: string): void;
  getPrompts(): Record<string, string>;

  // === Manual Edit Mode ===

  // Direct content changes
  setContent(componentName: string, content: string): void;
  getEditedContent(): Record<string, string>;

  // Corrections (for OCR fixes etc)
  addCorrection(original: string, corrected: string, sourceFile?: string): void;
  getCorrections(): Correction[];

  // === Scope Configuration ===

  setScope(scope: EditScope): void;
  getScope(): EditScope;

  // === Review & Preview ===

  // Get diff of manual changes
  getDiff(): ComponentDiff[];

  // Preview what the AI prompt will look like
  previewPrompt(): Record<RegeneratableComponent, string>;

  // Summary of all pending changes
  getChangeSummary(): ChangeSummary;

  // === Execution ===

  // Submit changes (saves first if manual edits, then reprocesses)
  async submit(note: string): Promise<EditResult>;

  // Poll for completion
  async waitForCompletion(options?: PollOptions): Promise<EditStatus>;

  // Cancel (if possible)
  async cancel(): Promise<void>;
}
```

### 3. DiffEngine (`src/diff.ts`)

Computes and formats diffs between original and edited content.

```typescript
interface TextDiff {
  type: 'addition' | 'deletion' | 'change';
  original?: string;
  modified?: string;
  lineNumber?: number;
  context?: string;  // Surrounding text for context
}

interface ComponentDiff {
  componentName: string;
  diffs: TextDiff[];
  summary: string;  // Human-readable summary
}

class DiffEngine {
  // Compute diff between two strings
  static diff(original: string, modified: string): TextDiff[];

  // Format diffs for AI prompt consumption
  static formatForPrompt(diffs: TextDiff[]): string;

  // Create a unified diff view
  static unifiedDiff(original: string, modified: string): string;

  // Extract corrections (specific text replacements)
  static extractCorrections(diffs: TextDiff[]): Correction[];
}
```

### 4. PromptBuilder (`src/prompts.ts`)

Constructs context-aware prompts for AI regeneration.

```typescript
class PromptBuilder {
  // Build prompt for AI-first mode
  static buildAIPrompt(
    userPrompt: string,
    component: RegeneratableComponent,
    entityContext: EntityContext
  ): string;

  // Build prompt incorporating manual edits
  static buildEditReviewPrompt(
    diffs: ComponentDiff[],
    corrections: Correction[],
    component: RegeneratableComponent,
    userInstructions?: string
  ): string;

  // Build cascade-aware prompt
  static buildCascadePrompt(
    basePrompt: string,
    cascadeContext: CascadeContext
  ): string;
}
```

---

## Types (`src/types.ts`)

```typescript
// === Entity Types ===

interface Entity {
  pi: string;
  ver: number;
  ts: string;
  manifest_cid: string;
  components: Record<string, string>;  // name -> CID
  children_pi: string[];
  parent_pi?: string;
  note?: string;
}

interface EntityUpdate {
  expect_tip: string;              // CAS check
  components?: Record<string, string>;  // name -> CID (new/modified)
  components_remove?: string[];    // names to remove
  note: string;
}

interface EntityVersion {
  pi: string;
  tip: string;  // new manifest_cid
  ver: number;
}

// === Edit Types ===

interface Correction {
  original: string;
  corrected: string;
  sourceFile?: string;
  context?: string;
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
}

// === Reprocess Types ===

interface ReprocessRequest {
  pi: string;
  phases: RegeneratableComponent[];
  cascade: boolean;
  options?: {
    stop_at_pi?: string;
    custom_prompts?: {
      general?: string;
      pinax?: string;
      description?: string;
      cheimarros?: string;
      reorganization?: string;
    };
  };
}

interface ReprocessResult {
  batch_id: string;
  entities_queued: number;
  entity_pis: string[];
  status_url: string;
}

interface ReprocessStatus {
  batch_id: string;
  status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR';
  progress: {
    total: number;
    completed: number;
    phase: string;
  };
  root_pi?: string;
  error?: string;
}

// === Result Types ===

interface EditResult {
  // Phase 1: Save results (if manual edits)
  saved?: {
    pi: string;
    newVersion: number;
    newTip: string;
  };

  // Phase 2: Reprocess results (if regeneration requested)
  reprocess?: ReprocessResult;
}

interface EditStatus {
  phase: 'saving' | 'reprocessing' | 'complete' | 'error';
  saveComplete: boolean;
  reprocessStatus?: ReprocessStatus;
  error?: string;
}

interface PollOptions {
  intervalMs?: number;      // Default: 2000
  timeoutMs?: number;       // Default: 300000 (5 min)
  onProgress?: (status: EditStatus) => void;
}
```

---

## Workflows

### Workflow 1: AI Prompt Mode (Primary)

User describes what they want, AI regenerates.

```typescript
import { ArkeEditSDK } from 'arke-edit-sdk';

const sdk = new ArkeEditSDK({
  ipfsWrapperUrl: 'https://ipfs-api.arke.institute',
  reprocessApiUrl: 'https://reprocess-api.arke.institute'
});

// Create AI-first session
const session = sdk.createSession('01JC9X7H6M3K8Q', { mode: 'ai-prompt' });
await session.load();

// User provides instructions
session.setPrompt('description',
  'Make the description more accessible for general audiences. ' +
  'Focus on historical significance rather than technical details.'
);

session.setPrompt('pinax',
  'Ensure the institution field reflects the full legal name.'
);

// Configure scope
session.setScope({
  components: ['description', 'pinax'],
  cascade: true  // Update parent entities too
});

// Preview what will happen
console.log(session.getChangeSummary());
console.log(session.previewPrompt());

// Execute
const result = await session.submit('AI-assisted description and metadata update');

// Wait for completion
const status = await session.waitForCompletion({
  onProgress: (s) => console.log(`Phase: ${s.phase}, Progress: ${s.reprocessStatus?.progress}`)
});

console.log('Edit complete!', status);
```

### Workflow 2: Manual Edit + AI Review (Secondary)

User edits text directly, AI updates related content.

```typescript
const session = sdk.createSession('01JC9X7H6M3K8Q', {
  mode: 'manual-with-review',
  aiReviewEnabled: true  // Default
});
await session.load();

// User makes direct text changes
const currentDescription = session.components['description.md'];
const editedDescription = currentDescription.replace(
  'The collection dates from 1895',
  'The collection dates from 1985'  // Correcting an error
);
session.setContent('description.md', editedDescription);

// Optionally add explicit corrections (helps AI understand intent)
session.addCorrection('1895', '1985', 'description.md');

// AI should update PINAX to reflect the date correction
session.setScope({
  components: ['pinax'],  // Regenerate pinax based on corrected description
  cascade: true
});

// Optional: Add instructions for AI review
session.setPrompt('general',
  'The date was corrected from 1895 to 1985. Update all metadata to reflect this.'
);

// Preview diff before submitting
console.log('Changes:', session.getDiff());
console.log('AI Prompt:', session.previewPrompt());

// Submit
const result = await session.submit('Corrected date error (1895 → 1985)');

// result.saved = { pi, newVersion, newTip }  <- Manual changes saved first
// result.reprocess = { batch_id, ... }       <- Then AI regeneration triggered
```

### Workflow 3: Manual Edit Only (AI Review Off)

Traditional editing, no AI involvement.

```typescript
const session = sdk.createSession('01JC9X7H6M3K8Q', {
  mode: 'manual-only'
});
await session.load();

// User edits
session.setContent('description.md', newDescription);
session.setContent('custom-notes.txt', additionalNotes);

// No regeneration, just save
session.setScope({
  components: [],  // Nothing to regenerate
  cascade: false
});

const result = await session.submit('Minor text corrections');
// Only result.saved will be populated
```

---

## Prompt Construction Strategy

### AI Prompt Mode

When user provides direct instructions, the prompt is straightforward:

```
User instruction for {component}:
{user_prompt}

Entity context:
- PI: {pi}
- Current version: {ver}
- Parent: {parent_pi or 'root'}
- Children: {children_count}

Current {component} content for reference:
{current_content}
```

### Manual Edit + AI Review Mode

When user makes text changes, the prompt incorporates diffs:

```
The following manual edits were made to this entity:

## Changes to description.md:
- Line 15: "1895" → "1985" (date correction)
- Line 23: Added paragraph about archival significance

## Corrections identified:
- "1895" was corrected to "1985" (appears to be OCR/transcription error)

## User instructions:
{user_prompt if provided, otherwise: "Update the {component} to accurately reflect these changes."}

Please regenerate the {component} taking into account:
1. The corrections made (ensure metadata reflects corrected information)
2. Any new content added
3. Content that was removed or modified

Current {component} for reference:
{current_content}
```

### Cascade Mode

When cascade is enabled, additional context is provided:

```
This edit is part of a cascading update. After updating this entity,
parent entities will also be updated to reflect these changes.

Ensure the {component} accurately represents the content so parent
aggregations will be correct.

Cascade path: {pi} → {parent_pi} → {grandparent_pi} → ... → root
```

---

## Frontend Integration

### React Hooks (Optional Export)

```typescript
// src/react/useEditSession.ts
import { useState, useCallback } from 'react';
import { ArkeEditSDK, EditSession, EditStatus } from 'arke-edit-sdk';

export function useEditSession(sdk: ArkeEditSDK, pi: string) {
  const [session, setSession] = useState<EditSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<EditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(async (mode: EditMode) => {
    setLoading(true);
    setError(null);
    try {
      const s = sdk.createSession(pi, { mode });
      await s.load();
      setSession(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sdk, pi]);

  const submit = useCallback(async (note: string) => {
    if (!session) return;
    setLoading(true);
    try {
      const result = await session.submit(note);

      // Start polling if reprocessing
      if (result.reprocess) {
        await session.waitForCompletion({
          onProgress: setStatus
        });
      }

      setStatus({ phase: 'complete', saveComplete: true });
    } catch (e) {
      setError(e.message);
      setStatus({ phase: 'error', saveComplete: false, error: e.message });
    } finally {
      setLoading(false);
    }
  }, [session]);

  return {
    session,
    loading,
    status,
    error,
    startSession,
    submit
  };
}
```

### Frontend Component Structure

```
site-explorer/site-frontend/app/[pi]/
├── EditButton.tsx           # Entry point (simplified)
├── edit/
│   ├── EditModal.tsx        # Main modal container
│   ├── ModeSelector.tsx     # AI Prompt vs Manual+Review vs Manual Only
│   ├── AIPromptEditor.tsx   # AI-first editing UI
│   ├── ManualEditor.tsx     # Direct text editing (existing, refactored)
│   ├── ScopeSelector.tsx    # Components to regenerate + cascade toggle
│   ├── DiffPreview.tsx      # Show changes before submit
│   ├── PromptPreview.tsx    # Show what AI will receive
│   ├── StatusTracker.tsx    # Poll and display progress
│   └── lib/
│       └── sdk.ts           # SDK singleton/provider
```

---

## Updated Frontend UI Design

### Edit Modal - Mode Selection (Default View)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Edit Entity                                                       [✕]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   How would you like to edit this entity?                              │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  ★ AI PROMPT                                          [SELECT]  │  │
│   │                                                                  │  │
│   │  Describe what you want changed and AI will regenerate          │  │
│   │  the content. Best for: tone changes, summarization,            │  │
│   │  reformatting, adding context.                                  │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │    MANUAL EDIT + AI REVIEW                            [SELECT]  │  │
│   │                                                                  │  │
│   │  Edit text directly, then AI updates related content.          │  │
│   │  Best for: fixing errors, corrections, specific changes.        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │    MANUAL ONLY                                        [SELECT]  │  │
│   │                                                                  │  │
│   │  Edit text directly with no AI involvement.                     │  │
│   │  Best for: simple fixes, adding notes, non-AI content.          │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### AI Prompt Mode

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AI Prompt Edit                                          [← Back]  [✕]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  What would you like to change?                                        │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ▼ General Instructions (applies to all)                          │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │                                                                   │ │
│  │ Make the content more accessible for general audiences.          │ │
│  │ Focus on historical significance.                                │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ▶ Description-specific instructions (optional)            [Add]  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ▶ Metadata-specific instructions (optional)               [Add]  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Regenerate:   ☑ Description   ☑ Metadata (PINAX)   ☐ Knowledge Graph │
│                                                                         │
│  ☑ Cascade changes to parent entities                                  │
│    └─ Stop at: [Root ▾]                                                │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Change note: [AI-assisted content update___________________________]  │
│                                                                         │
│                                         [Preview] [Cancel] [Submit]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Manual Edit + AI Review Mode

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Manual Edit + AI Review                                 [← Back]  [✕]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Components ─────────────────────────────────────────────────────┐  │
│  │ ★ description.md                                      [Edited]  │  │
│  │   pinax.json                                                     │  │
│  │   cheimarros.json                                                │  │
│  │   meeting-notes.txt                                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ description.md                                    [View Diff ▾]  │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ This archive contains materials from the Smith Foundation,       │ │
│  │ dating from 1985 to present. The collection includes...          │ │
│  │                                                        ▼         │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ AI Review ──────────────────────────────────────────────────────┐  │
│  │ ☑ Enabled                                                        │  │
│  │                                                                   │  │
│  │ After saving, regenerate:                                        │  │
│  │ ☑ Metadata (PINAX)   ☐ Knowledge Graph   ☐ Description          │  │
│  │                                                                   │  │
│  │ Instructions for AI (optional):                                  │  │
│  │ ┌─────────────────────────────────────────────────────────────┐  │  │
│  │ │ I corrected the date from 1895 to 1985. Please update      │  │  │
│  │ │ the metadata to reflect this correction.                    │  │  │
│  │ └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │ ☑ Cascade to parent entities                                     │  │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Change note: [Corrected date error (1895 → 1985)__________________]   │
│                                                                         │
│                                         [Preview] [Cancel] [Submit]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Preview Modal (Before Submit)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Preview Changes                                                   [✕]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Step 1: Save Changes ───────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │  Modified components:                                            │  │
│  │  • description.md                                                │  │
│  │                                                                   │  │
│  │  Diff:                                                           │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │ - dating from 1895 to present.                              │ │  │
│  │  │ + dating from 1985 to present.                              │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ Step 2: AI Regeneration ────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │  Components to regenerate:                                       │  │
│  │  • pinax.json (metadata)                                         │  │
│  │                                                                   │  │
│  │  Cascade: Yes (will update parent entities)                      │  │
│  │                                                                   │  │
│  │  AI Prompt:                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │ The following manual edits were made:                       │ │  │
│  │  │                                                             │ │  │
│  │  │ ## Changes to description.md:                               │ │  │
│  │  │ - "1895" → "1985" (date correction)                         │ │  │
│  │  │                                                             │ │  │
│  │  │ User instructions:                                          │ │  │
│  │  │ I corrected the date from 1895 to 1985. Please update...   │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│                                                  [← Edit] [Confirm]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Processing Status

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Processing Edit                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                                                                   │ │
│  │   ✓ Saving changes                              Complete         │ │
│  │     └─ Entity updated to v5                                      │ │
│  │                                                                   │ │
│  │   ◐ Regenerating content                        In Progress      │ │
│  │     └─ Processing: pinax extraction                              │ │
│  │     └─ Entities: 3 of 5 complete                                 │ │
│  │                                                                   │ │
│  │   ○ Cascade updates                             Pending          │ │
│  │                                                                   │ │
│  │   ═══════════════════════════════════▓▓▓▓▓░░░░░  60%            │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Batch ID: reprocess_01JD7X...                                         │
│  Started: 2 minutes ago                                                │
│                                                                         │
│                                              [Run in Background]       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
arke-edit-sdk/
├── src/
│   ├── index.ts              # Main exports
│   ├── sdk.ts                # ArkeEditSDK class (factory)
│   ├── client.ts             # ArkeClient (API communication)
│   ├── session.ts            # EditSession class
│   ├── diff.ts               # DiffEngine
│   ├── prompts.ts            # PromptBuilder
│   ├── types.ts              # TypeScript interfaces
│   └── react/                # Optional React integration
│       ├── index.ts
│       ├── useEditSession.ts
│       └── EditContext.tsx
├── tests/
│   ├── session.test.ts
│   ├── diff.test.ts
│   ├── prompts.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
├── README.md
├── IMPLEMENTATION_PLAN.md    # This file
└── CLAUDE.md                 # Development instructions
```

---

## Implementation Phases

### Phase 1: Core SDK (Week 1)

**Files to create:**
- `src/types.ts` - All TypeScript interfaces
- `src/client.ts` - ArkeClient with IPFS wrapper + reprocess API
- `src/diff.ts` - DiffEngine for text comparison
- `src/prompts.ts` - PromptBuilder for AI prompts
- `src/session.ts` - EditSession main class
- `src/sdk.ts` - ArkeEditSDK factory
- `src/index.ts` - Public exports

**Deliverables:**
- [ ] Type definitions complete
- [ ] ArkeClient can fetch entities and submit updates
- [ ] ArkeClient can call reprocess API and poll status
- [ ] DiffEngine computes meaningful text diffs
- [ ] PromptBuilder creates context-aware prompts
- [ ] EditSession manages full workflow
- [ ] Unit tests for core functionality

### Phase 2: Frontend Integration (Week 2)

**Files to modify in site-frontend:**
- Refactor `EditButton.tsx` - Simplified entry point
- Create `edit/` directory with new components
- Remove or repurpose `EntityEditor.tsx` and `EntityEditorLazy.tsx`

**New frontend files:**
- `edit/EditModal.tsx` - Main container
- `edit/ModeSelector.tsx` - Edit mode selection
- `edit/AIPromptEditor.tsx` - AI-first editing UI
- `edit/ManualEditor.tsx` - Text editing (refactored from existing)
- `edit/ScopeSelector.tsx` - Regeneration + cascade options
- `edit/DiffPreview.tsx` - Show pending changes
- `edit/StatusTracker.tsx` - Processing progress
- `edit/lib/sdk.ts` - SDK configuration

**Deliverables:**
- [ ] Mode selection UI working
- [ ] AI Prompt mode fully functional
- [ ] Manual Edit + AI Review mode functional
- [ ] Manual Only mode functional (backward compatible)
- [ ] Preview modal showing diffs and prompts
- [ ] Status tracking during processing
- [ ] Error handling and recovery

### Phase 3: Polish & CLI (Week 3)

**SDK enhancements:**
- React hooks export (`src/react/`)
- Better error messages
- Retry logic improvements
- Documentation

**CLI tool (optional, new files):**
- `cli/index.ts` - CLI entry point
- `cli/commands/edit.ts` - Edit command
- `cli/commands/status.ts` - Check status

**Deliverables:**
- [ ] React hooks documented and tested
- [ ] CLI basic functionality
- [ ] README with examples
- [ ] Integration tests with real APIs

---

## Dependencies

```json
{
  "name": "arke-edit-sdk",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "dependencies": {
    "diff": "^5.1.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "@types/diff": "^5.0.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  }
}
```

---

## Testing Strategy

### Unit Tests

- **DiffEngine**: Various text change scenarios
- **PromptBuilder**: Prompt formatting for different modes
- **EditSession**: State management and validation

### Integration Tests

- Mock API responses for IPFS wrapper and reprocess API
- Full workflow tests (load → edit → submit → poll)

### E2E Tests (with real services)

- Create test entity
- Run through each edit mode
- Verify entity updated correctly
- Verify cascade propagation

---

## Open Questions

1. **Authentication**: How should the SDK handle auth tokens? Passed in config or fetched from environment?

2. **Optimistic UI**: Should the frontend show optimistic updates while reprocessing, or wait for completion?

3. **Conflict resolution**: If reprocessing fails partway through cascade, how to recover?

4. **Rate limiting**: Any rate limits on reprocess API to consider?

5. **Partial regeneration**: Support regenerating only specific sections of description/metadata?

---

## Success Criteria

1. User can make AI-prompted changes in < 5 clicks
2. Manual edits with AI review work seamlessly
3. Cascade updates propagate correctly through hierarchy
4. Processing status is clear and accurate
5. Errors are handled gracefully with clear messages
6. SDK is independently usable (not coupled to frontend)
7. CLI provides equivalent functionality
