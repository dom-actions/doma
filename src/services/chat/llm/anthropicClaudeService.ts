/**
 * Anthropic Messages API 服务（Open BYOK）。
 * 与 OpenAICompatibleService 并行；不改动 OpenAI SSE / 历史格式。
 */
import {
  BROWSER_ASSISTANT_SYSTEM_PROMPT,
  type ConversationMessage,
  type LlmToolCallResult,
} from './llmTypes';
import { LlmService } from './llmService';
import { materializeToolResultContent } from './contextManager';
import { buildBrowserAssistantSystemPromptParts } from '../slashSkills';
import { formatSomScreenshotContext } from '../somElementsSchema';
import {
  armTurnUsageFixed,
  applyLlmUsage,
  estimateJsonTokens,
  estimateSummarizedInHistory,
  estimateTextTokens,
} from './contextUsage';
import {
  ANTHROPIC_VERSION,
  fetchAnthropicSSE,
  resolveAnthropicMessagesUrl,
} from '../anthropicSseFetcher';
import type { McpClient } from '@/services/mcp/mcpClient';
import type { LlmSendMessageOptions } from './llmTypes';
import type { ToolResult } from '@/services/mcp/mcpServer';
import { prepareLlmHistory } from './contextManager';
import {
  buildAskPageToolBlockedPayload,
  getLastUserVisibleGoal,
  isAskBlockedPageTool,
  isAskModeRound,
} from './askModeToolPolicy';
import {
  buildToolRecoveryNudgeMessage,
  markTextOnlyToolRecoveryUsed,
  shouldForceToolRecovery,
} from './textOnlyToolRecovery';

type ClaudeBlock = Record<string, unknown>;

interface ClaudeHistoryMsg extends ConversationMessage {
  /** Claude content 可为 string 或 block[] */
  content?: string | ClaudeBlock[] | null;
  expiredInNextRound?: boolean;
  expireKind?: 'screenshot' | 'caption';
  fileId?: string;
  /** 内部：assistant 上挂的 OpenAI 形 toolCalls，仅本轮执行用；出站前剥掉 */
  _openaiToolCalls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

function parseToolArguments(raw: string, toolName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('arguments must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `工具 ${toolName} 参数 JSON 无效：${msg}。` +
        '图片/文件请用 fileId 或 url，勿内联 base64；长文本请确保引号已转义。',
    );
  }
}

