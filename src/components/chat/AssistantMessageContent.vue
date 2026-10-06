<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chatMarkdownRenderer } from "@/services/chat/ChatMarkdownRenderer";
import { expandDomSpecInMarkdown } from "@/services/chat/specMarkdown";
import { getSpecAsset, getSpecAssetDataUrl } from "@/services/chat/specAssetStore";
import { downloadHtmlTableAsXlsx } from "@/utils/exportTableToExcel";
import { resolveDomaHrefFromClickTarget } from "@/utils/domaVideoSeek";
import chatExcelIcon from "@/assets/images/chat-excel.svg?raw";
import chatChevronUpIcon from "@/assets/images/chat-chevron-up.svg?raw";

const props = defineProps<{
  content: string;
  /** 流式输出中为 true：轻量增量渲染；结束后为 false：完整 Markdown */
  streaming?: boolean;
  /** 是否启用逐字打字机效果（由 ChatPanel 代码开关控制） */
  typewriterEnabled?: boolean;
}>();

const emit = defineEmits<{
  domaLinkClick: [href: string, event: MouseEvent];
  createSkillFromPanel: [markdown: string];
  downloadExtensionFromPanel: [payloadJson: string];
}>();

const { t } = useI18n();
const rootEl = ref<HTMLElement | null>(null);

/** 打字机：视觉上逐字显示，与 SSE 块大小解耦 */
const displayedContent = ref("");
let typewriterRafId: number | null = null;
let wasStreaming = false;

