/**
 * 聊天消息 & 自定义 UI 类型定义
 *
 * custom_ui 协议：Tool 返回带有 type + payload 的 JSON，
 * 前端根据 type 动态渲染对应 Vue 组件，通过 messageId 原地更新状态。
 */

import {
  SCHEDULED_SEND_HINTS,
} from '@/services/chat/interactionBlockSendHints';

// ========== CustomUI 类型枚举 ==========

export type CustomUIType =
  | 'VIDEO_SELECTOR'
  | 'DOWNLOAD_PROGRESS'
  | 'FILE_DOWNLOADED'
  | 'FILE_CARD'
  | 'ERROR_CARD'
  | 'USERSCRIPT_SELECTOR'
  | 'USERSCRIPTS'
  | 'PROGRESS'
  | 'THINKING';

export type CustomUIStatus = 'pending' | 'active' | 'completed' | 'error';

// ========== 各 UI 类型的 Payload ==========

export interface VideoOption {
  qualityLabel: string;
  downloadUrl: string;
  audioUrl?: string;
}

export interface VideoItem {
  id: number;
  title: string;
  downloadUrl: string;
  hostUrl: string;
  poster?: string;
  faviconUrl?: string;
  audioUrl?: string;
  type?: string;
  protect?: boolean;
  qualityList?: VideoOption[];
  videoKey?: string;
  videoUuid?: string;
  [key: string]: unknown;
}

export interface VideoSelectorPayload {
  videos: VideoItem[];
  selectedIndex?: number;
  selectedQuality?: string;
}

export interface DownloadProgressPayload {
  videoId: string;
  title: string;
  poster?: string;
  percent: number;
  speed?: string;
  status: 'downloading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
}

export interface FileDownloadedPayload {
  videoId: string;
  title: string;
  poster?: string;
  fileSize?: string;
  filePath?: string;
  downloadUrl?: string;
}

export interface FileCardPayload {
  fileName: string;
  fileType: string;
  fileSize?: string;
  url?: string;
  icon?: string;
}

export interface ErrorCardPayload {
  title: string;
  message: string;
  retryAction?: string;
}

export interface UserScriptSelectorPayload {
  userscriptList: {
    id: number;
    title: string;
    description: string;
    downloadUrl: string;
    author: string;
  }[];
}

export interface InstalledUserScriptItem {
  uuid: string;
  activated: boolean;
  title: string;
  description: string;
  version: string;
  icon?: string;
}

export interface UserscriptsPayload {
  activated: InstalledUserScriptItem[];
  stopped: InstalledUserScriptItem[];
  url?: string;
}

/** 通用工具进度卡片（由 background 通过 processId 推送更新） */
export interface ProgressPayload {
  processId: string;
  message: string;
  status: 'running' | 'completed' | 'error';
  title?: string;
  errorMessage?: string;
}

/** 思考过程卡片（由 thinkId 定位，content 增量追加） */
export interface ThinkingPayload {
  thinkId: string;
  content: string;
  status: 'running' | 'completed' | 'error';
  title?: string;
  errorMessage?: string;
}

// ========== CustomUI 联合类型 ==========

export type CustomUIPayload =
  | VideoSelectorPayload
  | DownloadProgressPayload
  | FileDownloadedPayload
  | FileCardPayload
  | ErrorCardPayload
  | UserScriptSelectorPayload
  | UserscriptsPayload
  | ProgressPayload
  | ThinkingPayload;

export interface CustomUI {
  type: CustomUIType;
  status: CustomUIStatus;
  payload: CustomUIPayload;
}

// ========== 页面选区 chip → LLM（interactionBlock / primarySubject） ==========

/** 当前产品里来自「页面复制选区」的 chip 种类（后续可扩展其它 kind + 不同 struct） */
export type CopySelectionChipKind = "elements";

/** primarySubject 类型：页面点选 vs 划词复制 */
export type PrimarySubjectType = "selectedElements" | "copyElements";

/** 注入脚本 copy 消息里的 `selectors`：公共祖先 + 与选区相交的直系子元素 */
export interface CopySelectionSelectorsPayload {
  rootSelector: string;
  childSelectors: string[];
}

/** 将 copy 消息的 root + 子选择器展平为 string[]（root 在前），用于判断是否有定位信息或与 DOM 收集逻辑对齐 */
export function flattenCopySelectionSelectors(
  s: CopySelectionSelectorsPayload | undefined,
): string[] {
  if (!s) return [];
  const out: string[] = [];
  const root = (s.rootSelector || "").trim();
  if (root) out.push(root);
  for (const c of s.childSelectors ?? []) {
    if (typeof c === "string" && c.trim()) out.push(c.trim());
  }
  return out;
}

/**
 * 发给模型的 JSON 载荷（放在 `<primarySubject>` 内）。
 * 与 `src/services/chat/llm/llmTypes.ts` 系统提示中的字段约定一致。
 */
export interface PageElementsPayload {
  /** 网站域名或页面标识字符串（如 location.host） */
  host: string;
  favicon?: string;
  /** 标签页 ID，字符串形式 */
  tabId: string;
  /** 选区公共祖先（根）的 CSS 选择器 */
  rootSelector: string;
  /** 与选区相交的直系子元素等，每条为相对根的选择器或完整选择器（与注入脚本约定一致） */
  childSelectors?: string[];
  /** 选区纯文本，无则省略该字段 */
  text?: string;
}

export interface UserAttachedFileMeta {
  id?: string;
  name: string;
  type?: string;
  size?: number;
  lastModified?: number;
}

/** interactionBlock 内 toolInput：供模型直接按 name/args 调用工具；__text 为用户可见 chip 文案 */
export interface UserToolInputBlock {
  name: string;
  args: Record<string, unknown>;
  __text?: string;
}

export interface PrimarySubjectBlock {
  type: PrimarySubjectType;
  payload: PageElementsPayload;
}

/** 组装 primarySubject 标签（JSON 放在标签体内） */
export function formatPrimarySubjectForPrompt(
  type: PrimarySubjectType,
  payload: PageElementsPayload,
): string {
  const o: Record<string, unknown> = {
    host: payload.host,
    tabId: payload.tabId,
    rootSelector: payload.rootSelector,
  };
  if (payload.favicon) o.favicon = payload.favicon;
  if (payload.childSelectors && payload.childSelectors.length > 0) {
    o.childSelectors = payload.childSelectors;
  }
  if (payload.text != null && String(payload.text).length > 0) {
    o.text = payload.text;
  }
  return `<primarySubject type="${type}">${JSON.stringify(o)}</primarySubject>`;
}

