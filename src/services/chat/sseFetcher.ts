import { parseLlmUsageFromSse, type LlmTokenUsage } from './llm/contextUsage';

export type SseEvent = {
    type: 'text' | 'tool_call' | 'usage' | 'done';
    content: string;            // 普通文本内容
    toolCalls?: any[];         // 完整的工具调用对象数组
    msgId?: string;            // 消息ID
    usage?: LlmTokenUsage;
};

export const SSE_IDLE_TIMEOUT_MS = 90_000;

export class SseIdleTimeoutError extends Error {
  constructor(readonly timeoutMs = SSE_IDLE_TIMEOUT_MS) {
    super(`Response stream was idle for ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = 'SseIdleTimeoutError';
  }
}

/** Bound idle reads and cancel even when fetch has already returned its response. */
export function readStreamChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = SSE_IDLE_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const cancel = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      void reader.cancel(error.message).catch(() => {});
      reject(error);
    };
    const onAbort = () => cancel(new DOMException('Response stream aborted', 'AbortError'));
    const timer = setTimeout(() => cancel(new SseIdleTimeoutError(timeoutMs)), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    reader.read().then(
      (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

/** SSE / fetch 非 2xx 响应；外层可通过 status 或 isHttpError() 识别 */
export class HttpError extends Error {
  readonly status: number;
  /** 响应头（key 小写）；供 Pro sendEdition 等读协议字段 */
  readonly headers: Record<string, string>;

  constructor(
    status: number,
    message?: string,
    headers: Record<string, string> = {},
  ) {
    super(message ?? `HTTP error! status: ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.headers = headers;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export async function buildHttpError(response: Response, signal?: AbortSignal): Promise<HttpError> {
  let raw = '';
  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let bytesRead = 0;
    try {
      // Error details are diagnostic snippets, so never consume an unbounded body.
      while (bytesRead < 4096) {
        const { done, value } = await readStreamChunkWithIdleTimeout(reader, SSE_IDLE_TIMEOUT_MS, signal);
        if (done) break;
        const chunk = value.subarray(0, 4096 - bytesRead);
        bytesRead += chunk.byteLength;
        raw += decoder.decode(chunk, { stream: true });
      }
      raw += decoder.decode();
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError' || signal?.aborted) throw error;
      // A stalled/unreadable error body must not hide its HTTP status and headers.
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  let detail = '';
  raw = raw.trim();
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message ?? parsed?.message;
    detail = typeof message === 'string' ? message.trim() : raw;
  } catch {
    detail = raw;
  }
  return new HttpError(
    response.status,
    `HTTP ${response.status}${detail ? `: ${detail.slice(0, 800)}` : ''}`,
    headersToRecord(response.headers),
  );
}

export async function* fetchSSE(
  url: string,
  options: RequestInit,
  msgId: string,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
    console.log("fetchSSE==================", {
      method: options.method || 'GET',
      hasBody: options.body != null,
    });
    signal = signal ?? options.signal ?? undefined;
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        signal,
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "text/event-stream",
          ...options.headers,
        },
      });
      if (!response.ok) throw await buildHttpError(response, signal);
    } catch (e) {
      // 用户主动取消：视为正常结束，不向上抛错
      if ((e as any)?.name === "AbortError" || signal?.aborted) return;
      throw e;
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');
    const decoder = new TextDecoder();
    const toolCallBufferMap = new Map<number, any>();
    let buffer = '';
    let streamEnded = false;
    try {
    while (true) {
        const { done, value } = await readStreamChunkWithIdleTimeout(reader, SSE_IDLE_TIMEOUT_MS, signal);
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        // Some compatible providers close immediately after the final data line.
        if (done) {
            if (!buffer.trim()) break;
            buffer += '\n';
        }
        const lines = buffer.split(/\r\n|\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim() || line.startsWith('event:')) continue;

            if (line.startsWith('data:')) {
                const dataStr = line.slice(5).trim();
                if (dataStr === '[DONE]') {
                    streamEnded = true;
                    break;
                }
                if (!dataStr) continue;

                try{
                    const json = JSON.parse(dataStr);
                    if (json.error) {
                        throw new Error(json.error.message || 'Response stream error');
                    }
                    const usage = parseLlmUsageFromSse(json.usage);
                    if (usage) {
                        yield { type: 'usage', content: '', usage, msgId: msgId };
                    }
                    const delta = json.choices?.[0]?.delta;
                    if (delta?.content) {
                        yield { type: 'text', content: delta.content, toolCalls: [], msgId: msgId };
                        // 如果之前有正在进行的工具调用，说明工具调用结束了，先产出工具事件
                        if (toolCallBufferMap.size > 0) {
                            const allTools = Array.from(toolCallBufferMap.values());
                            yield { type: 'tool_call', content: '', toolCalls: allTools, msgId: msgId };
                            toolCallBufferMap.clear(); // 清空缓存
                            
                        }
                    }

                    if (delta?.tool_calls && delta.tool_calls.length > 0) {
                        for (const toolCall of delta.tool_calls) {
                            const index = toolCall.index;

                            if (!toolCallBufferMap.has(index)) {
                                toolCallBufferMap.set(index, {
                                    id: toolCall.id,
                                    type: toolCall.type,
                                    function: {
                                        name: toolCall.function?.name || '',
                                        arguments: ''
                                    }
                                });
                            }
                            
                            const currentTool = toolCallBufferMap.get(index);
                            if (toolCall.function?.name) {
                                currentTool.function.name = toolCall.function.name;
                            }
                            if (toolCall.function?.arguments) {
                                currentTool.function.arguments += toolCall.function.arguments;
                            }
                        }
                    }
                } catch (e) {
                    // Abort 视为正常中止
                    if ((e as any)?.name === 'AbortError' || signal?.aborted) {
                      return;
                    }

                    throw e;
                }
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
    }

    if (toolCallBufferMap.size > 0) {
        const allTools = Array.from(toolCallBufferMap.values());
        yield { type: 'tool_call', content: '', toolCalls: allTools, msgId: msgId };
        toolCallBufferMap.clear();
    }

    yield { type: 'done', content: '', toolCalls: [], msgId: msgId };
}

export async function* fetchJSONChunk(
    url: string,
    options: RequestInit
  ): AsyncGenerator<SseEvent> {
    console.log("fetchJSONChunk==================", {
      method: options.method || 'GET',
      hasBody: options.body != null,
    });
  
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  
    if (!response.ok) throw await buildHttpError(response, options.signal ?? undefined);
  
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");
  
    const decoder = new TextDecoder();
  
    const toolCallBufferMap = new Map<number, any>();
  
    let buffer = "";
  
    try {
    while (true) {
      const { done, value } = await readStreamChunkWithIdleTimeout(reader, SSE_IDLE_TIMEOUT_MS, options.signal ?? undefined);
      if (done) break;
  
      buffer += decoder.decode(value, { stream: true });
  
      // 🔥 核心：不断尝试解析 JSON
      while (true) {
        const first = buffer.indexOf("{");
        const last = buffer.lastIndexOf("}");
  
        // ❗不完整 JSON
        if (first === -1 || last === -1 || last <= first) {
          break;
        }
  
        const jsonStr = buffer.slice(first, last + 1);
  
        let json;
        try {
          json = JSON.parse(jsonStr);
        } catch {
          // JSON 还没收完整
          break;
        }
  
        // ✅ 消费 buffer
        buffer = buffer.slice(last + 1);
  
        const delta = json.choices?.[0]?.delta;
  
        // =========================
        // 🟢 文本
        // =========================
        if (delta?.content) {
          if (toolCallBufferMap.size > 0) {
            const allTools = Array.from(toolCallBufferMap.values());
            yield {
              type: "tool_call",
              content: "",
              toolCalls: allTools,
            };
            toolCallBufferMap.clear();
          }
  
          yield {
            type: "text",
            content: delta.content,
            toolCalls: [],
          };
        }
  
        // =========================
        // 🟢 tool_calls
        // =========================
        if (delta?.tool_calls?.length > 0) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
  
            if (!toolCallBufferMap.has(index)) {
              toolCallBufferMap.set(index, {
                id: toolCall.id,
                type: toolCall.type,
                function: {
                  name: "",
                  arguments: "",
                },
              });
            }
  
            const currentTool = toolCallBufferMap.get(index);
  
            if (toolCall.function?.name) {
              currentTool.function.name = toolCall.function.name;
            }
  
            if (toolCall.function?.arguments) {
              currentTool.function.arguments += toolCall.function.arguments;
            }
          }
        }
      }
    }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError' || options.signal?.aborted) return;
      throw error;
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  
    // 🔚 flush tool calls
    if (toolCallBufferMap.size > 0) {
      yield {
        type: "tool_call",
        content: "",
        toolCalls: Array.from(toolCallBufferMap.values()),
      };
      toolCallBufferMap.clear();
    }
  }
