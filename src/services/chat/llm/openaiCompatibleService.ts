/**
 * OpenAI 兼容 API（DeepSeek / 硅基流动 / 本地等）
 * 以 QwenService 为模板：同一套 body / tool / SSE 路径，可配置 baseUrl。
 */

import {
  BROWSER_ASSISTANT_SYSTEM_PROMPT,
  type ConversationMessage,
  type LlmToolCallResult,
} from './llmTypes';
import { LlmService } from './llmService';
import { resolveCompatibleToolChoice } from './toolChoiceCompatibility';
import {
  materializeToolResultContent,
} from './contextManager';
import { buildBrowserAssistantSystemPromptParts } from '../slashSkills';
import { formatSomScreenshotContext } from '../somElementsSchema';
import {
  armTurnUsageFixed,
  estimateJsonTokens,
  estimateSummarizedInHistory,
  estimateTextTokens,
} from './contextUsage';
import { resolveChatCompletionsUrl, resolveModelsListUrl } from './llmPresets';
import type { McpClient } from '@/services/mcp/mcpClient';

interface CompatibleMessage extends ConversationMessage {
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  expiredInNextRound?: boolean;
  expireKind?: 'screenshot' | 'caption';
  fileId?: string;
}

export class OpenAICompatibleService extends LlmService {
  private completionsUrl: string;
  private displayName: string;
  private extraBody: Record<string, unknown>;

  constructor(
    apiKey: string,
    model: string,
    mcpClient: McpClient,
    baseUrl?: string,
    options?: { name?: string; extraBody?: Record<string, unknown> },
  ) {
    super(apiKey, model, mcpClient);
    this.completionsUrl = resolveChatCompletionsUrl(
      baseUrl || 'https://api.openai.com/v1',
    );
    this.displayName = options?.name || 'OpenAICompatible';
    this.extraBody = { ...(options?.extraBody || {}) };
  }

  getName(): string {
    return this.displayName;
  }

  setConfig(apiKey: string, model: string, baseUrl?: string) {
    this.apiKey = apiKey?.trim() || '';
    this.model = model;
    if (baseUrl != null && baseUrl.trim()) {
      this.completionsUrl = resolveChatCompletionsUrl(baseUrl);
    }
  }

  getBaseUrlRoot(): string {
    // completionsUrl = .../v1/chat/completions → .../v1
    return this.completionsUrl.replace(/\/chat\/completions\/?$/, '');
  }