function formatAttachedFilesTag(files: UserAttachedFileMeta[]): string {
  return `<attachedFiles>${JSON.stringify({ files })}</attachedFiles>`;
}

function formatToolInputTag(block: UserToolInputBlock): string {
  return `<toolInput>${JSON.stringify({
    name: block.name,
    args: block.args,
    ...(block.__text != null && String(block.__text).length > 0 ? { __text: block.__text } : {}),
  })}</toolInput>`;
}

const INTERACTION_BLOCK_PRIORITY_HINT = "# 最优先使用以下上下文";

const INTERACTION_BLOCK_ATTACHED_FILES_HINT = `## attachedFiles
- 需要获取附件调用browser_get_upload_file
- 分析上一步的结果和和用户当前提问的关系，继续操作
- 标签体内 JOSN字段含义
  files: 附件列表
    id: 附件ID，必填，用于取内容
    name: 附件名称
    type: 附件类型
    size: 附件大小
    lastModified: 附件修改时间
- 如果后续意图是**图像识别**(browser_skill_image_recognition),则传入files[].id作为fileId
`;

const INTERACTION_BLOCK_PRIMARY_SUBJECT_HINT = `## primarySubject
- **必须用rootSelector 作为selector参数** 调用 browser_get_elements 获取页面元素
- 分析上一步获取的元素，**必须查看该元素或者子元素是否为图片元素** 
- 分析上一步的结果和和用户当前提问的关系，继续操作
- 标签体内 JOSN字段含义
  tabId: 元素所在的标签页ID
  rootSelector: 选区公共祖先（根）的CSS选择器
  childSelectors: 与选区相交的直系子元素等
  text: 选取包含的纯文本内容
`;

const INTERACTION_BLOCK_ACTIVE_TAB_HINT = `## activeTab
- 发送本条消息时浏览器**当前激活**的标签页
- 标签体内 JSON字段含义
  tabId: 标签页 ID
  title: 页面标题
`;

/** 随 toolInput 注入的说明（在此填写） */
const INTERACTION_BLOCK_TOOL_INPUT_HINT = `## toolInput
- 看到 toolInput 时按 name/args 立即调用对应工具，不要等待用户再次确认
- 标签体内 JSON字段含义：
  name: 工具名
  args: 工具参数
  __text: 可选，对用户展示的 chip 文案
`;

function wrapInteractionBlock(innerTag: string, typeHint?: string): string {
  const lines = [INTERACTION_BLOCK_PRIORITY_HINT];
  if (typeHint) lines.push(typeHint);
  lines.push(innerTag);
  return `<interactionBlock>\n${lines.join("\n")}\n</interactionBlock>`;
}

export type TabMentionBlock = {
  tabId?: number;
  title: string;
  url: string;
  favIconUrl?: string;
};

export type UserMessageSegment =
  | { type: "text"; text: string }
  | { type: "attachedFiles"; files: UserAttachedFileMeta[] }
  | { type: "primarySubject"; block: PrimarySubjectBlock }
  | { type: "toolInput"; block: UserToolInputBlock }
  | { type: "command"; commandId: string }
  | { type: "skill"; skillId: string }
  | { type: "tab"; tab: TabMentionBlock }
  | { type: "quote"; quotedMsgId: string };

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 引用历史用户消息：块内仅存 msg id，发送前再查全文注入 */
const INTERACTION_BLOCK_QUOTED_USER_MESSAGE_HINT = `## quotedUserMessage
- 用户引用了一条历史用户消息；标签仅含 id
- 若块内已有完整原文，请优先结合该原文理解用户意图
`;

/** 序列化引用标签（只存 id；全文在发送时再查） */
export function formatQuotedUserMessageTag(quotedMsgId: string): string {
  const id = String(quotedMsgId ?? "").trim();
  if (!id) return "";
  return `<quotedUserMessage id="${escapeXmlText(id)}"/>`;
}

/** 把引用块包进 interactionBlock（不含全文） */
export function formatQuotedUserMessageForSend(quotedMsgId: string): string {
  const tag = formatQuotedUserMessageTag(quotedMsgId);
  if (!tag) return "";
  return wrapInteractionBlock(tag, INTERACTION_BLOCK_QUOTED_USER_MESSAGE_HINT);
}

/** 嵌入 interactionBlock 前，避免原文里的闭合标签截断外层块 */
function sanitizeQuotedContentForBlockInner(content: string): string {
  return String(content ?? "").replace(/<\/interactionBlock>/gi, "</\u200BinteractionBlock>");
}

/**
 * 发送给模型前：按 id 查历史用户消息，把完整原文注入到对应 quotedUserMessage 标签前。
 * 查不到则保留空引用标签（删气泡后引用为空）。
 * 注意：仅用于 LLM 上下文，不要写回气泡/落盘（否则原文里的 primarySubject 等会渲成 chip）。
 */
