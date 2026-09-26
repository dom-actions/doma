import type { ConversationMessage, LlmSendMessageOptions, LlmToolCallResult } from "./llmTypes";
import type { McpClient } from "@/services/mcp/mcpClient";
import { trimMessages, estimateMessagesTokens, prepareLlmHistory } from "./contextManager";
import { CONTEXT_LIMITS } from "./contextManager";
import { fetchSSE } from "../sseFetcher";
import type { ToolResult } from "@/services/mcp/mcpServer";
import { prepareUserSendText } from "../interactionBlockSendHints";
import { applyLlmUsage } from "./contextUsage";
import {
  buildAskPageToolBlockedPayload,
  getLastUserVisibleGoal,
  isAskBlockedPageTool,
  isAskModeRound,
} from "./askModeToolPolicy";
import {
  buildToolRecoveryNudgeMessage,
  clearTextOnlyToolRecovery,
  markTextOnlyToolRecoveryUsed,
  shouldForceToolRecovery,
} from "./textOnlyToolRecovery";

export type LlmToolChoiceMode = "auto" | "required";

function parseToolArguments(raw: string, toolName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("arguments must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `工具 ${toolName} 参数 JSON 无效：${msg}。` +
        "图片/文件请用 fileId 或 url，勿内联 base64；长文本请确保引号已转义。",
    );
  }
}

export class LlmService {
    protected apiKey: string;
    protected model: string;
    protected mcpClient: McpClient;
    protected conversationHistory: Map<string, ConversationMessage[]> = new Map();
    /** 下一轮 fetchOptions 使用的 tool_choice；consume 后恢复 auto */
    protected toolChoiceForNextRequest: LlmToolChoiceMode = "auto";

    constructor(apiKey: string, model: string, mcpClient: McpClient) {
        this.apiKey = apiKey;
        this.model = model;
        this.mcpClient = mcpClient;
    }

    protected consumeToolChoice(): LlmToolChoiceMode {
      const mode = this.toolChoiceForNextRequest;
      this.toolChoiceForNextRequest = "auto";
      return mode;
    }

    protected async fetchOptions(
      conversationId: string,
      userId: string,
      deviceId: string,
      site: string,
      ever: string,
      history: ConversationMessage[],
    ): Promise<RequestInit> {
        return {}
    }

    protected endPoint(): string {
        return '';
    }

    withdrawLastUserMessage(conversationId: string): void {
        const history = this.conversationHistory.get(conversationId);
        if (history) {
          history.pop();
          this.conversationHistory.set(conversationId, history);
        }
    }

    withdrawTurns(conversationId: string, turnCount: number): void {
        if (turnCount <= 0) return;
        const history = this.conversationHistory.get(conversationId);
        if (!history?.length) return;

        for (let t = 0; t < turnCount; t++) {
          while (history.length > 0 && history[history.length - 1]!.role !== "user") {
            history.pop();
          }
          if (history.length > 0 && history[history.length - 1]!.role === "user") {
            history.pop();
          }
        }
        this.conversationHistory.set(conversationId, history);
    }

    /** 用侧栏剩余消息重建 LLM 上下文（删除轮次后与 UI 保持一致） */
    syncHistoryFromChatMessages(
        conversationId: string,
        messages: Array<{ role: string; content?: string | null }>,
    ): void {
        const history: ConversationMessage[] = [];
        for (const msg of messages) {
            if (msg.role !== "user" && msg.role !== "assistant") continue;
            let content = String(msg.content ?? "").trim();
            if (!content) continue;
            if (msg.role === "user") {
                content = prepareUserSendText(content);
            }
            history.push({ role: msg.role, content });
        }
        this.conversationHistory.set(conversationId, history);
    }

    async sendMessage(conversationId: string, userId: string, deviceId: string, site: string, ever: string, userMessage: string, options: LlmSendMessageOptions, signal: AbortSignal) {
        options.onConversationStart(conversationId);
        let history = this.conversationHistory.get(conversationId);
        if (!history) {
          history = [];
          this.conversationHistory.set(conversationId, history);
        }
    
        // 清理未完成的 tool_calls（用户中断后可能残留）
        this.cleanupIncompleteToolCalls(history);
        // 每个 sendMessage 回合重置 text-only 回收（含 resend）
        clearTextOnlyToolRecovery(conversationId);
    
        if (!options.skipAppendUserMessage) {
          const userMsg: ConversationMessage = {
            role: 'user',
            content: userMessage,
          };
          history.push(userMsg);
        }
    
        // // 上下文管理：裁剪超长历史
        // history = this.manageContext(history);
        // this.conversationHistory.set(conversationId, history);
    
        const msgIds: string[] = [];
        await this.call(conversationId, userId, deviceId, site, ever, history, options, msgIds, signal);
        options.onConversationDone(conversationId, msgIds);
    }

    protected manageContext(history: ConversationMessage[]): ConversationMessage[] {
        // 裁剪超长历史
        let managed = trimMessages(history, CONTEXT_LIMITS.MAX_MESSAGES);
        
        // 检查 token 数量
        const tokens = estimateMessagesTokens(managed);
        if (tokens > CONTEXT_LIMITS.TOKEN_WARNING) {
          console.warn(`[${this.getName()}] Context too large: ~${tokens} tokens. Consider starting new conversation.`);
        }
        
        return managed;
    }


    protected cleanupIncompleteToolCalls(history: ConversationMessage[]){

    }

    clearConversation(conversationId: string){
        this.conversationHistory.delete(conversationId);
        // Context Usage 按会话落盘，仅在删除会话时清理，不在此复位
    }

