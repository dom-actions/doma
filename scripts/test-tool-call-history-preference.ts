// Run: node --import tsx scripts/test-tool-call-history-preference.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { readonly, ref } from 'vue';
import ts from 'typescript';

const source = readFileSync('src/services/chat/toolCallHistoryPreference.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const key = 'doma_tool_call_details_enabled';

function fixture(stored: unknown = undefined) {
  const listeners: Array<(changes: any, areaName: string) => void> = [];
  const controls = {
    get: async (): Promise<Record<string, unknown>> => ({ [key]: stored }),
    set: async (values: Record<string, unknown>): Promise<void> => { stored = values[key]; },
  };
  const sandbox = {
    exports: {} as any,
    require(name: string) {
      if (name === 'vue') return { ref, readonly };
      assert.equal(name, '@/services/Context');
      return { getContext: () => ({ browser: { storage: {
        local: {
          get: () => controls.get(),
          set: (values: Record<string, unknown>) => controls.set(values),
        },
        onChanged: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) },
      } } }) };
    },
  };
  runInNewContext(outputText, sandbox);
  return {
    api: sandbox.exports,
    controls,
    listeners,
    change(newValue: unknown, areaName = 'local') {
      for (const listener of listeners) listener({ [key]: { newValue } }, areaName);
    },
  };
}

let checks = 0;
async function check(name: string, run: () => void | Promise<void>) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}

await check('recording stays off until an explicit true has loaded', async () => {
  const { api } = fixture(true);
  assert.equal(api.toolCallDetailsEnabled.value, false);
  assert.equal(await api.loadToolCallDetailsPreference(), true);
});

await check('missing and non-boolean values never opt in', async () => {
  for (const stored of [undefined, null, false, 'true', 'false', 1, {}, []]) {
    const { api } = fixture(stored);
    assert.equal(await api.loadToolCallDetailsPreference(), false);
  }
});

await check('failed reads fall back to off and can be retried', async () => {
  const { api, controls } = fixture(true);
  assert.equal(await api.loadToolCallDetailsPreference(), true);
  controls.get = async () => { throw new Error('unavailable'); };
  assert.equal(await api.loadToolCallDetailsPreference(), false);
  controls.get = async () => ({ [key]: true });
  assert.equal(await api.loadToolCallDetailsPreference(), true);
});

await check('failed saves reject and keep the last confirmed state', async () => {
  const { api, controls } = fixture(false);
  await api.loadToolCallDetailsPreference();
  controls.set = async () => { throw new Error('quota'); };
  await assert.rejects(api.setToolCallDetailsEnabled(true), /quota/);
  assert.equal(api.toolCallDetailsEnabled.value, false);
});

await check('successful saves update the preference without relying on an event', async () => {
  const { api } = fixture();
  await api.setToolCallDetailsEnabled(true);
  assert.equal(api.toolCallDetailsEnabled.value, true);
  await api.setToolCallDetailsEnabled(false);
  assert.equal(api.toolCallDetailsEnabled.value, false);
});

await check('cross-instance changes use local strict booleans and one listener', async () => {
  const { api, change, listeners } = fixture();
  await api.loadToolCallDetailsPreference();
  await api.loadToolCallDetailsPreference();
  assert.equal(listeners.length, 1);
  change(true, 'sync');
  assert.equal(api.toolCallDetailsEnabled.value, false);
  change(true);
  assert.equal(api.toolCallDetailsEnabled.value, true);
  change('true');
  assert.equal(api.toolCallDetailsEnabled.value, false);
  change(true);
  change(undefined);
  assert.equal(api.toolCallDetailsEnabled.value, false);
});

await check('an in-flight stale read cannot overwrite a newer storage event', async () => {
  const { api, controls, change } = fixture();
  let resolveRead!: (value: Record<string, unknown>) => void;
  controls.get = () => new Promise((resolve) => { resolveRead = resolve; });
  const loading = api.loadToolCallDetailsPreference();
  assert.equal(api.loadToolCallDetailsPreference(), loading);
  change(true);
  change(false);
  resolveRead({ [key]: true });
  assert.equal(await loading, false);
});

await check('an in-flight failed read cannot undo a newer confirmed change', async () => {
  const { api, controls, change } = fixture();
  let rejectRead!: (error: Error) => void;
  controls.get = () => new Promise((_resolve, reject) => { rejectRead = reject; });
  const loading = api.loadToolCallDetailsPreference();
  change(true);
  rejectRead(new Error('disconnected'));
  assert.equal(await loading, true);
});

console.log(`Tool-call history preference: ${checks} checks passed.`);
