// Run: node scripts/test-tab-handover.ts
// Execute the real panel entry points without browser pages or model requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import * as ts from 'typescript';

const panel = readFileSync('src/components/chat/ChatPanel.vue', 'utf8');
const start = panel.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length;
const script = panel.slice(start, panel.indexOf('</script>', start));
const ast = ts.createSourceFile('ChatPanel.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = ast.statements.filter(ts.isFunctionDeclaration);
const names = ['runTabHandoverIfNeeded', 'applyTabHandover', 'dispatchSidePanelRuntimeMessage'];
const selected = functions.filter(node => names.includes(node.name?.text ?? ''));
assert.equal(selected.length, names.length, 'all real panel entry points must be exercised');
const compiled = (await transform(selected.map(node => node.getText(ast)).join('\n'), {
  loader: 'ts', target: 'es2022',
})).code;
const addListener = functions.find(node => node.name?.text === 'addListener');
assert.ok(addListener?.body);
const assignment = addListener.body.statements.find(node => ts.isExpressionStatement(node)
  && ts.isBinaryExpression(node.expression)
  && node.expression.left.getText(ast) === 'sidePanelRuntimeOnMessageListener');
assert.ok(assignment && ts.isExpressionStatement(assignment) && ts.isBinaryExpression(assignment.expression));
const listenerCode = (await transform(`const listener = ${assignment.expression.right.getText(ast)};`, {
  loader: 'ts', target: 'es2022',
})).code;
let sequence = 0;
let checks = 0;

function fixture(active = true, contexts = new Map<string, any>([
  ['source', { conversationId: 'source', mode: 'single', tabId: 1, lastUserQuestion: 'source task' }],
])) {
  const creates: any[] = [];
  const sends: any[] = [];
  const calls: any[] = [];
  const loading = new Set(active ? ['source'] : []);
  let aborted = 0;
  const env: Record<string, any> = {
    URL, Promise, Map, AbortController, console: { log() {}, warn() {}, error() {} },
    IS_SAFARI_EXT: false, panelWindowId: 1, targetWindowId: 1,
    pendingTabHandovers: new Map(),
    getContext: () => ({ browser: {
      windows: { getCurrent: async () => ({ id: env.panelWindowId }) },
      tabs: { get: async () => ({ windowId: env.targetWindowId }) },
    } }),
    awaitConversationContextPersistenceReady: async () => {},
    replaceConversationMapsFromPersisted() {},
    getConversationIdByTabId: async (id: number) => [...contexts.values()].find(row => row.tabId === id || row.groupTabs?.includes(id))?.conversationId,
    getConversationContext: (id: string) => contexts.get(id),
    isConversationLoading: (id: string) => loading.has(id),
    setConversationLoading: (id: string, active: boolean) => {
      if (active) loading.add(id);
      else loading.delete(id);
    },
    abortControllersByConversation: new Map([['source', { abort() { aborted++; } }]]),
    generateConversationId: () => `child-${++sequence}`,
    upsertConversationContext: (row: any) => {
      if (!contexts.has(row.conversationId)) creates.push(row);
      contexts.set(row.conversationId, { ...contexts.get(row.conversationId), ...row });
    },
    chatStorage: {
      migrateConversationMessages: async () => {},
      deleteMessagesByConversation: async () => {},
    },
    clearDoingToolCallsForConversationInIdb: async () => 0,
    refreshConversationContextList() {},
    conversationId: { value: 'source' },
    loadConversation: async () => {},
    clearDoingToolCallsOnMessages() {}, flushAllMessagePersists: async () => {},
    getConversationCallChain: () => [], formatConversationCallChainLines: () => '',
    send2: (text: string, opts: any) => sends.push({ text, opts }),
    runCallTab: async (payload: any) => calls.push(payload),
  };
  const api = runInNewContext(`${compiled}\n({ runTabHandoverIfNeeded, dispatchSidePanelRuntimeMessage })`, env);
  return { api, env, contexts, creates, sends, calls, loading, get aborted() { return aborted; } };
}

async function check(name: string, run: () => Promise<void>) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
const event = { sourceTabId: 1, id: 2, url: 'https://example.test/child', via: 'webNavigation' };

await check('workspace and other internal pages never clone, abort, or resume a task', async () => {
  for (const url of ['chrome-extension://fixture/workspace/index.html', 'moz-extension://fixture/workspace/index.html', 'about:blank', 'edge://newtab', 'file:///demo.html', 'invalid']) {
    const f = fixture();
    await f.api.runTabHandoverIfNeeded({ ...event, url, resume: true });
    assert.equal(f.creates.length, 0);
    assert.equal(f.sends.length, 0);
    assert.equal(f.aborted, 0);
  }
});

await check('only the executing panel handles a browser-wide navigation event', async () => {
  const contexts = fixture().contexts;
  const panels = [fixture(true, contexts), fixture(false, contexts), fixture(false, contexts)];
  await Promise.all(panels.map(f => f.api.runTabHandoverIfNeeded({ ...event, resume: true })));
  assert.equal(panels.reduce((count, f) => count + f.creates.length, 0), 1);
  assert.equal(panels.reduce((count, f) => count + f.sends.length, 0), 1);
});

await check('a completed or stopped Chrome task cannot be restarted by a late resume message', async () => {
  const f = fixture(false);
  await f.api.runTabHandoverIfNeeded({ ...event, via: 'runtime-message', resume: true });
  assert.equal(f.creates.length, 0);
  assert.equal(f.sends.length, 0);
});

await check('concurrent and later duplicate notifications create one child and one continuation', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.env.chatStorage.migrateConversationMessages = async () => gate;
  const first = f.api.runTabHandoverIfNeeded(event);
  const second = f.api.runTabHandoverIfNeeded({ ...event, via: 'runtime-message', resume: true });
  release();
  await Promise.all([first, second]);
  f.loading.add('source');
  await f.api.runTabHandoverIfNeeded(event);
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
});

