// Run: node --import tsx scripts/test-provider-tool-choice.ts
// Exercise the actual request builders without a browser, credentials, or model calls.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const mocks: Record<string, string> = {
  contextManager: `export const CONTEXT_LIMITS={MAX_MESSAGES:40,TOKEN_WARNING:100000};
    export const trimMessages=x=>x; export const estimateMessagesTokens=()=>0;
    export const estimateTokens=x=>String(x).length; export async function prepareLlmHistory(){}
    export async function materializeToolResultContent(_id,x){return x}`,
  contextUsagePersistence: `export async function persistContextUsageRow(){}
    export async function loadContextUsageRow(){return null} export async function deleteContextUsageRow(){}`,
  interactionBlockSendHints: `export const prepareUserSendText=x=>x;`,
  askModeToolPolicy: `export const isAskModeRound=()=>false; export const isAskBlockedPageTool=()=>false;
    export const buildAskPageToolBlockedPayload=()=>({}); export const getLastUserVisibleGoal=()=>'';`,
  textOnlyToolRecovery: `export function clearTextOnlyToolRecovery(){} export function markTextOnlyToolRecoveryUsed(){}
    export async function shouldForceToolRecovery(){return false}
    export const buildToolRecoveryNudgeMessage=()=>'';`,
  browserToolRuntimeClient: `export async function callBrowserToolViaRuntime(){throw new Error('Unexpected tool execution')}`,
  slashSkills: `export async function buildBrowserAssistantSystemPromptParts(){
    return {systemContent:'fixture system',basePrompt:'fixture system',skillSection:''}}`,
};

const savedFetch = globalThis.fetch;
const savedLog = console.log;
let checks = 0;
globalThis.fetch = async () => { throw new Error('Provider tests must not make network requests'); };

