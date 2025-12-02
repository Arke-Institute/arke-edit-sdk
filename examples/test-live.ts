/**
 * Live test against the Chartbook Newsletter Collection
 * PI: 01KBGG1TEG2J0TXR1XKZ8T3TBP
 */

import { ArkeEditSDK, ArkeClient } from '../dist/index.mjs';

const IPFS_WRAPPER_URL = 'https://api.arke.institute';
const REPROCESS_API_URL = 'https://reprocess-api.arke.institute';  // May need adjustment
const TEST_PI = '01KBGG1TEG2J0TXR1XKZ8T3TBP';

async function testClient() {
  console.log('=== Testing ArkeClient directly ===\n');

  const client = new ArkeClient({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  // Test fetching entity
  console.log(`Fetching entity: ${TEST_PI}`);
  const entity = await client.getEntity(TEST_PI);

  console.log('\nEntity loaded:');
  console.log(`  PI: ${entity.pi}`);
  console.log(`  Version: ${entity.ver}`);
  console.log(`  Manifest CID: ${entity.manifest_cid}`);
  console.log(`  Parent PI: ${entity.parent_pi || '(root)'}`);
  console.log(`  Children: ${entity.children_pi.length}`);
  console.log(`  Components: ${Object.keys(entity.components).join(', ')}`);

  // Fetch description content
  const descCid = entity.components['description.md'];
  if (descCid) {
    console.log('\n--- Description Content ---');
    const desc = await client.getContent(descCid);
    console.log(desc.slice(0, 500) + (desc.length > 500 ? '...' : ''));
  }

  // Fetch PINAX content
  const pinaxCid = entity.components['pinax.json'];
  if (pinaxCid) {
    console.log('\n--- PINAX Metadata ---');
    const pinax = await client.getContent(pinaxCid);
    const pinaxData = JSON.parse(pinax);
    console.log(JSON.stringify(pinaxData, null, 2).slice(0, 800));
  }

  return entity;
}

async function testEditSession() {
  console.log('\n\n=== Testing EditSession ===\n');

  const sdk = new ArkeEditSDK({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  // Create session
  console.log(`Creating session for: ${TEST_PI}`);
  const session = sdk.createSession(TEST_PI, { mode: 'ai-prompt' });

  // Load entity
  console.log('Loading entity and components...');
  await session.load();

  const entity = session.getEntity();
  const components = session.getComponents();

  console.log('\nLoaded components:');
  for (const [name, content] of Object.entries(components)) {
    console.log(`  ${name}: ${content.length} bytes`);
  }

  // Set up a test prompt (won't actually submit)
  session.setPrompt('general', 'Make the description more accessible for general audiences.');
  session.setScope({
    components: ['description'],
    cascade: false,
  });

  // Get change summary
  const summary = session.getChangeSummary();
  console.log('\nChange Summary:');
  console.log(`  Mode: ${summary.mode}`);
  console.log(`  Will regenerate: ${summary.willRegenerate.join(', ')}`);
  console.log(`  Will cascade: ${summary.willCascade}`);
  console.log(`  Has manual edits: ${summary.hasManualEdits}`);

  // Preview the AI prompt
  const prompts = session.previewPrompt();
  console.log('\nAI Prompt Preview for description:');
  console.log('---');
  console.log(prompts.description?.slice(0, 1000) || '(no prompt)');
  console.log('---');

  console.log('\n[Test complete - no changes submitted]');
}

async function testManualEditMode() {
  console.log('\n\n=== Testing Manual Edit + AI Review Mode ===\n');

  const sdk = new ArkeEditSDK({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  const session = sdk.createSession(TEST_PI, { mode: 'manual-with-review' });
  await session.load();

  // Get current description
  const components = session.getComponents();
  const currentDesc = components['description.md'];

  if (currentDesc) {
    // Simulate making an edit (won't actually submit)
    const editedDesc = currentDesc.replace('Adam Tooze', 'Professor Adam Tooze');
    session.setContent('description.md', editedDesc);

    // Add a correction
    session.addCorrection('Adam Tooze', 'Professor Adam Tooze', 'description.md');

    // Set scope to regenerate PINAX based on edited description
    session.setScope({
      components: ['pinax'],
      cascade: false,
    });

    session.setPrompt('general', 'The creator name was expanded. Update metadata accordingly.');

    // Show diffs
    const diffs = session.getDiff();
    console.log('Diffs detected:');
    for (const diff of diffs) {
      console.log(`  ${diff.componentName}: ${diff.summary}`);
    }

    // Show change summary
    const summary = session.getChangeSummary();
    console.log('\nChange Summary:');
    console.log(JSON.stringify(summary, null, 2));
  }

  console.log('\n[Test complete - no changes submitted]');
}

async function testChildEntity() {
  console.log('\n\n=== Testing Child Entity ===\n');

  const sdk = new ArkeEditSDK({
    ipfsWrapperUrl: IPFS_WRAPPER_URL,
    reprocessApiUrl: REPROCESS_API_URL,
  });

  // First get the parent to find children
  const parentSession = sdk.createSession(TEST_PI);
  await parentSession.load();
  const parent = parentSession.getEntity();

  if (parent.children_pi.length > 0) {
    const childPi = parent.children_pi[0];
    console.log(`Testing child entity: ${childPi}`);

    const childSession = sdk.createSession(childPi, { mode: 'ai-prompt' });
    await childSession.load();
    const child = childSession.getEntity();

    console.log(`\nChild entity:`);
    console.log(`  PI: ${child.pi}`);
    console.log(`  Version: ${child.ver}`);
    console.log(`  Parent: ${child.parent_pi}`);
    console.log(`  Components: ${Object.keys(child.components).join(', ')}`);

    // Test cascade to parent
    childSession.setPrompt('general', 'Test prompt for cascade');
    childSession.setScope({
      components: ['description'],
      cascade: true,
      stopAtPi: TEST_PI, // Stop at the collection level
    });

    const prompts = childSession.previewPrompt();
    console.log('\nCascade prompt preview:');
    console.log(prompts.description?.slice(0, 800) || '(no prompt)');
  } else {
    console.log('No children found');
  }
}

async function main() {
  try {
    await testClient();
    await testEditSession();
    await testManualEditMode();
    await testChildEntity();

    console.log('\n\n=== All tests completed successfully ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
