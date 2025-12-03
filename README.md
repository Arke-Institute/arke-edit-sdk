# Arke Edit SDK

Modular SDK for intelligent editing of Arke archive entities with AI-powered regeneration.

## Features

- **AI-First Editing**: Describe what you want changed, AI regenerates content
- **Manual Edit + AI Review**: Edit text directly, AI updates related content
- **Cascade Updates**: Propagate changes up the entity hierarchy
- **Retry Logic**: Handles transient API errors with exponential backoff
- **Framework Agnostic**: Works with any frontend, includes optional React hooks

## Installation

### From GitHub

```bash
npm install github:Arke-Institute/arke-edit-sdk
```

### From Source

```bash
git clone https://github.com/Arke-Institute/arke-edit-sdk.git
cd arke-edit-sdk
npm install
npm run build
```

## Quick Start

```typescript
import { ArkeEditSDK } from '@arke-institute/arke-edit-sdk';

const sdk = new ArkeEditSDK({
  ipfsWrapperUrl: 'https://api.arke.institute',
  reprocessApiUrl: 'https://reprocess-api.arke.institute'
});

// AI Prompt Mode - describe what you want
const session = sdk.createSession('01JC9X7H6M3K8Q', { mode: 'ai-prompt' });
await session.load();

session.setPrompt('description', 'Make more accessible for general audiences');
session.setScope({ components: ['description'], cascade: true });

const result = await session.submit('AI-assisted update');
await session.waitForCompletion();
```

## Edit Modes

### AI Prompt Mode (Primary)

Best for: tone changes, summarization, reformatting, adding context.

```typescript
const session = sdk.createSession(pi, { mode: 'ai-prompt' });
await session.load();

session.setPrompt('general', 'Focus on historical significance');
session.setPrompt('description', 'Make more concise');
session.setScope({ components: ['description', 'pinax'], cascade: false });

await session.submit('Improved descriptions');
```

### Manual Edit + AI Review

Best for: fixing errors, corrections, specific text changes.

```typescript
const session = sdk.createSession(pi, { mode: 'manual-with-review' });
await session.load();

// Make text changes
session.setContent('description.md', editedText);

// Add explicit corrections for AI context
session.addCorrection('1895', '1985', 'description.md');

// AI should update metadata based on corrections
session.setScope({ components: ['pinax'], cascade: true });
session.setPrompt('general', 'Date was corrected from 1895 to 1985');

await session.submit('Corrected date error');
```

### Manual Only

Best for: simple fixes, adding notes, non-AI content.

```typescript
const session = sdk.createSession(pi, { mode: 'manual-only' });
await session.load();

session.setContent('notes.txt', 'Additional context...');
session.setScope({ components: [], cascade: false });

await session.submit('Added notes');
```

## Cascade Updates

Propagate changes from child entities up to parent entities:

```typescript
const session = sdk.createSession(childPi, { mode: 'ai-prompt' });
await session.load();

session.setPrompt('general', 'Update description');
session.setScope({
  components: ['description'],
  cascade: true,
  stopAtPi: collectionPi  // Stop at this ancestor (don't update it)
});

await session.submit('Cascading update');
const status = await session.waitForCompletion({
  onProgress: (s) => console.log(`Status: ${s.reprocessStatus?.status}`)
});
```

## React Integration

```typescript
import { useEditSession } from '@arke-institute/arke-edit-sdk/react';

function EditComponent({ sdk, pi }) {
  const { session, loading, status, startSession, submit } = useEditSession(sdk, pi);

  const handleEdit = async () => {
    await startSession('ai-prompt');
    session.setPrompt('description', 'Simplify language');
    session.setScope({ components: ['description'], cascade: false });
    await submit('Simplified description');
  };

  return (
    <div>
      {loading && <Spinner />}
      {status?.phase === 'reprocessing' && <ProgressBar />}
      <button onClick={handleEdit}>Edit with AI</button>
    </div>
  );
}
```

## API Reference

### ArkeEditSDK

```typescript
new ArkeEditSDK(config: {
  ipfsWrapperUrl: string;
  reprocessApiUrl: string;
  authToken?: string;
})

sdk.createSession(pi: string, config?: EditSessionConfig): EditSession
sdk.getClient(): ArkeClient  // For advanced usage
```

### EditSession

```typescript
// Load entity
await session.load(): Promise<void>

// AI Prompt Mode
session.setPrompt(target: 'general' | 'pinax' | 'description' | 'cheimarros', prompt: string)

// Manual Mode
session.setContent(component: string, content: string)
session.addCorrection(original: string, corrected: string, sourceFile?: string)

// Scope
session.setScope(scope: {
  components: ('pinax' | 'description' | 'cheimarros')[];
  cascade: boolean;
  stopAtPi?: string;
})

// Preview
session.getDiff(): ComponentDiff[]
session.previewPrompt(): Record<string, string>
session.getChangeSummary(): ChangeSummary

// Execute
await session.submit(note: string): Promise<EditResult>
await session.waitForCompletion(options?: PollOptions): Promise<EditStatus>
```

### ArkeClient (Low-level API)

```typescript
const client = sdk.getClient();

// Entity operations
await client.getEntity(pi: string): Promise<Entity>
await client.getContent(cid: string): Promise<string>
await client.uploadContent(content: string, filename: string): Promise<string>
await client.updateEntity(pi: string, update: EntityUpdate): Promise<EntityVersion>

// Reprocess operations
await client.reprocess(request: ReprocessRequest): Promise<ReprocessResult>
await client.getReprocessStatus(statusUrl: string): Promise<ReprocessStatus>
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 arke-edit-sdk                   │
├─────────────────────────────────────────────────┤
│  EditSession → DiffEngine → PromptBuilder      │
│       │                          │              │
│       └──────► ArkeClient ◄──────┘              │
│                    │                            │
└────────────────────│────────────────────────────┘
                     ▼
        ┌────────────────────────┐
        │   External Services    │
        │  • api.arke.institute  │
        │  • reprocess-api       │
        │  • orchestrator        │
        └────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Run examples
npx tsx examples/test-live.ts
```

## Examples

See the `examples/` directory for working examples:

- `test-live.ts` - Basic read-only tests
- `test-live-full.ts` - Full test suite with modifications
- `test-cascade.ts` - Cascade update demonstration
- `test-retry.ts` - Retry logic verification

## License

MIT
