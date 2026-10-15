// Run: node --import tsx scripts/test-tool-call-details.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { transform } from 'esbuild';
import {
  finishToolCallRecord, interruptToolCallRecord, mergeToolCallRecord,
  previewToolCallValue, serializeToolCallHistory, startToolCallRecord,
} from '../src/services/chat/toolCallDetails.ts';

const panel = readFileSync('src/components/chat/ChatPanel.vue', 'utf8');
const script = panel.split('<script setup lang="ts">')[1].split('</script>')[0];
const ast = ts.createSourceFile('panel.ts', script, ts.ScriptTarget.Latest, true);
function sourceFunction(name: string): string {
  const node = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, name);
  return node.getText(ast);
}
function sourceCallback(name: string): string {
  let found: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name) found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, name);
  return `const ${name} = ${found.getText(ast)};`;
}
const names = ['mergeToolCallIntoList', 'upsertAssistantMessageInIdb', 'persistMessageNow', 'clearDoingToolCallsInIdb', 'finalizeOffPanelConversationDone', 'getRecordedToolCalls', 'copyToClipboard', 'onCopyToolCallHistory'];
const callbackNames = ['onToolCallStart', 'onToolCallOverride', 'onToolCallDone'];
const code = (await transform([...names.map(sourceFunction), ...callbackNames.map(sourceCallback),
  `globalThis.api = { ${[...names, ...callbackNames].join(', ')} };`].join('\n'), { loader: 'ts' })).code;
const rows = new Map<string, any>();
const live = new Map<string, any>();
const clone = (value: any) => JSON.parse(JSON.stringify(value));
let clipboard = '';
const sandbox: any = {
  console: { log() {}, warn() {} },
  startToolCallRecord, finishToolCallRecord, mergeToolCallRecord, interruptToolCallRecord, serializeToolCallHistory,
  toolCallCopyFeedback: { value: {} }, window: { setTimeout() {} },
  navigator: { clipboard: { async writeText(value: string) { clipboard = value; } } },
  document: { createElement: () => ({ style: {}, focus() {}, select() {} }), execCommand: () => false, body: { appendChild() {}, removeChild() {} } },
  activeStreamMsgId: { value: null }, setConversationThinking() {}, startActivityTool() {}, completeActivityTool() {},
  buildCustomUI: () => undefined,
  cloneTurnActivityTrace: clone, sanitizeAssistantUserFacing: (value: string) => value,
  resolveMessageForPersist: (id: string) => live.has(id) ? { convId: 'conv', msg: live.get(id) } : undefined,
  readChatMessageProcessMeta: () => undefined, CHAT_MESSAGE_PROCESS_META_KEY: '__stayProcessMeta',
  messagePersistErrors: new Map(), messagePersistQueues: new Map(), messagePersistConvById: new Map(),
  chatStorage: {
    async getMessage(id: string) { return rows.has(id) ? clone(rows.get(id)) : undefined; },
    async addMessage(row: any) { rows.set(row.id, clone(row)); },
    async updateMessage(id: string, patch: any) {
      if (!rows.has(id)) return false;
      rows.set(id, { ...rows.get(id), ...clone(patch) }); return true;
    },
  },
};
runInNewContext(code, sandbox);
sandbox.upsertAssistantMessage = (_conv: string, id: string, _text: string, call: any) => {
  const row = live.get(id) ?? { id, role: 'assistant', content: '', toolCalls: [] };
  if (call) row.toolCalls = sandbox.api.mergeToolCallIntoList(row.toolCalls, call);
  live.set(id, row);
};
let checks = 0;
async function check(name: string, run: () => void | Promise<void>) {
  await run(); checks++; console.log(`PASS ${name}`);
}
const call = (id: string) => ({ id, type: 'function', function: { name: 'browser_execute_script', arguments: '{"script":"return { subtitle: { body: [1,2] } }"}' } });

