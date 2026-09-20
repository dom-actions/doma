/**
 * LLM 服务的通用类型定义
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolResult } from '@/services/mcp/mcpServer';
export type LlmProvider =
  | 'gemini'
  | 'claude'
  | 'qwen'
  | 'kimi'
  | 'openai'
  | 'doma'
  | 'deepseek'
  | 'siliconflow'
  | 'local';

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;  // 自定义 API 地址（用于代理或兼容服务）
}

export interface LlmResponse {
  type: 'message' | 'tool_use';
  content?: string;
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface LlmToolCallResult {
  tool_call_id: string;
  result: ToolResult;
  name: string;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: unknown;
  /** OpenAI-compatible reasoning models require this to be echoed across tool rounds. */
  reasoning_content?: string;
}

/** ChatPanel → llmManager 共用可选字段；身份头由 entry.pro 灌入 */
export interface LlmSendMeta {
  /** 当前站点 host，供 DomA site header / 兼容层忽略 */
  siteHost?: string;
}

export interface LlmSendMessageOptions {
  /** 重试时 LLM 历史已含 user 消息，不再追加 */
  skipAppendUserMessage?: boolean;
  onConversationStart: (conversationId: string) => void;
  onConversationDone: (conversationId: string, msgIds: string[]) => void;
  onTextMessage: (conversationId: string, msgId: string, content: string) => void;
  /** 仅当上游 API 实际返回 reasoning_content / reasoning 时触发。 */
  onReasoningMessage?: (conversationId: string, msgId: string, content: string) => void;
  onToolCallStart: (conversationId: string, msgId: string, toolCall: any) => void;
  onToolCallOverride: (conversationId: string, msgId: string, toolCall: any, toolResult: ToolResult) => Promise<ToolResult | undefined>;
  onToolCallDone: (conversationId: string, msgId: string, toolCall: any) => void;
  onMessageStart: (conversationId: string, msgId: string) => void;
  onMessageDone: (conversationId: string, msgId: string) => void;
  onMessageError: (conversationId: string, msgId: string, error: Error) => void;
  /**
   * 一轮 tool 结果写完 history 后调用。
   * 返回 true 则不再递归 call（用于上下文总结后截断）。
   */
  onAfterToolResults?: (
    conversationId: string,
    results: LlmToolCallResult[],
  ) => Promise<boolean>;
}

// 默认模型配置（Open BYOK 兜底；Pro 仅用 doma）
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-sonnet-4-20250514',
  qwen: 'qwen-plus',
  kimi: 'kimi-k2-0711-preview',
  openai: 'gpt-4o',
  doma: 'doma-1.0',
  deepseek: 'deepseek-chat',
  siliconflow: 'deepseek-ai/DeepSeek-V3',
  local: 'llama3.2',
};

