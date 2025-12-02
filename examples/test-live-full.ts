/**
 * Full Live Test Suite - Arke Edit SDK
 * Tests all API endpoints with actual modifications
 *
 * Collection: Chartbook Newsletter (01KBGG1TEG2J0TXR1XKZ8T3TBP)
 */

import { ArkeEditSDK, ArkeClient } from '../dist/index.mjs';

const IPFS_WRAPPER_URL = 'https://api.arke.institute';
const REPROCESS_API_URL = 'https://reprocess-api.arke.institute';

const COLLECTION_PI = '01KBGG1TEG2J0TXR1XKZ8T3TBP';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details: string;
  data?: unknown;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(message);
}

function logResult(result: TestResult) {
  results.push(result);
  const icon = result.status === 'PASS' ? '✓' : '✗';
  console.log(`\n${icon} ${result.test}: ${result.status}`);
  console.log(`  ${result.details}`);
  if (result.data) {
    console.log(`  Data: ${JSON.stringify(result.data, null, 2).split('\n').join('\n  ')}`);
  }
}

// ============================================================================
// TEST 1: Fetch Entity
// ============================================================================
async function testFetchEntity(client: ArkeClient) {
  log('\n' + '='.repeat(60));
  log('TEST 1: Fetch Entity (GET /entities/{pi})');
  log('='.repeat(60));

  try {
    const entity = await client.getEntity(COLLECTION_PI);

    logResult({
      test: 'Fetch Entity',
      status: 'PASS',
      details: `Fetched entity ${entity.pi} v${entity.ver}`,
      data: {
        pi: entity.pi,
        ver: entity.ver,
        manifest_cid: entity.manifest_cid,
        components: Object.keys(entity.components),
        children_count: entity.children_pi.length,
      }
    });

    return entity;
  } catch (error) {
    logResult({
      test: 'Fetch Entity',
      status: 'FAIL',
      details: `Error: ${error}`,
    });
    throw error;
  }
}

// ============================================================================
// TEST 2: Fetch Content
// ============================================================================
async function testFetchContent(client: ArkeClient, cid: string, componentName: string) {
  log('\n' + '='.repeat(60));
  log(`TEST 2: Fetch Content (GET /cat/{cid}) - ${componentName}`);
  log('='.repeat(60));

  try {
    const content = await client.getContent(cid);

    logResult({
      test: 'Fetch Content',
      status: 'PASS',
      details: `Fetched ${componentName} (${content.length} bytes)`,
      data: {
        cid: cid,
        contentLength: content.length,
        preview: content.slice(0, 200) + '...',
      }
    });

    return content;
  } catch (error) {
    logResult({
      test: 'Fetch Content',
      status: 'FAIL',
      details: `Error: ${error}`,
    });
    throw error;
  }
}

// ============================================================================
// TEST 3: Upload Content
// ============================================================================
async function testUploadContent(client: ArkeClient) {
  log('\n' + '='.repeat(60));
  log('TEST 3: Upload Content (POST /upload)');
  log('='.repeat(60));

  const testContent = `# SDK Test File
Created: ${new Date().toISOString()}
This is a test file created by the Arke Edit SDK test suite.
`;

  try {
    const cid = await client.uploadContent(testContent, 'sdk-test.md');

    logResult({
      test: 'Upload Content',
      status: 'PASS',
      details: `Uploaded content, received CID`,
      data: {
        cid: cid,
        contentLength: testContent.length,
      }
    });

    // Verify by fetching it back
    const fetched = await client.getContent(cid);
    if (fetched === testContent) {
      log('  ✓ Verified: content matches after round-trip');
    }

    return cid;
  } catch (error) {
    logResult({
      test: 'Upload Content',
      status: 'FAIL',
      details: `Error: ${error}`,
    });
    throw error;
  }
}

// ============================================================================
// TEST 4: Update Entity (Manual Edit)
// ============================================================================
async function testUpdateEntity(client: ArkeClient, pi: string, currentTip: string) {
  log('\n' + '='.repeat(60));
  log('TEST 4: Update Entity (POST /entities/{pi}/versions)');
  log('='.repeat(60));

  // Create test note content
  const testNote = `# SDK Test Note
Generated: ${new Date().toISOString()}
This note was created by the Arke Edit SDK test suite to verify the update endpoint.
`;

  try {
    // First upload the content
    const noteCid = await client.uploadContent(testNote, 'sdk-test-note.md');
    log(`  Uploaded test note, CID: ${noteCid}`);

    // Now update the entity
    const version = await client.updateEntity(pi, {
      expect_tip: currentTip,
      components: {
        'sdk-test-note.md': noteCid,
      },
      note: 'SDK Test: Added test note component',
    });

    logResult({
      test: 'Update Entity',
      status: 'PASS',
      details: `Entity updated from v? to v${version.ver}`,
      data: {
        pi: version.pi,
        newVersion: version.ver,
        newTip: version.tip,
      }
    });

    return version;
  } catch (error) {
    logResult({
      test: 'Update Entity',
      status: 'FAIL',
      details: `Error: ${error}`,
    });
    throw error;
  }
}

