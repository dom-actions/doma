// Run: node --import tsx scripts/test-sse-fetcher.ts
import assert from 'node:assert/strict';
import * as sse from '../src/services/chat/sseFetcher.ts';
import { fetchAnthropicSSE } from '../src/services/chat/anthropicSseFetcher.ts';

const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();
let checks = 0;

async function check(name: string, run: () => Promise<void>): Promise<void> {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}

function streamResponse(chunks: string[], keepOpen = false) {
  let cancelled = false;
  let finish = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!keepOpen) controller.close();
      else finish = () => { if (!cancelled) controller.close(); };
    },
    cancel() { cancelled = true; },
  });
  return { response: new Response(body), wasCancelled: () => cancelled, finish };
}

async function collect(events: AsyncGenerator<sse.SseEvent>) {
  const result: sse.SseEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

const parsers = [sse.fetchSSE, fetchAnthropicSSE];

try {
  await check('OpenAI final frame without newline preserves text and tools', async () => {
    const source = streamResponse([
      'data: {"choices":[{"delta":{"content":"最后一段"}}]}\r\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"read","arguments":"{}"}}]}}]}',
    ]);
    globalThis.fetch = async () => source.response;
    const events = await collect(sse.fetchSSE('https://example.test', {}, 'openai'));
    assert.equal(events.find((event) => event.type === 'text')?.content, '最后一段');
    assert.equal(events.find((event) => event.type === 'tool_call')?.toolCalls?.[0].id, 'call-1');
    assert.equal(events.at(-1)?.type, 'done');
  });

  await check('Anthropic final frame without newline preserves text', async () => {
    globalThis.fetch = async () => streamResponse([
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"尾部文本"}}',
    ]).response;
    const events = await collect(fetchAnthropicSSE('https://example.test', {}, 'anthropic'));
    assert.equal(events.find((event) => event.type === 'text')?.content, '尾部文本');
    assert.equal(events.at(-1)?.type, 'done');
  });

  await check('normal chunk reading and short idle timeout cancel the reader', async () => {
    const normal = streamResponse(['chunk']).response.body!.getReader();
    assert.equal(new TextDecoder().decode((await sse.readStreamChunkWithIdleTimeout(normal, 20)).value), 'chunk');
    assert.equal((await sse.readStreamChunkWithIdleTimeout(normal, 20)).done, true);
    normal.releaseLock();
    const stalled = streamResponse([], true);
    const reader = stalled.response.body!.getReader();
    await assert.rejects(sse.readStreamChunkWithIdleTimeout(reader, 15), sse.SseIdleTimeoutError);
    assert.equal(stalled.wasCancelled(), true);
    reader.releaseLock();
  });

  await check('terminal markers finish both providers without waiting for EOF', async () => {
    const originalTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) =>
      originalTimeout(callback, ms === sse.SSE_IDLE_TIMEOUT_MS ? 30 : ms, ...args)) as typeof setTimeout;
    try {
      const frames = ['data: [DONE]\n\n', 'event: message_stop\ndata: {"type":"message_stop"}\n\n'];
      for (let index = 0; index < parsers.length; index++) {
        const source = streamResponse([frames[index]], true);
        globalThis.fetch = async () => source.response;
        assert.deepEqual((await collect(parsers[index]('https://example.test', {}, 'terminal'))).map((event) => event.type), ['done']);
        assert.equal(source.wasCancelled(), true);
      }
    } finally {
      globalThis.setTimeout = originalTimeout;
    }
  });

  await check('both providers abort a pending read promptly without a done event', async () => {
    for (const parser of parsers) {
      const source = streamResponse([], true);
      globalThis.fetch = async () => source.response;
      const controller = new AbortController();
      const events = collect(parser('https://example.test', {}, 'abort', controller.signal));
      setTimeout(() => controller.abort(), 5);
      let watchdog: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('Pending read did not abort within 100ms')), 100);
      });
      try {
        assert.deepEqual(await Promise.race([events, deadline]), []);
        assert.equal(source.wasCancelled(), true);
      } finally {
        clearTimeout(watchdog!);
        source.finish();
      }
    }
  });

  await check('malformed final frames and reader failures cannot become success', async () => {
    for (const parser of parsers) {
      globalThis.fetch = async () => streamResponse(['data: {"choices":']).response;
      await assert.rejects(collect(parser('https://example.test', {}, 'malformed')), SyntaxError);
      globalThis.fetch = async () => new Response(new ReadableStream({
        start(controller) { controller.error(new Error('connection lost')); },
      }));
      await assert.rejects(collect(parser('https://example.test', {}, 'read-failure')), /connection lost/);
    }
  });

  await check('both providers reject stream errors including a final unterminated frame', async () => {
    const frames = [
      'data: {"error":{"message":"OpenAI unavailable"}}',
      'event: error\ndata: {"type":"error","error":{"message":"Anthropic unavailable"}}',
    ];
    for (let index = 0; index < parsers.length; index++) {
      globalThis.fetch = async () => streamResponse([frames[index]]).response;
      await assert.rejects(collect(parsers[index]('https://example.test', {}, 'error')), /unavailable/);
    }
  });

  await check('both providers preserve HTTP JSON/plain error details and headers', async () => {
    for (const parser of parsers) {
      for (const body of ['{"error":{"message":"quota exceeded"}}', 'quota exceeded']) {
        globalThis.fetch = async () => new Response(body, { status: 429, headers: { 'retry-after': '3' } });
        await assert.rejects(collect(parser('https://example.test', {}, 'http-error')), (error: unknown) => {
          assert.ok(error instanceof sse.HttpError);
          assert.equal(error.status, 429);
          assert.equal(error.headers['retry-after'], '3');
          assert.equal(error.message, 'HTTP 429: quota exceeded');
          return true;
        });
      }
    }
  });

  await check('half-open HTTP error bodies retain status/headers after a bounded idle read', async () => {
    const originalTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) =>
      originalTimeout(callback, ms === sse.SSE_IDLE_TIMEOUT_MS ? 15 : ms, ...args)) as typeof setTimeout;
    try {
      for (const parser of parsers) {
        const source = streamResponse(['{"error":{"message":"quota'], true);
        globalThis.fetch = async () => new Response(source.response.body, { status: 429, headers: { 'retry-after': '7' } });
        await assert.rejects(collect(parser('https://example.test', {}, 'half-open-http')), (error: unknown) => {
          assert.ok(error instanceof sse.HttpError);
          assert.equal(error.status, 429);
          assert.equal(error.headers['retry-after'], '7');
          return true;
        });
        assert.equal(source.wasCancelled(), true);
      }
    } finally {
      globalThis.setTimeout = originalTimeout;
    }
  });

  await check('HTTP error body reads respect abort and cap long diagnostic bodies', async () => {
    for (const parser of parsers) {
      const source = streamResponse([], true);
      globalThis.fetch = async () => new Response(source.response.body, { status: 500 });
      const controller = new AbortController();
      const events = collect(parser('https://example.test', {}, 'abort-http', controller.signal));
      setTimeout(() => controller.abort(), 5);
      let watchdog: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('HTTP error body did not abort within 100ms')), 100);
      });
      try {
        assert.deepEqual(await Promise.race([events, deadline]), []);
        assert.equal(source.wasCancelled(), true);
      } finally {
        clearTimeout(watchdog!);
        source.finish();
      }
      const long = streamResponse(['x'.repeat(8192)], true);
      globalThis.fetch = async () => new Response(long.response.body, { status: 500 });
      await assert.rejects(collect(parser('https://example.test', {}, 'long-http')), (error: unknown) => {
        assert.ok(error instanceof sse.HttpError);
        assert.equal(error.message, `HTTP 500: ${'x'.repeat(800)}`);
        return true;
      });
      assert.equal(long.wasCancelled(), true);
    }
  });

  await check('request credentials, URL query and prompt body stay out of fetcher logs', async () => {
    const entries: unknown[][] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => { entries.push(args); };
    console.error = (...args) => { entries.push(args); };
    try {
      const options = { method: 'POST', headers: { Authorization: 'Bearer header-secret' }, body: 'body-secret' };
      globalThis.fetch = async () => streamResponse(['data: [DONE]\n']).response;
      await collect(sse.fetchSSE('https://example.test?key=query-secret', options, 'logs'));
      globalThis.fetch = async () => streamResponse(['{"choices":[{"delta":{"content":"ok"}}]}']).response;
      await collect(sse.fetchJSONChunk('https://example.test?key=query-secret', options));
      assert.doesNotMatch(JSON.stringify(entries), /header-secret|body-secret|query-secret/);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  await check('Anthropic cumulative usage settles before tools and includes final output tokens', async () => {
    globalThis.fetch = async () => streamResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-usage","name":"read"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]).response;
    const events = await collect(fetchAnthropicSSE('https://example.test', {}, 'usage-tools'));
    assert.deepEqual(events.map((event) => event.type), ['usage', 'tool_call', 'done']);
    assert.equal(events[0].usage?.promptTokens, 12);
    assert.equal(events[0].usage?.completionTokens, 7);
    assert.equal(events[0].usage?.totalTokens, 19);
    assert.equal(events[1].toolCalls?.[0].id, 'call-usage');
  });

  console.log(`SSE fetcher regression checks passed (${checks})`);
} finally {
  globalThis.fetch = originalFetch;
}