export function expandQuotedUserMessagesInSendText(
  sendText: string,
  resolveContent: (quotedMsgId: string) => string,
  seen: Set<string> = new Set(),
): string {
  const s = String(sendText ?? "");
  if (!s.trim() || !/<quotedUserMessage\b/i.test(s)) return s;

  const tagRe = /<quotedUserMessage\b([^>]*)\/?>/gi;
  const out = s.replace(tagRe, (full, attrs: string) => {
    const idMatch = String(attrs ?? "").match(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const quotedMsgId = (idMatch?.[1] ?? idMatch?.[2] ?? "").trim();
    if (!quotedMsgId) return full;
    const tag = formatQuotedUserMessageTag(quotedMsgId);
    if (seen.has(quotedMsgId)) return tag;
    seen.add(quotedMsgId);
    const raw = String(resolveContent(quotedMsgId) ?? "");
    if (!raw.trim()) return tag;
    const safe = sanitizeQuotedContentForBlockInner(raw);
    return (
      `\n--- begin quoted user message (id=${quotedMsgId}) ---\n` +
      `${safe}\n` +
      `--- end quoted user message ---\n` +
      `${tag}`
    );
  });

  if (out !== s && /<quotedUserMessage\b/i.test(out)) {
    return expandQuotedUserMessagesInSendText(out, resolveContent, seen);
  }
  return out;
}

function readXmlTextContent(inner: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = inner.match(re);
  return m?.[1]?.trim() ?? "";
}

/** 序列化 @ 提及 tab 的协议标签（发送前由 tabMentionSend 包进 interactionBlock） */
export function formatTabMentionTag(tab: TabMentionBlock): string {
  const lines: string[] = [];
  if (tab.tabId != null && tab.tabId > 0) {
    lines.push(`<tabId>${Math.floor(tab.tabId)}</tabId>`);
  }
  lines.push(`<title>${escapeXmlText(tab.title)}</title>`);
  lines.push(`<url>${escapeXmlText(tab.url)}</url>`);
  const fav = tab.favIconUrl?.trim();
  if (fav) lines.push(`<favIconUrl>${escapeXmlText(fav)}</favIconUrl>`);
  return `<tab>\n${lines.join("\n")}\n</tab>`;
}

/** 发送时当前激活标签页（memoryHooks 注入 interactionBlock） */
export type ActiveTabBlock = {
  tabId?: number;
  title?: string;
};

/** 组装 activeTab 标签（JSON 放在标签体内，与 primarySubject 一致） */
export function formatActiveTabTag(tab: ActiveTabBlock): string {
  const title = String(tab.title ?? "").trim();
  const tabId =
    typeof tab.tabId === "number" && Number.isFinite(tab.tabId) && tab.tabId > 0
      ? Math.floor(tab.tabId)
      : undefined;
  if (!title && tabId == null) return "";

  const o: Record<string, unknown> = {};
  if (tabId != null) o.tabId = tabId;
  if (title) o.title = title;
  return `<activeTab>${JSON.stringify(o)}</activeTab>`;
}

/** hint + 标签，供写入已有 / 新建 interactionBlock */
export function formatActiveTabForInteractionBlock(tab?: ActiveTabBlock | null): string {
  if (!tab) return "";
  const tag = formatActiveTabTag(tab);
  if (!tag) return "";
  return `${INTERACTION_BLOCK_ACTIVE_TAB_HINT}\n${tag}`;
}

function parseTabMentionBlockFromInner(inner: string): TabMentionBlock | null {
  const url = readXmlTextContent(inner, "url");
  if (!url.trim()) return null;
  const tabIdStr = readXmlTextContent(inner, "tabId");
  const tabIdParsed = parseInt(tabIdStr, 10);
  const tabId =
    Number.isFinite(tabIdParsed) && tabIdParsed > 0 ? tabIdParsed : undefined;
  return {
    tabId,
    title: readXmlTextContent(inner, "title"),
    url,
    favIconUrl: readXmlTextContent(inner, "favIconUrl") || undefined,
  };
}

const INTERACTION_BLOCK_RE = /<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi;

function findNextInteractionBlockTag(
  src: string,
  from: number,
): { end: number; segment: UserMessageSegment } | null {
  type Candidate = { index: number; end: number; segment: UserMessageSegment };
  const candidates: Candidate[] = [];

  const filesIdx = src.indexOf("<attachedFiles>", from);
  if (filesIdx !== -1) {
    const close = src.indexOf("</attachedFiles>", filesIdx);
    if (close !== -1) {
      const inner = src.slice(filesIdx, close + "</attachedFiles>".length);
      const files = extractAttachedFilesFromBlock(inner);
      if (files?.length) {
        candidates.push({
          index: filesIdx,
          end: close + "</attachedFiles>".length,
          segment: { type: "attachedFiles", files },
        });
      }
    }
  }

  const psIdx = src.indexOf("<primarySubject", from);
  if (psIdx !== -1) {
    const psParsed = tryParsePrimarySubjectAt(src, psIdx);
    if (psParsed) {
      const payload = parsePageElementsPayloadJson(psParsed.jsonStr);
      if (payload) {
        candidates.push({
          index: psIdx,
          end: psParsed.end,
          segment: { type: "primarySubject", block: { type: psParsed.subjectType, payload } },
        });
      }
    }
  }

  const toolIdx = src.indexOf("<toolInput>", from);
  if (toolIdx !== -1) {
    const close = src.indexOf("</toolInput>", toolIdx);
    if (close !== -1) {
      const json = src.slice(toolIdx + "<toolInput>".length, close);
      const block = parseUserToolInputJson(json);
      if (block) {
        candidates.push({
          index: toolIdx,
          end: close + "</toolInput>".length,
          segment: { type: "toolInput", block },
        });
      }
    }
  }

  const cmdIdx = src.indexOf("<command>", from);
  if (cmdIdx !== -1) {
    const close = src.indexOf("</command>", cmdIdx);
    if (close !== -1) {
      const commandId = src.slice(cmdIdx + "<command>".length, close).trim();
      if (commandId) {
        candidates.push({
          index: cmdIdx,
          end: close + "</command>".length,
          segment: { type: "command", commandId },
        });
      }
    }
  }

  const tabIdx = src.indexOf("<tab>", from);
  if (tabIdx !== -1) {
    const close = src.indexOf("</tab>", tabIdx);
    if (close !== -1) {
      const inner = src.slice(tabIdx + "<tab>".length, close);
      const tab = parseTabMentionBlockFromInner(inner);
      if (tab) {
        candidates.push({
          index: tabIdx,
          end: close + "</tab>".length,
          segment: { type: "tab", tab },
        });
      }
    }
  }

  const skillTags: Array<{ open: string; close: string }> = [
    { open: "<skill>", close: "</skill>" },
    { open: "<prompt>", close: "</prompt>" },
  ];
  for (const tag of skillTags) {
    const skillIdx = src.indexOf(tag.open, from);
    if (skillIdx === -1) continue;
    const close = src.indexOf(tag.close, skillIdx);
    if (close === -1) continue;
    const skillId = src.slice(skillIdx + tag.open.length, close).trim();
    if (skillId) {
      candidates.push({
        index: skillIdx,
        end: close + tag.close.length,
        segment: { type: "skill", skillId },
      });
    }
  }

  {
    const slice = src.slice(from);
    const m = slice.match(/<quotedUserMessage\b[^>]*\/?>/i);
    if (m && m.index != null) {
      const abs = from + m.index;
      const attrs = m[0].replace(/^<quotedUserMessage\b/i, "").replace(/\/?>$/i, "");
      const idMatch = attrs.match(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const quotedMsgId = (idMatch?.[1] ?? idMatch?.[2] ?? "").trim();
      if (quotedMsgId) {
        candidates.push({
          index: abs,
          end: abs + m[0].length,
          segment: { type: "quote", quotedMsgId },
        });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.index - b.index);
  const best = candidates[0]!;
  return { end: best.end, segment: best.segment };
}

function parseInteractionBlockInnerSequential(inner: string): UserMessageSegment[] {
  const out: UserMessageSegment[] = [];
  let cursor = 0;
  while (cursor < inner.length) {
    const next = findNextInteractionBlockTag(inner, cursor);
    if (!next) break;
    // 跳过 mcpCall/doma/ask 等标记到下一个协议标签之间的纯提示，不进入气泡
    out.push(next.segment);
    cursor = next.end;
  }
  return out;
}

function isNonEmptyUserText(t: string): boolean {
  return !!t.trim() || /\n/.test(t);
}

/** 按片段顺序序列化用户消息；每个交互块单独包一层 interactionBlock，与正文交错 */
export function serializeUserMessageSegments(segments: UserMessageSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    switch (seg.type) {
      case "text": {
        const t = String(seg.text ?? "");
        if (isNonEmptyUserText(t)) parts.push(t);
        break;
      }
      case "attachedFiles":
        if (seg.files.length) {
          parts.push(
            wrapInteractionBlock(formatAttachedFilesTag(seg.files), INTERACTION_BLOCK_ATTACHED_FILES_HINT),
          );
        }
        break;
      case "primarySubject":
        parts.push(
          wrapInteractionBlock(
            formatPrimarySubjectForPrompt(seg.block.type, seg.block.payload),
            INTERACTION_BLOCK_PRIMARY_SUBJECT_HINT,
          ),
        );
        break;
      case "toolInput":
        parts.push(
          wrapInteractionBlock(formatToolInputTag(seg.block), INTERACTION_BLOCK_TOOL_INPUT_HINT),
        );
        break;
      case "command":
        if (seg.commandId.trim()) {
          parts.push(`<command>${seg.commandId.trim()}</command>`);
        }
        break;
      case "skill":
        if (seg.skillId.trim()) {
          parts.push(`<skill>${seg.skillId.trim()}</skill>`);
        }
        break;
      case "tab":
        parts.push(formatTabMentionTag(seg.tab));
        break;
      case "quote":
        if (seg.quotedMsgId.trim()) {
          parts.push(formatQuotedUserMessageForSend(seg.quotedMsgId));
        }
        break;
    }
  }
  // 换行由 text 段内的 \n 表达；不用 join("\n")，避免 chip 与同行正文被拆行
  return parts.join("");
}

/** 解析用户消息片段（支持多个 interactionBlock 与正文交错） */
export function parseUserMessageSegments(content: string): UserMessageSegment[] {
  const s = String(content ?? "");
  if (!s.trim()) return [];

  const segments: UserMessageSegment[] = [];
  let cursor = 0;
  const re = new RegExp(INTERACTION_BLOCK_RE.source, "gi");
  let m: RegExpExecArray | null;

  while ((m = re.exec(s)) !== null) {
    if (m.index > cursor) {
      const text = s.slice(cursor, m.index);
      if (isNonEmptyUserText(text)) segments.push({ type: "text", text });
    }
    segments.push(...parseInteractionBlockInnerSequential(m[1] ?? ""));
    cursor = m.index + m[0]!.length;
    // prepareUserSendText 用 `\n` 分隔 block 与正文；该换行不进入气泡
    if (s[cursor] === "\n") cursor += 1;
  }

  const tail = s.slice(cursor);
  if (isNonEmptyUserText(tail)) segments.push({ type: "text", text: tail });

  return segments;
}

/** interactionBlock 内可渲染 chip/附件的协议子标签 */
const INTERACTION_BLOCK_INNER_TAG_RE =
  /(<(attachedFiles|primarySubject|toolInput|command|skill|prompt|tab|quotedUserMessage|mcpCall)\b|<doma\s*\/?>|<ask\s*\/?>|<scheduled\b[^>]*>[\s\S]*?<\/scheduled>)/i;

/** `<scheduled>id</scheduled>` */
const SCHEDULED_TAG_RE = /<scheduled\b[^>]*>[\s\S]*?<\/scheduled>/i;

function formatScheduledTag(scheduledId: string): string {
  const id = String(scheduledId ?? "").trim();
  return `<scheduled>${id}</scheduled>`;
}

/** interactionBlock 内是否含 doma 自触发标记 */
export function hasInteractionBlockDomaTag(content: string): boolean {
  const s = String(content ?? "");
  return [...s.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)].some((m) =>
    /<doma\s*\/?>/i.test(m[1] ?? ""),
  );
}

/** interactionBlock 内是否含 Ask 模式标记 */
export function hasInteractionBlockAskTag(content: string): boolean {
  const s = String(content ?? "");
  return [...s.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)].some((m) =>
    /<ask\s*\/?>/i.test(m[1] ?? ""),
  );
}

/** interactionBlock 内是否含定时消息标记（`<scheduled>id</scheduled>`） */
export function hasInteractionBlockScheduledTag(content: string): boolean {
  const s = String(content ?? "");
  return [...s.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)].some((m) =>
    SCHEDULED_TAG_RE.test(m[1] ?? ""),
  );
}

