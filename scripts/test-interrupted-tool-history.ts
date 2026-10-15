// Run: node --import tsx scripts/test-interrupted-tool-history.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { transform } from 'esbuild';
import {
  finishToolCallRecord, interruptToolCallRecord, mergeToolCallRecord,
  serializeToolCallHistory, startToolCallRecord,
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
const names = ['resolveMessageForPersist', 'mergeToolCallIntoList', 'getRecordedToolCalls', 'getVisibleToolCalls', 'getDoingToolCalls',
  'shouldShowToolCallHistory', 'isRenderableChatMessage', 'finalizeInterruptedToolCallHistory', 'queueMessagePersist', 'persistMessageNow',
  'queueOffPanelAssistantUpsert', 'upsertAssistantMessageInIdb',
  'stopTask', 'copyToClipboard', 'onCopyToolCallHistory'];
const callbacks = ['onMessageStart', 'onMessageDone', 'onMessageError', 'onConversationDone'];
const code = (await transform([...names.map(sourceFunction), ...callbacks.map(sourceCallback),
  `globalThis.api = { ${[...names, ...callbacks].join(', ')} };`].join('\n'), { loader: 'ts' })).code;
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const rows = new Map<string, any>();
const queue = new Map<string, Promise<void>>();
let clipboard = '';
let terminalIndex = 0;
let abortions = 0;
const warnings: any[][] = [];
const sandbox: any = {
  console: { log() {}, warn(...args: any[]) { warnings.push(args); } },
  interruptToolCallRecord, mergeToolCallRecord, serializeToolCallHistory,
  messages: { value: [] }, conversationId: { value: 'conv' }, turnMessageIds: [],
  activeStreamMsgId: { value: null }, turnHadError: false, messagePersistQueues: queue, messagePersistConvById: new Map(),
  messagePersistErrors: new Map(), cloneTurnActivityTrace: clone,
  sanitizeAssistantUserFacing: (value: string) => value,
  readChatMessageProcessMeta: () => undefined, CHAT_MESSAGE_PROCESS_META_KEY: '__stayProcessMeta',
  toolCallCopyFeedback: { value: {} }, window: { setTimeout() {} },
  navigator: { clipboard: { async writeText(value: string) { clipboard = value; } } },
  document: {},
  abortControllersByConversation: new Map(), cancelled: { value: false },
  pendingSummarizeReplayByConversation: new Map(), summarizeCompactSucceeded: new Set(),
  t: (key: string) => key, isConversationLoading: () => true,
  setConversationLoading() {}, setConversationThinking() {}, startActivityTrace() {}, finishActivityTrace() {},
  notifySwAbortTools() {}, safariShellOnStop() {}, safariShellOnTurnDone() {}, takeHandoffPending: () => false,
  terminalReports: [], reportMcpOnce(...args: unknown[]) { sandbox.terminalReports.push(args); }, recordScheduledRunResult() {},
  isSseIdleTimeoutError: (error: Error) => error.name === 'SseIdleTimeoutError',
  isHttpError: (error: Error) => error.name === 'HttpError',
  sendEdition: { async handleHttpError(error: any, handlers: any) { handlers.reportError(error.message); await handlers.stopTask(error.message); } },
  getMessageById: (id: string) => sandbox.messages.value.find((row: any) => row.id === id),
  chatStorage: {
    async getMessage(id: string) { return rows.has(id) ? clone(rows.get(id)) : undefined; },
    async addMessage(row: any) { rows.set(row.id, clone(row)); },
    async updateMessage(id: string, patch: any) {
      if (!rows.has(id)) return false;
      rows.set(id, { ...rows.get(id), ...clone(patch) }); return true;
    },
  },
  async addMessage(convId: string, role: string, content: string) {
    const msg = { id: `terminal-${++terminalIndex}`, conversationId: convId, role, content, toolCalls: [] };
    rows.set(msg.id, clone(msg));
    if (sandbox.conversationId.value === convId) sandbox.messages.value.push(msg);
    return msg.id;
  },
};
runInNewContext(code, sandbox);
let checks = 0;
async function check(name: string, run: () => void | Promise<void>) {
  await run(); checks++; console.log(`PASS ${name}`);
}
const tool = (id: string) => ({ id, function: { name: 'browser_execute_script', arguments: '{"script":"return window.subtitle"}' } });
function call(id: string, failed = false) {
  return { ...mergeToolCallRecord(startToolCallRecord(tool(id)), finishToolCallRecord(tool(id),
    failed ? { ok: false, error: 'No captions' } : { ok: true, subtitle: { body: [{ content: id }] } })), state: 'gone' };
}
function reset(onPanel = true) {
  rows.clear(); queue.clear(); sandbox.messages.value = [];
  sandbox.conversationId.value = onPanel ? 'conv' : 'other'; sandbox.turnMessageIds.length = 0;
  sandbox.terminalReports.length = 0; sandbox.cancelled.value = false; sandbox.turnHadError = false; sandbox.abortControllersByConversation.clear();
  sandbox.messagePersistErrors.clear();
  sandbox.messagePersistConvById.clear();
  clipboard = ''; sandbox.toolCallCopyFeedback.value = {};
  warnings.length = 0;
}
function add(row: any) {
  const message = { conversationId: 'conv', role: 'assistant', content: '', toolCalls: [], ...row };
  rows.set(message.id, clone(message));
  if (sandbox.conversationId.value === message.conversationId) sandbox.messages.value.push(message);
  return message;
}
function fixture(onPanel = true) {
  reset(onPanel);
  add({ id: 'old', toolCalls: [call('old-tool')], toolBarItems: [{ type: 'copy', msgIds: ['old'] }] });
  add({ id: 'root', activityTrace: { status: 'error' }, toolCalls: [call('one'), call('two', true)] });
  add({ id: 'second', toolCalls: [call('three'), call('four')] });
  add({ id: 'third', toolCalls: [startToolCallRecord(tool('five'))] });
  for (const id of ['root', 'second', 'third', 'failed-request']) sandbox.api.onMessageStart('conv', id);
  sandbox.abortControllersByConversation.set('conv', { abort() { abortions++; } });
}

await check('HTTP failure callback preserves all five calls beneath its error notice', async () => {
  fixture();
  const failure = Object.assign(new Error('Thinking mode does not support this tool_choice'), { name: 'HttpError', status: 400 });
  await sandbox.api.onMessageError('conv', 'failed-request', failure);
  const terminal = sandbox.messages.value.at(-1);
  assert.equal(terminal.content, failure.message);
  assert.equal(terminal.toolCalls.length, 5);
  assert.equal(terminal.toolCalls[1].details.status, 'error');
  assert.equal(terminal.toolCalls[1].details.error.value, 'No captions');
  assert.equal(terminal.toolCalls[4].details.status, 'stopped');
  assert.ok(terminal.toolCalls.every((entry: any) => entry.state === 'visible'));
  assert.equal(sandbox.api.shouldShowToolCallHistory(terminal), true);
  assert.equal(sandbox.api.shouldShowToolCallHistory(sandbox.messages.value.find((row: any) => row.id === 'root')), false);
  assert.equal(sandbox.api.shouldShowToolCallHistory(sandbox.messages.value.find((row: any) => row.id === 'second')), false);
  assert.ok(abortions > 0);
});
await check('actual copy action includes failed and interrupted evidence after JSON persistence', async () => {
  const terminal = clone(rows.get(sandbox.messages.value.at(-1).id));
  await sandbox.api.onCopyToolCallHistory(terminal);
  const copied = JSON.parse(clipboard);
  assert.equal(copied.length, 5);
  assert.equal(copied[1].details.error.value, 'No captions');
  assert.equal(copied[4].details.status, 'stopped');
  assert.equal(copied[3].details.output.value.subtitle.body[0].content, 'four');
  assert.equal(rows.get('old').toolCalls.length, 1);
  assert.equal(rows.get('old').toolCalls[0].id, 'old-tool');
});
await check('edition soft errors preserve history without adding a suppressed assistant notice', async () => {
  fixture();
  const handle = sandbox.sendEdition.handleHttpError;
  const before = terminalIndex;
  sandbox.sendEdition.handleHttpError = async (_error: unknown, handlers: any) => {
    await handlers.stopTask(undefined, { skipAssistantMessage: true });
  };
  try {
    const error = Object.assign(new Error('Soft failure'), { name: 'HttpError', status: 429 });
    await sandbox.api.onMessageError('conv', 'failed-request', error);
    assert.equal(terminalIndex, before, 'suppressed notice must not create an assistant bubble');
    assert.equal(rows.get('third').toolCalls.length, 5);
    assert.equal(rows.get('third').toolCalls[4].details.status, 'stopped');
    assert.equal(sandbox.api.shouldShowToolCallHistory(sandbox.messages.value.at(-1)), true);
    assert.equal(sandbox.cancelled.value, false);
  } finally { sandbox.sendEdition.handleHttpError = handle; }
});
await check('error history also works without the optional activity-trace feature', async () => {
  fixture();
  delete rows.get('root').activityTrace;
  delete sandbox.messages.value.find((row: any) => row.id === 'root').activityTrace;
  await sandbox.api.onMessageError('conv', 'failed-request', new Error('Request rejected'));
  const terminal = sandbox.messages.value.at(-1);
  assert.equal(terminal.toolCalls.length, 5);
  assert.equal(sandbox.api.shouldShowToolCallHistory(terminal), true);
  assert.equal(sandbox.api.shouldShowToolCallHistory(sandbox.messages.value.find((row: any) => row.id === 'root')), false);
});
await check('off-panel error awaits pending evidence and does not mutate a different panel', async () => {
  fixture(false);
  const other = add({ id: 'unrelated', conversationId: 'other', content: 'untouched', toolCalls: [call('other-tool')] });
  let release!: () => void;
  queue.set('third', new Promise<void>((resolve) => { release = resolve; }).then(() => {
    rows.get('third').toolCalls[0] = call('five');
  }));
  const failure = sandbox.api.onMessageError('conv', 'failed-request', new Error('Connection failed'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(rows.get('third').toolCalls[0].details.status, 'running');
  release(); await failure;
  const terminal = rows.get(`terminal-${terminalIndex}`);
  assert.equal(terminal.toolCalls.length, 5);
  assert.equal(terminal.toolCalls[4].details.status, 'completed');
  assert.equal(sandbox.messages.value.length, 1);
  assert.deepEqual(clone(sandbox.messages.value[0]), clone(other));
});
await check('repeated finalization deduplicates by call id and retains source evidence', async () => {
  const terminalId = `terminal-${terminalIndex}`;
  await sandbox.api.finalizeInterruptedToolCallHistory('conv', ['root', 'root', 'second', 'third', terminalId], terminalId);
  assert.equal(rows.get(terminalId).toolCalls.length, 5);
  assert.equal(rows.get('root').toolCalls[1].details.error.value, 'No captions');
});
await check('cancelled conversation callback saves a single visible terminal history', async () => {
  fixture();
  sandbox.cancelled.value = true;
  sandbox.api.onConversationDone('conv', ['root', 'second', 'third', 'missing-request']);
  // The callback dispatches async finalization; wait only for this test's microtasks.
  for (let tick = 0; tick < 80; tick++) await Promise.resolve();
  const terminal = rows.get('third');
  assert.equal(terminal.toolCalls.length, 5);
  assert.equal(terminal.toolCalls[4].details.status, 'stopped');
  assert.equal(sandbox.api.shouldShowToolCallHistory(sandbox.messages.value.find((row: any) => row.id === 'third')), true);
});
await check('off-panel cancellation stores the same history without depending on UI arrays', async () => {
  fixture(false);
  sandbox.cancelled.value = true;
  sandbox.api.onConversationDone('conv', ['root', 'second', 'third']);
  for (let tick = 0; tick < 80; tick++) await Promise.resolve();
  const terminal = rows.get('third');
  assert.equal(terminal.toolCalls.length, 5);
  assert.equal(terminal.toolCalls[4].details.status, 'stopped');
  assert.equal(sandbox.messages.value.length, 0);
});
await check('delayed onMessageDone persistence cannot overwrite cancelled aggregate history', async () => {
  fixture();
  const update = sandbox.chatStorage.updateMessage;
  let release!: () => void;
  let observed!: () => void;
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { observed = resolve; });
  let holdFirst = true;
  sandbox.chatStorage.updateMessage = async (id: string, patch: any) => {
    if (id === 'third' && holdFirst) { holdFirst = false; observed(); await paused; }
    return update(id, patch);
  };
  try {
    sandbox.api.onMessageDone('conv', 'third');
    await entered;
    const finalizing = sandbox.api.finalizeInterruptedToolCallHistory('conv', ['root', 'second', 'third']);
    for (let tick = 0; tick < 15; tick++) await Promise.resolve();
    assert.equal(rows.get('third').toolCalls.length, 1);
    release(); await finalizing;
    await Promise.all([...queue.values()]);
    assert.equal(rows.get('third').toolCalls.length, 5);
    assert.equal(rows.get('third').toolCalls[4].details.status, 'stopped');
    assert.ok(rows.get('third').toolBarItems?.length);
  } finally { sandbox.chatStorage.updateMessage = update; }
});
await check('late queued background patches execute after terminal aggregation and retain all calls', async () => {
  fixture(false);
  let release!: () => void;
  let observed!: () => void;
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { observed = resolve; });
  const update = sandbox.chatStorage.updateMessage;
  let held = false;
  sandbox.chatStorage.updateMessage = async (id: string, patch: any) => {
    if (id === 'third' && patch.toolBarItems && !held) { held = true; observed(); await paused; }
    return update(id, patch);
  };
  try {
    const finalizing = sandbox.api.finalizeInterruptedToolCallHistory('conv', ['root', 'second', 'third']);
    await entered;
    const aggregateQueue = queue.get('third');
    assert.ok(aggregateQueue);
    sandbox.api.queueOffPanelAssistantUpsert('conv', 'third', 'late progress');
    const latePatch = queue.get('third');
    assert.notEqual(latePatch, aggregateQueue);
    release(); await finalizing; await latePatch;
    assert.equal(rows.get('third').toolCalls.length, 5);
    assert.equal(rows.get('third').content, 'late progress');
    assert.ok(rows.get('third').toolBarItems?.length);
  } finally { sandbox.chatStorage.updateMessage = update; }
});
await check('a live terminal notice missing from storage is recreated with all history', async () => {
  fixture();
  const add = sandbox.addMessage;
  sandbox.addMessage = async (...args: any[]) => {
    const id = await add(...args);
    rows.delete(id); // The initial addMessage persisted no row but still returned its UI id.
    return id;
  };
  try {
    await sandbox.api.onMessageError('conv', 'failed-request', new Error('HTTP failure'));
    const terminal = sandbox.messages.value.at(-1);
    const saved = rows.get(terminal.id);
    assert.equal(saved.content, 'HTTP failure');
    assert.equal(saved.conversationId, 'conv');
    assert.equal(saved.toolCalls.length, 5);
    assert.equal(saved.toolCalls[1].details.error.value, 'No captions');
    assert.ok(saved.toolBarItems?.length);
  } finally { sandbox.addMessage = add; }
});
await check('auxiliary history storage failure does not replace the original model failure', async () => {
  fixture(false);
  const read = sandbox.chatStorage.getMessage;
  sandbox.chatStorage.getMessage = async (id: string) => {
    if (id === 'root') throw new Error('Storage unavailable');
    return read(id);
  };
  try {
    const original = Object.assign(new Error('Thinking mode does not support this tool_choice'), { name: 'HttpError', status: 400 });
    await assert.doesNotReject(sandbox.api.onMessageError('conv', 'failed-request', original));
    assert.equal(rows.get(`terminal-${terminalIndex}`).content, original.message);
    assert.ok(warnings.some((entry) => String(entry[0]).includes('failed-turn tool history finalization failed')));
    assert.equal(sandbox.cancelled.value, false);
  } finally { sandbox.chatStorage.getMessage = read; }
});
await check('runtime tool scaffolding stays hidden until terminal history is ready', () => {
  reset();
  const intermediate = add({ id: 'runtime-intermediate', toolCalls: [startToolCallRecord(tool('runtime'))] });
  assert.equal(sandbox.api.shouldShowToolCallHistory(intermediate), false);
  assert.equal(sandbox.api.isRenderableChatMessage(intermediate), false);
  intermediate.toolCalls[0].state = 'visible';
  assert.equal(sandbox.api.shouldShowToolCallHistory(intermediate), true);
  assert.equal(sandbox.api.isRenderableChatMessage(intermediate), true);
});
await check('provider done after an error cannot overwrite the terminal history', async () => {
  fixture();
  await sandbox.api.onMessageError('conv', 'failed-request', new Error('fixture failure'));
  const terminal = clone(rows.get(sandbox.messages.value.at(-1).id));
  await sandbox.api.onConversationDone('conv', ['root', 'second', 'third', 'failed-request']);
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.all(queue.values());
  assert.ok(sandbox.terminalReports.every((entry: any[]) => entry[0] !== true), 'error must not later be reported as success');
  assert.deepEqual(rows.get(terminal.id), terminal);
  assert.equal(terminal.toolCalls.length, 5);
});
await check('foreign conversation IDs and failures without tools do not invent history', async () => {
  reset(false);
  add({ id: 'foreign', conversationId: 'other', toolCalls: [call('foreign')] });
  add({ id: 'empty', content: 'No result' });
  await sandbox.api.finalizeInterruptedToolCallHistory('conv', ['foreign', 'empty']);
  assert.equal(rows.get('empty').toolBarItems, undefined);
  assert.equal(rows.get('foreign').toolCalls.length, 1);
});
await check('foreign live source and terminal IDs cannot be relabelled through the conversation map', async () => {
  reset(false);
  const foreign = add({ id: 'foreign', conversationId: 'other', toolCalls: [call('foreign-tool')] });
  sandbox.messagePersistConvById.set('foreign', 'other');
  add({ id: 'valid', toolCalls: [call('valid-tool')] });
  const before = clone(foreign);
  await sandbox.api.finalizeInterruptedToolCallHistory('conv', ['foreign', 'valid'], 'foreign');
  assert.deepEqual(clone(sandbox.messages.value[0]), before);
  assert.equal(rows.get('foreign').toolCalls[0].id, 'foreign-tool');
  assert.equal(rows.get('foreign').toolBarItems, undefined);
  assert.equal(sandbox.messagePersistConvById.get('foreign'), 'other');
  assert.equal(rows.get('valid').toolCalls.length, 1);
  assert.equal(rows.get('valid').toolCalls[0].id, 'valid-tool');
  assert.ok(rows.get('valid').toolBarItems?.length);
});
console.log(`Passed ${checks} interrupted-tool-history checks.`);
