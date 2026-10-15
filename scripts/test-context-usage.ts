// Run: node --import tsx scripts/test-context-usage.ts
// Exercise the real SSE parser and usage accounting; isolate only storage and history estimates.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const mocks: Record<string, string> = {
  contextManager: `export const estimateTokens=x=>String(x).length;`,
  contextUsagePersistence: `export async function persistContextUsageRow(){}
    export async function loadContextUsageRow(){return null} export async function deleteContextUsageRow(){}`,
};
const bundle = await build({
  stdin: { contents: `export { fetchAnthropicSSE } from './src/services/chat/anthropicSseFetcher.ts';
    export { armTurnUsageFixed, applyLlmUsage, getContextUsageSnapshot, resetContextUsage } from './src/services/chat/llm/contextUsage.ts';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  banner: { js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(resolve('package.json'))});` },
  plugins: [{ name: 'isolated-usage-storage', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      const name = args.path.split('/').at(-1)!.replace(/\.ts$/, '');
      return name in mocks ? { path: name, namespace: 'fixture' } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const usage = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();
const id = 'usage-fixture';
const fixed = { system: 100, skills: 50, tools: 200, summarized: 25 };
const nextFixed = { system: 80, skills: 40, tools: 160, summarized: 20 };
let checks = 0;
async function check(name: string, run: () => Promise<void> | void) {
  usage.resetContextUsage(id);
  await run(); checks++; console.log(`PASS ${name}`);
}
function event(type: string, fields: Record<string, unknown> = {}) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
}
function stream(start: Record<string, unknown>, ...updates: Record<string, unknown>[]) {
  return event('message_start', { message: { usage: start } }) +
    updates.map((u, i) => event('message_delta', { usage: u, ...(i === updates.length - 1 ? { delta: { stop_reason: 'end_turn' } } : {}) })).join('') +
    event('message_stop');
}
async function account(body: string | Response, afterUsage?: () => void) {
  globalThis.fetch = async () => typeof body === 'string'
    ? new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(body)); c.close(); } }))
    : body;
  const applied: any[] = [];
  for await (const e of usage.fetchAnthropicSSE('https://example.test', {}, 'fixture-message')) {
    if (e.type !== 'usage') continue;
    applied.push(e.usage); usage.applyLlmUsage(id, e.usage); afterUsage?.();
  }
  return applied;
}
function buckets() {
  const { limit, percent, ...snapshot } = usage.getContextUsageSnapshot(id);
  return snapshot;
}
try {
  await check('Anthropic start/final usage preserves fixed classifications and settles once', async () => {
    usage.armTurnUsageFixed(id, fixed);
    const applied = await account(stream({ input_tokens: 1000, output_tokens: 1 }, { output_tokens: 100 }));
    assert.deepEqual(buckets(), { ...fixed, conversationText: 725, conversationImage: 0, total: 1100 });
    assert.equal(applied.length, 1);
    assert.equal(applied[0].promptTokens, 1000); assert.equal(applied[0].completionTokens, 100);
  });
  await check('Anthropic cumulative deltas merge final input and output without adding twice', async () => {
    usage.armTurnUsageFixed(id, fixed);
    const applied = await account(stream({ input_tokens: 1000, output_tokens: 1 },
      { input_tokens: 1200, output_tokens: 100 }, { input_tokens: 1250 }));
    assert.equal(applied.length, 1);
    assert.equal(applied[0].promptTokens, 1250); assert.equal(applied[0].completionTokens, 100);
    assert.equal(applied[0].totalTokens, 1350);
    assert.deepEqual(buckets(), { ...fixed, conversationText: 975, conversationImage: 0, total: 1350 });
  });
  await check('settled Anthropic usage cannot consume the following request fixed classifications', async () => {
    usage.armTurnUsageFixed(id, fixed);
    const applied = await account(stream({ input_tokens: 1000 }, { output_tokens: 100 }),
      () => usage.armTurnUsageFixed(id, nextFixed));
    assert.equal(applied.length, 1);
    assert.deepEqual(buckets(), { ...fixed, conversationText: 725, conversationImage: 0, total: 1100 });
    const next = await account(stream({ input_tokens: 1200 }, { output_tokens: 200 }));
    assert.equal(next.length, 1);
    assert.deepEqual(buckets(), { ...nextFixed, conversationText: 1100, conversationImage: 0, total: 1400 });
  });
  await check('Anthropic known initial usage is retained when no final usage frame arrives', async () => {
    usage.armTurnUsageFixed(id, fixed);
    const applied = await account(event('message_start', { message: { usage: { input_tokens: 1000, output_tokens: 1 } } }) + event('message_stop'));
    assert.equal(applied.length, 1);
    assert.deepEqual(buckets(), { ...fixed, conversationText: 626, conversationImage: 0, total: 1001 });
  });
  await check('Anthropic cancellation settles known usage once without a successful done event', async () => {
    usage.armTurnUsageFixed(id, fixed);
    const controller = new AbortController();
    let cancelled = 0;
    const body = event('message_start', { message: { usage: { input_tokens: 1000, output_tokens: 1 } } }) +
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'partial' } });
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(c) { c.enqueue(encoder.encode(body)); },
      cancel() { cancelled++; },
    }));
    const events: string[] = [];
    for await (const e of usage.fetchAnthropicSSE('https://example.test', {}, 'cancelled-message', controller.signal)) {
      events.push(e.type);
      if (e.type === 'text') controller.abort();
      if (e.type === 'usage') usage.applyLlmUsage(id, e.usage);
    }
    assert.deepEqual(events, ['text', 'usage']);
    assert.equal(cancelled, 1);
    assert.deepEqual(buckets(), { ...fixed, conversationText: 626, conversationImage: 0, total: 1001 });
  });
  await check('Anthropic error frames and reader failures settle known usage once while preserving the error', async () => {
    const observed = [];
    for (const failure of ['error-frame', 'reader-failure']) {
      usage.resetContextUsage(id); usage.armTurnUsageFixed(id, fixed);
      const initial = event('message_start', { message: { usage: { input_tokens: 1000, output_tokens: 1 } } });
      let source: string | Response;
      if (failure === 'error-frame') {
        source = initial + event('error', { error: { message: 'fixture Anthropic unavailable' } });
      } else {
        let sent = false;
        source = new Response(new ReadableStream({ pull(c) {
          if (sent) { c.error(new Error('fixture connection lost')); return; }
          sent = true;
          c.enqueue(encoder.encode(initial + event('message_delta', { usage: { output_tokens: 50 } })));
        } }));
      }
      let applied = 0;
      await assert.rejects(account(source, () => {
        applied++; usage.armTurnUsageFixed(id, nextFixed);
      }), failure === 'error-frame' ? /fixture Anthropic unavailable/ : /fixture connection lost/);
      const known = buckets();
      await account(stream({ input_tokens: 1200 }, { output_tokens: 200 }));
      observed.push({ failure, applied, known, next: buckets() });
    }
    assert.deepEqual(observed, [
      { failure: 'error-frame', applied: 1,
        known: { ...fixed, conversationText: 626, conversationImage: 0, total: 1001 },
        next: { ...nextFixed, conversationText: 1100, conversationImage: 0, total: 1400 } },
      { failure: 'reader-failure', applied: 1,
        known: { ...fixed, conversationText: 675, conversationImage: 0, total: 1050 },
        next: { ...nextFixed, conversationText: 1100, conversationImage: 0, total: 1400 } },
    ]);
  });
} finally {
  usage.resetContextUsage(id);
  globalThis.fetch = originalFetch;
}
console.log(`context usage: ${checks} checks passed`);