/** 从用户消息中解析定时任务 id（`<scheduled>…</scheduled>` 正文） */
export function extractScheduledIdFromContent(content: string): string | null {
  const s = String(content ?? "");
  for (const m of s.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)) {
    const body = /<scheduled\b[^>]*>([\s\S]*?)<\/scheduled>/i.exec(m[1] ?? "");
    if (!body) continue;
    const id = String(body[1] ?? "").trim();
    if (id) return id;
  }
  return null;
}

/** interactionBlock 内是否含 MCP 外部调用标记 */
export function hasInteractionBlockMcpCallTag(content: string): boolean {
  const s = String(content ?? "");
  return [...s.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)].some((m) =>
    /<mcpCall\b[^>]*>[\s\S]*?<\/mcpCall>/i.test(m[1] ?? ""),
  );
}

/**
 * 定时触发发送前：保证文案带 interactionBlock + scheduled hints + `<scheduled>{id}</scheduled>`。
 * - 已有 scheduled 标签：替换为带正确 id 的标签，并补齐 hints
 * - 已有 interactionBlock 但无 scheduled：向块内注入 hints 与标签
 * - 无 interactionBlock：包一层含 hints + scheduled 的块，正文放块外
 *
 * hints 入口：`SCHEDULED_SEND_HINTS`（interactionBlockSendHints.ts）
 */