const PANEL_FENCE_RE = /```[ \t]*(cursor-prompt|skill|extension)\b/i;

function stopTypewriter() {
  if (typewriterRafId != null) {
    cancelAnimationFrame(typewriterRafId);
    typewriterRafId = null;
  }
}

function appendStreamingCursor(markup: string): string {
  const cursor = '<span class="chat-streaming-cursor" aria-hidden="true"></span>';
  if (!markup) {
    return `<p class="chat-streaming-text">${cursor}</p>`;
  }
  if (markup.endsWith("</p>")) {
    return markup.replace(/<\/p>$/, `${cursor}</p>`);
  }
  return `${markup}${cursor}`;
}

function runTypewriterFrame() {
  typewriterRafId = null;

  const target = props.content;
  const current = displayedContent.value;
  if (current.length >= target.length) return;

  const behind = target.length - current.length;
  const step = behind > 48 ? Math.min(6, Math.ceil(behind / 12)) : 1;
  displayedContent.value = target.slice(0, current.length + step);

  if (displayedContent.value.length < target.length) {
    typewriterRafId = requestAnimationFrame(runTypewriterFrame);
  }
}

function ensureTypewriterRunning() {
  if (displayedContent.value.length >= props.content.length) return;
  if (typewriterRafId != null) return;
  typewriterRafId = requestAnimationFrame(runTypewriterFrame);
}

watch(
  () => [props.content, props.streaming, props.typewriterEnabled] as const,
  ([content, streaming, typewriterEnabled]) => {
    if (!typewriterEnabled) {
      stopTypewriter();
      displayedContent.value = content;
      wasStreaming = false;
      return;
    }
    if (streaming) {
      wasStreaming = true;
    }
    if (content.length < displayedContent.value.length) {
      displayedContent.value = content;
    }
    // 历史消息 / 非流式：直接全文，不跑打字机
    if (!streaming && !wasStreaming) {
      stopTypewriter();
      displayedContent.value = content;
      return;
    }
    // SSE 已结束但打字机未追完：继续逐字，追完再切 Markdown
    if (!streaming && displayedContent.value.length >= content.length) {
      stopTypewriter();
      displayedContent.value = content;
      return;
    }
    ensureTypewriterRunning();
  },
  { immediate: true },
);

onUnmounted(() => {
  stopTypewriter();
});

/** 网络流式中，或打字机尚未追完 */
const isStreamVisualMode = computed(() => {
  if (!props.typewriterEnabled) return !!props.streaming;
  return props.streaming || displayedContent.value.length < props.content.length;
});

const html = computed(() => {
  if (!isStreamVisualMode.value) {
    return chatMarkdownRenderer.render(props.content);
  }

  const useTypewriter =
    !!props.typewriterEnabled && !PANEL_FENCE_RE.test(props.content);
  const source = useTypewriter ? displayedContent.value : props.content;
  let markup = chatMarkdownRenderer.renderStreaming(source);

  if (
    useTypewriter &&
    displayedContent.value.length < props.content.length
  ) {
    markup = appendStreamingCursor(markup);
  }

  return markup;
});

function decorateTableBlocks() {
  const root = rootEl.value;
  if (!root) return;
  const exportLabel = t("chat.markdown.exportExcel");
  const tableLabel = t("chat.markdown.tableLabel");
  root.querySelectorAll(".chat-table-block").forEach((block) => {
    block.querySelector(".chat-table-lang")!.textContent = tableLabel;
  });
  root.querySelectorAll<HTMLButtonElement>("[data-table-export-btn]").forEach((btn) => {
    btn.innerHTML = `<span class="chat-table-export-icon" aria-hidden="true">${chatExcelIcon}</span><span class="chat-table-export-label">${exportLabel}</span>`;
  });
}

function decoratePanelButtons() {
  const root = rootEl.value;
  if (!root) return;
  const copyLabel = t("chat.markdown.copyCode");
  const createLabel = t("chat.skills.createSkill");
  const backTopLabel = t("chat.markdown.backToPanelTop");
  root.querySelectorAll<HTMLButtonElement>("[data-markdown-panel-copy-btn]").forEach((btn) => {
    if (btn.dataset.panelDecorated === "1") return;
    btn.textContent = copyLabel;
    btn.dataset.panelDecorated = "1";
  });
  root.querySelectorAll<HTMLButtonElement>("[data-markdown-panel-create-btn]").forEach((btn) => {
    if (btn.dataset.panelDecorated === "1") return;
    btn.textContent = createLabel;
    btn.dataset.panelDecorated = "1";
  });
  root.querySelectorAll<HTMLButtonElement>("[data-markdown-panel-back-top-btn]").forEach((btn) => {
    if (btn.dataset.panelDecorated === "1") return;
    btn.innerHTML = `<span class="chat-markdown-panel-back-top-icon" aria-hidden="true">${chatChevronUpIcon}</span><span class="chat-markdown-panel-back-top-label">${backTopLabel}</span>`;
    btn.dataset.panelDecorated = "1";
  });
}

function decorateCopyButtons() {
  const root = rootEl.value;
  if (!root) return;
  const copyLabel = t("chat.markdown.copyCode");
  root.querySelectorAll<HTMLButtonElement>("[data-code-copy-btn], [data-table-copy-btn]").forEach((btn) => {
    if (btn.dataset.copyDecorated === "1") return;
    btn.textContent = copyLabel;
    btn.dataset.copyDecorated = "1";
  });
}

function decorateExtensionCards() {
  const root = rootEl.value;
  if (!root) return;
  const downloadLabel = t("chat.extensionCard.download");
  const hintLabel = t("chat.extensionCard.downloadHint");
  root.querySelectorAll<HTMLElement>("[data-extension-download-hint]").forEach((el) => {
    if (el.dataset.extDecorated === "1") return;
    el.textContent = hintLabel;
    el.dataset.extDecorated = "1";
  });
  root.querySelectorAll<HTMLButtonElement>("[data-extension-download-btn]").forEach((btn) => {
    if (btn.dataset.extDecorated === "1") return;
    btn.innerHTML = `<span class="chat-extension-card-download-icon" aria-hidden="true">↓</span><span class="chat-extension-card-download-label">${downloadLabel}</span>`;
    btn.dataset.extDecorated = "1";
  });
}

function decorateMarkdownBlocks() {
  decorateTableBlocks();
  decorateCopyButtons();
  decoratePanelButtons();
  decorateExtensionCards();
}

async function hydrateSpecAssetImages() {
  const root = rootEl.value;
  if (!root) return;
  const imgs = root.querySelectorAll<HTMLImageElement>("img[data-doma-spec]");
  await Promise.all(
    Array.from(imgs).map(async (img) => {
      const id = img.getAttribute("data-doma-spec");
      if (!id || img.dataset.specHydrated === "1") return;
      const record = await getSpecAsset(id);
      if (!record) return;
      const dataUrl = await getSpecAssetDataUrl(id);
      if (dataUrl) {
        img.src = dataUrl;
        if (record.width && record.height) {
          img.style.aspectRatio = `${record.width} / ${record.height}`;
        }
        img.dataset.specHydrated = "1";
      }
    }),
  );
}

function guessTableFilename(table: HTMLTableElement): string | undefined {
  const block = table.closest(".chat-table-block");
  if (!block) return undefined;

  let prev: Element | null = block.previousElementSibling;
  while (prev) {
    if (/^H[1-6]$/.test(prev.tagName)) {
      const title = prev.textContent?.trim();
      if (title) return title.slice(0, 60);
    }
    if (prev.tagName === "P") break;
    prev = prev.previousElementSibling;
  }
  return undefined;
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("th, td")).map((cell) =>
      (cell.textContent ?? "").trim().replace(/\|/g, "\\|").replace(/\n/g, " ")
    )
  );
  if (!rows.length) return "";

  const width = Math.max(...rows.map((row) => row.length));
  for (const row of rows) {
    while (row.length < width) row.push("");
  }

  const lines = rows.map((row) => `| ${row.join(" | ")} |`);
  lines.splice(1, 0, `| ${rows[0].map(() => "---").join(" | ")} |`);
  return lines.join("\n");
}

async function copyTableBlock(btn: HTMLButtonElement) {
  const table = btn.closest(".chat-table-block")?.querySelector("table");
  if (!(table instanceof HTMLTableElement)) return;

  const text = tableToMarkdown(table);
  if (!text) return;

  const copiedLabel = t("chat.markdown.copiedCode");
  const copyLabel = t("chat.markdown.copyCode");
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = copiedLabel;
    window.setTimeout(() => {
      if (btn.isConnected) btn.textContent = copyLabel;
    }, 1500);
  } catch {
    /* ignore */
  }
}

async function copyMarkdownPanel(btn: HTMLButtonElement) {
  const panel = btn.closest(".chat-markdown-panel");
  const encoded = panel?.getAttribute("data-markdown-source") ?? "";
  if (!encoded) return;

  let text = "";
  try {
    text = decodeURIComponent(encoded);
  } catch {
    return;
  }
  if (!text) return;

  const copiedLabel = t("chat.markdown.copiedCode");
  const copyLabel = t("chat.markdown.copyCode");
  try {
    const expanded = await expandDomSpecInMarkdown(text);
    await navigator.clipboard.writeText(expanded);
    btn.textContent = copiedLabel;
    window.setTimeout(() => {
      if (btn.isConnected) btn.textContent = copyLabel;
    }, 1500);
  } catch {
    /* ignore */
  }
}

async function copyCodeBlock(btn: HTMLButtonElement) {
  const block = btn.closest(".chat-code-block");
  const code = block?.querySelector("code");
  const text = code?.textContent ?? "";
  if (!text) return;

  const copiedLabel = t("chat.markdown.copiedCode");
  const copyLabel = t("chat.markdown.copyCode");
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = copiedLabel;
    window.setTimeout(() => {
      if (btn.isConnected) btn.textContent = copyLabel;
    }, 1500);
  } catch {
    /* ignore */
  }
}

async function createSkillFromMarkdownPanel(btn: HTMLButtonElement) {
  const panel = btn.closest(".chat-markdown-panel");
  const encoded = panel?.getAttribute("data-markdown-source") ?? "";
  if (!encoded) return;

  let text = "";
  try {
    text = decodeURIComponent(encoded);
  } catch {
    return;
  }
  if (!text.trim()) return;

  emit("createSkillFromPanel", text);
}

function downloadExtensionFromCard(btn: HTMLButtonElement) {
  const card = btn.closest(".chat-extension-card");
  const encoded = card?.getAttribute("data-extension-payload") ?? "";
  if (!encoded) return;
  let payloadJson = "";
  try {
    payloadJson = decodeURIComponent(encoded);
  } catch {
    return;
  }
  if (!payloadJson.trim()) return;
  emit("downloadExtensionFromPanel", payloadJson);
}

function scrollMarkdownPanelToTop(btn: HTMLButtonElement) {
  const panel = btn.closest(".chat-markdown-panel");
  if (!(panel instanceof HTMLElement)) return;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  const body = panel.querySelector(".chat-markdown-panel-body");
  if (body instanceof HTMLElement) body.scrollTop = 0;
}

async function onMarkdownClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const domaHref = resolveDomaHrefFromClickTarget(target);
  if (domaHref && rootEl.value?.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    emit("domaLinkClick", domaHref, event);
    return;
  }

  const copyBtn = target.closest<HTMLButtonElement>("[data-code-copy-btn]");
  if (copyBtn && rootEl.value?.contains(copyBtn)) {
    event.preventDefault();
    event.stopPropagation();
    await copyCodeBlock(copyBtn);
    return;
  }

  const panelCopyBtn = target.closest<HTMLButtonElement>("[data-markdown-panel-copy-btn]");
  if (panelCopyBtn && rootEl.value?.contains(panelCopyBtn)) {
    event.preventDefault();
    event.stopPropagation();
    await copyMarkdownPanel(panelCopyBtn);
    return;
  }

  const panelCreateBtn = target.closest<HTMLButtonElement>("[data-markdown-panel-create-btn]");
  if (panelCreateBtn && rootEl.value?.contains(panelCreateBtn)) {
    event.preventDefault();
    event.stopPropagation();
    await createSkillFromMarkdownPanel(panelCreateBtn);
    return;
  }

  const extensionDownloadBtn = target.closest<HTMLButtonElement>("[data-extension-download-btn]");
  if (extensionDownloadBtn && rootEl.value?.contains(extensionDownloadBtn)) {
    event.preventDefault();
    event.stopPropagation();
    downloadExtensionFromCard(extensionDownloadBtn);
    return;
  }

  const panelBackTopBtn = target.closest<HTMLButtonElement>("[data-markdown-panel-back-top-btn]");
  if (panelBackTopBtn && rootEl.value?.contains(panelBackTopBtn)) {
    event.preventDefault();
    event.stopPropagation();
    scrollMarkdownPanelToTop(panelBackTopBtn);
    return;
  }

  const tableCopyBtn = target.closest<HTMLButtonElement>("[data-table-copy-btn]");
  if (tableCopyBtn && rootEl.value?.contains(tableCopyBtn)) {
    event.preventDefault();
    event.stopPropagation();
    await copyTableBlock(tableCopyBtn);
    return;
  }

  const btn = target.closest<HTMLButtonElement>("[data-table-export-btn]");
  if (!btn || !rootEl.value?.contains(btn)) return;

  event.preventDefault();
  event.stopPropagation();

  const table = btn.closest(".chat-table-block")?.querySelector("table");
  if (!(table instanceof HTMLTableElement)) return;

  btn.disabled = true;
  try {
    await downloadHtmlTableAsXlsx(table, guessTableFilename(table));
  } finally {
    btn.disabled = false;
  }
}

watch(html, () => {
  nextTick(() => {
    decorateMarkdownBlocks();
    void hydrateSpecAssetImages();
  });
}, { immediate: true });
</script>

<template>
  <div
    ref="rootEl"
    class="chat-markdown"
    v-html="html"
    @click="onMarkdownClick"
  />
</template>

<style scoped lang="less">
@chat-link-color: rgb(54, 116, 239);

.msg-content.chat-markdown,
.chat-markdown {
  margin: 0;
  line-height: 1.6;
  white-space: normal;
  word-break: break-word;
  font-size: 15px;

  :deep(.chat-streaming-text) {
    margin: 0;
    white-space: normal;
    word-break: break-word;
  }

  :deep(.chat-streaming-cursor) {
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-left: 1px;
    vertical-align: text-bottom;
    background: currentColor;
    opacity: 0.75;
    animation: chat-streaming-cursor-blink 1s step-end infinite;
  }

  @keyframes chat-streaming-cursor-blink {
    0%,
    100% {
      opacity: 0.75;
    }
    50% {
      opacity: 0;
    }
  }

  :deep(p) {
    margin: 0;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 0.7em 0 0.25em;
    line-height: 1.25;
    font-weight: 700;
    color: var(--stay-black);
  }

  :deep(p + h1),
  :deep(p + h2),
  :deep(p + h3),
  :deep(p + h4),
  :deep(p + h5),
  :deep(p + h6) {
    margin-top: 0.9em;
  }

  :deep(h1) { font-size: 20px; }
  :deep(h2) { font-size: 18px; }
  :deep(h3) { font-size: 16px; }
  :deep(h4) { font-size: 15px; }
  :deep(h5) { font-size: 15px; }
  :deep(h6) { font-size: 15px; opacity: 0.9; }

  :deep(h1:first-child),
  :deep(h2:first-child),
  :deep(h3:first-child),
  :deep(h4:first-child),
  :deep(h5:first-child),
  :deep(h6:first-child) {
    margin-top: 0;
  }

  :deep(strong) {
    font-weight: 700;
  }

  :deep(.chat-markdown-img),
  :deep(.chat-spec-asset) {
    display: block;
    max-width: min(100%, 240px);
    max-height: 160px;
    width: auto;
    height: auto;
    margin: 8px 0;
    object-fit: contain;
    border-radius: 6px;
    border: 1px solid var(--stay-border, #d0d0d0);
    background: var(--stay-background, #fff);
  }

  :deep(.chat-code-block) {
    margin: 8px 0;
    border: 1px solid var(--stay-border, #d0d0d0);
    border-radius: 8px;
    overflow: hidden;
    background: color-mix(in srgb, var(--stay-black) 4%, transparent);
  }

  :deep(.chat-markdown-panel) {
    margin: 8px 0;
    border: 1px solid var(--stay-border, #d0d0d0);
    border-radius: 8px;
    overflow: hidden;
    background: color-mix(in srgb, var(--stay-black) 4%, transparent);
  }

  :deep(.chat-extension-card) {
    margin: 8px 0;
    padding: 12px 14px;
    border: 1px solid var(--stay-border, #d0d0d0);
    border-radius: 8px;
    background: color-mix(in srgb, var(--stay-black) 4%, transparent);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  :deep(.chat-extension-card-name) {
    font-size: 14px;
    font-weight: 600;
    color: var(--stay-text, #2f3134);
  }

  :deep(.chat-extension-card-desc) {
    font-size: 12px;
    line-height: 1.45;
    color: color-mix(in srgb, var(--stay-black) 72%, transparent);
    white-space: pre-wrap;
  }

  :deep(.chat-extension-card-id) {
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: color-mix(in srgb, var(--stay-black) 55%, transparent);
    word-break: break-all;
  }

  :deep(.chat-extension-card-hint) {
    margin: 2px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: color-mix(in srgb, var(--stay-black) 65%, transparent);
  }

  :deep(.chat-extension-card-download) {
    align-self: flex-start;
    margin-top: 4px;
    height: 28px;
    padding: 0 12px;
    border-radius: 6px;
    border: none;
    background: var(--stay-primary, #3674ef);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  :deep(.chat-extension-card-download-icon) {
    font-size: 13px;
    line-height: 1;
    font-weight: 700;
  }

  :deep(.chat-extension-card-download:hover) {
    filter: brightness(1.05);
  }

  :deep(.chat-extension-card-download:disabled) {
    opacity: 0.6;
    cursor: default;
  }

  :deep(.chat-markdown-panel-toolbar) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--stay-border, #d0d0d0);
    background: color-mix(in srgb, var(--stay-black) 6%, transparent);
  }

  :deep(.chat-markdown-panel-title) {
    font-size: 11px;
    line-height: 1;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--stay-black) 72%, transparent);
  }

  :deep(.chat-markdown-panel-actions) {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  :deep(.chat-markdown-panel-copy-btn),
  :deep(.chat-markdown-panel-create-btn) {
    appearance: none;
    border: 1px solid var(--stay-border, #d0d0d0);
    border-radius: 6px;
    background: var(--stay-backgroundSecondary, #fff);
    color: var(--stay-black);
    font-size: 12px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  :deep(.chat-markdown-panel-copy-btn:hover),
  :deep(.chat-markdown-panel-create-btn:hover) {
    background: rgba(54, 116, 239, 0.08);
    border-color: rgba(54, 116, 239, 0.35);
    color: @chat-link-color;
  }

  :deep(.chat-markdown-panel-footer) {
    display: flex;
    justify-content: center;
    padding: 4px 12px 6px;
    border-top: 1px solid var(--stay-border, #d0d0d0);
    background: color-mix(in srgb, var(--stay-black) 3%, transparent);
  }

  :deep(.chat-markdown-panel-back-top-btn) {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--stay-black) 72%, transparent);
    font-size: 12px;
    line-height: 1;
    padding: 2px 6px;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  :deep(.chat-markdown-panel-back-top-btn:hover) {
    color: @chat-link-color;
    background: rgba(54, 116, 239, 0.08);
    border-radius: 6px;
  }

  :deep(.chat-markdown-panel-back-top-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  :deep(.chat-markdown-panel-back-top-icon svg) {
    display: block;
    width: 12px;
    height: 12px;
  }

  :deep(.chat-markdown-panel-back-top-label) {
    font-size: 12px;
    line-height: 1;
  }

  :deep(.chat-markdown-panel-body) {
    padding: 10px 12px;
    line-height: 1.6;
    white-space: normal;
    word-break: break-word;
  }

  :deep(.chat-markdown-panel-body p) {
    margin: 0;
    white-space: pre-wrap;
  }

  :deep(.chat-markdown-panel-body p + p) {
    margin-top: 0.65em;
  }

  :deep(.chat-markdown-panel-body .chat-table-block),
  :deep(.chat-markdown-panel-body .chat-code-block) {
    margin: 0.65em 0;
    border: none;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.07);
  }

  :deep(.chat-markdown-panel-body .chat-table-toolbar),
  :deep(.chat-markdown-panel-body .chat-code-toolbar) {
    background: color-mix(in srgb, var(--stay-black) 4%, transparent);
    border-bottom-color: rgba(0, 0, 0, 0.06);
  }

  :deep(.chat-spec-asset) {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: 360px;
    margin: 0.5em 0;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    object-fit: contain;
    object-position: left top;
  }

  :deep(.chat-markdown-panel-body h1),
  :deep(.chat-markdown-panel-body h2),
  :deep(.chat-markdown-panel-body h3),
  :deep(.chat-markdown-panel-body h4),
  :deep(.chat-markdown-panel-body h5),
  :deep(.chat-markdown-panel-body h6) {
    margin: 0.7em 0 0.25em;
    line-height: 1.25;
    font-weight: 700;
    color: var(--stay-black);
  }

  :deep(.chat-markdown-panel-body h1:first-child),
  :deep(.chat-markdown-panel-body h2:first-child),
  :deep(.chat-markdown-panel-body h3:first-child),
  :deep(.chat-markdown-panel-body h4:first-child),
  :deep(.chat-markdown-panel-body h5:first-child),
  :deep(.chat-markdown-panel-body h6:first-child) {
    margin-top: 0;
  }

  :deep(.chat-markdown-panel-body ul),
  :deep(.chat-markdown-panel-body ol) {
    margin: 0.45em 0 0.4em 18px;
    padding: 0;
  }

  :deep(.chat-code-toolbar) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--stay-border, #d0d0d0);
    background: color-mix(in srgb, var(--stay-black) 6%, transparent);
  }

  :deep(.chat-code-lang) {
    font-size: 11px;
    line-height: 1;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--stay-black) 72%, transparent);
  }

  :deep(.chat-code-copy-btn),
  :deep(.chat-table-copy-btn) {
    appearance: none;
    border: 1px solid var(--stay-border, #d0d0d0);
    border-radius: 6px;
    background: var(--stay-backgroundSecondary, #fff);
    color: var(--stay-black);
    font-size: 12px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  :deep(.chat-code-copy-btn:hover),
  :deep(.chat-table-copy-btn:hover) {
    background: rgba(54, 116, 239, 0.08);
    border-color: rgba(54, 116, 239, 0.35);
    color: @chat-link-color;
  }

  :deep(.chat-code-block pre) {
    margin: 0;
    padding: 10px 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: auto;
  }

  :deep(.chat-code-block pre code) {
    font-size: 12px;
    line-height: 1.45;
    white-space: pre;
    word-break: normal;
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  :deep(pre code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
      monospace;
    font-size: 0.8em;
    background: var(--stay-border);
    padding: 0 4px;
    border-radius: 4px;
  }

  :deep(pre code) {
    background: transparent;
    padding: 0;
  }

  :deep(a),
  :deep(a code) {
    background: transparent;
  }

  :deep(a code) {
    font-family: inherit;
    font-size: inherit;
    padding: 0;
    border-radius: 0;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.45em 0 0.4em 18px;
    padding: 0;
  }

  :deep(p + ul),
  :deep(p + ol) {
    margin-top: 0.65em;
  }

  :deep(li + li) {
    margin-top: 0.18em;
  }

  :deep(blockquote) {
    margin: 8px 0;
    padding: 6px 10px;
    border-left: 3px solid color-mix(in srgb, var(--stay-black) 25%, transparent);
    background: color-mix(in srgb, var(--stay-black) 4%, transparent);
    color: var(--stay-black);
  }

  :deep(hr) {
    border: 0;
    border-top: 1px solid var(--stay-border);
    margin: 0.75em 0;
    background: none;
  }

  :deep(.chat-markdown-panel-body hr) {
    border: 0;
    border-top: 1px solid var(--stay-border);
    margin: 0.75em 0;
    background: none;
  }

  :deep(.chat-table-block) {
    margin: 8px 0;
    border: 1px solid var(--stay-border, #d0d0d0);
    border-radius: 8px;
    overflow: hidden;
    background: color-mix(in srgb, var(--stay-black) 4%, transparent);
  }

  :deep(p + .chat-table-block) {
    margin-top: 0.75em;
  }

  :deep(.chat-table-toolbar) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--stay-border, #d0d0d0);
    background: color-mix(in srgb, var(--stay-black) 6%, transparent);
  }

  :deep(.chat-table-lang) {
    font-size: 11px;
    line-height: 1;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--stay-black) 72%, transparent);
  }

  :deep(.chat-table-actions) {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  :deep(.chat-table-body) {
    overflow-x: auto;
  }

  :deep(.chat-table-export-btn) {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--stay-border, #d0d0d0);
    border-radius: 6px;
    background: var(--stay-backgroundSecondary, #fff);
    color: var(--stay-black);
    font-size: 12px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  :deep(.chat-table-export-icon) {
    display: inline-flex;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  :deep(.chat-table-export-icon svg) {
    display: block;
    width: 14px;
    height: 14px;
  }

  :deep(.chat-table-export-label) {
    line-height: 1.2;
  }

  :deep(.chat-table-export-btn:hover:not(:disabled)) {
    background: rgba(54, 116, 239, 0.08);
    border-color: rgba(54, 116, 239, 0.35);
    color: @chat-link-color;
  }

  :deep(.chat-table-export-btn:disabled) {
    opacity: 0.6;
    cursor: wait;
  }

  :deep(.chat-table-block table) {
    width: 100%;
    margin: 0;
    border-collapse: collapse;
    font-size: 13px;
    line-height: 1.35;
    display: table;
  }

  :deep(table) {
    width: 100%;
    margin: 0;
    border-collapse: collapse;
    font-size: 13px;
    line-height: 1.35;
    display: table;
    overflow-x: auto;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid var(--stay-border, #d0d0d0);
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  :deep(th) {
    font-weight: 600;
    background: color-mix(in srgb, var(--stay-black) 6%, transparent);
  }

  :deep(tr:nth-child(even) td) {
    background: color-mix(in srgb, var(--stay-black) 3%, transparent);
  }

  :deep(a.chat-bubble-link),
  :deep(a.chat-doma-link) {
    &,
    &:link,
    &:visited {
      color: @chat-link-color !important;
      -webkit-text-fill-color: @chat-link-color;
    }
  }

  :deep(a.chat-doma-link) {
    text-decoration: underline;
    text-decoration-color: var(--stay-border);
    cursor: pointer;
    transition: text-decoration-color 0.15s ease;
  }

  :deep(a.chat-doma-link:hover) {
    text-decoration-color: @chat-link-color;
  }

  :deep(a.chat-bubble-link:not(.chat-doma-link)),
  :deep(a:not(.chat-doma-link)) {
    &,
    &:link,
    &:visited {
      color: @chat-link-color !important;
      -webkit-text-fill-color: @chat-link-color;
    }

    font-weight: 400;
    text-decoration: none;
    background: transparent;
    border: 0;
    border-radius: 0;
    padding: 0;
    border-bottom: 1px solid var(--stay-border);
    padding-bottom: 1px;
    box-shadow: none;
    cursor: pointer;
    word-break: break-word;
    transition: border-bottom-color 0.15s ease;
  }

  :deep(a.chat-bubble-link:not(.chat-doma-link)::after),
  :deep(a:not(.chat-doma-link)::after) {
    content: "↗";
    display: inline-block;
    margin-left: 6px;
    font-size: 0.95em;
    line-height: 1;
    color: @chat-link-color;
    transform: translateY(-1px);
  }

  :deep(a.chat-bubble-link:not(.chat-doma-link):hover),
  :deep(a:not(.chat-doma-link):hover) {
    border-bottom-color: @chat-link-color;
  }

  :deep(a:active) {
    transform: translateY(0.5px);
  }

  :deep(.chat-video-seek-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-right: 6px;
    min-width: 23px;
    min-height: 23px;
    padding: 0;
    vertical-align: middle;
    border: 1px solid var(--stay-border, #ddd);
    border-radius: 999px;
    background: var(--stay-background, #fff);
    color: var(--stay-primary, @chat-link-color);
    font-size: 0.875rem;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  :deep(.chat-video-seek-btn:hover) {
    border-color: var(--stay-primary, @chat-link-color);
    background: color-mix(in srgb, var(--stay-primary, @chat-link-color) 8%, #fff);
  }

  :deep(.chat-video-seek-icon) {
    font-size: 0.75rem;
    line-height: 1;
  }
}
</style>