function openaiToolsToClaude(
  tools: Array<{
    type?: string;
    function?: { name?: string; description?: string; parameters?: unknown };
  }>,
): Array<{ name: string; description: string; input_schema: unknown }> {
  return tools
    .map((t) => {
      const fn = t.function;
      if (!fn?.name) return null;
      return {
        name: fn.name,
        description: fn.description || '',
        input_schema: fn.parameters || { type: 'object', properties: {} },
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    description: string;
    input_schema: unknown;
  }>;
}

/** 出站：把内部历史收成 Anthropic messages（无 system） */
function toAnthropicMessages(history: ClaudeHistoryMsg[]): Array<{
  role: 'user' | 'assistant';
  content: string | ClaudeBlock[];
}> {
  const out: Array<{ role: 'user' | 'assistant'; content: string | ClaudeBlock[] }> = [];
  for (const msg of history) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const content = msg.content;
    if (content == null) continue;
    if (typeof content === 'string') {
      if (!content.trim() && msg.role === 'assistant') {
        // 允许空文本 + tool_use 的情况：若 content 已是 array 不会进这里
        continue;
      }
      out.push({ role: msg.role, content });
      continue;
    }
    if (Array.isArray(content) && content.length > 0) {
      out.push({ role: msg.role as 'user' | 'assistant', content });
    }
  }
  return out;
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(url.trim());
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

export class AnthropicClaudeService extends LlmService {
  private messagesUrl: string;

  constructor(
    apiKey: string,
    model: string,
    mcpClient: McpClient,
    baseUrl?: string,
  ) {
    super(apiKey, model, mcpClient);
    this.messagesUrl = resolveAnthropicMessagesUrl(
      baseUrl || 'https://api.anthropic.com',
    );
  }

  getName(): string {
    return 'Anthropic';
  }

  setConfig(apiKey: string, model: string, baseUrl?: string) {
    this.apiKey = apiKey?.trim() || '';
    this.model = model;
    if (baseUrl != null && baseUrl.trim()) {
      this.messagesUrl = resolveAnthropicMessagesUrl(baseUrl);
    }
  }

  endPoint(): string {
    return this.messagesUrl;
  }

  async fetchOptions(
    conversationId: string,
    _userId: string,
    _deviceId: string,
    _site: string,
    _ever: string,
    history: ClaudeHistoryMsg[],
  ): Promise<RequestInit> {
    const { systemContent, basePrompt, skillSection } =
      await buildBrowserAssistantSystemPromptParts(BROWSER_ASSISTANT_SYSTEM_PROMPT);
    const openaiTools = [...(await this.mcpClient.getLlmTools())];
    const tools = openaiToolsToClaude(openaiTools);
    armTurnUsageFixed(conversationId, {
      system: estimateTextTokens(basePrompt),
      skills: estimateTextTokens(skillSection),
      tools: estimateJsonTokens(tools),
      summarized: estimateSummarizedInHistory(history as ConversationMessage[]),
    });

    const body = {
      model: this.model,
      max_tokens: 4096,
      stream: true,
      system: systemContent,
      tools,
      messages: toAnthropicMessages(history),
      ...(this.consumeToolChoice() === "required"
        ? { tool_choice: { type: "any" as const } }
        : {}),
    };

    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    };
  }

  /**
   * 完整覆盖 call：历史用 Claude blocks；SSE 走 fetchAnthropicSSE。
   * UI 回调仍用 OpenAI 形 toolCall，避免改 ChatPanel。
   */
  async call(
    _conversationId: string,
    userId: string,
    deviceId: string,
    site: string,
    ever: string,
    history: ConversationMessage[],
    options: LlmSendMessageOptions,
    msgIds: string[],
    signal: AbortSignal,
  ): Promise<void> {
    console.log(`Calling ${this.getName()} llm with model ${this.model}`);
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const claudeHistory = history as ClaudeHistoryMsg[];
    try {
      msgIds.push(msgId);
      options.onMessageStart(_conversationId, msgId);
      let assistantText = '';
      // OpenAI stub 路径对 Claude block 不友好；截图过期在 processToolResults 侧处理
      try {
        await prepareLlmHistory(
          claudeHistory as Parameters<typeof prepareLlmHistory>[0],
          _conversationId,
        );
      } catch (e) {
        console.warn('[Anthropic] prepareLlmHistory skipped/failed', e);
      }

      const contentBlocks: ClaudeBlock[] = [];

      for await (const sseEvent of fetchAnthropicSSE(
        this.endPoint(),
        await this.fetchOptions(
          _conversationId,
          userId,
          deviceId,
          site,
          ever,
          claudeHistory,
        ),
        msgId,
        signal,
      )) {
        if (sseEvent.type === 'usage' && sseEvent.usage) {
          applyLlmUsage(_conversationId, sseEvent.usage);
          continue;
        }
        if (sseEvent.type === 'text') {
          assistantText += sseEvent.content;
          options.onTextMessage(_conversationId, sseEvent.msgId!, sseEvent.content);
        }
        if (sseEvent.type === 'tool_call') {
          if (assistantText.trim()) {
            contentBlocks.push({ type: 'text', text: assistantText });
          }
          for (const tc of sseEvent.toolCalls || []) {
            let input: Record<string, unknown> = {};
            try {
              input = parseToolArguments(tc.function.arguments || '{}', tc.function.name);
            } catch {
              input = {};
            }
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }

          claudeHistory.push({
            role: 'assistant',
            content: contentBlocks.length
              ? contentBlocks
              : [{ type: 'text', text: assistantText || '' }],
            _openaiToolCalls: (sseEvent.toolCalls || []).map((tc) => ({
              id: tc.id,
              type: tc.type || 'function',
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments || '{}',
              },
            })),
          });

          const llmToolCallResults: LlmToolCallResult[] = [];
          for (const toolCall of sseEvent.toolCalls || []) {
            if (toolCall.type !== 'function') continue;
            options.onToolCallStart(_conversationId, sseEvent.msgId!, toolCall);
            let toolArgs: Record<string, unknown>;
            try {
              toolArgs = parseToolArguments(
                toolCall.function.arguments,
                toolCall.function.name,
              );
            } catch (parseErr) {
              const errMsg =
                parseErr instanceof Error ? parseErr.message : String(parseErr);
              await this.reportToolCallError(_conversationId, sseEvent.msgId!, toolCall, parseErr, options);
              llmToolCallResults.push({
                tool_call_id: toolCall.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({ ok: false, error: errMsg }),
                    },
                  ],
                },
                name: toolCall.function.name,
              });
              continue;
            }
            toolArgs.conversationId = _conversationId;

            let result: unknown;
            try {
              if (
                isAskModeRound(claudeHistory) &&
                isAskBlockedPageTool(toolCall.function.name, toolArgs)
              ) {
                result = buildAskPageToolBlockedPayload(
                  toolCall.function.name,
                  getLastUserVisibleGoal(claudeHistory),
                );
              } else {
                const timeoutMs =
                  typeof toolArgs.timeoutMs === 'number' &&
                  Number.isFinite(toolArgs.timeoutMs)
                    ? Math.max(1, Math.floor(toolArgs.timeoutMs))
                    : 60_000;
                const toolResult = (await this.mcpClient.callTool(
                  {
                    name: toolCall.function.name,
                    arguments: toolArgs,
                  },
                  undefined,
                  { timeout: timeoutMs, maxTotalTimeout: timeoutMs },
                )) as ToolResult;
                const firstContent = toolResult.content[0];
                const firstText =
                  firstContent && firstContent.type === 'text' ? firstContent.text : '';
                result = firstText.startsWith('__JSON__')
                  ? JSON.parse(firstText.slice(8))
                  : firstText;
              }
            } catch (toolError) {
              if ((toolError as { name?: string })?.name === 'AbortError' || signal.aborted) throw toolError;
              await this.reportToolCallError(_conversationId, sseEvent.msgId!, toolCall, toolError, options);
              throw toolError;
            }

            const overrideResult = await options.onToolCallOverride(
              _conversationId,
              sseEvent.msgId!,
              toolCall,
              result,
            );
            llmToolCallResults.push({
              tool_call_id: toolCall.id,
              result: overrideResult || result,
              name: toolCall.function.name,
            });
            options.onToolCallDone(_conversationId, sseEvent.msgId!, toolCall);
          }

          await this.processToolResults(
            _conversationId,
            llmToolCallResults,
            claudeHistory,
          );
          options.onMessageDone(_conversationId, msgId);
          const halt = await options.onAfterToolResults?.(
            _conversationId,
            llmToolCallResults,
          );
          if (halt) return;
          await this.call(
            _conversationId,
            userId,
            deviceId,
            site,
            ever,
            claudeHistory,
            options,
            msgIds,
            signal,
          );
          return;
        }
      }

      if (assistantText) {
        claudeHistory.push({ role: 'assistant', content: assistantText });
      }
      options.onMessageDone(_conversationId, msgId);

      if (
        assistantText.trim() &&
        !signal.aborted &&
        (await shouldForceToolRecovery({
          conversationId: _conversationId,
          history,
          assistantText,
          signal,
        }))
      ) {
        markTextOnlyToolRecoveryUsed(_conversationId);
        claudeHistory.push({
          role: 'user',
          content: buildToolRecoveryNudgeMessage(),
        });
        this.toolChoiceForNextRequest = 'required';
        console.log('[tool-recovery] forcing required tool round', {
          conversationId: _conversationId,
          provider: 'anthropic',
          textPreview: assistantText.trim().slice(0, 80),
        });
        await this.call(
          _conversationId,
          userId,
          deviceId,
          site,
          ever,
          history,
          options,
          msgIds,
          signal,
        );
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError' || signal?.aborted) {
        console.log(`[${this.getName()}] Request aborted`);
        return;
      }
      console.error(`[${this.getName()}] API call failed:`, e);
      await options.onMessageError(_conversationId, msgId, e as Error);
    }
  }

  async processToolResults(
    conversationId: string,
    toolResults: LlmToolCallResult[],
    history: ClaudeHistoryMsg[],
  ) {
    this.conversationHistory.set(conversationId, history);

    const resultBlocks: ClaudeBlock[] = [];

    for (const toolResult of toolResults) {
      const result = toolResult.result as Record<string, unknown> | string | null;
      if (
        result &&
        typeof result === 'object' &&
        'base64' in result &&
        'mimeType' in result &&
        'captureTab' in result &&
        result.captureTab === true
      ) {
        const resultMap = result as {
          base64: string;
          mimeType: string;
          elements?: unknown[];
          hint?: string;
          areas?: unknown[];
        };
        let screenshotText =
          '请分析这个网页截图，描述你看到的主要内容、页面布局和可交互的元素。结合之前的任务目标给出操作建议。';
        if (resultMap.elements && resultMap.elements.length > 0) {
          screenshotText = formatSomScreenshotContext(resultMap.elements, {
            hint: resultMap.hint,
            areas: resultMap.areas,
          });
        } else if (resultMap.hint?.trim()) {
          screenshotText = `${screenshotText}\n${resultMap.hint.trim()}`;
        }
        resultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolResult.tool_call_id,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: resultMap.mimeType,
                data: resultMap.base64,
              },
            },
            { type: 'text', text: screenshotText },
          ],
        });
      } else if (
        toolResult.name === 'browser_get_video_caption' &&
        result &&
        typeof result === 'object' &&
        (result as { ok?: boolean }).ok === true &&
        'caption' in result
      ) {
        resultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolResult.tool_call_id,
          content: JSON.stringify(result),
        });
      } else if (
        result &&
        typeof result === 'object' &&
        'kind' in result &&
        result.kind === 'binary' &&
        'type' in result &&
        result.type === 'file'
      ) {
        const file = result as {
          mimeType: string;
          base64: string;
          name: string;
          fileId?: string;
        };
        resultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolResult.tool_call_id,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.mimeType,
                data: file.base64,
              },
            },
            { type: 'text', text: file.name },
          ],
        });
      } else if (
        result &&
        typeof result === 'object' &&
        'imageRecognition' in result &&
        result.imageRecognition === true
      ) {
        const imageUrl = String((result as { imageUrl?: string }).imageUrl || '');
        const parsed = parseDataUrl(imageUrl);
        if (parsed) {
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolResult.tool_call_id,
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: parsed.mediaType,
                  data: parsed.data,
                },
              },
              { type: 'text', text: '请识别这张图片' },
            ],
          });
        } else {
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolResult.tool_call_id,
            content: JSON.stringify({
              note: 'image_url_not_inlined',
              imageUrl,
              hint: '请识别这张图片（远端 URL，未转 base64）',
            }),
          });
        }
      } else {
        const content = await materializeToolResultContent(conversationId, result, {
          toolName: toolResult.name,
        });
        resultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolResult.tool_call_id,
          content,
        });
      }
    }

    if (resultBlocks.length) {
      history.push({
        role: 'user',
        content: resultBlocks,
      });
    }
  }

  protected cleanupIncompleteToolCalls(history: ConversationMessage[]): void {
    const h = history as ClaudeHistoryMsg[];
    if (h.length === 0) return;

    let lastAssistantIndex = -1;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }
    if (lastAssistantIndex === -1) return;

    const last = h[lastAssistantIndex];
    const blocks = Array.isArray(last.content) ? last.content : [];
    const hasToolUse = blocks.some((b) => b.type === 'tool_use');
    if (!hasToolUse) return;

    let hasToolResult = false;
    for (let i = lastAssistantIndex + 1; i < h.length; i++) {
      const c = h[i].content;
      if (h[i].role === 'user' && Array.isArray(c)) {
        if (c.some((b) => b.type === 'tool_result')) {
          hasToolResult = true;
          break;
        }
      }
    }
    if (!hasToolResult) {
      console.log('[Anthropic] Removing incomplete tool_use from history');
      h.splice(lastAssistantIndex, h.length - lastAssistantIndex);
    }
  }
}