export function ensureScheduledInteractionTag(text: string, scheduledId: string): string {
  const s = String(text ?? "").trim();
  const id = String(scheduledId ?? "").trim();
  if (!s || !id) return s;
  const tag = formatScheduledTag(id);
  const hintLines = SCHEDULED_SEND_HINTS.map((line) => line.trim()).filter(Boolean);

  const hasBlock = /<interactionBlock>[\s\S]*?<\/interactionBlock>/i.test(s);
  if (!hasBlock) {
    const inner = [INTERACTION_BLOCK_PRIORITY_HINT, ...hintLines, tag].join("\n");
    return `<interactionBlock>\n${inner}\n</interactionBlock>\n${s}`;
  }

  return s.replace(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi, (_full, inner: string) => {
    let body = String(inner ?? "");
    if (SCHEDULED_TAG_RE.test(body)) {
      body = body.replace(SCHEDULED_TAG_RE, tag);
    } else {
      body = `${body.trimEnd()}\n${tag}`;
    }
    body = injectScheduledHintsIntoBlockInner(body, hintLines);
    return `<interactionBlock>\n${body.trim()}\n</interactionBlock>`;
  });
}

/** 在 interactionBlock 内补齐定时任务 prompt 说明（已存在则不重复） */
function injectScheduledHintsIntoBlockInner(inner: string, hints: string[]): string {
  if (!hints.length) return inner;
  const missing = hints.filter((h) => !inner.includes(h));
  if (!missing.length) return inner;

  const trimmed = inner.trim();
  if (trimmed.startsWith(INTERACTION_BLOCK_PRIORITY_HINT)) {
    const after = trimmed.slice(INTERACTION_BLOCK_PRIORITY_HINT.length).replace(/^\n/, "");
    return [INTERACTION_BLOCK_PRIORITY_HINT, ...missing, after].filter((line) => line !== "").join("\n");
  }
  return [INTERACTION_BLOCK_PRIORITY_HINT, ...missing, trimmed].join("\n");
}

/** 取 interactionBlock 内第一个 <mcpCall>…</mcpCall> 显示名（去标签） */
export function extractMcpCallLabel(content: string): string | null {
  const s = String(content ?? "");
  for (const m of s.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)) {
    const inner = m[1] ?? "";
    const tag = /<mcpCall\b[^>]*>([\s\S]*?)<\/mcpCall>/i.exec(inner);
    if (!tag) continue;
    const label = String(tag[1] ?? "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
    if (label) return label.slice(0, 64);
  }
  return null;
}

/**
 * 用户气泡是否应隐藏：整段仅含 interactionBlock，且块内无协议子标签（纯上下文提示文本）。
 * 含 <mcpCall> / <scheduled>…</scheduled> 的消息始终展示。
 */
export function shouldHideUserBubble(content: string): boolean {
  const s = String(content ?? "").trim();
  if (!s) return true;
  if (hasInteractionBlockMcpCallTag(s)) return false;
  if (hasInteractionBlockScheduledTag(s)) return false;

  const blocks = [...s.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)];
  if (blocks.length === 0) return false;

  const outside = s.replace(/<interactionBlock>[\s\S]*?<\/interactionBlock>/gi, "").trim();
  if (outside) return false;

  return blocks.every((m) => !INTERACTION_BLOCK_INNER_TAG_RE.test(m[1] ?? ""));
}

/** 从消息列表取最近一条应在 picker/title 展示的用户问题（跳过隐藏气泡） */
export function resolveConversationLastUserQuestion(
  messages: Array<{ role: string; content?: string | null }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const content = String(m.content ?? "").trim();
    if (!content || shouldHideUserBubble(content)) continue;
    return content;
  }
  return "";
}

/** 组装完整用户消息（按 segments 顺序，interactionBlock 与正文交错） */
export function formatUserMessageForModel(input: {
  segments?: UserMessageSegment[];
  /** 程序化发送（无 composer 顺序）时的简写 */
  body?: string;
  primarySubjects?: PrimarySubjectBlock[];
  files?: UserAttachedFileMeta[] | null;
  toolInputs?: UserToolInputBlock[] | null;
}): string {
  if (input.segments?.length) {
    return serializeUserMessageSegments(input.segments);
  }

  const segments: UserMessageSegment[] = [];
  if (input.files?.length) segments.push({ type: "attachedFiles", files: input.files });
  if (input.body?.trim()) segments.push({ type: "text", text: input.body.trim() });
  for (const ps of input.primarySubjects ?? []) {
    segments.push({ type: "primarySubject", block: ps });
  }
  for (const ti of input.toolInputs ?? []) {
    segments.push({ type: "toolInput", block: ti });
  }
  return serializeUserMessageSegments(segments);
}

const PRIMARY_SUBJECT_RE =
  /<primarySubject\s+type="(selectedElements|copyElements)"\s*>([\s\S]*?)<\/primarySubject>/gi;
const ATTACHED_FILES_RE = /<attachedFiles>([\s\S]*?)<\/attachedFiles>/i;
const TOOL_INPUT_RE = /<toolInput>([\s\S]*?)<\/toolInput>/gi;

export function parseUserToolInputJson(jsonStr: string): UserToolInputBlock | null {
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name || !o.args || typeof o.args !== "object" || Array.isArray(o.args)) return null;
    const __text = typeof o.__text === "string" ? o.__text : undefined;
    return { name, args: o.args as Record<string, unknown>, ...(__text != null ? { __text } : {}) };
  } catch {
    return null;
  }
}