// ============================================================================
// TEST 5: Reprocess API - Single Entity
// ============================================================================
async function testReprocessSingle(client: ArkeClient, pi: string) {
  log('\n' + '='.repeat(60));
  log('TEST 5: Reprocess API - Single Entity (POST /api/reprocess)');
  log('='.repeat(60));

  try {
    const result = await client.reprocess({
      pi: pi,
      phases: ['description'],
      cascade: false,
      options: {
        custom_prompts: {
          general: 'SDK Test: Regenerate the description with a brief test note at the end mentioning this was regenerated by SDK test.',
        }
      }
    });

    logResult({
      test: 'Reprocess Single',
      status: 'PASS',
      details: `Reprocess triggered, batch_id: ${result.batch_id}`,
      data: {
        batch_id: result.batch_id,
        entities_queued: result.entities_queued,
        entity_pis: result.entity_pis,
        status_url: result.status_url,
      }
    });

    return result;
  } catch (error) {
    logResult({
      test: 'Reprocess Single',
      status: 'FAIL',
      details: `Error: ${error}`,
    });
    throw error;
  }
}

// ============================================================================
// TEST 6: Poll Reprocess Status
// ============================================================================
async function testPollStatus(client: ArkeClient, statusUrl: string) {
  log('\n' + '='.repeat(60));
  log('TEST 6: Poll Reprocess Status (GET status_url)');
  log('='.repeat(60));

  try {
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds max

    while (attempts < maxAttempts) {
      const status = await client.getReprocessStatus(statusUrl);

      log(`  Attempt ${attempts + 1}: ${status.status}`);
      if (status.progress) {
        log(`    Progress: ${JSON.stringify(status.progress)}`);
      }

      if (status.status === 'DONE') {
        logResult({
          test: 'Poll Reprocess Status',
          status: 'PASS',
          details: `Reprocess completed after ${attempts + 1} polls`,
          data: status,
        });
        return status;
      }

      if (status.status === 'ERROR') {
        logResult({
          test: 'Poll Reprocess Status',
          status: 'FAIL',
          details: `Reprocess failed: ${status.error}`,
          data: status,
        });
        throw new Error(status.error);
      }

      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }

    logResult({
      test: 'Poll Reprocess Status',
      status: 'FAIL',
      details: `Timeout after ${maxAttempts} attempts`,
    });
    throw new Error('Timeout');
  } catch (error) {
    if (!results.find(r => r.test === 'Poll Reprocess Status')) {
      logResult({
        test: 'Poll Reprocess Status',
        status: 'FAIL',
        details: `Error: ${error}`,
      });
    }
    throw error;
  }
}

// ============================================================================
// TEST 7: Cascade Reprocess from Grandchild
// ============================================================================
async function testCascadeReprocess(sdk: ArkeEditSDK, grandchildPi: string, stopAtPi: string) {
  log('\n' + '='.repeat(60));
  log('TEST 7: Cascade Reprocess from Grandchild');
  log('='.repeat(60));

  try {
    const session = sdk.createSession(grandchildPi, { mode: 'ai-prompt' });
    await session.load();

    const entity = session.getEntity();
    log(`  Grandchild: ${entity.pi} v${entity.ver}`);
    log(`  Parent: ${entity.parent_pi}`);

    // Set up cascade
    session.setPrompt('general', 'SDK Cascade Test: Update description to note this was part of a cascade test.');
    session.setScope({
      components: ['description'],
      cascade: true,
      stopAtPi: stopAtPi,
    });

    // Show what will happen
    const summary = session.getChangeSummary();
    log(`  Will regenerate: ${summary.willRegenerate.join(', ')}`);
    log(`  Will cascade: ${summary.willCascade}`);

    // Submit
    const result = await session.submit('SDK Cascade Test');

    logResult({
      test: 'Cascade Reprocess Setup',
      status: 'PASS',
      details: `Cascade reprocess triggered from grandchild`,
      data: {
        batch_id: result.reprocess?.batch_id,
        entities_queued: result.reprocess?.entities_queued,
        entity_pis: result.reprocess?.entity_pis,
      }
    });

    // Wait for completion
    if (result.reprocess) {
      log('\n  Waiting for cascade to complete...');
      const finalStatus = await session.waitForCompletion({
        intervalMs: 3000,
        timeoutMs: 120000,
        onProgress: (s) => {
          log(`    Status: ${s.phase} - ${s.reprocessStatus?.status || 'unknown'}`);
        }
      });

      logResult({
        test: 'Cascade Reprocess Complete',
        status: finalStatus.phase === 'complete' ? 'PASS' : 'FAIL',
        details: `Cascade ${finalStatus.phase}`,
        data: finalStatus.reprocessStatus,
      });

      return finalStatus;
    }

    return result;
  } catch (error) {
    logResult({
      test: 'Cascade Reprocess',
      status: 'FAIL',
      details: `Error: ${error}`,
    });
    throw error;
  }
}