await check('five real callback cycles keep five separate inputs and results, including failure', async () => {
  for (let n = 1; n <= 5; n++) {
    const tool = call(String(n));
    sandbox.api.onToolCallStart('conv', 'tools', tool);
    await sandbox.api.onToolCallOverride('conv', 'tools', tool, n === 2 ? { ok: false, error: 'HTTP 412' } : { ok: true, subtitle: { body: [{ content: `line ${n}`, from: n }] } });
    sandbox.api.onToolCallDone('conv', 'tools', tool);
  }
  const calls = live.get('tools').toolCalls;
  assert.equal(calls.length, 5);
  assert.equal(calls[1].details.status, 'error');
  assert.equal(calls[1].details.error.value, 'HTTP 412');
  assert.ok(calls.every((entry: any) => entry.details.startedAt && entry.details.finishedAt && entry.details.input && entry.details.output));
  assert.equal(calls[4].details.output.value.subtitle.body[0].content, 'line 5');
});
await check('actual on-panel persistence survives JSON roundtrip without activityTrace', async () => {
  await sandbox.api.persistMessageNow('tools');
  assert.deepEqual(rows.get('tools').toolCalls, clone(live.get('tools').toolCalls));
  assert.equal(rows.get('tools').activityTrace, undefined);
});
await check('actual off-panel start/result/done updates and final collection retain evidence', async () => {
  const tool = call('off');
  await sandbox.api.upsertAssistantMessageInIdb('conv', 'off-tools', '', startToolCallRecord(tool));
  await sandbox.api.upsertAssistantMessageInIdb('conv', 'off-tools', '', finishToolCallRecord(tool, { ok: false, message: 'No captions' }));
  await sandbox.api.upsertAssistantMessageInIdb('conv', 'off-tools', '', { id: 'off', name: tool.function.name, state: 'gone' });
  rows.set('answer', { id: 'answer', content: 'answer', toolCalls: [] });
  await sandbox.api.finalizeOffPanelConversationDone('conv', ['off-tools', 'answer']);
  const saved = rows.get('answer').toolCalls[0];
  assert.equal(saved.state, 'visible');
  assert.equal(saved.details.status, 'error');
  assert.equal(saved.details.error.value, 'No captions');
  assert.ok(saved.details.input);
});
await check('interrupted calls do not become successful when visibility changes', () => {
  const record = startToolCallRecord(call('cancelled'));
  interruptToolCallRecord(record);
  assert.equal(mergeToolCallRecord(record, { ...record, state: 'visible' }).details?.status, 'stopped');
});
await check('legacy records remain valid without inventing execution evidence', () => {
  const record = mergeToolCallRecord({ id: 'old', name: 'browser_get_video_caption', state: 'gone' }, { id: 'old', name: 'browser_get_video_caption', state: 'visible' });
  assert.equal(record.details, undefined);
});
await check('preview keeps nested data while limiting large captions and depth', () => {
  const preview = previewToolCallValue({ caption: { body: Array.from({ length: 10_000 }, () => ({ content: 'x'.repeat(10_000) })) } });
  assert.equal(preview.truncated, true);
  assert.ok(JSON.stringify(preview).length < 15_000);
  assert.ok((preview.value as any).caption.body.length > 0);
});
await check('binary payloads and credential fields are omitted, cycles remain serializable', () => {
  const cyclic: any = { apiKey: 'secret', authorization: 'Bearer secret', base64: 'a'.repeat(500_000), image: 'data:image/png;base64,AAA' };
  cyclic.self = cyclic;
  const encoded = JSON.stringify(previewToolCallValue(cyclic));
  assert.ok(!encoded.includes('secret') && !encoded.includes('AAA'));
  assert.ok(encoded.includes('[circular]') && encoded.includes('[binary omitted]'));
});
await check('common credential headers are redacted before persistence and copying', () => {
  const preview = previewToolCallValue({ headers: { 'Set-Cookie': 'fixture-session', 'X-API-Key': 'fixture-key', Authorization: 'fixture-auth', 'Content-Type': 'application/json' } });
  const value = preview.value as any;
  assert.equal(value.headers['Set-Cookie'], '[redacted]');
  assert.equal(value.headers['X-API-Key'], '[redacted]');
  assert.equal(value.headers.Authorization, '[redacted]');
  assert.equal(value.headers['Content-Type'], 'application/json');
});
await check('malformed arguments are preserved as a diagnostic string', () => {
  assert.equal(startToolCallRecord({ id: 'bad', function: { name: 'tool', arguments: '{invalid' } }).details?.input?.value, '{invalid');
});
await check('actual copy action includes all five saved calls and the nested failure evidence', async () => {
  await sandbox.api.onCopyToolCallHistory(live.get('tools'));
  const copied = JSON.parse(clipboard);
  assert.equal(copied.length, 5);
  assert.equal(copied[1].details.error.value, 'HTTP 412');
  assert.equal(copied[4].details.output.value.subtitle.body[0].content, 'line 5');
  assert.equal(sandbox.toolCallCopyFeedback.value.tools, 'copied');
});
await check('clipboard rejection plus failed fallback reports failure rather than copied', async () => {
  sandbox.navigator.clipboard.writeText = async () => { throw new Error('clipboard unavailable'); };
  await sandbox.api.onCopyToolCallHistory(live.get('tools'));
  assert.equal(sandbox.toolCallCopyFeedback.value.tools, 'failed');
});
console.log(`Passed ${checks} tool-call detail checks.`);