export function extractToolInputsFromBlock(inner: string): UserToolInputBlock[] {
  const out: UserToolInputBlock[] = [];
  const re = new RegExp(TOOL_INPUT_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const block = parseUserToolInputJson(m[1] ?? "");
    if (block) out.push(block);
  }
  return out;
}

export function toolInputDisplayLabel(block: UserToolInputBlock): string {
  const text = block.__text?.trim();
  if (text) return text;
  return block.name;
}

export function parsePageElementsPayloadJson(jsonStr: string): PageElementsPayload | null {
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>;
    return pageElementsPayloadFromJsonObject(o);
  } catch {
    return null;
  }
}

/** 解析用户消息 JSON / 旧版扁平 selectors[] */
export function pageElementsPayloadFromJsonObject(o: Record<string, unknown>): PageElementsPayload | null {
  const host = typeof o.host === "string" ? o.host.trim() : "";
  const tabId =
    typeof o.tabId === "string"
      ? o.tabId.trim()
      : typeof o.tabId === "number" && Number.isFinite(o.tabId)
        ? String(Math.floor(o.tabId))
        : "";
  let rootSelector = typeof o.rootSelector === "string" ? o.rootSelector.trim() : "";
  let childSelectors: string[] | undefined;
  if (Array.isArray(o.childSelectors)) {
    const cs = o.childSelectors
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (cs.length) childSelectors = cs;
  }
  if (!rootSelector && !childSelectors?.length && Array.isArray(o.selectors)) {
    const arr = o.selectors
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (arr.length) {
      rootSelector = arr[0]!;
      if (arr.length > 1) childSelectors = arr.slice(1);
    }
  }
  const favicon = typeof o.favicon === "string" && o.favicon.trim() ? o.favicon.trim() : undefined;
  const text = typeof o.text === "string" ? o.text : undefined;
  if (!host) return null;
  // copyElements 可能只有划词文本、暂无可用 selector；仍需能解析出来渲染气泡 chip
  const hasSelectors = !!rootSelector || !!(childSelectors?.length);
  const hasText = text != null && text.length > 0;
  if (!hasSelectors && !hasText) return null;
  return {
    host,
    tabId: tabId || "0",
    rootSelector,
    ...(childSelectors?.length ? { childSelectors } : {}),
    ...(favicon ? { favicon } : {}),
    ...(text != null && text.length > 0 ? { text } : {}),
  };
}

export function extractPrimarySubjectsFromText(src: string): PrimarySubjectBlock[] {
  const out: PrimarySubjectBlock[] = [];
  const re = new RegExp(PRIMARY_SUBJECT_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const type = m[1] as PrimarySubjectType;
    const payload = parsePageElementsPayloadJson(m[2] ?? "");
    if (payload) out.push({ type, payload });
  }
  return out;
}

export function extractAttachedFilesFromBlock(inner: string): UserAttachedFileMeta[] | null {
  const m = inner.match(ATTACHED_FILES_RE);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1] ?? "") as Record<string, unknown>;
    const arr = o.files;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const out: UserAttachedFileMeta[] = [];
    for (const x of arr) {
      if (!x || typeof x !== "object") continue;
      const id = typeof (x as any).id === "string" ? (x as any).id.trim() : "";
      const name = typeof (x as any).name === "string" ? (x as any).name.trim() : "";
      if (!name) continue;
      const type = typeof (x as any).type === "string" ? (x as any).type : undefined;
      const size =
        typeof (x as any).size === "number" && Number.isFinite((x as any).size) ? (x as any).size : undefined;
      const lastModified =
        typeof (x as any).lastModified === "number" && Number.isFinite((x as any).lastModified)
          ? (x as any).lastModified
          : undefined;
      out.push({ ...(id ? { id } : {}), name, type, size, lastModified });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export function splitUserMessageContent(content: string): {
  interactionBlockInner: string | null;
  body: string;
} {
  const s = String(content ?? "");
  const m = s.match(/^<interactionBlock>([\s\S]*?)<\/interactionBlock>\s*/i);
  if (!m) return { interactionBlockInner: null, body: s };
  return { interactionBlockInner: m[1] ?? "", body: s.slice(m[0]!.length) };
}

export type ComposerPasteSegment =
  | { type: "text"; text: string }
  | { type: "elements"; struct: PageElementsPayload; subjectType: PrimarySubjectType };

const PRIMARY_SUBJECT_OPEN_RE =
  /^<primarySubject\s+type="(selectedElements|copyElements)"\s*>/i;

function tryParsePrimarySubjectAt(
  src: string,
  from: number,
): { end: number; subjectType: PrimarySubjectType; jsonStr: string } | null {
  if (!src.startsWith("<primarySubject", from)) return null;
  const typeMatch = src.slice(from).match(PRIMARY_SUBJECT_OPEN_RE);
  if (!typeMatch) return null;
  const subjectType = typeMatch[1] as PrimarySubjectType;
  const openEnd = from + typeMatch[0]!.length;
  const closeIdx = src.indexOf("</primarySubject>", openEnd);
  if (closeIdx === -1) return null;
  return {
    end: closeIdx + "</primarySubject>".length,
    subjectType,
    jsonStr: src.slice(openEnd, closeIdx),
  };
}

function parseBubbleElementsChipFromEl(el: HTMLElement): ComposerPasteSegment | null {
  if (el.dataset.bubbleElementsChip == null && !el.hasAttribute("data-bubble-elements-chip")) return null;
  const structEnc = el.dataset.struct;
  if (!structEnc) return null;
  try {
    const struct = parsePageElementsPayloadJson(decodeURIComponent(structEnc));
    if (!struct) return null;
    const rawType = el.dataset.subjectType;
    const subjectType: PrimarySubjectType =
      rawType === "selectedElements" || rawType === "copyElements" ? rawType : "copyElements";
    return { type: "elements", struct, subjectType };
  } catch {
    return null;
  }
}

/** 从 DOM 片段（粘贴 HTML 或复制选区）解析 chip + 正文 */
export function parseComposerPasteDom(root: Node): ComposerPasteSegment[] | null {
  const out: ComposerPasteSegment[] = [];

  const appendText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.type === "text") {
      last.text += text;
    } else {
      out.push({ type: "text", text });
    }
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    const chipSeg = parseBubbleElementsChipFromEl(el);
    if (chipSeg) {
      out.push(chipSeg);
      return;
    }

    const tag = el.tagName;
    if (tag === "BR") {
      appendText("\n");
      return;
    }
    if (tag === "P" || tag === "DIV") {
      if (out.length) appendText("\n");
      for (const child of el.childNodes) walk(child);
      return;
    }
    for (const child of el.childNodes) walk(child);
  };

  for (const child of root.childNodes) walk(child);

  const normalized = out
    .map((seg) => (seg.type === "text" ? { ...seg, text: seg.text.replace(/\u00a0/g, " ") } : seg))
    .filter((seg) => seg.type !== "text" || seg.text.length > 0);

  if (!normalized.some((x) => x.type === "elements")) return null;
  return normalized;
}

