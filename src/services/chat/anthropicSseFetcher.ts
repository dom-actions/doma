/**
 * Anthropic Messages API SSE 解析。
 * 与 OpenAI 的 sseFetcher 并行，互不改动。
 * 对外仍产出统一的 SseEvent（text / tool_call / usage / done），
 * tool_call 形状对齐 OpenAI function calling，便于 UI 回调复用。
 */
import type { LlmTokenUsage } from './llm/contextUsage';
import {
  buildHttpError,
  readStreamChunkWithIdleTimeout,
  SSE_IDLE_TIMEOUT_MS,
  type SseEvent,
} from './sseFetcher';

const ANTHROPIC_VERSION = '2023-06-01';

function usageFromAnthropic(raw: unknown, previous?: LlmTokenUsage | null): LlmTokenUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const input =
    typeof u.input_tokens === 'number'
      ? u.input_tokens
      : typeof (u as { prompt_tokens?: number }).prompt_tokens === 'number'
        ? (u as { prompt_tokens: number }).prompt_tokens
        : previous?.promptTokens ?? null;
  if (input == null) return null;
  const output =
    typeof u.output_tokens === 'number'
      ? u.output_tokens
      : typeof (u as { completion_tokens?: number }).completion_tokens === 'number'
        ? (u as { completion_tokens: number }).completion_tokens
        : previous?.completionTokens ?? 0;
  return {
    promptTokens: input,
    completionTokens: output,
    totalTokens: input + output,
    promptTextTokens: input,
    promptImageTokens: 0,
    completionTextTokens: output,
    completionImageTokens: 0,
  };
}

type ToolBuf = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

/**
 * POST /v1/messages stream=true
 * 解析 content_block_* / message_delta，产出与 fetchSSE 同形的事件。
 */
export async function* fetchAnthropicSSE(
  url: string,
  options: RequestInit,
  msgId: string,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  signal = signal ?? options.signal ?? undefined;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal,
      headers: {
        Accept: 'text/event-stream',
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw await buildHttpError(response, signal);
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError' || signal?.aborted) return;
    throw e;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  const toolCallBufferMap = new Map<number, ToolBuf>();
  let buffer = '';
  let eventName = '';
  let stopReason = '';
  let streamEnded = false;
  let lastUsage: LlmTokenUsage | null = null;

  const flushTools = function* (): Generator<SseEvent> {
    if (toolCallBufferMap.size === 0) return;
    yield {
      type: 'tool_call',
      content: '',
      toolCalls: Array.from(toolCallBufferMap.values()),
      msgId,
    };
    toolCallBufferMap.clear();
  };

  try {
  while (true) {
    const { done, value } = await readStreamChunkWithIdleTimeout(reader, SSE_IDLE_TIMEOUT_MS, signal);
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    if (done) {
      if (!buffer.trim()) break;
      buffer += '\n';
    }
    const lines = buffer.split(/\r\n|\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) {
        eventName = '';
        continue;
      }
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith('data:')) continue;

      const dataStr = line.slice(5).trim();
      if (dataStr === '[DONE]') {
        streamEnded = true;
        break;
      }
      if (!dataStr) continue;

      let json: Record<string, unknown>;
      try {
        json = JSON.parse(dataStr) as Record<string, unknown>;
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError' || signal?.aborted) return;
        throw e;
      }

      const type = (json.type as string) || eventName;

      if (type === 'message_start') {
        const msg = json.message as { usage?: unknown } | undefined;
        const usage = usageFromAnthropic(msg?.usage);
        if (usage) lastUsage = usage;
        continue;
      }

      if (type === 'content_block_start') {
        const index = typeof json.index === 'number' ? json.index : 0;
        const block = json.content_block as
          | { type?: string; id?: string; name?: string }
          | undefined;
        if (block?.type === 'tool_use' && block.id && block.name) {
          toolCallBufferMap.set(index, {
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: '' },
          });
        }
        continue;
      }

      if (type === 'content_block_delta') {
        const index = typeof json.index === 'number' ? json.index : 0;
        const delta = json.delta as
          | { type?: string; text?: string; partial_json?: string }
          | undefined;
        if (!delta) continue;
        if (delta.type === 'text_delta' && delta.text) {
          yield { type: 'text', content: delta.text, toolCalls: [], msgId };
        } else if (delta.type === 'input_json_delta' && delta.partial_json) {
          const current = toolCallBufferMap.get(index);
          if (current) {
            current.function.arguments += delta.partial_json;
          }
        }
        continue;
      }

      if (type === 'message_delta') {
        const delta = json.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) stopReason = delta.stop_reason;
        const usage = usageFromAnthropic(json.usage, lastUsage);
        if (usage) lastUsage = usage;
        continue;
      }

      if (type === 'message_stop' || type === 'error') {
        if (type === 'error') {
          const err = json.error as { message?: string } | undefined;
          throw new Error(err?.message || 'Anthropic stream error');
        }
        streamEnded = true;
        break;
      }
    }
    if (done || streamEnded) break;
  }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError' || signal?.aborted) return;
    throw error;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();

    // Start/delta usage is cumulative. Settle known usage once even if the
    // stream fails; yielding here preserves the error for the next iteration.
    if (lastUsage) yield { type: 'usage', content: '', usage: lastUsage, msgId };
  }

  // tool_use 结束：产出完整 tool_calls（与 OpenAI fetchSSE 末尾 flush 一致）
  if (stopReason === 'tool_use' || toolCallBufferMap.size > 0) {
    yield* flushTools();
  }

  yield { type: 'done', content: '', toolCalls: [], msgId };
}

export { ANTHROPIC_VERSION };

/** Base → …/v1/messages */
export function resolveAnthropicMessagesUrl(baseUrl: string): string {
  let u = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (u.endsWith('/v1/messages')) return u;
  if (u.endsWith('/messages')) return u;
  if (u.endsWith('/v1')) return `${u}/messages`;
  return `${u}/v1/messages`;
}

/** Base → …/v1/models */
export function resolveAnthropicModelsUrl(baseUrl: string): string {
  let u = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (u.endsWith('/v1/models')) return u;
  if (u.endsWith('/models')) return u;
  if (u.endsWith('/v1')) return `${u}/models`;
  if (u.endsWith('/v1/messages')) {
    return `${u.slice(0, -'/messages'.length)}/models`;
  }
  return `${u}/v1/models`;
}

export async function fetchAnthropicModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const url = resolveAnthropicModelsUrl(baseUrl);
  if (!url) return [];
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey.trim(),
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  });
  if (!res.ok) {
    throw new Error(`Anthropic models list failed: ${res.status}`);
  }
  const json = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (json.data || [])
    .map((m) => (typeof m.id === 'string' ? m.id : ''))
    .filter(Boolean);
  return [...new Set(ids)];
}
