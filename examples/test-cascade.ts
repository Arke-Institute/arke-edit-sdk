/**
 * Cascade Test - Trigger reprocess from grandchild and watch it cascade up
 *
 * Hierarchy:
 *   Collection: 01KBGG1TEG2J0TXR1XKZ8T3TBP (Chartbook Newsletter)
 *     └─ Child: 01KBGG2GVKFKV0SEJPE23N5NFJ (FT Draft Newsletter)
 *         └─ Grandchild: 01KBGG2Y9GA1ES8CHGTYKAJJDH
 */

import { ArkeEditSDK, ArkeClient } from '../dist/index.mjs';

const IPFS_WRAPPER_URL = 'https://api.arke.institute';
const REPROCESS_API_URL = 'https://reprocess-api.arke.institute';

const COLLECTION_PI = '01KBGG1TEG2J0TXR1XKZ8T3TBP';
const CHILD_PI = '01KBGG2GVKFKV0SEJPE23N5NFJ';
const GRANDCHILD_PI = '01KBGG2Y9GA1ES8CHGTYKAJJDH';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              CASCADE REPROCESS TEST                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const client = new ArkeClient({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  const sdk = new ArkeEditSDK({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  // Get initial versions
  console.log('=== INITIAL STATE ===\n');

  const collection = await client.getEntity(COLLECTION_PI);
  const child = await client.getEntity(CHILD_PI);
  const grandchild = await client.getEntity(GRANDCHILD_PI);

  console.log(`Collection: ${collection.pi} v${collection.ver}`);
  console.log(`  └─ Child: ${child.pi} v${child.ver}`);
  console.log(`      └─ Grandchild: ${grandchild.pi} v${grandchild.ver}`);

  // Record initial versions
  const initialVersions = {
    collection: collection.ver,
    child: child.ver,
    grandchild: grandchild.ver,
  };

  // Create session on grandchild with cascade
  console.log('\n=== TRIGGERING CASCADE FROM GRANDCHILD ===\n');

  const session = sdk.createSession(GRANDCHILD_PI, { mode: 'ai-prompt' });
  await session.load();

  // Set prompt and cascade scope
  session.setPrompt('general',
    'CASCADE TEST: Update the description to include a note at the end stating: ' +
    '"This description was updated by cascade test at ' + new Date().toISOString() + '"'
  );

  session.setScope({
    components: ['description'],
    cascade: true,
    stopAtPi: COLLECTION_PI, // Cascade up to and including the collection
  });

  // Preview
  const summary = session.getChangeSummary();
  console.log('Change Summary:');
  console.log(`  Mode: ${summary.mode}`);
  console.log(`  Will regenerate: ${summary.willRegenerate.join(', ')}`);
  console.log(`  Will cascade: ${summary.willCascade}`);
  console.log(`  Stop at: ${session.getScope().stopAtPi}`);

  // Submit
  console.log('\nSubmitting cascade reprocess...');
  const result = await session.submit('SDK Cascade Test');

  console.log(`\nReprocess triggered:`);
  console.log(`  Batch ID: ${result.reprocess?.batch_id}`);
  console.log(`  Entities queued: ${result.reprocess?.entities_queued}`);
  console.log(`  Entity PIs: ${result.reprocess?.entity_pis?.join(', ')}`);
  console.log(`  Status URL: ${result.reprocess?.status_url}`);

  // Poll for completion
  console.log('\n=== WAITING FOR COMPLETION ===\n');

  const finalStatus = await session.waitForCompletion({
    intervalMs: 5000,
    timeoutMs: 180000, // 3 minutes
    onProgress: (s) => {
      const progress = s.reprocessStatus?.progress;
      console.log(`Status: ${s.reprocessStatus?.status || s.phase}`);
      if (progress) {
        console.log(`  Progress: pinax=${progress.directories_pinax_complete}/${progress.directories_total}, ` +
          `cheimarros=${progress.directories_cheimarros_complete}/${progress.directories_total}, ` +
          `description=${progress.directories_description_complete}/${progress.directories_total}`);
      }
    }
  });

  console.log(`\nFinal status: ${finalStatus.phase}`);
  if (finalStatus.error) {
    console.log(`Error: ${finalStatus.error}`);
  }

  // Verify changes
  console.log('\n=== FINAL STATE ===\n');

  const collectionAfter = await client.getEntity(COLLECTION_PI);
  const childAfter = await client.getEntity(CHILD_PI);
  const grandchildAfter = await client.getEntity(GRANDCHILD_PI);

  console.log(`Collection: ${collectionAfter.pi} v${collectionAfter.ver} (was v${initialVersions.collection})`);
  console.log(`  └─ Child: ${childAfter.pi} v${childAfter.ver} (was v${initialVersions.child})`);
  console.log(`      └─ Grandchild: ${grandchildAfter.pi} v${grandchildAfter.ver} (was v${initialVersions.grandchild})`);

  // Check if versions increased
  console.log('\n=== VERSION CHANGES ===\n');

  const changes = {
    grandchild: grandchildAfter.ver - initialVersions.grandchild,
    child: childAfter.ver - initialVersions.child,
    collection: collectionAfter.ver - initialVersions.collection,
  };

  console.log(`Grandchild version change: +${changes.grandchild}`);
  console.log(`Child version change: +${changes.child}`);
  console.log(`Collection version change: +${changes.collection}`);

  // Fetch updated descriptions
  console.log('\n=== UPDATED DESCRIPTIONS (First 500 chars) ===\n');

  if (grandchildAfter.components['description.md']) {
    const desc = await client.getContent(grandchildAfter.components['description.md']);
    console.log('--- Grandchild Description ---');
    console.log(desc.slice(0, 500) + '...\n');
  }

  if (childAfter.components['description.md']) {
    const desc = await client.getContent(childAfter.components['description.md']);
    console.log('--- Child Description ---');
    console.log(desc.slice(0, 500) + '...\n');
  }

  if (collectionAfter.components['description.md']) {
    const desc = await client.getContent(collectionAfter.components['description.md']);
    console.log('--- Collection Description ---');
    console.log(desc.slice(0, 500) + '...\n');
  }

  console.log('\n=== CASCADE TEST COMPLETE ===');
}

main().catch(console.error);