/** 解析粘贴 HTML（如从用户气泡复制）为 chip + 正文 */
export function parseComposerPasteHtml(html: string): ComposerPasteSegment[] | null {
  const raw = String(html ?? "").trim();
  if (!raw) return null;
  const doc = new DOMParser().parseFromString(raw, "text/html");
  return parseComposerPasteDom(doc.body);
}

/** 解析粘贴文本为新协议片段，保留 interactionBlock/正文 交错顺序 */
export function parseComposerPasteText(text: string): ComposerPasteSegment[] | null {
  const segments = parseUserMessageSegments(text);
  if (!segments.length) return null;

  const out: ComposerPasteSegment[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      out.push({ type: "text", text: seg.text });
    } else if (seg.type === "primarySubject") {
      out.push({ type: "elements", struct: seg.block.payload, subjectType: seg.block.type });
    }
  }

  if (!out.some((x) => x.type === "elements")) return null;
  return out;
}

/** ComposerPasteSegment → UserMessageSegment（用于复制到剪贴板） */
export function composerPasteSegmentsToUserMessageSegments(
  segments: ComposerPasteSegment[],
): UserMessageSegment[] {
  const out: UserMessageSegment[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      out.push({ type: "text", text: seg.text });
    } else {
      out.push({ type: "primarySubject", block: { type: seg.subjectType, payload: seg.struct } });
    }
  }
  return out;
}

function normalizeQuestionTextForDisplay(text: string): string {
  return text
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function commandIdDisplayLabel(commandId: string): string {
  const id = commandId.trim();
  if (!id) return "";
  return id.startsWith("/") ? id : `/${id}`;
}

function skillIdDisplayLabel(skillId: string): string {
  const id = skillId.trim();
  if (!id) return "";
  return id.startsWith("/") ? id : `/${id}`;
}

/** 会话列表等 UI 展示：按片段顺序保留可见 chip/附件/正文 */
export function stripUserPromptMarkersForDisplay(input: string): string {
  if (shouldHideUserBubble(input)) return "";

  const segments = parseUserMessageSegments(input);
  if (!segments.length) return normalizeQuestionTextForDisplay(String(input ?? ""));

  const visibleParts: string[] = [];
  for (const seg of segments) {
    switch (seg.type) {
      case "text":
        if (seg.text.trim()) visibleParts.push(normalizeQuestionTextForDisplay(seg.text));
        break;
      case "primarySubject": {
        const label = seg.block.payload.text?.trim() || seg.block.payload.host;
        if (label) visibleParts.push(label);
        break;
      }
      case "attachedFiles":
        for (const f of seg.files) {
          if (f.name) visibleParts.push(f.name);
        }
        break;
      case "toolInput": {
        const label = toolInputDisplayLabel(seg.block);
        if (label) visibleParts.push(label);
        break;
      }
      case "command": {
        const label = commandIdDisplayLabel(seg.commandId);
        if (label) visibleParts.push(label);
        break;
      }
      case "skill": {
        const label = skillIdDisplayLabel(seg.skillId);
        if (label) visibleParts.push(label);
        break;
      }
      case "tab": {
        const label = seg.tab.title.trim() || seg.tab.url.trim();
        if (label) visibleParts.push(label);
        break;
      }
      case "quote": {
        visibleParts.push("引用");
        break;
      }
    }
  }
  return visibleParts.join(" · ");
}

/** @deprecated 使用 stripUserPromptMarkersForDisplay */
export const stripPageElementsMarkersForDisplay = stripUserPromptMarkersForDisplay;

/** 注入脚本在 copy 时根据选区 rect 平均中心计算，便于回 tab 滚动定位（不属于发给模型的 struct） */
export interface CopySelectionAnchor {
  centerViewportX: number;
  centerViewportY: number;
  centerDocumentX: number;
  centerDocumentY: number;
  scrollX: number;
  scrollY: number;
}

export function parseCopySelectionAnchor(raw: unknown): CopySelectionAnchor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const keys: (keyof CopySelectionAnchor)[] = [
    "centerViewportX",
    "centerViewportY",
    "centerDocumentX",
    "centerDocumentY",
    "scrollX",
    "scrollY",
  ];
  const out: Partial<CopySelectionAnchor> = {};
  for (const k of keys) {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    out[k] = v;
  }
  return out as CopySelectionAnchor;
}

export function parseSourceTabId(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n > 0 ? n : undefined;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10);
    return n > 0 ? n : undefined;
  }
  return undefined;
}

export function parseCopySelectionSelectors(raw: unknown): CopySelectionSelectorsPayload | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const rootSelector = typeof o.rootSelector === "string" ? o.rootSelector : "";
  const childSelectors: string[] = [];
  if (Array.isArray(o.childSelectors)) {
    for (const item of o.childSelectors) {
      if (typeof item === "string" && item.trim()) childSelectors.push(item.trim());
    }
  }
  if (!rootSelector.trim() && childSelectors.length === 0) return undefined;
  return { rootSelector: rootSelector.trim(), childSelectors };
}

/** 从 elements struct 得到注入脚本 `scrollToSelectionAnchor` 所需的 wire `selectors` */
export function selectorsWireFromStruct(struct: PageElementsPayload): CopySelectionSelectorsPayload {
  return {
    rootSelector: (struct.rootSelector || "").trim(),
    childSelectors: (struct.childSelectors ?? [])
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim()),
  };
}

/** 判断 struct 是否包含可用于定位的选择器 */
export function flattenElementsStruct(struct: PageElementsPayload | undefined): string[] {
  if (!struct) return [];
  return flattenCopySelectionSelectors(selectorsWireFromStruct(struct));
}