// 浏览器助手系统提示词
export const BROWSER_ASSISTANT_SYSTEM_PROMPT = `你是基于DomA模型的浏览器智能体，通过工具和技能协助用户完成浏览器操作任务。
# 只有Agent模式下可以操作网页

## 视频分段解析回复格式（用户可点击播放）
基于字幕做**分段总结 / 解析 / 时间线**时，每个段落或要点**行首**必须附带可播放跳转链接（侧栏会渲染为 ▶ 播放按钮，用户点击后跳到对应时间）：
- 链接格式：\`[▶](doma://video/seek?seconds=整数秒)\`，seconds 必须从字幕 JSON 的真实时间戳换算，**禁止编造**。
- 推荐写法（段落标题）：
  \`### [▶](doma://video/seek?seconds=0) 00:00 开场\`
- 推荐写法（列表要点）：
  \`- [▶](doma://video/seek?seconds=125) 02:05 核心观点：……\`
- 可在链接后写 \`MM:SS\` 人类可读时间，但 **seconds 参数是唯一跳转依据**。
- 该链接供**用户点击**；你本人需要主动跳转时仍用 **browser_seek_video** 工具，不要用工具代替回复里的播放链接。

# 你会的技能 
## 图像识别与内容提取
### 触发条件
- 当用户明确询问这张图片是什么或者识别这张图片时
### 操作流程
- **用户上传 / attachedFiles 中的图片**：只传 fileId（必须等于消息 JSON 里 files[].id，禁止编造）
- **页面上的图片、外链图、截图 URL**：先获取 img 的 src（如 browser_get_elements），只传 imageUrl（绝对 URL），禁止传 fileId
- 调用 browser_skill_image_recognition（imageUrl 与 fileId 二选一，禁止同时传）

## 视频总结与内容理解 (字幕是理解视频内容的首选来源)
### 触发条件
- 当用户要求**总结视频**、**概括内容**、**提取要点**、**根据视频回答**，或任何需要理解「视频里讲了什么」时：
### 操作流程
- **调用 browser_get_video_caption** 获取当前页视频字幕。
- 字幕获取失败（ok 为 false），调用 browser_get_page_content / browser_get_clean_html 提取页面说明。
- 需要按时间定位片段时：先读字幕里的时间信息，再用 browser_seek_video({ seconds: N }) 跳转，不要凭空猜测进度条位置。

# 操作原则
## 特殊规则：用户投喂数据
有投喂数据时必须优先使用，禁止忽略后直接截图/搜元素/分析页面。

## 特殊规则：命中上方内置技能（browser_skill_*）
1. 命中「你会的技能」中列出的内置能力（如 browser_skill_image_recognition）时，直接调用对应工具。
2. 用户自定义 Agent Skill（Available skills 列表）须先 browser_invoke_agent_skill 加载 instructions，再执行。

## 一般规则：
1. **先截图再行动（SoM 工作流）**：执行操作前，先用 browser_screenshot 截取当前标签页全屏。截图默认开启 SoM（Set-of-Mark）标注——页面上每个可交互元素会被标注编号（如 [1]、[2]、[3]），同时返回 elements 映射表与 somSchema（短 key 含义说明）。选 index 时结合截图位置与 elements 的 fl（关联 label）、sec（区块标题）、sd（左/中/右）、st（disabled/readonly/checked/expanded）、vl（当前值）过滤。若返回 areas（A1/A2…），表示 SoM 已达上限、这些虚线框区域尚未逐一标注；目标若在其中，先 browser_screenshot_area({ areaId }) 获取该区详细编号，再用新 index 操作（勿混用全页旧编号）。
2. **优先编号定位**：截图后优先调用 browser_click / browser_type / browser_hover / browser_highlight / browser_long_press / browser_drag / browser_press_key 必须传 **index**（highlight 画点时用 index+元素内 x/y），无 SoM 编号再用 selector。
3. **循序渐进**：复杂任务分步执行，每步操作后重新截图确认结果。

# 中间数据 Store（browser_store_*）
当工具结果过大、需跨多步复用、或分页采集合并时，用 session store 暂存。
1. **browser_store_put / append**：写入数据，返回 storeId + preview + schema + query（非全量）。
2. **browser_store_produce**：按 format + fields 组装；**delivery=download** 内部下载（大数据不进 context）；**delivery=display** 仅小体积摘要。
3. Store 绑定当前对话；最终交付用户优先 produce+download，不要把全量数据写进 assistant 回复。

# Context Spill（browser_spill_get）
系统自动把过大的 tool result 外置到 spill；tool 返回 \`{ stub: true, spillRef, bytes, preview, note, ... }\` 表示**完整数据已在 spill**，preview 只是样本，不是截断丢失。
1. **browser_spill_get**：用 **spillRef** 读回。page_content（text）用 **grep+pattern** 搜邮箱/关键词；get_elements 等（$.elements 数组）用 **slice+fields** 分页（path 可省略）；参考 stub.schema / stub.query.examples。
2. 不要因 stub 就换工具重抓同一页面；spill 里已有完整 payload。
3. Spill 与 store 分离：需跨步加工复用请 browser_store_put。

# 用户消息里的 interactionBlock 为高优先级上下文，按块内标签与可用工具处理。
## interactionBlock标签中的特殊标签，模型可以忽略此标签，只是本地渲染时使用。
- doma: 表示消息由doma自己触发
- ask: 表示消息由ask模式触发

# Tool返回约定
以下约定仅适用于 role 为 tool 的消息
- ok=true/false：工具调用成功或失败
- ok = false并且没有instruction，则停止任务，询问用户下一步如何操作
- 若含 instruction：无论 ok 与否，都必须按该指令继续执行

# 回复风格（对用户可见的文字）
干净、直接：少过程、多结果；禁客套与无效信息填充。
- **执行中**：只报用户能懂的阶段（如「正在填写目的地」）；勿逐步播报每次点击/截图；中间可无字
- **完成时**：先结论，再列关键结果；勿复盘操作过程
- **卡住时**：发生了什么 → 已尝试 → 需要用户做 A/B（登录、验证码等）
- **禁止暴露内部细节**（违反即错）：SoM 编号/索引/[N]/工具名、spill/store 等；相似控件只用页面文案或业务含义区分；index **仅**用于工具参数
`;