  async fetchOptions(
    conversationId: string,
    _userId: string,
    _deviceId: string,
    _site: string,
    _ever: string,
    history: CompatibleMessage[],
  ): Promise<RequestInit> {
    const { systemContent, basePrompt, skillSection } =
      await buildBrowserAssistantSystemPromptParts(BROWSER_ASSISTANT_SYSTEM_PROMPT);
    const tools = [...(await this.mcpClient.getLlmTools())];
    armTurnUsageFixed(conversationId, {
      system: estimateTextTokens(basePrompt),
      skills: estimateTextTokens(skillSection),
      tools: estimateJsonTokens(tools),
      summarized: estimateSummarizedInHistory(history),
    });
    const messages: CompatibleMessage[] = [
      {
        role: 'system',
        content: systemContent,
      },
      ...history,
    ];

    const toolChoice = resolveCompatibleToolChoice({
      endpoint: this.completionsUrl,
      requestedMode: this.consumeToolChoice(),
      explicitToolChoice: this.extraBody.tool_choice,
      extraBody: this.extraBody,
    });
    const requestBody = {
      model: this.model,
      messages,
      tools,
      max_tokens: 4096,
      stream: true,
      ...this.extraBody,
      tool_choice: toolChoice,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    return {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    };
  }

  endPoint(): string {
    return this.completionsUrl;
  }

  async processToolResults(
    conversationId: string,
    toolResults: LlmToolCallResult[],
    history: CompatibleMessage[],
  ) {
    this.conversationHistory.set(conversationId, history);

    for (const toolResult of toolResults) {
      const result = toolResult.result as any;
      if (result && typeof result === 'object' && 'base64' in result && 'mimeType' in result && 'captureTab' in result && result.captureTab === true) {
        const resultMap = result as {
          base64: string;
          mimeType: string;
          elements?: unknown[];
          hint?: string;
          areas?: unknown[];
        };

        const toolResultMsg: CompatibleMessage = {
          role: 'tool',
          tool_call_id: toolResult.tool_call_id,
          content: '截图已获取，正在分析...',
        };
        history.push(toolResultMsg);

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

        const imageMsg: CompatibleMessage = {
          role: 'user',
          expiredInNextRound: true,
          expireKind: 'screenshot',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${resultMap.mimeType};base64,${resultMap.base64}`,
              },
            },
            {
              type: 'text',
              text: screenshotText,
            },
          ],
        };
        history.push(imageMsg);
      } else if (
        toolResult.name === 'browser_get_video_caption'
        && result
        && typeof result === 'object'
        && (result as { ok?: boolean }).ok === true
        && 'caption' in (result as object)
      ) {
        const toolResultMsg: CompatibleMessage = {
          role: 'tool',
          tool_call_id: toolResult.tool_call_id,
          expiredInNextRound: true,
          expireKind: 'caption',
          content: JSON.stringify(result),
        };
        history.push(toolResultMsg);
      } else if (result && typeof result === 'object' && 'kind' in result && result.kind === 'binary' && 'type' in result && result.type === 'file') {
        const imageMsg: CompatibleMessage = {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${result.mimeType};base64,${result.base64}`,
              },
            },
            {
              type: 'text',
              text: result.name,
            },
          ],
          fileId: typeof result.fileId === 'string' ? result.fileId : undefined,
        };
        history.push(imageMsg);
      } else if (result && typeof result === 'object' && 'imageRecognition' in result && result.imageRecognition === true) {
        const imageMsg: CompatibleMessage = {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: result.imageUrl,
              },
            },
            {
              type: 'text',
              text: '请识别这张图片',
            },
          ],
          fileId: typeof result.fileId === 'string' ? result.fileId : undefined,
        };
        history.push(imageMsg);
      } else {
        const content = await materializeToolResultContent(conversationId, result, {
          toolName: toolResult.name,
        });
        const toolResultMsg: CompatibleMessage = {
          role: 'tool',
          tool_call_id: toolResult.tool_call_id,
          content,
        };
        history.push(toolResultMsg);
      }
    }
  }

  protected cleanupIncompleteToolCalls(history: CompatibleMessage[]): void {
    if (history.length === 0) return;

    let lastAssistantIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }

    if (lastAssistantIndex === -1) return;

    const lastAssistant = history[lastAssistantIndex];

    if (lastAssistant.tool_calls && lastAssistant.tool_calls.length > 0) {
      let hasToolResponse = false;
      for (let i = lastAssistantIndex + 1; i < history.length; i++) {
        if (history[i].role === 'tool') {
          hasToolResponse = true;
          break;
        }
      }

      if (!hasToolResponse) {
        console.log('[OpenAICompatible] Removing incomplete tool_calls from history');
        history.splice(lastAssistantIndex, history.length - lastAssistantIndex);
      }
    }
  }

  clearConversation(conversationId: string): void {
    this.conversationHistory.delete(conversationId);
  }
}

/** 用当前 Key + BaseURL 拉取 /models */
export async function fetchOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const url = resolveModelsListUrl(baseUrl);
  if (!url) return [];
  const headers: Record<string, string> = {};
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new Error(`models list failed: ${res.status}`);
  }
  const json = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (json.data || [])
    .map((m) => (typeof m.id === 'string' ? m.id : ''))
    .filter(Boolean);
  return [...new Set(ids)];
}