// ============================================================================
// TEST 8: Verify Changes After Reprocess
// ============================================================================
async function testVerifyChanges(client: ArkeClient, pi: string, originalVersion: number) {
  log('\n' + '='.repeat(60));
  log('TEST 8: Verify Changes After Reprocess');
  log('='.repeat(60));

  try {
    const entity = await client.getEntity(pi);

    log(`  Original version: ${originalVersion}`);
    log(`  Current version: ${entity.ver}`);

    // Fetch description to see changes
    const descCid = entity.components['description.md'];
    if (descCid) {
      const desc = await client.getContent(descCid);
      log(`  Description length: ${desc.length} bytes`);
      log(`  Description preview:`);
      log(`    ${desc.slice(0, 300).split('\n').join('\n    ')}...`);
    }

    const versionIncreased = entity.ver > originalVersion;

    logResult({
      test: 'Verify Changes',
      status: versionIncreased ? 'PASS' : 'FAIL',
      details: versionIncreased
        ? `Version increased from ${originalVersion} to ${entity.ver}`
        : `Version did not increase (was ${originalVersion}, is ${entity.ver})`,
      data: {
        pi: entity.pi,
        originalVersion,
        newVersion: entity.ver,
        manifest_cid: entity.manifest_cid,
      }
    });

    return entity;
  } catch (error) {
    logResult({
      test: 'Verify Changes',
      status: 'FAIL',
      details: `Error: ${error}`,
    });
    throw error;
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         ARKE EDIT SDK - FULL LIVE TEST SUITE               ║');
  console.log('║                                                            ║');
  console.log('║  Collection: Chartbook Newsletter                          ║');
  console.log('║  PI: ' + COLLECTION_PI + '                  ║');
  console.log('║                                                            ║');
  console.log('║  ⚠️  This test WILL modify live data                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nStarted: ${new Date().toISOString()}\n`);

  const client = new ArkeClient({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  const sdk = new ArkeEditSDK({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  try {
    // TEST 1: Fetch collection entity
    const collection = await testFetchEntity(client);
    const collectionOriginalVersion = collection.ver;

    // TEST 2: Fetch description content
    await testFetchContent(client, collection.components['description.md'], 'description.md');

    // TEST 3: Upload test content
    await testUploadContent(client);

    // TEST 4: Update entity with test note
    const updateResult = await testUpdateEntity(client, collection.pi, collection.manifest_cid);

    // TEST 5: Reprocess single entity (description only, no cascade)
    const reprocessResult = await testReprocessSingle(client, collection.pi);

    // TEST 6: Poll for completion
    await testPollStatus(client, reprocessResult.status_url);

    // TEST 7: Get grandchild and test cascade
    // First get child
    const childPi = collection.children_pi[0];
    if (childPi) {
      const child = await client.getEntity(childPi);
      log(`\nChild entity: ${child.pi} v${child.ver}`);
      log(`Child has ${child.children_pi.length} children (grandchildren)`);

      if (child.children_pi.length > 0) {
        const grandchildPi = child.children_pi[0];
        const grandchild = await client.getEntity(grandchildPi);
        log(`\nGrandchild entity: ${grandchild.pi} v${grandchild.ver}`);

        // Test cascade from grandchild up to collection
        await testCascadeReprocess(sdk, grandchildPi, collection.pi);
      } else {
        log('\nNo grandchildren found, skipping cascade test');
      }
    }

    // TEST 8: Verify changes
    await testVerifyChanges(client, collection.pi, collectionOriginalVersion);

  } catch (error) {
    console.error('\n\n❌ Test suite failed:', error);
  }

  // Print summary
  console.log('\n\n' + '═'.repeat(60));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  for (const result of results) {
    const icon = result.status === 'PASS' ? '✓' : '✗';
    console.log(`  ${icon} ${result.test}: ${result.status}`);
  }

  console.log(`\nCompleted: ${new Date().toISOString()}`);
}

main().catch(console.error);