await check('concurrent children cannot both take over the same source executor', async () => {
  const f = fixture();
  await Promise.all([
    f.api.runTabHandoverIfNeeded(event),
    f.api.runTabHandoverIfNeeded({ ...event, id: 3 }),
  ]);
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
  assert.equal(f.aborted, 1);
});

await check('a failed handover releases its in-flight slot and can be retried', async () => {
  const f = fixture();
  f.env.chatStorage.migrateConversationMessages = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(f.api.runTabHandoverIfNeeded(event), /storage unavailable/);
  assert.equal(f.env.pendingTabHandovers.size, 0);
  assert.equal(f.creates.length, 0);
  assert.equal(f.aborted, 0);
  f.env.chatStorage.migrateConversationMessages = async () => {};
  await f.api.runTabHandoverIfNeeded(event);
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
});

await check('stopping or replacing the source during persistence prevents continuation', async () => {
  for (const action of ['stop', 'replace']) {
    const f = fixture();
    const discarded: string[] = [];
    f.env.chatStorage.deleteMessagesByConversation = async (id: string) => { discarded.push(id); };
    f.env.chatStorage.migrateConversationMessages = async () => {
      if (action === 'stop') f.loading.delete('source');
      else f.env.abortControllersByConversation.set('source', { abort() {} });
    };
    await f.api.runTabHandoverIfNeeded(event);
    assert.equal(f.creates.length, 0);
    assert.equal(f.sends.length, 0);
    assert.equal(f.aborted, 0);
    assert.equal(discarded.length, 1);
  }
});

await check('stopping the child while its history loads prevents a fresh model request', async () => {
  const f = fixture();
  f.env.loadConversation = async (id: string) => {
    f.env.abortControllersByConversation.get(id)?.abort();
    f.env.abortControllersByConversation.delete(id);
  };
  await f.api.runTabHandoverIfNeeded(event);
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 0);
});

await check('a failed history load releases its temporary controller and pending handover', async () => {
  const f = fixture();
  f.env.loadConversation = async () => { throw new Error('history load failed'); };
  await assert.rejects(f.api.runTabHandoverIfNeeded(event), /history load failed/);
  const child = f.creates[0].conversationId;
  assert.equal(f.env.abortControllersByConversation.has(child), false);
  assert.equal(f.env.pendingTabHandovers.size, 0);
  assert.equal(f.sends.length, 0);
});

await check('a panel switch during history loading cannot redirect the continuation', async () => {
  const f = fixture();
  f.env.loadConversation = async () => { f.env.conversationId.value = 'other-history'; };
  await f.api.runTabHandoverIfNeeded(event);
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].opts.conversationId, f.creates[0].conversationId);
  assert.equal(f.sends[0].opts.siteUrl, event.url);
});

await check('later navigation reaches the live executor after an earlier handover', async () => {
  const f = fixture();
  await f.api.runTabHandoverIfNeeded(event);
  const child = f.creates[0].conversationId;
  f.loading.add(child);
  f.env.abortControllersByConversation.set(child, { abort() { f.loading.delete(child); } });
  await f.api.dispatchSidePanelRuntimeMessage({
    origin: 'background', operate: 'chat/runTabHandover',
    sourceTabId: 2, newTabId: 3, url: 'https://example.test/next', resume: true,
  });
  assert.equal(f.env.panelWindowId, 1);
  assert.equal(f.creates.length, 2);
  assert.equal(f.sends.length, 2);
});

