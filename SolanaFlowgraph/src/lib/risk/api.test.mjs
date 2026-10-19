import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ingestWallet, investigateWallet } from './api.ts';

const originalFetch = globalThis.fetch;
const address = '11111111111111111111111111111111';

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function ingestionResponse(maxDepth) {
  return {
    status: 'success',
    address,
    data_source: 'real',
    max_depth: maxDepth,
    max_depth_reached: maxDepth,
    wallets_visited: 1,
    signatures_fetched: 4,
    transactions_fetched: 4,
    transactions_processed: 4,
    total_transactions_processed: 4,
    transfers_persisted: 2,
    duplicates_skipped: 0,
    failed_transactions: 0,
    persistence_errors: 0,
    rate_limited: false,
    incomplete: false,
    error: null,
  };
}

function reportResponse() {
  return {
    status: 'success',
    address,
    data_source: 'real',
    graph_evidence: [],
    transaction_graph: [],
    investigation_diff: {},
    structured_report: { summary: 'No cycle found in available evidence.' },
    investigation_trace: [],
    ai_risk_report: 'No cycle was found in the available graph evidence.',
    wallets_flagged: 0,
    cycle_participant_count: 0,
    finding: 'No circular-transfer pattern detected',
    evidence_summary: 'No circular transfer paths detected.',
    action_taken: 'no_action',
    action_reason: 'No qualifying circular transfer pattern found; no action taken.',
    case_id: null,
    investigation: {
      id: null,
      finding: 'No circular-transfer pattern detected',
      status: 'no_action',
    },
  };
}

test('sends depths 0 through 3 and the supplied public wallet', async () => {
  for (const depth of [0, 1, 2, 3]) {
    let sent;
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(init.body);
      return Response.json(ingestionResponse(depth));
    };

    await ingestWallet(address, depth);
    assert.deepEqual(sent, {
      address,
      max_depth: depth,
      data_source: 'real',
    });
  }
});

test('ingests before reporting the same wallet with real evidence coverage', async () => {
  const requests = [];
  let callbackIngestion;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ path: new URL(url).pathname, body });
    return Response.json(
      requests.length === 1 ? ingestionResponse(2) : reportResponse()
    );
  };

  const result = await investigateWallet(address, 2, (ingestion) => {
    callbackIngestion = ingestion;
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, '/api/ingest-wallet');
  assert.deepEqual(requests[0].body, {
    address,
    max_depth: 2,
    data_source: 'real',
  });
  assert.equal(requests[1].path, '/api/generate-risk-report');
  assert.equal(requests[1].body.address, address);
  assert.equal(requests[1].body.data_source, 'real');
  assert.equal(requests[1].body.ingestion.max_depth, 2);
  assert.equal(callbackIngestion, result.ingestion);
});

test('does not request a report after ingestion fails', async () => {
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(new URL(url).pathname);
    return Response.json(
      { status: 'error', error: 'Solana RPC timeout' },
      { status: 502 }
    );
  };

  await assert.rejects(investigateWallet(address, 3), /Solana RPC timeout/);
  assert.deepEqual(paths, ['/api/ingest-wallet']);
});

test('does not request a report when a successful HTTP body contains an error', async () => {
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(new URL(url).pathname);
    const body = ingestionResponse(2);
    body.error = 'Persistence incomplete';
    return Response.json(body);
  };

  await assert.rejects(
    investigateWallet(address, 2),
    /Ingestion response did not include valid investigation statistics/
  );
  assert.deepEqual(paths, ['/api/ingest-wallet']);
});
