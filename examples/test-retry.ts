/**
 * Test retry logic by triggering a reprocess and immediately polling
 */

import { ArkeEditSDK } from '../dist/index.mjs';

const IPFS_WRAPPER_URL = 'https://api.arke.institute';
const REPROCESS_API_URL = 'https://reprocess-api.arke.institute';
const TEST_PI = '01KBGG1TEG2J0TXR1XKZ8T3TBP';

async function main() {
  console.log('=== Testing Retry Logic ===\n');

  const sdk = new ArkeEditSDK({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  // Create session and trigger reprocess
  const session = sdk.createSession(TEST_PI, { mode: 'ai-prompt' });
  await session.load();

  const entity = session.getEntity();
  console.log(`Entity: ${entity.pi} v${entity.ver}`);

  session.setPrompt('general', 'Retry test: minor description update');
  session.setScope({
    components: ['description'],
    cascade: false,
  });

  console.log('\nTriggering reprocess...');
  const startTime = Date.now();
  const result = await session.submit('SDK Retry Test');

  console.log(`Batch ID: ${result.reprocess?.batch_id}`);
  console.log(`Status URL: ${result.reprocess?.status_url}`);

  // Immediately start polling - this is where 500 errors used to occur
  console.log('\nPolling for status (with retry logic)...');

  const status = await session.waitForCompletion({
    intervalMs: 3000,
    timeoutMs: 120000,
    onProgress: (s) => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  [${elapsed}s] ${s.reprocessStatus?.status || s.phase}`);
    }
  });

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nCompleted in ${totalTime}s with status: ${status.phase}`);

  // Verify
  const updated = session.getEntity();
  console.log(`\nFinal version: v${entity.ver} -> v${updated.ver}`);

  console.log('\n=== Retry Test Complete ===');
}

main().catch(console.error);
