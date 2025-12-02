# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build     # Production build (uses tsup, outputs to dist/)
npm run dev       # Watch mode with rebuilds
npm test          # Run tests in watch mode (vitest)
npm run test:run  # Run tests once
npm run typecheck # TypeScript type checking
npm run lint      # ESLint
```

## Architecture

This SDK provides intelligent editing capabilities for Arke entities, bridging direct content editing with AI-powered regeneration.

### Layered Architecture

```
EditSession → DiffEngine → PromptBuilder
     │                          │
     └──────► ArkeClient ◄──────┘
                  │
         ┌───────┴───────┐
         │               │
    IPFS Wrapper    Reprocess API
```

1. **ArkeClient** (`src/client.ts`) - Low-level API communication with IPFS Wrapper and Reprocess API
2. **EditSession** (`src/session.ts`) - Stateful session managing an edit workflow
3. **DiffEngine** (`src/diff.ts`) - Text diff computation using the `diff` npm package
4. **PromptBuilder** (`src/prompts.ts`) - Context-aware AI prompt construction

### Two Separate Exports

The package exports two entry points (see `tsup.config.ts`):
- Main: `arke-edit-sdk` - Core SDK functionality
- React: `arke-edit-sdk/react` - Optional React hooks (peer dependency on React 18+)

## Key Design Decisions

### AI-First Approach

Three edit modes in order of preference:
1. **AI Prompt Mode** - Primary: User describes changes, AI regenerates
2. **Manual Edit + AI Review** - Secondary: User edits, AI updates related content
3. **Manual Only** - Escape hatch: No AI involvement

### Two-Phase Submit

When both manual edits and AI regeneration are needed:
1. **Save Phase**: Submit manual edits to IPFS Wrapper
2. **Reprocess Phase**: Call Reprocess API with custom prompts

This ensures manual changes are durable before AI processing begins.

## External Services

### IPFS Wrapper API
- `GET /entities/{pi}` - Fetch entity
- `GET /cat/{cid}` - Fetch component content
- `POST /entities/{pi}/versions` - Update entity
- `POST /upload` - Upload content, get CID

### Reprocess API
- `POST /api/reprocess` - Trigger reprocessing with phases (`pinax`, `description`, `cheimarros`), cascade option, and custom prompts
- Status polled via orchestrator status endpoint (returned in reprocess response)

## Types

Core types are in `src/types.ts`. Key interfaces:
- `Entity` - Archive entity with pi, version, manifest_cid, components
- `EditSession` state tracks: entity, components, prompts, editedContent, corrections, scope
- `EditMode`: `'ai-prompt' | 'manual-with-review' | 'manual-only'`
- `RegeneratableComponent`: `'pinax' | 'description' | 'cheimarros'`