/** chip favicon：优先 imgList 首图，否则用页面 favicon */
export function resolveElementsChipFavicon(
  favicon?: string,
  imgList?: unknown,
): string | undefined {
  if (Array.isArray(imgList)) {
    for (const item of imgList) {
      if (typeof item !== "string") continue;
      const url = item.trim();
      if (!url) continue;
      try {
        const protocol = new URL(url).protocol;
        if (protocol === "http:" || protocol === "https:") return url;
      } catch {
        // skip invalid url
      }
    }
  }
  const fallback = favicon?.trim();
  return fallback || undefined;
}

/** 由 content / background 转发的 copy 消息字段组装 `CopySelectionElementsStruct` */
export function buildElementsStructFromCopyMessage(input: {
  host: string;
  text: string;
  favicon?: string;
  imgList?: unknown;
  tabId?: number;
  selectors?: CopySelectionSelectorsPayload;
}): CopySelectionElementsStruct {
  const root = (input.selectors?.rootSelector ?? "").trim();
  const children = (input.selectors?.childSelectors ?? [])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim());
  const favicon = resolveElementsChipFavicon(input.favicon, input.imgList);
  return {
    host: (input.host || "").trim(),
    tabId: input.tabId != null && input.tabId > 0 ? String(Math.floor(input.tabId)) : "",
    rootSelector: root,
    ...(children.length ? { childSelectors: children } : {}),
    ...(favicon ? { favicon } : {}),
    ...(input.text?.trim() ? { text: input.text.trim() } : {}),
  };
}

const ELEMENTS_CHIP_TEXT_PREVIEW_MAX = 5;
const ELEMENTS_CHIP_HOST_PREVIEW_MAX = 22;

function formatHostForElementsChip(host: string): string {
  const h = (host || "").trim();
  if (h.toLowerCase().startsWith("www.")) return h.slice(4);
  return h;
}

/** 输入框 / 气泡 chip 上展示的摘要文案，仅依赖 struct */
export function formatElementsChipLabel(struct: PageElementsPayload): string {
  const raw = (struct.text ?? "").replace(/\s+/g, " ").trim();
  const chars = [...raw];
  const snippet =
    chars.length > ELEMENTS_CHIP_TEXT_PREVIEW_MAX
      ? `${chars.slice(0, ELEMENTS_CHIP_TEXT_PREVIEW_MAX).join("")}...`
      : raw;
  const hostFull = formatHostForElementsChip(struct.host || "");
  const hostChars = [...hostFull];
  const hostDisplay =
    hostChars.length > ELEMENTS_CHIP_HOST_PREVIEW_MAX
      ? `${hostChars.slice(0, ELEMENTS_CHIP_HOST_PREVIEW_MAX).join("")}…`
      : hostFull;
  return `${hostDisplay} (${snippet})`;
}

/** `kind === "elements"` 时 chip 的 `struct` */
export type CopySelectionElementsStruct = PageElementsPayload;

/** elements 类 chip：业务数据在 `struct`；`selectionAnchor` 仅实时 copy 有，不在 struct 内 */
export interface CopySelectionElementsChipPayload {
  kind: CopySelectionChipKind;
  struct: CopySelectionElementsStruct;
  subjectType: PrimarySubjectType;
  selectionAnchor?: CopySelectionAnchor;
}

/** 页面选区 chip 载荷（按 kind 与不同 struct 绑定；当前仅 elements） */
export type CopySelectionChipPayload = CopySelectionElementsChipPayload;

export type CopySelectionChipItem = CopySelectionChipPayload & { id: string };

// ========== ChatMessage ==========

export interface ChatMessageToolCall{
  id: string;
  name: string;
  state: 'visible' | 'gone' | 'doing';
}

export interface ChatMessageToolBarItem{
  type: 'copy';
  msgIds: string[];
}

export type ActivityTraceStatus = 'running' | 'completed' | 'stopped' | 'error';
export type ActivityTracePhase = 'thinking' | 'searching' | 'browsing' | 'working';
export type ActivityTraceItemKind = 'reasoning' | 'search' | 'browse' | 'tool';

export interface ActivityTraceItem {
  id: string;
  kind: ActivityTraceItemKind;
  text: string;
  status: 'running' | 'completed' | 'error';
  toolCallId?: string;
  url?: string;
}

/**
 * 一次用户请求的可见活动轨迹。
 * reasoning 只记录供应商实际返回的推理字段；其余条目来自真实工具执行事件。
 */
export interface TurnActivityTrace {
  id: string;
  status: ActivityTraceStatus;
  phase: ActivityTracePhase;
  startedAt: number;
  finishedAt?: number;
  expanded: boolean;
  items: ActivityTraceItem[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  customUi?: CustomUI;
  /**
   * 记录本条消息关联的工具调用入参（用于生成技能 steps）
   */
  toolInput?: Record<string, unknown>;
  toolBarItems?: ChatMessageToolBarItem[];
  toolCalls: ChatMessageToolCall[];
  activityTrace?: TurnActivityTrace;
}

/**
 * 工具过程步骤元数据：放在 `toolInput` 内；与 IndexedDB 里顶层的 `isProcess` / `toolName` / `groupId`
 * 在 `loadConversation` / `persistMessageNow` 互转，避免 ChatMessage 与存储各维护一套同义字段。
 */
export const CHAT_MESSAGE_PROCESS_META_KEY = "__stayProcessMeta";

export interface ChatMessageProcessMeta {
  isProcess: true;
  toolName?: string;
  groupId: string;
}

export function readChatMessageProcessMeta(msg: Pick<ChatMessage, "toolInput">): ChatMessageProcessMeta | undefined {
  const raw = msg.toolInput?.[CHAT_MESSAGE_PROCESS_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (o.isProcess !== true || typeof o.groupId !== "string" || !String(o.groupId).trim()) return undefined;
  return {
    isProcess: true,
    toolName: typeof o.toolName === "string" ? o.toolName : undefined,
    groupId: o.groupId,
  };
}

// ========== DisplayItem（用于模板渲染） ==========

export type DisplayItem =
  | { type: 'message'; id: string; msg: ChatMessage }
  | {
      type: 'process-group';
      id: string;
      groupId: string;
      processes: ChatMessage[];
      isExecuting: boolean;
    };
