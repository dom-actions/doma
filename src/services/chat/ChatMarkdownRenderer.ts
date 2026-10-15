import { marked, Renderer } from "marked";
import DOMPurify from "dompurify";
import { sanitizeAssistantUserFacing } from "@/utils/sanitizeAssistantReply";
import {
  formatVideoSeekTime,
  parseDomaVideoSeekHref,
} from "@/utils/domaVideoSeek";
import { parseExtensionFencePayload } from "./extensionFence";

const DOMA_SCHEME_URL_RE = /doma:\/\/[^\s<>"')\]]+/gi;
/** 勿用 \S；勿含 *（避免吃掉 **加粗** 闭合符） */
const HTTP_URL_IN_TEXT_RE =
  /https?:\/\/(?:(?:[A-Za-z0-9\-._~:/?#@!$&'+,;=]|%[0-9A-Fa-f]{2})+)/gi;
const HTTP_URL_STANDALONE_RE = new RegExp(`^${HTTP_URL_IN_TEXT_RE.source}$`, "i");
const TRAILING_URL_PUNCT_RE =
  /[.,;:!?)\]}>'"\u3002\uFF09\uFF0C\uFF1B\uFF1A\uFF01\uFF1F]$/;

export const CHAT_LINK_COLOR = "rgb(54, 116, 239)";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trimTrailingUrlPunctuation(url: string): { href: string; trailing: string } {
  let href = url;
  let trailing = "";
  while (href.length > 0 && TRAILING_URL_PUNCT_RE.test(href)) {
    const ch = href.slice(-1);
    if (ch === ")") {
      const open = (href.match(/\(/g) || []).length;
      if (open === 0) {
        trailing = ch + trailing;
        href = href.slice(0, -1);
        continue;
      }
      const close = (href.match(/\)/g) || []).length;
      if (close > open) {
        trailing = ch + trailing;
        href = href.slice(0, -1);
        continue;
      }
      break;
    }
    trailing = ch + trailing;
    href = href.slice(0, -1);
  }
  return { href, trailing };
}

function renderVideoSeekButtonHtml(href: string, seconds: number, _label?: string): string {
  const safeHref = escapeHtml(href);
  const timeLabel = formatVideoSeekTime(seconds);
  const aria = escapeHtml(`跳转到 ${timeLabel}`);
  const inner = `<span class="chat-video-seek-icon" aria-hidden="true">▶</span>`;
  return `<button type="button" class="chat-video-seek-btn chat-doma-link" data-doma-href="${safeHref}" title="${aria}" aria-label="${aria}">${inner}</button>`;
}

function renderDomaSchemeLinkHtml(url: string, label?: string): string {
  const seek = parseDomaVideoSeekHref(url);
  if (seek) {
    return renderVideoSeekButtonHtml(url, seek.seconds, label);
  }
  const safe = escapeHtml(url);
  const text = escapeHtml(label ?? url);
  return `<a href="#" class="chat-bubble-link chat-doma-link" style="color:${CHAT_LINK_COLOR}" data-doma-href="${safe}">${text}</a>`;
}

function renderHttpLinkHtml(url: string, label?: string): string {
  const { href, trailing } = trimTrailingUrlPunctuation(url);
  const safeHref = escapeHtml(href);
  const safeText = escapeHtml(label ?? href);
  return `<a href="${safeHref}" class="chat-bubble-link" style="color:${CHAT_LINK_COLOR}" target="_blank" rel="noopener noreferrer">${safeText}</a>${escapeHtml(trailing)}`;
}

function shouldSkipHttpUrlAutolink(full: string, offset: number, rawLength: number): boolean {
  const before = full.slice(0, offset);
  const afterUrl = full.slice(offset + rawLength);
  if (isInsideInlineCode(full, offset)) return true;
  if (isUrlInMarkdownLinkDest(full, offset)) return true;
  if (isUrlInMarkdownLinkLabel(full, offset, rawLength)) return true;
  if (before.endsWith("[") && /^\]\s*\(/.test(afterUrl)) return true;
  if (/\*\*\s*$/.test(before) && /^\s*\*\*/.test(afterUrl)) return true;
  return false;
}

function shouldSkipDomaUrlAutolink(full: string, offset: number, rawLength: number): boolean {
  return shouldSkipHttpUrlAutolink(full, offset, rawLength);
}

function isUrlInMarkdownLinkDest(full: string, offset: number): boolean {
  let i = offset - 1;
  while (i >= 0 && /\s/.test(full[i]!)) i--;
  if (i < 0 || full[i] !== "(") return false;
  i--;
  while (i >= 0 && /\s/.test(full[i]!)) i--;
  return i >= 0 && full[i] === "]";
}

/** `[http://label](dest)` 中 label 内的 URL 不应再 autolink，否则会破坏 markdown 链接 */
function isUrlInMarkdownLinkLabel(full: string, offset: number, rawLength: number): boolean {
  const isEscapedBracket = (index: number) => {
    let slashes = 0;
    while (index > 0 && full[--index] === "\\") slashes++;
    return slashes % 2 === 1;
  };

  // Find an enclosing label, skipping complete bracket pairs from earlier links.
  let depth = 0;
  let i = offset - 1;
  while (i >= 0) {
    const char = full[i];
    if ((char === "[" || char === "]") && !isEscapedBracket(i)) {
      if (char === "]") depth++;
      else if (depth > 0) depth--;
      else break;
    }
    i--;
  }
  if (i < 0 || full[i] !== "[") return false;

  const urlEnd = offset + rawLength;
  let j = urlEnd;
  depth = 0;
  while (j < full.length) {
    const char = full[j];
    if ((char === "[" || char === "]") && !isEscapedBracket(j)) {
      if (char === "[") depth++;
      else if (depth > 0) depth--;
      else break;
    }
    j++;
  }
  if (j >= full.length || full[j] !== "]") return false;

  j++;
  while (j < full.length && /\s/.test(full[j]!)) j++;
  return full[j] === "(";
}

/** 行内 `code` 内的 URL 不应 autolink，否则会生成 `` `[url](url)` `` 导致 marked 无法解析 */
function isInsideInlineCode(full: string, offset: number): boolean {
  for (let start = 0; start < offset;) {
    // Outside code, an escape consumes exactly the next character.
    if (full[start] === "\\") { start += 2; continue; }
    if (full[start] !== "`") { start++; continue; }
    let contentStart = start + 1;
    while (full[contentStart] === "`") contentStart++;
    const delimiterLength = contentStart - start;

    let closing = -1;
    let next = full.indexOf("`", contentStart);
    while (next !== -1) {
      let end = next + 1;
      while (full[end] === "`") end++;
      if (end - next === delimiterLength) { closing = next; break; }
      next = full.indexOf("`", end);
    }
    // An unmatched run is literal text; a later, shorter run may still open code.
    if (closing === -1) { start = contentStart; continue; }
    if (offset >= contentStart && offset < closing) return true;
    start = closing + delimiterLength;
  }
  return false;
}

const IMAGE_URL_PATH_RE = /\.(?:svg|png|jpe?g|gif|webp|avif|ico)(?:[?#][^)\s]*)?$/i;
const MARKDOWN_LINK_TO_IMAGE_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function imageUrlMarkdownAlt(label: string, href: string): string {
  const trimmed = label.trim();
  if (trimmed && trimmed !== href) return trimmed;
  try {
    const name = decodeURIComponent(href.split("/").pop()?.split(/[?#]/)[0] ?? "");
    if (name) return name;
  } catch {
    /* ignore */
  }
  return "image";
}

/** `[https://.../x.svg](https://.../x.svg)` 是链接语法，用户期望看到内联图片 */
function preprocessImageUrlMarkdownLinks(input: string): string {
  if (!/\]\(https?:\/\//i.test(input)) return input;

  return input.replace(MARKDOWN_LINK_TO_IMAGE_RE, (full, label: string, dest: string, offset: number) => {
    const href = dest.trim();
    if (!/^https?:\/\//i.test(href) || !IMAGE_URL_PATH_RE.test(href)) return full;

    const before = input.slice(Math.max(0, offset - 1), offset);
    if (before === "!") return full;

    const alt = imageUrlMarkdownAlt(label, href);
    return `![${alt}](${href})`;
  });
}

function isMarkdownTableRowLine(line: string): boolean {
  const trimmed = line.trim();
  if (isMarkdownTableSeparatorLine(trimmed)) return false;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  if (pipeCount < 2) return false;
  // GFM 表格用 ` | ` 或行首/行尾 `|` 分隔单元格；勿把 JS 的 `||` 误判为表格
  if (/^\|/.test(trimmed) || /\|$/.test(trimmed)) return true;
  return /\s\|\s/.test(trimmed);
}

function isMarkdownTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
  const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.length >= 2 && cells.every((cell) => /^[\s\-:]+$/.test(cell));
}

function isTabTableRowLine(line: string): boolean {
  if (!line.includes("\t")) return false;
  return line.split("\t").filter((c) => c.trim()).length >= 2;
}

function pipeTableLine(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function pipeTableSeparator(colCount: number): string {
  return `| ${Array(colCount).fill("---").join(" | ")} |`;
}

function tabRowsToPipeMarkdown(rows: string[]): string[] {
  if (rows.length === 0) return [];
  const parsed = rows.map((r) => r.split("\t").map((c) => c.trim()));
  const colCount = Math.max(...parsed.map((r) => r.length));
  const norm = parsed.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });
  const [header, ...body] = norm;
  const lines = [pipeTableLine(header!), pipeTableSeparator(colCount)];
  for (const row of body) lines.push(pipeTableLine(row));
  return lines;
}

function pipeRowsToMarkdown(rows: string[]): string[] {
  if (rows.length === 0) return [];
  const parseCells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const header = parseCells(rows[0]!);
  const colCount = header.length;
  const lines = [pipeTableLine(header), pipeTableSeparator(colCount)];
  for (const row of rows.slice(1)) {
    const cells = parseCells(row);
    while (cells.length < colCount) cells.push("");
    lines.push(pipeTableLine(cells.slice(0, colCount)));
  }
  return lines;
}

function splitTableRowPrefix(line: string): { prefix: string; row: string } {
  const trimmed = line.trim();
  const pipeIdx = trimmed.indexOf("|");
  if (pipeIdx <= 0) return { prefix: "", row: trimmed };
  return { prefix: trimmed.slice(0, pipeIdx).trimEnd(), row: trimmed.slice(pipeIdx).trim() };
}

type MarkdownCodeFenceSegment =
  | { kind: "text"; text: string }
  | { kind: "fence"; lang: string; body: string };

/** 按 ``` 围栏切段：围栏内原样走代码渲染，围栏外才做 Markdown 预处理 */
function splitMarkdownByCodeFences(input: string): MarkdownCodeFenceSegment[] {
  if (!input.includes("```")) return [{ kind: "text", text: input }];
  const segments: MarkdownCodeFenceSegment[] = [];
  const re = /```([^\n`]*)(?:\r?\n)?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) segments.push({ kind: "text", text: input.slice(last, m.index) });
    segments.push({
      kind: "fence",
      lang: String(m[1] ?? "").trim(),
      body: m[2] ?? "",
    });
    last = m.index + m[0].length;
  }
  if (last < input.length) segments.push({ kind: "text", text: input.slice(last) });
  return segments.length ? segments : [{ kind: "text", text: input }];
}

/** 流式未闭合 ``` 时临时补闭合，让半截代码块也能按代码渲染 */
function closeUnclosedCodeFenceForStreaming(input: string): string {
  const ticks = input.match(/```/g);
  if (!ticks || ticks.length % 2 === 0) return input;
  return `${input}\n\`\`\``;
}

function isMarkdownHorizontalRuleLine(line: string): boolean {
  const t = line.trim();
  return /^(\*{3,}|-{3,}|_{3,})\s*$/.test(t);
}

/** 标题、表格、列表等块级行；普通叙述句不算 */
function isMarkdownBlockLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (isMarkdownHorizontalRuleLine(t)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (isMarkdownTableRowLine(t) || isMarkdownTableSeparatorLine(t)) return true;
  if (isTabTableRowLine(t)) return true;
  if (/^```/.test(t)) return true;
  if (/^>\s/.test(t)) return true;
  if (/^[-*+]\s+\S/.test(t)) return true;
  if (/^\d+\.\s+\S/.test(t)) return true;
  if (/^!\[[^\]]*\]\(doma-spec:/i.test(t)) return true;
  return false;
}

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  xml: "XML",
  json: "JSON",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  python: "Python",
  py: "Python",
  bash: "Shell",
  shell: "Shell",
  sh: "Shell",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  yaml: "YAML",
  yml: "YAML",
  markdown: "Markdown",
  md: "Markdown",
  text: "Text",
  plaintext: "Text",
  "cursor-prompt": "CURSOR PROMPT",
  skill: "SKILL",
  extension: "EXTENSION",
};

const CURSOR_PROMPT_FENCE_LANG = "cursor-prompt";
const CURSOR_PROMPT_DEFAULT_TITLE = "CURSOR PROMPT";
const SKILL_FENCE_LANG = "skill";
const SKILL_DEFAULT_TITLE = "SKILL";
const EXTENSION_FENCE_LANG = "extension";

type PanelFenceKind =
  | typeof CURSOR_PROMPT_FENCE_LANG
  | typeof SKILL_FENCE_LANG
  | typeof EXTENSION_FENCE_LANG;

function panelFenceOpenRe(): RegExp {
  return /```[ \t]*(cursor-prompt|skill|extension)\b[ \t]*(?:\r?\n|$)/gi;
}

function hasPanelFenceSyntax(text: string): boolean {
  return /```[ \t]*(cursor-prompt|skill|extension)\b/i.test(text);
}

/** 整段被 ```markdown 包裹时先展开，避免内层 ```skill 落进 code 块 */
function stripOuterMarkdownDocumentFence(input: string): string {
  const trimmed = input.trim();
  const m = /^```(?:markdown|md)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i.exec(trimmed);
  if (!m) return input;
  const inner = m[1]!.trim();
  if (!shouldUnwrapFenceAsMarkdown("markdown", inner)) return input;
  return inner;
}

/** markdown 段内若还有 panel 围栏，再切一次 */
function expandPanelFencesInMarkdownSegments(segments: MessageRenderSegment[]): MessageRenderSegment[] {
  const out: MessageRenderSegment[] = [];
  for (const seg of segments) {
    if (seg.kind !== "markdown") {
      out.push(seg);
      continue;
    }
    if (!hasPanelFenceSyntax(seg.text)) {
      out.push(seg);
      continue;
    }
    out.push(...splitMessageByPanelFences(seg.text));
  }
  return out;
}

function normalizeMarkedLang(lang: string | undefined): string {
  return String(lang ?? "")
    .trim()
    .toLowerCase()
    .replace(/^language-/, "");
}

/** 推断代码块语言（优先使用 fence 标注，否则按内容启发式识别） */
export function detectCodeLanguage(code: string, markedLang?: string): string {
  const hinted = normalizeMarkedLang(markedLang);
  if (hinted && hinted !== "text" && hinted !== "plaintext") return hinted;

  const t = code.trim();
  if (!t) return "text";

  if (
    /^<\?xml/i.test(t) ||
    /<interactionBlock[\s>]/i.test(t) ||
    /<primarySubject[\s>]/i.test(t) ||
    /<\/[A-Za-z][\w:-]*>/.test(t)
  ) {
    return "xml";
  }

  if (/^<!DOCTYPE html/i.test(t) || /<html[\s>]/i.test(t)) return "html";

  if (/^[\[{]/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* not json */
    }
  }

  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/im.test(t)) return "sql";
  if (/^(import|export|const|let|var|function|class|interface|type)\s/m.test(t)) {
    return /\b(interface|type|: string|: number)\b/.test(t) ? "typescript" : "javascript";
  }
  if (/^#!\/usr\/bin\//.test(t) || /^\s*(sudo\s+)?(cd|ls|grep|curl|npm|git)\s/m.test(t)) return "bash";
  if (/^(\s*[\w.-]+:\s*\n\s+[-\w])|^\s*---\s*$/m.test(t)) return "yaml";
  if (/^(\/\*|#|\/\/)/m.test(t) && /[{;}]/.test(t)) return "javascript";

  return hinted || "text";
}

export function formatCodeLanguageLabel(lang: string): string {
  const key = normalizeMarkedLang(lang) || "text";
  return CODE_LANGUAGE_LABELS[key] ?? key.toUpperCase();
}

function stripMarkdownCodeFenceFromBlock(code: string): string {
  let t = code.trim();
  if (/^```[\w-]*[\s\n]/.test(t)) {
    t = t.replace(/^```[\w-]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return t.trim();
}

function shouldUnwrapFenceAsMarkdown(lang: string, body: string): boolean {
  const l = normalizeMarkedLang(lang);
  const b = body.trim();
  if (!b) return false;

  if (l === "markdown" || l === "md") return true;

  const codeLangs = new Set([
    "xml",
    "json",
    "javascript",
    "js",
    "typescript",
    "ts",
    "python",
    "py",
    "bash",
    "shell",
    "sh",
    "sql",
    "html",
    "css",
    "yaml",
    "yml",
    CURSOR_PROMPT_FENCE_LANG,
    SKILL_FENCE_LANG,
  ]);
  if (l && codeLangs.has(l)) return false;

  if (/^<\?xml/i.test(b) || /<interactionBlock[\s>]/i.test(b) || /<primarySubject[\s>]/i.test(b)) {
    return false;
  }
  if (/^(import|export|const|let|var|function|class|interface|SELECT|INSERT|#!\/)/im.test(b)) {
    return false;
  }

  const hasHeading = /^#{1,6}\s/m.test(b);
  const hasPipeTable = /^(\|[^\n]+\|)\s*\n(\|[\s\-:|]+\|)/m.test(b);
  const hasList = /^[-*+]\s+\S/m.test(b);
  const hasMarkdownLink = hasMarkdownLinkSyntax(b);

  if (l === "" || l === "text" || l === "plaintext") {
    return hasHeading || hasPipeTable || (hasList && /\*\*[^*]+\*\*/.test(b)) || hasMarkdownLink;
  }
  return false;
}

function renderCodeBlockHtml(code: string, markedLang?: string): string {
  const cleaned = stripMarkdownCodeFenceFromBlock(code);
  const language = detectCodeLanguage(cleaned, markedLang);
  const label = formatCodeLanguageLabel(language);
  return `<div class="chat-code-block" data-code-lang="${escapeHtml(language)}"><div class="chat-code-toolbar"><span class="chat-code-lang">${escapeHtml(label)}</span><button type="button" class="chat-code-copy-btn" data-code-copy-btn="1">Copy</button></div><pre><code class="language-${escapeHtml(language)}">${escapeHtml(cleaned)}</code></pre></div>`;
}

/** ```cursor-prompt / ```skill 围栏：仅认 title: 自定义标题，否则用默认标题 */
function parsePanelFenceBody(
  cleaned: string,
  defaultTitle: string,
): { title: string; body: string } {
  const raw = cleaned.trim();
  if (!raw) return { title: defaultTitle, body: "" };

  const lines = raw.split("\n");
  const first = lines[0]?.trim() ?? "";
  const titleMatch = /^title:\s*(.+)$/i.exec(first);
  if (titleMatch) {
    let bodyStart = 1;
    if (lines[1]?.trim() === "---") bodyStart = 2;
    const title = titleMatch[1]!.trim() || defaultTitle;
    return { title, body: lines.slice(bodyStart).join("\n").trim() };
  }

  return { title: defaultTitle, body: raw };
}

/** 从 contentStart 起扫描，支持围栏内嵌套 ```xml 等子围栏 */
function findPanelFenceClose(text: string, contentStart: number): number {
  let depth = 1;
  let pos = contentStart;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(pos, lineEnd);
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      const m = /^(`{3,})\s*(\S+)?\s*$/.exec(trimmed);
      if (m) {
        if (!m[2]) {
          depth -= 1;
          if (depth === 0) return pos;
        } else {
          depth += 1;
        }
      }
    }
    pos = nl === -1 ? text.length : nl + 1;
  }
  return text.length;
}

type MessageRenderSegment =
  | { kind: "markdown"; text: string }
  | { kind: PanelFenceKind; body: string };

/** 按 cursor-prompt / skill 围栏切段（支持内层嵌套 ```），无围栏时返回整段 markdown */
function splitMessageByPanelFences(input: string): MessageRenderSegment[] {
  if (!hasPanelFenceSyntax(input)) {
    return [{ kind: "markdown", text: input }];
  }

  const segments: MessageRenderSegment[] = [];
  let cursor = 0;
  const openRe = panelFenceOpenRe();
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(input)) !== null) {
    const fenceKind = m[1]!.toLowerCase() as PanelFenceKind;
    const blockStart = m.index;
    const contentStart = m.index + m[0].length;
    const closePos = findPanelFenceClose(input, contentStart);
    const closeLineEnd = input.indexOf("\n", closePos);
    const blockEnd = closeLineEnd === -1 ? input.length : closeLineEnd + 1;

    if (blockStart > cursor) {
      segments.push({ kind: "markdown", text: input.slice(cursor, blockStart) });
    }
    segments.push({ kind: fenceKind, body: input.slice(contentStart, closePos).trimEnd() });
    cursor = blockEnd;
    openRe.lastIndex = blockEnd;
  }

  if (cursor < input.length) {
    segments.push({ kind: "markdown", text: input.slice(cursor) });
  }

  return segments.length ? segments : [{ kind: "markdown", text: input }];
}

/** 模型常误在 ```xml 等子围栏前关闭 cursor-prompt，导致后续块落到面板外 */
function containsOnlyFencedCodeBlocks(text: string): boolean {
  let rest = text.trim();
  while (rest) {
    if (!rest.startsWith("```")) return false;
    const openEnd = rest.indexOf("\n");
    if (openEnd === -1) return false;
    const contentStart = openEnd + 1;
    const closePos = findPanelFenceClose(rest, contentStart);
    const closeLineEnd = rest.indexOf("\n", closePos);
    const blockEnd = closeLineEnd === -1 ? rest.length : closeLineEnd + 1;
    rest = rest.slice(blockEnd).trim();
  }
  return true;
}

function isBareXmlOrHtmlFragment(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("<")) return false;
  return /<\/[A-Za-z][\w:-]*\s*>/.test(t) || /\/>/.test(t);
}

function isOrphanedCursorPromptTail(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (containsOnlyFencedCodeBlocks(t)) return true;
  if (isBareXmlOrHtmlFragment(t)) return true;
  return false;
}

function mergeOrphanedFenceSegmentsIntoPanels(segments: MessageRenderSegment[]): MessageRenderSegment[] {
  if (segments.length <= 1) return segments;

  const out: MessageRenderSegment[] = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i]!;
    if (seg.kind !== "cursor-prompt" && seg.kind !== "skill") {
      out.push(seg);
      i += 1;
      continue;
    }

    let body = seg.body;
    i += 1;
    while (i < segments.length) {
      const next = segments[i]!;
      if (next.kind !== "markdown") break;
      const tail = next.text.trim();
      if (!isOrphanedCursorPromptTail(tail)) break;
      body = `${body}\n\n${tail}`;
      i += 1;
    }
    out.push({ kind: seg.kind, body });
  }
  return out;
}

function renderMarkdownPanelShell(
  panelKind: PanelFenceKind,
  title: string,
  innerHtml: string,
  rawMarkdown: string,
): string {
  const defaultTitle =
    panelKind === SKILL_FENCE_LANG ? SKILL_DEFAULT_TITLE : CURSOR_PROMPT_DEFAULT_TITLE;
  const safeTitle = escapeHtml(title.trim() || defaultTitle);
  const source = escapeHtml(encodeURIComponent(rawMarkdown));
  const showCreateBtn = panelKind === SKILL_FENCE_LANG;
  const showBackTopBtn = panelKind === SKILL_FENCE_LANG;

  if (typeof DOMParser === "undefined") {
    const createBtn = showCreateBtn
      ? `<button type="button" class="chat-markdown-panel-create-btn" data-markdown-panel-create-btn="1">Create</button>`
      : "";
    const backTopBtn = showBackTopBtn
      ? `<div class="chat-markdown-panel-footer"><button type="button" class="chat-markdown-panel-back-top-btn" data-markdown-panel-back-top-btn="1"></button></div>`
      : "";
    return `<div class="chat-markdown-panel" data-markdown-panel-kind="${escapeHtml(panelKind)}" data-markdown-source="${source}"><div class="chat-markdown-panel-toolbar"><span class="chat-markdown-panel-title">${safeTitle}</span><div class="chat-markdown-panel-actions"><button type="button" class="chat-markdown-panel-copy-btn" data-markdown-panel-copy-btn="1">Copy</button>${createBtn}</div></div><div class="chat-markdown-panel-body">${innerHtml}</div>${backTopBtn}</div>`;
  }

  const doc = new DOMParser().parseFromString("<div></div>", "text/html");
  const panel = doc.createElement("div");
  panel.className = "chat-markdown-panel";
  panel.setAttribute("data-markdown-panel-kind", panelKind);
  panel.setAttribute("data-markdown-source", encodeURIComponent(rawMarkdown));

  const toolbar = doc.createElement("div");
  toolbar.className = "chat-markdown-panel-toolbar";

  const titleEl = doc.createElement("span");
  titleEl.className = "chat-markdown-panel-title";
  titleEl.textContent = title.trim() || defaultTitle;

  const actions = doc.createElement("div");
  actions.className = "chat-markdown-panel-actions";

  const copyBtn = doc.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "chat-markdown-panel-copy-btn";
  copyBtn.setAttribute("data-markdown-panel-copy-btn", "1");
  copyBtn.textContent = "Copy";
  actions.appendChild(copyBtn);

  if (showCreateBtn) {
    const createBtn = doc.createElement("button");
    createBtn.type = "button";
    createBtn.className = "chat-markdown-panel-create-btn";
    createBtn.setAttribute("data-markdown-panel-create-btn", "1");
    createBtn.textContent = "Create";
    actions.appendChild(createBtn);
  }

  toolbar.appendChild(titleEl);
  toolbar.appendChild(actions);

  const body = doc.createElement("div");
  body.className = "chat-markdown-panel-body";
  body.innerHTML = innerHtml;

  panel.appendChild(toolbar);
  panel.appendChild(body);

  if (showBackTopBtn) {
    const footer = doc.createElement("div");
    footer.className = "chat-markdown-panel-footer";

    const backTopBtn = doc.createElement("button");
    backTopBtn.type = "button";
    backTopBtn.className = "chat-markdown-panel-back-top-btn";
    backTopBtn.setAttribute("data-markdown-panel-back-top-btn", "1");

    footer.appendChild(backTopBtn);
    panel.appendChild(footer);
  }

  return panel.outerHTML;
}

const CHAT_MARKDOWN_SANITIZE_OPTS = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ["table", "thead", "tbody", "tfoot", "tr", "th", "td", "button", "hr"],
  ADD_ATTR: [
    "target",
    "rel",
    "data-doma-href",
    "class",
    "style",
    "type",
    "data-table-export-btn",
    "data-table-copy-btn",
    "data-code-copy-btn",
    "data-code-lang",
    "data-markdown-panel-copy-btn",
    "data-markdown-panel-create-btn",
    "data-markdown-panel-back-top-btn",
    "data-markdown-panel-kind",
    "data-markdown-source",
    "data-extension-download-btn",
    "data-extension-payload",
    "data-doma-spec",
    "alt",
    "src",
    "loading",
    "aria-label",
    "title",
  ],
} as const;

function sanitizeChatMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ...CHAT_MARKDOWN_SANITIZE_OPTS,
    ADD_ATTR: [...CHAT_MARKDOWN_SANITIZE_OPTS.ADD_ATTR],
    ADD_TAGS: [...CHAT_MARKDOWN_SANITIZE_OPTS.ADD_TAGS],
  });
}

const SPEC_ASSET_PLACEHOLDER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const DOMA_SPEC_IMAGE_MARKDOWN_RE = /^!\[([^\]]*)\]\(doma-spec:([a-zA-Z0-9_-]+)\)$/i;
const DOMA_SPEC_IMAGE_IN_BACKTICKS_RE = /`(!\[[^\]]*\]\(doma-spec:[a-zA-Z0-9_-]+\))`/gi;

function renderSpecAssetImageHtml(assetId: string, alt?: string): string {
  return `<img class="chat-spec-asset" data-doma-spec="${escapeHtml(assetId)}" alt="${escapeHtml(alt ?? "")}" src="${SPEC_ASSET_PLACEHOLDER_SRC}" />`;
}

/** 模型常把 doma-spec 配图包在 ` 或 ``` 里，marked 无法当图片解析，先还原为普通 image 语法 */
function unwrapDomSpecImageMarkdown(input: string): string {
  if (!/doma-spec:/i.test(input)) return input;

  let s = input.replace(DOMA_SPEC_IMAGE_IN_BACKTICKS_RE, "$1");

  s = s.replace(/```[^\n`]*\n([\s\S]*?)```/g, (full, body: string) => {
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return full;
    if (!lines.every((l) => DOMA_SPEC_IMAGE_MARKDOWN_RE.test(l))) return full;
    return `\n\n${lines.join("\n\n")}\n\n`;
  });

  return s;
}

/** 助手回复 Markdown 渲染：预处理 + marked + DOMPurify */
export class ChatMarkdownRenderer {
  private readonly renderer: Renderer;

  constructor() {
    this.renderer = new Renderer();
    this.renderer.link = function ({ href, title, tokens }) {
      const safeHref = href ?? "";
      const linkText = this.parser.parseInline(tokens);
      if (/^doma:\/\//i.test(safeHref)) {
        const plain = linkText.replace(/<[^>]*>/g, "").trim() || safeHref;
        return renderDomaSchemeLinkHtml(safeHref, plain);
      }
      const safeTitle = title ? escapeHtml(title) : "";
      const titleAttr = safeTitle ? ` title="${safeTitle}"` : "";
      return `<a href="${escapeHtml(safeHref)}" class="chat-bubble-link" style="color:${CHAT_LINK_COLOR}"${titleAttr} target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    };
    this.renderer.codespan = ({ text }) => {
      const raw = (text ?? "").trim();
      if (/^doma:\/\/\S+$/i.test(raw)) return renderDomaSchemeLinkHtml(raw);
      if (HTTP_URL_STANDALONE_RE.test(raw)) return renderHttpLinkHtml(raw);
      const mdLink = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(raw);
      if (mdLink && /^https?:\/\//i.test(mdLink[2]!)) {
        return renderHttpLinkHtml(mdLink[2]!, mdLink[1]);
      }
      const mdImg = /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/.exec(raw);
      if (mdImg && /^https?:\/\//i.test(mdImg[2]!)) {
        const href = mdImg[2]!;
        return `<img class="chat-markdown-img" src="${escapeHtml(href)}" alt="${escapeHtml(mdImg[1] ?? "")}" loading="lazy" />`;
      }
      const specImg = DOMA_SPEC_IMAGE_MARKDOWN_RE.exec(raw);
      if (specImg) return renderSpecAssetImageHtml(specImg[2]!, specImg[1]);
      return `<code>${escapeHtml(text ?? "")}</code>`;
    };
    this.renderer.image = ({ href, title, text }) => {
      const rawHref = href ?? "";
      if (/^doma-spec:/i.test(rawHref)) {
        const assetId = rawHref.replace(/^doma-spec:/i, "");
        return renderSpecAssetImageHtml(assetId, text ?? title ?? "");
      }
      const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img class="chat-markdown-img" src="${escapeHtml(rawHref)}" alt="${escapeHtml(text ?? "")}"${safeTitle} loading="lazy" />`;
    };
    this.renderer.code = ({ text, lang }) => {
      const raw = String(text ?? "");
      const cleaned = stripMarkdownCodeFenceFromBlock(raw);
      const l = normalizeMarkedLang(lang);
      if (l === SKILL_FENCE_LANG) {
        return this.buildSkillPanelHtml(cleaned);
      }
      if (l === CURSOR_PROMPT_FENCE_LANG) {
        return this.buildCursorPromptPanelHtml(cleaned);
      }
      if (l === EXTENSION_FENCE_LANG) {
        return this.buildExtensionCardHtml(cleaned);
      }
      if (shouldUnwrapFenceAsMarkdown(l, cleaned)) {
        const parsed = marked.parse(cleaned) as string;
        return `<div class="chat-markdown-embed">${parsed}</div>`;
      }
      return renderCodeBlockHtml(raw, lang);
    };

    marked.setOptions({
      gfm: true,
      breaks: false,
      renderer: this.renderer,
    });
  }

  /** 渲染助手消息正文为安全 HTML */
  render(raw: string): string {
    try {
      const input = stripOuterMarkdownDocumentFence(String(raw ?? ""));
      const segments = mergeOrphanedFenceSegmentsIntoPanels(
        expandPanelFencesInMarkdownSegments(splitMessageByPanelFences(input)),
      );
      if (segments.length === 1 && segments[0]!.kind === "markdown") {
        return this.renderMarkdownBlock(segments[0]!.text);
      }
      const html = segments
        .map((seg) => {
          if (seg.kind === "markdown") return this.renderMarkdownBlock(seg.text);
          if (seg.kind === SKILL_FENCE_LANG) return this.renderSkillPanel(seg.body);
          if (seg.kind === EXTENSION_FENCE_LANG) return this.buildExtensionCardHtml(seg.body);
          return this.renderCursorPromptPanel(seg.body);
        })
        .join("");
      return sanitizeChatMarkdownHtml(html);
    } catch (e) {
      console.error("[ChatMarkdownRenderer] render failed:", e);
      return `<p>${escapeHtml(String(raw ?? ""))}</p>`;
    }
  }

  /**
   * 流式阶段轻量 Markdown：跑与终稿相同的 marked 管线，但跳过表格/代码工具栏包装，减少抖动。
   * 未闭合的 ``` 会临时补闭合，避免半截围栏整段当纯文本。
   * 出现 ```skill / ```cursor-prompt 后走完整 render。
   */
  renderStreaming(raw: string): string {
    const input = stripOuterMarkdownDocumentFence(String(raw ?? ""));
    if (!input) return "";
    try {
      const stabilized = closeUnclosedCodeFenceForStreaming(input);
      if (hasPanelFenceSyntax(stabilized)) {
        return this.render(stabilized);
      }
      const html = this.renderMarkdownBlockHtml(stabilized);
      return sanitizeChatMarkdownHtml(html);
    } catch (e) {
      console.error("[ChatMarkdownRenderer] renderStreaming failed:", e);
      const escaped = escapeHtml(input);
      const withBreaks = escaped.replace(/\n/g, "<br>");
      return `<p class="chat-streaming-text">${withBreaks}</p>`;
    }
  }

  /** 普通 Markdown 块：围栏内直接渲染代码，围栏外才 prepare + marked */
  private renderMarkdownBlock(raw: string): string {
    return this.finalizeMarkdownHtml(this.renderMarkdownBlockHtml(String(raw ?? "")));
  }

  private renderMarkdownBlockHtml(raw: string): string {
    const segments = splitMarkdownByCodeFences(raw);
    return segments
      .map((seg) => {
        if (seg.kind === "fence") return this.renderFencedCodeBlock(seg.lang, seg.body);
        if (!seg.text.trim()) return "";
        const prepared = this.prepare(seg.text);
        return this.compactParagraphHtml(marked.parse(prepared) as string);
      })
      .join("");
  }

  /** 围栏正文：不走 prepare / 表格合并等 Markdown 预处理 */
  private renderFencedCodeBlock(lang: string, body: string): string {
    const cleaned = stripMarkdownCodeFenceFromBlock(body);
    const l = normalizeMarkedLang(lang);
    if (l === SKILL_FENCE_LANG) {
      return this.buildSkillPanelHtml(cleaned);
    }
    if (l === CURSOR_PROMPT_FENCE_LANG) {
      return this.buildCursorPromptPanelHtml(cleaned);
    }
    if (l === EXTENSION_FENCE_LANG) {
      return this.buildExtensionCardHtml(cleaned);
    }
    if (shouldUnwrapFenceAsMarkdown(l, cleaned)) {
      return `<div class="chat-markdown-embed">${this.renderMarkdownBlockHtml(cleaned)}</div>`;
    }
    return renderCodeBlockHtml(cleaned, lang);
  }

  private buildCursorPromptPanelHtml(rawBody: string): string {
    const cleaned = stripMarkdownCodeFenceFromBlock(rawBody).trim();
    const { title, body } = parsePanelFenceBody(cleaned, CURSOR_PROMPT_DEFAULT_TITLE);
    const innerHtml = this.renderFenceMarkdownBody(body);
    return renderMarkdownPanelShell(CURSOR_PROMPT_FENCE_LANG, title, innerHtml, cleaned);
  }

  private buildSkillPanelHtml(rawBody: string): string {
    const cleaned = stripMarkdownCodeFenceFromBlock(rawBody).trim();
    const { title, body } = parsePanelFenceBody(cleaned, SKILL_DEFAULT_TITLE);
    const innerHtml = this.renderFenceMarkdownBody(body);
    return renderMarkdownPanelShell(SKILL_FENCE_LANG, title, innerHtml, cleaned);
  }

  private buildExtensionCardHtml(rawBody: string): string {
    const cleaned = stripMarkdownCodeFenceFromBlock(rawBody).trim();
    const payload = parseExtensionFencePayload(cleaned);
    if (!payload) {
      return renderCodeBlockHtml(cleaned, EXTENSION_FENCE_LANG);
    }
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const name = escapeHtml(payload.name);
    const desc = escapeHtml(payload.description || "");
    const idLine = payload.extensionId
      ? `<div class="chat-extension-card-id">ID: ${escapeHtml(payload.extensionId)}</div>`
      : "";
    return `<div class="chat-extension-card" data-extension-payload="${escapeHtml(encoded)}"><div class="chat-extension-card-name">${name}</div><div class="chat-extension-card-desc">${desc}</div>${idLine}<p class="chat-extension-card-hint" data-extension-download-hint="1"></p><button type="button" class="chat-extension-card-download" data-extension-download-btn="1"></button></div>`;
  }

  private renderCursorPromptPanel(rawBody: string): string {
    return this.buildCursorPromptPanelHtml(rawBody);
  }

  private renderSkillPanel(rawBody: string): string {
    return this.buildSkillPanelHtml(rawBody);
  }

  /** ```cursor-prompt / ```skill 围栏内正文：保留换行，不走 mergeSoftParagraphBreaks */
  private renderFenceMarkdownBody(markdown: string): string {
    return this.finalizeMarkdownHtml(this.renderFenceMarkdownBodyHtml(String(markdown ?? "")));
  }

  private renderFenceMarkdownBodyHtml(raw: string): string {
    const segments = splitMarkdownByCodeFences(raw);
    return segments
      .map((seg) => {
        if (seg.kind === "fence") return this.renderFencedCodeBlock(seg.lang, seg.body);
        if (!seg.text.trim()) return "";
        const prepared = this.prepareFenceBody(seg.text);
        return this.compactParagraphHtml(marked.parse(prepared) as string);
      })
      .join("");
  }

  /** 围栏正文预处理：保留单换行（转 Markdown hard break），避免公式/步骤被拼成一行 */
  private prepareFenceBody(input: string): string {
    let s = sanitizeAssistantUserFacing(input);
    s = s.replace(/[ \t]+$/gm, "").replace(/^[ \t]+$/gm, "");
    s = s.replace(/\n{3,}/g, "\n\n");
    s = this.preprocessBlockBreaks(s);
    s = preprocessMarkdownLinkSpacing(s);
    s = preprocessImageUrlMarkdownLinks(s);
    // 单换行 → hard break，marked(breaks:false) 下也能在面板内断行
    s = s.replace(/(?<!\n)\n(?!\n)/g, "  \n");
    return s;
  }

  private finalizeMarkdownHtml(html: string): string {
    const sanitized = sanitizeChatMarkdownHtml(html);
    const patched = this.patchSanitizedDomaLinks(sanitized);
    return this.wrapExportableTables(this.wrapLegacyCodeBlocks(patched));
  }

  /** DOMPurify 后兜底：裸 doma:// 锚点改为可点击按钮/安全链接，避免浏览器导航 */
  private patchSanitizedDomaLinks(html: string): string {
    if (!html.includes("doma://") || typeof DOMParser === "undefined") return html;

    const doc = new DOMParser().parseFromString(`<div id="chat-md-root">${html}</div>`, "text/html");
    const root = doc.getElementById("chat-md-root");
    if (!root) return html;

    root.querySelectorAll("a[href^='doma://'], a[href^='DOMA://']").forEach((el) => {
      const href = el.getAttribute("href")?.trim() ?? "";
      if (!href) return;
      const label = el.textContent?.trim() || href;
      const replacementHtml = renderDomaSchemeLinkHtml(href, label);
      const frag = doc.createElement("div");
      frag.innerHTML = replacementHtml;
      const replacement = frag.firstElementChild;
      if (replacement) el.replaceWith(replacement);
    });

    return root.innerHTML;
  }

  /** 兜底：未走自定义 renderer 的 pre 块也补上语言标签与复制按钮 */
  private wrapLegacyCodeBlocks(html: string): string {
    if (!html.includes("<pre") || typeof DOMParser === "undefined") return html;

    const doc = new DOMParser().parseFromString(`<div id="chat-md-root">${html}</div>`, "text/html");
    const root = doc.getElementById("chat-md-root");
    if (!root) return html;

    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.closest(".chat-code-block")) return;
      const codeEl = pre.querySelector("code");
      const text = codeEl?.textContent ?? pre.textContent ?? "";
      const markedLang = codeEl?.className.match(/language-([\w-]+)/)?.[1];
      const blockHtml = renderCodeBlockHtml(text, markedLang);
      const frag = doc.createElement("div");
      frag.innerHTML = blockHtml;
      const block = frag.firstElementChild;
      if (!block) return;
      pre.parentNode?.replaceChild(block, pre);
    });

    return root.innerHTML;
  }

  /** 为每个表格包裹工具栏（导出 Excel 按钮） */
  private wrapExportableTables(html: string): string {
    if (!html.includes("<table") || typeof DOMParser === "undefined") return html;

    const doc = new DOMParser().parseFromString(`<div id="chat-md-root">${html}</div>`, "text/html");
    const root = doc.getElementById("chat-md-root");
    if (!root) return html;

    root.querySelectorAll("table").forEach((table) => {
      if (table.closest(".chat-table-block")) return;

      const block = doc.createElement("div");
      block.className = "chat-table-block";

      const toolbar = doc.createElement("div");
      toolbar.className = "chat-table-toolbar";

      const lang = doc.createElement("span");
      lang.className = "chat-table-lang";
      lang.textContent = "TABLE";

      const actions = doc.createElement("div");
      actions.className = "chat-table-actions";

      const exportBtn = doc.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "chat-table-export-btn";
      exportBtn.setAttribute("data-table-export-btn", "true");

      const copyBtn = doc.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "chat-table-copy-btn";
      copyBtn.setAttribute("data-table-copy-btn", "1");
      copyBtn.textContent = "Copy";

      actions.appendChild(exportBtn);
      actions.appendChild(copyBtn);
      toolbar.appendChild(lang);
      toolbar.appendChild(actions);

      const body = doc.createElement("div");
      body.className = "chat-table-body";

      block.appendChild(toolbar);
      block.appendChild(body);
      table.parentNode?.insertBefore(block, table);
      body.appendChild(table);
    });

    return root.innerHTML;
  }

  private prepare(input: string): string {
    let s = sanitizeAssistantUserFacing(input);
    s = unwrapDomSpecImageMarkdown(s);
    s = this.normalizeWhitespace(s);
    s = this.unwrapMarkdownDocumentFences(s);
    s = this.preprocessUnfencedCodeBlocks(s);
    s = this.preprocessBlockBreaks(s);
    s = this.preprocessTables(s);
    s = this.mergeSoftParagraphBreaks(s);
    s = preprocessMarkdownLinkSpacing(s);
    s = preprocessImageUrlMarkdownLinks(s);
    s = this.preprocessPlainLinks(s);
    return s;
  }

  /** 模型用 ```markdown 包裹正文时，展开为普通 Markdown 以正确渲染表格/标题等 */
  private unwrapMarkdownDocumentFences(input: string): string {
    if (!input.includes("```")) return input;

    return input.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (full, langRaw, body) => {
      const lang = String(langRaw ?? "").trim();
      const content = String(body ?? "").trim();
      if (!shouldUnwrapFenceAsMarkdown(lang, content)) return full;
      return `\n\n${content}\n\n`;
    });
  }

  /** 模型直接输出的 XML/JSON 片段（无 ``` 围栏）自动包成代码块 */
  private preprocessUnfencedCodeBlocks(input: string): string {
    if (!input.includes("<") && !input.includes("{")) return input;

    const fenceRe = /```[\s\S]*?```/g;
    const segments: Array<{ text: string; fenced: boolean }> = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = fenceRe.exec(input)) !== null) {
      if (m.index > last) {
        segments.push({ text: input.slice(last, m.index), fenced: false });
      }
      segments.push({ text: m[0], fenced: true });
      last = m.index + m[0].length;
    }
    if (last < input.length) {
      segments.push({ text: input.slice(last), fenced: false });
    }
    if (segments.length === 0) {
      segments.push({ text: input, fenced: false });
    }

    return segments
      .map((seg) => (seg.fenced ? seg.text : this.wrapUnfencedXmlInSegment(seg.text)))
      .join("");
  }

  private stripMarkdownCodeFence(content: string): string {
    return content
      .trim()
      .replace(/^```[\w-]*\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }

  private wrapUnfencedXmlInSegment(segment: string): string {
    const trimmed = segment.trim();
    if (!trimmed || trimmed.startsWith("```")) return segment;

    const wrapXml = (raw: string) => {
      const body = this.stripMarkdownCodeFence(raw);
      if (!body) return raw;
      return `\`\`\`xml\n${body}\n\`\`\``;
    };

    let s = segment.replace(
      /(^|\n)(<interactionBlock>[\s\S]*?<\/interactionBlock>)(?=\n|$)/gi,
      (_, lead: string, xml: string) => `${lead}${wrapXml(xml)}`,
    );

    s = s.replace(
      /(^|\n)(<primarySubject[\s\S]*?<\/primarySubject>)(?=\n|$)/gi,
      (_, lead: string, xml: string) => `${lead}${wrapXml(xml)}`,
    );

    s = s.replace(
      /(^|\n)(<[A-Za-z][\w:-]*(?:\s[^>]*)?>[\s\S]*?<\/[A-Za-z][\w:-]*>)(?=\n|$)/g,
      (full, lead: string, xml: string) => {
        if (/<interactionBlock|<primarySubject|chat-markdown-panel/i.test(xml)) return full;
        if (!/<\/[A-Za-z]/.test(xml)) return full;
        return `${lead}${wrapXml(xml)}`;
      },
    );

    return s;
  }

  /** 压缩多余空行、去掉仅含空格的空行（先压成单换行，块级空行由 mergeSoftParagraphBreaks 再插入） */
  private normalizeWhitespace(input: string): string {
    return input
      .replace(/[ \t]+$/gm, "")
      .replace(/^[ \t]+$/gm, "")
      .replace(/\n{2,}/g, "\n");
  }

  /** 模型常把 ## 标题接在正文同一行，拆成独立块 */
  private preprocessBlockBreaks(input: string): string {
    return input.replace(/([^\n#])([ \t]+)(#{1,6}[ \t]+[^\n]+)/g, "$1\n\n$3");
  }

  /**
   * 去掉模型在叙述句之间的空行（marked 会变成多个 <p>）。
   * 仅在标题/表格/列表等块级内容前保留一个空行。
   */
  private mergeSoftParagraphBreaks(input: string): string {
    const lines = input.split("\n");
    const out: string[] = [];
    let previousSourceLine = "";
    let previousSourceOffset = 0;
    let sourceOffset = 0;

    const pushBlankLine = () => {
      if (out.length === 0) return;
      if (out[out.length - 1] === "") return;
      out.push("");
    };

    const endsWithBareHttpUrl = (line: string, lineOffset: number) => {
      const match = Array.from(line.matchAll(HTTP_URL_IN_TEXT_RE)).at(-1);
      if (!match || !line.endsWith(match[0])) return false;
      // Reuse autolinking exclusions with original offsets, including multiline wrappers.
      return !shouldSkipHttpUrlAutolink(input, lineOffset + match.index!, match[0].length);
    };

    const isTableLine = (t: string) =>
      isMarkdownTableRowLine(t) ||
      isMarkdownTableSeparatorLine(t) ||
      isTabTableRowLine(t);

    for (const raw of lines) {
      const trimmed = raw.trim();
      const lineOffset = sourceOffset + raw.length - raw.trimStart().length;
      sourceOffset += raw.length + 1;
      if (!trimmed) continue;

      // Inspect original lines rather than repeatedly scanning an accumulating paragraph.
      const prev = previousSourceLine;
      const prevOffset = previousSourceOffset;
      previousSourceLine = trimmed;
      previousSourceOffset = lineOffset;
      const prevIsTable = prev ? isTableLine(prev) : false;
      const curIsTable = isTableLine(trimmed);
      const curIsBlock = isMarkdownBlockLine(trimmed);

      if (curIsBlock) {
        if (!(prevIsTable && curIsTable)) pushBlankLine();
        out.push(trimmed);
        continue;
      }

      if (prev && !isMarkdownBlockLine(prev)) {
        if (endsWithBareHttpUrl(prev, prevOffset) || endsWithBareHttpUrl(trimmed, lineOffset)) {
          // A newline must terminate a bare URL before autolinking runs.
          pushBlankLine();
          out.push(trimmed);
        } else {
          const separator = /[A-Za-z0-9_]$/.test(prev) && /^[A-Za-z0-9_]/.test(trimmed) ? " " : "";
          const lastIdx = out.length - 1;
          out[lastIdx] = out[lastIdx]! + separator + trimmed;
        }
      } else {
        pushBlankLine();
        out.push(trimmed);
      }
    }

    return out.join("\n");
  }

  /** 相邻叙述段合并为同一块，去掉空段，避免多个 <p> 叠 margin */
  private compactParagraphHtml(html: string): string {
    return html
      .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
      .replace(/<\/p>\s*<p>/gi, "<br>");
  }

  private preprocessTables(input: string): string {
    const lines = input.split("\n");
    const out: string[] = [];
    let i = 0;

    const pushBlankLineIfNeeded = () => {
      if (out.length === 0) return;
      if (out[out.length - 1]!.trim() === "") return;
      out.push("");
    };

    const collectTabTableBlock = (start: number): { block: string[]; next: number } => {
      const block: string[] = [];
      let j = start;
      while (j < lines.length) {
        const t = lines[j]!.trim();
        if (!t) {
          const next = lines[j + 1]?.trim() ?? "";
          if (next && isTabTableRowLine(next)) {
            j++;
            continue;
          }
          break;
        }
        if (!isTabTableRowLine(t)) break;
        block.push(t);
        j++;
      }
      return { block, next: j };
    };

    const collectPipeTableBlock = (start: number): { block: string[]; next: number } => {
      const block: string[] = [];
      let j = start;
      while (j < lines.length) {
        const t = lines[j]!.trim();
        if (!t) {
          const next = lines[j + 1]?.trim() ?? "";
          if (
            next &&
            (isMarkdownTableRowLine(next) || isMarkdownTableSeparatorLine(next))
          ) {
            j++;
            continue;
          }
          break;
        }
        if (!isMarkdownTableRowLine(t) && !isMarkdownTableSeparatorLine(t)) break;
        block.push(t);
        j++;
      }
      return { block, next: j };
    };

    while (i < lines.length) {
      const line = lines[i]!;
      const trimmed = line.trim();

      if (!trimmed) {
        if (out.length > 0 && out[out.length - 1]!.trim() !== "") out.push("");
        i++;
        continue;
      }

      if (isTabTableRowLine(trimmed)) {
        const { block, next } = collectTabTableBlock(i);
        pushBlankLineIfNeeded();
        out.push(...tabRowsToPipeMarkdown(block));
        i = next;
        continue;
      }

      const isRow = isMarkdownTableRowLine(trimmed);
      const isSep = isMarkdownTableSeparatorLine(trimmed);
      const nextTrimmed = lines[i + 1]?.trim() ?? "";
      const startsPipeTable =
        isSep || (isRow && isMarkdownTableSeparatorLine(nextTrimmed));

      if (!startsPipeTable && isRow) {
        const { block, next } = collectPipeTableBlock(i);
        if (block.length >= 2 && !isMarkdownTableSeparatorLine(block[1]!)) {
          pushBlankLineIfNeeded();
          out.push(...pipeRowsToMarkdown(block));
          i = next;
          continue;
        }
      }

      if (!startsPipeTable) {
        out.push(line);
        i++;
        continue;
      }

      const block: string[] = [];
      if (isSep && out.length > 0 && isMarkdownTableRowLine(out[out.length - 1]!.trim())) {
        const prev = out.pop()!;
        const { prefix, row } = splitTableRowPrefix(prev);
        if (prefix) out.push(prefix);
        pushBlankLineIfNeeded();
        block.push(row);
        block.push(trimmed);
        i++;
      } else {
        const { prefix, row } = splitTableRowPrefix(trimmed);
        if (prefix) out.push(prefix);
        pushBlankLineIfNeeded();
        block.push(isSep ? trimmed : row);
        i++;
      }

      while (i < lines.length) {
        const t = lines[i]!.trim();
        if (!t) {
          const next = lines[i + 1]?.trim() ?? "";
          if (
            next &&
            (isMarkdownTableRowLine(next) || isMarkdownTableSeparatorLine(next))
          ) {
            i++;
            continue;
          }
          break;
        }
        if (isMarkdownTableRowLine(t) || isMarkdownTableSeparatorLine(t)) {
          block.push(t);
          i++;
          continue;
        }
        break;
      }

      out.push(...block);
    }

    return out.join("\n");
  }

  /** 裸 URL / doma:// 收成 markdown 链接；已是 [text](url) 的不重复包装 */
  private preprocessPlainLinks(input: string): string {
    const withDoma = input.replace(DOMA_SCHEME_URL_RE, (url, offset, full) => {
      if (shouldSkipDomaUrlAutolink(full, offset, url.length)) return url;
      return `[${url}](${url})`;
    });
    return withDoma.replace(HTTP_URL_IN_TEXT_RE, (raw, offset, full) => {
      if (shouldSkipHttpUrlAutolink(full, offset, raw.length)) return raw;
      const { href, trailing } = trimTrailingUrlPunctuation(raw);
      if (!/^https?:\/\//i.test(href)) return raw;
      return `[${href}](${href})${trailing}`;
    });
  }
}

export const chatMarkdownRenderer = new ChatMarkdownRenderer();

const MARKDOWN_LINK_IN_PLAIN_TEXT_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const MARKDOWN_LINK_SPACING_RE =
  /\[([^\]\n]+)\]\s+\(\s*((?:https?:\/\/|doma:\/\/)[^)\s]+)\s*\)/gi;

function hasMarkdownLinkSyntax(body: string): boolean {
  return /\[([^\]\n]+)\]\s*\(\s*(?:https?:\/\/|doma:\/\/)/i.test(body);
}

function preprocessMarkdownLinkSpacing(input: string): string {
  return input.replace(
    MARKDOWN_LINK_SPACING_RE,
    (_full, label: string, dest: string) => `[${label}](${dest.trim()})`,
  );
}

function escapeAndAutolinkPlainTextSegment(plain: string): string {
  return linkifyPlainTextUrlsInEscapedHtml(escapeHtml(plain));
}

function renderMarkdownLinkSegment(label: string, dest: string): string {
  const href = dest.trim();
  if (/^doma:\/\//i.test(href)) {
    return renderDomaSchemeLinkHtml(href, label);
  }
  if (/^https?:\/\//i.test(href)) {
    return renderHttpLinkHtml(href, label);
  }
  return escapeHtml(`[${label}](${dest})`);
}

/** 用户气泡：纯文本 → HTML（Markdown 链接 + 裸 URL，与助手链接样式一致） */
export function renderUserPlainTextAsBubbleHtml(text: string): string {
  const src = String(text);
  const chunks: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MARKDOWN_LINK_IN_PLAIN_TEXT_RE.lastIndex = 0;
  while ((match = MARKDOWN_LINK_IN_PLAIN_TEXT_RE.exec(src)) !== null) {
    if (match.index > lastIndex) {
      chunks.push(escapeAndAutolinkPlainTextSegment(src.slice(lastIndex, match.index)));
    }
    chunks.push(renderMarkdownLinkSegment(match[1]!, match[2]!));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < src.length) {
    chunks.push(escapeAndAutolinkPlainTextSegment(src.slice(lastIndex)));
  }
  return chunks.join("").replace(/\n/g, "<br />");
}

/** 用户气泡：已 escape 的纯文本里 linkify 裸 URL（与助手链接样式一致） */
export function linkifyPlainTextUrlsInEscapedHtml(escaped: string): string {
  const withDoma = escaped.replace(DOMA_SCHEME_URL_RE, (url) => renderDomaSchemeLinkHtml(url));
  return withDoma.replace(HTTP_URL_IN_TEXT_RE, (url, offset, full) => {
    if (shouldSkipHttpUrlAutolink(full, offset, url.length)) return url;
    return renderHttpLinkHtml(url);
  });
}