await check('invalid tab IDs cannot create or resume a task', async () => {
  const f = fixture();
  for (const id of [0, -1, 1.5, NaN, Infinity, 1]) {
    await f.api.runTabHandoverIfNeeded({ ...event, id });
  }
  await f.api.runTabHandoverIfNeeded({ ...event, sourceTabId: 0 });
  assert.equal(f.creates.length, 0);
  assert.equal(f.sends.length, 0);
});

await check('active group navigation updates the working tab while its executor continues', async () => {
  const f = fixture();
  f.contexts.set('source', { conversationId: 'source', mode: 'group', groupId: 4, groupTabs: [1], groupWorkingTabId: 1 });
  await f.api.runTabHandoverIfNeeded(event);
  assert.equal(f.contexts.get('source').groupWorkingTabId, 2);
  assert.equal(f.aborted, 0);
  assert.equal(f.sends.length, 0);
});

await check('explicit Safari shell continuation still starts on an external child page', async () => {
  const f = fixture(false);
  f.env.IS_SAFARI_EXT = true;
  await f.api.runTabHandoverIfNeeded({ ...event, via: 'runtime-message', resume: true });
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
});

await check('a call-tab message is executed only in the destination window', async () => {
  const panels = [fixture(false), fixture(false), fixture(false)];
  panels.forEach((f, index) => { f.env.panelWindowId = index + 1; f.env.targetWindowId = 2; });
  const message = { origin: 'background', operate: 'chat/runCallTab', targetTabId: 2, sourceConversationId: 'source', instruction: 'return findings' };
  await Promise.all(panels.map(f => f.api.dispatchSidePanelRuntimeMessage(message)));
  assert.deepEqual(panels.map(f => f.calls.length), [0, 1, 0]);
});

await check('missing destination tabs do not resume a window-level panel', async () => {
  const f = fixture(false);
  f.env.getContext = () => ({ browser: {
    windows: { getCurrent: async () => ({ id: 1 }) },
    tabs: { get: async () => { throw new Error('tab closed'); } },
  } });
  await f.api.dispatchSidePanelRuntimeMessage({
    origin: 'background', operate: 'chat/runCallTab', targetTabId: 2,
    sourceConversationId: 'source', instruction: 'return findings',
  });
  assert.equal(f.calls.length, 0);
  for (const targetTabId of [undefined, 0, -1, 1.5]) {
    await f.api.dispatchSidePanelRuntimeMessage({
      origin: 'background', operate: 'chat/runCallTab', targetTabId,
      sourceConversationId: 'source', instruction: 'return findings',
    });
  }
  assert.equal(f.calls.length, 0);
});

await check('only the source executor acknowledges a cross-window abort request', async () => {
  const controllers = [new Map(), new Map([['source', {}]]), new Map()];
  const acknowledgements: number[] = [];
  const message = { origin: 'background', operate: 'chat/abortForHandover', conversationId: 'source' };
  controllers.forEach((map, index) => {
    const api = runInNewContext(`${listenerCode}\n({listener})`, {
      abortControllersByConversation: map,
      dispatchSidePanelRuntimeMessage: async () => ({ ok: true }),
    });
    const result = api.listener(message, {}, () => { acknowledgements.push(index); });
    assert.equal(result, index === 1 ? true : undefined);
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(acknowledgements, [1]);
});

const toolsText = readFileSync('src/services/chat/browserTools.ts', 'utf8');
const toolsAst = ts.createSourceFile('browserTools.ts', toolsText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const callTabFunction = toolsAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'browser_call_tab');
assert.ok(callTabFunction);
const callTabCode = (await transform(callTabFunction.getText(toolsAst), { loader: 'ts', target: 'es2022' })).code;
await check('call-tab stops the source executor before targeting the destination', async () => {
  const deliveries: any[] = [];
  const api = runInNewContext(`${callTabCode}\n({browser_call_tab})`, {
    console: { log() {} }, isSafariBuild: () => false,
    getContext: () => ({ browser: { tabs: { update: async () => {} } } }),
    sendToSidePanel: async (message: any, opts: any) => { deliveries.push({ message, opts }); },
  });
  await api.browser_call_tab({ conversationId: 'source', targetTabId: 2, instruction: 'return findings' });
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].message.operate, 'chat/abortForHandover');
  assert.equal(deliveries[0].message.conversationId, 'source');
  assert.equal(deliveries[0].opts.tabId, undefined);
  assert.equal(deliveries[1].message.operate, 'chat/runCallTab');
  assert.equal(deliveries[1].opts.tabId, 2);
});

console.log(`Tab handover regression checks passed (${checks}); no model or browser requests made.`);