try {
  const bundled = await build({
    stdin: { contents: `export { OpenAICompatibleService } from './src/services/chat/llm/openaiCompatibleService.ts';
      export { QwenService } from './src/services/chat/llm/qwenService.ts';
      export { AnthropicClaudeService } from './src/services/chat/llm/anthropicClaudeService.ts';
      export { resolveCompatibleToolChoice } from './src/services/chat/llm/toolChoiceCompatibility.ts';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
    banner: { js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(resolve('package.json'))});` },
    plugins: [{ name: 'isolated-browser-dependencies', setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        const name = args.path.split('/').at(-1)!.replace(/\.ts$/, '');
        return name in mocks ? { path: name, namespace: 'fixture' } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const services = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const tools = [{ type: 'function', function: { name: 'browser_get_current_tab', parameters: { type: 'object', properties: {} } } }];
  const client = { getLlmTools: async () => tools };
  const history = [
    { role: 'user', content: 'Read the current page' },
    { role: 'assistant', content: 'Checking the page', reasoning_content: 'fixture reasoning',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'browser_get_current_tab', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
  ];
  const named = { type: 'function', function: { name: 'browser_get_current_tab' } };
  async function check(name: string, run: () => Promise<void> | void) {
    await run(); checks++; savedLog(`PASS ${name}`);
  }
  function compatible(endpoint: string, model = 'deepseek-flash', extraBody: Record<string, unknown> = {}, withTools = true) {
    return new services.OpenAICompatibleService('', model, withTools ? client : { getLlmTools: async () => [] }, endpoint, { extraBody });
  }
  async function bodyFor(service: any, required = false, messages = history) {
    if (required) service.toolChoiceForNextRequest = 'required';
    const options = await service.fetchOptions('fixture-provider', '', '', '', '', messages);
    return JSON.parse(options.body);
  }

  await check('official DeepSeek thinking/default modes omit forced tool choices', async () => {
    for (const endpoint of ['https://api.deepseek.com', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/v1/chat/completions']) {
      for (const extraBody of [{}, { thinking: { type: 'enabled' } }, { reasoning_effort: 'high' }, { enable_thinking: false },
        { thinking: { type: 'enabled' }, reasoning_effort: 'none' },
        { thinking: { type: 'disabled' }, reasoning_effort: 'high' }]) {
        const body = await bodyFor(compatible(endpoint, 'deepseek-flash', extraBody), true);
        assert.equal(body.tool_choice, undefined);
        assert.deepEqual(body.tools, tools);
        for (const [key, value] of Object.entries(extraBody)) assert.deepEqual(body[key], value);
      }
    }
  });
  await check('explicit DeepSeek non-thinking modes preserve required tool choice', async () => {
    for (const extraBody of [{ thinking: { type: 'disabled' } }, { reasoning_effort: 'none' },
      { thinking: { type: 'disabled' }, reasoning_effort: 'none' }]) {
      const body = await bodyFor(compatible('https://api.deepseek.com/v1', 'deepseek-flash', extraBody), true);
      assert.equal(body.tool_choice, 'required'); assert.deepEqual(body.tools, tools);
      for (const [key, value] of Object.entries(extraBody)) assert.deepEqual(body[key], value);
    }
  });
  await check('DeepSeek explicit named/required choices are gated while auto/none remain intact', async () => {
    for (const toolChoice of ['required', named]) {
      const body = await bodyFor(compatible('https://api.deepseek.com/v1', 'deepseek-flash', { tool_choice: toolChoice }));
      assert.equal(body.tool_choice, undefined); assert.deepEqual(body.tools, tools);
    }
    for (const toolChoice of ['auto', 'none']) {
      const body = await bodyFor(compatible('https://api.deepseek.com/v1', 'deepseek-flash', { tool_choice: toolChoice }));
      assert.equal(body.tool_choice, toolChoice);
    }
    const nonThinkingNamed = await bodyFor(compatible('https://api.deepseek.com/v1', 'deepseek-flash', {
      thinking: { type: 'disabled' }, tool_choice: named,
    }));
    assert.deepEqual(nonThinkingNamed.tool_choice, named);
  });
  await check('OpenAI, Qwen, SiliconFlow, relays, and lookalike domains preserve request behavior', async () => {
    for (const [endpoint, model, extraBody] of [
      ['https://api.openai.com/v1', 'gpt-4o', {}],
      ['https://api.openai.com/v1', 'o3-mini', {}],
      ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus', { enable_thinking: false }],
      ['https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3', {}],
      ['https://relay.example.test/v1', 'deepseek-flash', {}],
      ['https://api.deepseek.com.evil.test/v1', 'deepseek-flash', {}],
      ['https://deepseek.example.test/v1', 'deepseek-flash', {}],
    ] as const) {
      const service = compatible(endpoint, model, extraBody);
      const forced = await bodyFor(service, true);
      assert.equal(forced.tool_choice, 'required'); assert.deepEqual(forced.tools, tools);
      const normal = await bodyFor(service);
      assert.equal(normal.tool_choice, undefined);
      const explicit = await bodyFor(compatible(endpoint, model, { ...extraBody, tool_choice: named }));
      assert.deepEqual(explicit.tool_choice, named);
      for (const [key, value] of Object.entries(extraBody)) assert.deepEqual(forced[key], value);
    }
  });
  await check('compatible pending required is consumed exactly once without changing empty-tool behavior', async () => {
    for (const endpoint of ['https://api.deepseek.com/v1', 'https://relay.example.test/v1']) {
      const service = compatible(endpoint);
      const first = await bodyFor(service, true);
      assert.equal(first.tool_choice, endpoint.includes('api.deepseek.com') ? undefined : 'required');
      assert.equal((await bodyFor(service)).tool_choice, undefined);
      const empty = compatible(endpoint, 'deepseek-flash', {}, false);
      const noTools = await bodyFor(empty, true);
      assert.deepEqual(noTools.tools, []);
      assert.equal(noTools.tool_choice, endpoint.includes('api.deepseek.com') ? undefined : 'required');
      assert.equal((await bodyFor(empty)).tool_choice, undefined);
    }
  });
  await check('compatibility leaves budgets, thinking configuration, and protocol history unchanged', async () => {
    const originalHistory = structuredClone(history);
    for (const extraBody of [
      {},
      { thinking: { type: 'enabled' } },
      { thinking: { type: 'disabled' } },
      { reasoning_effort: 'none' },
      { max_tokens: 1234 },
      { max_completion_tokens: 2048 },
      { max_tokens: 9999, max_completion_tokens: 2048 },
    ] as Record<string, unknown>[]) {
      const body = await bodyFor(compatible('https://api.deepseek.com/v1', 'deepseek-flash', extraBody), true);
      assert.equal(body.max_tokens, extraBody.max_tokens ?? 4096);
      assert.equal(body.max_completion_tokens, extraBody.max_completion_tokens);
      assert.equal(body.model, 'deepseek-flash'); assert.equal(body.stream, true);
      assert.deepEqual(body.messages.slice(1), originalHistory);
      assert.deepEqual(history, originalHistory);
    }
  });
  await check('standalone Qwen request still disables thinking and supports a required recovery', async () => {
    const service = new services.QwenService('', 'qwen-plus', client);
    const forced = await bodyFor(service, true);
    assert.equal(forced.enable_thinking, false); assert.equal(forced.tool_choice, 'required');
    assert.deepEqual(forced.tools, tools); assert.equal(forced.max_tokens, 4096);
    assert.deepEqual(forced.messages.slice(1), history);
    assert.equal((await bodyFor(service)).tool_choice, undefined);
  });
  await check('standalone Anthropic request retains its any tool-choice schema and original settings', async () => {
    const service = new services.AnthropicClaudeService('', 'claude-sonnet-4-20250514', client);
    const forced = await bodyFor(service, true, [{ role: 'user', content: 'Read the current page' }]);
    assert.deepEqual(forced.tool_choice, { type: 'any' });
    assert.equal(forced.max_tokens, 4096); assert.equal(forced.thinking, undefined);
    assert.equal(forced.tools[0].name, 'browser_get_current_tab');
    assert.equal((await bodyFor(service)).tool_choice, undefined);
  });
  await check('policy helper does not infer compatibility from an invalid or unrelated endpoint', () => {
    for (const endpoint of ['not a URL', '', 'https://example.test/api.deepseek.com/v1']) {
      assert.equal(services.resolveCompatibleToolChoice({ endpoint, requestedMode: 'required' }), 'required');
    }
    assert.equal(services.resolveCompatibleToolChoice({ endpoint: 'https://api.deepseek.com/v1', requestedMode: 'auto' }), undefined);
  });
  savedLog(`${checks} provider request checks passed; no model or browser requests made`);
} finally {
  globalThis.fetch = savedFetch;
}
