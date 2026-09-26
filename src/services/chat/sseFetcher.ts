import { parseLlmUsageFromSse, type LlmTokenUsage } from './llm/contextUsage';

export type SseEvent = {
    type: 'text' | 'reasoning' | 'tool_call' | 'usage' | 'done';
    content: string;            // 普通文本内容
    toolCalls?: any[];         // 完整的工具调用对象数组
    msgId?: string;            // 消息ID
    usage?: LlmTokenUsage;
};

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

function throwHttpError(response: Response): never {
  throw new HttpError(response.status, undefined, headersToRecord(response.headers));
}

export async function* fetchSSE(
  url: string,
  options: RequestInit,
  msgId: string,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
    console.log("fetchSSE==================", url, options);
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
    } catch (e) {
      // 用户主动取消：视为正常结束，不向上抛错
      if ((e as any)?.name === "AbortError" || signal?.aborted) return;
      throw e;
    }
    if (!response.ok) throwHttpError(response);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');
    const decoder = new TextDecoder();
    const toolCallBufferMap = new Map<number, any>();
    let buffer = '';
    while (true) {
        if (signal?.aborted) {
            try { await reader.cancel(); } catch {}
            break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r\n|\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim() || line.startsWith('event:')) continue;

            if (line.startsWith('data:')) {
                const dataStr = line.slice(5).trim();
                if (dataStr === '[DONE]') {
                    continue;
                }

                try{
                    const json = JSON.parse(dataStr);
                    const usage = parseLlmUsageFromSse(json.usage);
                    if (usage) {
                        yield { type: 'usage', content: '', usage, msgId: msgId };
                    }
                    const delta = json.choices?.[0]?.delta;
                    const reasoningContent =
                      typeof delta?.reasoning_content === 'string'
                        ? delta.reasoning_content
                        : typeof delta?.reasoning === 'string'
                          ? delta.reasoning
                          : '';
                    if (reasoningContent) {
                        yield {
                            type: 'reasoning',
                            content: reasoningContent,
                            toolCalls: [],
                            msgId: msgId,
                        };
                    }
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

                    console.error('Error parsing SSE event:', e);
                    throw e;
                }
            }

            
        }
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
    console.log("fetchJSONChunk==================", url, options);
  
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  
    if (!response.ok) throwHttpError(response);
  
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");
  
    const decoder = new TextDecoder();
  
    const toolCallBufferMap = new Map<number, any>();
  
    let buffer = "";
  
    while (true) {
      const { done, value } = await reader.read();
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

        const reasoningContent =
          typeof delta?.reasoning_content === "string"
            ? delta.reasoning_content
            : typeof delta?.reasoning === "string"
              ? delta.reasoning
              : "";
        if (reasoningContent) {
          yield {
            type: "reasoning",
            content: reasoningContent,
            toolCalls: [],
          };
        }
  
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