    /**
     * 上下文总结后：清空 LLM history，仅保留一条摘要用户消息。
     */
    replaceHistoryWithSummary(conversationId: string, summary: string): void {
        const text = String(summary ?? "").trim();
        const summaryText = text
          ? `[对话摘要]\n${text}`
          : `[对话摘要]\n（空摘要）`;
        this.conversationHistory.set(conversationId, [
          { role: "user", content: summaryText },
        ]);
    }

    async call( _conversationId: string,
        userId: string,
        deviceId: string,
        site: string,
        ever: string,
        history: ConversationMessage[],
        options: LlmSendMessageOptions,
        msgIds: string[],
        signal: AbortSignal
    ): Promise<void> {
        console.log(`Calling ${this.getName()} llm with model ${this.model}`);
        const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try{
            msgIds.push(msgId);
            options.onMessageStart(_conversationId, msgId);
            let assistantText = '';
            let assistantReasoning = '';
            await prepareLlmHistory(history as Parameters<typeof prepareLlmHistory>[0], _conversationId);
            for await (const sseEvent of fetchSSE(this.endPoint(), await this.fetchOptions(_conversationId, userId, deviceId, site, ever, history), msgId, signal)) {
              if (sseEvent.type === 'usage' && sseEvent.usage) {
                applyLlmUsage(_conversationId, sseEvent.usage);
                console.log("[usage debug] onUsage", {
                  conversationId: _conversationId,
                  msgId: sseEvent.msgId,
                  usage: sseEvent.usage,
                });
                continue;
              }
              if (sseEvent.type === 'text') {
                assistantText += sseEvent.content;
                options.onTextMessage(_conversationId, sseEvent.msgId!, sseEvent.content);
              }
              if (sseEvent.type === 'reasoning') {
                assistantReasoning += sseEvent.content;
                options.onReasoningMessage?.(
                  _conversationId,
                  sseEvent.msgId!,
                  sseEvent.content,
                );
              }
              if (sseEvent.type === 'tool_call') {
                // assistant 的 tool_calls 消息必须在 tool result 之前加入历史
                history.push({
                  role: 'assistant',
                  content: assistantText || null,
                  ...(assistantReasoning ? { reasoning_content: assistantReasoning } : {}),
                  tool_calls: sseEvent.toolCalls!.map(tc => ({
                    id: tc.id,
                    type: tc.type,
                    function: { name: tc.function.name, arguments: tc.function.arguments },
                  })),
                } as any);

                const llmToolCallResults: LlmToolCallResult[] = [];
                for (const toolCall of sseEvent.toolCalls!) {
                  if (toolCall.type === 'function') {
                    console.log("[tool debug] onToolCallStart (llmService)", {
                      conversationId: _conversationId,
                      msgId: sseEvent.msgId,
                      callMsgId: msgId,
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                    });
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
                      llmToolCallResults.push({
                        tool_call_id: toolCall.id,
                        result: {
                          content: [
                            {
                              type: "text",
                              text: JSON.stringify({ ok: false, error: errMsg }),
                            },
                          ],
                        },
                        name: toolCall.function.name,
                      });
                      options.onToolCallDone(_conversationId, sseEvent.msgId!, toolCall);
                      continue;
                    }
                    // 强制以当前会话为准，避免模型误把 tabId 传到 conversationId
                    toolArgs.conversationId = _conversationId;

                    let result: unknown;
                    // Ask 轮：页面/Tab 变更类 tool 直接拒绝（不 callTool），带 instruction 引导切 Agent
                    if (
                      isAskModeRound(history) &&
                      isAskBlockedPageTool(toolCall.function.name, toolArgs)
                    ) {
                      result = buildAskPageToolBlockedPayload(
                        toolCall.function.name,
                        getLastUserVisibleGoal(history),
                      );
                    } else {
                      const timeoutMs =
                        typeof toolArgs.timeoutMs === "number" && Number.isFinite(toolArgs.timeoutMs)
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
                        firstContent && firstContent.type === "text" ? firstContent.text : "";
                      result = firstText.startsWith("__JSON__")
                        ? JSON.parse(firstText.slice(8))
                        : firstText;
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
                }
    
                await this.processToolResults(_conversationId, llmToolCallResults, history);
                options.onMessageDone(_conversationId, msgId);
                const halt = await options.onAfterToolResults?.(
                  _conversationId,
                  llmToolCallResults,
                );
                if (halt) {
                  return;
                }
                await this.call(_conversationId, userId, deviceId, site, ever, history, options, msgIds, signal);
                return;
              }
            }

            // 纯文本回复结束，将 assistant 消息加入历史
            if (assistantText) {
              history.push({
                role: 'assistant',
                content: assistantText,
                ...(assistantReasoning ? { reasoning_content: assistantReasoning } : {}),
              } as any);
            }

            options.onMessageDone(_conversationId, msgId);

            // text-only 回收：口头要操作却未发 tool_call → 最多强制一轮 required
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
              history.push({
                role: "user",
                content: buildToolRecoveryNudgeMessage(),
              } as any);
              this.toolChoiceForNextRequest = "required";
              console.log("[tool-recovery] forcing required tool round", {
                conversationId: _conversationId,
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
            return;
          }
          catch (e) {
            // 用户主动 abort 时，不应当作为错误噪音输出，也不应当让上层认为“崩溃”
            if ((e as any)?.name === 'AbortError' || signal?.aborted) {
              console.log(`[${this.getName()}] Request aborted`);
              return;
            }
            console.error(`[${this.getName()}] API call failed:`, e);
            options.onMessageError(_conversationId, msgId, e as Error);
          }
    }

    protected async processToolResults(
      conversationId: string,
      toolResults: LlmToolCallResult[],
      history: ConversationMessage[],
    ): Promise<void> {}

    setConfig(apiKey: string, model: string) {
        this.apiKey = apiKey;
        this.model = model;
    }

    getName(): string {
        return 'unknown';
    }
}
