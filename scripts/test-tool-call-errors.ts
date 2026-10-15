// Run: node --import tsx scripts/test-tool-call-errors.ts
// Exercise the actual providers and SSE parsers; mock browser/storage dependencies and fetch.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const mocks: Record<string, string> = {
  contextManager: `export const CONTEXT_LIMITS={MAX_MESSAGES:40,TOKEN_WARNING:100000};
    export const trimMessages=x=>x; export const estimateMessagesTokens=()=>0;
    export async function prepareLlmHistory(){} export async function materializeToolResultContent(_id,x){return x}`,
  contextUsage: `export function applyLlmUsage(){} export function armTurnUsageFixed(){}
    export const estimateJsonTokens=()=>0, estimateSummarizedInHistory=()=>0, estimateTextTokens=()=>0;
    export const parseLlmUsageFromSse=()=>null;`,
  interactionBlockSendHints: `export const prepareUserSendText=x=>x;`,
  askModeToolPolicy: `export const isAskModeRound=()=>false, isAskBlockedPageTool=()=>false;
    export const buildAskPageToolBlockedPayload=()=>({}), getLastUserVisibleGoal=()=>'';`,
  textOnlyToolRecovery: `export function clearTextOnlyToolRecovery(){} export function markTextOnlyToolRecoveryUsed(){}
    export const shouldForceToolRecovery=async()=>false, buildToolRecoveryNudgeMessage=()=>'';`,
  slashSkills: `export const buildBrowserAssistantSystemPromptParts=async()=>({systemContent:'',basePrompt:'',skillSection:''});`,
};
const bundle = await build({
  stdin: { contents: `export { LlmService } from './src/services/chat/llm/llmService.ts';
    export { AnthropicClaudeService } from './src/services/chat/llm/anthropicClaudeService.ts';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  banner: { js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(resolve('package.json'))});` },
  plugins: [{ name: 'isolated-tool-callbacks', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      const name = args.path.split('/').at(-1)!.replace(/\.ts$/, '');
      return name in mocks ? { path: name, namespace: 'fixture' } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const services = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
type Kind = 'openai' | 'claude';
const savedFetch = globalThis.fetch;
const savedLog = console.log, savedWarn = console.warn, savedError = console.error;
let checks = 0;
function tools(kind: Kind, args: string) {
  return kind === 'openai'
    ? `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'browser_get_current_tab', arguments: args } }] } }] })}\n\ndata: [DONE]\n\n`
    : `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"browser_get_current_tab"}}\n\n` +
      `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: args } })}\n\n` +
      `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`;
}
function final(kind: Kind) {
  return kind === 'openai'
    ? 'data: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n'
    : 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';
}
function queue(...bodies: string[]) {
  let requests = 0;
  globalThis.fetch = async () => { requests++; assert.ok(bodies.length, 'unexpected model request'); return new Response(bodies.shift()!); };
  return () => requests;
}
function make(kind: Kind, runTool: (controller: AbortController) => Promise<unknown>, callbackFails = false) {
  const Base = kind === 'openai' ? services.LlmService : services.AnthropicClaudeService;
  const processed: any[][] = [], calls: any[] = [], results: any[] = [], errors: Error[] = [], events: string[] = [];
  const controller = new AbortController();
  class FixtureService extends Base {
    async fetchOptions() { return {}; }
    getName() { return 'fixture'; }
    async processToolResults(_id: string, toolResults: any[]) { processed.push(toolResults); }
  }
  const service = new FixtureService('', 'fixture', { callTool: async (...args: any[]) => { calls.push(args); return runTool(controller); } });
  const callbacks = {
    onConversationStart() {}, onConversationDone() { events.push('conversation-done'); },
    onMessageStart() {}, onMessageDone() { events.push('message-done'); }, onTextMessage() {},
    onToolCallStart() { events.push('tool-start'); },
    async onToolCallOverride(_id: string, _msg: string, _tool: any, result: unknown) {
      events.push('tool-result'); results.push(result);
      if (callbackFails) throw new Error('fixture callback failure');
      return undefined;
    },
    onToolCallDone() { events.push('tool-done'); },
    async onMessageError(_id: string, _msg: string, error: Error) { errors.push(error); events.push('error'); },
  };
  const run = () => service.sendMessage('fixture-conversation', '', '', '', '', 'Read the page', callbacks, controller.signal);
  return { run, controller, processed, calls, results, errors, events, callbacks };
}
async function check(name: string, run: () => Promise<void>) { await run(); checks++; savedLog(`PASS ${name}`); }
try {
  console.log = console.warn = console.error = () => {};
  for (const kind of ['openai', 'claude'] as const) {
    await check(`${kind}: success keeps the actual call arguments, timeout and result`, async () => {
      const value = { ok: true, title: 'fixture' };
      const fixture = make(kind, async () => ({ content: [{ type: 'text', text: `__JSON__${JSON.stringify(value)}` }] }));
      const requests = queue(tools(kind, '{"timeoutMs":1234,"conversationId":"wrong"}'), final(kind));
      await fixture.run();
      assert.equal(requests(), 2); assert.equal(fixture.calls.length, 1);
      assert.deepEqual(fixture.calls[0], [{ name: 'browser_get_current_tab', arguments: { timeoutMs: 1234, conversationId: 'fixture-conversation' } }, undefined, { timeout: 1234, maxTotalTimeout: 1234 }]);
      assert.deepEqual(fixture.results, [value]); assert.deepEqual(fixture.processed[0][0].result, value);
      assert.deepEqual(fixture.events.slice(0, 3), ['tool-start', 'tool-result', 'tool-done']);
      assert.equal(fixture.errors.length, 0);
    });
    await check(`${kind}: invalid arguments publish failure evidence without executing a tool`, async () => {
      const fixture = make(kind, async () => { throw new Error('invalid arguments must not execute'); });
      const requests = queue(tools(kind, '{invalid'), final(kind));
      await fixture.run();
      assert.equal(requests(), 2); assert.equal(fixture.calls.length, 0);
      assert.equal(fixture.results.length, 1); assert.equal(fixture.results[0].ok, false);
      assert.match(fixture.results[0].error, /参数 JSON 无效/);
      const originalModelResult = JSON.parse(fixture.processed[0][0].result.content[0].text);
      assert.deepEqual(originalModelResult, { ok: false, error: fixture.results[0].error });
      assert.deepEqual(fixture.events.slice(0, 3), ['tool-start', 'tool-result', 'tool-done']);
      assert.equal(fixture.errors.length, 0);
    });
    for (const failure of ['call-throw', 'decode-throw', 'callback-throw'] as const) {
      await check(`${kind}: ${failure} keeps the original error and reports the failed tool once`, async () => {
        const original = new Error('fixture call failed');
        const fixture = make(kind, async () => {
          if (failure === 'decode-throw') return { content: [{ type: 'text', text: '__JSON__{invalid' }] };
          throw original;
        }, failure === 'callback-throw');
        const requests = queue(tools(kind, '{}'));
        await fixture.run();
        assert.equal(requests(), 1); assert.equal(fixture.calls.length, 1); assert.equal(fixture.processed.length, 0);
        assert.equal(fixture.results.length, 1); assert.equal(fixture.results[0].ok, false);
        assert.equal(fixture.errors.length, 1);
        if (failure === 'decode-throw') assert.equal(fixture.errors[0].name, 'SyntaxError');
        else assert.equal(fixture.errors[0], original);
        assert.equal(fixture.results[0].error, fixture.errors[0].message);
        assert.deepEqual(fixture.events, ['tool-start', 'tool-result', 'tool-done', 'error', 'conversation-done']);
      });
    }
    await check(`${kind}: cancellation keeps the pending tool distinct from execution failure`, async () => {
      const fixture = make(kind, async (controller) => { controller.abort(); throw new Error('cancelled fixture'); });
      const requests = queue(tools(kind, '{}'));
      await fixture.run();
      assert.equal(requests(), 1); assert.equal(fixture.calls.length, 1); assert.equal(fixture.processed.length, 0);
      assert.deepEqual(fixture.results, []); assert.deepEqual(fixture.errors, []);
      assert.deepEqual(fixture.events, ['tool-start', 'conversation-done']);
      assert.equal(fixture.controller.signal.aborted, true);
    });
    await check(`${kind}: completion waits for the asynchronous error callback`, async () => {
      const fixture = make(kind, async () => { throw new Error('fixture call failed'); });
      queue(tools(kind, '{}'));
      let started!: () => void, release!: () => void, finished = false;
      const errorStarted = new Promise<void>((done) => { started = done; });
      const gate = new Promise<void>((done) => { release = done; });
      fixture.callbacks.onMessageError = async () => { fixture.events.push('error-start'); started(); await gate; fixture.events.push('error-finished'); };
      const completed = fixture.run().then(() => { finished = true; });
      await errorStarted;
      assert.equal(finished, false); assert.equal(fixture.events.includes('conversation-done'), false);
      release(); await completed;
      assert.deepEqual(fixture.events.slice(-3), ['error-start', 'error-finished', 'conversation-done']);
    });
  }
} finally {
  globalThis.fetch = savedFetch;
  console.log = savedLog; console.warn = savedWarn; console.error = savedError;
}
savedLog(`Tool call error checks passed (${checks}; no browser or paid model requests).`);
