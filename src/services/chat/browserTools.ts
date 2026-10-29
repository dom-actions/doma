/**
 * Browser tool implementations for chat/MCP. Run in service worker (has chrome.tabs etc.).
 *
 * ## Changelog（SoM / 浏览器工具）
 *
 * ### cdp-strip-foreign-embeds-v1（2026-07-30）
 * - `chrome.debugger.attach` 前清理页面内非本扩展的 `chrome-extension://` iframe/frame/embed/object（含 shadow）
 * - 若仍报 “Cannot access a chrome-extension:// URL of different extension” 再清一次并重试 attach
 * - 缓解其它扩展（快捷键/划词等）往页面塞扩展 iframe 导致 CDP 挂不上
 * - **回滚**：`git grep "cdp-strip-foreign-embeds-v1"`
 *
 * ### click-point-heading-v1（2026-07-30）
 * - 大块可点区域（如 Google SERP 整卡 `<a>`）不再死点几何中心；优先内部 h1–h5 / role=heading / 文本子节点中心
 * - 修复中心落在标题上方空白导致 agent 光标与 CDP 坐标偏上、真实鼠标点空
 * - **回滚**：`git grep "click-point-heading-v1"`
 *
 * ### som-post-composite-v1（2026-07-30）
 * - SoM 截图改为：页内只写 `data-som-idx` + 记录几何，**不**注入 `#__som-container` 视觉层
 * - 先截干净 viewport，再在压缩/裁剪管线用 Canvas 按 `rc`/areas 合成编号与边框（消除页面闪一下）
 * - 涉及：`annotateInteractiveElements`、`compressImageInTab` / `finalizeScreenshotDataUrl`、`browser_screenshot`、`browser_screenshot_area`
 * - **回滚**：`git grep "som-post-composite-v1"`
 *
 * ### som-overflow-area-v1（2026-07-17）
 * - SoM 达 150 上限后，未标上的可见可交互区域收成 A1/A2…；browser_screenshot_area 对指定 Ax 二次详细标注
 * - **回滚**：`git grep "som-overflow-area-v1"`
 *
 * ### safari-panel-crop-v1（2026-09-20）
 * - Safari 页内壳 `#doma-safari-panel-host` 会被 captureVisibleTab 拍进图；压缩阶段按壳宽裁掉侧栏竖条
 * - Chrome 无该节点 → no-op；iOS 全屏壳不裁
 * - **回滚**：`git grep "safari-panel-crop-v1"`
 *
 * ### jev-screenshot-decide-v1（2026-09-21）
 * - `browser_screenshot` 必填 purpose+goal；act 须 action（type 须 text）
 * - Jev 开关开启时内部 decide：高置信代执行 click/type 或 verify 短结论（无图）；否则回退上图
 * - **回滚**：`git grep "jev-screenshot-decide-v1"`
 *
 * ### scroll-auto-container-v1（2026-07-17）
 * - `browser_scroll` 无 selector：先判 window 能否滚；不能则自动选视口内最大可滚动容器（修 Gmail 等 SPA）
 * - 统一 `behavior: instant` 测真实 delta；|delta|<1 返回 ok=false
 * - **回滚**：`git grep "scroll-auto-container-v1"`
 *
 * ### click-download-verify-v1（2026-07-17）
 * - click verify 并行监听 `downloads.onCreated`；触发浏览器下载亦视为 verified，reason=`download-started`
 * - 与 DOM/新 tab 同窗竞态，短超时；普通点击无 download 不额外阻塞
 * - **回滚**：`git grep "click-download-verify-v1"`
 *
 * ### click-unified-som-v1（2026-06-25）
 * - `browser_click` 升级为 click-index-v4 管线（MAIN world、多 frame、DOM 验证、新 tab 检测）
 * - `browser_click_index` 保留入口，内部转为 `[data-som-idx="N"]` 后委托 `browser_click`
 * - **回滚**：`git grep "click-unified-som-v1"` 定位改动；稳定版为独立 click-index-v4 + 轻量 browser_click
 *
 * ### click-cdp-fallback-v1（2026-07-24）
 * - `browser_click`：native/synthetic（及 text 子树）失败后，用元素中心坐标走 CDP `Input.dispatchMouseEvent` 兜底
 * - 对 `target=_blank` / 预期新 tab：加长 tab 侦测窗口，缓解脚本 `.click()` 被弹窗拦截
 * - **回滚**：`git grep "click-cdp-fallback-v1"`
 *
 * ### som-interaction-unified-v1（2026-06-25）
 * - `browser_type` / `browser_long_press` / `browser_hover` / `browser_drag` 承接原 *_index 多 frame 管线
 * - 各 `*_index` 保留入口，内部 `somIndexToSelector` 后委托对应 Core
 * - **回滚**：`git grep "som-interaction-unified-v1"` 或分别 grep：
 *   `type-unified-som-v1` | `long-press-unified-som-v1` | `hover-unified-som-v1` | `drag-unified-som-v1`
 *
 * ### hover-dwell-v1（2026-06-25）
 * - `browser_hover` 默认停留 600ms，期间显示 agent 光标并周期性 mousemove（便于 :hover 菜单展开）
 * - **回滚**：`git grep "hover-dwell-v1"`
 *
 * ### hover-real-mouse-v2（2026-06-25）
 * - CDP `Input.dispatchMouseEvent` 真实移动指针，触发 CSS `:hover`（如导航 a.topic-item）
 * - agent 光标颜色 `--stay-primary`；停留结束后自动淡出
 * - hover/type/long_press/drag 与 click 一致：`execAllFramesPerFrame` + `world: "MAIN"`
 * - hover 顺序：先 synthetic + 验证，无效且主 frame 才 CDP 兜底（减少 debug 黄条）
 * - **回滚**：`git grep "hover-real-mouse-v2"`
 *
 * ### som-draggable-mark-v1（2026-07-06）
 * - SoM 标注收录 `[draggable="true"]`；cursor `move`/`grab`/`grabbing` 与 `pointer` 同等视为可交互
 * - elements 映射对 draggable 元素附加 hint，便于 browser_drag({ fromIndex })
 * - **回滚**：`git grep "som-draggable-mark-v1"`
 *
 * ### drag-dnd-v1（2026-07-06）
 * - `browser_drag` 先 synthetic 鼠标/指针拖 + 验证，无效且源元素 `draggable="true"` 时 HTML5 DnD 兜底
 * - 覆盖 Herokuapp drag_and_drop 等原生拖放页；滑块等仍走 synthetic
 * - **回滚**：`git grep "drag-dnd-v1"`
 *
 * ### drag-range-v1（2026-07-06）
 * - `<input type="range">` 不响应 synthetic 鼠标拖；验证失败后按轨道像素位置设 value + input/change
 * - 覆盖 Herokuapp horizontal_slider 等原生滑块
 * - v1.1：range 快路径（跳过 synthetic）、thumb 起点、offsetX 单独可用、onchange 回调、ok=verified
 * - **回滚**：`git grep "drag-range-v1"`
 *
 * ### press-key-unified-v1（2026-07-10）
 * - `browser_press_key`（含旧名 `browser_press_key_index`）统一 pressKeyCore：synthetic + verified → CDP 兜底
 * - 多 frame（`execAllFramesPerFrame` + MAIN world）；Enter 等单键与 Ctrl+H 等组合键同一管线
 * - v1.1：synthetic 仅 keydown/keyup（去掉 keypress）；focus 优先内层 input，不再 click 兜底
 * - v1.2（2026-07-17）：CDP Enter 补 text/unmodifiedText=`\r`；synthetic 补 keyCode/which + Enter/Space 的 keypress；Enter 校验忽略单独的 aria-expanded 假阳性
 * - **回滚**：`git grep "press-key-unified-v1"`
 *
 * ### som-schema-v1（2026-07-11）
 * - SoM elements 短 key（i/tg/tx/fl/sec/st/vl/sd…）+ `somSchema` 字段说明；DOM 推导 fieldLabel/section/state/value/side
 * - **回滚**：`git grep "som-schema-v1"`
 *
 * ### som-focus-conservative-v1（2026-07-11，已下线）
 * - 曾支持 `mode=focused`；现 `browser_screenshot` 仅全屏 tab 截图，区域截图后续单独工具
 * - 辅助模块仍见 `somScreenshotFocus.ts`（供日后复用）
 *
 * ### som-occlusion-filter-v1（2026-07-16）
 * - SoM 标注用 `elementFromPoint` 中心命中过滤被遮罩/弹层盖住的元素，避免模型去点点不到的下层控件
 * - **回滚**：`git grep "som-occlusion-filter-v1"`
 *
 * ### som-btn-class-v1（2026-07-16）
 * - 收录 class 含 btn/button 的 div/span/a（无语义标签的假按钮，如 ok-btn），最多 80 个
 * - **回滚**：`git grep "som-btn-class-v1"`
 *
 * ### type-playwright-fill-v1（2026-09-24）
 * - 曾将 `browser_type` 改为 Playwright 式 CDP `Input.insertText` 优先
 * - **A/B**：现已切回 synthetic nativeSetter 优先、CDP 仅校验失败兜底（便于对比 Flights combobox）
 * - 切回 CDP 优先：搜 `needsinput` / 将普通 input 主路径改回 insertText
 * - **回滚标记**：`git grep "type-playwright-fill-v1"`
 */

import { getContext } from "@/services/Context";
import { isSafariBuild } from "@/utils/safariBuild";
import { writeWorkspaceFile } from "@/services/workspace/workspaceFs";
import { putWorkspaceToolAsset, getWorkspaceToolAsset } from "@/services/workspace/workspaceToolAssetStore";
import {
  execCliCommand,
  fetchCliRunnerHealth,
  revealPathInFileManager,
  runCliShell,
} from "@/services/cliRunner/cliRunnerClient";
import {
  getCliCatalogCommand,
  listCliCatalogCommands,
} from "@/services/cliRunner/cliCatalog";
import { TempDataStore } from "@/services/TempDataStore";
import { VideoPageTools } from "@/services/videoPageTools";
import { getUploadFile } from "./uploadFileStore";
import {
  createSpecAssetId,
  dataUrlToBlob,
  deleteSpecAssetsByConversation,
  putSpecAsset,
} from "./specAssetStore";
import {
  createExtensionAssetId,
  deleteExtensionAssetsByConversation,
  putExtensionAsset,
} from "./extensionAssetStore";
import { generateExtensionIdentity, injectManifestKey, ensureManifestServiceWorker } from "./extensionKey";
import { buildExtensionFenceMarkdown } from "./extensionFence";
import {
  generateDefaultExtensionIcons,
  injectManifestIcons,
  packageHasIconFiles,
} from "./extensionIcon";
import { validateExtensionPackage } from "./extensionPackageValidate";
import {
  injectManifestDisplayTitle,
  injectPopupCreatedByFooter,
  toExtensionDisplayTitle,
  toExtensionPackageSlug,
} from "./extensionDisplayName";
import { deleteContextSpillsByConversation, produceContextSpill, readContextSpillSlice } from "./contextSpillStore";
import {
  appendAgentSessionStore,
  deleteAgentSessionStoresByConversation,
  produceAgentSessionStore,
  putAgentSessionStore,
} from "./agentSessionStore";
import {
  AgentSkillRegistry,
  saveUserSkillFromForm,
  deleteUserSkill,
  getUserSkillForEdit,
} from "./skills/agentSkillRegistry";
import {
  captureSpecViewportDataUrl,
  cropViewportToElement,
  getSelectorRect,
  scrollSelectorIntoView,
} from "./specScreenshot";
import { SOM_ELEMENT_SCHEMA, SOM_SCHEMA_VERSION } from "./somElementsSchema";
import {
  buildErrorOverlayFollowupHint,
  buildOverlayInstruction,
  finalizeBlockingOverlay,
  findBestSuggestOptionIndex,
  logCal,
  logCalOverlaySnapshot,
  overlayMayBecomeSuggest,
  countOverlaySuggestOptions,
  coerceOverlayKindFromElements,
  type BlockingOverlayInfo,
  type CalOverlayRootDebug,
} from "./somOverlay";
import { SOM_SCREENSHOT_PROFILES } from "./somScreenshotFocus";
import {
  isSpreadsheetUpload,
  isTextUpload,
  readTextLinePage,
  normalizeLinePageOptions,
  paginateStoredSpreadsheet,
  csvBlobToStoredSheet,
} from "@/utils/parseUploadFileContent";
import {
  generateConversationId,
  getConversationContext,
  getTabIdByConversationIdFromDisk,
  upsertConversationContext,
  replaceConversationMapsFromPersisted,
  listConversationContexts,
  removeConversationContext,
} from "./conversationContextStore";
import { awaitConversationContextPersistenceReady } from "./conversationContextPersistence";
import {
  resolveSafariMcpResponseTabId,
  safariPanelOpenFlags,
} from "./safariPanelHostTab";
import { normalizePlanQuestionList, type PlanQuestionItem } from "./planQuestionsSession";
import { memoryWrite, type MemoryCategory, type MemorySource } from "./memoryStore";
import { getEditionToolHandlers, getEditionSlashCommands } from "@/services/chat/editionToolHandlers";
import type { ToolHandler } from "@/services/chat/editionToolHandlerTypes";
import { sendToSidePanel } from "@/edition/sendToSidePanel";
import { panelReloadLog } from "@/services/chat/swLogBridge";
import { isJevConfigured, loadJevConfig } from "@/services/chat/jev/jevConfig";
import { jevDecide, type JevChoiceAnswer } from "@/services/chat/jev/jevClient";
import {
  beginToolAbort,
  delayMsAbortable,
  endToolAbort,
  isToolAbortError,
} from "@/services/chat/conversationToolAbort";
import {
  buildJevActDecideRequest,
  buildJevValueDecideRequest,
  buildJevVerifyDecideRequest,
  findSomBrief,
  goalLooksLikeFill,
  inferActFromSomElement,
  JEV_ACT_LOOP_MAX_STEPS,
  JEV_ACT_MIN_P_TARGET,
  parseScreenshotIntent,
  pickValueForSomElement,
  somElementsToCriteria,
} from "@/services/chat/jev/jevSomAdapter";

/** Last SoM snapshot per tab for verify last_change (brief criteria only). */
const jevLastPageByTab = new Map<
  number,
  { url?: string; title?: string; criteria: Record<string, string>; lastAction?: string }
>();

function rememberJevPage(
  tabId: number,
  page: { url?: string; title?: string },
  elements: unknown[],
  lastAction?: string,
) {
  jevLastPageByTab.set(tabId, {
    url: page.url,
    title: page.title,
    criteria: somElementsToCriteria(elements, { max: 80 }),
    lastAction,
  });
}

function buildJevLastChange(tabId: number, page: { url?: string; title?: string }, elements: unknown[]) {
  const prev = jevLastPageByTab.get(tabId);
  if (!prev) return undefined;
  const nextCrit = somElementsToCriteria(elements, { max: 80 });
  delete nextCrit.none;
  const prevCrit = { ...prev.criteria };
  delete prevCrit.none;
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [k, v] of Object.entries(nextCrit)) {
    if (!(k in prevCrit)) added.push(`${k}: ${v}`);
    else if (prevCrit[k] !== v) changed.push(`${k}: ${prevCrit[k]} -> ${v}`);
  }
  for (const [k, v] of Object.entries(prevCrit)) {
    if (!(k in nextCrit)) removed.push(`${k}: ${v}`);
  }
  const d: Record<string, unknown> = {};
  if (prev.url !== page.url) d.url = `${prev.url ?? ""} -> ${page.url ?? ""}`;
  if (added.length) d.added = added.slice(0, 15);
  if (removed.length) d.removed = removed.slice(0, 15);
  if (changed.length) d.changed = changed.slice(0, 15);
  if (prev.lastAction) d.prev_last_action = prev.lastAction;
  return Object.keys(d).length ? d : undefined;
}

/** Parse `box=WxH@L,T` from a stored lastAction brief. */
function parseBoxFromLastAction(
  lastAction?: string,
): { l: number; t: number; w: number; h: number } | null {
  if (!lastAction) return null;
  const m = lastAction.match(/box=(-?\d+)x(-?\d+)@(-?\d+),(-?\d+)/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  const l = Number(m[3]);
  const t = Number(m[4]);
  if (![w, h, l, t].every((n) => Number.isFinite(n)) || w <= 0 || h <= 0) return null;
  return { l, t, w, h };
}

/**
 * Verify-only page text for Jev: dialogs first, then last-click neighborhood,
 * then viewport center, then the rest. Capped (~800 chars).
 */
async function collectVerifyVisibleText(
  tabId: number,
  focus: { l: number; t: number; w: number; h: number } | null,
): Promise<{ dialogs: string[]; visibleText: string }> {
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (focusBox: { l: number; t: number; w: number; h: number } | null) => {
        const MAX = 800;
        const PAD = 140;
        if (!document.body) return { dialogs: [], visibleText: "" };
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const skipHost = (el: Element | null) =>
          !!el?.closest?.("#doma-safari-panel-host");
        const rectOf = (el: Element) => (el as HTMLElement).getBoundingClientRect();
        const inView = (r: DOMRect) =>
          r.width >= 1 &&
          r.height >= 1 &&
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < vh &&
          r.left < vw;
        const shown = (el: Element) => {
          if (skipHost(el)) return false;
          const cs = window.getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
          if (parseFloat(cs.opacity || "1") < 0.08) return false;
          return inView(rectOf(el));
        };
        const clean = (s: string) => s.replace(/\s+/g, " ").trim();

        const dialogs: string[] = [];
        const dialogRoots = Array.from(
          document.querySelectorAll(
            '[role="dialog"],[role="alertdialog"],[aria-modal="true"]',
          ),
        ).filter((el) => shown(el));
        for (const el of dialogRoots.slice(0, 4)) {
          const t = clean((el as HTMLElement).innerText || "").slice(0, 240);
          if (t && !dialogs.includes(t)) dialogs.push(t);
        }

        type Bucket = "dialog" | "near" | "center" | "rest";
        const chunks: Record<Bucket, string[]> = {
          dialog: [...dialogs],
          near: [],
          center: [],
          rest: [],
        };
        const seen = new Set<string>(dialogs);
        const near = focusBox
          ? {
              l: focusBox.l - PAD,
              t: focusBox.t - PAD,
              r: focusBox.l + focusBox.w + PAD,
              b: focusBox.t + focusBox.h + PAD,
            }
          : null;
        const cy0 = vh * 0.22;
        const cy1 = vh * 0.78;

        const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n: Node | null = walker2.nextNode();
        let guard = 0;
        while (n && guard < 4000) {
          guard++;
          const parent = n.parentElement;
          const raw = clean(n.textContent || "");
          n = walker2.nextNode();
          if (!parent || raw.length < 2 || seen.has(raw)) continue;
          if (!shown(parent)) continue;
          if (parent.closest('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')) {
            continue;
          }
          const r = rectOf(parent);
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          let bucket: Bucket = "rest";
          if (
            near &&
            cx >= near.l &&
            cx <= near.r &&
            cy >= near.t &&
            cy <= near.b
          ) {
            bucket = "near";
          } else if (cy >= cy0 && cy <= cy1) {
            bucket = "center";
          }
          seen.add(raw);
          chunks[bucket].push(raw.slice(0, 160));
        }

        let out = "";
        const push = (parts: string[]) => {
          for (const p of parts) {
            if (out.length >= MAX) return;
            const next = out ? `${out} | ${p}` : p;
            out = next.slice(0, MAX);
          }
        };
        push(chunks.dialog);
        push(chunks.near);
        push(chunks.center);
        push(chunks.rest);
        return { dialogs, visibleText: out };
      },
      args: [focus],
    });
    const row = results?.[0]?.result as
      | { dialogs?: string[]; visibleText?: string }
      | undefined;
    return {
      dialogs: Array.isArray(row?.dialogs) ? row!.dialogs!.filter((d) => typeof d === "string") : [],
      visibleText: typeof row?.visibleText === "string" ? row.visibleText : "",
    };
  } catch (e) {
    console.warn("[jev] verify:visible-text-fail", e instanceof Error ? e.message : e);
    return { dialogs: [], visibleText: "" };
  }
}

/* [disabled 2026-06-18] browser_skill_background_browse — see disabledFeatures.record.md
function newThinkId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `think-${crypto.randomUUID()}`
    : `think-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
*/

function getHostFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 根据 URL 判断是否为浏览器内置「新标签页 / 起始页」或空白页（无官方字段，仅启发式）。
 * 用户自定义主页（普通 https）不算在内。
 */
export function isBuiltinNewTabOrStartPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  if (u === "about:blank") return true;
  if (u.startsWith("chrome://new-tab-page")) return true;
  if (u === "chrome://newtab/" || u.startsWith("chrome://newtab?")) return true;
  if (u.startsWith("edge://newtab")) return true;
  if (u.startsWith("brave://new-tab-page")) return true;
  if (u.startsWith("vivaldi://startpage")) return true;
  return false;
}

/** 查询 `tabs.get`：当前或即将加载的地址是否为内置起始页 / 新标签页 / about:blank。 */
export async function isTabStartPage(tabId: number): Promise<boolean> {
  if (!Number.isFinite(tabId) || tabId <= 0) return false;
  const tab = await new Promise<any | undefined>((resolve) => {
    getContext().browser.tabs.get(tabId, (t: any) => {
      if (getContext().browser.runtime.lastError) resolve(undefined);
      else resolve(t);
    });
  });
  if (!tab) return false;
  const pending = typeof tab.pendingUrl === "string" ? tab.pendingUrl : undefined;
  const current = typeof tab.url === "string" ? tab.url : undefined;
  return isBuiltinNewTabOrStartPageUrl(pending) || isBuiltinNewTabOrStartPageUrl(current);
}

/** 将用户输入尽量补全为可导航的绝对 URL；无法补全时返回 `undefined`。 */
function tryResolveNavigationUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const hasWebScheme =
    trimmed.startsWith("http://")
    || trimmed.startsWith("https://")
    || trimmed.startsWith("chrome://");
  if (hasWebScheme) {
    try {
      void new URL(trimmed).href;
      return trimmed;
    } catch {
      return undefined;
    }
  }

  if (trimmed.startsWith("//")) {
    try {
      return new URL(`https:${trimmed}`).href;
    } catch {
      return undefined;
    }
  }

  if (/\s/.test(trimmed)) return undefined;

  if (/^localhost\b/i.test(trimmed)) {
    try {
      return new URL(`http://${trimmed}`).href;
    } catch {
      return undefined;
    }
  }

  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/.test(trimmed)) {
    try {
      return new URL(`http://${trimmed}`).href;
    } catch {
      return undefined;
    }
  }

  if (trimmed.includes(".")) {
    const candidate = `https://${trimmed}`;
    try {
      const u = new URL(candidate);
      const host = u.hostname;
      if (!host || !host.includes(".")) return undefined;
      if (!/^[a-zA-Z0-9.-]+$/i.test(host)) return undefined;
      return candidate;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Safari：iframe 侧栏拿不到可靠 tabId / SW 读 IDB 也不可靠。
 * 直接问页内 panelShell（content），由 whoami 带回宿主 tabId。
 */
async function getTabIdByConversationIdFromSafariShell(
  conversationId: string,
): Promise<number | undefined> {
  const browser = getContext().browser as any;
  const candidates: number[] = [];
  for (const [tid, open] of safariPanelOpenFlags()) {
    if (open === true && typeof tid === "number" && Number.isFinite(tid)) {
      candidates.push(tid);
    }
  }
  const remembered = resolveSafariMcpResponseTabId(null);
  if (typeof remembered === "number" && !candidates.includes(remembered)) {
    candidates.push(remembered);
  }

  const askShell = (tabId: number): Promise<number | undefined> =>
    new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(undefined);
      }, 3000);
      try {
        browser.tabs.sendMessage(
          tabId,
          {
            origin: "background",
            operate: "safariPanel/getHostTabId",
            conversationId,
          },
          (res: { tabId?: number; ok?: boolean } | undefined) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (browser.runtime.lastError) {
              resolve(undefined);
              return;
            }
            const id = res?.tabId;
            resolve(typeof id === "number" && Number.isFinite(id) ? id : undefined);
          },
        );
      } catch {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      }
    });

  for (const tabId of candidates) {
    const got = await askShell(tabId);
    panelReloadLog("sw", "getTabId via panelShell", {
      conversationId,
      candidate: tabId,
      got: got ?? null,
    });
    if (got != null) return got;
    // sendMessage 假失败时，候选本身就是宿主 tab
    panelReloadLog("sw", "getTabId fallback candidate", {
      conversationId,
      tabId,
    });
    return tabId;
  }

  try {
    const tabs = await new Promise<Array<{ id?: number }>>((resolve) => {
      try {
        browser.tabs.query({ active: true, currentWindow: true }, (t: Array<{ id?: number }>) => {
          if (browser.runtime.lastError) resolve([]);
          else resolve(t ?? []);
        });
      } catch {
        resolve([]);
      }
    });
    const activeId = tabs[0]?.id;
    if (typeof activeId === "number" && Number.isFinite(activeId)) {
      const got = await askShell(activeId);
      panelReloadLog("sw", "getTabId via panelShell activeTab", {
        conversationId,
        activeId,
        got: got ?? null,
      });
      if (got != null) return got;
      panelReloadLog("sw", "getTabId fallback activeTabId", {
        conversationId,
        activeId,
      });
      return activeId;
    }
  } catch (e) {
    panelReloadLog("sw", "getTabId safari fail", {
      conversationId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  panelReloadLog("sw", "getTabId safari miss", { conversationId });
  return undefined;
}

/**
 * conversationId → tabId。
 * 优先 storage.local（Chrome/Safari 共享）；miss 时 Chrome 问侧栏，Safari 问 panelShell。
 */
async function getTabIdByConversationId(conversationId: string): Promise<number | undefined> {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return undefined;

  try {
    const fromStorage = await getTabIdByConversationIdFromDisk(id);
    if (fromStorage != null) {
      panelReloadLog("sw", "getTabId via storage", {
        conversationId: id,
        tabId: fromStorage,
      });
      return fromStorage;
    }
  } catch (e) {
    panelReloadLog("sw", "getTabId storage miss/error", {
      conversationId: id,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (isSafariBuild()) {
    return getTabIdByConversationIdFromSafariShell(id);
  }

  try {
    const res = await sendToSidePanel<{ tabId?: number }>({
      operate: "chat/getTabIdByConversationId",
      conversationId: id,
    });
    const tabId = res?.tabId;
    const resolved =
      typeof tabId === "number" && Number.isFinite(tabId) ? tabId : undefined;
    console.log("[browserTools] getTabIdByConversationId sidepanel", {
      conversationId: id,
      tabId: resolved ?? null,
    });
    return resolved;
  } catch (e) {
    console.warn("[browserTools] getTabIdByConversationId failed:", e);
    return undefined;
  }
}

/** 通知侧栏 ChatPanel 从持久化重新加载并刷新会话列表 */
async function refreshConversationsInChatPanel(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await sendToSidePanel<{ ok?: boolean; error?: string }>({
      operate: "chat/refreshConversations",
    });
    if (res?.ok) return { ok: true };
    return { ok: false, error: res?.error || "refresh failed" };
  } catch (e) {
    console.warn("[browserTools] refreshConversationsInChatPanel failed:", e);
    return { ok: false, error: String(e) };
  }
}

/** 通知侧栏删除 chatStorage 消息库 + context usage（不在 SW 引用 chatStorage） */
async function deleteConversationsInChatPanel(
  conversationIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const ids = conversationIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: true };
  try {
    const res = await sendToSidePanel<{ ok?: boolean; error?: string }>({
      operate: "chat/deleteConversations",
      conversationIds: ids,
    });
    if (res?.ok) return { ok: true };
    return { ok: false, error: res?.error || "delete failed" };
  } catch (e) {
    console.warn("[browserTools] deleteConversationsInChatPanel failed:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * 在页面上注入可视化点击指示器（幂等），后续通过 window.__showAgentCursor(x, y, type) 显示
 */
async function ensureClickIndicator(tabId: number): Promise<void> {
  const AGENT_CURSOR_VERSION = 2;
  try {
    await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      world: "MAIN",
      func: (cursorVersion: number) => {
        const win = window as Window & {
          __agentCursorVersion?: number;
          __showAgentCursor?: (x: number, y: number, type?: string) => void;
          __hideAgentCursor?: () => void;
        };

        if ((win.__agentCursorVersion ?? 0) >= cursorVersion && win.__showAgentCursor) return;

        document.getElementById("__agent-cursor")?.remove();
        document.getElementById("__agent-click-ring")?.remove();

        const primary =
          getComputedStyle(document.documentElement).getPropertyValue("--stay-primary").trim()
          || "#2F3134";

        const CURSOR_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" fill="currentColor" stroke="#fff" stroke-width="1.2"/>
        </svg>`;

        const RING_SIZE = 28;

        const cursor = document.createElement("div");
        cursor.id = "__agent-cursor";
        cursor.innerHTML = CURSOR_SVG;
        Object.assign(cursor.style, {
          position: "fixed",
          zIndex: "2147483647",
          pointerEvents: "none",
          color: primary,
          opacity: "0",
          transition: "left 0.12s ease-out, top 0.12s ease-out, opacity 0.2s",
          transform: "translate(-3px, -1px)",
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))",
        } as CSSStyleDeclaration);
        document.documentElement.appendChild(cursor);

        const ring = document.createElement("div");
        ring.id = "__agent-click-ring";
        Object.assign(ring.style, {
          position: "fixed",
          zIndex: "2147483646",
          pointerEvents: "none",
          width: RING_SIZE + "px",
          height: RING_SIZE + "px",
          borderRadius: "50%",
          border: `2px solid ${primary}`,
          opacity: "0",
          transform: "translate(-50%, -50%) scale(0.3)",
          transition: "none",
        } as CSSStyleDeclaration);
        document.documentElement.appendChild(ring);

        win.__showAgentCursor = (x: number, y: number, type: string = "click") => {
          cursor.style.left = x + "px";
          cursor.style.top = y + "px";
          cursor.style.opacity = "1";

          if (type === "click" || type === "longpress") {
            ring.style.transition = "none";
            ring.style.left = x + "px";
            ring.style.top = y + "px";
            ring.style.opacity = "0.9";
            ring.style.transform = "translate(-50%, -50%) scale(0.3)";
            ring.offsetHeight;
            ring.style.transition = "transform 0.4s ease-out, opacity 0.4s ease-out";
            ring.style.transform = "translate(-50%, -50%) scale(1.5)";
            ring.style.opacity = "0";
          }

          if (type === "longpress") {
            cursor.style.transform = "translate(-3px, -1px) scale(0.9)";
          } else if (type === "hover") {
            cursor.style.transform = "translate(-3px, -1px) scale(1)";
          } else {
            setTimeout(() => { cursor.style.opacity = "0.5"; }, 800);
            setTimeout(() => { cursor.style.opacity = "0"; }, 2500);
          }
        };

        win.__hideAgentCursor = () => {
          cursor.style.transform = "translate(-3px, -1px) scale(1)";
          cursor.style.transition = "left 0.12s ease-out, top 0.12s ease-out, opacity 0.25s";
          cursor.style.opacity = "0";
        };

        win.__agentCursorVersion = cursorVersion;
      },
      args: [AGENT_CURSOR_VERSION],
    });
  } catch { /* 注入失败不影响主流程 */ }
}

const BREATHING_BORDER_COLOR = "#00E5FF";
const BREATHING_BORDER_OVERLAY_ID = "__stay-breathing-border";
const BREATHING_BORDER_STYLE_ID = "__stay-breathing-border-style";

/**
 * 向会话绑定 tab 注入 #00E5FF 呼吸灯边框（幂等，内部调用）。
 * visible === false 时移除边框。
 */
async function injectBreathingBorder(conversationId: string, visible = true): Promise<unknown> {
  const tabId = await getTabIdByConversationId(conversationId);
  if (!tabId) return { error: "no tab" };

  if (!visible) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (show: boolean, color: string, overlayId: string, styleId: string) => {
        const removeBreathingBorder = () => {
          document.getElementById(overlayId)?.remove();
          document.getElementById(styleId)?.remove();
        };

        if (!show) {
          removeBreathingBorder();
          return { ok: true, visible: false };
        }

        if (document.getElementById(overlayId)) {
          return { ok: true, visible: true, alreadyExists: true };
        }

        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            @keyframes __stayBreathingBorderPulse {
              0%, 100% {
                opacity: 0.45;
                box-shadow:
                  inset 0 0 0 2px ${color},
                  0 0 10px rgba(0, 229, 255, 0.25);
              }
              50% {
                opacity: 1;
                box-shadow:
                  inset 0 0 0 3px ${color},
                  0 0 28px rgba(0, 229, 255, 0.75);
              }
            }
            #${overlayId} {
              position: fixed;
              inset: 0;
              pointer-events: none;
              z-index: 2147483647;
              box-sizing: border-box;
              animation: __stayBreathingBorderPulse 2.2s ease-in-out infinite;
            }
          `;
          document.documentElement.appendChild(style);
        }

        const overlay = document.createElement("div");
        overlay.id = overlayId;
        document.documentElement.appendChild(overlay);
        return { ok: true, visible: true };
      },
      args: [visible, BREATHING_BORDER_COLOR, BREATHING_BORDER_OVERLAY_ID, BREATHING_BORDER_STYLE_ID],
    });
    return results?.[0]?.result ?? { ok: true, visible };
  } catch (e) {
    return { error: String(e) };
  }
}

const AUTOMATION_TOOL_NAMES = new Set([
  "browser_scroll",
  "browser_screenshot",
  "browser_screenshot_area",
  "browser_click",
  "browser_type",
  "browser_click_index",
  "browser_type_index",
  "browser_wait"
]);

/** 是否为页面自动化类 tool（滚动/截图/按编号点击输入） */
export function automationHandler(method: string): boolean {
  return AUTOMATION_TOOL_NAMES.has(method);
}

// ========== SoM (Set-of-Mark) 元素标注系统 ==========

const SOM_MAX_ELEMENTS = 150;
const SOM_MAX_OVERFLOW_AREAS = 5;

type SomOverflowArea = {
  id: string;
  overflowCount: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type SomAnnotateResult = {
  elements: unknown[];
  areas: SomOverflowArea[];
  /** 主 frame 阻断层；无则 present:false */
  blockingOverlay?: {
    present: boolean;
    kind?: "dialog" | "calendar" | "sheet" | "suggest";
    message?: string;
    isError?: boolean;
    /** 仅诊断，勿回传 LLM */
    calRoots?: CalOverlayRootDebug[];
  };
};

/** 全页截图触顶后留下的 Ax 区域（供 browser_screenshot_area） */
const somOverflowAreasByTab = new Map<number, SomOverflowArea[]>();

function setSomOverflowAreasForTab(tabId: number, areas: SomOverflowArea[]): void {
  if (!areas.length) {
    somOverflowAreasByTab.delete(tabId);
    return;
  }
  somOverflowAreasByTab.set(tabId, areas);
}

function getSomOverflowArea(tabId: number, areaId: string): SomOverflowArea | null {
  const list = somOverflowAreasByTab.get(tabId);
  if (!list?.length) return null;
  const id = areaId.trim().toUpperCase();
  return list.find((a) => a.id.toUpperCase() === id) ?? null;
}

/**
 * 给单个 executeScript 调用加超时保护。
 * 在 12306 等含大量 CSP iframe 的页面上，allFrames:true 的 executeScript 可能永远不 resolve，
 * 此 helper 用 Promise.race 兜底，超时后返回 fallback 值。
 */
function execWithTimeout<T>(scriptCall: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([scriptCall, timer]);
}

/**
 * 在 tab 的所有 frame 中执行 func，每个 frame 单独超时；返回与
 * `chrome.scripting.executeScript({ allFrames: true })` 同形状的数组
 * `[{ frameId, result }]`，但只包含未超时/未抛错的 frame。
 *
 * 与一次性 `allFrames: true` 调用相比的差异：
 *   - 单次调用里某个 CSP 受限或挂起的 iframe 会拖累整体 resolve。
 *   - 这里改为先探测 frameIds，再逐 frame 并发独立执行 + 独立超时；
 *     慢 iframe 直接被丢弃，不影响其他 frame 的结果收集。
 *
 * 调用方仍可像处理 allFrames 数组那样 `find(r => r.result?.ok)`。
 */
async function execAllFramesPerFrame(
  tabId: number,
  scriptDef: {
    func: (...args: any[]) => unknown;
    args?: unknown[];
    world?: "MAIN" | "ISOLATED";
  },
  options?: { perFrameMs?: number; probeMs?: number; maxFrames?: number },
): Promise<Array<{ frameId: number; result: unknown }>> {
  const perFrameMs = options?.perFrameMs ?? 1000;
  const probeMs = options?.probeMs ?? 1500;
  const maxFrames = options?.maxFrames ?? 8;
  const scripting = (getContext().browser.scripting as any);

  let frameIds: number[] = [0];
  try {
    const probe = await execWithTimeout<any>(
      scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => true,
      }),
      probeMs,
      null,
    );
    if (probe && (probe as any[]).length > 0) {
      frameIds = (probe as any[])
        .map((r: any) => r.frameId as number)
        .sort((a: number, b: number) => a - b)
        .slice(0, maxFrames);
    }
  } catch { /* 回退到仅主 frame */ }

  const tasks = frameIds.map((fid) =>
    execWithTimeout<any>(
      scripting.executeScript({
        target: { tabId, frameIds: [fid] },
        func: scriptDef.func,
        ...(scriptDef.args ? { args: scriptDef.args } : {}),
        ...(scriptDef.world ? { world: scriptDef.world } : {}),
      }),
      perFrameMs,
      null,
    ).then(
      (res: any) => {
        if (!res) return null;
        const r = (res as any[])?.[0];
        if (!r) return null;
        return { frameId: typeof r.frameId === "number" ? r.frameId : fid, result: r.result };
      },
      () => null,
    ),
  );

  const settled = await Promise.all(tasks);
  return settled.filter(
    (x): x is { frameId: number; result: unknown } => !!x,
  );
}

/** som-post-composite-v1：回滚时 git grep 此字符串 */
const SOM_POST_COMPOSITE_TAG = "som-post-composite-v1";

type SomOverlayMark = {
  i: number;
  rc: [number, number, number, number];
};

type SomOverlayPayload = {
  elements: SomOverlayMark[];
  areas: Array<{ id: string; left: number; top: number; width: number; height: number }>;
};

function buildSomOverlayPayload(elements: unknown[], areas: SomOverflowArea[]): SomOverlayPayload {
  const marks: SomOverlayMark[] = [];
  for (const raw of elements) {
    const e = raw as Record<string, unknown>;
    const rc = e.rc;
    const i = e.i;
    if (typeof i !== "number" || !Array.isArray(rc) || rc.length < 4) continue;
    const left = Number(rc[0]);
    const top = Number(rc[1]);
    const width = Number(rc[2]);
    const height = Number(rc[3]);
    if (![left, top, width, height].every((n) => Number.isFinite(n))) continue;
    marks.push({ i, rc: [left, top, width, height] });
  }
  return {
    elements: marks,
    areas: areas.map((a) => ({
      id: a.id,
      left: a.left,
      top: a.top,
      width: a.width,
      height: a.height,
    })),
  };
}

/**
 * 收集可交互元素映射（写 data-som-idx），不绘制页面视觉层（som-post-composite-v1）。
 * 编号/边框在截图后由 Canvas 合成。
 * som-overflow-area-v1：超过 SOM_MAX_ELEMENTS 时溢出区域记为 A1/A2…
 * clipRect：仅标注与该矩形相交的元素（browser_screenshot_area）
 */
async function annotateInteractiveElements(
  tabId: number,
  options?: { clipRect?: { left: number; top: number; width: number; height: number } | null },
): Promise<SomAnnotateResult> {
  const clipRect = options?.clipRect ?? null;
  // 标注逻辑：注入到单个 frame 中，从 startIndex 开始编号
  const annotationFunc = (
    startIndex: number,
    clip: { left: number; top: number; width: number; height: number } | null,
    maxElements: number,
    maxAreas: number,
  ) => {
    // 清理旧标注（含历史 DOM 视觉层）
    const old = document.getElementById('__som-container');
    if (old) old.remove();
    document.querySelectorAll('[data-som-idx]').forEach(el => el.removeAttribute('data-som-idx'));
    // som-post-composite-v1: 不再注入视觉层，仅写 data-som-idx + 返回几何

    const SELECTORS = [
      'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
      '[role="option"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
      '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
      '[onclick]', '[data-action]', '[data-click]',
      '[draggable="true"]',
      'summary', 'label[for]', 'details',
      'canvas',
    ];

    const isDragOrClickCursor = (cursor: string) =>
      cursor === 'pointer' || cursor === 'move' || cursor === 'grab' || cursor === 'grabbing';

    const CAPTCHA_CONTAINER_SELECTORS = [
      '[id*="captcha"]', '[class*="captcha"]',
      '[id*="challenge"]', '[class*="challenge"]',
      '[id*="recaptcha"]', '[class*="recaptcha"]',
      '[id*="hcaptcha"]', '[class*="hcaptcha"]',
      '[id*="turnstile"]', '[class*="turnstile"]',
    ];

    const CAPTCHA_BTN_TEXTS = ['按住', '长按', 'hold', 'press', 'slide', '滑动', '拖动', 'drag', 'verify', '验证'];

    const seen = new Set<Element>();
    const captchaEls = new Set<Element>();

    for (const sel of SELECTORS) {
      try { document.querySelectorAll(sel).forEach(el => seen.add(el)); } catch {}
    }

    // 输入建议层：强制收录 listbox 内 option（Google Flights / 选站等），避免只标到开关钮
    try {
      document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]').forEach((el) => {
        const he = el as HTMLElement;
        if (he.getAttribute("aria-hidden") === "true") return;
        const r = he.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        const cs = window.getComputedStyle(he);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) {
          return;
        }
        seen.add(el);
      });
    } catch { /* ignore */ }

    // 验证码处理：深入容器内部寻找真正的交互按钮
    const captchaContainers = new Set<Element>();
    for (const sel of CAPTCHA_CONTAINER_SELECTORS) {
      try { document.querySelectorAll(sel).forEach(c => captchaContainers.add(c)); } catch {}
    }

    for (const ctr of captchaContainers) {
      const allChildren = ctr.querySelectorAll('*');
      for (const child of allChildren) {
        if (seen.has(child)) continue;
        const he = child as HTMLElement;
        const r = he.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) continue;
        const cs = window.getComputedStyle(he);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (isDragOrClickCursor(cs.cursor)) { seen.add(child); captchaEls.add(child); }
      }
      for (const child of allChildren) {
        if (seen.has(child)) continue;
        const he = child as HTMLElement;
        const txt = (he.textContent || '').trim().toLowerCase();
        if (!txt || txt.length > 30) continue;
        if (!CAPTCHA_BTN_TEXTS.some(p => txt.includes(p))) continue;
        const r = he.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) continue;
        const cs = window.getComputedStyle(he);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        seen.add(child); captchaEls.add(child);
      }
      ctr.querySelectorAll('canvas').forEach(cv => {
        if (seen.has(cv)) return;
        const r = cv.getBoundingClientRect();
        if (r.width >= 10 && r.height >= 10) { seen.add(cv); captchaEls.add(cv); }
      });
      const ce = ctr as HTMLElement;
      const cRect = ce.getBoundingClientRect();
      if ((ce.getAttribute('role') === 'button' || ce.getAttribute('tabindex') != null) &&
          cRect.width < 400 && cRect.height < 100 && cRect.width > 10 && cRect.height > 10) {
        if (!seen.has(ctr)) { seen.add(ctr); captchaEls.add(ctr); }
      }
    }

    try {
      document.querySelectorAll('[role="button"][aria-label], [tabindex]:not([tabindex="-1"])').forEach(el => {
        if (seen.has(el)) return;
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const txt = (el.textContent || '').trim().toLowerCase();
        if (CAPTCHA_BTN_TEXTS.some(p => (label + ' ' + txt).includes(p))) {
          seen.add(el); captchaEls.add(el);
        }
      });
    } catch {}

    // 日期选择器 / 日历 / 下拉面板：深入容器找可交互子元素
    const WIDGET_CONTAINER_SELECTORS = [
      '[class*="date-picker"]', '[class*="datepicker"]', '[class*="DatePicker"]',
      '[class*="calendar"]', '[class*="Calendar"]', '[class*="calendar-modal"]',
      '[class*="date-panel"]', '[class*="picker-panel"]', '[class*="picker-dropdown"]',
      '[class*="dropdown-menu"]', '[class*="popover"]',
      '[role="grid"]', '[role="listbox"]', '[role="menu"]', '[role="dialog"]',
    ];
    const DATE_CELL_PATTERNS = ['date-day', 'date-cell', 'day-cell', 'calendar-day', 'picker-day', 'picker-cell'];

    for (const sel of WIDGET_CONTAINER_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(ctr => {
          const children = ctr.querySelectorAll('div, span, td, li, a');
          for (const child of children) {
            if (seen.has(child)) continue;
            const he = child as HTMLElement;
            const cls = (he.className || '').toLowerCase();

            if (cls.includes('disabled') || he.getAttribute('aria-disabled') === 'true') continue;

            const r = he.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.width > 300 || r.height > 200) continue;
            const cs = window.getComputedStyle(he);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;

            if (isDragOrClickCursor(cs.cursor)) { seen.add(child); continue; }

            // 日期格子：即使没有 cursor:pointer，有文本就标注
            const isDateCell = DATE_CELL_PATTERNS.some(p => cls.includes(p));
            if (isDateCell && he.textContent && he.textContent.trim()) {
              seen.add(child);
            }
          }
        });
      } catch {}
    }

    // 补充：带 data-testid 的元素（日期格子或有 cursor:pointer）
    try {
      document.querySelectorAll('[data-testid]').forEach(el => {
        if (seen.has(el)) return;
        const he = el as HTMLElement;
        const cls = (he.className || '').toLowerCase();
        if (cls.includes('disabled')) return;
        const r = he.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.width > 300 || r.height > 200) return;
        const cs = window.getComputedStyle(he);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const testId = he.getAttribute('data-testid') || '';
        if ((testId.includes('date') || testId.includes('day')) && he.textContent && he.textContent.trim()) {
          seen.add(el); return;
        }
        if (isDragOrClickCursor(cs.cursor)) seen.add(el);
      });
    } catch {}

    // cursor:pointer/move/grab 启发式（通用兜底，覆盖无语义属性的可点击/可拖 div/span/li）
    // 限制最多扫描 800 个，避免超大页面（如 12306）全量 getBoundingClientRect reflow 卡住
    try {
      const divSpanLi = Array.from(document.querySelectorAll('div, span, li')).slice(0, 800);
      for (const el of divSpanLi) {
        if (seen.has(el)) continue;
        const he = el as HTMLElement;
        const r = he.getBoundingClientRect();
        if (r.width < 10 || r.height < 10 || r.width > 600 || r.height > 400) continue;
        const cs = window.getComputedStyle(he);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (isDragOrClickCursor(cs.cursor)) {
          const hasAnnotatedChild = Array.from(he.children).some(c => seen.has(c));
          if (!hasAnnotatedChild) seen.add(el);
        }
      }
    } catch {}

    // som-btn-class-v1：class 含 btn/button 的假按钮（如 div.ok-btn），不依赖 cursor/文案
    try {
      const btnLike = document.querySelectorAll(
        'div[class*="btn"], div[class*="button"], span[class*="btn"], span[class*="button"], a[class*="btn"], a[class*="button"]',
      );
      let btnClassAdded = 0;
      const MAX_BTN_CLASS = 80;
      for (const el of Array.from(btnLike)) {
        if (btnClassAdded >= MAX_BTN_CLASS) break;
        if (seen.has(el)) continue;
        const he = el as HTMLElement;
        const r = he.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.width > 600 || r.height > 120) continue;
        const cs = window.getComputedStyle(he);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
        // 优先叶子：已有可交互子节点则跳过外层 wrapper
        if (Array.from(he.children).some((c) => seen.has(c))) continue;
        seen.add(el);
        btnClassAdded++;
      }
    } catch {}

    // 隐藏的 checkbox/radio：标注其可见的父级 label 作为替代
    try {
      document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(el => {
        if (seen.has(el)) {
          const he = el as HTMLElement;
          const r = he.getBoundingClientRect();
          const cs = window.getComputedStyle(he);
          const isHidden = r.width < 4 || r.height < 4
            || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1;
          if (isHidden) {
            seen.delete(el);
            const label = he.closest('label');
            if (label && !seen.has(label)) {
              const lr = label.getBoundingClientRect();
              if (lr.width >= 4 && lr.height >= 4) seen.add(label);
            }
          }
        } else {
          const he = el as HTMLElement;
          const r = he.getBoundingClientRect();
          const cs = window.getComputedStyle(he);
          const isHidden = r.width < 4 || r.height < 4
            || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1;
          if (isHidden) {
            const label = he.closest('label');
            if (label && !seen.has(label)) {
              const lr = label.getBoundingClientRect();
              if (lr.width >= 4 && lr.height >= 4) seen.add(label);
            }
          }
        }
      });
    } catch {}

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const candidates: { el: HTMLElement; rect: DOMRect; isCaptcha: boolean }[] = [];

    // 对 seen 做预筛：优先处理语义化元素，避免超大页面在 BoundingClientRect 阶段耗时太长
    const SEMANTIC_FIRST_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
    const seenArr = Array.from(seen);
    const seenSorted = [
      ...seenArr.filter(e => SEMANTIC_FIRST_TAGS.has((e as HTMLElement).tagName)),
      ...seenArr.filter(e => !SEMANTIC_FIRST_TAGS.has((e as HTMLElement).tagName)),
    ];
    // 最多处理 400 个候选（12306 等密集列表页，超出部分意义不大）
    const MAX_CANDIDATES = 400;
    let processedCount = 0;
    const clipRight = clip ? clip.left + clip.width : 0;
    const clipBottom = clip ? clip.top + clip.height : 0;
    const intersectsClip = (rect: DOMRect): boolean => {
      if (!clip) return true;
      return !(
        rect.right < clip.left
        || rect.left > clipRight
        || rect.bottom < clip.top
        || rect.top > clipBottom
      );
    };
    for (const raw of seenSorted) {
      if (processedCount >= MAX_CANDIDATES) break;
      const el = raw as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (!intersectsClip(rect)) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
      if (rect.bottom < -20 || rect.top > vh + 20 || rect.right < -20 || rect.left > vw + 20) continue;
      candidates.push({ el, rect, isCaptcha: captchaEls.has(el) });
      processedCount++;
    }

    // som-occlusion-filter-v1：中心点被无关上层挡住则不标注（弹窗/遮罩下的按钮等）
    const isOccludedByOverlay = (el: HTMLElement, rect: DOMRect): boolean => {
      const x = Math.min(vw - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(vh - 1, Math.max(0, rect.top + rect.height / 2));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
      let top: Element | null = null;
      try {
        top = document.elementFromPoint(x, y);
      } catch {
        return false;
      }
      if (!top) return true;
      const topEl = top as HTMLElement;
      const id = topEl.id || "";
      if (
        id === "__som-container"
        || id === "__agent-cursor"
        || id === "__agent-click-ring"
        || topEl.closest?.("#__som-container")
      ) {
        return false;
      }
      if (topEl === el || el.contains(topEl)) return false;
      if (topEl.contains(el)) return false;
      return true;
    };

    const hittableCandidates = candidates.filter((c) => !isOccludedByOverlay(c.el, c.rect));

    const getDepth = (el: Element): number => {
      let d = 0; let n: Node | null = el;
      while (n && n !== document.body) { d++; n = n.parentNode; }
      return d;
    };
    hittableCandidates.sort((a, b) => getDepth(b.el) - getDepth(a.el));

    const kept: { el: HTMLElement; rect: DOMRect; isCaptcha: boolean }[] = [];
    for (const c of hittableCandidates) {
      if (c.isCaptcha) { kept.push(c); continue; }
      const dominated = kept.some(k => {
        if (k.isCaptcha) return false;
        const overlapX = Math.max(0, Math.min(c.rect.right, k.rect.right) - Math.max(c.rect.left, k.rect.left));
        const overlapY = Math.max(0, Math.min(c.rect.bottom, k.rect.bottom) - Math.max(c.rect.top, k.rect.top));
        const overlapArea = overlapX * overlapY;
        const cArea = c.rect.width * c.rect.height;
        if (cArea <= 0 || overlapArea / cArea <= 0.85) return false;
        return c.el.contains(k.el);
      });
      if (!dominated) kept.push(c);
    }

    kept.sort((a, b) => {
      const rowA = Math.floor(a.rect.top / 30);
      const rowB = Math.floor(b.rect.top / 30);
      return rowA !== rowB ? rowA - rowB : a.rect.left - b.rect.left;
    });

    // 对 kept 做优先级排序：有 listbox/option 时优先 option；否则语义化 a/button/input 优先
    const SEMANTIC_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
    const isOptionEl = (el: HTMLElement) =>
      (el.getAttribute("role") || "").toLowerCase() === "option";
    let preferSuggestOptions = false;
    try {
      preferSuggestOptions = !!document.querySelector(
        '[role="listbox"] [role="option"], [role="option"][aria-selected]',
      );
    } catch {
      preferSuggestOptions = false;
    }
    const semanticFirst = preferSuggestOptions
      ? [
          ...kept.filter((c) => isOptionEl(c.el)),
          ...kept.filter((c) => !isOptionEl(c.el) && SEMANTIC_TAGS.has(c.el.tagName)),
          ...kept.filter((c) => !isOptionEl(c.el) && !SEMANTIC_TAGS.has(c.el.tagName)),
        ]
      : [
          ...kept.filter((c) => SEMANTIC_TAGS.has(c.el.tagName)),
          ...kept.filter((c) => !SEMANTIC_TAGS.has(c.el.tagName)),
    ];
    const items = semanticFirst.slice(0, maxElements);
    // Ax 不用「排名 150 之后」：那些常是已标行里的兄弟节点（日期/内层 span），
    // 会错误画在已有 1–150 的区域上。改为：主内容区已标下沿以下、尚未覆盖的可见可交互。
    const overflow: typeof kept = [];
    if (!clip && items.length >= maxElements) {
      const markedEls = new Set(items.map((c) => c.el));
      const sidebarCutoff = Math.min(220, vw * 0.22);
      const mainMarks = items.filter((c) => c.rect.left + c.rect.width / 2 >= sidebarCutoff);
      const markedBottom = Math.max(
        0,
        ...(mainMarks.length ? mainMarks : items).map((c) => c.rect.bottom),
      );
      const bandTop = markedBottom - 4;

      const rectsOverlapHeavy = (a: DOMRect, b: DOMRect): boolean => {
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlap = ox * oy;
        const area = a.width * a.height;
        return area > 0 && overlap / area >= 0.45;
      };
      const coveredByMarked = (rect: DOMRect): boolean => {
        if (rect.bottom <= bandTop) return true;
        for (const m of items) {
          if (rectsOverlapHeavy(rect, m.rect)) return true;
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          if (
            cx >= m.rect.left
            && cx <= m.rect.right
            && cy >= m.rect.top
            && cy <= m.rect.bottom
          ) {
            return true;
          }
        }
        return false;
      };

      const tryAdd = (el: HTMLElement, rect: DOMRect) => {
        if (markedEls.has(el)) return;
        if (rect.width < 4 || rect.height < 4) return;
        if (rect.top < bandTop) return;
        if (rect.bottom < -20 || rect.top > vh + 20 || rect.right < -20 || rect.left > vw + 20) return;
        if (rect.left + rect.width / 2 < sidebarCutoff) return; // 跳过侧栏
        if (coveredByMarked(rect)) return;
        const cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) return;
        overflow.push({ el, rect, isCaptcha: captchaEls.has(el) });
        markedEls.add(el); // 防重复
      };

      for (const c of kept) tryAdd(c.el, c.rect);
      // kept 可能因 MAX_CANDIDATES 截断未含列表底部：再扫一遍 seen
      for (const raw of seenArr) {
        const el = raw as HTMLElement;
        if (markedEls.has(el)) continue;
        tryAdd(el, el.getBoundingClientRect());
      }
    }

    const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n) : s;

    const getFieldLabel = (el: HTMLElement): string => {
      const id = el.id;
      if (id) {
        try {
          const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (lbl?.textContent) return trunc(lbl.textContent.trim(), 50);
        } catch {
          const lbl = document.querySelector(`label[for="${id}"]`);
          if (lbl?.textContent) return trunc(lbl.textContent.trim(), 50);
        }
      }
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const parts = labelledBy.split(/\s+/).map((lid) => {
          const n = document.getElementById(lid);
          return n?.textContent?.trim() || '';
        }).filter(Boolean);
        if (parts.length) return trunc(parts.join(' '), 50);
      }
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel !== el) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input,select,textarea,button').forEach((c) => c.remove());
        const t = (clone.textContent || '').trim();
        if (t) return trunc(t, 50);
      }
      return '';
    };

    const pickHeadingText = (n: Element): string => {
      const tag = n.tagName;
      if (/^H[1-6]$/.test(tag)) return (n.textContent || '').trim();
      if (tag === 'LEGEND') return (n.textContent || '').trim();
      const al = n.getAttribute('aria-label');
      if (al && (tag === 'SECTION' || n.getAttribute('role') === 'region')) return al.trim();
      return '';
    };

    const getSection = (el: HTMLElement): string => {
      let node: Element | null = el.parentElement;
      while (node && node !== document.body) {
        if (node.tagName === 'FIELDSET') {
          const leg = node.querySelector(':scope > legend') || node.querySelector('legend');
          if (leg?.textContent) return trunc(leg.textContent.trim(), 40);
        }
        const h = pickHeadingText(node);
        if (h) return trunc(h, 40);
        let sib: Element | null = node.previousElementSibling;
        while (sib) {
          const t = pickHeadingText(sib);
          if (t) return trunc(t, 40);
          const inner = sib.querySelector('h1,h2,h3,h4,h5,h6,legend');
          if (inner?.textContent) return trunc(inner.textContent.trim(), 40);
          sib = sib.previousElementSibling;
        }
        node = node.parentElement;
      }
      return '';
    };

    const getState = (el: HTMLElement): string => {
      const parts: string[] = [];
      const inp = el as HTMLInputElement;
      if (inp.disabled || el.getAttribute('aria-disabled') === 'true') parts.push('disabled');
      if (inp.readOnly || el.getAttribute('aria-readonly') === 'true' || el.hasAttribute('readonly')) {
        parts.push('readonly');
      }
      if (el.tagName === 'INPUT' && (inp.type === 'checkbox' || inp.type === 'radio') && inp.checked) {
        parts.push('checked');
      }
      const exp = el.getAttribute('aria-expanded');
      if (exp === 'true') parts.push('expanded');
      else if (exp === 'false') parts.push('collapsed');
      return parts.join(',');
    };

    const getValue = (el: HTMLElement): string => {
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const v = (el as HTMLInputElement).value;
        if (v) return trunc(v, 40);
      }
      if (tag === 'SELECT') {
        const sel = el as HTMLSelectElement;
        const opt = sel.options[sel.selectedIndex];
        if (opt) return trunc((opt.text || opt.value).trim(), 40);
      }
      return '';
    };

    const getSide = (rect: DOMRect, viewW: number): string => {
      const cx = rect.left + rect.width / 2;
      const third = viewW / 3;
      if (cx < third) return 'left';
      if (cx > third * 2) return 'right';
      return 'center';
    };

    const mapping: unknown[] = [];

    // ----- 阻断层：dialog / 日历 / 输入建议 listbox（供 [overlay]/[dismiss]） -----
    // Flights 等：外层 role=dialog，内层 listbox+option → kind 必须以内容为准（suggest）
    type OverlayKind = "dialog" | "calendar" | "sheet" | "suggest";
    const overlayKindRank = (k: OverlayKind) =>
      k === "suggest" ? 0 : k === "calendar" ? 1 : k === "sheet" ? 2 : 3;
    const preferOverlayKind = (a: OverlayKind, b: OverlayKind): OverlayKind =>
      overlayKindRank(a) <= overlayKindRank(b) ? a : b;
    /** 以外壳 role 为初值，再用内部 listbox/option/grid 纠正（内层内容优先） */
    const classifyOverlayKind = (he: HTMLElement): OverlayKind => {
      const role = (he.getAttribute("role") || "").toLowerCase();
      const cls = `${he.className || ""} ${role}`.toLowerCase();
      if (role === "listbox") return "suggest";
      let kind: OverlayKind = "dialog";
      if (/date|calendar|picker|时间/.test(cls) && !/listbox/.test(cls)) kind = "calendar";
      else if (/drawer|sheet|bottom/.test(cls)) kind = "sheet";
      try {
        const hasListbox =
          role === "listbox" || !!he.querySelector('[role="listbox"]');
        const optCount = he.querySelectorAll('[role="option"]').length;
        const gridCellCount = he.querySelectorAll(
          '[role="gridcell"],td[data-date],[data-date],.day,.date-cell,[class*="calendar-day"],[class*="picker-cell"]',
        ).length;
        const hasGrid =
          gridCellCount > 0 ||
          !!he.querySelector(
            '[role="grid"],[class*="calendar"],[class*="datepicker"],[class*="date-picker"]',
          );
        // 日历优先：密日期格时不要被空 listbox 标成 suggest
        if (gridCellCount >= 8 || (hasGrid && optCount === 0 && kind === "calendar")) {
          return "calendar";
        }
        if (hasListbox || optCount >= 1) return "suggest";
        if (hasGrid || gridCellCount >= 8) return "calendar";
      } catch {
        /* ignore */
      }
      return kind;
    };

    const overlayRoots: { el: HTMLElement; kind: OverlayKind }[] = [];
    /** 页内 → SW：为何没进 overlayRoots（日历误杀诊断） */
    const overlayScanSkipped: Array<Record<string, unknown>> = [];
    const overlayScanKept: Array<Record<string, unknown>> = [];
    let overlayScanCandidateCount = 0;
    const pushSkip = (he: HTMLElement, reason: string, extra?: Record<string, unknown>) => {
      if (overlayScanSkipped.length >= 16) return;
      const r = he.getBoundingClientRect();
      const cs = window.getComputedStyle(he);
      overlayScanSkipped.push({
        reason,
        role: (he.getAttribute("role") || "").slice(0, 24),
        tag: he.tagName.toLowerCase(),
        cls: String(he.className || "").slice(0, 80),
        rect: {
          l: Math.round(r.left),
          t: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
          b: Math.round(r.bottom),
          r: Math.round(r.right),
        },
        z: parseInt(cs.zIndex || "0", 10) || 0,
        position: cs.position,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        vw,
        vh,
        ...(extra || {}),
      });
    };

    /** 自身 + 祖先：display:none / 累计 opacity；visibility 只看自身（子可见可盖过父 hidden） */
    const isEffectivelyHidden = (el: HTMLElement): { hidden: boolean; why?: string } => {
      const own = window.getComputedStyle(el);
      if (own.visibility === "hidden") return { hidden: true, why: "visibility" };
      let opacity = 1;
      let e: HTMLElement | null = el;
      while (e) {
        const cs = window.getComputedStyle(e);
        if (cs.display === "none") return { hidden: true, why: "display" };
        opacity *= parseFloat(cs.opacity || "1");
        if (opacity < 0.1) return { hidden: true, why: "opacity" };
        e = e.parentElement;
      }
      return { hidden: false };
    };

    const inViewport = (r: DOMRect): boolean =>
      !(r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw);

    const looksOverlaySurface = (el: HTMLElement): boolean => {
      const role = (el.getAttribute("role") || "").toLowerCase();
      if (role === "listbox" || role === "grid" || role === "dialog" || role === "alertdialog") {
        return true;
      }
      try {
        if (el.querySelectorAll('[role="option"]').length >= 1) return true;
        if (
          el.querySelectorAll(
            '[role="gridcell"],td[data-date],[data-date],[class*="calendar-day"],[class*="picker-cell"]',
          ).length >= 8
        ) {
          return true;
        }
        if (
          el.querySelector(
            '[role="grid"],[role="listbox"],[class*="calendar"],[class*="datepicker"],[class*="date-picker"]',
          )
        ) {
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    };

    /**
     * 壳被判 css-hidden / too-small 时：若内层有「可见且够大」的 grid/listbox/日历面，改用内层。
     * Flights 等常见：外层 dialog 0×0 / visibility:hidden，内层日历仍可见。
     */
    const rescueVisibleOverlaySurface = (
      shell: HTMLElement,
    ): { el: HTMLElement; via: string } | null => {
      const shellHidden = isEffectivelyHidden(shell);
      // display:none / 祖先 opacity≈0：子树不可见，别救
      if (shellHidden.hidden && (shellHidden.why === "display" || shellHidden.why === "opacity")) {
        return null;
      }
      const sels = [
        '[role="listbox"]',
        '[role="grid"]',
        '[role="dialog"]',
        '[class*="calendar"]',
        '[class*="datepicker"]',
        '[class*="DatePicker"]',
        '[class*="date-picker"]',
        '[class*="picker-panel"]',
      ];
      let best: { el: HTMLElement; area: number; via: string } | null = null;
      try {
        for (const sel of sels) {
          for (const raw of Array.from(shell.querySelectorAll(sel))) {
            const el = raw as HTMLElement;
            if (el === shell) continue;
            if (isEffectivelyHidden(el).hidden) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 40 || r.height < 40) continue;
            if (!inViewport(r)) continue;
            if (!looksOverlaySurface(el)) continue;
            const area = r.width * r.height;
            if (!best || area > best.area) {
              best = { el, area, via: `rescue:${sel}` };
            }
          }
        }
        // 无匹配选择器时：扫直接可见大子节点（仍要求日历/建议信号）
        if (!best) {
          for (const raw of Array.from(shell.children)) {
            const el = raw as HTMLElement;
            if (!el || el.nodeType !== 1) continue;
            if (isEffectivelyHidden(el).hidden) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 80 || r.height < 80) continue;
            if (!inViewport(r)) continue;
            if (!looksOverlaySurface(el) && !looksOverlaySurface(shell)) continue;
            const area = r.width * r.height;
            if (!best || area > best.area) {
              best = { el, area, via: "rescue:child" };
            }
          }
        }
      } catch {
        return null;
      }
      return best ? { el: best.el, via: best.via } : null;
    };

    try {
      const rootSel = [
        '[role="listbox"]',
        '[role="grid"]',
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[aria-modal="true"]',
        '[class*="datepicker"]',
        '[class*="DatePicker"]',
        '[class*="date-picker"]',
        '[class*="calendarModal"]',
        '[class*="calendar-modal"]',
        '[class*="picker-panel"]',
        '[class*="PickerPanel"]',
        '[class*="ant-picker-dropdown"]',
        '[class*="el-picker-panel"]',
        '[class*="el-dialog"]',
        '[class*="ant-modal"]',
        '[class*="MuiModal"]',
        '[class*="modal-dialog"]',
        '[class*="popup-container"]',
      ].join(",");
      const seenRoots = new Set<HTMLElement>();
      const candidates = Array.from(document.querySelectorAll(rootSel));
      overlayScanCandidateCount = candidates.length;
      for (const raw of candidates) {
        let he = raw as HTMLElement;
        if (seenRoots.has(he)) continue;
        let r = he.getBoundingClientRect();
        let cs = window.getComputedStyle(he);
        let rescuedVia: string | null = null;

        const hidden = isEffectivelyHidden(he);
        const tooSmall = r.width < 40 || r.height < 40;
        if (hidden.hidden || tooSmall) {
          const rescued = rescueVisibleOverlaySurface(he);
          if (rescued) {
            he = rescued.el;
            rescuedVia = rescued.via;
            r = he.getBoundingClientRect();
            cs = window.getComputedStyle(he);
            if (seenRoots.has(he)) continue;
          } else {
            pushSkip(he, hidden.hidden ? "css-hidden" : "too-small", {
              hiddenWhy: hidden.why ?? null,
            });
            continue;
          }
        }
        if (!inViewport(r)) {
          pushSkip(he, "off-viewport", rescuedVia ? { rescuedVia } : undefined);
          continue;
        }
        // 跳过几乎整页的静态壳，优先真正浮层（面积或居中/高 z）
        const area = r.width * r.height;
        const viewArea = Math.max(1, vw * vh);
        const z = parseInt(cs.zIndex || "0", 10) || 0;
        const elevated = z >= 10 || cs.position === "fixed" || cs.position === "absolute";
        const role = (he.getAttribute("role") || "").toLowerCase();
        // listbox / 日历 grid 常是 absolute 且 z 一般；未 elevated 也允许
        const skipElevateGate = role === "listbox" || role === "grid";
        if (!skipElevateGate) {
          if (!elevated && area / viewArea > 0.85) {
            pushSkip(he, "not-elevated-fullpage", {
              elevated,
              areaRatio: Math.round((area / viewArea) * 100) / 100,
            });
            continue;
          }
          if (!elevated && area < 80 * 80) {
            pushSkip(he, "not-elevated-tiny", { elevated, area: Math.round(area) });
            continue;
          }
        }
        // 裸 role=grid：必须像日期格，避免普通数据表
        if (role === "grid") {
          const gridCells = he.querySelectorAll(
            '[role="gridcell"],td[data-date],[data-date]',
          ).length;
          const calish =
            gridCells >= 8 ||
            /date|calendar|picker|月|日/.test(
              `${he.className || ""} ${he.getAttribute("aria-label") || ""}`,
            );
          if (!calish) {
            pushSkip(he, "grid-not-calendar", { gridCells });
            continue;
          }
        }
        const kind = classifyOverlayKind(he);
        // 去重嵌套：保留外层 DOM，但 kind 取「更具体」的一方，并按最终根节点内容再纠正
        let nested = false;
        for (const o of overlayRoots) {
          if (o.el.contains(he)) {
            // 内层被吞：用内层 kind + 父节点内容升级父 kind（避免 dialog 钉死）
            o.kind = preferOverlayKind(o.kind, kind);
            o.kind = preferOverlayKind(o.kind, classifyOverlayKind(o.el));
            nested = true;
            break;
          }
          if (he.contains(o.el)) {
            const prevKind = o.kind;
            o.el = he;
            o.kind = preferOverlayKind(preferOverlayKind(prevKind, kind), classifyOverlayKind(he));
            nested = true;
            break;
          }
        }
        if (!nested) {
          overlayRoots.push({ el: he, kind });
          seenRoots.add(he);
          if (overlayScanKept.length < 8) {
            overlayScanKept.push({
              kind,
              role,
              tag: he.tagName.toLowerCase(),
              cls: String(he.className || "").slice(0, 80),
              rect: {
                l: Math.round(r.left),
                t: Math.round(r.top),
                w: Math.round(r.width),
                h: Math.round(r.height),
              },
              z,
              position: cs.position,
              elevated,
              ...(rescuedVia ? { rescuedVia } : {}),
            });
          }
        }
      }
      // 合并结束后再扫一遍内容，防止「先 dialog、后挂 listbox」仍停在 dialog
      for (const o of overlayRoots) {
        o.kind = preferOverlayKind(o.kind, classifyOverlayKind(o.el));
      }
      // 同时有 dialog 与 listbox 时，优先 suggest；但日历优先于空 suggest
      overlayRoots.sort((a, b) => {
        if (a.kind === "calendar" && b.kind === "suggest") return -1;
        if (a.kind === "suggest" && b.kind === "calendar") return 1;
        return overlayKindRank(a.kind) - overlayKindRank(b.kind);
      });
    } catch { /* ignore */ }

    const skipReasonCounts: Record<string, number> = {};
    for (const s of overlayScanSkipped) {
      const r = String((s as { reason?: string }).reason || "?");
      skipReasonCounts[r] = (skipReasonCounts[r] || 0) + 1;
    }
    const keptBrief = overlayScanKept
      .map((k) => {
        const rr = k.rect as { w?: number; h?: number } | undefined;
        return `${k.kind}/${k.role || k.tag}/w${rr?.w ?? 0}h${rr?.h ?? 0}${k.rescuedVia ? `/${k.rescuedVia}` : ""}`;
      })
      .join(";");
    const skippedBrief = overlayScanSkipped
      .slice(0, 10)
      .map((s) => {
        const rr = s.rect as { w?: number; h?: number } | undefined;
        return `${s.reason}:${s.role || s.tag}:w${rr?.w ?? 0}h${rr?.h ?? 0}:d${s.display}:v${s.visibility}:op${s.opacity}${s.hiddenWhy ? `:hw${s.hiddenWhy}` : ""}`;
      })
      .join("|");
    const overlayScanLine =
      `candidates=${overlayScanCandidateCount} kept=${overlayRoots.length}` +
      ` skipReasons=${JSON.stringify(skipReasonCounts)}` +
      ` keptDetail=${keptBrief || "-"}` +
      ` skippedDetail=${skippedBrief || "-"}`;
    const overlayScan = {
      candidateCount: overlayScanCandidateCount,
      keptCount: overlayRoots.length,
      kept: overlayScanKept,
      skipped: overlayScanSkipped,
      skipReasonCounts,
      line: overlayScanLine,
    };

    const primaryOverlay = overlayRoots[0];
    const isInOverlay = (el: HTMLElement): boolean =>
      overlayRoots.some((o) => o.el === el || o.el.contains(el));

    const looksDismiss = (el: HTMLElement): boolean => {
      const blob = [
        el.getAttribute("aria-label") || "",
        el.getAttribute("title") || "",
        el.getAttribute("class") || "",
        el.id || "",
        (el.textContent || "").trim().slice(0, 40),
      ]
        .join(" ")
        .toLowerCase();
      if (
        /关闭|取消|知道了|跳过|确定|好的|dismiss|close|cancel|confirm|ok|got it|×|✕|✖|关闭按钮/.test(
          blob,
        )
      ) {
        return true;
      }
      if (/icon-close|btn-close|modal-close|dialog-close|picker-close/.test(blob)) {
        return true;
      }
      // 仅含关闭符的短按钮
      const t = (el.textContent || "").trim();
      if (t.length <= 2 && /[×✕✖xX]/.test(t)) return true;
      return false;
    };

    const extractOverlayMessage = (root: HTMLElement): { message: string; isError: boolean } => {
      const role = (root.getAttribute("role") || "").toLowerCase();
      // 以内层 listbox/option 为准（外壳 dialog 也走这条）
      const listbox =
        role === "listbox"
          ? root
          : (root.querySelector('[role="listbox"]') as HTMLElement | null);
      const optionRoot = listbox || root;
      const opts = Array.from(optionRoot.querySelectorAll('[role="option"]'))
        .slice(0, 6)
        .map((o) => (o.getAttribute("aria-label") || o.textContent || "").trim())
        .filter(Boolean);
      if (listbox || opts.length >= 1) {
        const message = (
          opts.length
            ? `suggestion listbox: ${opts.join(" | ")}`
            : "suggestion listbox"
        ).slice(0, 240);
        return { message, isError: false };
      }
      let raw = "";
      try {
        raw = (root.innerText || root.textContent || "").replace(/\s+/g, " ").trim();
      } catch {
        raw = "";
      }
      // 去掉纯按钮文案尾噪声，保留提示主体
      const message = raw
        .replace(/(确定|取消|关闭|好的|OK|Confirm|Cancel)\s*$/gi, "")
        .trim()
        .slice(0, 240);
      const cls = String(root.className || "").toLowerCase();
      const isError =
        role === "alertdialog" ||
        /错误|失败|未选择|请选择|请填写|请输入|必填|error|alert|invalid|warning/.test(message) ||
        /error|alert|warn|message-box|msgbox/.test(cls);
      return { message, isError };
    };

    items.forEach(({ el, rect, isCaptcha }, i) => {
      const idx = startIndex + i;
      el.setAttribute('data-som-idx', String(idx));

      const text = (el.textContent || '').trim();
      const entry: Record<string, unknown> = { i: idx, tg: el.tagName.toLowerCase() };
      if (text) entry.tx = trunc(text, 50);
      if (el.id) entry.id = el.id;
      if (el.getAttribute('role')) entry.rl = el.getAttribute('role');
      if (el.getAttribute('type')) entry.tp = el.getAttribute('type');
      // HTML name — radio group identity (same name => mutually exclusive)
      const nm =
        (el as HTMLInputElement).name ||
        el.getAttribute('name') ||
        '';
      if (nm) entry.nm = String(nm).slice(0, 80);
      if (el.getAttribute('placeholder')) entry.ph = el.getAttribute('placeholder');
      if (el.getAttribute('aria-label')) entry.al = el.getAttribute('aria-label');
      if (el.getAttribute('title')) entry.tt = el.getAttribute('title');
      const fl = getFieldLabel(el);
      if (fl) entry.fl = fl;
      const sec = getSection(el);
      if (sec) entry.sec = sec;
      const st = getState(el);
      if (st) entry.st = st;
      const vl = getValue(el);
      if (vl) entry.vl = vl;
      entry.sd = getSide(rect, vw);
      entry.rc = [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      ];
      if (isCaptcha) {
        entry.cp = true;
        entry.ht = 'use browser_long_press({ index }) to hold this element';
      }
      if (el.getAttribute('draggable') === 'true') {
        entry.dr = true;
        if (!entry.ht) entry.ht = 'use browser_drag({ fromIndex }) to drag this element';
      }
      if ((el as HTMLAnchorElement).href) entry.hf = (el as HTMLAnchorElement).href.slice(0, 100);
      if (primaryOverlay && isInOverlay(el)) {
        entry.ov = true;
        if (looksDismiss(el)) entry.ds = true;
      }
      mapping.push(entry);
    });

    // som-overflow-area-v1：触顶后将剩余可见可交互聚成 A1/A2…
    const areas: Array<{
      id: string;
      overflowCount: number;
      left: number;
      top: number;
      width: number;
      height: number;
    }> = [];

    if (overflow.length > 0 && maxAreas > 0) {
      type Band = { members: typeof overflow; top: number; bottom: number; left: number; right: number };
      const sortedOv = [...overflow].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
      const bands: Band[] = [];
      const GAP = 100;
      for (const c of sortedOv) {
        const last = bands[bands.length - 1];
        if (!last || c.rect.top > last.bottom + GAP) {
          bands.push({
            members: [c],
            top: c.rect.top,
            bottom: c.rect.bottom,
            left: c.rect.left,
            right: c.rect.right,
          });
        } else {
          last.members.push(c);
          last.top = Math.min(last.top, c.rect.top);
          last.bottom = Math.max(last.bottom, c.rect.bottom);
          last.left = Math.min(last.left, c.rect.left);
          last.right = Math.max(last.right, c.rect.right);
        }
      }

      // 合并过碎的 band，最多 maxAreas 个
      while (bands.length > maxAreas) {
        let bestI = 0;
        let bestGap = Infinity;
        for (let i = 0; i < bands.length - 1; i++) {
          const gap = bands[i + 1]!.top - bands[i]!.bottom;
          if (gap < bestGap) {
            bestGap = gap;
            bestI = i;
          }
        }
        const a = bands[bestI]!;
        const b = bands[bestI + 1]!;
        a.members.push(...b.members);
        a.bottom = Math.max(a.bottom, b.bottom);
        a.left = Math.min(a.left, b.left);
        a.right = Math.max(a.right, b.right);
        bands.splice(bestI + 1, 1);
      }

      const sidebarCutoff = Math.min(220, vw * 0.22);
      bands.forEach((band, bi) => {
        if (band.members.length === 0) return;
        const pad = 6;
        const left = Math.max(sidebarCutoff, Math.round(band.left) - pad);
        const top = Math.max(0, Math.round(band.top) - pad);
        let right = Math.min(vw, Math.round(band.right) + pad);
        let bottom = Math.min(vh, Math.round(band.bottom) + pad);
        // 最后一块延伸到视口底部，盖住整段未编号列表
        if (bi === bands.length - 1) {
          bottom = Math.max(bottom, vh - 8);
          right = Math.max(right, vw - 8);
        }
        const width = Math.max(8, right - left);
        const height = Math.max(8, bottom - top);
        const id = `A${bi + 1}`;

        areas.push({
          id,
          overflowCount: band.members.length,
          left,
          top,
          width,
          height,
        });
      });
    } else if (
      !clip
      && maxAreas > 0
      && items.length >= maxElements
    ) {
      // 触顶但下方扫不到节点时：仍记一块「已标下沿 → 视口底」的 Ax，便于 screenshot_area
      const sidebarCutoff = Math.min(220, vw * 0.22);
      const mainMarks = items.filter((c) => c.rect.left + c.rect.width / 2 >= sidebarCutoff);
      const markedBottom = Math.max(
        0,
        ...(mainMarks.length ? mainMarks : items).map((c) => c.rect.bottom),
      );
      const top = Math.min(vh - 40, Math.round(markedBottom));
      const left = Math.round(sidebarCutoff);
      const width = Math.max(80, vw - left - 8);
      const height = Math.max(0, vh - top - 8);
      if (height > 60) {
        areas.push({ id: "A1", overflowCount: 0, left, top, width, height });
      }
    }

    return {
      elements: mapping,
      areas,
      overlayScan,
      blockingOverlay: primaryOverlay
        ? (() => {
            const { message, isError } = extractOverlayMessage(primaryOverlay.el);
            return {
              present: true as const,
              kind: primaryOverlay.kind,
              ...(message ? { message } : {}),
              ...(isError ? { isError: true } : {}),
              calRoots: overlayRoots.slice(0, 4).map((o) => {
                const r = o.el.getBoundingClientRect();
                const cs = window.getComputedStyle(o.el);
                let dateCellApprox = 0;
                try {
                  dateCellApprox = o.el.querySelectorAll(
                    '[role="gridcell"],td[data-date],[data-date],.day,.date-cell,[class*="day"],[class*="date-cell"],[class*="picker-cell"],[class*="calendar-day"]',
                  ).length;
                } catch {
                  dateCellApprox = -1;
                }
                return {
                  kind: o.kind,
                  tag: o.el.tagName.toLowerCase(),
                  role: o.el.getAttribute("role") || "",
                  cls: String(o.el.className || "").slice(0, 140),
                  z: parseInt(cs.zIndex || "0", 10) || 0,
                  w: Math.round(r.width),
                  h: Math.round(r.height),
                  dateCellApprox,
                };
              }),
            };
          })()
        : { present: false },
    };
  };

  try {
    /**
     * 只标主 frame。
     * 百度等站 allFrames probe / 多 iframe 注入：单帧 executeScript 超时后 Chrome 仍占用
     * 该 tab 的 scripting 队列，后续 compressImageInTab 会被拖到数十秒（看起来像 withLabels 很慢）。
     */
    const frameIds: number[] = [0];

    let startIdx = 1;
    const allMappings: unknown[] = [];
    let allAreas: SomOverflowArea[] = [];
    let blockingOverlay: SomAnnotateResult["blockingOverlay"] = { present: false };

    for (const fid of frameIds) {
      try {
        const results = await execWithTimeout(
          (getContext().browser.scripting as any).executeScript({
            target: { tabId, frameIds: [fid] },
            func: annotationFunc,
            args: [
              startIdx,
              fid === 0 ? clipRect : null,
              SOM_MAX_ELEMENTS,
              fid === 0 && !clipRect ? SOM_MAX_OVERFLOW_AREAS : 0,
            ],
          }),
          3500,
          null,
        );
        const raw = (results as any)?.[0]?.result;
        const mapping = (Array.isArray(raw)
          ? raw
          : (raw?.elements ?? [])) as unknown[];
        const frameAreas = (!Array.isArray(raw) && Array.isArray(raw?.areas)
          ? raw.areas
          : []) as SomOverflowArea[];
        allMappings.push(...mapping);
        if (fid === 0 && frameAreas.length) allAreas = frameAreas;
        if (fid === 0 && raw && !Array.isArray(raw) && raw.blockingOverlay) {
          blockingOverlay = raw.blockingOverlay;
        }
        if (fid === 0 && raw && !Array.isArray(raw) && raw.overlayScan) {
          const scan = raw.overlayScan as { line?: string };
          console.log(
            "[jev] overlay-scan " +
              (typeof scan.line === "string" && scan.line
                ? scan.line
                : `candidates=${(raw.overlayScan as { candidateCount?: number }).candidateCount ?? "?"} kept=${(raw.overlayScan as { keptCount?: number }).keptCount ?? "?"}`),
          );
        }
        startIdx += mapping.length;
      } catch {
        // frame 注入失败（可能被 CSP 阻止），跳过
      }
    }

    if (!clipRect) {
      setSomOverflowAreasForTab(tabId, allAreas);
    }

    return {
      elements: allMappings,
      areas: clipRect ? [] : allAreas,
      blockingOverlay,
    };
  } catch (e) {
    console.error('[SoM] annotate failed:', e);
    return { elements: [], areas: [], blockingOverlay: { present: false } };
  }
}

/**
 * 移除历史 SoM DOM 视觉层（som-post-composite-v1 后正常路径不再创建；保留 data-som-idx）
 */
async function removeAnnotationVisuals(tabId: number): Promise<void> {
  try {
    await Promise.race([
      (getContext().browser.scripting as any).executeScript({
        target: { tabId, allFrames: false }, // 只清主 frame，避免 CSP iframe 导致 executeScript 永久挂起
        func: () => {
          const c = document.getElementById('__som-container');
          if (c) c.remove();
        },
        args: [],
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {}
}

/**
 * som-post-composite-v1：在未压缩的 viewport 图上按 CSS 坐标画 SoM（供 area 裁剪前使用）
 */
async function compositeSomOnRawViewportInTab(
  tabId: number,
  dataUrl: string,
  overlay: SomOverlayPayload,
): Promise<string> {
  if (!overlay.elements.length && !overlay.areas.length) return dataUrl;

  const results = await (getContext().browser.scripting as any).executeScript({
    target: { tabId },
    func: (imgDataUrl: string, overlayArg: SomOverlayPayload, compositeTag: string) => {
      return new Promise<string>((resolve) => {
        void compositeTag;
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(imgDataUrl);
              return;
            }
            ctx.drawImage(img, 0, 0);
            const sx = img.width / vw;
            const sy = img.height / vh;
            const s = Math.min(sx, sy);
            const COLORS = [
              "#E53935",
              "#1E88E5",
              "#43A047",
              "#FB8C00",
              "#8E24AA",
              "#00ACC1",
              "#D81B60",
              "#3949AB",
            ];

            const drawBadge = (
              text: string,
              bx: number,
              by: number,
              color: string,
              fontPx: number,
              padX: number,
              boxH: number,
            ) => {
              ctx.font = `bold ${fontPx}px Arial,Helvetica,sans-serif`;
              const tw = ctx.measureText(text).width;
              const bw = tw + padX * 2;
              ctx.fillStyle = color;
              ctx.beginPath();
              const r = Math.max(2, 4 * s);
              ctx.moveTo(bx + r, by);
              ctx.arcTo(bx + bw, by, bx + bw, by + boxH, r);
              ctx.arcTo(bx + bw, by + boxH, bx, by + boxH, r);
              ctx.arcTo(bx, by + boxH, bx, by, r);
              ctx.arcTo(bx, by, bx + bw, by, r);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = "#fff";
              ctx.textBaseline = "middle";
              ctx.fillText(text, bx + padX, by + boxH / 2);
            };

            for (const mark of overlayArg.elements || []) {
              const rc = mark.rc;
              if (!rc || rc.length < 4) continue;
              const color = COLORS[Math.max(0, mark.i - 1) % COLORS.length]!;
              const x = rc[0]! * sx;
              const y = rc[1]! * sy;
              const bw = rc[2]! * sx;
              const bh = rc[3]! * sy;
              ctx.strokeStyle = color;
              ctx.lineWidth = Math.max(1, 2 * s);
              ctx.strokeRect(x, y, bw, bh);
              const fontPx = Math.max(10, Math.round(16 * s));
              const boxH = Math.max(14, Math.round(20 * s));
              let bTop = y - boxH;
              if (bTop < 0) bTop = y + 2 * s;
              drawBadge(String(mark.i), Math.max(0, x), bTop, color, fontPx, Math.max(3, 5 * s), boxH);
            }

            resolve(canvas.toDataURL("image/jpeg", 0.92));
          } catch {
            resolve(imgDataUrl);
          }
        };
        img.onerror = () => resolve(imgDataUrl);
        img.src = imgDataUrl;
      });
    },
    args: [dataUrl, overlay, SOM_POST_COMPOSITE_TAG],
  });

  return results?.[0]?.result || dataUrl;
}

// ========== 标签页操作 ==========

async function browser_get_current_tab(_args: Record<string, unknown>): Promise<unknown> {
  try {
    const browser = getContext().browser;
    let tab: any | undefined;

    try {
      const win = await browser.windows.getLastFocused({ populate: true });
      tab = win?.tabs?.find((t: any) => t?.active && typeof t.id === "number");
    } catch {
      // fallback
    }

    const queryTabs = (queryInfo: Record<string, unknown>) =>
      new Promise<any[]>((resolve) => {
        browser.tabs.query(queryInfo, (tabs: any[]) => {
          if (browser.runtime.lastError) resolve([]);
          else resolve(tabs ?? []);
        });
      });

    if (tab?.id == null) {
      const lastFocused = await queryTabs({ active: true, lastFocusedWindow: true });
      tab = lastFocused[0];
    }
    if (tab?.id == null) {
      const currentWin = await queryTabs({ active: true, currentWindow: true });
      tab = currentWin[0];
    }
    if (tab?.id == null) {
      const allActive = await queryTabs({ active: true });
      if (allActive.length) {
        tab = [...allActive].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
      }
    }

    if (tab?.id == null) return { error: "no active tab" };

    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId,
      hint: "后续操作会自动使用此标签页",
    };
  } catch (e) {
    console.error("[browserTools] browser_get_current_tab error:", e);
    return { error: String(e) };
  }
}

async function browser_get_tab(args: Record<string, unknown>): Promise<unknown> {
  const targetTabId = args.targetTabId as number | undefined;
  if (!targetTabId) return { error: "targetTabId required" };
  const tab = await getContext().browser.tabs.get(targetTabId);
  return {
    ok: true,
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    windowId: tab.windowId
  };
}

async function browser_list_tabs(args: Record<string, unknown>): Promise<unknown> {
  try {
    const browser = getContext().browser;
    const windowIdArg = args.windowId as number | undefined;
    let tabs: any[] = [];

    const queryTabs = (queryInfo: Record<string, unknown>) =>
      new Promise<any[]>((resolve) => {
        browser.tabs.query(queryInfo, (t: any[]) => {
          if (browser.runtime.lastError) resolve([]);
          else resolve(t ?? []);
        });
      });

    if (windowIdArg != null && Number.isFinite(windowIdArg)) {
      tabs = await queryTabs({ windowId: windowIdArg });
    } else {
      try {
        const win = await browser.windows.getLastFocused({ populate: true });
        if (Array.isArray(win?.tabs) && win.tabs.length) {
          tabs = win.tabs;
        } else if (typeof win?.id === "number") {
          tabs = await queryTabs({ windowId: win.id });
        }
      } catch {
        // fallback
      }
      if (!tabs.length) {
        const lastWin = await browser.windows.getLastFocused();
        if (typeof lastWin?.id === "number") {
          tabs = await queryTabs({ windowId: lastWin.id });
        }
      }
      if (!tabs.length) {
        tabs = await queryTabs({ lastFocusedWindow: true });
      }
    }

    return [...tabs]
      .filter((t) => typeof t?.id === "number")
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active,
        windowId: t.windowId,
        index: t.index,
      }));
  } catch (e) {
    console.error("[browserTools] browser_list_tabs error:", e);
    return { error: String(e) };
  }
}



async function browser_navigate(args: Record<string, unknown>): Promise<unknown> {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  const conversationId = args.conversationId as string | undefined;
  console.log("[browserTools] browser_navigate called:", { url, conversationId });
  
  if (!url) return { error: "url required" };
  if (!conversationId) return { error: "conversationId required" };

  const finalUrl = tryResolveNavigationUrl(url);
  if (!finalUrl) {
    return { ok: false, error: "not a navigable url" };
  }

  console.log("[browserTools] Opening URL:", finalUrl);
  const active = typeof args.active === "boolean" ? args.active : true;
  await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted);
  const conversation = getConversationContext(conversationId);
  const argsOpenerTabId = args.openerTabId as number | undefined;
  let openerTabId = argsOpenerTabId;

  if (conversation?.mode === "group" || conversation?.scheduled) {
    const groupId = conversation.groupId;
    let resolved: number | undefined = conversation.groupWorkingTabId;
    if (typeof groupId === "number" && groupId >= 0) {
      try {
        const groupTabs = await getContext().browser.tabs.query({ groupId });
        const activeInGroup = groupTabs.find(
          (t: { active?: boolean; id?: number }) => t.active === true && typeof t.id === "number",
        );
        if (typeof activeInGroup?.id === "number") {
          resolved = activeInGroup.id;
        } else if (
          resolved != null &&
          !groupTabs.some((t: { id?: number }) => t.id === resolved)
        ) {
          const last = groupTabs[groupTabs.length - 1];
          if (typeof last?.id === "number") resolved = last.id;
        }
      } catch (e) {
        console.warn("[browserTools] browser_navigate: query group tabs failed", {
          groupId,
          error: String(e),
        });
      }
    }
    openerTabId = resolved ?? argsOpenerTabId;
  } else if (conversation?.mode === "single") {
    openerTabId = conversation.tabId;
  }

  if (!openerTabId) return { error: "openerTabId required" };
  if (await isTabStartPage(openerTabId)) {
    console.warn("[PANEL-RELOAD][sw] browser_navigate SAME_TAB (will replace host page / kill Safari panel iframe)", {
      conversationId,
      tabId: openerTabId,
      url: finalUrl,
      active,
      t: Date.now(),
    });
    panelReloadLog("sw", "browser_navigate SAME_TAB", {
      conversationId,
      tabId: openerTabId,
      url: finalUrl,
      active,
    });
    await getContext().browser.tabs.update(openerTabId, { url: finalUrl, active: active });

    return {
      ok: true,
      tabId: openerTabId,
      url: finalUrl
    };
  }
  else{
    console.log("[PANEL-RELOAD][sw] browser_navigate NEW_TAB (host panel tab usually survives)", {
      conversationId,
      openerTabId,
      url: finalUrl,
      active,
      t: Date.now(),
    });
    panelReloadLog("sw", "browser_navigate NEW_TAB", {
      conversationId,
      openerTabId,
      url: finalUrl,
      active,
    });
    const browser = getContext().browser;
    // side panel / SW 上下文下 tabs.create 默认窗口未必是 opener 所在窗，
    // 不带 windowId 只传 openerTabId 会报：Tab opener must be in the same window as the updated tab
    let createInfo: { url: string; active: boolean; windowId?: number; openerTabId?: number } = {
      url: finalUrl,
      active: active,
    };
    try {
      const openerTab = await browser.tabs.get(openerTabId);
      if (typeof openerTab?.windowId === "number") {
        createInfo.windowId = openerTab.windowId;
        createInfo.openerTabId = openerTabId;
      }
    } catch (e) {
      console.warn("[browserTools] browser_navigate: opener tab get failed, create without openerTabId", {
        openerTabId,
        error: String(e),
      });
    }
    const newTab = await browser.tabs.create(createInfo);
    const newTabId = typeof newTab?.id === "number" ? newTab.id : undefined;
    const groupId = conversation?.groupId;
    // group / 定时会话：新开 tab 必须进当前 Chrome 标签组，否则脱离组会话上下文
    if (
      newTabId != null &&
      (conversation?.mode === "group" || conversation?.scheduled) &&
      typeof groupId === "number" &&
      groupId >= 0
    ) {
      try {
        await getContext().browser.tabs.group({ tabIds: [newTabId], groupId });
      } catch (e) {
        console.warn("[browserTools] browser_navigate: add to tab group failed", {
          conversationId,
          groupId,
          newTabId,
          error: String(e),
        });
      }
    }
    console.log("[DOMA_HANDOVER]", "tools:send-runTabHandover", {
      sourceTabId: openerTabId,
      argsOpenerTabId,
      resolvedFrom: conversation?.mode === "group" || conversation?.scheduled
        ? "groupWorkingTabId"
        : conversation?.mode === "single"
          ? "conversation.tabId"
          : "args.openerTabId",
      newTabId,
      url: finalUrl,
      conversationId,
      conversationTabId: conversation?.tabId,
      groupWorkingTabId: conversation?.groupWorkingTabId,
      groupId,
      mode: conversation?.mode,
      active,
      safari: isSafariBuild(),
    });
    if (isSafariBuild() && typeof newTabId === "number") {
      // Safari：opener 停流；handover 定点 newTab 的 panelShell。
      // 壳侧短等 settle 再开栏（防 loading 砸进程）；12306 等可能永不 complete，勿长等。
      void sendToSidePanel(
        {
          operate: "chat/abortForHandover",
          conversationId,
          sourceTabId: openerTabId,
        },
        { expectResponse: false, tabId: openerTabId },
      );
      try {
        if (active) {
          await getContext().browser.tabs.update(newTabId, { active: true });
        }
      } catch (e) {
        console.warn("[DOMA_HANDOVER] safari activate newTab failed", e);
      }
      try {
        // 短超时：永不 complete 的站到点继续，交给壳侧 timeout settle
        await waitTabStatusComplete(newTabId, 4000);
      } catch (e) {
        console.warn("[DOMA_HANDOVER] safari wait newTab complete", e);
      }
      // 对齐 panelShell whenPageSettled(≤2.5s + 400ms)
      await new Promise((r) => setTimeout(r, 900));
      await sendToSidePanel(
        {
      operate: "chat/runTabHandover",
      sourceTabId: openerTabId,
      newTabId,
      url: finalUrl,
          // 工具回合内 navigate：新 tab 侧栏看不到 opener 的 loading Set，显式要求续跑
          resume: true,
        },
        { expectResponse: false, tabId: newTabId },
      );
    } else {
      // Chrome：窗口级侧栏，runtime 投递即可
      await sendToSidePanel(
        {
          operate: "chat/runTabHandover",
          sourceTabId: openerTabId,
          newTabId,
          url: finalUrl,
          resume: true,
        },
        { expectResponse: false },
      );
    }
    console.log("[DOMA_HANDOVER]", "tools:send-runTabHandover:done", {
      sourceTabId: openerTabId,
      newTabId,
    });

    return {
      ok: true,
      tabId: newTabId,
      url: finalUrl,
      instruction: `查看${finalUrl}是否加载完毕，再继续其他操作。`
    };
  }
}

async function browser_close_tab(args: Record<string, unknown>): Promise<unknown> {
  const tabIdList = args.tabIdList as number[] | undefined;
  if (!tabIdList) return { error: "tabIdList required" };
  for (const tabId of tabIdList) {
    await getContext().browser.tabs.remove(tabId);
  }
  return { ok: true };
}

async function browser_reload_tab(args: Record<string, unknown>): Promise<unknown> {
  let tabId = args.tabId as number | undefined;
  const conversationId = args.conversationId as string | undefined;
  if (conversationId){
    if (!tabId){
      tabId = await getTabIdByConversationId(conversationId);
    }
  }
  if (!tabId) return { error: "no tab" };
  console.warn("[PANEL-RELOAD][sw] browser_reload_tab (host page reload → Safari panel remount)", {
    conversationId,
    tabId,
    t: Date.now(),
  });
  panelReloadLog("sw", "browser_reload_tab", { conversationId, tabId });
  await getContext().browser.tabs.reload(tabId);
  return { ok: true, tabId };
}

async function browser_call_tab(args: Record<string, unknown>): Promise<unknown> {
  const sourceConversationId = args.conversationId as string | undefined;
  if (!sourceConversationId) return { error: "conversationId required" };
  const instruction = args.instruction as string | undefined;
  if (!instruction) return { error: "instruction required" };

  let targetTabId = args.targetTabId as number | undefined; 
  if (targetTabId){
    await getContext().browser.tabs.update(targetTabId, { active: true });
  }
  else{
    const url = args.url as string | undefined;
    if (!url) return { error: "url required" };
    const newTab = await getContext().browser.tabs.create({ url, active: true });
    targetTabId = newTab.id;
  }

  const addonRaw = args.addonInstruction;
  const addonInstruction =
    typeof addonRaw === "string" && addonRaw.trim() ? addonRaw : undefined;
  console.log("[handoff] call_tab:dispatch", {
    sourceCid: sourceConversationId,
    targetTabId,
    hasAddon: !!addonInstruction,
    addonLen: addonInstruction?.length ?? 0,
    instrLen: instruction.length,
    instrPreview: instruction.slice(0, 80),
  });

  // Safari：投递到目标 tab 的 panelShell（call_tab 已 active 该 tab；payload 给业务）
  void sendToSidePanel(
    {
    operate: "chat/runCallTab",
    sourceConversationId,
    targetTabId,
    instruction,
    addonInstruction,
    },
    {
      expectResponse: false,
      ...(typeof targetTabId === "number" ? { tabId: targetTabId } : {}),
    },
  );
  return { ok: true, tabId: targetTabId };
}

// ========== 页面交互（type 见 SoM 统一底层 browser_typeCore）==========

async function browser_scroll(args: Record<string, unknown>): Promise<unknown> {
  const direction = (args.direction as string) ?? "down";
  const amount = (args.amount as number) ?? 500;
  const selector = (args.selector as string | undefined) ?? null;

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };

  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      // scroll-auto-container-v1：无 selector 时 window 不可滚则选最大可滚容器
      func: (dir: string, amt: number, sel: string | null) => {
        const dy = dir === "up" ? -amt : dir === "down" ? amt : 0;
        const dx = dir === "left" ? -amt : dir === "right" ? amt : 0;
        const isVertical = dy !== 0;
        const OVERFLOW_RE = /(auto|scroll|overlay)/;

        const describeEl = (el: Element): string => {
          const he = el as HTMLElement;
          const id = he.id ? `#${he.id}` : "";
          const cls =
            typeof he.className === "string" && he.className.trim()
              ? `.${he.className.trim().split(/\s+/).slice(0, 2).join(".")}`
              : "";
          return `${he.tagName.toLowerCase()}${id}${cls}`.slice(0, 80);
        };

        const elementCanScroll = (el: HTMLElement): boolean => {
          const cs = window.getComputedStyle(el);
          if (isVertical) {
            if (!OVERFLOW_RE.test(cs.overflowY)) return false;
            return el.scrollHeight > el.clientHeight + 1;
          }
          if (!OVERFLOW_RE.test(cs.overflowX)) return false;
          return el.scrollWidth > el.clientWidth + 1;
        };

        const windowCanScroll = (): boolean => {
          const se = document.scrollingElement || document.documentElement;
          if (isVertical) {
            const max = Math.max(
              document.documentElement.scrollHeight,
              document.body?.scrollHeight ?? 0,
              se.scrollHeight,
            );
            return max > window.innerHeight + 1;
          }
          const max = Math.max(
            document.documentElement.scrollWidth,
            document.body?.scrollWidth ?? 0,
            se.scrollWidth,
          );
          return max > window.innerWidth + 1;
        };

        const scrollElement = (
          el: HTMLElement,
          label: string,
        ): { ok: boolean; scrolledElement: string; delta: number; scrollY: number; scrollX: number } => {
          const before = isVertical ? el.scrollTop : el.scrollLeft;
          el.scrollBy({ left: dx, top: dy, behavior: "auto" });
          const after = isVertical ? el.scrollTop : el.scrollLeft;
          const delta = after - before;
          return {
            ok: Math.abs(delta) >= 1,
            scrolledElement: label,
            delta,
            scrollY: el.scrollTop,
            scrollX: el.scrollLeft,
          };
        };

        const scrollWindow = (
          label: string,
        ): { ok: boolean; scrolledElement: string; delta: number; scrollY: number; scrollX: number; deltaY: number; deltaX: number } => {
          const beforeY = window.scrollY;
          const beforeX = window.scrollX;
          window.scrollBy({ left: dx, top: dy, behavior: "auto" });
          const deltaY = window.scrollY - beforeY;
          const deltaX = window.scrollX - beforeX;
          const delta = isVertical ? deltaY : deltaX;
          return {
            ok: Math.abs(delta) >= 1,
            scrolledElement: label,
            delta,
            deltaY,
            deltaX,
            scrollY: window.scrollY,
            scrollX: window.scrollX,
          };
        };

        const findScrollParent = (start: HTMLElement): HTMLElement | null => {
          let current: HTMLElement | null = start;
          while (current) {
            if (elementCanScroll(current)) return current;
            if (current === document.body || current === document.documentElement) break;
            current = current.parentElement;
          }
          return null;
        };

        /** 视口内面积最大的可滚动容器（偏主内容区） */
        const findLargestScrollable = (): HTMLElement | null => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let best: HTMLElement | null = null;
          let bestScore = 0;

          const all = document.querySelectorAll("div, main, section, article, aside, ul, ol, table, tbody");
          for (const raw of Array.from(all)) {
            const el = raw as HTMLElement;
            if (!elementCanScroll(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 40 || r.height < 40) continue;
            // 与视口有交集
            if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
            const visibleW = Math.min(r.right, vw) - Math.max(r.left, 0);
            const visibleH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
            if (visibleW < 40 || visibleH < 40) continue;
            const area = visibleW * visibleH;
            // 剩余可滚距离加权，避免选已到底的小侧栏
            const room = isVertical
              ? Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop)
              : Math.max(0, el.scrollWidth - el.clientWidth - el.scrollLeft);
            if (room < 2 && (isVertical ? dy > 0 : dx > 0)) continue;
            const roomUp = isVertical ? el.scrollTop : el.scrollLeft;
            if (roomUp < 2 && (isVertical ? dy < 0 : dx < 0)) continue;
            const cx = (r.left + r.right) / 2;
            const cy = (r.top + r.bottom) / 2;
            const centerBonus =
              1 - Math.min(1, Math.hypot(cx - vw / 2, cy - vh / 2) / Math.hypot(vw / 2, vh / 2));
            const score = area * (1 + 0.35 * centerBonus) + Math.min(room, 2000);
            if (score > bestScore) {
              bestScore = score;
              best = el;
            }
          }
          return best;
        };

        const fail = (hint: string, extra?: Record<string, unknown>) => ({
          ok: false,
          error: "scroll had no effect",
          hint,
          direction: dir,
          amount: amt,
          implTag: "scroll-auto-container-v1",
          ...extra,
        });

        // ── 有 selector：从元素向上找可滚父级 ──
        if (sel) {
          const target = document.querySelector(sel) as HTMLElement | null;
          if (!target) return { error: `element not found: ${sel}`, ok: false };

          const parent = findScrollParent(target);
          if (parent) {
            const hit = scrollElement(parent, describeEl(parent));
            if (hit.ok) return { ...hit, implTag: "scroll-auto-container-v1" };
          }

          if (windowCanScroll()) {
            const hit = scrollWindow("window(fallback)");
            if (hit.ok) return { ...hit, implTag: "scroll-auto-container-v1" };
          }

          const largest = findLargestScrollable();
          if (largest) {
            const hit = scrollElement(largest, `${describeEl(largest)}(largest)`);
            if (hit.ok) return { ...hit, implTag: "scroll-auto-container-v1" };
          }

          return fail("指定元素附近未找到可滚动容器，或已滚到边界。", { selector: sel });
        }

        // ── 无 selector：先 window，不行再最大可滚容器 ──
        if (windowCanScroll()) {
          const hit = scrollWindow("window");
          if (hit.ok) return { ...hit, implTag: "scroll-auto-container-v1" };
        }

        const largest = findLargestScrollable();
        if (largest) {
          const hit = scrollElement(largest, `${describeEl(largest)}(auto)`);
          if (hit.ok) {
            return {
              ...hit,
              hint: "页面 window 不可滚动，已自动滚动视口内最大可滚动容器。",
              implTag: "scroll-auto-container-v1",
            };
          }
          return fail("已找到可滚动容器但位移为 0（可能已到边界）。", {
            scrolledElement: describeEl(largest),
          });
        }

        return fail("window 与页面内均未找到可滚动区域。可传入 selector 指定列表内元素。");
      },
      args: [direction, amount, selector],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_get_page_content(args: Record<string, unknown>): Promise<unknown> {
  const selector = (args.selector as string | undefined) ?? null;
  const conversationId = typeof args.conversationId === "string" ? args.conversationId : "";

  const tabId = await getTabIdByConversationId(conversationId);
  if (!tabId) {
    console.warn("[DOMA_PAGE] get_page_content:no-tab", { conversationId, selector });
    return { error: "no tab" };
  }

  let tabMeta: { active?: boolean; status?: string; url?: string; discarded?: boolean } = {};
  try {
    const tab = await getTabById(tabId);
    tabMeta = {
      active: tab?.active === true,
      status: typeof tab?.status === "string" ? tab.status : undefined,
      url: typeof tab?.url === "string" ? tab.url : undefined,
      discarded: tab?.discarded === true,
    };
  } catch (e) {
    console.warn("[DOMA_PAGE] get_page_content:tab-meta-fail", {
      conversationId,
      tabId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  console.log("[DOMA_PAGE] get_page_content:start", {
    conversationId,
    tabId,
    selector,
    ...tabMeta,
  });

  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string | null) => {
        const el = sel ? document.querySelector(sel) : document.body;
        if (!el) return { error: sel ? `element not found: ${sel}` : "no body" };
        let text = el.textContent ?? "";
        text = text.replace(/\s+/g, " ").trim();
        return {
          ok: true,
          title: document.title || "",
          url: location.href || "",
          text,
          textLen: text.length,
        };
      },
      args: [selector],
    });
    const result = results?.[0]?.result;
    if (result && typeof result === "object" && "error" in (result as object)) {
      console.warn("[DOMA_PAGE] get_page_content:dom-error", {
        conversationId,
        tabId,
        ...tabMeta,
        result,
      });
      return result;
    }
    // 保持对外兼容：历史上返回纯字符串；诊断字段打日志后仍返回 text
    if (result && typeof result === "object" && "text" in (result as object)) {
      const packed = result as {
        ok?: boolean;
        title?: string;
        url?: string;
        text?: string;
        textLen?: number;
      };
      console.log("[DOMA_PAGE] get_page_content:ok", {
        conversationId,
        tabId,
        ...tabMeta,
        title: packed.title,
        pageUrl: packed.url,
        textLen: packed.textLen ?? packed.text?.length ?? 0,
        textPreview: (packed.text || "").slice(0, 120),
      });
      return packed.text ?? "";
    }
    console.log("[DOMA_PAGE] get_page_content:raw", {
      conversationId,
      tabId,
      ...tabMeta,
      resultType: typeof result,
      preview: typeof result === "string" ? result.slice(0, 120) : result,
    });
    return result;
  } catch (e) {
    const error = String(e);
    console.warn("[DOMA_PAGE] get_page_content:execute-fail", {
      conversationId,
      tabId,
      ...tabMeta,
      error,
    });
    return { error };
  }
}

async function browser_get_elements(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  const limit = (args.limit as number) ?? 20;
  
  if (!selector) return { error: "selector required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string, lim: number) => {
        try {
          // 检测 LLM 常见的 XPath/伪选择器误用，自动转为文本搜索
          const xpathTextMatch = sel.match(/contains\s*\(\s*text\s*\(\s*\)\s*,\s*['"](.+?)['"]\s*\)/i);
          const cssContainsMatch = sel.match(/:contains\s*\(\s*['"]?(.+?)['"]?\s*\)/i);
          const searchText = xpathTextMatch?.[1] || cssContainsMatch?.[1] || null;
          
          let els: Element[];
          
          if (searchText) {
            // 从 selector 中提取标签部分（如 "button:contains(...)" → "button"，"*[contains...]" → "*"）
            const tagPart = sel.replace(/\[.*contains.*\]|:contains\(.*\)/gi, '').replace(/[*]/g, '').trim();
            const tagSelector = tagPart || '*';
            const candidates = Array.from(document.querySelectorAll(tagSelector));
            const target = searchText.toLowerCase();
            els = candidates.filter(el => {
              const t = (el.textContent || '').trim().toLowerCase();
              return t.includes(target);
            }).slice(0, lim);
          } else {
            els = Array.from(document.querySelectorAll(sel)).slice(0, lim);
          }
          
          if (els.length === 0) {
            return { 
              elements: [], 
              count: 0, 
              message: searchText
                ? `No elements containing text "${searchText}" found`
                : `No elements found matching selector: ${sel}`,
              pageUrl: location.href,
              pageTitle: document.title,
            };
          }

          const cssEscape = (value: string) => {
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
              return CSS.escape(String(value));
            }
            return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
          };

          const createSelectorSegment = (node: Element) => {
            const tagName = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (!parent) return tagName;
            const sameTagSiblings = Array.from(parent.children).filter(
              (child) => child.tagName.toLowerCase() === tagName,
            );
            if (sameTagSiblings.length <= 1) return tagName;
            const nth = sameTagSiblings.indexOf(node) + 1;
            return `${tagName}:nth-of-type(${nth})`;
          };

          const buildUniqueSelector = (node: Element): string => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';

            if (node.id) {
              const idSelector = `#${cssEscape(node.id)}`;
              if (document.querySelectorAll(idSelector).length === 1) return idSelector;
            }

            const attrCandidates: Array<{ attr: string; val: string }> = [];
            for (const attr of ['data-testid', 'data-id', 'data-action', 'name', 'aria-label']) {
              const val = node.getAttribute(attr);
              if (val) attrCandidates.push({ attr, val });
            }
            const htmlNode = node as HTMLElement;
            if (htmlNode.dataset) {
              for (const key of Object.keys(htmlNode.dataset)) {
                const val = htmlNode.dataset[key];
                if (val != null && val !== '') {
                  attrCandidates.push({
                    attr: `data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
                    val,
                  });
                }
              }
            }
            const tag = node.tagName.toLowerCase();
            for (const { attr, val } of attrCandidates) {
              const withTag = `${tag}[${attr}="${cssEscape(val)}"]`;
              if (document.querySelectorAll(withTag).length === 1) return withTag;
              const bare = `[${attr}="${cssEscape(val)}"]`;
              if (document.querySelectorAll(bare).length === 1) return bare;
            }

            const segments: string[] = [];
            let current: Element | null = node;
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              if (current.id) {
                const idSelector = `#${cssEscape(current.id)}`;
                if (document.querySelectorAll(idSelector).length === 1) {
                  segments.unshift(idSelector);
                  break;
                }
              }
              segments.unshift(createSelectorSegment(current));
              const pathSelector = segments.join(' > ');
              if (document.querySelectorAll(pathSelector).length === 1) return pathSelector;
              current = current.parentElement;
            }
            return segments.join(' > ');
          };
          

          const elements = els.map((el: any, i) => {
            // 安全获取 className（SVG 元素的 className 是对象）
            let classNameStr = '';
            if (el.className) {
              if (typeof el.className === 'string') {
                classNameStr = el.className;

              } else if (el.className?.baseVal && el.className?.baseVal !== undefined) {
                // SVG 元素
                classNameStr = el.className?.baseVal;
              } else if (el.getAttribute) {
                classNameStr = el.getAttribute('class') || '';
              }
            }
            
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            
            const result: Record<string, unknown> = {
              index: i,
              tagName: el.tagName.toLowerCase(),
              isVisible,
            };
            
            if (el.id) result.id = el.id;
            if (classNameStr) result.className = classNameStr;
            
            const text = el.textContent?.trim();
            if (text) result.text = text.slice(0, 200);
            
            const htmlEl = el as HTMLElement;
            if ((el as HTMLAnchorElement).href) result.href = (el as HTMLAnchorElement).href;
            if ((el as HTMLImageElement).src) result.src = (el as HTMLImageElement).src;
            if ((el as HTMLInputElement).value) result.value = (el as HTMLInputElement).value;
            if ((el as HTMLInputElement).type) result.type = (el as HTMLInputElement).type;
            if ((el as HTMLInputElement).name) result.name = (el as HTMLInputElement).name;
            if ((el as HTMLInputElement).placeholder) result.placeholder = (el as HTMLInputElement).placeholder;
            if (htmlEl.title) result.title = htmlEl.title;
            
            if (htmlEl.dataset && Object.keys(htmlEl.dataset).length > 0) {
              const dataAttrs: Record<string, string> = {};
              for (const key of Object.keys(htmlEl.dataset).slice(0, 5)) {
                dataAttrs[key] = htmlEl.dataset[key] || '';
              }
              result.data = dataAttrs;
            }
            
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel) result.ariaLabel = ariaLabel;
            
            // 生成可用的 CSS selector 供后续工具使用
            const uniqueSelector = buildUniqueSelector(el);
            if (uniqueSelector) result.selector = uniqueSelector;
            
            return result;
          });
          
          return { 
            elements, 
            count: els.length,
            total: searchText ? els.length : document.querySelectorAll(sel).length,
            selector: sel,
            note: searchText ? `Auto-converted text search for "${searchText}". Use CSS selectors (not XPath) for best results.` : undefined,
          };
        } catch (innerError) {
          return { error: `Script execution error: ${String(innerError)}` };
        }
      },
      args: [selector, limit],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_wait(args: Record<string, unknown>): Promise<unknown> {
  const ms = (args.ms as number) ?? 1000;
  const selector = args.selector as string | undefined;
  const timeout = (args.timeoutMs as number) ?? 10000;
  
  if (selector) {
    const tabId = await getTabIdByConversationId(args.conversationId as string);
    if (!tabId) return { error: "no tab" };
    
    try {
      const results = await (getContext().browser.scripting as any).executeScript({
        target: { tabId },
        func: (sel: string, timeoutMs: number) => {
          return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
              const el = document.querySelector(sel);
              if (el) {
                resolve({ ok: true, found: true, elapsed: Date.now() - start });
              } else if (Date.now() - start > timeoutMs) {
                resolve({ ok: false, found: false, error: "timeout" });
              } else {
                setTimeout(check, 100);
              }
            };
            check();
          });
        },
        args: [selector, timeout],
      });
      return results?.[0]?.result;
    } catch (e) {
      return { error: String(e) };
    }
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { ok: true, waited: ms };
  }
}

async function browser_list_iframes(args: Record<string, unknown>): Promise<unknown> {
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  const iframes = await getContext().browser.webNavigation.getAllFrames({tabId});
  return { iframes };
}

async function browser_get_iframe(args: Record<string, unknown>): Promise<unknown> {
  const iframeId = args.iframeId as number;
  const url = args.url as string;
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  const iframes = await getContext().browser.webNavigation.getAllFrames({tabId});
  const iframe = iframes.find((iframe: any) => iframe.frameId === iframeId || iframe.url === url);
  if (!iframe) return { error: "iframe not found" };
  return {
    frameId: iframe.frameId,
    url: iframe.url
  };
}

/**
 * 任意 code 注入：
 * - Safari：无 userScripts API，用 MV2 风格 tabs.executeScript({ code })
 * - Chrome：走 userScripts.execute（需用户开启 Allow User Scripts）
 */
async function executeArbitraryPageCode(
  tabId: number,
  code: string,
  allFrames: boolean,
): Promise<unknown> {
  if (isSafariBuild()) {
    const tabsApi = getContext().browser.tabs as {
      executeScript?: (
        tabId: number,
        details: { code: string; allFrames?: boolean },
      ) => Promise<unknown>;
    };
    if (typeof tabsApi.executeScript !== "function") {
      return { error: "tabs.executeScript unavailable on Safari" };
    }
    return await tabsApi.executeScript(tabId, { code, allFrames });
  }

  const userScripts = getContext().browser.userScripts as
    | { execute?: (injection: unknown) => Promise<unknown> }
    | undefined;
  if (!userScripts?.execute) {
    return {
      doma_show_alert: {
        type: "userScripts",
      },
    };
  }
  return await userScripts.execute({
    target: {
      tabId,
      allFrames,
    },
    js: [{ code }],
  });
}

async function browser_execute_script(args: Record<string, unknown>): Promise<unknown> {
  const code = args.code as string;
  if (!code) return { error: "code required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  try {
    return await executeArbitraryPageCode(
        tabId,
      code,
      (args.allFrames as boolean) || false,
    );
  } catch (e) {
    return { error: String(e) };
  }
}

// ========== 剪贴板 ==========

async function browser_get_clipboard(): Promise<unknown> {
  try {
    const text = await navigator.clipboard.readText();
    return { text };
  } catch (e) {
    return { error: "clipboard read not allowed or not available", detail: String(e) };
  }
}

async function browser_set_clipboard(args: Record<string, unknown>): Promise<unknown> {
  const text = args.text as string;
  if (text == null) return { error: "text required" };
  try {
    await navigator.clipboard.writeText(String(text));
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
}

// ========== 高级交互（hover / long_press / drag 见 SoM 统一底层）==========

async function browser_select_option(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  const value = args.value as string | undefined;
  const text = args.text as string | undefined;
  const index = args.index as number | undefined;
  
  if (!selector) return { error: "selector required" };
  if (value == null && text == null && index == null) {
    return { error: "need value, text, or index" };
  }
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string, val: string | null, txt: string | null, idx: number | null) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) return { error: `element not found: ${sel}` };
        
        // ===== 原生 <select> =====
        if (el.tagName.toLowerCase() === 'select') {
          const selectEl = el as HTMLSelectElement;
          let selectedIndex = -1;
          
          if (val != null) {
            // 精确 value → 模糊 value（忽略大小写）
            for (let i = 0; i < selectEl.options.length; i++) {
              if (selectEl.options[i].value === val) { selectedIndex = i; break; }
            }
            if (selectedIndex === -1) {
              const lower = val.toLowerCase();
              for (let i = 0; i < selectEl.options.length; i++) {
                if (selectEl.options[i].value.toLowerCase() === lower) { selectedIndex = i; break; }
              }
            }
          } else if (txt != null) {
            const trimmed = txt.trim();
            // 精确匹配 → includes → 忽略大小写 includes
            for (let i = 0; i < selectEl.options.length; i++) {
              if (selectEl.options[i].text.trim() === trimmed) { selectedIndex = i; break; }
            }
            if (selectedIndex === -1) {
              for (let i = 0; i < selectEl.options.length; i++) {
                if (selectEl.options[i].text.includes(trimmed)) { selectedIndex = i; break; }
              }
            }
            if (selectedIndex === -1) {
              const lower = trimmed.toLowerCase();
              for (let i = 0; i < selectEl.options.length; i++) {
                if (selectEl.options[i].text.toLowerCase().includes(lower)) { selectedIndex = i; break; }
              }
            }
          } else if (idx != null) {
            if (idx >= 0 && idx < selectEl.options.length) selectedIndex = idx;
          }
          
          if (selectedIndex === -1) {
            const options = Array.from(selectEl.options).map(o => ({ value: o.value, text: o.text }));
            return { error: "option not found", availableOptions: options.slice(0, 15) };
          }
          
          selectEl.value = selectEl.options[selectedIndex].value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
          
          return {
            ok: true,
            selectedValue: selectEl.options[selectedIndex].value,
            selectedText: selectEl.options[selectedIndex].text,
          };
        }
        
        // ===== 非原生 select：自动回退为 click 弹出面板中的匹配项 =====
        const searchText = txt || val || '';
        if (!searchText) {
          return { error: `element is not a native <select> (it's a ${el.tagName}). Provide text to click a matching option in a custom dropdown.` };
        }
        
        // 先点击触发器打开面板
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.focus();
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        
        // 在整个 document 里找文本匹配的可见选项
        const candidates = document.querySelectorAll(
          '[role="option"], [role="listbox"] *, .ant-select-item, .el-select-dropdown__item, ' +
          '[class*="option"], [class*="menu-item"], [class*="dropdown-item"], li, [role="menuitem"]'
        );
        
        type ScoredOpt = { el: Element; score: number };
        const scored: ScoredOpt[] = [];
        const target = searchText.trim().toLowerCase();
        
        for (const candidate of Array.from(candidates)) {
          const rect = candidate.getBoundingClientRect();
          if (rect.width < 3 || rect.height < 3) continue;
          const style = window.getComputedStyle(candidate);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          
          const optText = (candidate.textContent || '').trim();
          if (!optText) continue;
          
          let score = 0;
          const optLower = optText.toLowerCase();
          if (optLower === target) score += 100;
          else if (optLower.includes(target)) score += 60;
          else if (target.includes(optLower)) score += 30;
          
          if (score <= 0) continue;
          if (candidate.children.length === 0) score += 10;
          scored.push({ el: candidate, score });
        }
        
        if (scored.length === 0) {
          return { error: `custom dropdown: no option matching "${searchText}" found. Use browser_get_elements to inspect the dropdown panel.` };
        }
        
        scored.sort((a, b) => b.score - a.score);
        const optTarget = scored[0].el as HTMLElement;
        
        const anyOpt: any = optTarget as any;
        if (typeof anyOpt.scrollIntoViewIfNeeded === 'function') {
          anyOpt.scrollIntoViewIfNeeded();
        } else {
          optTarget.scrollIntoView({ block: 'center' });
        }
        
        const optRect = optTarget.getBoundingClientRect();
        const cx = optRect.left + optRect.width / 2;
        const cy = optRect.top + optRect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
        optTarget.dispatchEvent(new MouseEvent('mouseenter', opts));
        optTarget.dispatchEvent(new MouseEvent('mouseover', opts));
        optTarget.dispatchEvent(new MouseEvent('mousedown', opts));
        optTarget.focus();
        optTarget.dispatchEvent(new MouseEvent('mouseup', opts));
        optTarget.dispatchEvent(new MouseEvent('click', opts));
        
        return {
          ok: true,
          selectedText: optTarget.textContent?.trim(),
          method: 'custom_dropdown_click',
          candidatesCount: scored.length,
        };
      },
      args: [selector, value ?? null, text ?? null, index ?? null],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_click_text(args: Record<string, unknown>): Promise<unknown> {
  const text = args.text as string;
  const tag = (args.tag as string | undefined) ?? null;
  const exact = (args.exact as boolean) ?? false;
  
  if (!text) return { error: "text required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  await ensureClickIndicator(tabId);
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (txt: string, tagName: string | null, exactMatch: boolean) => {
        const targetText = txt.trim();
        const isPureNumber = /^\d+$/.test(targetText);
        
        // 两轮搜索：先窄范围可点击元素，再宽范围所有元素
        const narrowSel = tagName
          ? tagName
          : 'a, button, input[type="button"], input[type="submit"], [role="button"], [role="option"], [role="menuitem"], [role="tab"], [onclick], .btn, .button, td, th, li, span, div, label';
        
        type ScoredEl = { el: Element; score: number };
        const scored: ScoredEl[] = [];
        
        const scoreCandidates = (nodeList: NodeListOf<Element> | Element[]) => {
          for (const el of Array.from(nodeList)) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 3 || rect.height < 3) continue;
            
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
            
            const elText = (el.textContent || '').trim();
            if (!elText) continue;
            
            let score = 0;
            if (exactMatch) {
              if (elText === targetText) score += 100;
              else continue;
            } else {
              if (elText === targetText) score += 100;
              else if (elText.includes(targetText)) score += 60;
              else if (targetText.includes(elText)) score += 30;
              else continue;
            }
            
            // 纯数字日期场景：偏好小元素 + 无子节点
            if (isPureNumber) {
              if (/^\d+$/.test(elText)) score += 20;
              if (el.children.length === 0) score += 15;
              if (rect.width <= 80 && rect.height <= 80) score += 10;
            }
            
            // 标签权重
            const tag = el.tagName.toLowerCase();
            if (tag === 'button' || tag === 'a') score += 10;
            if (tag === 'td' || tag === 'th') score += 8;
            if (tag === 'li' || tag === 'span') score += 5;
            
            // 面积越小越精确
            const area = rect.width * rect.height;
            if (area < 10000) score += 5;
            
            scored.push({ el, score });
          }
        };
        
        // 第一轮：窄范围
        scoreCandidates(document.querySelectorAll(narrowSel));
        
        // 第二轮：如果窄范围没找到，全局搜一次
        if (scored.length === 0) {
          scoreCandidates(document.querySelectorAll('*'));
        }
        
        if (scored.length === 0) {
          return { error: `element with text "${txt}" not found` };
        }
        
        scored.sort((a, b) => b.score - a.score);
        let target = scored[0].el as HTMLElement;
        
        // page-agent 风格：scrollIntoView
        const anyEl: any = target as any;
        if (typeof anyEl.scrollIntoViewIfNeeded === 'function') {
          anyEl.scrollIntoViewIfNeeded();
        } else {
          target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        }
        
        // elementFromPoint 校验：如果被覆盖则点上层元素
        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const topEl = document.elementFromPoint(cx, cy) as HTMLElement | null;
        if (topEl && topEl !== target && !target.contains(topEl)) {
          target = topEl;
        }
        
        // 可视化指示器
        const g: any = window as any;
        if (g.__showAgentCursor) g.__showAgentCursor(cx, cy, 'click');
        
        // 完整事件序列
        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
        target.dispatchEvent(new MouseEvent('mouseenter', opts));
        target.dispatchEvent(new MouseEvent('mouseover', opts));
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        target.focus();
        target.dispatchEvent(new MouseEvent('mouseup', opts));
        target.dispatchEvent(new MouseEvent('click', opts));
        
        return { 
          ok: true, 
          tagName: target.tagName, 
          text: target.textContent?.slice(0, 100)?.trim()
        };
      },
      args: [text, tag, exact],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_double_click(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  if (!selector) return { error: "selector required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  await ensureClickIndicator(tabId);
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) return { error: `element not found: ${sel}` };
        
        el.scrollIntoView({ block: 'center' });
        
        const rect = el.getBoundingClientRect();
        const g: any = window as any;
        if (g.__showAgentCursor) g.__showAgentCursor(rect.left + rect.width / 2, rect.top + rect.height / 2, 'click');
        
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        
        return { ok: true, tagName: el.tagName, text: el.textContent?.slice(0, 100) };
      },
      args: [selector],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_get_select_options(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  if (!selector) return { error: "selector required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) return { error: `element not found: ${sel}` };
        
        // ===== 原生 <select> =====
        if (el.tagName.toLowerCase() === 'select') {
          const selectEl = el as HTMLSelectElement;
          const options = Array.from(selectEl.options).map((opt, i) => ({
            index: i,
            value: opt.value,
            text: opt.text,
            selected: opt.selected,
          }));
          return { type: 'native_select', options, count: options.length, selectedIndex: selectEl.selectedIndex, selectedValue: selectEl.value };
        }
        
        // ===== 非原生：先尝试找关联的 listbox / 面板 =====
        const ariaControls = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
        let panelEl: HTMLElement | null = null;
        if (ariaControls) {
          panelEl = document.getElementById(ariaControls);
        }
        
        // 通用选择器搜索 dropdown 面板
        if (!panelEl) {
          const panelSelectors = [
            '[role="listbox"]', '[role="menu"]', '.ant-select-dropdown', '.el-select-dropdown',
            '[class*="dropdown-menu"]', '[class*="select-dropdown"]', '[class*="options"]',
          ];
          for (const s of panelSelectors) {
            const panels = document.querySelectorAll(s);
            for (const p of Array.from(panels)) {
              const rect = (p as HTMLElement).getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                panelEl = p as HTMLElement;
                break;
              }
            }
            if (panelEl) break;
          }
        }
        
        if (panelEl) {
          const optionEls = panelEl.querySelectorAll(
            '[role="option"], li, [class*="option"], [class*="item"]'
          );
          const options = Array.from(optionEls).map((opt, i) => {
            const rect = (opt as HTMLElement).getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            return {
              index: i,
              text: (opt.textContent || '').trim(),
              value: opt.getAttribute('data-value') || opt.getAttribute('value') || '',
              selected: opt.getAttribute('aria-selected') === 'true' || opt.classList.contains('selected') || opt.classList.contains('active'),
              visible: isVisible,
              selector: opt.id ? `#${opt.id}` : undefined,
            };
          }).filter(o => o.text && o.visible);
          
          return { type: 'custom_dropdown', options, count: options.length, panelTag: panelEl.tagName };
        }
        
        return {
          error: `No dropdown options found for ${el.tagName}. Try clicking the element first to open the dropdown, then call this again.`,
          hint: 'Use browser_click on the selector first, wait, then call browser_get_select_options again.',
        };
      },
      args: [selector],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

const BROWSER_MOUSE_CLICK_TAG = "mouse-click-cdp-v1";
const MOUSE_CLICK_VERIFY_WAIT_MS = 450;

type MouseClickVerifySnapshot = {
  href: string;
  openDialogCount: number;
  activeElementTag: string;
  activeElementOnTarget: boolean;
  targetAriaExpanded: string | null;
  wrapperAriaExpanded: string | null;
  hitTargetTag: string;
  nearbySurfaceFingerprint: string;
  /** 日历格/可选中控件：aria-selected / selected class 等 */
  selectionSig: string;
  selectionOn: boolean;
};

/** cdp-strip-foreign-embeds-v1：回滚时 git grep 此字符串 */
const CDP_STRIP_FOREIGN_EMBEDS_TAG = "cdp-strip-foreign-embeds-v1";

/**
 * 清理页面内其它扩展注入的 chrome-extension:// 嵌入（Chrome debugger.attach 已知坑）。
 * 返回被移除的 src 列表，便于对照日志确认是否命中问题。
 */
async function stripForeignExtensionEmbeds(tabId: number): Promise<{
  removed: string[];
  frameCount: number;
  error?: string;
}> {
  const selfOrigin = String(getContext().browser.runtime?.getURL?.("") || "");
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId, allFrames: false },
      world: "ISOLATED",
      func: (selfOriginPrefix: string) => {
        const removed: string[] = [];
        const visit = (root: Document | ShadowRoot) => {
          const nodes = root.querySelectorAll(
            'iframe[src^="chrome-extension://"],frame[src^="chrome-extension://"],embed[src^="chrome-extension://"],object[data^="chrome-extension://"]',
          );
          for (const el of Array.from(nodes)) {
            const src =
              el.getAttribute("src")
              || el.getAttribute("data")
              || "";
            if (!src) continue;
            if (selfOriginPrefix && src.startsWith(selfOriginPrefix)) continue;
            removed.push(src.length > 160 ? `${src.slice(0, 160)}…` : src);
            el.remove();
          }
          for (const el of Array.from(root.querySelectorAll("*"))) {
            const he = el as HTMLElement & { shadowRoot?: ShadowRoot | null };
            let shadow: ShadowRoot | null = he.shadowRoot ?? null;
            try {
              const openOrClosed = (globalThis as any).chrome?.dom?.openOrClosedShadowRoot;
              if (!shadow && typeof openOrClosed === "function") {
                shadow = openOrClosed(he) as ShadowRoot | null;
              }
            } catch {
              /* ignore */
            }
            if (shadow) visit(shadow);
          }
        };
        visit(document);
        return { removed, frameCount: window.length };
      },
      args: [selfOrigin],
    });
    const res = results?.[0]?.result as { removed?: string[]; frameCount?: number } | undefined;
    return {
      removed: Array.isArray(res?.removed) ? res!.removed! : [],
      frameCount: typeof res?.frameCount === "number" ? res.frameCount : 0,
    };
  } catch (e) {
    return {
      removed: [],
      frameCount: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function isForeignExtensionDebuggerError(message: string): boolean {
  return /chrome-extension:\/\/\s*URL of different extension/i.test(message)
    || /Cannot access a chrome-extension:\/\//i.test(message);
}

/**
 * debugger.attach：先清异扩展 embed；若仍因 foreign extension 失败则再清一次并重试。
 */
async function cdpAttachTab(dbg: any, tabId: number): Promise<void> {
  const runStrip = async (phase: string) => {
    const strip = await stripForeignExtensionEmbeds(tabId);
    console.log("[CDP]", "strip-foreign-embeds", {
      tabId,
      phase,
      removedCount: strip.removed.length,
      removed: strip.removed,
      frameCount: strip.frameCount,
      stripError: strip.error ?? null,
      selfOrigin: String(getContext().browser.runtime?.getURL?.("") || ""),
      implTag: CDP_STRIP_FOREIGN_EMBEDS_TAG,
    });
    return strip;
  };

  await runStrip("before-attach");
  try {
    await dbg.attach({ tabId }, "1.3");
    console.log("[CDP]", "attach:ok", { tabId, attempt: 1, implTag: CDP_STRIP_FOREIGN_EMBEDS_TAG });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (!isForeignExtensionDebuggerError(error)) throw e;
    console.warn("[CDP]", "attach:retry-after-strip", {
      tabId,
      error,
      implTag: CDP_STRIP_FOREIGN_EMBEDS_TAG,
    });
    await runStrip("before-attach-retry");
    await dbg.attach({ tabId }, "1.3");
    console.log("[CDP]", "attach:ok", { tabId, attempt: 2, implTag: CDP_STRIP_FOREIGN_EMBEDS_TAG });
  }
}

/** CDP Input.dispatchMouseEvent — 坐标级真实点击（click-cdp-fallback-v1） */
async function cdpMouseClickSession(
  tabId: number,
  x: number,
  y: number,
  button: string = "left",
): Promise<{ ok: true; method: "cdp-mouse" } | { error: string; tabUrl?: string; tabActive?: boolean }> {
  const dbg = (getContext().browser as any).debugger;
  if (!dbg?.attach || !dbg?.sendCommand || !dbg?.detach) {
    console.warn("[CDP]", "unavailable", { tabId, x, y, button });
    return { error: "debugger API unavailable" };
  }

  const btnMap: Record<string, string> = { left: "left", right: "right", middle: "middle" };
  const cdpButton = btnMap[button.toLowerCase()] ?? "left";
  const rx = Math.round(x);
  const ry = Math.round(y);

  let tabUrl: string | undefined;
  let tabActive: boolean | undefined;
  let tabStatus: string | undefined;
  let tabTitle: string | undefined;
  try {
    const tab = await getTabById(tabId);
    tabUrl = typeof tab?.url === "string" ? tab.url : undefined;
    tabActive = tab?.active === true;
    tabStatus = typeof tab?.status === "string" ? tab.status : undefined;
    tabTitle = typeof tab?.title === "string" ? tab.title : undefined;
  } catch (e) {
    console.warn("[CDP]", "tabs.get failed before attach", {
      tabId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  console.log("[CDP]", "attach:start", {
    tabId,
    x: rx,
    y: ry,
    button: cdpButton,
    tabUrl,
    tabActive,
    tabStatus,
    tabTitle,
    urlIsExtension: typeof tabUrl === "string" && tabUrl.startsWith("chrome-extension://"),
    implTag: BROWSER_CLICK_CDP_FALLBACK_TAG,
  });

  let attached = false;
  try {
    await cdpAttachTab(dbg, tabId);
    attached = true;

    await dbg.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: rx,
      y: ry,
      button: "none",
      buttons: 0,
    });
    await dbg.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: rx,
      y: ry,
      button: cdpButton,
      buttons: cdpButton === "left" ? 1 : cdpButton === "middle" ? 4 : 2,
      clickCount: 1,
    });
    await dbg.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: rx,
      y: ry,
      button: cdpButton,
      buttons: 0,
      clickCount: 1,
    });

    console.log("[CDP]", "dispatch:ok", { tabId, x: rx, y: ry, button: cdpButton });
    return { ok: true, method: "cdp-mouse" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[CDP]", "failed", {
      tabId,
      tabUrl,
      tabActive,
      tabStatus,
      tabTitle,
      attached,
      x: rx,
      y: ry,
      error,
      implTag: BROWSER_CLICK_CDP_FALLBACK_TAG,
    });
    return { error, tabUrl, tabActive };
  } finally {
    if (attached) {
      try {
        await dbg.detach({ tabId });
        console.log("[CDP]", "detach:ok", { tabId });
      } catch (e) {
        console.warn("[CDP]", "detach:fail", {
          tabId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}

/** MAIN world：解析坐标 + 合成点击 + verified */
async function mouseClickSyntheticPageAttempt(
  sel: string | null,
  txt: string | null,
  offX: number | null,
  offY: number | null,
  btn: string,
  waitMs: number,
): Promise<{
  ok: true;
  verified: boolean;
  reason: string;
  position: { x: number; y: number };
  element: { tag: string; id?: string; class?: string; text?: string; hitTag?: string };
  button: string;
  action: string;
  method: "synthetic";
  snapshotBefore: MouseClickVerifySnapshot;
} | { error: string } | null> {
  const g: any = window as any;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const fingerprintNearbySurfaces = (anchor: HTMLElement): string => {
    const er = anchor.getBoundingClientRect();
    const items: string[] = [];
    const menuSel =
      '[role="menu"], [role="listbox"], [role="dialog"], [class*="dropdown"], [class*="popover"], [class*="picker"], [class*="panel"], ul, ol';
    for (const candidate of Array.from(document.querySelectorAll(menuSel))) {
      const node = candidate as HTMLElement;
      if (node === anchor || anchor.contains(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 32 || r.height < 16) continue;
      const st = window.getComputedStyle(node);
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") continue;
      const near =
        r.bottom >= er.top - 24 && r.top <= er.bottom + 320
        && r.right >= er.left - 60 && r.left <= er.right + 60;
      if (!near) continue;
      items.push(`${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`);
    }
    items.sort();
    return items.join("|");
  };

  /** 日历格/option：看自身及近祖是否变为选中/高亮 */
  const readSelectionState = (
    anchor: HTMLElement,
  ): { selectionSig: string; selectionOn: boolean } => {
    let node: HTMLElement | null = anchor;
    for (let depth = 0; depth < 6 && node; depth++) {
      const ariaSel = node.getAttribute("aria-selected");
      const ariaPressed = node.getAttribute("aria-pressed");
      const ariaCurrent = node.getAttribute("aria-current");
      const cls = String(node.className || "").toLowerCase();
      const classHit =
        /(^|[\s_-])(selected|is-selected|day-selected|picker-cell-selected|active-day|is-active|chosen)([\s_-]|$)/.test(
          cls,
        ) || /selected|is-selected|day-selected/.test(cls);
      const dataSel =
        node.getAttribute("data-selected") === "true" ||
        node.getAttribute("data-state") === "selected" ||
        node.getAttribute("aria-checked") === "true";
      const selectionOn =
        ariaSel === "true" ||
        ariaPressed === "true" ||
        ariaCurrent === "date" ||
        ariaCurrent === "true" ||
        classHit ||
        dataSel;
      let bg = "";
      try {
        bg = window.getComputedStyle(node).backgroundColor || "";
      } catch {
        bg = "";
      }
      const selectionSig = [
        node.tagName.toLowerCase(),
        ariaSel ?? "",
        ariaPressed ?? "",
        ariaCurrent ?? "",
        classHit ? "cls" : "",
        dataSel ? "data" : "",
        bg,
      ].join(":");
      if (selectionOn || ariaSel != null || ariaPressed != null || classHit || dataSel) {
        return { selectionSig, selectionOn };
      }
      // 常见格子容器
      if (
        (node.getAttribute("role") || "").toLowerCase() === "gridcell" ||
        node.tagName === "TD" ||
        node.hasAttribute("data-date")
      ) {
        return { selectionSig, selectionOn };
      }
      node = node.parentElement;
    }
    return { selectionSig: `none:${anchor.tagName.toLowerCase()}`, selectionOn: false };
  };

  const diffSnapshots = (
    before: MouseClickVerifySnapshot,
    after: MouseClickVerifySnapshot,
  ): { verified: boolean; reason: string } => {
    if (before.href !== after.href) return { verified: true, reason: "href-changed" };
    if (after.openDialogCount > before.openDialogCount) return { verified: true, reason: "dialog-opened" };
    if (!before.activeElementOnTarget && after.activeElementOnTarget) {
      return { verified: true, reason: "focus-moved" };
    }
    if (before.targetAriaExpanded !== after.targetAriaExpanded) {
      return { verified: true, reason: "aria-expanded-changed" };
    }
    if (before.wrapperAriaExpanded !== after.wrapperAriaExpanded) {
      return { verified: true, reason: "wrapper-expanded-changed" };
    }
    if (before.hitTargetTag !== after.hitTargetTag && after.hitTargetTag) {
      return { verified: true, reason: "hit-target-changed" };
    }
    if (
      after.nearbySurfaceFingerprint.length > before.nearbySurfaceFingerprint.length
      && after.nearbySurfaceFingerprint !== before.nearbySurfaceFingerprint
    ) {
      return { verified: true, reason: "floating-surface-visible" };
    }
    if (
      before.nearbySurfaceFingerprint.length > 0
      && after.nearbySurfaceFingerprint.length < before.nearbySurfaceFingerprint.length
    ) {
      return { verified: true, reason: "floating-surface-dismissed" };
    }
    // 日历/可选中项：高亮或 aria-selected 变化
    if (!before.selectionOn && after.selectionOn) {
      return { verified: true, reason: "cell-selected" };
    }
    if (before.selectionSig !== after.selectionSig) {
      return { verified: true, reason: "selection-toggled" };
    }
    return { verified: false, reason: "no-observable-change" };
  };

  const takeSnapshot = (anchor: HTMLElement, cx: number, cy: number): MouseClickVerifySnapshot => {
    const active = document.activeElement as HTMLElement | null;
    const hit = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const wrap = (anchor.closest(
      '[aria-haspopup], [role="combobox"], .t-input, [class*="select"], [class*="picker"]',
    ) as HTMLElement | null) ?? anchor.parentElement;
    const selState = readSelectionState(anchor);
    return {
      href: location.href,
      openDialogCount: document.querySelectorAll("dialog[open]").length,
      activeElementTag:
        active && active !== document.body
          ? active.tagName.toLowerCase() + (active.id ? `#${active.id}` : "")
          : "",
      activeElementOnTarget: !!(
        active && active !== document.body && (anchor === active || anchor.contains(active))
      ),
      targetAriaExpanded: anchor.getAttribute("aria-expanded"),
      wrapperAriaExpanded: wrap?.getAttribute("aria-expanded") ?? null,
      hitTargetTag: hit ? hit.tagName.toLowerCase() : "",
      nearbySurfaceFingerprint: fingerprintNearbySurfaces(anchor),
      selectionSig: selState.selectionSig,
      selectionOn: selState.selectionOn,
    };
  };

  const scrollIntoViewIfNeeded = (element: HTMLElement) => {
    const anyEl: any = element as any;
    if (typeof anyEl.scrollIntoViewIfNeeded === "function") {
      anyEl.scrollIntoViewIfNeeded();
    } else {
      element.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    }
  };

  let el: HTMLElement | null = null;

  if (sel) {
    el = document.querySelector(sel) as HTMLElement;
  }

  if (!el && txt) {
    const targetText = txt.trim();
    const isPureNumber = /^\d+$/.test(targetText);
    const candidates = document.querySelectorAll(
      'button, a, [role="button"], [role="option"], [role="menuitem"], [role="tab"], ' +
      "td, th, div, span, li, label, input, p, h1, h2, h3, h4, h5, h6",
    );
    type ScoredEl = { el: Element; score: number };
    const scored: ScoredEl[] = [];
    for (const candidate of Array.from(candidates)) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) continue;
      const style = window.getComputedStyle(candidate);
      if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
      const elemText = (candidate.textContent || "").trim();
      if (!elemText) continue;
      let score = 0;
      if (elemText === targetText) score += 100;
      else if (elemText.includes(targetText)) score += 60;
      else if (targetText.includes(elemText)) score += 40;
      if (isPureNumber) {
        if (!/^\d+$/.test(elemText)) continue;
        if (candidate.children.length === 0) score += 20;
        if (rect.width <= 80 && rect.height <= 80) score += 20;
      }
      if (score <= 0) continue;
      const tag = candidate.tagName.toLowerCase();
      if (tag === "button" || tag === "a") score += 10;
      if (tag === "td" || tag === "th") score += 10;
      scored.push({ el: candidate, score });
    }
    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      let best = scored[0].el as HTMLElement;
      const rect = best.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(cx, cy) as HTMLElement | null;
      if (topEl && best !== topEl && !best.contains(topEl)) best = topEl;
      el = best;
    }
  }

  if (!el) return { error: `element not found: ${sel || `text="${txt}"`}` };

  scrollIntoViewIfNeeded(el);
  const newRect = el.getBoundingClientRect();
  const clientX = newRect.left + (offX != null ? offX : newRect.width / 2);
  const clientY = newRect.top + (offY != null ? offY : newRect.height / 2);

  if (g.__showAgentCursor) g.__showAgentCursor(clientX, clientY, "click");

  const snapshotBefore = takeSnapshot(el, clientX, clientY);

  const hitEl = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const clickTarget =
    hitEl && (el === hitEl || el.contains(hitEl) || hitEl.contains(el)) ? hitEl : el;

  const buttonMap: Record<string, number> = { left: 0, middle: 1, right: 2 };
  const normalizedBtn = (btn || "left").toLowerCase();
  const buttonCode = buttonMap[normalizedBtn] ?? 0;
  const buttonsDown = buttonCode === 0 ? 1 : buttonCode === 1 ? 4 : 2;

  const baseOpts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
  };
  const downOpts: MouseEventInit = { ...baseOpts, button: buttonCode, buttons: buttonsDown };
  const upOpts: MouseEventInit = { ...baseOpts, button: buttonCode, buttons: 0 };

  if (clickTarget.focus) clickTarget.focus();
  clickTarget.dispatchEvent(new MouseEvent("mouseenter", { ...baseOpts, bubbles: false }));
  clickTarget.dispatchEvent(new MouseEvent("mouseover", baseOpts));

  const dispatchPointer = (type: "pointerdown" | "pointerup", opts: MouseEventInit) => {
    try {
      clickTarget.dispatchEvent(new PointerEvent(type, {
        ...opts, pointerId: 1, pointerType: "mouse",
      } as PointerEventInit));
    } catch { /* ignore */ }
  };

  dispatchPointer("pointerdown", downOpts);
  clickTarget.dispatchEvent(new MouseEvent("mousedown", downOpts));
  dispatchPointer("pointerup", upOpts);
  clickTarget.dispatchEvent(new MouseEvent("mouseup", upOpts));

  let action: string;
  if (normalizedBtn === "right") {
    clickTarget.dispatchEvent(new MouseEvent("contextmenu", upOpts));
    action = "contextmenu";
  } else if (normalizedBtn === "middle") {
    clickTarget.dispatchEvent(new MouseEvent("auxclick", { ...upOpts, detail: 1 }));
    action = "auxclick";
  } else {
    clickTarget.dispatchEvent(new MouseEvent("click", { ...upOpts, detail: 1 }));
    action = "click";
  }

  const deadline = Date.now() + Math.max(0, waitMs);
  let verify = { verified: false, reason: "no-observable-change" };
  while (Date.now() <= deadline) {
    verify = diffSnapshots(snapshotBefore, takeSnapshot(el, clientX, clientY));
    if (verify.verified) break;
    if (Date.now() + 50 > deadline) break;
    await sleep(50);
  }

  return {
    ok: true,
    verified: verify.verified,
    reason: verify.reason,
    position: { x: clientX, y: clientY },
    element: {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      class: typeof el.className === "string" ? el.className.slice(0, 80) : undefined,
      text: el.textContent?.trim()?.slice(0, 50),
      hitTag: clickTarget.tagName.toLowerCase(),
    },
    button: normalizedBtn,
    action,
    method: "synthetic",
    snapshotBefore,
  };
}

/** MAIN world：CDP 后复验 */
function mouseClickVerifyAfterPageFunc(
  snapshotBefore: MouseClickVerifySnapshot,
  sel: string | null,
  txt: string | null,
  clientX: number,
  clientY: number,
): { verified: boolean; reason: string } {
  let el: HTMLElement | null = sel ? document.querySelector(sel) as HTMLElement : null;
  if (!el && txt) {
    const targetText = txt.trim();
    for (const candidate of Array.from(document.querySelectorAll("button, a, td, div, span, li, input"))) {
      if ((candidate.textContent || "").trim().includes(targetText)) {
        el = candidate as HTMLElement;
        break;
      }
    }
  }
  if (!el) return { verified: false, reason: "anchor-lost" };

  const diffSnapshots = (
    before: MouseClickVerifySnapshot,
    after: MouseClickVerifySnapshot,
  ): { verified: boolean; reason: string } => {
    if (before.href !== after.href) return { verified: true, reason: "href-changed" };
    if (after.openDialogCount > before.openDialogCount) return { verified: true, reason: "dialog-opened" };
    if (!before.activeElementOnTarget && after.activeElementOnTarget) {
      return { verified: true, reason: "focus-moved" };
    }
    if (before.targetAriaExpanded !== after.targetAriaExpanded) {
      return { verified: true, reason: "aria-expanded-changed" };
    }
    if (before.wrapperAriaExpanded !== after.wrapperAriaExpanded) {
      return { verified: true, reason: "wrapper-expanded-changed" };
    }
    if (before.hitTargetTag !== after.hitTargetTag && after.hitTargetTag) {
      return { verified: true, reason: "hit-target-changed" };
    }
    if (
      after.nearbySurfaceFingerprint.length > before.nearbySurfaceFingerprint.length
      && after.nearbySurfaceFingerprint !== before.nearbySurfaceFingerprint
    ) {
      return { verified: true, reason: "floating-surface-visible" };
    }
    if (
      before.nearbySurfaceFingerprint.length > 0
      && after.nearbySurfaceFingerprint.length < before.nearbySurfaceFingerprint.length
    ) {
      return { verified: true, reason: "floating-surface-dismissed" };
    }
    if (!before.selectionOn && after.selectionOn) {
      return { verified: true, reason: "cell-selected" };
    }
    if (before.selectionSig !== after.selectionSig) {
      return { verified: true, reason: "selection-toggled" };
    }
    return { verified: false, reason: "no-observable-change" };
  };

  const fingerprintNearbySurfaces = (anchor: HTMLElement): string => {
    const er = anchor.getBoundingClientRect();
    const items: string[] = [];
    for (const node of Array.from(document.querySelectorAll('[role="listbox"], [class*="dropdown"], ul, ol'))) {
      const n = node as HTMLElement;
      const r = n.getBoundingClientRect();
      if (r.width < 32 || r.height < 16) continue;
      const near = r.bottom >= er.top - 24 && r.top <= er.bottom + 320;
      if (near) items.push(`${Math.round(r.top)}:${Math.round(r.left)}`);
    }
    return items.sort().join("|");
  };

  const readSelectionState = (
    anchor: HTMLElement,
  ): { selectionSig: string; selectionOn: boolean } => {
    let node: HTMLElement | null = anchor;
    for (let depth = 0; depth < 6 && node; depth++) {
      const ariaSel = node.getAttribute("aria-selected");
      const ariaPressed = node.getAttribute("aria-pressed");
      const ariaCurrent = node.getAttribute("aria-current");
      const cls = String(node.className || "").toLowerCase();
      const classHit =
        /(^|[\s_-])(selected|is-selected|day-selected|picker-cell-selected|active-day|is-active|chosen)([\s_-]|$)/.test(
          cls,
        ) || /selected|is-selected|day-selected/.test(cls);
      const dataSel =
        node.getAttribute("data-selected") === "true" ||
        node.getAttribute("data-state") === "selected" ||
        node.getAttribute("aria-checked") === "true";
      const selectionOn =
        ariaSel === "true" ||
        ariaPressed === "true" ||
        ariaCurrent === "date" ||
        ariaCurrent === "true" ||
        classHit ||
        dataSel;
      let bg = "";
      try {
        bg = window.getComputedStyle(node).backgroundColor || "";
      } catch {
        bg = "";
      }
      const selectionSig = [
        node.tagName.toLowerCase(),
        ariaSel ?? "",
        ariaPressed ?? "",
        ariaCurrent ?? "",
        classHit ? "cls" : "",
        dataSel ? "data" : "",
        bg,
      ].join(":");
      if (selectionOn || ariaSel != null || ariaPressed != null || classHit || dataSel) {
        return { selectionSig, selectionOn };
      }
      if (
        (node.getAttribute("role") || "").toLowerCase() === "gridcell" ||
        node.tagName === "TD" ||
        node.hasAttribute("data-date")
      ) {
        return { selectionSig, selectionOn };
      }
      node = node.parentElement;
    }
    return { selectionSig: `none:${anchor.tagName.toLowerCase()}`, selectionOn: false };
  };

  const active = document.activeElement as HTMLElement | null;
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const wrap = (el.closest('[aria-haspopup], .t-input, [class*="select"]') as HTMLElement | null) ?? el.parentElement;
  const selState = readSelectionState(el);
  const after: MouseClickVerifySnapshot = {
    href: location.href,
    openDialogCount: document.querySelectorAll("dialog[open]").length,
    activeElementTag:
      active && active !== document.body ? active.tagName.toLowerCase() : "",
    activeElementOnTarget: !!(active && (el === active || el.contains(active))),
    targetAriaExpanded: el.getAttribute("aria-expanded"),
    wrapperAriaExpanded: wrap?.getAttribute("aria-expanded") ?? null,
    hitTargetTag: hit ? hit.tagName.toLowerCase() : "",
    nearbySurfaceFingerprint: fingerprintNearbySurfaces(el),
    selectionSig: selState.selectionSig,
    selectionOn: selState.selectionOn,
  };

  return diffSnapshots(snapshotBefore, after);
}

async function browser_mouse_click(args: Record<string, unknown>): Promise<unknown> {
  const selector = (args.selector as string | undefined) ?? null;
  const text = (args.text as string | undefined) ?? null;
  const offsetX = (args.x as number | undefined) ?? null;
  const offsetY = (args.y as number | undefined) ?? null;
  const button = (args.button as string | undefined) ?? 'left';
  
  const waitMs = typeof args.waitMs === "number" ? args.waitMs : MOUSE_CLICK_VERIFY_WAIT_MS;

  if (!selector && !text) return { error: "selector or text required", implTag: BROWSER_MOUSE_CLICK_TAG };

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab", implTag: BROWSER_MOUSE_CLICK_TAG };

  await ensureClickIndicator(tabId);

  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      world: "MAIN",
      func: mouseClickSyntheticPageAttempt,
      args: [selector, text, offsetX, offsetY, button, waitMs],
    });

    const hit = results?.[0]?.result as Awaited<ReturnType<typeof mouseClickSyntheticPageAttempt>> | null | undefined;
    if (!hit) {
      return { error: "mouse click failed", implTag: BROWSER_MOUSE_CLICK_TAG, selector, text };
    }
    if ("error" in hit) {
      return { ok: false, verified: false, error: hit.error, implTag: BROWSER_MOUSE_CLICK_TAG, selector, text };
    }

    let verified = hit.verified;
    let reason = hit.reason;
    let method: string = hit.method;
    const position = hit.position;

    if (!verified) {
      const cdpResult = await cdpMouseClickSession(tabId, position.x, position.y, button);
      if ("error" in cdpResult) {
        return {
          ok: false,
          verified: false,
          error: cdpResult.error,
          reason,
          position,
          element: hit.element,
          button: hit.button,
          action: hit.action,
          method,
          attempts: [{ method, verified: false, reason }, { method: "cdp-mouse", verified: false, error: cdpResult.error }],
          implTag: BROWSER_MOUSE_CLICK_TAG,
          hint: "合成点击未生效，CDP 坐标点击也失败。",
        };
      }

      method = cdpResult.method;
      await delayMs(waitMs);

      const verifyResults = await (getContext().browser.scripting as any).executeScript({
        target: { tabId },
        world: "MAIN",
        func: mouseClickVerifyAfterPageFunc,
        args: [hit.snapshotBefore, selector, text, position.x, position.y],
      });
      const verifyHit = verifyResults?.[0]?.result as { verified: boolean; reason: string } | undefined;
      if (verifyHit) {
        verified = verifyHit.verified;
        reason = verifyHit.reason;
      }
    }

    const attempts = verified
      ? [{ method, verified: true, reason }]
      : [
          { method: "synthetic", verified: false, reason: hit.reason },
          { method, verified: false, reason },
        ];

    if (!verified) {
      return {
        ok: false,
        verified: false,
        reason,
        position,
        element: hit.element,
        button: hit.button,
        action: hit.action,
        method,
        attempts,
        implTag: BROWSER_MOUSE_CLICK_TAG,
        hint: "点击坐标已执行（含 CDP 兜底），verified 未捕获页面变化。请 browser_screenshot 确认。",
      };
    }

    return {
      ok: true,
      verified: true,
      reason,
      position,
      element: hit.element,
      button: hit.button,
      action: hit.action,
      method,
      attempts,
      implTag: BROWSER_MOUSE_CLICK_TAG,
    };
  } catch (e) {
    return { error: String(e), implTag: BROWSER_MOUSE_CLICK_TAG };
  }
}

// ========== 日期和复杂表单 ==========

async function browser_set_input_value(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  const value = args.value as string | undefined;
  if (!selector) return { error: "selector required" };
  if (value === undefined) return { error: "value required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (!el) return { error: `element not found: ${sel}` };
        
        // 聚焦元素
        el.focus();
        
        // 直接设置值
        el.value = val;
        
        // 触发事件以通知框架
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 对于某些日期输入框，可能还需要触发 blur
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        
        return { ok: true, value: el.value };
      },
      args: [selector, value],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_set_input_user_data(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  const key = args.key as string | undefined;
  if (!selector) return { error: "selector required" };
  if (!key) return { error: "key required" };

  try {
    const store = new TempDataStore();
    const record = await store.get(key);
    if (!record) return { error: "user data not found" };
    return browser_set_input_value({
      selector,
      value: record.value,
      tabId: await getTabIdByConversationId(args.conversationId as string),
    });
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_pick_date(args: Record<string, unknown>): Promise<unknown> {
  const dateText = args.dateText as string;
  const container = (args.container as string | undefined) ?? null;

  if (!dateText) return { error: "dateText required" };

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };

  await ensureClickIndicator(tabId);

  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (dateStr: string, containerSel: string | null) => {
        const root = containerSel ? document.querySelector(containerSel) : document;
        if (!root) return { error: `container not found: ${containerSel}` };

        const dayMatch = dateStr.match(/(\d+)/);
        const dayNum = dayMatch ? dayMatch[1] : dateStr.trim();
        const dayNumNorm = String(Number(dayNum));
        const isPureNumber = /^\d+$/.test(dayNum);

        type ScoredEl = { el: Element; score: number };
        const scored: ScoredEl[] = [];

        const selectors = [
          `[data-date="${dateStr}"]`,
          `[data-day="${dayNum}"]`,
          `[aria-label*="${dateStr}"]`,
          `[aria-label*="${dayNum}"]`,
          `td[data-date]`,
          `.cell`, `.day`, `.date`,
          `[class*="day"]`, `[class*="date"]`, `[class*="picker-cell"]`,
          `button`, `td`,
          `div[role="gridcell"]`,
          `span`,
        ];

        const queryAll = (sel: string): NodeListOf<Element> => {
          try {
            return (root as Element).querySelectorAll?.(sel) || (root as Document).querySelectorAll(sel);
          } catch {
            return document.querySelectorAll('__never__');
          }
        };

        for (const sel of selectors) {
          const els = queryAll(sel);
          for (const el of Array.from(els)) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;

            const txt = (el.textContent || '').trim();
            if (!txt) continue;

            let score = 0;
            if (txt === dayNumNorm || txt === dayNum || txt === dateStr.trim()) score += 100;
            else if (txt.includes(dayNum)) score += 60;

            if (isPureNumber) {
              if (/^\d+$/.test(txt)) score += 20;
              if (rect.width <= 80 && rect.height <= 80) score += 10;
            }

            if (score <= 0) continue;

            // 可点击元素（cursor: pointer）加权
            const elCursor = (el as HTMLElement).style.cursor || style.cursor;
            if (elCursor === 'pointer') score += 30;

            // 父容器级元素（含子节点的 .cell / td）优于内层纯文本节点
            if (el.children.length > 0) score += 15;

            const tag = el.tagName.toLowerCase();
            if (tag === 'td' || tag === 'div' || tag === 'button') score += 5;

            scored.push({ el, score });
          }
        }

        if (scored.length === 0 && isPureNumber) {
          const allEls = queryAll('*');
          for (const el of Array.from(allEls)) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;

            const txt = (el.textContent || '').trim();
            if ((txt === dayNumNorm || txt === dayNum) && rect.width <= 80 && rect.height <= 80) {
              const elCursor = (el as HTMLElement).style.cursor || style.cursor;
              const cursorBonus = elCursor === 'pointer' ? 30 : 0;
              const parentBonus = el.children.length > 0 ? 15 : 0;
              scored.push({ el, score: 80 + cursorBonus + parentBonus });
            }
          }
        }

        if (scored.length === 0) {
          return { error: `no date element found for: ${dateStr}` };
        }

        scored.sort((a, b) => b.score - a.score);
        let target = scored[0].el as HTMLElement;

        // 如果选中的是纯文本叶节点，向上找最近的可点击祖先（.cell / td / [role="gridcell"]）
        if (target.children.length === 0 && target.parentElement) {
          let p: HTMLElement | null = target.parentElement;
          while (p && p !== document.body) {
            const pCursor = p.style.cursor || window.getComputedStyle(p).cursor;
            if (pCursor === 'pointer') { target = p; break; }
            p = p.parentElement;
          }
        }

        const anyTarget: any = target as any;
        if (typeof anyTarget.scrollIntoViewIfNeeded === 'function') {
          anyTarget.scrollIntoViewIfNeeded();
        } else {
          target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        }

        const rect = target.getBoundingClientRect();
        const clickX = rect.left + rect.width / 2;
        const clickY = rect.top + rect.height / 2;

        const eventOptions = {
          bubbles: true, cancelable: true, view: window,
          clientX: clickX, clientY: clickY, button: 0, buttons: 1,
        };

        const g: any = window as any;
        if (g.__showAgentCursor) g.__showAgentCursor(clickX, clickY, 'click');

        if (target.focus) target.focus();
        try {
          target.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
          target.dispatchEvent(new MouseEvent('mouseover', eventOptions));
          target.dispatchEvent(new PointerEvent('pointerdown', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
        } catch { /* ignore */ }
        target.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        try {
          target.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
        } catch { /* ignore */ }
        target.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        target.dispatchEvent(new MouseEvent('click', eventOptions));
        target.click();

        return {
          ok: true,
          clicked: {
            tag: target.tagName,
            text: target.textContent?.trim(),
            class: target.className,
          },
          position: { x: Math.round(clickX), y: Math.round(clickY) },
          candidatesCount: scored.length,
        };
      },
      args: [dateText, container],
    });

    const hit = results?.[0]?.result;

    // MAIN world 兜底：ISOLATED world 的点击可能无法触发页面 JS 事件
    if (hit?.ok) {
      const dayNum = String(Number(dateText.match(/(\d+)/)?.[1] || '0'));
      try {
        await (getContext().browser.scripting as any).executeScript({
          target: { tabId },
          world: 'MAIN',
          func: (day: string, containerSel: string | null) => {
            const root = containerSel ? document.querySelector(containerSel) : document;
            if (!root) return;
            const cells = (root as Element).querySelectorAll
              ? (root as Element).querySelectorAll('.cell, td, [class*="day"], [class*="date-cell"], [class*="picker-cell"], div[role="gridcell"]')
              : (root as Document).querySelectorAll('.cell, td, [class*="day"], [class*="date-cell"], [class*="picker-cell"], div[role="gridcell"]');
            for (const cell of cells) {
              const hc = cell as HTMLElement;
              const cursor = hc.style.cursor || getComputedStyle(hc).cursor;
              if (cursor !== 'pointer') continue;
              if ((hc.textContent || '').trim() === day) { hc.click(); return; }
            }
          },
          args: [dayNum, container],
        });
      } catch {}
    }

    return hit;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_toggle_checkbox(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  const checked = args.checked as boolean | undefined;
  
  if (!selector) return { error: "selector required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string, targetChecked: boolean | undefined) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (!el) return { error: `element not found: ${sel}` };
        
        const type = el.type?.toLowerCase();
        if (type !== 'checkbox' && type !== 'radio') {
          return { error: `element is not checkbox/radio: ${type}` };
        }
        
        const oldChecked = el.checked;
        
        // 设置状态
        if (targetChecked !== undefined) {
          el.checked = targetChecked;
        } else {
          el.checked = !el.checked;
        }
        
        // 触发事件
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 有些框架监听 click 事件
        if (oldChecked !== el.checked) {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
        
        return { 
          ok: true, 
          checked: el.checked,
          type: type,
          name: el.name,
        };
      },
      args: [selector, checked],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_multi_select(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  const values = args.values as string[];
  
  if (!selector) return { error: "selector required" };
  if (!values || !Array.isArray(values)) return { error: "values array required" };
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string, vals: string[]) => {
        const el = document.querySelector(sel) as HTMLSelectElement;
        if (!el) return { error: `element not found: ${sel}` };
        if (el.tagName.toLowerCase() !== 'select') {
          return { error: `element is not a select: ${el.tagName}` };
        }
        
        const selected: string[] = [];
        const notFound: string[] = [];
        
        // 先取消所有选中
        for (const opt of Array.from(el.options)) {
          opt.selected = false;
        }
        
        // 选中指定的值
        for (const val of vals) {
          let found = false;
          for (const opt of Array.from(el.options)) {
            if (opt.value === val || opt.text === val) {
              opt.selected = true;
              selected.push(opt.value);
              found = true;
              break;
            }
          }
          if (!found) notFound.push(val);
        }
        
        // 触发 change 事件
        el.dispatchEvent(new Event('change', { bubbles: true }));
        
        return { 
          ok: true, 
          selected,
          notFound: notFound.length > 0 ? notFound : undefined,
        };
      },
      args: [selector, values],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_get_form_fields(args: Record<string, unknown>): Promise<unknown> {
  const selector = (args.selector as string | undefined) ?? null;
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string | null) => {
        type FieldInfo = {
          type: string;
          name: string;
          id: string;
          value: string;
          placeholder?: string;
          label?: string;
          required?: boolean;
          options?: Array<{ value: string; text: string; selected: boolean }>;
          checked?: boolean;
          selector: string;
        };
        
        const fields: FieldInfo[] = [];
        
        function getLabel(el: HTMLElement): string {
          // 通过 for / aria-labelledby 查找关联 label
          const id = el.id;
          if (id) {
            const labelEl = document.querySelector(`label[for="${id}"]`);
            if (labelEl) return (labelEl.textContent || '').trim();
          }
          // 检查 aria-label
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return ariaLabel;
          // 检查 placeholder
          const placeholder = el.getAttribute('placeholder');
          if (placeholder) return placeholder;
          // 查找最近的 label 祖先
          const parent = el.closest('label');
          if (parent) return (parent.textContent || '').replace((el as any).value || '', '').trim();
          return '';
        }
        
        function processElement(el: HTMLElement) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return;
          
          const htmlEl = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          const type = (htmlEl as HTMLInputElement).type || htmlEl.tagName.toLowerCase();
          
          // 跳过 hidden 类型
          if (type === 'hidden') return;
          
          const selectorStr = htmlEl.id
            ? `#${htmlEl.id}`
            : htmlEl.name
              ? `[name="${htmlEl.name}"]`
              : htmlEl.getAttribute('aria-label')
                ? `[aria-label="${htmlEl.getAttribute('aria-label')}"]`
                : '';
          
          const field: FieldInfo = {
            type,
            name: htmlEl.name || '',
            id: htmlEl.id || '',
            value: htmlEl.value || '',
            selector: selectorStr,
            label: getLabel(el),
          };
          
          if ((htmlEl as HTMLInputElement).placeholder) {
            field.placeholder = (htmlEl as HTMLInputElement).placeholder;
          }
          if (htmlEl.required || htmlEl.getAttribute('aria-required') === 'true') {
            field.required = true;
          }
          if (htmlEl.tagName.toLowerCase() === 'select') {
            const selectEl = htmlEl as HTMLSelectElement;
            field.options = Array.from(selectEl.options).map(opt => ({
              value: opt.value, text: opt.text, selected: opt.selected,
            }));
          }
          if (type === 'checkbox' || type === 'radio') {
            field.checked = (htmlEl as HTMLInputElement).checked;
          }
          
          fields.push(field);
        }
        
        // 方式1：先尝试在指定容器 / <form> 里搜索
        const container = sel ? document.querySelector(sel) : document.querySelector('form');
        if (container) {
          const elements = container.querySelectorAll('input, select, textarea, [contenteditable="true"]');
          for (const el of Array.from(elements)) processElement(el as HTMLElement);
        }
        
        // 方式2：如果 <form> 内没找到字段，则扫描整个页面的可见输入控件
        if (fields.length === 0) {
          const allInputs = document.querySelectorAll(
            'input, select, textarea, [contenteditable="true"], ' +
            '[role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"]'
          );
          for (const el of Array.from(allInputs)) processElement(el as HTMLElement);
        }
        
        return {
          formSelector: sel || (container ? container.tagName.toLowerCase() : 'page-wide'),
          fieldCount: fields.length,
          fields,
        };
      },
      args: [selector],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

// ========== 表单操作 ==========

async function browser_submit_form(args: Record<string, unknown>): Promise<unknown> {
  const selector = (args.selector as string | undefined) ?? null;
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string | null) => {
        const form = sel ? document.querySelector(sel) as HTMLFormElement : document.querySelector("form");
        if (!form) return { error: "form not found" };
        form.submit();
        return { ok: true };
      },
      args: [selector],
    });
    return results?.[0]?.result;
  } catch (e) {
    return { error: String(e) };
  }
}

type PressKeyModifier = "ctrl" | "alt" | "shift" | "meta";

const PRESS_KEY_MODIFIER_BIT: Record<PressKeyModifier, number> = {
  alt: 1,
  ctrl: 2,
  meta: 4,
  shift: 8,
};

const PRESS_KEY_MODIFIER_INFO: Record<PressKeyModifier, { key: string; code: string }> = {
  ctrl: { key: "Control", code: "ControlLeft" },
  alt: { key: "Alt", code: "AltLeft" },
  shift: { key: "Shift", code: "ShiftLeft" },
  meta: { key: "Meta", code: "MetaLeft" },
};

const PRESS_KEY_NAMED: Record<string, { key: string; code: string; windowsVirtualKeyCode: number }> = {
  enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  return: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  numpadenter: { key: "Enter", code: "NumpadEnter", windowsVirtualKeyCode: 13 },
  escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  esc: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  space: { key: " ", code: "Space", windowsVirtualKeyCode: 32 },
  backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  home: { key: "Home", code: "Home", windowsVirtualKeyCode: 36 },
  end: { key: "End", code: "End", windowsVirtualKeyCode: 35 },
  pageup: { key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 },
  pagedown: { key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 },
};

function normalizePressKeyModifier(raw: string): PressKeyModifier | null {
  const s = raw.trim().toLowerCase();
  if (s === "ctrl" || s === "control" || s === "ctl") return "ctrl";
  if (s === "alt" || s === "option") return "alt";
  if (s === "shift") return "shift";
  if (s === "meta" || s === "cmd" || s === "command" || s === "win") return "meta";
  return null;
}

function parsePressKeyShortcut(shortcut: string): { key: string; modifiers: PressKeyModifier[] } | { error: string } {
  const parts = shortcut.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { error: "invalid shortcut" };

  const keyPart = parts[parts.length - 1]!;
  const modifiers: PressKeyModifier[] = [];
  const seen = new Set<PressKeyModifier>();

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = normalizePressKeyModifier(parts[i]!);
    if (!mod) return { error: `unknown modifier: ${parts[i]}` };
    if (!seen.has(mod)) {
      seen.add(mod);
      modifiers.push(mod);
    }
  }

  return { key: keyPart, modifiers };
}

function parsePressKeyModifiersArg(raw: unknown): PressKeyModifier[] {
  if (!Array.isArray(raw)) return [];
  const out: PressKeyModifier[] = [];
  const seen = new Set<PressKeyModifier>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const mod = normalizePressKeyModifier(item);
    if (mod && !seen.has(mod)) {
      seen.add(mod);
      out.push(mod);
    }
  }
  return out;
}

function resolvePressKeyInfo(key: string): { key: string; code: string; windowsVirtualKeyCode: number } {
  const trimmed = key.trim();
  const named = PRESS_KEY_NAMED[trimmed.toLowerCase()];
  if (named) return named;

  if (trimmed.length === 1) {
    if (/[a-z]/i.test(trimmed)) {
      const upper = trimmed.toUpperCase();
      return { key: trimmed.toLowerCase(), code: `Key${upper}`, windowsVirtualKeyCode: upper.charCodeAt(0) };
    }
    if (/[0-9]/.test(trimmed)) {
      return { key: trimmed, code: `Digit${trimmed}`, windowsVirtualKeyCode: trimmed.charCodeAt(0) };
    }
  }

  const fMatch = /^f(\d{1,2})$/i.exec(trimmed);
  if (fMatch) {
    const n = Number(fMatch[1]);
    if (n >= 1 && n <= 24) {
      return { key: `F${n}`, code: `F${n}`, windowsVirtualKeyCode: 111 + n };
    }
  }

  return { key: trimmed, code: trimmed, windowsVirtualKeyCode: trimmed.charCodeAt(0) || 0 };
}

/** CDP keyDown 需要的 text（Enter 缺 `\r` 时很多页面不响应） */
function cdpKeyEventText(keyInfo: { key: string }): string | undefined {
  if (keyInfo.key === "Enter") return "\r";
  if (keyInfo.key === " ") return " ";
  if (keyInfo.key === "Tab") return "\t";
  if (keyInfo.key.length === 1) return keyInfo.key;
  return undefined;
}

/** Enter/Escape：单独 aria-expanded 变化不能当作按键成功（易假阳性） */
function pressKeyIgnoresAriaExpandedAlone(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k === "enter" || k === "escape" || k === "esc" || k === "tab";
}

function pressKeyModifierBitmask(mods: PressKeyModifier[]): number {
  return mods.reduce((bit, mod) => bit | PRESS_KEY_MODIFIER_BIT[mod], 0);
}

/** MAIN world：focus 按键目标（优先内层 input/textarea，不 click 避免 TDesign 外层误触） */
function focusPressKeyTargetPageFunc(sel: string): { ok: true; focused: boolean; targetTag: string } | null {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return null;

  const resolveFocusable = (node: HTMLElement): HTMLElement => {
    if (node.matches('input, textarea, [contenteditable="true"], [contenteditable=""]')) return node;
    const inner = node.querySelector(
      'input, textarea, [contenteditable="true"], [contenteditable=""]',
    ) as HTMLElement | null;
    return inner ?? node;
  };

  const target = resolveFocusable(el);
  target.focus();
  const active = document.activeElement as HTMLElement | null;
  const focused = active === target || el.contains(active);
  return { ok: true, focused, targetTag: target.tagName.toLowerCase() };
}

async function focusPressKeyTarget(tabId: number, selector: string | null): Promise<unknown> {
  if (!selector) return { ok: true };
  const results = await (getContext().browser.scripting as any).executeScript({
    target: { tabId },
    world: "MAIN",
    func: focusPressKeyTargetPageFunc,
    args: [selector],
  });
  const hit = results?.[0]?.result;
  if (!hit) return { error: `element not found: ${selector}` };
  if (hit && typeof hit === "object" && "error" in (hit as Record<string, unknown>)) return hit;
  return hit ?? { error: "focus failed" };
}

/** CDP Input.dispatchKeyEvent — 组合键与富文本快捷键（isTrusted 级输入管线） */
async function cdpDispatchKeySession(
  tabId: number,
  keyInfo: { key: string; code: string; windowsVirtualKeyCode: number },
  modifiers: PressKeyModifier[],
): Promise<{ ok: true; method: "cdp" } | { error: string }> {
  const dbg = (getContext().browser as any).debugger;
  if (!dbg?.attach || !dbg?.sendCommand || !dbg?.detach) {
    return { error: "debugger API unavailable" };
  }

  let attached = false;
  const modBitmask = pressKeyModifierBitmask(modifiers);

  const dispatch = async (payload: Record<string, unknown>) => {
    await dbg.sendCommand({ tabId }, "Input.dispatchKeyEvent", payload);
  };

  try {
    await cdpAttachTab(dbg, tabId);
    attached = true;

    for (const mod of modifiers) {
      const info = PRESS_KEY_MODIFIER_INFO[mod];
      await dispatch({ type: "keyDown", key: info.key, code: info.code });
    }

    const textPayload = cdpKeyEventText(keyInfo);
    await dispatch({
      type: "keyDown",
      key: keyInfo.key,
      code: keyInfo.code,
      windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
      nativeVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
      modifiers: modBitmask,
      ...(textPayload ? { text: textPayload, unmodifiedText: textPayload } : {}),
    });

    // 部分站点依赖 char 事件（尤其 Enter）
    if (textPayload && modifiers.length === 0) {
      await dispatch({
        type: "char",
        text: textPayload,
        unmodifiedText: textPayload,
        key: keyInfo.key,
        code: keyInfo.code,
        windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
        nativeVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
        modifiers: modBitmask,
      });
    }

    await dispatch({
      type: "keyUp",
      key: keyInfo.key,
      code: keyInfo.code,
      windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
      nativeVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
      modifiers: modBitmask,
    });

    for (let i = modifiers.length - 1; i >= 0; i--) {
      const mod = modifiers[i]!;
      const info = PRESS_KEY_MODIFIER_INFO[mod];
      const heldBitmask = pressKeyModifierBitmask(modifiers.slice(0, i));
      await dispatch({
        type: "keyUp",
        key: info.key,
        code: info.code,
        modifiers: heldBitmask,
      });
    }

    return { ok: true, method: "cdp" };
  } catch (e) {
    return { error: String(e) };
  } finally {
    if (attached) {
      try { await dbg.detach({ tabId }); } catch { /* ignore */ }
    }
  }
}

const BROWSER_PRESS_KEY_UNIFIED_TAG = "press-key-unified-v1";
const PRESS_KEY_VERIFY_WAIT_MS = 300;
const PRESS_KEY_TAB_WATCH_MS = 400;
/** type 后立刻 press_key 时页面常未消化输入，先等再按 */
const PRESS_KEY_PRE_DELAY_MS = 1000;
const PRESS_KEY_INDEX_RESCREEN_HINT =
  "未找到对应 SoM 编号，按键未执行。请先 browser_screenshot 重新获取标注，在 elements 映射中确认目标 index 后再 browser_press_key({ index })。";

type PressKeyVerifySnapshot = {
  href: string;
  openDialogCount: number;
  activeElementTag: string;
  activeElementOnTarget: boolean;
  activeElementValue: string;
  activeElementChecked: boolean | null;
  targetAriaExpanded: string | null;
  wrapperAriaExpanded: string | null;
  nearbySurfaceFingerprint: string;
};

type PressKeyPageAttemptResult = {
  ok: boolean;
  error?: string;
  elementNotFound?: boolean;
  verified?: boolean;
  reason?: string;
  method?: "synthetic";
  snapshotBefore?: PressKeyVerifySnapshot;
  target?: { tag: string; id?: string; focused?: boolean };
  key?: string;
  modifiers?: string[];
};

/** MAIN world：focus + synthetic 按键 + verified */
async function pressKeySyntheticPageAttempt(
  sel: string | null,
  key: string,
  code: string,
  modifiers: string[],
  waitMs: number,
  windowsVirtualKeyCode: number,
): Promise<PressKeyPageAttemptResult> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const modSet = new Set(modifiers.map((m) => m.toLowerCase()));
  const ignoreAriaExpanded =
    (() => {
      const k = key.trim().toLowerCase();
      return k === "enter" || k === "escape" || k === "esc" || k === "tab";
    })();

  const fingerprintNearbySurfaces = (anchor: HTMLElement): string => {
    const er = anchor.getBoundingClientRect();
    const items: string[] = [];
    const menuSel =
      '[role="menu"], [role="listbox"], [role="dialog"], [class*="dropdown"], [class*="popover"], [class*="picker"], ul, ol';
    for (const candidate of Array.from(document.querySelectorAll(menuSel))) {
      const node = candidate as HTMLElement;
      if (node === anchor || anchor.contains(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 32 || r.height < 16) continue;
      const st = window.getComputedStyle(node);
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") continue;
      const near =
        r.bottom >= er.top - 24 && r.top <= er.bottom + 320
        && r.right >= er.left - 60 && r.left <= er.right + 60;
      if (!near) continue;
      items.push(`${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`);
    }
    items.sort();
    return items.join("|");
  };

  const diffSnapshots = (
    before: PressKeyVerifySnapshot,
    after: PressKeyVerifySnapshot,
  ): { verified: boolean; reason: string } => {
    if (before.href !== after.href) return { verified: true, reason: "href-changed" };
    if (after.openDialogCount > before.openDialogCount) return { verified: true, reason: "dialog-opened" };
    if (before.activeElementTag !== after.activeElementTag && after.activeElementTag) {
      return { verified: true, reason: "focus-moved" };
    }
    if (!before.activeElementOnTarget && after.activeElementOnTarget) {
      return { verified: true, reason: "focus-moved" };
    }
    if (before.activeElementValue !== after.activeElementValue) {
      return { verified: true, reason: "value-changed" };
    }
    if (before.activeElementChecked !== after.activeElementChecked && after.activeElementChecked != null) {
      return { verified: true, reason: "checked-changed" };
    }
    if (
      after.nearbySurfaceFingerprint.length > before.nearbySurfaceFingerprint.length
      && after.nearbySurfaceFingerprint !== before.nearbySurfaceFingerprint
    ) {
      return { verified: true, reason: "floating-surface-visible" };
    }
    if (
      before.nearbySurfaceFingerprint.length > 0
      && after.nearbySurfaceFingerprint.length < before.nearbySurfaceFingerprint.length
    ) {
      return { verified: true, reason: "floating-surface-dismissed" };
    }
    if (!ignoreAriaExpanded) {
      if (before.targetAriaExpanded !== after.targetAriaExpanded) {
        return { verified: true, reason: "aria-expanded-changed" };
      }
      if (before.wrapperAriaExpanded !== after.wrapperAriaExpanded) {
        return { verified: true, reason: "trigger-wrapper-expanded-changed" };
      }
    }
    return { verified: false, reason: "no-observable-change" };
  };

  const takeSnapshot = (anchor: HTMLElement): PressKeyVerifySnapshot => {
    const active = document.activeElement as HTMLElement | null;
    const wrap = (anchor.closest(
      '[aria-haspopup], [role="combobox"], .t-input, [class*="select"], [class*="picker"]',
    ) as HTMLElement | null) ?? anchor.parentElement;
    const inputLike = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active
      : null;
    const checkLike = active instanceof HTMLInputElement
      && (active.type === "checkbox" || active.type === "radio")
      ? active
      : null;
    return {
      href: location.href,
      openDialogCount: document.querySelectorAll("dialog[open]").length,
      activeElementTag:
        active && active !== document.body
          ? active.tagName.toLowerCase() + (active.id ? `#${active.id}` : "")
          : "",
      activeElementOnTarget: !!(
        active && active !== document.body && (anchor === active || anchor.contains(active))
      ),
      activeElementValue: inputLike ? inputLike.value : "",
      activeElementChecked: checkLike ? checkLike.checked : null,
      targetAriaExpanded: anchor.getAttribute("aria-expanded"),
      wrapperAriaExpanded: wrap?.getAttribute("aria-expanded") ?? null,
      nearbySurfaceFingerprint: fingerprintNearbySurfaces(anchor),
    };
  };

  let anchor: HTMLElement | null = null;
  let target: HTMLElement;

  const resolveFocusable = (node: HTMLElement): HTMLElement => {
    if (node.matches('input, textarea, [contenteditable="true"], [contenteditable=""]')) return node;
    const inner = node.querySelector(
      'input, textarea, [contenteditable="true"], [contenteditable=""]',
    ) as HTMLElement | null;
    return inner ?? node;
  };

  if (sel) {
    anchor = document.querySelector(sel) as HTMLElement | null;
    if (!anchor) return { ok: false, elementNotFound: true, error: `element not found: ${sel}` };
    target = resolveFocusable(anchor);
    target.focus();
  } else {
    anchor = (document.activeElement as HTMLElement | null) ?? document.body;
    target = anchor;
  }

  const snapshotBefore = takeSnapshot(anchor);

  const vk = windowsVirtualKeyCode || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);

  const eventInit: KeyboardEventInit & { keyCode?: number; which?: number; charCode?: number } = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ctrlKey: modSet.has("ctrl"),
    altKey: modSet.has("alt"),
    shiftKey: modSet.has("shift"),
    metaKey: modSet.has("meta"),
    keyCode: vk,
    which: vk,
  };

  target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  // 兼容仍监听 keypress / keyCode===13 的站点（搜索框、表单提交）
  if (key === "Enter" || key === " " || key === "Spacebar") {
    target.dispatchEvent(
      new KeyboardEvent("keypress", {
        ...eventInit,
        charCode: key === "Enter" ? 13 : vk,
      }),
    );
  }
  target.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  // 注意：不要 requestSubmit/form.submit——Gmail 等 SPA 会被原生提交整页刷新；
  // Enter 生效依赖上方 key 事件 + CDP text:\r 兜底。

  const deadline = Date.now() + Math.max(0, waitMs);
  let verify = { verified: false, reason: "no-observable-change" };
  while (Date.now() <= deadline) {
    verify = diffSnapshots(snapshotBefore, takeSnapshot(anchor));
    if (verify.verified) break;
    if (Date.now() + 50 > deadline) break;
    await sleep(50);
  }

  return {
    ok: true,
    verified: verify.verified,
    reason: verify.reason,
    method: "synthetic",
    snapshotBefore,
    target: {
      tag: target.tagName.toLowerCase(),
      id: target.id || undefined,
      focused: document.activeElement === target,
    },
    key,
    modifiers,
  };
}

/** MAIN world：CDP 后复验 */
function pressKeyVerifyAfterPageFunc(
  snapshotBefore: PressKeyVerifySnapshot,
  sel: string | null,
  keyName: string,
): { verified: boolean; reason: string } {
  let anchor: HTMLElement | null = sel
    ? document.querySelector(sel) as HTMLElement
    : (document.activeElement as HTMLElement | null) ?? document.body;
  if (!anchor) return { verified: false, reason: "anchor-lost" };

  const ignoreAria =
    (() => {
      const k = String(keyName ?? "").trim().toLowerCase();
      return k === "enter" || k === "escape" || k === "esc" || k === "tab";
    })();

  const diffSnapshots = (
    before: PressKeyVerifySnapshot,
    after: PressKeyVerifySnapshot,
  ): { verified: boolean; reason: string } => {
    if (before.href !== after.href) return { verified: true, reason: "href-changed" };
    if (after.openDialogCount > before.openDialogCount) return { verified: true, reason: "dialog-opened" };
    if (before.activeElementTag !== after.activeElementTag && after.activeElementTag) {
      return { verified: true, reason: "focus-moved" };
    }
    if (!before.activeElementOnTarget && after.activeElementOnTarget) {
      return { verified: true, reason: "focus-moved" };
    }
    if (before.activeElementValue !== after.activeElementValue) {
      return { verified: true, reason: "value-changed" };
    }
    if (before.activeElementChecked !== after.activeElementChecked && after.activeElementChecked != null) {
      return { verified: true, reason: "checked-changed" };
    }
    if (
      after.nearbySurfaceFingerprint.length > before.nearbySurfaceFingerprint.length
      && after.nearbySurfaceFingerprint !== before.nearbySurfaceFingerprint
    ) {
      return { verified: true, reason: "floating-surface-visible" };
    }
    if (
      before.nearbySurfaceFingerprint.length > 0
      && after.nearbySurfaceFingerprint.length < before.nearbySurfaceFingerprint.length
    ) {
      return { verified: true, reason: "floating-surface-dismissed" };
    }
    if (!ignoreAria) {
      if (before.targetAriaExpanded !== after.targetAriaExpanded) {
        return { verified: true, reason: "aria-expanded-changed" };
      }
      if (before.wrapperAriaExpanded !== after.wrapperAriaExpanded) {
        return { verified: true, reason: "trigger-wrapper-expanded-changed" };
      }
    }
    return { verified: false, reason: "no-observable-change" };
  };

  const fingerprintNearbySurfaces = (el: HTMLElement): string => {
    const er = el.getBoundingClientRect();
    const items: string[] = [];
    for (const node of Array.from(document.querySelectorAll('[role="listbox"], [class*="dropdown"], ul, ol'))) {
      const n = node as HTMLElement;
      const r = n.getBoundingClientRect();
      if (r.width < 32 || r.height < 16) continue;
      const near = r.bottom >= er.top - 24 && r.top <= er.bottom + 320;
      if (near) items.push(`${Math.round(r.top)}:${Math.round(r.left)}`);
    }
    return items.sort().join("|");
  };

  const active = document.activeElement as HTMLElement | null;
  const wrap = (anchor.closest('[aria-haspopup], .t-input, [class*="select"]') as HTMLElement | null) ?? anchor.parentElement;
  const inputLike = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
  const checkLike = active instanceof HTMLInputElement
    && (active.type === "checkbox" || active.type === "radio")
    ? active
    : null;
  const after: PressKeyVerifySnapshot = {
    href: location.href,
    openDialogCount: document.querySelectorAll("dialog[open]").length,
    activeElementTag:
      active && active !== document.body ? active.tagName.toLowerCase() : "",
    activeElementOnTarget: !!(active && (anchor === active || anchor.contains(active))),
    activeElementValue: inputLike ? inputLike.value : "",
    activeElementChecked: checkLike ? checkLike.checked : null,
    targetAriaExpanded: anchor.getAttribute("aria-expanded"),
    wrapperAriaExpanded: wrap?.getAttribute("aria-expanded") ?? null,
    nearbySurfaceFingerprint: fingerprintNearbySurfaces(anchor),
  };

  return diffSnapshots(snapshotBefore, after);
}

function pickPressKeyFrameResult(
  results: Array<{ frameId: number; result: unknown }>,
): { frameId: number; result: PressKeyPageAttemptResult } | null {
  const hits = results
    .map((r) => ({ frameId: r.frameId, result: r.result as PressKeyPageAttemptResult | null }))
    .filter((r) => r.result != null) as Array<{ frameId: number; result: PressKeyPageAttemptResult }>;
  if (hits.length === 0) return null;

  const okHits = hits.filter((h) => h.result.ok);
  const pool = okHits.length > 0 ? okHits : hits;
  const verified = pool.find((h) => h.result.verified);
  if (verified) return verified;
  const notFound = pool.find((h) => h.result.elementNotFound);
  if (notFound && okHits.length === 0) return notFound;
  return pool[0];
}

function buildPressKeyHint(
  verified: boolean,
  reason: string,
  tabOutcome: TabOutcome,
  somIndex?: number,
): string | undefined {
  if (verified && reason === "new-tab-opened" && tabOutcome.newTabs[0]) {
    const t = tabOutcome.newTabs[0];
    return `按键已打开新 tab (id=${t.tabId}${t.url ? `, url=${t.url}` : ""})。当前会话仍绑定原 tab。`;
  }
  if (verified && reason === "same-tab-navigated" && tabOutcome.sameTabNavigation) {
    return `当前 tab 已导航至 ${tabOutcome.sameTabNavigation.url}。可 browser_screenshot 确认。`;
  }
  if (!verified && reason === "no-observable-change") {
    return somIndex != null
      ? "按键已执行（含 CDP 兜底），verified 未捕获页面变化。请 browser_screenshot 确认；勿盲目重复按同一 index。"
      : "按键已执行（含 CDP 兜底），verified 未捕获页面变化。请 browser_screenshot 确认。";
  }
  return undefined;
}

function formatPressKeyShortcut(key: string, modifiers: PressKeyModifier[]): string {
  const parts = modifiers.map((m) => (m === "ctrl" ? "Ctrl" : m.charAt(0).toUpperCase() + m.slice(1)));
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

async function focusPressKeyTargetAllFrames(
  tabId: number,
  selector: string,
): Promise<{ ok: true; frameId: number } | { error: string }> {
  const results = await execAllFramesPerFrame(
    tabId,
    {
      world: "MAIN",
      func: focusPressKeyTargetPageFunc,
      args: [selector],
    },
    { perFrameMs: 1000 },
  );
  const hit = results.find((r) => r.result && typeof r.result === "object" && (r.result as { ok?: boolean }).ok);
  if (!hit) return { error: `element not found: ${selector}` };
  return { ok: true, frameId: hit.frameId };
}

async function execPressKeyScript(
  tabId: number,
  selector: string | null,
  scriptDef: {
    func: (...args: any[]) => unknown;
    args: unknown[];
  },
  options?: { perFrameMs?: number },
): Promise<Array<{ frameId: number; result: unknown }>> {
  if (selector) {
    return execAllFramesPerFrame(tabId, { world: "MAIN", ...scriptDef }, options);
  }
  const results = await (getContext().browser.scripting as any).executeScript({
    target: { tabId },
    world: "MAIN",
    func: scriptDef.func,
    args: scriptDef.args,
  });
  return [{ frameId: 0, result: results?.[0]?.result }];
}

async function browser_pressKeyCore(
  args: Record<string, unknown>,
  meta: { somIndex?: number } = {},
): Promise<unknown> {
  const selector = (args.selector as string | undefined) ?? null;
  const shortcutArg = typeof args.shortcut === "string" ? args.shortcut.trim() : "";
  const waitMs = typeof args.waitMs === "number" ? args.waitMs : PRESS_KEY_VERIFY_WAIT_MS;
  const somIndex = meta.somIndex;

  let key = typeof args.key === "string" ? args.key.trim() : "";
  let modifiers = parsePressKeyModifiersArg(args.modifiers);

  if (shortcutArg) {
    const parsed = parsePressKeyShortcut(shortcutArg);
    if ("error" in parsed) return { ...parsed, implTag: BROWSER_PRESS_KEY_UNIFIED_TAG };
    key = parsed.key;
    modifiers = parsed.modifiers;
  } else if (key.includes("+")) {
    const parsed = parsePressKeyShortcut(key);
    if (!("error" in parsed)) {
      key = parsed.key;
      modifiers = parsed.modifiers;
    }
  }

  if (!key) return { error: "key or shortcut required", implTag: BROWSER_PRESS_KEY_UNIFIED_TAG };

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab", implTag: BROWSER_PRESS_KEY_UNIFIED_TAG };

  await delayMs(PRESS_KEY_PRE_DELAY_MS);

  let windowId: number;
  let urlBefore: string | undefined;
  try {
    const tab = await getTabById(tabId);
    windowId = tab.windowId;
    urlBefore = typeof tab.url === "string" ? tab.url : undefined;
  } catch (e) {
    return { error: String(e), implTag: BROWSER_PRESS_KEY_UNIFIED_TAG };
  }

  const keyInfo = resolvePressKeyInfo(key);
  const modifierStrs = modifiers as string[];
  const tabsBeforeList = await tabsQuery({ windowId });
  const tabsBefore = new Set(
    tabsBeforeList.map((t) => t.id).filter((id): id is number => typeof id === "number"),
  );

  type AttemptRecord = { method: string; verified: boolean; reason?: string; frameId?: number; error?: string };
  const attempts: AttemptRecord[] = [];
  let lastFrameHit: { frameId: number; result: PressKeyPageAttemptResult } | null = null;
  let lastTabOutcome: TabOutcome = { newTabs: [] };
  let lastVerify = { verified: false, reason: "no-observable-change" };
  let method = "synthetic";
  let snapshotBefore: PressKeyVerifySnapshot | undefined;

  try {
    const frameHitRef: { hit: { frameId: number; result: PressKeyPageAttemptResult } | null } = { hit: null };

    lastTabOutcome = await watchClickTabOutcomeDuring(
      tabId,
      windowId,
      tabsBefore,
      urlBefore,
      async () => {
        const results = await execPressKeyScript(
          tabId,
          selector,
          {
            func: pressKeySyntheticPageAttempt,
            args: [selector, keyInfo.key, keyInfo.code, modifierStrs, waitMs, keyInfo.windowsVirtualKeyCode],
          },
          { perFrameMs: waitMs + 1500 },
        );
        frameHitRef.hit = pickPressKeyFrameResult(results);
      },
      PRESS_KEY_TAB_WATCH_MS,
    );

    lastFrameHit = frameHitRef.hit;

    if (!lastFrameHit) {
      const isSom = somIndex != null;
      return {
        ok: false,
        verified: false,
        reason: "element-not-found",
        error: isSom
          ? `未找到编号 [${somIndex}] 的元素（页面可能已变化，请重新截图）`
          : selector
            ? `element not found: ${selector}`
            : "press key failed",
        hint: isSom ? PRESS_KEY_INDEX_RESCREEN_HINT : undefined,
        selector,
        ...(isSom ? { index: somIndex, somIndex } : {}),
        key: keyInfo.key,
        modifiers,
        implTag: BROWSER_PRESS_KEY_UNIFIED_TAG,
        attempts,
      };
    }

    const page = lastFrameHit.result;
    snapshotBefore = page.snapshotBefore;

    if (!page.ok) {
      attempts.push({
        method: "synthetic",
        verified: false,
        reason: page.elementNotFound ? "element-not-found" : page.error,
        frameId: lastFrameHit.frameId,
      });
      const isSom = somIndex != null;
      return {
        ok: false,
        verified: false,
        reason: page.elementNotFound ? "element-not-found" : undefined,
        error: page.error,
        hint: page.elementNotFound && isSom ? PRESS_KEY_INDEX_RESCREEN_HINT : undefined,
        selector,
        ...(isSom ? { index: somIndex, somIndex } : {}),
        key: keyInfo.key,
        modifiers,
        implTag: BROWSER_PRESS_KEY_UNIFIED_TAG,
        frameId: lastFrameHit.frameId,
        attempts,
      };
    }

    lastVerify = mergeClickDomAndTabOutcome({
      domChanged: !!page.verified,
      domReason: (page.reason as DomChangeReason | undefined) ?? null,
      tabOutcome: lastTabOutcome,
      opensNewTab: false,
    });
    attempts.push({
      method: "synthetic",
      verified: lastVerify.verified,
      reason: lastVerify.reason,
      frameId: lastFrameHit.frameId,
    });

    if (!lastVerify.verified) {
      if (selector) {
        const focusResult = await focusPressKeyTargetAllFrames(tabId, selector);
        if ("error" in focusResult) {
          return {
            ok: false,
            verified: false,
            error: focusResult.error,
            selector,
            ...(somIndex != null ? { index: somIndex, somIndex } : {}),
            key: keyInfo.key,
            modifiers,
            implTag: BROWSER_PRESS_KEY_UNIFIED_TAG,
            attempts,
          };
        }
      }

      let cdpTabOutcome: TabOutcome = { newTabs: [] };
      let cdpError: string | undefined;

      cdpTabOutcome = await watchClickTabOutcomeDuring(
        tabId,
        windowId,
        tabsBefore,
        urlBefore,
        async () => {
          const cdpResult = await cdpDispatchKeySession(tabId, keyInfo, modifiers);
          if ("error" in cdpResult) cdpError = cdpResult.error;
        },
        PRESS_KEY_TAB_WATCH_MS,
      );

      if (cdpError) {
        attempts.push({ method: "cdp", verified: false, error: cdpError });
        return {
          ok: false,
          verified: false,
          error: cdpError,
          reason: lastVerify.reason,
          selector,
          ...(somIndex != null ? { index: somIndex, somIndex } : {}),
          key: keyInfo.key,
          modifiers,
          shortcut: formatPressKeyShortcut(keyInfo.key, modifiers),
          implTag: BROWSER_PRESS_KEY_UNIFIED_TAG,
          attempts,
          hint: "合成按键未生效，CDP 按键也失败。",
        };
      }

      method = "cdp";
      await delayMs(waitMs);

      if (snapshotBefore) {
        const verifyResults = await execPressKeyScript(
          tabId,
          selector,
          {
            func: pressKeyVerifyAfterPageFunc,
            args: [snapshotBefore, selector, keyInfo.key],
          },
          { perFrameMs: waitMs + 500 },
        );
        const verifyHit = verifyResults
          .map((r) => r.result as { verified: boolean; reason: string } | null)
          .find((r) => r != null);
        if (verifyHit) {
          const domVerify = verifyHit.verified
            ? { verified: true, reason: verifyHit.reason }
            : { verified: false, reason: verifyHit.reason };
          lastVerify = mergeClickDomAndTabOutcome({
            domChanged: domVerify.verified,
            domReason: (domVerify.reason as DomChangeReason) ?? null,
            tabOutcome: cdpTabOutcome,
            opensNewTab: false,
          });
        } else {
          lastVerify = mergeClickDomAndTabOutcome({
            domChanged: false,
            domReason: null,
            tabOutcome: cdpTabOutcome,
            opensNewTab: false,
          });
        }
      } else {
        lastVerify = mergeClickDomAndTabOutcome({
          domChanged: false,
          domReason: null,
          tabOutcome: cdpTabOutcome,
          opensNewTab: false,
        });
      }

      lastTabOutcome = cdpTabOutcome;
      attempts.push({
        method: "cdp",
        verified: lastVerify.verified,
        reason: lastVerify.reason,
        frameId: lastFrameHit.frameId,
      });
    }

    const hint = buildPressKeyHint(lastVerify.verified, lastVerify.reason, lastTabOutcome, somIndex);
    const shortcut = formatPressKeyShortcut(keyInfo.key, modifiers);

    if (!lastVerify.verified) {
      return {
        ok: false,
        verified: false,
        reason: lastVerify.reason,
        selector,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        key: keyInfo.key,
        modifiers,
        shortcut,
        method,
        target: page.target,
        implTag: BROWSER_PRESS_KEY_UNIFIED_TAG,
        frameId: lastFrameHit.frameId,
        attempts,
        tabOutcome: lastTabOutcome.newTabs.length > 0
          ? { newTabId: lastTabOutcome.newTabs[0].tabId, newTabUrl: lastTabOutcome.newTabs[0].url }
          : lastTabOutcome.sameTabNavigation
            ? { navigatedUrl: lastTabOutcome.sameTabNavigation.url }
            : undefined,
        hint,
      };
    }

    return {
      ok: true,
      verified: true,
      reason: lastVerify.reason,
      selector,
      ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      key: keyInfo.key,
      modifiers,
      shortcut,
      method,
      target: page.target,
      implTag: BROWSER_PRESS_KEY_UNIFIED_TAG,
      frameId: lastFrameHit.frameId,
      attempts,
      tabOutcome: lastTabOutcome.newTabs.length > 0
        ? { newTabId: lastTabOutcome.newTabs[0].tabId, newTabUrl: lastTabOutcome.newTabs[0].url }
        : lastTabOutcome.sameTabNavigation
          ? { navigatedUrl: lastTabOutcome.sameTabNavigation.url }
          : undefined,
      hint,
    };
  } catch (e) {
    return { error: String(e), implTag: BROWSER_PRESS_KEY_UNIFIED_TAG };
  }
}

async function browser_press_key(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveSomLocatorArgs(args, {
    requireLocator: false,
    implTag: BROWSER_PRESS_KEY_UNIFIED_TAG,
  });
  if (!resolved.ok) return resolved;
  return browser_pressKeyCore(resolved.args, { somIndex: resolved.somIndex });
}

async function browser_press_key_index(args: Record<string, unknown>): Promise<unknown> {
  // 兼容旧 tool 名：转委托 browser_press_key
  return browser_press_key(args);
}

// ========== 截图 ==========

/** 后台 tab html2canvas 易被浏览器限速，需比 active tab 更长等待 */
const INACTIVE_TAB_CAPTURE_TIMEOUT_MS = 12_000;
const SCREENSHOT_CAPTURE_SCRIPT_FILE = "source/inject/screenshot.capture.js";
const TAB_CAPTURE_READY_TIMEOUT_MS = 30_000;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCapturableWebTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

async function waitForTabCaptureReady(tabId: number): Promise<any> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TAB_CAPTURE_READY_TIMEOUT_MS) {
    const tab = await getTabById(tabId);
    if (tab.discarded) {
      logScreenshot("waitForTabCaptureReady:reload-discarded", { tabId });
      console.warn("[PANEL-RELOAD][sw] screenshot reload discarded tab", {
        tabId,
        url: tab?.url,
        t: Date.now(),
      });
      panelReloadLog("sw", "screenshot reload discarded tab", {
        tabId,
        url: tab?.url,
      });
      await new Promise<void>((resolve, reject) => {
        getContext().browser.tabs.reload(tabId, {}, () => {
          const lastError = getContext().browser.runtime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
      });
      await delayMs(400);
      continue;
    }
    // 本函数仅服务未激活 tab 的 content script 截图：有可注入的 http(s) 页即可。
    // 不必等 status===complete（后台/折叠组常长期停在 loading，但 DOM 已可 executeScript）。
    if (isCapturableWebTabUrl(tab.url)) {
      if (tab.status !== "complete") {
        logScreenshot("waitForTabCaptureReady:allow-loading", {
          tabId,
          status: tab.status,
          url: tab.url,
          waitedMs: Date.now() - startedAt,
        });
      }
      return tab;
    }
    await delayMs(200);
  }
  throw new Error("tab not ready for capture");
}

function pingScreenshotCaptureScript(tabId: number, timeoutMs = 4000): Promise<boolean> {
  const startedAt = Date.now();
  return execWithTimeout(
    (getContext().browser.scripting as any)
      .executeScript({
        target: { tabId, allFrames: false },
        func: () => typeof (globalThis as any).__domaCaptureViewport === "function",
      })
      .then((results: Array<{ result?: unknown }> | null) => {
        const ok = !!results?.[0]?.result;
        logScreenshot("pingScreenshotCaptureScript", {
          tabId,
          ok,
          elapsedMs: Date.now() - startedAt,
        });
        return ok;
      })
      .catch((e: unknown) => {
        logScreenshot("pingScreenshotCaptureScript", {
          tabId,
          ok: false,
          elapsedMs: Date.now() - startedAt,
          error: e instanceof Error ? e.message : String(e),
        });
        return false;
      }),
    timeoutMs,
    false,
  );
}

async function ensureScreenshotCaptureScript(tabId: number): Promise<string | null> {
  let tab: any;
  try {
    tab = await waitForTabCaptureReady(tabId);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logScreenshot("ensureScreenshotCaptureScript:tab-not-ready", { tabId, error });
    return error;
  }

  if (!isCapturableWebTabUrl(tab.url)) {
    const error = `uncapturable tab url: ${tab.url ?? "unknown"}`;
    logScreenshot("ensureScreenshotCaptureScript:bad-url", { tabId, url: tab.url, error });
    return error;
  }

  if (await pingScreenshotCaptureScript(tabId)) {
    logScreenshot("ensureScreenshotCaptureScript:ready", { tabId });
    return null;
  }

  logScreenshot("ensureScreenshotCaptureScript:inject", {
    tabId,
    file: SCREENSHOT_CAPTURE_SCRIPT_FILE,
    url: tab.url,
  });

  try {
    await (getContext().browser.scripting as any).executeScript({
      target: { tabId, allFrames: false },
      files: [SCREENSHOT_CAPTURE_SCRIPT_FILE],
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logScreenshot("ensureScreenshotCaptureScript:inject-fail", { tabId, error });
    return error;
  }

  await delayMs(150);

  if (!(await pingScreenshotCaptureScript(tabId))) {
    const error = "screenshot capture content script unavailable";
    logScreenshot("ensureScreenshotCaptureScript:inject-no-pong", { tabId, error });
    return error;
  }

  logScreenshot("ensureScreenshotCaptureScript:inject-ok", { tabId });
  return null;
}

/** 未激活 tab：executeScript 调 __domaCaptureViewport，避开 sendMessage 异步通道被其它 listener 抢占 */
async function captureInactiveTabViaExecuteScript(
  tabId: number,
  quality = 70,
): Promise<{ ok?: boolean; dataUrl?: string; error?: string; captureSource?: string; elapsedMs?: number }> {
  const startedAt = Date.now();
  const results = await execWithTimeout<any>(
    (getContext().browser.scripting as any).executeScript({
      target: { tabId, allFrames: false },
      func: async (qualityPct: number) => {
        const t0 = performance.now();
        try {
          const capture = (globalThis as any).__domaCaptureViewport;
          if (typeof capture !== "function") {
            return { ok: false, error: "capture function not loaded", elapsedMs: 0 };
          }
          const dataUrl = await capture(qualityPct / 100);
          return {
            ok: true,
            dataUrl,
            captureSource: "executeScript",
            elapsedMs: Math.round(performance.now() - t0),
          };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            elapsedMs: Math.round(performance.now() - t0),
          };
        }
      },
      args: [quality],
    }),
    INACTIVE_TAB_CAPTURE_TIMEOUT_MS,
    null,
  );

  const response = results?.[0]?.result as
    | { ok?: boolean; dataUrl?: string; error?: string; captureSource?: string; elapsedMs?: number }
    | undefined;

  logScreenshot("captureInactiveTabViaExecuteScript:done", {
    tabId,
    elapsedMs: Date.now() - startedAt,
    ok: response?.ok,
    error: response?.error,
    hasDataUrl: typeof response?.dataUrl === "string",
    contentScriptElapsedMs: response?.elapsedMs,
  });

  if (!response) {
    return { ok: false, error: "inactive tab capture timeout" };
  }
  return response;
}

/** 通知侧栏临时禁止 onActivated 绑面板（截图 brief-activate 用） */
async function setChatPanelSuppressTabBind(suppress: boolean): Promise<void> {
  try {
    await sendToSidePanel(
      {
      operate: "chat/suppressTabBind",
      suppress,
      },
      { expectResponse: false },
    );
  } catch (e) {
    console.warn("[DOMA_BIND] suppressTabBind notify failed", {
      suppress,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** 后台 tab html2canvas 失败时：短暂激活 tab 用 captureVisibleTab */
async function captureInactiveTabViaBriefActivation(
  tabId: number,
  options?: ScreenshotCaptureOptions,
): Promise<ScreenshotCaptureResult> {
  const browser = getContext().browser;
  let previousActiveTabId: number | undefined;
  let suppressArmed = false;

  try {
    const targetTab = await getTabById(tabId);
    const windowId = targetTab.windowId;
    if (windowId == null) return { error: "no window for tab" };

    const activeTabs = await new Promise<any[]>((resolve, reject) => {
      browser.tabs.query({ windowId, active: true }, (tabs: any[]) => {
        const lastError = browser.runtime.lastError;
        if (lastError) reject(new Error(lastError.message));
        else resolve(tabs ?? []);
      });
    });
    previousActiveTabId = activeTabs[0]?.id;

    if (!targetTab.active) {
      await setChatPanelSuppressTabBind(true);
      suppressArmed = true;
      console.log("[DOMA_BIND] screenshot:brief-activate", {
        tabId,
        previousActiveTabId,
        windowId,
      });
      await new Promise<void>((resolve, reject) => {
        browser.tabs.update(tabId, { active: true }, () => {
          const lastError = browser.runtime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
      });
      await delayMs(350);
    }

    const tab = await getTabById(tabId);
    logScreenshot("captureInactiveTabViaBriefActivation", { tabId, windowId: tab.windowId });
    return await captureVisibleTabScreenshot(tab, tabId, options);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logScreenshot("captureInactiveTabViaBriefActivation:fail", { tabId, error });
    return { error };
  } finally {
    if (previousActiveTabId != null && previousActiveTabId !== tabId) {
      console.log("[DOMA_BIND] screenshot:brief-activate-restore", {
        tabId,
        previousActiveTabId,
      });
      await new Promise<void>((resolve) => {
        browser.tabs.update(previousActiveTabId!, { active: true }, () => resolve());
      });
      // 等 restore 的 onActivated 落在 suppress 窗口内
      await delayMs(150);
    }
    if (suppressArmed) {
      await setChatPanelSuppressTabBind(false);
    }
  }
}

/** 调试用：true 时 browser_screenshot 成功自动 downloads 保存（即上传给模型的那张） */
const DEBUG_DOWNLOAD_SOM_SCREENSHOT = false;

function stripElementRects(elements: unknown[]): unknown[] {
  return elements.map((raw) => {
    const entry = { ...(raw as Record<string, unknown>) };
    delete entry.rc;
    return entry;
  });
}

function debugDownloadScreenshot(
  tabId: number,
  mimeType: string,
  base64: string,
  options?: {
    captureSource?: string;
    conversationId?: string;
    withLabels?: boolean;
    elementCount?: number;
  },
): void {
  if (!DEBUG_DOWNLOAD_SOM_SCREENSHOT) return;
  void debugDownloadScreenshotAsync(tabId, mimeType, base64, options);
}

/** Safari 无 downloads API；Chrome 用 downloads，失败再 tab blob / native 兜底 */
async function debugDownloadScreenshotAsync(
  tabId: number,
  mimeType: string,
  base64: string,
  options?: {
    captureSource?: string;
    conversationId?: string;
    withLabels?: boolean;
    elementCount?: number;
  },
): Promise<void> {
    const ext = mimeType.includes("png") ? "png" : "jpeg";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const source = (options?.captureSource || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const convPart = options?.conversationId
      ? `-conv-${options.conversationId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24)}`
      : "";
    const somPart =
      options?.withLabels === false
        ? "-no-som"
        : `-som-n${options?.elementCount ?? 0}`;
  const leaf = `tab-${tabId}${convPart}${somPart}-full-${source}-${stamp}.${ext}`;
  const filename = `doma-screenshot/${leaf}`;
  console.log("[Screenshot] debug download →", filename, {
    mimeType,
    base64Len: base64.length,
    captureSource: options?.captureSource,
    withLabels: options?.withLabels,
    elementCount: options?.elementCount,
  });

  const browser = getContext().browser as any;

  // 1) Chrome / 支持 downloads 的环境
  if (typeof browser?.downloads?.download === "function") {
    try {
      const id = await browser.downloads.download({
      url: `data:${mimeType};base64,${base64}`,
      filename,
      saveAs: false,
    });
      console.log("[Screenshot] debug download ok (downloads API)", { id, filename });
      return;
  } catch (e) {
      console.warn(
        "[Screenshot] downloads API failed, fallback:",
        e instanceof Error ? e.message : String(e),
      );
    }
  } else {
    console.warn("[Screenshot] downloads API missing → tab/native fallback");
  }

  // 2) 页内 blob + <a download>（Safari 常落 ~/Downloads）
  try {
    const injected = await browser.scripting.executeScript({
      target: { tabId },
      func: (mime: string, b64: string, name: string) => {
        try {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          a.rel = "noopener";
          a.style.display = "none";
          document.documentElement.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
      args: [mimeType, base64, leaf],
    });
    const result = injected?.[0]?.result as { ok?: boolean; error?: string } | undefined;
    if (result?.ok) {
      console.log("[Screenshot] debug download ok (tab blob)", { leaf });
      return;
    }
    console.warn("[Screenshot] tab blob download failed:", result?.error || result);
  } catch (e) {
    console.warn(
      "[Screenshot] tab blob inject failed:",
      e instanceof Error ? e.message : String(e),
    );
  }

  // 3) Safari native → App Group doma-screenshot/
  if (typeof browser?.runtime?.sendNativeMessage === "function") {
    try {
      await new Promise<void>((resolve) => {
        browser.runtime.sendNativeMessage(
          "application.id",
          {
            type: "save-debug-screenshot",
            filename: leaf,
            mimeType,
            base64,
          },
          (resp: unknown) => {
            const err = browser.runtime.lastError;
            if (err) {
              console.warn(
                "[Screenshot] native save lastError:",
                err.message || String(err),
              );
            } else {
              console.log("[Screenshot] debug download ok (native)", resp);
            }
            resolve();
          },
        );
      });
      return;
    } catch (e) {
      console.warn(
        "[Screenshot] native save threw:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  console.warn("[Screenshot] debug download: all methods failed", { filename });
}

type CompressImageOptions = {
  maxWidth?: number;
  jpegQuality?: number;
  grayscale?: boolean;
  downscale?: number;
};

type ScreenshotCaptureOptions = CompressImageOptions & {
  /** som-post-composite-v1：压缩阶段叠加 SoM */
  somOverlay?: SomOverlayPayload | null;
};

const CAPTURE_VISIBLE_TAB_TIMEOUT_MS = 15_000;
const COMPRESS_IN_TAB_TIMEOUT_MS = 12_000;
/** 整次 browser_screenshot 上限；超时必须释放 screenshotCaptureChain，避免后续调用全堵死。 */
const SCREENSHOT_TOTAL_TIMEOUT_MS = 28_000;

/** 避免直控 MCP 并发多次 screenshot 互相卡住 captureVisibleTab / 页内压缩。 */
let screenshotCaptureChain: Promise<unknown> = Promise.resolve();

/**
 * 在标签页中将图片压缩为 JPEG；可选叠加 SoM 标注（som-post-composite-v1）。
 * 坐标：元素 rc / areas 为 CSS viewport px，按 window.innerWidth/Height → 最终 canvas 映射。
 */
async function compressImageInTab(
  tabId: number,
  dataUrl: string,
  options: CompressImageOptions = {},
  somOverlay?: SomOverlayPayload | null,
): Promise<string> {
  const maxWidth = options.maxWidth ?? 800;
  const jpegQuality = options.jpegQuality ?? 0.4;
  const grayscale = options.grayscale ?? false;
  const downscale = options.downscale ?? 2;
  const overlay = somOverlay ?? { elements: [], areas: [] };
  const hasOverlay = overlay.elements.length > 0 || overlay.areas.length > 0;

  const scriptCall = (getContext().browser.scripting as any).executeScript({
    target: { tabId },
    func: (
      imgDataUrl: string,
      mw: number,
      q: number,
      gs: boolean,
      ds: number,
      overlayArg: SomOverlayPayload,
      drawOverlay: boolean,
      compositeTag: string,
    ) => {
      return new Promise<string>((resolve) => {
        void compositeTag; // som-post-composite-v1
        const dpr = window.devicePixelRatio || 1;
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;

        /**
         * Safari 页内壳：#doma-safari-panel-host 叠在视口上，captureVisibleTab 会带上侧栏。
         * Chrome 无此节点 → 整段 no-op。桌面推开模式按壳宽裁掉侧栏竖条；iOS 全屏不裁。
         */
        type SafariCrop = {
          sx: number;
          sy: number;
          sw: number;
          sh: number;
          contentVw: number;
          offsetXCss: number;
          side: "left" | "right";
          panelW: number;
        };
        const resolveSafariPanelCrop = (imgW: number, imgH: number): SafariCrop | null => {
          try {
            const host = document.getElementById("doma-safari-panel-host");
            if (!host || !host.classList.contains("open")) return null;
            if (host.classList.contains("ios-fullscreen")) return null;
            const panelW = Math.round(host.getBoundingClientRect().width);
            if (!(panelW > 40) || panelW >= vw * 0.9) return null;
            const side: "left" | "right" = host.classList.contains("side-left") ? "left" : "right";
            const contentVw = Math.max(1, vw - panelW);
            const scaleX = imgW / vw;
            const scaleY = imgH / vh;
            if (!(scaleX > 0) || !(scaleY > 0)) return null;
            if (side === "right") {
              return {
                sx: 0,
                sy: 0,
                sw: Math.round(contentVw * scaleX),
                sh: imgH,
                contentVw,
                offsetXCss: 0,
                side,
                panelW,
              };
            }
            return {
              sx: Math.round(panelW * scaleX),
              sy: 0,
              sw: Math.round(contentVw * scaleX),
              sh: imgH,
              contentVw,
              offsetXCss: panelW,
              side,
              panelW,
            };
          } catch {
            return null;
          }
        };

        const img = new Image();
        img.onload = () => {
          try {
            const safariCrop = resolveSafariPanelCrop(img.width, img.height);
            if (safariCrop) {
              console.log("[Screenshot] safari-panel-crop-v1", {
                side: safariCrop.side,
                panelW: safariCrop.panelW,
                contentVw: safariCrop.contentVw,
                vw,
                imgW: img.width,
                imgH: img.height,
                sx: safariCrop.sx,
                sw: safariCrop.sw,
              });
            }

            const srcW = safariCrop ? safariCrop.sw : img.width;
            const srcH = safariCrop ? safariCrop.sh : img.height;
            // 有裁切时按裁后像素 + 视口比例算 CSS 尺寸，避免 dpr 与 capture 不一致
            const scaleX = img.width / vw;
            const scaleY = img.height / vh;
            let w = safariCrop
              ? Math.round(srcW / (scaleX || dpr) / ds)
              : Math.round(img.width / dpr / ds);
            let h = safariCrop
              ? Math.round(srcH / (scaleY || dpr) / ds)
              : Math.round(img.height / dpr / ds);
            if (w > mw) {
              const ratio = mw / w;
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;

            if (safariCrop) {
              ctx.drawImage(
                img,
                safariCrop.sx,
                safariCrop.sy,
                safariCrop.sw,
                safariCrop.sh,
                0,
                0,
                w,
                h,
              );
            } else {
            ctx.drawImage(img, 0, 0, w, h);
            }

            if (gs) {
              const imageData = ctx.getImageData(0, 0, w, h);
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
              }
              ctx.putImageData(imageData, 0, 0);
            }

            if (drawOverlay) {
              // SoM rc 为全视口 CSS px；裁掉左侧壳时需减 offset
              const mapVw = safariCrop ? safariCrop.contentVw : vw;
              const mapVh = vh;
              const ox = safariCrop ? safariCrop.offsetXCss : 0;
              const sx = w / mapVw;
              const sy = h / mapVh;
              const s = Math.min(sx, sy);
              const COLORS = [
                "#E53935",
                "#1E88E5",
                "#43A047",
                "#FB8C00",
                "#8E24AA",
                "#00ACC1",
                "#D81B60",
                "#3949AB",
              ];
              const AREA_COLORS = ["#6A1B9A", "#4527A0", "#283593", "#00695C", "#4E342E"];

              const drawBadge = (
                text: string,
                bx: number,
                by: number,
                color: string,
                fontPx: number,
                padX: number,
                boxH: number,
              ) => {
                ctx.font = `bold ${fontPx}px Arial,Helvetica,sans-serif`;
                const tw = ctx.measureText(text).width;
                const bw = tw + padX * 2;
                ctx.fillStyle = color;
                ctx.beginPath();
                const r = 4 * s;
                const x0 = bx;
                const y0 = by;
                ctx.moveTo(x0 + r, y0);
                ctx.arcTo(x0 + bw, y0, x0 + bw, y0 + boxH, r);
                ctx.arcTo(x0 + bw, y0 + boxH, x0, y0 + boxH, r);
                ctx.arcTo(x0, y0 + boxH, x0, y0, r);
                ctx.arcTo(x0, y0, x0 + bw, y0, r);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = "#fff";
                ctx.textBaseline = "middle";
                ctx.fillText(text, x0 + padX, y0 + boxH / 2);
              };

              for (let ai = 0; ai < (overlayArg.areas?.length || 0); ai++) {
                const a = overlayArg.areas[ai]!;
                const color = AREA_COLORS[ai % AREA_COLORS.length]!;
                const x = (a.left - ox) * sx;
                const y = a.top * sy;
                const aw = a.width * sx;
                const ah = a.height * sy;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1.5, 3 * s);
                ctx.setLineDash([6 * s, 4 * s]);
                ctx.fillStyle = "rgba(106,27,154,0.06)";
                ctx.fillRect(x, y, aw, ah);
                ctx.strokeRect(x, y, aw, ah);
                ctx.restore();
                const fontPx = Math.max(10, Math.round(15 * s));
                const boxH = Math.max(14, Math.round(22 * s));
                let bTop = y - boxH - 2;
                if (bTop < 0) bTop = y + 4 * s;
                drawBadge(a.id, x, bTop, color, fontPx, Math.max(4, 8 * s), boxH);
              }

              for (const mark of overlayArg.elements || []) {
                const rc = mark.rc;
                if (!rc || rc.length < 4) continue;
                const color = COLORS[Math.max(0, mark.i - 1) % COLORS.length]!;
                const x = (rc[0]! - ox) * sx;
                const y = rc[1]! * sy;
                const bw = rc[2]! * sx;
                const bh = rc[3]! * sy;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1, 2 * s);
                ctx.strokeRect(x, y, bw, bh);
                const fontPx = Math.max(10, Math.round(16 * s));
                const boxH = Math.max(14, Math.round(20 * s));
                let bTop = y - boxH;
                if (bTop < 0) bTop = y + 2 * s;
                const bLeft = Math.max(0, x);
                drawBadge(String(mark.i), bLeft, bTop, color, fontPx, Math.max(3, 5 * s), boxH);
              }
            }

            resolve(canvas.toDataURL("image/jpeg", q));
          } catch {
            resolve(imgDataUrl);
          }
        };
        img.onerror = () => {
          resolve(imgDataUrl);
        };
        img.src = imgDataUrl;
      });
    },
    args: [dataUrl, maxWidth, jpegQuality, grayscale, downscale, overlay, hasOverlay, SOM_POST_COMPOSITE_TAG],
  });

  // 12306/百度等重页：页内 Canvas+SoM 合成的 executeScript Promise 可能永不回；超时回退原图。
  const raced = await execWithTimeout(
    scriptCall,
    COMPRESS_IN_TAB_TIMEOUT_MS,
    null as Awaited<typeof scriptCall> | null,
  );
  if (!raced) {
    logScreenshot("compressImageInTab:timeout", {
      tabId,
      timeoutMs: COMPRESS_IN_TAB_TIMEOUT_MS,
      hasOverlay,
      dataUrlLen: dataUrl.length,
    });
    return dataUrl;
  }
  return raced?.[0]?.result || dataUrl;
}

type ScreenshotCaptureResult =
  | { ok: true; mimeType: string; base64: string; captureTab: boolean; captureSource?: string }
  | { error: string };

function logScreenshot(stage: string, detail: Record<string, unknown> = {}): void {
  console.log(`[Screenshot] ${stage}`, detail);
}

function summarizeTabForScreenshotLog(tab: any): Record<string, unknown> {
  if (!tab) return { tab: null };
  return {
    tabId: tab.id,
    active: tab.active,
    status: tab.status,
    discarded: tab.discarded,
    url: typeof tab.url === "string" ? tab.url : undefined,
    title: typeof tab.title === "string" ? tab.title : undefined,
    windowId: tab.windowId,
    index: tab.index,
  };
}

function getTabById(tabId: number): Promise<any> {
  return new Promise((resolve, reject) => {
    getContext().browser.tabs.get(tabId, (t: any) => {
      if (getContext().browser.runtime.lastError) {
        reject(new Error(getContext().browser.runtime.lastError.message));
      } else {
        resolve(t);
      }
    });
  });
}

function tabsQuery(queryInfo: Record<string, unknown>): Promise<any[]> {
  return new Promise((resolve) => {
    getContext().browser.tabs.query(queryInfo, (tabs: any[]) => {
      resolve(tabs ?? []);
    });
  });
}

function sendTabMessage(
  tabId: number,
  payload: Record<string, unknown>,
  timeoutMs = 20000,
  logContext?: string,
): Promise<unknown> {
  const label = logContext ?? payload.operate ?? "sendTabMessage";
  logScreenshot("sendTabMessage:start", { tabId, label, timeoutMs, operate: payload.operate });
  const startedAt = Date.now();
  return Promise.race([
    new Promise<unknown>((resolve, reject) => {
      getContext().browser.tabs.sendMessage(
        tabId,
        payload,
        { frameId: 0 },
        (response: unknown) => {
        const lastError = getContext().browser.runtime.lastError;
        const elapsedMs = Date.now() - startedAt;
        if (lastError) {
          logScreenshot("sendTabMessage:runtime-error", {
            tabId,
            label,
            elapsedMs,
            error: lastError.message,
          });
          reject(new Error(lastError.message));
        } else {
          logScreenshot("sendTabMessage:response", {
            tabId,
            label,
            elapsedMs,
            responseType: response == null ? "null" : typeof response,
            ...(response && typeof response === "object"
              ? {
                  ok: (response as { ok?: boolean }).ok,
                  error: (response as { error?: string }).error,
                  dataUrlLen:
                    typeof (response as { dataUrl?: string }).dataUrl === "string"
                      ? (response as { dataUrl: string }).dataUrl.length
                      : undefined,
                  elapsedMs: (response as { elapsedMs?: number }).elapsedMs,
                }
              : {}),
          });
          resolve(response);
        }
      },
      );
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        logScreenshot("sendTabMessage:timeout", {
          tabId,
          label,
          timeoutMs,
          elapsedMs: Date.now() - startedAt,
        });
        reject(new Error("content script capture timeout"));
      }, timeoutMs);
    }),
  ]);
}

async function finalizeScreenshotDataUrl(
  tabId: number,
  rawDataUrl: string,
  options?: ScreenshotCaptureOptions,
  captureSource?: string,
): Promise<ScreenshotCaptureResult> {
  const grayscale = options?.grayscale ?? false;
  const compressOpts: CompressImageOptions = {
    maxWidth: options?.maxWidth ?? SOM_SCREENSHOT_PROFILES.full.maxWidth,
    jpegQuality: options?.jpegQuality ?? SOM_SCREENSHOT_PROFILES.full.jpegQuality,
    downscale: options?.downscale ?? SOM_SCREENSHOT_PROFILES.full.downscale,
    grayscale,
  };

  // som-post-composite-v1：压缩时叠加 SoM
  const finalDataUrl = await compressImageInTab(
    tabId,
    rawDataUrl,
    compressOpts,
    options?.somOverlay ?? null,
  );
  console.log(
    `[Screenshot] Compress${grayscale ? " (grayscale)" : ""}${options?.somOverlay ? ` (${SOM_POST_COMPOSITE_TAG})` : ""}: ${rawDataUrl.length} -> ${finalDataUrl.length} (${Math.round((finalDataUrl.length / rawDataUrl.length) * 100)}%)`,
  );

  const base64Match = finalDataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!base64Match) {
    return { error: "invalid image data" };
  }

  return {
    ok: true,
    mimeType: `image/${base64Match[1]}`,
    base64: base64Match[2],
    captureTab: true,
    ...(captureSource ? { captureSource } : {}),
  };
}

async function captureVisibleTabRaw(windowId: number): Promise<string> {
  return Promise.race([
    new Promise<string>((resolve, reject) => {
      getContext().browser.tabs.captureVisibleTab(
        windowId,
        {
          format: "jpeg",
          quality: 70,
        },
        (result: string) => {
          const lastError = getContext().browser.runtime.lastError;
          if (lastError) reject(new Error(lastError.message || "capture failed"));
          else resolve(result);
        },
      );
    }),
    new Promise<string>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `captureVisibleTab timeout after ${CAPTURE_VISIBLE_TAB_TIMEOUT_MS}ms (windowId=${windowId})`,
            ),
          ),
        CAPTURE_VISIBLE_TAB_TIMEOUT_MS,
      );
    }),
  ]);
}

/** 当前窗口 active tab：captureVisibleTab，画质最佳 */
async function captureVisibleTabScreenshot(
  tab: any,
  tabId: number,
  options?: ScreenshotCaptureOptions,
): Promise<ScreenshotCaptureResult> {
  const windowId = tab.windowId;
  logScreenshot("captureVisibleTab:start", { tabId, ...summarizeTabForScreenshotLog(tab) });
  if (windowId == null) {
    logScreenshot("captureVisibleTab:fail", { tabId, error: "no active window" });
    return { error: "no active window" };
  }

  try {
    const rawDataUrl = await captureVisibleTabRaw(windowId);
    logScreenshot("captureVisibleTab:raw-ok", { tabId, dataUrlLen: rawDataUrl?.length ?? 0 });
    return finalizeScreenshotDataUrl(tabId, rawDataUrl, options, "visibleTab");
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logScreenshot("captureVisibleTab:fail", { tabId, windowId, error });
    return { error };
  }
}

/** 未激活 tab：executeScript + html2canvas；失败则短暂激活 tab 走 captureVisibleTab */
async function captureInactiveTabViaContentScript(
  tabId: number,
  tabBrief?: any,
  options?: ScreenshotCaptureOptions,
): Promise<ScreenshotCaptureResult> {
  logScreenshot("captureInactiveTab:start", {
    tabId,
    timeoutMs: INACTIVE_TAB_CAPTURE_TIMEOUT_MS,
    ...(tabBrief ? summarizeTabForScreenshotLog(tabBrief) : {}),
  });

  const ensureErr = await ensureScreenshotCaptureScript(tabId);
  if (ensureErr) {
    logScreenshot("captureInactiveTab:fail", { tabId, error: ensureErr, stage: "ensure-script" });
    return { error: ensureErr };
  }

  const response = await captureInactiveTabViaExecuteScript(tabId, 70);

  if (response?.ok && typeof response.dataUrl === "string") {
    logScreenshot("captureInactiveTab:raw-ok", {
      tabId,
      dataUrlLen: response.dataUrl.length,
      captureSource: response.captureSource || "executeScript",
      contentScriptElapsedMs: response.elapsedMs,
    });
    return finalizeScreenshotDataUrl(
      tabId,
      response.dataUrl,
      options,
      response.captureSource || "executeScript",
    );
  }

  const primaryError = response?.error || "inactive tab capture failed";
  logScreenshot("captureInactiveTab:execute-fail", {
    tabId,
    error: primaryError,
    responseOk: response?.ok,
  });

  const fallback = await captureInactiveTabViaBriefActivation(tabId, options);
  if (!("error" in fallback)) {
    logScreenshot("captureInactiveTab:fallback-ok", { tabId, priorError: primaryError });
    return fallback;
  }

  logScreenshot("captureInactiveTab:fail", {
    tabId,
    error: fallback.error || primaryError,
    primaryError,
  });
  return { error: fallback.error || primaryError };
}

/**
 * 捕获截图：active tab 走 captureVisibleTab；后台 tab 走 content script html2canvas。
 */
async function captureScreenshot(
  tabId: number,
  options?: ScreenshotCaptureOptions & { format?: string; quality?: number },
): Promise<ScreenshotCaptureResult> {
  try {
    const tab = await getTabById(tabId);
    const route = tab?.active ? "visibleTab" : "contentScript";
    logScreenshot("captureScreenshot:route", {
      tabId,
      route,
      ...summarizeTabForScreenshotLog(tab),
    });
    if (tab?.active) {
      const visible = await captureVisibleTabScreenshot(tab, tabId, options);
      if (!("error" in visible)) return visible;
      // 偶发：SW/无手势时 captureVisibleTab 报 activeTab not in effect（有 <all_urls> 也会）。
      // 与 withLabels 无关；回退 html2canvas，避免直控拿到空图/假成功。
      logScreenshot("captureScreenshot:visibleTab-fallback", {
        tabId,
        error: visible.error,
      });
      return await captureInactiveTabViaContentScript(tabId, tab, options);
    }
    return await captureInactiveTabViaContentScript(tabId, tab, options);
  } catch (e) {
    const error = String(e);
    logScreenshot("captureScreenshot:fail", { tabId, error });
    return { error };
  }
}

async function browser_screenshot(args: Record<string, unknown>): Promise<unknown> {
  const run = async (): Promise<unknown> => {
  const intent = parseScreenshotIntent(args);
  if (!intent.ok) {
    return { ok: false, error: intent.error, hint: intent.hint };
  }

  const maxWidth = (args.maxWidth as number) ?? 800;
  const withLabels = (args.withLabels as boolean) ?? true;
  const conversationId = args.conversationId as string | undefined;

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) {
    logScreenshot("browser_screenshot:fail", { conversationId, error: "no tab" });
    return { error: "no tab" };
  }

  let tabBeforeCapture: any;
  try {
    tabBeforeCapture = await getTabById(tabId);
  } catch (e) {
    logScreenshot("browser_screenshot:tab-get-fail", {
      tabId,
      conversationId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  logScreenshot("browser_screenshot:start", {
    tabId,
    conversationId,
    withLabels,
    maxWidth,
    purpose: intent.purpose,
    goal: intent.goal.slice(0, 80),
    action: intent.action ?? null,
    ...(tabBeforeCapture ? summarizeTabForScreenshotLog(tabBeforeCapture) : {}),
  });

  let elements: unknown[] = [];
  let areas: SomOverflowArea[] = [];
  let blockingOverlay: BlockingOverlayInfo = { present: false };
  let somOverlay: SomOverlayPayload | null = null;

  // 标注与截图并行：避免先 annotate 把 tab scripting 队列占满后再 capture/compress。
  const annotatePromise: Promise<SomAnnotateResult> | null = withLabels
    ? annotateInteractiveElements(tabId)
    : null;
  const capturePromise = captureScreenshot(tabId, { maxWidth });

  if (annotatePromise) {
    const annotateTimeout = new Promise<SomAnnotateResult>((resolve) =>
      setTimeout(
        () => resolve({ elements: [], areas: [], blockingOverlay: { present: false } }),
        5000,
      ),
    );
    const annotated = await Promise.race([annotatePromise, annotateTimeout]);
    elements = annotated.elements;
    areas = annotated.areas;
    const rawOv = annotated.blockingOverlay ?? { present: false };
    const calRoots = rawOv.calRoots;
    blockingOverlay = finalizeBlockingOverlay(rawOv, intent.goal, intent.values);
    blockingOverlay = coerceOverlayKindFromElements(blockingOverlay, elements);
    if (blockingOverlay.kind === "suggest" && intent.values) {
      const needles = Object.values(intent.values).map((v) => String(v).trim()).filter(Boolean);
      if (needles.length) blockingOverlay.suggestNeedle = needles.join(" / ");
    }
    somOverlay = buildSomOverlayPayload(elements, areas);
    logCalOverlaySnapshot({
      where: "screenshot:annotate",
      goal: intent.goal,
      values: intent.values,
      overlay: blockingOverlay,
      elements,
      roots: calRoots,
      extra: {
        tabId,
        purpose: intent.purpose,
        areaCount: areas.length,
      },
    });
    logScreenshot("browser_screenshot:som-annotate", {
      tabId,
      elementCount: elements.length,
      areaCount: areas.length,
      blockingOverlay,
      mode: SOM_POST_COMPOSITE_TAG,
    });
  }

  let result = await capturePromise;

  // 已有干净图时再叠 SoM；压缩超时则仍返回无框截图 + elements（直控可继续 click index）
  if (
    !("error" in result) &&
    somOverlay &&
    (somOverlay.elements.length > 0 || somOverlay.areas.length > 0)
  ) {
    const rawDataUrl = `data:${result.mimeType};base64,${result.base64}`;
    const composited = await compressImageInTab(
      tabId,
      rawDataUrl,
      {
        maxWidth,
        jpegQuality: SOM_SCREENSHOT_PROFILES.full.jpegQuality,
        downscale: SOM_SCREENSHOT_PROFILES.full.downscale,
      },
      somOverlay,
    );
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(composited);
    if (m) {
      result = {
        ok: true,
        mimeType: m[1]!,
        base64: m[2]!,
        captureTab: result.captureTab,
        ...(result.captureSource ? { captureSource: result.captureSource } : {}),
      };
    }
  }

  // 清理可能残留的旧 DOM 视觉层；data-som-idx 保留（短超时，勿阻塞回传）
  if (withLabels) {
    void removeAnnotationVisuals(tabId);
  }

  if ("error" in result) {
    logScreenshot("browser_screenshot:fail", {
      tabId,
      conversationId,
      error: result.error,
      inactive: tabBeforeCapture?.active === false,
      tabStatus: tabBeforeCapture?.status,
      tabUrl: tabBeforeCapture?.url,
    });
    return result;
  }

  // Keep rc for Jev criteria; LLM vision path still gets stripped elements.
  const elementsForJev = elements;
  elements = stripElementRects(elements);

  logScreenshot("browser_screenshot:ok", {
    tabId,
    conversationId,
    captureScope: "full",
    captureSource: result.captureSource,
    mimeType: result.mimeType,
    base64Len: result.base64.length,
    inactive: tabBeforeCapture?.active === false,
  });

  debugDownloadScreenshot(tabId, result.mimeType, result.base64, {
    captureSource: result.captureSource,
    conversationId,
    withLabels,
    elementCount: elements.length,
  });

  const tabBrief = await new Promise<any | undefined>((resolve) => {
    getContext().browser.tabs.get(tabId, (t: any) => {
      if (getContext().browser.runtime.lastError) {
        resolve(undefined);
        return;
      }
      resolve(t);
    });
  });
  const pageMeta = {
    conversationId: conversationId ?? undefined,
    tabId,
    url: typeof tabBrief?.url === "string" ? tabBrief.url : undefined,
    title: typeof tabBrief?.title === "string" ? tabBrief.title : undefined,
    host: getHostFromUrl(typeof tabBrief?.url === "string" ? tabBrief.url : undefined),
    icon: typeof tabBrief?.favIconUrl === "string" ? tabBrief.favIconUrl : undefined,
  };

  const buildVisionResponse = (extraHint?: string) => {
    // Filter console by: [jev] vision:return-to-llm  → image+SoM went to main LLM
    console.log("[jev] vision:return-to-llm", {
      tabId,
      purpose: intent.purpose,
      goal: intent.goal.slice(0, 80),
      reason: (extraHint ?? "jev-off-or-default").slice(0, 160),
      elementCount: elements.length,
      base64Len: result.base64?.length ?? 0,
      mimeType: result.mimeType,
      overlayError: blockingOverlay.isError === true,
      overlayMessage: blockingOverlay.message?.slice(0, 80) ?? null,
    });
  const response: Record<string, unknown> = {
    ...result,
    dataUrl: "(base64 data omitted)",
    captureScope: "full",
      purpose: intent.purpose,
      goal: intent.goal,
      ...(intent.action ? { action: intent.action } : {}),
      page: pageMeta,
  };
  if (withLabels && elements.length > 0) {
    response.elements = elements;
    response.somSchema = SOM_ELEMENT_SCHEMA;
    response.somSchemaVersion = SOM_SCHEMA_VERSION;
    response.markedCount = elements.length;
    response.somCap = SOM_MAX_ELEMENTS;
      if (blockingOverlay.present) {
        // LLM+SoM：带回 message/isError，供主模型读错改行为（不只关窗）
        response.blockingOverlay = {
          present: true,
          kind: blockingOverlay.kind,
          expected: blockingOverlay.expected,
          ...(blockingOverlay.message ? { message: blockingOverlay.message } : {}),
          ...(blockingOverlay.isError ? { isError: true } : {}),
          ...(blockingOverlay.suggestNeedle
            ? { suggestNeedle: blockingOverlay.suggestNeedle }
            : {}),
        };
      }
    if (areas.length > 0) {
      response.areas = areas.map((a) => ({
        id: a.id,
        overflowCount: a.overflowCount,
      }));
      response.hint =
        `SoM 编号已达上限 ${SOM_MAX_ELEMENTS}（本页标了 ${elements.length} 个）。` +
        `截图上紫色虚线框 A1/A2… 为尚未逐一标注的溢出区域。` +
        `若目标不在 1–${elements.length}，请调用 browser_screenshot_area({ areaId: "A1" }) 对该区域二次标注后再 click/type；` +
        `勿猜测未标注元素的 index。编号仅供工具参数使用，勿在对用户回复中提及。`;
    } else {
      response.hint =
        "截图中已标注可交互元素编号（仅供 browser_click / browser_type 等传 index，勿在对用户的回复中提及编号）。elements 使用短 key，含义见 somSchema。";
    }
      const overlayInstr = buildOverlayInstruction(blockingOverlay);
      if (overlayInstr) {
        response.instruction = overlayInstr;
      }
      const errFollow = buildErrorOverlayFollowupHint(blockingOverlay);
      if (errFollow) {
        response.hint = `${String(response.hint ?? "").trim()}\n${errFollow}`.trim();
      }
    }
    if (extraHint?.trim()) {
      response.hint = `${String(response.hint ?? "").trim()}\n${extraHint.trim()}`.trim();
    }
    return response;
  };

  const jevCfg = await loadJevConfig();
  // MCP 直控：调用方大脑自己点/填，禁止再进 Jev 多步/外网 decide（否则像「截图卡住」）。
  const mcpDirect =
    args._mcpDirect === true ||
    args.mcpDirect === true ||
    args._domaMcpDirect === true;
  const jevOn = !mcpDirect && !!jevCfg.enabled && isJevConfigured(jevCfg);
  console.log("[jev] screenshot:gate", {
    tabId,
    purpose: intent.purpose,
    goal: intent.goal.slice(0, 80),
    preferredAction: intent.action ?? null,
    valueKeys: Object.keys(intent.values ?? {}),
    jevOn,
    mcpDirect,
    enabled: jevCfg.enabled,
    hasKey: isJevConfigured(jevCfg),
    model: jevCfg.model,
    elementCount: elements.length,
  });

  if (!jevOn) {
    rememberJevPage(tabId, pageMeta, elementsForJev);
    return buildVisionResponse();
  }

  // ----- Jev path (criteria use elementsForJev with rc / box=) -----
  console.log("[jev] screenshot:enter-decide", {
    tabId,
    purpose: intent.purpose,
    preferredAction: intent.action ?? null,
    valueKeys: Object.keys(intent.values ?? {}),
  });
  const toolSignal = conversationId ? beginToolAbort(conversationId) : undefined;
  const throwIfToolAborted = () => {
    if (toolSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  };
  try {
    if (intent.purpose === "act") {
      const initialValues = { ...(intent.values ?? {}) };
      if (
        Object.keys(initialValues).length === 0 &&
        goalLooksLikeFill(intent.goal)
      ) {
        console.log("[jev] act:missing-values", {
          tabId,
          goal: intent.goal.slice(0, 80),
          hint: "retry browser_screenshot with values or text",
        });
        return buildVisionResponse(
          "jev: goal looks like fill/type but no values/text were provided. " +
            "Retry browser_screenshot purpose=act with the SAME goal AND values " +
            '(e.g. values:{customer_name:"Alice",telephone:"555",email:"a@b.com",...}) ' +
            "or text for a single field. Do not invent strings after the fact without passing them.",
        );
      }

      const maxSteps = JEV_ACT_LOOP_MAX_STEPS;
      const remainingValues = { ...initialValues };
      const steps: Array<{
        step: number;
        action: string;
        index: number;
        brief: string;
        valueKey?: string;
        typed?: string;
        confidence: number;
        ok: boolean;
        model?: string;
      }> = [];
      const lastActionSummaries: string[] = [];
      let loopElements = elementsForJev;
      let loopBlockingOverlay = blockingOverlay;
      let lastModel: string | undefined;
      let stopReason:
        | "done"
        | "abstain"
        | "act_fail"
        | "max_steps"
        | "no_elements"
        | "invalid"
        | "error_overlay" = "abstain";
      /** 错误弹窗关掉后带给主模型的文案 */
      let errorOverlayForHint: BlockingOverlayInfo | null = null;
      /** type 成功后的文本，供 suggest 层匹配 option */
      let lastTypedForSuggest: string | undefined;
      /** 本 loop 已点中日历日格（aria 选中）；层还在则下一轮改找关层钮 */
      let calendarDatePicked = false;

      console.log("[jev] loop:start", {
    tabId,
        goal: intent.goal.slice(0, 80),
        maxSteps,
        valueKeys: Object.keys(remainingValues),
        elementCount: loopElements.length,
      });

      // 开局就是错误弹窗：先让 Jev 关窗，但关完必须交回 LLM 按 message 改 goal（不要继续原查询）
      if (blockingOverlay.present && blockingOverlay.isError) {
        errorOverlayForHint = blockingOverlay;
      }

      for (let step = 1; step <= maxSteps; step++) {
        throwIfToolAborted();
        // Fresh SoM each iteration so [filled]/[empty] reflects prior types/clicks.
        if (step > 1) {
          const annotateTimeout = new Promise<SomAnnotateResult>((resolve) =>
            setTimeout(
              () => resolve({ elements: [], areas: [], blockingOverlay: { present: false } }),
              6000,
            ),
          );
          let annotated = await Promise.race([
            annotateInteractiveElements(tabId),
            annotateTimeout,
          ]);
          loopElements = annotated.elements ?? [];
          let rawOv = annotated.blockingOverlay ?? { present: false };
          loopBlockingOverlay = finalizeBlockingOverlay(
            rawOv,
            intent.goal,
            remainingValues,
          );
          loopBlockingOverlay = coerceOverlayKindFromElements(
            loopBlockingOverlay,
            loopElements,
          );
          // 日历已关掉：清除「选日完成待关层」标记
          if (
            calendarDatePicked &&
            (!loopBlockingOverlay.present || loopBlockingOverlay.kind !== "calendar")
          ) {
            console.log(
              `[jev] loop:calendar-date-picked-cleared tab=${tabId} step=${step} present=${loopBlockingOverlay.present} kind=${loopBlockingOverlay.kind ?? "null"}`,
            );
            calendarDatePicked = false;
          }

          // 已有 overlay 但还没有 option：短轮询，看是否变成 suggest（日历密格则跳过）
          if (overlayMayBecomeSuggest(loopBlockingOverlay, loopElements)) {
            const settleMs = 1200;
            const intervalMs = 120;
            const t0 = Date.now();
            while (
              overlayMayBecomeSuggest(loopBlockingOverlay, loopElements) &&
              Date.now() - t0 < settleMs
            ) {
              throwIfToolAborted();
              await delayMsAbortable(intervalMs, toolSignal);
              const again = await Promise.race([
                annotateInteractiveElements(tabId),
                annotateTimeout,
              ]);
              annotated = again;
              loopElements = again.elements ?? [];
              rawOv = again.blockingOverlay ?? { present: false };
              loopBlockingOverlay = finalizeBlockingOverlay(
                rawOv,
                intent.goal,
                remainingValues,
              );
              loopBlockingOverlay = coerceOverlayKindFromElements(
                loopBlockingOverlay,
                loopElements,
              );
            }
            console.log("[jev] loop:overlay-settle", {
              tabId,
              step,
              waitedMs: Date.now() - t0,
              kind: loopBlockingOverlay.kind ?? null,
              optCount: countOverlaySuggestOptions(loopElements),
            });
          }

          if (loopBlockingOverlay.kind === "suggest") {
            const needles = [
              lastTypedForSuggest,
              ...Object.values(remainingValues).map((v) => String(v).trim()),
            ].filter(Boolean) as string[];
            if (needles[0]) loopBlockingOverlay.suggestNeedle = needles[0];
          }
          if (loopBlockingOverlay.isError) {
            errorOverlayForHint = loopBlockingOverlay;
          }
          logCalOverlaySnapshot({
            where: "jev:loop-resom",
            goal: intent.goal,
            values: remainingValues,
            overlay: loopBlockingOverlay,
            elements: loopElements,
            roots: rawOv.calRoots,
            extra: { tabId, step },
          });
          console.log("[jev] loop:resom", {
            tabId,
            step,
            elementCount: loopElements.length,
            blockingOverlay: loopBlockingOverlay,
          });

          // type 后出现 suggest：优先自动点与 needle 最像的 option（Flights/选站通用）
          if (loopBlockingOverlay.kind === "suggest") {
            const needle =
              lastTypedForSuggest ||
              loopBlockingOverlay.suggestNeedle ||
              Object.values(remainingValues)[0] ||
              "";
            const best = findBestSuggestOptionIndex(loopElements, needle, 50);
            if (best) {
              console.log("[jev] loop:suggest-auto", {
                tabId,
                step,
                needle: needle.slice(0, 40),
                index: best.index,
                score: best.score,
                brief: best.brief,
              });
              const actResult = await browser_click({
                index: best.index,
                conversationId,
              });
              const actOk =
                actResult &&
                typeof actResult === "object" &&
                ((actResult as { ok?: boolean }).ok === true ||
                  (actResult as { verified?: boolean }).verified === true);
              const stepRec = {
                step,
                action: "click",
                index: best.index,
                brief: `suggest-auto: ${best.brief}`,
                confidence: 1,
                pTarget: 1,
                ok: actOk !== false,
                model: lastModel,
              };
              steps.push(stepRec);
              lastActionSummaries.push(
                `click index=${best.index} suggest←${needle.slice(0, 24)}`,
              );
              rememberJevPage(
                tabId,
                pageMeta,
                loopElements,
                lastActionSummaries[lastActionSummaries.length - 1],
              );
              lastTypedForSuggest = undefined;
              if (actOk === false) {
                stopReason = "act_fail";
                break;
              }
              if (step === maxSteps) {
                stopReason = "max_steps";
              }
              continue;
            }
          }
        }

        if (!loopElements.length) {
          stopReason = step === 1 ? "no_elements" : "abstain";
          break;
        }

        // Refresh page meta lightly for URL changes.
        try {
          const t = await getTabById(tabId);
          if (t && typeof t.url === "string") pageMeta.url = t.url;
          if (t && typeof t.title === "string") pageMeta.title = t.title;
        } catch {
          /* ignore */
        }

        const decideReq = buildJevActDecideRequest({
          goal: intent.goal,
          url: pageMeta.url,
          title: pageMeta.title,
          elements: loopElements,
          preferredAction: intent.action,
          values: remainingValues,
          lastActions: lastActionSummaries,
          stepIndex: step,
          maxSteps,
          blockingOverlay: loopBlockingOverlay,
          lastTyped: lastTypedForSuggest,
          calendarDatePicked,
        });
        const decided = await jevDecide(decideReq, {
          config: jevCfg,
          signal: toolSignal,
        });
        lastModel = decided.model;
        // Prefer `next`; accept legacy `target` if older payload somehow returns.
        const nextAns = (decided.answers?.next ?? decided.answers?.target) as
          | JevChoiceAnswer
          | undefined;
        let nextChoice =
          nextAns?.type === "choice" ? String(nextAns.choice ?? "") : "";
        const nextConf =
          typeof nextAns?.confidence === "number" ? nextAns.confidence : 0;
        const probs = nextAns?.probabilities ?? {};
        // Align with jev-browser: gate on p_target = probabilities[choice], not confidence.
        let pTarget =
          nextChoice && nextChoice !== "none"
            ? Number(probs[nextChoice]) || 0
            : nextChoice === "none"
              ? Number(probs.none) || 0
              : 0;
        const minP = JEV_ACT_MIN_P_TARGET;
        let choiceBrief =
          nextChoice && nextChoice !== "none"
            ? findSomBrief(loopElements, Number(nextChoice)) ||
              `(index ${nextChoice})`
            : nextChoice === "none"
              ? "none"
              : "?";

        const mustPickOverlay = !!(
          loopBlockingOverlay.present &&
          (loopBlockingOverlay.kind === "calendar" ||
            loopBlockingOverlay.kind === "suggest") &&
          loopBlockingOverlay.expected !== false
        );
        // criteria 已去掉 none 时 API 仍可能回 none：suggest 强制最近点一项
        if (mustPickOverlay && (!nextChoice || nextChoice === "none")) {
          if (loopBlockingOverlay.kind === "suggest") {
            const needle =
              lastTypedForSuggest ||
              loopBlockingOverlay.suggestNeedle ||
              Object.values(remainingValues)[0] ||
              "";
            const best = findBestSuggestOptionIndex(
              loopElements,
              String(needle || ""),
              40,
            );
            if (best) {
              console.log("[jev] loop:must-pick-force", {
                tabId,
                step,
                needle: String(needle).slice(0, 40),
                index: best.index,
                score: best.score,
                brief: best.brief,
              });
              nextChoice = String(best.index);
              choiceBrief = best.brief || findSomBrief(loopElements, best.index) || "";
              pTarget = Math.max(pTarget, 1);
            }
          }
        }

        logScreenshot("browser_screenshot:jev-act", {
          tabId,
          step,
          choice: nextChoice,
          choiceBrief,
          pTarget,
          confidence: nextConf,
          minP,
          remainingValueKeys: Object.keys(remainingValues),
          model: decided.model,
        });

        // 日历诊断：看 Jev 到底点了日期格还是 dismiss
        {
          const picked =
            nextChoice && nextChoice !== "none"
              ? (loopElements as Array<Record<string, unknown>>).find(
                  (e) => Number(e.i) === Number(nextChoice),
                )
              : undefined;
          logCal("jev:pick", {
            tabId,
            step,
            choice: nextChoice,
            choiceBrief: String(choiceBrief).slice(0, 120),
            pTarget,
            nextConf,
            overlay: loopBlockingOverlay,
            picked: picked
              ? {
                  i: picked.i,
                  tg: picked.tg,
                  tx: String(picked.tx ?? "").slice(0, 40),
                  al: String(picked.al ?? "").slice(0, 60),
                  ov: picked.ov === true,
                  ds: picked.ds === true,
                }
              : null,
            topProbs: Object.entries(probs)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .slice(0, 8)
              .map(([k, v]) => `${k}:${Number(v).toFixed(3)}`),
          });
        }

        if (!nextChoice || nextChoice === "none") {
          // suggest/calendar：绝不当「完成」；交回 LLM 继续，避免 type 后假 done
          stopReason =
            mustPickOverlay || steps.length === 0 ? "abstain" : "done";
          console.log("[jev] loop:stop", {
            tabId,
            step,
            reason: stopReason,
            nextChoice,
            pTarget,
            nextConf,
            minP,
            mustPickOverlay,
          });
          break;
        }
        // 必须点层内项时放宽 p 门槛（宁可低置信点一项）
        if (pTarget < minP && !mustPickOverlay) {
          stopReason = steps.length > 0 ? "done" : "abstain";
          console.log("[jev] loop:stop", {
            tabId,
            step,
            reason: stopReason,
            nextChoice,
            pTarget,
            nextConf,
            minP,
          });
          break;
        }

        const index = Number(nextChoice);
        if (!Number.isFinite(index) || index < 1) {
          stopReason = steps.length > 0 ? "done" : "invalid";
          break;
        }

        const actionChoice = inferActFromSomElement(loopElements, index);
        if (!actionChoice) {
          stopReason = steps.length > 0 ? "done" : "invalid";
          break;
        }

        let typeText: string | undefined;
        let usedValueKey: string | undefined;
        if (actionChoice === "type") {
          const valueKeys = Object.keys(remainingValues);
          if (valueKeys.length === 0) {
            console.log("[jev] loop:no-values", {
              tabId,
              step,
              index,
              brief: choiceBrief,
            });
            stopReason = steps.length > 0 ? "done" : "abstain";
            break;
          }

          // 方案 A：1 条直接用；多条让 Jev 在 values 里选（不靠 key↔标签硬匹配）
          let picked = pickValueForSomElement(
            loopElements,
            index,
            remainingValues,
          );
          if (picked && valueKeys.length === 1) {
            console.log("[jev] loop:single-value-type", {
              tabId,
              step,
              index,
              brief: String(choiceBrief).slice(0, 100),
              onlyKey: picked.key,
              text: String(picked.text).slice(0, 80),
            });
          }
          if (!picked && valueKeys.length > 1) {
            const valueReq = buildJevValueDecideRequest({
              goal: intent.goal,
              url: pageMeta.url,
              title: pageMeta.title,
              index,
              elementBrief: String(choiceBrief),
              values: remainingValues,
              stepIndex: step,
              maxSteps,
            });
            const valueDecided = await jevDecide(valueReq, {
              config: jevCfg,
              signal: toolSignal,
            });
            lastModel = valueDecided.model ?? lastModel;
            const valueAns = valueDecided.answers?.which_value as
              | JevChoiceAnswer
              | undefined;
            const valueChoice =
              valueAns?.type === "choice" ? String(valueAns.choice ?? "") : "";
            const valueProbs = valueAns?.probabilities ?? {};
            const valuePTarget =
              valueChoice && valueChoice !== "none"
                ? Number(valueProbs[valueChoice]) || 0
                : valueChoice === "none"
                  ? Number(valueProbs.none) || 0
                  : 0;
            const valueConf =
              typeof valueAns?.confidence === "number" ? valueAns.confidence : 0;

            console.log("[jev] loop:which-value", {
              tabId,
              step,
              index,
              brief: String(choiceBrief).slice(0, 100),
              valueChoice,
              valuePTarget,
              valueConf,
              minP,
              remainingValueKeys: valueKeys,
              model: valueDecided.model,
            });

            if (
              valueChoice &&
              valueChoice !== "none" &&
              valuePTarget >= minP &&
              Object.prototype.hasOwnProperty.call(remainingValues, valueChoice)
            ) {
              picked = {
                key: valueChoice,
                text: remainingValues[valueChoice]!,
              };
            }
          }

          if (!picked) {
            console.log("[jev] loop:no-value-match", {
              tabId,
              step,
              index,
              brief: choiceBrief,
              remainingValueKeys: valueKeys,
              hint: "multi-value: Jev which_value abstained or low p; single-value missing",
            });
            stopReason = steps.length > 0 ? "done" : "abstain";
            break;
          }
          typeText = picked.text;
          usedValueKey = picked.key;
          lastTypedForSuggest = typeText;
        }

        const brief = findSomBrief(loopElements, index) || `#${index}`;
        let actResult: unknown;
        if (actionChoice === "click") {
          actResult = await browser_click({
            index,
            conversationId,
          });
        } else {
          actResult = await browser_type({
            index,
            text: typeText,
            conversationId,
          });
        }

        const actOk =
          actResult &&
          typeof actResult === "object" &&
          ((actResult as { ok?: boolean }).ok === true ||
            (actResult as { verified?: boolean }).verified === true);

        if (actionChoice === "click" && actResult && typeof actResult === "object") {
          const cr = actResult as Record<string, unknown>;
          console.log(
            "[jev] loop:click-result " +
              `tab=${tabId} step=${step} index=${index} ok=${cr.ok === true} reason=${String(cr.reason ?? "-")} ` +
              `brief=${String(brief).slice(0, 80).replace(/\s+/g, " ")} ` +
              (typeof cr.verifyLine === "string" ? cr.verifyLine : ""),
          );
          // 日历格选中（新选或已选）：标记后下一轮改找关层/确认，禁止再点同一天
          if (loopBlockingOverlay.kind === "calendar") {
            const vl = typeof cr.verifyLine === "string" ? cr.verifyLine : "";
            const newlySelected = /snapAria=(?:false|null)->true/.test(vl);
            const staySelected =
              /snapAria=true->true/.test(vl) ||
              /after:.*\bliveAria=true\b/.test(vl) ||
              /after:.*\bresolved=true\b/.test(vl);
            if (newlySelected || (cr.ok === true && staySelected)) {
              if (!calendarDatePicked) {
                calendarDatePicked = true;
                console.log(
                  `[jev] loop:calendar-date-picked tab=${tabId} step=${step} index=${index} newly=${newlySelected} ok=${cr.ok === true}`,
                );
              }
            }
          }
        }

        let typePersistVl: string | null = null;
        if (actionChoice === "type" && actResult && typeof actResult === "object") {
          const tr = actResult as Record<string, unknown>;
          console.log("[jev] loop:type-result", {
            tabId,
            step,
            index,
            valueKey: usedValueKey ?? null,
            typed: String(typeText ?? "").slice(0, 40),
            ok: tr.ok === true,
            verified: tr.verified === true,
            method: typeof tr.method === "string" ? tr.method : null,
            finalValue: String(tr.finalValue ?? "").slice(0, 80),
            expected: String(typeText ?? "").slice(0, 40),
            error: typeof tr.error === "string" ? tr.error.slice(0, 120) : null,
          });
          // 短等后再读同一 data-som-idx：区分「验过了」vs「页面上留下来了」
          try {
            await delayMsAbortable(400, toolSignal);
            typePersistVl = await readFieldValueBySelector(
              tabId,
              somIndexToSelector(index),
            );
            const somVlBefore = (() => {
              const el = (loopElements as Array<Record<string, unknown>>).find(
                (e) => Number(e.i) === index,
              );
              return el && typeof el.vl === "string" ? el.vl.trim() : "";
            })();
            console.log("[jev] loop:type-persist", {
              tabId,
              step,
              index,
              expected: String(typeText ?? "").slice(0, 40),
              finalValueAtType: String(tr.finalValue ?? "").slice(0, 80),
              vlAfterMs: typePersistVl == null ? null : String(typePersistVl).slice(0, 80),
              somVlBeforeType: somVlBefore.slice(0, 40),
              stuck:
                !!typeText &&
                typePersistVl != null &&
                (typePersistVl === typeText ||
                  typePersistVl.toLowerCase().includes(String(typeText).toLowerCase())),
              overlayKind: loopBlockingOverlay.kind ?? null,
            });
          } catch (e) {
            if (isToolAbortError(e) || toolSignal?.aborted) throw e;
            console.warn("[jev] loop:type-persist-fail", {
              tabId,
              step,
              index,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        const stepRec = {
          step,
          action: actionChoice,
          index,
          brief,
          ...(usedValueKey ? { valueKey: usedValueKey } : {}),
          ...(typeText != null ? { typed: typeText.slice(0, 80) } : {}),
          confidence: nextConf,
          pTarget,
          ok: actOk !== false,
          model: decided.model,
        };
        steps.push(stepRec);
        console.log("[jev] loop:step", {
          tabId,
          ...stepRec,
          actOk: actOk !== false,
        });

        const summary = `${actionChoice} index=${index} ${brief}${
          typeText != null ? ` ← ${typeText.slice(0, 40)}` : ""
        }`;
        lastActionSummaries.push(summary);
        rememberJevPage(tabId, pageMeta, loopElements, summary);

        if (actOk === false) {
          // 日历：校验失败时再扫；层关了，或 live aria 已选中（Flights 选完常仍开着）→ soft ok
          if (loopBlockingOverlay.kind === "calendar") {
            try {
              await delayMsAbortable(200, toolSignal);
              const after = await annotateInteractiveElements(tabId);
              const afterEls = after.elements ?? [];
              let afterOv = finalizeBlockingOverlay(
                after.blockingOverlay ?? { present: false },
                intent.goal,
                remainingValues,
              );
              afterOv = coerceOverlayKindFromElements(afterOv, afterEls);
              const verifyLine =
                actResult && typeof actResult === "object"
                  ? String((actResult as { verifyLine?: string }).verifyLine ?? "")
                  : "";
              const selectedLive =
                /snapAria=(?:false|null)->true/.test(verifyLine) ||
                /after:.*\bliveAria=true\b/.test(verifyLine) ||
                /after:.*\bresolved=true\b/.test(verifyLine);
              const softOk =
                !afterOv.present || afterOv.kind !== "calendar" || selectedLive;
              if (selectedLive && !calendarDatePicked) {
                calendarDatePicked = true;
                console.log(
                  `[jev] loop:calendar-date-picked tab=${tabId} step=${step} index=${index} via=soft`,
                );
              }
              console.log(
                "[jev] loop:calendar-soft " +
                  `tab=${tabId} step=${step} index=${index} softOk=${softOk}` +
                  ` afterPresent=${afterOv.present} afterKind=${afterOv.kind ?? "null"}` +
                  ` selectedLive=${selectedLive} datePicked=${calendarDatePicked}` +
                  (verifyLine ? ` ${verifyLine}` : ""),
              );
              if (softOk) {
                loopElements = afterEls;
                loopBlockingOverlay = afterOv;
                // 不 break，继续同 loop（下一轮若 datePicked 会改找关层钮）
              } else {
                stopReason = "act_fail";
                console.log(
                  `[jev] loop:stop tab=${tabId} step=${step} reason=act_fail where=calendar-soft`,
                );
                break;
              }
            } catch {
              stopReason = "act_fail";
              console.log(
                `[jev] loop:stop tab=${tabId} step=${step} reason=act_fail where=calendar-soft-catch`,
              );
              break;
            }
          } else {
            stopReason = "act_fail";
            console.log(
              `[jev] loop:stop tab=${tabId} step=${step} reason=act_fail where=act-verify`,
            );
            break;
          }
        }

        // 错误弹窗：关掉后立刻交回主模型，禁止同 loop 里继续点「查询」
        {
          const clickedEl = (loopElements as Array<Record<string, unknown>>).find(
            (e) => Number(e.i) === index,
          );
          const clickedIsDismiss =
            clickedEl?.ds === true ||
            /确定|关闭|取消|好的|\bok\b|confirm|×|✕/i.test(String(brief));
          if (loopBlockingOverlay.isError && actionChoice === "click" && clickedIsDismiss) {
            errorOverlayForHint = loopBlockingOverlay;
            stopReason = "error_overlay";
            console.log("[jev] loop:stop", {
              tabId,
              step,
              reason: "error_overlay",
              message: loopBlockingOverlay.message?.slice(0, 120),
            });
            break;
          }
        }

        // type/focus 后预判会开层：轮询直到 blockingOverlay.present 或超时，再继续 decide
        if (actionChoice === "type" && actOk !== false && !loopBlockingOverlay.present) {
          const waitMs = 1000;
          const intervalMs = 120;
          const tWait = Date.now();
          const annotateTimeout = new Promise<SomAnnotateResult>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  elements: [],
                  areas: [],
                  blockingOverlay: { present: false },
                }),
              6000,
            ),
          );
          while (
            !loopBlockingOverlay.present &&
            Date.now() - tWait < waitMs
          ) {
            throwIfToolAborted();
            await delayMsAbortable(intervalMs, toolSignal);
            const again = await Promise.race([
              annotateInteractiveElements(tabId),
              annotateTimeout,
            ]);
            loopElements = again.elements ?? [];
            const rawOv = again.blockingOverlay ?? { present: false };
            loopBlockingOverlay = finalizeBlockingOverlay(
              rawOv,
              intent.goal,
              remainingValues,
            );
            loopBlockingOverlay = coerceOverlayKindFromElements(
              loopBlockingOverlay,
              loopElements,
            );
          }
          if (loopBlockingOverlay.kind === "suggest") {
            const needles = [
              lastTypedForSuggest,
              ...Object.values(remainingValues).map((v) => String(v).trim()),
            ].filter(Boolean) as string[];
            if (needles[0]) loopBlockingOverlay.suggestNeedle = needles[0];
          }
          if (loopBlockingOverlay.isError) {
            errorOverlayForHint = loopBlockingOverlay;
          }
          console.log("[jev] loop:type-overlay-wait", {
            tabId,
            step,
            waitedMs: Date.now() - tWait,
            present: loopBlockingOverlay.present,
            kind: loopBlockingOverlay.kind ?? null,
            elementCount: loopElements.length,
            optCount: countOverlaySuggestOptions(loopElements),
          });
        }

        if (usedValueKey) {
          const remainingAfterDelete = { ...remainingValues };
          delete remainingAfterDelete[usedValueKey];
          const persistEmpty =
            actionChoice === "type" &&
            (typePersistVl == null || String(typePersistVl).trim() === "");
          console.log("[jev] loop:consume-value", {
            tabId,
            step,
            usedValueKey,
            typed: String(typeText ?? "").slice(0, 40),
            remainingAfter: Object.keys(remainingAfterDelete),
            consumeDespiteEmpty: persistEmpty,
            vlAfterMs:
              typePersistVl == null ? null : String(typePersistVl).slice(0, 80),
          });
          delete remainingValues[usedValueKey];
        }

        // Duplicate guard: same action+index+text twice in a row → stop.
        if (steps.length >= 2) {
          const a = steps[steps.length - 1]!;
          const b = steps[steps.length - 2]!;
          if (
            a.action === b.action &&
            a.index === b.index &&
            (a.typed ?? "") === (b.typed ?? "")
          ) {
            stopReason = "done";
            console.log("[jev] loop:stop", {
              tabId,
              step,
              reason: "duplicate-step",
            });
            break;
          }
          // Radio flip guard: two clicks on different options of the same name group.
          if (a.action === "click" && b.action === "click" && a.index !== b.index) {
            const ea = loopElements.find(
              (raw) =>
                raw &&
                typeof raw === "object" &&
                Number((raw as { i?: number }).i) === a.index,
            ) as { tp?: string; nm?: string } | undefined;
            const eb = loopElements.find(
              (raw) =>
                raw &&
                typeof raw === "object" &&
                Number((raw as { i?: number }).i) === b.index,
            ) as { tp?: string; nm?: string } | undefined;
            if (
              ea?.tp === "radio" &&
              eb?.tp === "radio" &&
              ea.nm &&
              ea.nm === eb.nm
            ) {
              stopReason = "done";
              console.log("[jev] loop:stop", {
                tabId,
                step,
                reason: "radio-flip",
                name: ea.nm,
                indexes: [b.index, a.index],
              });
              break;
            }
          }
        }

        if (step === maxSteps) {
          stopReason = "max_steps";
        }
      }

      if (toolSignal?.aborted) {
        console.log("[jev] loop:cancelled", {
          tabId,
          steps: steps.length,
          remainingValueKeys: Object.keys(remainingValues),
        });
        return {
          ok: false,
          cancelled: true,
          captureTab: false,
          purpose: "act",
          goal: intent.goal,
          jev: {
            acted: steps.length > 0,
            loop: true,
            status: "cancelled",
            steps,
            stepCount: steps.length,
            remainingValues,
            model: lastModel,
          },
          page: pageMeta,
          hint: "jev: cancelled by user stop.",
        };
      }

      if (steps.length === 0) {
        if (stopReason === "no_elements") {
          return buildVisionResponse(
            "jev: no SoM elements; fell back to vision. Pick index yourself or retry screenshot.",
          );
        }
        rememberJevPage(tabId, pageMeta, loopElements);
        const errHint = errorOverlayForHint
          ? buildErrorOverlayFollowupHint(errorOverlayForHint)
          : null;
        return buildVisionResponse(
          [
            `jev: loop abstained with no steps (reason=${stopReason}). ` +
              `Use screenshot + elements; or retry with clearer goal/values.`,
            errHint,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }

      const allOk = steps.every((s) => s.ok);
      console.log("[jev] loop:done", {
        tabId,
        stopReason,
        steps: steps.length,
        remainingValueKeys: Object.keys(remainingValues),
        model: lastModel,
        errorOverlay: errorOverlayForHint?.message?.slice(0, 80) ?? null,
      });

      // 错误弹窗：关窗后交回主模型（带 message），禁止同 loop 继续原查询
      if (stopReason === "error_overlay") {
        const ov = errorOverlayForHint ?? loopBlockingOverlay;
        const follow = buildErrorOverlayFollowupHint(ov) ?? "";
        console.log("[jev] act:error-overlay-handoff", {
          tabId,
          message: ov.message?.slice(0, 120),
          steps: steps.length,
        });
        return {
          ok: allOk,
          captureTab: false,
          purpose: "act",
          goal: intent.goal,
          blockingOverlay: {
            present: true,
            kind: ov.kind,
            expected: false,
            isError: true,
            ...(ov.message ? { message: ov.message } : {}),
          },
          instruction: buildOverlayInstruction(ov),
          jev: {
            acted: true,
            loop: true,
            status: "error_overlay",
            steps,
            stepCount: steps.length,
            remainingValues: remainingValues,
            model: lastModel,
          },
          page: pageMeta,
          hint:
            `jev: error/validation overlay dismissed after ${steps.length} step(s). ` +
            `${follow} ` +
            `Next: browser_screenshot purpose=act with a NEW goal that fixes the issue in blockingOverlay.message — ` +
            `do NOT repeat the same search/submit.`,
        };
      }

      // Filter: [jev] act:omit-image — loop finished without returning image to LLM
      console.log("[jev] act:omit-image", {
        tabId,
        loop: true,
        stopReason,
        stepCount: steps.length,
        model: lastModel,
      });

      const errTail = errorOverlayForHint
        ? `\n${buildErrorOverlayFollowupHint(errorOverlayForHint) ?? ""}`
        : "";

      return {
        ok: allOk && stopReason !== "act_fail",
        captureTab: false,
        purpose: "act",
        goal: intent.goal,
        jev: {
          acted: true,
          loop: true,
          status:
            stopReason === "act_fail"
              ? "failed"
              : stopReason === "max_steps"
                ? "max_steps"
                : "done",
          steps,
          stepCount: steps.length,
          remainingValues: remainingValues,
          model: lastModel,
        },
        page: pageMeta,
        ...(errorOverlayForHint?.isError
          ? {
              blockingOverlay: {
                present: true,
                kind: errorOverlayForHint.kind,
                expected: false,
                isError: true,
                ...(errorOverlayForHint.message
                  ? { message: errorOverlayForHint.message }
                  : {}),
              },
            }
          : {}),
        hint:
          `jev: loop finished (${stopReason}) after ${steps.length} step(s). ` +
          `Do not repeat those actions. ` +
          (stopReason === "act_fail"
            ? "Last act failed — inspect or retry with vision."
            : "Next: browser_screenshot purpose=verify with the same goal, or continue.") +
          errTail,
      };
    }

    // verify
    throwIfToolAborted();
    const lastChange = buildJevLastChange(tabId, pageMeta, elementsForJev);
    const prev = jevLastPageByTab.get(tabId);
    const pageText = await collectVerifyVisibleText(
      tabId,
      parseBoxFromLastAction(prev?.lastAction),
    );
    console.log("[jev] verify:visible-text", {
      tabId,
      dialogs: pageText.dialogs.length,
      visibleChars: pageText.visibleText.length,
      hasFocusBox: !!parseBoxFromLastAction(prev?.lastAction),
    });
    const decideReq = buildJevVerifyDecideRequest({
      goal: intent.goal,
      url: pageMeta.url,
      title: pageMeta.title,
      elements: elementsForJev,
      lastChange,
      lastAction: prev?.lastAction,
      visibleText: pageText.visibleText,
      dialogs: pageText.dialogs,
    });
    const decided = await jevDecide(decideReq, {
      config: jevCfg,
      signal: toolSignal,
    });
    const ans = decided.answers?.status as JevChoiceAnswer | undefined;
    const status = ans?.type === "choice" ? String(ans.choice ?? "uncertain") : "uncertain";
    const confidence = typeof ans?.confidence === "number" ? ans.confidence : 0;
    const minConf = jevCfg.confidenceMin;

    logScreenshot("browser_screenshot:jev-verify", {
      tabId,
      status,
      confidence,
      minConf,
      model: decided.model,
    });

    rememberJevPage(tabId, pageMeta, elementsForJev, prev?.lastAction);

    if (status === "uncertain" || confidence < minConf) {
      return buildVisionResponse(
        `jev: verify=${status} conf=${confidence.toFixed(2)}; uncertain — use screenshot to decide.`,
      );
    }

    // Filter console by: [jev] verify:omit-image  → Jev verify ok; no image to main LLM
    console.log("[jev] verify:omit-image", {
      tabId,
      status,
      confidence,
      minConf,
      model: decided.model,
    });

    return {
      ok: true,
      captureTab: false,
      purpose: "verify",
      goal: intent.goal,
      jev: {
        status,
        confidence,
        model: decided.model,
        lastChange: lastChange ?? null,
      },
      page: pageMeta,
      hint:
        status === "done"
          ? `jev: verify=done (conf=${confidence.toFixed(2)}). Goal likely achieved; proceed or finish.`
          : `jev: verify=${status} (conf=${confidence.toFixed(2)}). Adjust strategy; screenshot was omitted.`,
    };
  } catch (e) {
    if (isToolAbortError(e) || toolSignal?.aborted) {
      console.log("[jev] screenshot:cancelled", { tabId, purpose: intent.purpose });
      return {
        ok: false,
        cancelled: true,
        captureTab: false,
        purpose: intent.purpose,
        goal: intent.goal,
        hint: "jev: cancelled by user stop.",
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[jev] screenshot:fail", { tabId, error: msg });
    logScreenshot("browser_screenshot:jev-fail", { tabId, error: msg });
    rememberJevPage(tabId, pageMeta, elementsForJev);
    return buildVisionResponse(`jev: API error (${msg}); fell back to vision screenshot.`);
  } finally {
    if (conversationId) endToolAbort(conversationId);
  }
  }; // end run()

  const prev = screenshotCaptureChain;
  let release!: () => void;
  screenshotCaptureChain = new Promise<void>((r) => {
    release = r;
  });
  // 上一枪若已卡死，最多等一小段再开跑，避免直控永久排队
  await Promise.race([
    prev.catch(() => undefined),
    new Promise<void>((r) => setTimeout(r, 8_000)),
  ]);
  try {
    return await Promise.race([
      run(),
      new Promise<Record<string, unknown>>((resolve) => {
        setTimeout(() => {
          logScreenshot("browser_screenshot:total-timeout", {
            timeoutMs: SCREENSHOT_TOTAL_TIMEOUT_MS,
          });
          resolve({
            ok: false,
            error: `browser_screenshot timed out after ${SCREENSHOT_TOTAL_TIMEOUT_MS}ms`,
            captureTab: false,
          });
        }, SCREENSHOT_TOTAL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    release();
  }
}

/**
 * 对全页 SoM 溢出区域 Ax 做二次详细标注并裁剪截图（som-overflow-area-v1）
 */
async function browser_screenshot_area(args: Record<string, unknown>): Promise<unknown> {
  const areaIdRaw = typeof args.areaId === "string" ? args.areaId.trim() : "";
  if (!areaIdRaw) return { ok: false, error: "areaId required (e.g. A1)" };

  const maxWidth = (args.maxWidth as number) ?? 900;
  const conversationId = args.conversationId as string | undefined;
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { ok: false, error: "no tab" };

  const area = getSomOverflowArea(tabId, areaIdRaw);
  if (!area) {
    return {
      ok: false,
      error: `unknown areaId ${areaIdRaw}`,
      hint: "请先 browser_screenshot；若返回 areas，再用其中的 areaId 调用本工具。",
    };
  }

  const clipRect = {
    left: area.left,
    top: area.top,
    width: area.width,
    height: area.height,
  };

  logScreenshot("browser_screenshot_area:start", {
    tabId,
    conversationId,
    areaId: area.id,
    clipRect,
  });

  const annotateTimeout = new Promise<SomAnnotateResult>((resolve) =>
    setTimeout(
      () => resolve({ elements: [], areas: [], blockingOverlay: { present: false } }),
      6000,
    ),
  );
  const annotated = await Promise.race([
    annotateInteractiveElements(tabId, { clipRect }),
    annotateTimeout,
  ]);
  let elements = annotated.elements;
  const somOverlay = buildSomOverlayPayload(elements, []);

  const viewport = await captureSpecViewportDataUrl(tabId);
  // som-post-composite-v1：不再依赖 DOM 视觉层；清理历史残留
  await removeAnnotationVisuals(tabId);

  if ("error" in viewport) {
    return { ok: false, error: viewport.error, areaId: area.id };
  }

  const painted =
    somOverlay.elements.length > 0
      ? await compositeSomOnRawViewportInTab(tabId, viewport.dataUrl, somOverlay)
      : viewport.dataUrl;

  const cropped = await cropViewportToElement(tabId, painted, clipRect, {
    padding: 8,
    maxWidth,
    jpegQuality: 0.55,
  });
  if ("error" in cropped) {
    return { ok: false, error: cropped.error, areaId: area.id };
  }

  const dataUrl = cropped.dataUrl;
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mimeType = header.includes("png") ? "image/png" : "image/jpeg";

  elements = stripElementRects(elements);

  debugDownloadScreenshot(tabId, mimeType, base64, {
    captureSource: "screenshot-area",
    conversationId,
    withLabels: true,
    elementCount: elements.length,
  });

  logScreenshot("browser_screenshot_area:ok", {
    tabId,
    conversationId,
    areaId: area.id,
    elementCount: elements.length,
    base64Len: base64.length,
  });

  return {
    ok: true,
    areaId: area.id,
    captureScope: "area",
    captureTab: true,
    mimeType,
    base64,
    dataUrl: "(base64 data omitted)",
    width: cropped.width,
    height: cropped.height,
    elements,
    markedCount: elements.length,
    somSchema: SOM_ELEMENT_SCHEMA,
    somSchemaVersion: SOM_SCHEMA_VERSION,
    hint:
      `区域 ${area.id} 已二次标注 ${elements.length} 个可交互元素（编号从 1 起，仅对本区域有效）。` +
      `请用本结果中的 index 调用 browser_click / browser_type 等；勿混用上一张全页截图的编号。` +
      `编号勿在对用户回复中提及。`,
  };
}

// ========== SoM 编号点击/输入 ==========

/**
 * SoM 点击统一底层 — 回滚标记（git grep 此字符串可定位本次改动）
 * 稳定版：browser_click 为轻量 isolated 单 frame；browser_click_index 独立 click-index-v4。
 * 本版 (click-unified-som-v2)：对外以 ok 表示 DOM/Tab 可观测进展（原 verified）；无进展时 ok=false 便于模型熔断。
 * 上一版 (click-unified-som-v1)：browser_click 承接 click-index-v4 管线；click_index 转 selector 后委托 click。
 */
const BROWSER_CLICK_UNIFIED_SOM_TAG = "click-unified-som-v2";
/** Console filter: `[click-trace-v1]` — browser_click 入口 + clickCore 每次 method/phase 尝试 */
const CLICK_TRACE_LOG = "[click-trace-v1]";

function somIndexToSelector(index: number): string {
  return `[data-som-idx="${index}"]`;
}

/**
 * 合并 SoM index / CSS selector：优先 index。
 * requireLocator=true 时二者至少其一；同时传则以 index 为准。
 */
function resolveSomLocatorArgs(
  args: Record<string, unknown>,
  options: {
    indexKey?: string;
    selectorKey?: string;
    requireLocator?: boolean;
    implTag?: string;
  } = {},
):
  | { ok: true; args: Record<string, unknown>; somIndex?: number }
  | { ok: false; error: string; implTag?: string } {
  const indexKey = options.indexKey ?? "index";
  const selectorKey = options.selectorKey ?? "selector";
  const requireLocator = options.requireLocator ?? true;
  const rawIndex = args[indexKey];
  const index =
    typeof rawIndex === "number" && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : null;
  const selector =
    typeof args[selectorKey] === "string" && String(args[selectorKey]).trim()
      ? String(args[selectorKey]).trim()
      : undefined;

  if (index != null) {
    const next = { ...args };
    delete next[indexKey];
    next[selectorKey] = somIndexToSelector(index);
    return { ok: true, args: next, somIndex: index };
  }
  if (selector) {
    const next = { ...args };
    delete next[indexKey];
    next[selectorKey] = selector;
    return { ok: true, args: next };
  }
  if (!requireLocator) {
    const next = { ...args };
    delete next[indexKey];
    return { ok: true, args: next };
  }
  return {
    ok: false,
    error: `${indexKey} or ${selectorKey} required (prefer ${indexKey} after screenshot)`,
    ...(options.implTag ? { implTag: options.implTag } : {}),
  };
}

/** som-interaction-unified-v1 回滚标记 */
const BROWSER_TYPE_UNIFIED_SOM_TAG = "type-unified-som-v2";
const BROWSER_LONG_PRESS_UNIFIED_SOM_TAG = "long-press-unified-som-v1";
const BROWSER_HOVER_UNIFIED_SOM_TAG = "hover-unified-som-v1";
const HOVER_DEFAULT_DWELL_MS = 600;
const HOVER_MAX_DWELL_MS = 5000;
const HOVER_MOVE_INTERVAL_MS = 80;
const HOVER_REAL_MOUSE_TAG = "hover-real-mouse-v2";
const BROWSER_DRAG_UNIFIED_SOM_TAG = "drag-unified-som-v1";
const BROWSER_DRAG_DND_TAG = "drag-dnd-v1";
const BROWSER_DRAG_RANGE_TAG = "drag-range-v1";
const DRAG_SYNTHETIC_STEPS = 12;
const DRAG_STEP_MS = 16;

type ClickSnapshotTarget = {
  ariaExpanded: string | null;
  ariaPressed: string | null;
  ariaSelected: string | null;
  ariaChecked: string | null;
  disabled: boolean;
  checked?: boolean;
  value?: string;
  classTokenHash: string;
};

type ClickSnapshot = {
  href: string;
  openDialogCount: number;
  activeElementTag: string;
  activeElementInSubtree: boolean;
  target: ClickSnapshotTarget;
  ancestorLinkHref: string | null;
  ariaCurrent: string | null;
  ancestorClassTokenHash: string;
  paginationFingerprint: string;
  contentRegionFingerprint: string;
  triggerWrapperAriaExpanded: string | null;
  triggerWrapperClassHash: string;
  nearbySurfaceFingerprint: string;
  probeBelowFingerprint: string;
};

type DomChangeReason =
  | "href-changed"
  | "dialog-opened"
  | "focus-moved"
  | "aria-expanded-changed"
  | "aria-pressed-changed"
  | "aria-selected-changed"
  | "aria-checked-changed"
  | "checked-changed"
  | "value-changed"
  | "semantic-class-changed"
  | "aria-current-changed"
  | "ancestor-semantic-changed"
  | "pagination-changed"
  | "content-region-changed"
  | "trigger-wrapper-expanded-changed"
  | "trigger-wrapper-class-changed"
  | "floating-surface-visible"
  | "floating-surface-dismissed"
  | "probe-below-changed";

type ClickMethod = "native" | "synthetic" | "keyboard-space" | "keyboard-enter";

type TabOutcome = {
  newTabs: Array<{ tabId: number; url?: string }>;
  sameTabNavigation?: { url: string };
  /** click 窗口内触发的浏览器下载（Gmail 附件等页面无 DOM 变化场景） */
  download?: {
    id: number;
    filename?: string;
    url?: string;
    mime?: string;
    state?: string;
  };
};

type ClickPageAttemptResult = {
  ok: boolean;
  error?: string;
  elementNotFound?: boolean;
  childNotFound?: boolean;
  overlayBlocked?: boolean;
  opensNewTab?: boolean;
  ancestorLinkHref?: string | null;
  clicked?: {
    tag: string;
    id?: string;
    text?: string;
    point: { x: number; y: number };
    resolvedVia?: "selector" | "index" | "child-text";
    matchedText?: string;
  };
  method?: ClickMethod;
  domChanged?: boolean;
  domReason?: DomChangeReason | null;
  snapshotBefore?: ClickSnapshot;
  snapshotAfter?: ClickSnapshot;
  debug?: { steps: string[]; frameHref: string };
  /** 一行可复制：日历格 aria / data-iso / 是否脱挂，避免控制台对象收起 */
  verifyLine?: string;
};

const CLICK_INDEX_DEFAULT_WAIT_MS = 300;
const CLICK_INDEX_TAB_WATCH_MS = 400;
/** CDP 兜底时等新 tab / 导航的尾巴（覆盖 _blank 弹窗与慢跳转） */
const CLICK_INDEX_CDP_TAB_WATCH_MS = 2000;
const BROWSER_CLICK_CDP_FALLBACK_TAG = "click-cdp-fallback-v1";
const CLICK_INDEX_RESCREEN_HINT =
  "未找到对应 SoM 编号，点击未执行。请先 browser_screenshot 重新获取标注，在 elements 映射中确认目标 index 后再 browser_click({ index })。";

/** 获取验证码类点击：引导模型先检查协议勾选（system prompt 对 instruction 为硬约束） */
const CLICK_VERIFY_CODE_TEXT_KEYWORDS = [
  "验证码",
  "短信验证",
  "获取短信",
  "verification code",
  "verify code",
  "otp",
] as const;

const CLICK_VERIFY_CODE_AGREEMENT_INSTRUCTION =
  "点击目标与获取验证码相关。下一步前必须先确认页面是否有「用户协议 / 隐私政策 / 同意」类勾选框：若未勾选则先勾选，再继续获取验证码；若已勾选或无此控件，再继续后续操作。";

function clickTextLooksLikeVerificationCode(
  ...parts: Array<string | null | undefined>
): boolean {
  const hay = parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .toLowerCase();
  if (!hay) return false;
  return CLICK_VERIFY_CODE_TEXT_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
}

function attachVerificationCodeAgreementInstruction(
  response: Record<string, unknown>,
  ...textParts: Array<string | null | undefined>
): Record<string, unknown> {
  if (!clickTextLooksLikeVerificationCode(...textParts)) return response;
  return {
    ...response,
    instruction: CLICK_VERIFY_CODE_AGREEMENT_INSTRUCTION,
  };
}

function buildClickNotFoundResponse(
  selector: string,
  attempts: Array<{ method: ClickMethod | "cdp-mouse" | string; ok: boolean; reason?: string; frameId?: number }>,
  extra?: { frameId?: number; error?: string; somIndex?: number },
): Record<string, unknown> {
  const isSom = extra?.somIndex != null;
  return {
    ok: false,
    reason: "element-not-found",
    error: extra?.error ?? (isSom
      ? `未找到编号 [${extra!.somIndex}] 的元素（页面可能已变化，请重新截图）`
      : `选择器未匹配到元素: ${selector}`),
    hint: isSom ? CLICK_INDEX_RESCREEN_HINT : "元素未找到，请确认 selector 是否正确。",
    selector,
    ...(isSom ? { index: extra!.somIndex, somIndex: extra!.somIndex } : {}),
    implTag: BROWSER_CLICK_UNIFIED_SOM_TAG,
    attempts,
    ...(extra?.frameId != null ? { frameId: extra.frameId } : {}),
  };
}

function mergeClickDomAndTabOutcome(input: {
  domChanged: boolean;
  domReason: DomChangeReason | null;
  tabOutcome: TabOutcome;
  opensNewTab: boolean;
}): { verified: boolean; reason: string } {
  if (input.tabOutcome.newTabs.length > 0) {
    return { verified: true, reason: "new-tab-opened" };
  }
  if (input.tabOutcome.sameTabNavigation) {
    return { verified: true, reason: "same-tab-navigated" };
  }
  if (input.tabOutcome.download) {
    console.log("[ClickDownload]", "merge:download-verified", {
      download: input.tabOutcome.download,
      domChanged: input.domChanged,
      domReason: input.domReason,
    });
    return { verified: true, reason: "download-started" };
  }
  console.log("[ClickDownload]", "merge:no-download", {
    hasDownload: !!input.tabOutcome.download,
    newTabs: input.tabOutcome.newTabs.length,
    sameTabNavigation: input.tabOutcome.sameTabNavigation ?? null,
    domChanged: input.domChanged,
    domReason: input.domReason,
    opensNewTab: input.opensNewTab,
  });
  if (input.domChanged && input.domReason) {
    return { verified: true, reason: input.domReason };
  }
  if (input.opensNewTab) {
    return { verified: false, reason: "likely-new-tab-timeout" };
  }
  return { verified: false, reason: "no-observable-change" };
}

function buildClickIndexHint(
  ok: boolean,
  reason: string,
  tabOutcome: TabOutcome,
  somIndex?: number,
): string | undefined {
  if (ok && reason === "new-tab-opened" && tabOutcome.newTabs[0]) {
    const t = tabOutcome.newTabs[0];
    return `已打开新 tab (id=${t.tabId}${t.url ? `, url=${t.url}` : ""})。当前会话仍绑定原 tab；要看新页面请切换 tab 或重新截图。`;
  }
  if (ok && reason === "same-tab-navigated" && tabOutcome.sameTabNavigation) {
    return `当前 tab 已导航至 ${tabOutcome.sameTabNavigation.url}。可 browser_screenshot 确认。`;
  }
  if (ok && reason === "download-started" && tabOutcome.download) {
    const d = tabOutcome.download;
    const name = d.filename?.trim() || "(filename pending)";
    return `已触发浏览器下载：${name}${d.state ? ` (state=${d.state})` : ""}。页面可能无明显变化，无需再截图确认下载是否开始。`;
  }
  if (!ok && reason === "no-observable-change") {
    return somIndex != null
      ? "点击已执行，但未观测到页面进展（ok=false）。勿盲目重复点击同一 index；可改用 text 子树匹配、换目标，或交由用户介入。若 SoM 标在外层容器上，可传 text 在子树内匹配子元素。"
      : "点击已执行，但未观测到页面进展（ok=false）。勿盲目重复点击；可换定位方式或交由用户介入。";
  }
  if (!ok && reason === "likely-new-tab-timeout") {
    return "元素可能打开新 tab，但未在超时内检测到。已尝试 CDP 真实鼠标时请检查是否有新 tab；或改用 browser_navigate / 交由用户介入。";
  }
  return undefined;
}

/** MAIN world：resolve → preflight → clickOnce → poll（须自包含，供 executeScript 序列化） */
async function clickSelectorPageAttempt(
  selector: string,
  method: string,
  waitTimeoutMs: number,
): Promise<ClickPageAttemptResult | null> {
  const SEMANTIC = [
    "active", "selected", "open", "expanded", "collapsed", "checked", "disabled",
    "focus", "focused", "current", "on", "off", "show", "hide", "visible",
    "pressed", "highlight", "hover", "loading",
  ];

  const hashClassTokens = (className: string): string => {
    if (!className || typeof className !== "string") return "";
    const tokens = className
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.toLowerCase())
      .filter((t) => SEMANTIC.some((s) => t.includes(s)));
    tokens.sort();
    return tokens.join("|");
  };

  const findAncestorLink = (el: HTMLElement): HTMLAnchorElement | null => {
    const selfLink = el.closest("a[href]");
    return selfLink ? (selfLink as HTMLAnchorElement) : null;
  };

  const linkOpensNewTab = (a: HTMLAnchorElement): boolean => {
    const target = (a.getAttribute("target") || "").toLowerCase();
    if (target === "_blank") return true;
    const rel = (a.getAttribute("rel") || "").toLowerCase();
    return rel.includes("noopener") || rel.includes("noreferrer");
  };

  const getClassNameStr = (node: Element): string => {
    const cn = (node as HTMLElement).className;
    if (typeof cn === "string") return cn;
    return node.getAttribute("class") || "";
  };

  const isVisibleEl = (node: Element): boolean => {
    const he = node as HTMLElement;
    const r = he.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = window.getComputedStyle(he);
    return cs.display !== "none" && cs.visibility !== "hidden";
  };

  const findTriggerWrapper = (el: HTMLElement): HTMLElement | null => {
    const wrap = el.closest(
      '[aria-haspopup], [role="combobox"], [class*="select"], [class*="picker"], [class*="dropdown"]',
    ) as HTMLElement | null;
    return wrap ?? el.parentElement;
  };

  const snapshotTriggerWrapper = (el: HTMLElement) => {
    const carrier = findTriggerWrapper(el);
    if (!carrier) return { wrapperAriaExpanded: null as string | null, wrapperClassTokenHash: "" };
    return {
      wrapperAriaExpanded: carrier.getAttribute("aria-expanded"),
      wrapperClassTokenHash: hashClassTokens(getClassNameStr(carrier)),
    };
  };

  const fingerprintNearbySurfaces = (anchor: HTMLElement): string => {
    const er = anchor.getBoundingClientRect();
    const items: string[] = [];
    const menuSel =
      '[role="menu"], [role="listbox"], [role="dialog"], [class*="dropdown"], [class*="popover"], [class*="picker"], [class*="panel"], ul, ol';
    for (const candidate of Array.from(document.querySelectorAll(menuSel))) {
      const node = candidate as HTMLElement;
      if (node === anchor || anchor.contains(node)) continue;
      if (!isVisibleEl(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 32 || r.height < 16) continue;
      const near =
        r.bottom >= er.top - 24 && r.top <= er.bottom + 320
        && r.right >= er.left - 60 && r.left <= er.right + 60;
      if (!near) continue;
      const listish =
        node.matches('ul, ol, [role="listbox"], [role="menu"], [role="dialog"]')
        || !!node.querySelector('li, [role="option"], [role="menuitem"], tr, [class*="item"], [class*="option"]');
      if (!listish) continue;
      items.push(`${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`);
    }
    items.sort();
    return items.join("|");
  };

  const fingerprintProbeBelow = (anchor: HTMLElement): string => {
    const er = anchor.getBoundingClientRect();
    if (er.width < 1 || er.height < 1) return "";
    const px = Math.round(er.left + er.width / 2);
    const py = Math.round(Math.min(er.bottom + 4, window.innerHeight - 1));
    if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) return "";
    const top = document.elementFromPoint(px, py) as HTMLElement | null;
    if (!top) return "";
    if (top === anchor || anchor.contains(top)) return "self";
    const tag = top.tagName.toLowerCase();
    const cls = typeof top.className === "string" ? top.className.split(/\s+/)[0] || "" : "";
    return `${tag}${cls ? `.${cls}` : ""}`;
  };

  const findPaginationGroup = (el: HTMLElement): HTMLElement | null => {
    const inPager = el.closest(
      ".ant-pagination, [class*='pagination'], nav ul, [role='navigation']",
    ) as HTMLElement | null;
    if (inPager && isVisibleEl(inPager)) return inPager;
    for (const sel of [
      ".ant-pagination",
      "[class*='pagination']",
      "nav[aria-label*='pagination' i]",
      "[role='navigation']",
    ]) {
      for (const node of Array.from(document.querySelectorAll(sel))) {
        if (isVisibleEl(node)) return node as HTMLElement;
      }
    }
    return null;
  };

  const snapshotPagination = (pager: HTMLElement | null): string => {
    if (!pager) return "";
    const active = pager.querySelector(
      "[aria-current='page'], [aria-current='true'], .ant-pagination-item-active, .active, .current, .selected, [class*='item-active']",
    ) as HTMLElement | null;
    const activeText = (active?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    const activeClass = active ? hashClassTokens(getClassNameStr(active)) : "";
    const aria = active?.getAttribute("aria-current") || "";
    return `${activeText}|${activeClass}|${aria}`;
  };

  const findContentRegion = (el: HTMLElement): HTMLElement | null => {
    const fromClick = el.closest("table, .ant-table, .ant-table-wrapper, [role='grid'], [role='table']");
    if (fromClick) {
      const tbody = fromClick.querySelector("tbody, .ant-table-tbody, [role='rowgroup']");
      if (tbody && isVisibleEl(tbody)) return tbody as HTMLElement;
      if (isVisibleEl(fromClick)) return fromClick as HTMLElement;
    }
    for (const sel of [".ant-table-tbody", ".ant-table-body tbody", "table tbody", "[role='grid']"]) {
      const node = document.querySelector(sel);
      if (node && isVisibleEl(node)) return node as HTMLElement;
    }
    return null;
  };

  const snapshotContentRegion = (region: HTMLElement | null): string => {
    if (!region) return "";
    const rows = region.querySelectorAll("tr, [role='row'], li.ant-table-row");
    const samples: string[] = [];
    const limit = Math.min(3, rows.length);
    for (let i = 0; i < limit; i++) {
      samples.push((rows[i].textContent || "").trim().replace(/\s+/g, " ").slice(0, 100));
    }
    return `${rows.length}:${samples.join("||")}`;
  };

  const takeSpaRegionSnapshot = (el: HTMLElement) => {
    const ariaCarrier = (el.closest("[aria-current]") as HTMLElement | null) || el;
    const ancestorItem = el.closest("li, [role='listitem']") as HTMLElement | null;
    return {
      ariaCurrent: ariaCarrier.getAttribute("aria-current"),
      ancestorClassTokenHash:
        ancestorItem && ancestorItem !== el ? hashClassTokens(getClassNameStr(ancestorItem)) : "",
      paginationFingerprint: snapshotPagination(findPaginationGroup(el)),
      contentRegionFingerprint: snapshotContentRegion(findContentRegion(el)),
    };
  };


  /**
   * Flights 等：SoM 常标在内层 button/div，aria-selected 在父 gridcell。
   * 优先读 cell；若节点已脱挂则按 data-iso 再查 live。
   */
  const resolveAriaSelected = (el: HTMLElement): string | null => {
    const cell =
      (el.closest('[role="gridcell"], [role="option"]') as HTMLElement | null) ||
      (el.matches?.('[role="gridcell"], [role="option"]') ? el : null);
    const iso =
      cell?.getAttribute("data-iso") ||
      el.closest("[data-iso]")?.getAttribute("data-iso") ||
      "";
    if (iso) {
      try {
        const live = document.querySelector(
          `[role="gridcell"][data-iso="${iso}"], [data-iso="${iso}"]`,
        ) as HTMLElement | null;
        if (live) return live.getAttribute("aria-selected");
      } catch {
        /* ignore */
      }
    }
    if (cell) return cell.getAttribute("aria-selected");
    return el.getAttribute("aria-selected");
  };

  const selectionDiag = (el: HTMLElement, tag: string): string => {
    const cell =
      (el.closest('[role="gridcell"], [role="option"]') as HTMLElement | null) || el;
    const iso = cell.getAttribute("data-iso") || el.closest("[data-iso]")?.getAttribute("data-iso") || "";
    let liveAria = "na";
    if (iso) {
      try {
        const live = document.querySelector(
          `[role="gridcell"][data-iso="${iso}"], [data-iso="${iso}"]`,
        ) as HTMLElement | null;
        liveAria = live ? String(live.getAttribute("aria-selected") ?? "null") : "missing";
      } catch {
        liveAria = "err";
      }
    }
    const cellCls = String(cell.className || "")
      .trim()
      .replace(/\s+/g, ".")
      .slice(0, 72);
    return (
      `${tag}:conn=${el.isConnected}` +
      ` selfAria=${el.getAttribute("aria-selected") ?? "null"}` +
      ` cellAria=${cell.getAttribute("aria-selected") ?? "null"}` +
      ` liveAria=${liveAria}` +
      ` resolved=${resolveAriaSelected(el) ?? "null"}` +
      ` iso=${iso || "-"}` +
      ` cellCls=${cellCls || "-"}`
    );
  };

  const takeSnapshot = (el: HTMLElement, subtreeRoot: HTMLElement): ClickSnapshot => {
    const active = document.activeElement as HTMLElement | null;
    const ancestorLink = findAncestorLink(el);
    const inp = el as HTMLInputElement;
    const shortValue =
      el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA"
        ? String(inp.value ?? "").slice(0, 120)
        : undefined;
    const wrapperSnap = snapshotTriggerWrapper(el);

    return {
      href: location.href,
      openDialogCount: document.querySelectorAll("dialog[open]").length,
      activeElementTag:
        active && active !== document.body
          ? active.tagName.toLowerCase() + (active.id ? `#${active.id}` : "")
          : "",
      activeElementInSubtree: !!(
        active &&
        active !== document.body &&
        (subtreeRoot === active || subtreeRoot.contains(active))
      ),
      target: {
        ariaExpanded: el.getAttribute("aria-expanded"),
        ariaPressed: el.getAttribute("aria-pressed"),
        ariaSelected: resolveAriaSelected(el),
        ariaChecked: el.getAttribute("aria-checked"),
        disabled: !!(el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true",
        checked: el.tagName === "INPUT" ? inp.checked : undefined,
        value: shortValue,
        classTokenHash: hashClassTokens(typeof el.className === "string" ? el.className : ""),
      },
      ancestorLinkHref: ancestorLink ? ancestorLink.href : null,
      ...takeSpaRegionSnapshot(el),
      triggerWrapperAriaExpanded: wrapperSnap.wrapperAriaExpanded,
      triggerWrapperClassHash: wrapperSnap.wrapperClassTokenHash,
      nearbySurfaceFingerprint: fingerprintNearbySurfaces(el),
      probeBelowFingerprint: fingerprintProbeBelow(el),
    };
  };

  const diffSnapshots = (
    before: ClickSnapshot,
    after: ClickSnapshot,
    subtreeRoot: HTMLElement,
  ): DomChangeReason | null => {
    if (before.href !== after.href) return "href-changed";
    if (after.openDialogCount > before.openDialogCount) return "dialog-opened";
    if (before.activeElementTag !== after.activeElementTag && after.activeElementInSubtree) {
      return "focus-moved";
    }
    const b = before.target;
    const a = after.target;
    if (b.ariaExpanded !== a.ariaExpanded) return "aria-expanded-changed";
    if (b.ariaPressed !== a.ariaPressed) return "aria-pressed-changed";
    if (b.ariaSelected !== a.ariaSelected) return "aria-selected-changed";
    if (b.ariaChecked !== a.ariaChecked) return "aria-checked-changed";
    if (b.checked !== a.checked) return "checked-changed";
    if (b.value !== a.value) return "value-changed";
    if (b.classTokenHash !== a.classTokenHash) return "semantic-class-changed";
    if (before.ariaCurrent !== after.ariaCurrent) return "aria-current-changed";
    if (
      before.ancestorClassTokenHash !== after.ancestorClassTokenHash &&
      (before.ancestorClassTokenHash || after.ancestorClassTokenHash)
    ) {
      return "ancestor-semantic-changed";
    }
    if (
      before.paginationFingerprint !== after.paginationFingerprint &&
      (before.paginationFingerprint || after.paginationFingerprint)
    ) {
      return "pagination-changed";
    }
    if (
      before.contentRegionFingerprint !== after.contentRegionFingerprint &&
      (before.contentRegionFingerprint || after.contentRegionFingerprint)
    ) {
      return "content-region-changed";
    }
    if (before.triggerWrapperAriaExpanded !== after.triggerWrapperAriaExpanded) {
      return "trigger-wrapper-expanded-changed";
    }
    if (
      before.triggerWrapperClassHash !== after.triggerWrapperClassHash
      && (before.triggerWrapperClassHash || after.triggerWrapperClassHash)
    ) {
      return "trigger-wrapper-class-changed";
    }
    if (
      after.nearbySurfaceFingerprint.length > before.nearbySurfaceFingerprint.length
      && after.nearbySurfaceFingerprint !== before.nearbySurfaceFingerprint
    ) {
      return "floating-surface-visible";
    }
    if (
      before.nearbySurfaceFingerprint.length > 0
      && after.nearbySurfaceFingerprint.length < before.nearbySurfaceFingerprint.length
    ) {
      return "floating-surface-dismissed";
    }
    if (
      before.probeBelowFingerprint !== after.probeBelowFingerprint
      && after.probeBelowFingerprint !== "self"
      && (before.probeBelowFingerprint === "self" || !before.probeBelowFingerprint)
    ) {
      return "probe-below-changed";
    }
    void subtreeRoot;
    return null;
  };

  const isOverlayBlocked = (el: HTMLElement, cx: number, cy: number): boolean => {
    const top = document.elementFromPoint(cx, cy) as HTMLElement | null;
    if (!top) return false;
    if (top === el || el.contains(top)) return false;
    if (top.contains(el)) return false;
    const id = top.id || "";
    if (id === "__agent-cursor" || id === "__agent-click-ring" || id === "__som-container") return false;
    if (top.closest("#__som-container")) return false;
    return true;
  };

  const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const dispatchSyntheticClick = (target: HTMLElement, cx: number, cy: number): void => {
    const eventOptions: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: cx,
      clientY: cy,
      screenX: cx,
      screenY: cy,
      button: 0,
      buttons: 1,
    };
    target.dispatchEvent(new MouseEvent("mouseenter", { ...eventOptions, bubbles: false }));
    target.dispatchEvent(new MouseEvent("mouseover", eventOptions));
    try {
      target.dispatchEvent(
        new PointerEvent("pointerdown", { ...eventOptions, pointerId: 1, pointerType: "mouse" } as PointerEventInit),
      );
    } catch { /* ignore */ }
    target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    try {
      target.dispatchEvent(
        new PointerEvent("pointerup", { ...eventOptions, pointerId: 1, pointerType: "mouse" } as PointerEventInit),
      );
    } catch { /* ignore */ }
    target.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    target.dispatchEvent(new MouseEvent("click", eventOptions));
  };

  const dispatchKeyboard = (target: HTMLElement, key: "space" | "enter"): void => {
    const isSpace = key === "space";
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: isSpace ? " " : "Enter",
      code: isSpace ? "Space" : "Enter",
      keyCode: isSpace ? 32 : 13,
      bubbles: true,
      cancelable: true,
    }));
    target.dispatchEvent(new KeyboardEvent("keyup", {
      key: isSpace ? " " : "Enter",
      code: isSpace ? "Space" : "Enter",
      keyCode: isSpace ? 32 : 13,
      bubbles: true,
      cancelable: true,
    }));
  };

  const clickOnce = (target: HTMLElement, m: ClickMethod, cx: number, cy: number): void => {
    if (m === "native") { target.click(); return; }
    if (m === "synthetic") { dispatchSyntheticClick(target, cx, cy); return; }
    dispatchKeyboard(target, m === "keyboard-space" ? "space" : "enter");
  };

  /** click-point-heading-v1：大块链接优先点标题/正文，避免几何中心落在空白 */
  const resolvePreferredClickPoint = (el: HTMLElement): { x: number; y: number; via: string } => {
    const root = el.getBoundingClientRect();
    const fallback = {
      x: root.left + root.width / 2,
      y: root.top + root.height / 2,
      via: "box-center",
    };
    const fromRect = (r: DOMRect, via: string) => ({
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      via,
    });

    const heading = el.querySelector("h1,h2,h3,h4,h5,[role='heading']") as HTMLElement | null;
    if (heading) {
      const hr = heading.getBoundingClientRect();
      if (hr.width >= 8 && hr.height >= 8) return fromRect(hr, "heading-center");
    }

    if (root.height >= 40) {
      let best: { node: HTMLElement; score: number } | null = null;
      const nodes = el.querySelectorAll("span,div,p,cite");
      for (const node of Array.from(nodes).slice(0, 80)) {
        const he = node as HTMLElement;
        const ownText = Array.from(he.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent || "").trim())
          .join(" ")
          .trim();
        const t = ownText || (he.children.length === 0 ? (he.textContent || "").trim() : "");
        if (!t || t.length < 4) continue;
        const r = he.getBoundingClientRect();
        if (r.width < 20 || r.height < 12) continue;
        if (r.bottom < root.top || r.top > root.bottom) continue;
        const cs = window.getComputedStyle(he);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const fontSize = parseFloat(cs.fontSize) || 12;
        let score = t.length * fontSize * r.height;
        if (/^https?:\/\//i.test(t) || /\bwww\./i.test(t)) score *= 0.15;
        if (he.tagName === "CITE") score *= 0.2;
        if (!best || score > best.score) best = { node: he, score };
      }
      if (best) return fromRect(best.node.getBoundingClientRect(), "text-child-center");

      return {
        x: root.left + root.width / 2,
        y: root.top + root.height * 0.62,
        via: "tall-box-lower",
      };
    }

    return fallback;
  };

  const steps: string[] = [];
  const log = (s: string) => steps.push(s);

  const annotatedEl = document.querySelector(selector) as HTMLElement | null;
  if (!annotatedEl) {
    log("element-not-found");
    return {
      ok: false,
      elementNotFound: true,
      error: `选择器未匹配到元素: ${selector}`,
      debug: { steps, frameHref: location.href },
    };
  }

  log("found-element");

  const rect = annotatedEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return { ok: false, error: `元素不可见: ${selector}`, debug: { steps, frameHref: location.href } };
  }

  const anyEl = annotatedEl as HTMLElement & { scrollIntoViewIfNeeded?: () => void };
  if (typeof anyEl.scrollIntoViewIfNeeded === "function") {
    anyEl.scrollIntoViewIfNeeded();
  } else {
    annotatedEl.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
  }

  const preferred = resolvePreferredClickPoint(annotatedEl);
  const cx = preferred.x;
  const cy = preferred.y;
  log(`click-point:${preferred.via}`);

  const g = window as Window & { __showAgentCursor?: (x: number, y: number, t?: string) => void };
  if (g.__showAgentCursor) g.__showAgentCursor(cx, cy, "click");

  if (isOverlayBlocked(annotatedEl, cx, cy)) {
    log("overlay-blocked");
    return {
      ok: false,
      error: `元素被遮挡: ${selector}`,
      overlayBlocked: true,
      debug: { steps, frameHref: location.href },
    };
  }

  const ancestorLink = findAncestorLink(annotatedEl);
  const opensNewTab = ancestorLink ? linkOpensNewTab(ancestorLink) : false;
  const isAnchor = annotatedEl.tagName.toLowerCase() === "a";

  const snapshotBefore = takeSnapshot(annotatedEl, annotatedEl);
  const diagBefore = selectionDiag(annotatedEl, "before");
  log("snapshot-before");

  const clickMethod = (
    method === "native" || method === "synthetic" ||
    method === "keyboard-space" || method === "keyboard-enter"
      ? method
      : "native"
  ) as ClickMethod;

  if (isAnchor || opensNewTab) {
    clickOnce(annotatedEl, "native", cx, cy);
    log("click-native");
  } else {
    clickOnce(annotatedEl, clickMethod, cx, cy);
    log(`click-${clickMethod}`);
  }

  const resolveLiveEl = (): HTMLElement => {
    if (annotatedEl.isConnected) return annotatedEl;
    const again = document.querySelector(selector) as HTMLElement | null;
    return again || annotatedEl;
  };

  const intervalMs = 50;
  const deadline = Date.now() + Math.max(0, waitTimeoutMs);
  let domReason: DomChangeReason | null = null;
  let liveEl = resolveLiveEl();
  let snapshotAfter = takeSnapshot(liveEl, liveEl);

  while (Date.now() <= deadline) {
    liveEl = resolveLiveEl();
    snapshotAfter = takeSnapshot(liveEl, liveEl);
    domReason = diffSnapshots(snapshotBefore, snapshotAfter, liveEl);
    if (domReason) break;
    if (Date.now() + intervalMs > deadline) break;
    await sleepMs(intervalMs);
  }

  liveEl = resolveLiveEl();
  log(domReason ? `dom-${domReason}` : "dom-no-change");
  const verifyLine =
    `domReason=${domReason ?? "null"} changed=${!!domReason}` +
    ` snapAria=${snapshotBefore.target.ariaSelected ?? "null"}->${snapshotAfter.target.ariaSelected ?? "null"}` +
    ` ${diagBefore} || ${selectionDiag(liveEl, "after")}` +
    ` tag=${annotatedEl.tagName.toLowerCase()}` +
    ` text=${(annotatedEl.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}`;

  return {
    ok: true,
    opensNewTab,
    ancestorLinkHref: snapshotBefore.ancestorLinkHref,
    clicked: {
      tag: annotatedEl.tagName.toLowerCase(),
      id: annotatedEl.id || undefined,
      text: (annotatedEl.textContent || "").trim().slice(0, 50),
      point: { x: Math.round(cx), y: Math.round(cy) },
      resolvedVia: "selector",
    },
    method: isAnchor || opensNewTab ? "native" : clickMethod,
    domChanged: !!domReason,
    domReason,
    snapshotBefore,
    snapshotAfter,
    debug: { steps, frameHref: location.href },
    verifyLine,
  };
}

/** MAIN world：在 selector 匹配元素子树内按 text 匹配子元素并点击（verified 失败后的回退） */
async function clickSelectorChildByTextPageAttempt(
  selector: string,
  expectedText: string,
  method: string,
  waitTimeoutMs: number,
): Promise<ClickPageAttemptResult | null> {
  const SEMANTIC = [
    "active", "selected", "open", "expanded", "collapsed", "checked", "disabled",
    "focus", "focused", "current", "on", "off", "show", "hide", "visible",
    "pressed", "highlight", "hover", "loading",
  ];

  const hashClassTokens = (className: string): string => {
    if (!className || typeof className !== "string") return "";
    const tokens = className
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.toLowerCase())
      .filter((t) => SEMANTIC.some((s) => t.includes(s)));
    tokens.sort();
    return tokens.join("|");
  };

  const findAncestorLink = (el: HTMLElement): HTMLAnchorElement | null => {
    const selfLink = el.closest("a[href]");
    return selfLink ? (selfLink as HTMLAnchorElement) : null;
  };

  const linkOpensNewTab = (a: HTMLAnchorElement): boolean => {
    const target = (a.getAttribute("target") || "").toLowerCase();
    if (target === "_blank") return true;
    const rel = (a.getAttribute("rel") || "").toLowerCase();
    return rel.includes("noopener") || rel.includes("noreferrer");
  };

  const getClassNameStr = (node: Element): string => {
    const cn = (node as HTMLElement).className;
    if (typeof cn === "string") return cn;
    return node.getAttribute("class") || "";
  };

  const isVisibleEl = (node: Element): boolean => {
    const he = node as HTMLElement;
    const r = he.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = window.getComputedStyle(he);
    return cs.display !== "none" && cs.visibility !== "hidden";
  };

  const findTriggerWrapper = (el: HTMLElement): HTMLElement | null => {
    const wrap = el.closest(
      '[aria-haspopup], [role="combobox"], [class*="select"], [class*="picker"], [class*="dropdown"]',
    ) as HTMLElement | null;
    return wrap ?? el.parentElement;
  };

  const snapshotTriggerWrapper = (el: HTMLElement) => {
    const carrier = findTriggerWrapper(el);
    if (!carrier) return { wrapperAriaExpanded: null as string | null, wrapperClassTokenHash: "" };
    return {
      wrapperAriaExpanded: carrier.getAttribute("aria-expanded"),
      wrapperClassTokenHash: hashClassTokens(getClassNameStr(carrier)),
    };
  };

  const fingerprintNearbySurfaces = (anchor: HTMLElement): string => {
    const er = anchor.getBoundingClientRect();
    const items: string[] = [];
    const menuSel =
      '[role="menu"], [role="listbox"], [role="dialog"], [class*="dropdown"], [class*="popover"], [class*="picker"], [class*="panel"], ul, ol';
    for (const candidate of Array.from(document.querySelectorAll(menuSel))) {
      const node = candidate as HTMLElement;
      if (node === anchor || anchor.contains(node)) continue;
      if (!isVisibleEl(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 32 || r.height < 16) continue;
      const near =
        r.bottom >= er.top - 24 && r.top <= er.bottom + 320
        && r.right >= er.left - 60 && r.left <= er.right + 60;
      if (!near) continue;
      const listish =
        node.matches('ul, ol, [role="listbox"], [role="menu"], [role="dialog"]')
        || !!node.querySelector('li, [role="option"], [role="menuitem"], tr, [class*="item"], [class*="option"]');
      if (!listish) continue;
      items.push(`${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`);
    }
    items.sort();
    return items.join("|");
  };

  const fingerprintProbeBelow = (anchor: HTMLElement): string => {
    const er = anchor.getBoundingClientRect();
    if (er.width < 1 || er.height < 1) return "";
    const px = Math.round(er.left + er.width / 2);
    const py = Math.round(Math.min(er.bottom + 4, window.innerHeight - 1));
    if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) return "";
    const top = document.elementFromPoint(px, py) as HTMLElement | null;
    if (!top) return "";
    if (top === anchor || anchor.contains(top)) return "self";
    const tag = top.tagName.toLowerCase();
    const cls = typeof top.className === "string" ? top.className.split(/\s+/)[0] || "" : "";
    return `${tag}${cls ? `.${cls}` : ""}`;
  };

  const findPaginationGroup = (el: HTMLElement): HTMLElement | null => {
    const inPager = el.closest(
      ".ant-pagination, [class*='pagination'], nav ul, [role='navigation']",
    ) as HTMLElement | null;
    if (inPager && isVisibleEl(inPager)) return inPager;
    for (const sel of [
      ".ant-pagination",
      "[class*='pagination']",
      "nav[aria-label*='pagination' i]",
      "[role='navigation']",
    ]) {
      for (const node of Array.from(document.querySelectorAll(sel))) {
        if (isVisibleEl(node)) return node as HTMLElement;
      }
    }
    return null;
  };

  const snapshotPagination = (pager: HTMLElement | null): string => {
    if (!pager) return "";
    const active = pager.querySelector(
      "[aria-current='page'], [aria-current='true'], .ant-pagination-item-active, .active, .current, .selected, [class*='item-active']",
    ) as HTMLElement | null;
    const activeText = (active?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    const activeClass = active ? hashClassTokens(getClassNameStr(active)) : "";
    const aria = active?.getAttribute("aria-current") || "";
    return `${activeText}|${activeClass}|${aria}`;
  };

  const findContentRegion = (el: HTMLElement): HTMLElement | null => {
    const fromClick = el.closest("table, .ant-table, .ant-table-wrapper, [role='grid'], [role='table']");
    if (fromClick) {
      const tbody = fromClick.querySelector("tbody, .ant-table-tbody, [role='rowgroup']");
      if (tbody && isVisibleEl(tbody)) return tbody as HTMLElement;
      if (isVisibleEl(fromClick)) return fromClick as HTMLElement;
    }
    for (const sel of [".ant-table-tbody", ".ant-table-body tbody", "table tbody", "[role='grid']"]) {
      const node = document.querySelector(sel);
      if (node && isVisibleEl(node)) return node as HTMLElement;
    }
    return null;
  };

  const snapshotContentRegion = (region: HTMLElement | null): string => {
    if (!region) return "";
    const rows = region.querySelectorAll("tr, [role='row'], li.ant-table-row");
    const samples: string[] = [];
    const limit = Math.min(3, rows.length);
    for (let i = 0; i < limit; i++) {
      samples.push((rows[i].textContent || "").trim().replace(/\s+/g, " ").slice(0, 100));
    }
    return `${rows.length}:${samples.join("||")}`;
  };

  const takeSpaRegionSnapshot = (el: HTMLElement) => {
    const ariaCarrier = (el.closest("[aria-current]") as HTMLElement | null) || el;
    const ancestorItem = el.closest("li, [role='listitem']") as HTMLElement | null;
    return {
      ariaCurrent: ariaCarrier.getAttribute("aria-current"),
      ancestorClassTokenHash:
        ancestorItem && ancestorItem !== el ? hashClassTokens(getClassNameStr(ancestorItem)) : "",
      paginationFingerprint: snapshotPagination(findPaginationGroup(el)),
      contentRegionFingerprint: snapshotContentRegion(findContentRegion(el)),
    };
  };


  /**
   * Flights 等：SoM 常标在内层 button/div，aria-selected 在父 gridcell。
   * 优先读 cell；若节点已脱挂则按 data-iso 再查 live。
   */
  const resolveAriaSelected = (el: HTMLElement): string | null => {
    const cell =
      (el.closest('[role="gridcell"], [role="option"]') as HTMLElement | null) ||
      (el.matches?.('[role="gridcell"], [role="option"]') ? el : null);
    const iso =
      cell?.getAttribute("data-iso") ||
      el.closest("[data-iso]")?.getAttribute("data-iso") ||
      "";
    if (iso) {
      try {
        const live = document.querySelector(
          `[role="gridcell"][data-iso="${iso}"], [data-iso="${iso}"]`,
        ) as HTMLElement | null;
        if (live) return live.getAttribute("aria-selected");
      } catch {
        /* ignore */
      }
    }
    if (cell) return cell.getAttribute("aria-selected");
    return el.getAttribute("aria-selected");
  };

  const selectionDiag = (el: HTMLElement, tag: string): string => {
    const cell =
      (el.closest('[role="gridcell"], [role="option"]') as HTMLElement | null) || el;
    const iso = cell.getAttribute("data-iso") || el.closest("[data-iso]")?.getAttribute("data-iso") || "";
    let liveAria = "na";
    if (iso) {
      try {
        const live = document.querySelector(
          `[role="gridcell"][data-iso="${iso}"], [data-iso="${iso}"]`,
        ) as HTMLElement | null;
        liveAria = live ? String(live.getAttribute("aria-selected") ?? "null") : "missing";
      } catch {
        liveAria = "err";
      }
    }
    const cellCls = String(cell.className || "")
      .trim()
      .replace(/\s+/g, ".")
      .slice(0, 72);
    return (
      `${tag}:conn=${el.isConnected}` +
      ` selfAria=${el.getAttribute("aria-selected") ?? "null"}` +
      ` cellAria=${cell.getAttribute("aria-selected") ?? "null"}` +
      ` liveAria=${liveAria}` +
      ` resolved=${resolveAriaSelected(el) ?? "null"}` +
      ` iso=${iso || "-"}` +
      ` cellCls=${cellCls || "-"}`
    );
  };

  const takeSnapshot = (el: HTMLElement, subtreeRoot: HTMLElement): ClickSnapshot => {
    const active = document.activeElement as HTMLElement | null;
    const ancestorLink = findAncestorLink(el);
    const inp = el as HTMLInputElement;
    const shortValue =
      el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA"
        ? String(inp.value ?? "").slice(0, 120)
        : undefined;
    const wrapperSnap = snapshotTriggerWrapper(el);

    return {
      href: location.href,
      openDialogCount: document.querySelectorAll("dialog[open]").length,
      activeElementTag:
        active && active !== document.body
          ? active.tagName.toLowerCase() + (active.id ? `#${active.id}` : "")
          : "",
      activeElementInSubtree: !!(
        active &&
        active !== document.body &&
        (subtreeRoot === active || subtreeRoot.contains(active))
      ),
      target: {
        ariaExpanded: el.getAttribute("aria-expanded"),
        ariaPressed: el.getAttribute("aria-pressed"),
        ariaSelected: resolveAriaSelected(el),
        ariaChecked: el.getAttribute("aria-checked"),
        disabled: !!(el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true",
        checked: el.tagName === "INPUT" ? inp.checked : undefined,
        value: shortValue,
        classTokenHash: hashClassTokens(typeof el.className === "string" ? el.className : ""),
      },
      ancestorLinkHref: ancestorLink ? ancestorLink.href : null,
      ...takeSpaRegionSnapshot(el),
      triggerWrapperAriaExpanded: wrapperSnap.wrapperAriaExpanded,
      triggerWrapperClassHash: wrapperSnap.wrapperClassTokenHash,
      nearbySurfaceFingerprint: fingerprintNearbySurfaces(el),
      probeBelowFingerprint: fingerprintProbeBelow(el),
    };
  };

  const diffSnapshots = (
    before: ClickSnapshot,
    after: ClickSnapshot,
    subtreeRoot: HTMLElement,
  ): DomChangeReason | null => {
    if (before.href !== after.href) return "href-changed";
    if (after.openDialogCount > before.openDialogCount) return "dialog-opened";
    if (before.activeElementTag !== after.activeElementTag && after.activeElementInSubtree) {
      return "focus-moved";
    }
    const b = before.target;
    const a = after.target;
    if (b.ariaExpanded !== a.ariaExpanded) return "aria-expanded-changed";
    if (b.ariaPressed !== a.ariaPressed) return "aria-pressed-changed";
    if (b.ariaSelected !== a.ariaSelected) return "aria-selected-changed";
    if (b.ariaChecked !== a.ariaChecked) return "aria-checked-changed";
    if (b.checked !== a.checked) return "checked-changed";
    if (b.value !== a.value) return "value-changed";
    if (b.classTokenHash !== a.classTokenHash) return "semantic-class-changed";
    if (before.ariaCurrent !== after.ariaCurrent) return "aria-current-changed";
    if (
      before.ancestorClassTokenHash !== after.ancestorClassTokenHash &&
      (before.ancestorClassTokenHash || after.ancestorClassTokenHash)
    ) {
      return "ancestor-semantic-changed";
    }
    if (
      before.paginationFingerprint !== after.paginationFingerprint &&
      (before.paginationFingerprint || after.paginationFingerprint)
    ) {
      return "pagination-changed";
    }
    if (
      before.contentRegionFingerprint !== after.contentRegionFingerprint &&
      (before.contentRegionFingerprint || after.contentRegionFingerprint)
    ) {
      return "content-region-changed";
    }
    if (before.triggerWrapperAriaExpanded !== after.triggerWrapperAriaExpanded) {
      return "trigger-wrapper-expanded-changed";
    }
    if (
      before.triggerWrapperClassHash !== after.triggerWrapperClassHash
      && (before.triggerWrapperClassHash || after.triggerWrapperClassHash)
    ) {
      return "trigger-wrapper-class-changed";
    }
    if (
      after.nearbySurfaceFingerprint.length > before.nearbySurfaceFingerprint.length
      && after.nearbySurfaceFingerprint !== before.nearbySurfaceFingerprint
    ) {
      return "floating-surface-visible";
    }
    if (
      before.nearbySurfaceFingerprint.length > 0
      && after.nearbySurfaceFingerprint.length < before.nearbySurfaceFingerprint.length
    ) {
      return "floating-surface-dismissed";
    }
    if (
      before.probeBelowFingerprint !== after.probeBelowFingerprint
      && after.probeBelowFingerprint !== "self"
      && (before.probeBelowFingerprint === "self" || !before.probeBelowFingerprint)
    ) {
      return "probe-below-changed";
    }
    void subtreeRoot;
    return null;
  };

  const isOverlayBlocked = (el: HTMLElement, cx: number, cy: number): boolean => {
    const top = document.elementFromPoint(cx, cy) as HTMLElement | null;
    if (!top) return false;
    if (top === el || el.contains(top)) return false;
    if (top.contains(el)) return false;
    const id = top.id || "";
    if (id === "__agent-cursor" || id === "__agent-click-ring" || id === "__som-container") return false;
    if (top.closest("#__som-container")) return false;
    return true;
  };

  const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const dispatchSyntheticClick = (target: HTMLElement, cx: number, cy: number): void => {
    const eventOptions: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: cx,
      clientY: cy,
      screenX: cx,
      screenY: cy,
      button: 0,
      buttons: 1,
    };
    target.dispatchEvent(new MouseEvent("mouseenter", { ...eventOptions, bubbles: false }));
    target.dispatchEvent(new MouseEvent("mouseover", eventOptions));
    try {
      target.dispatchEvent(
        new PointerEvent("pointerdown", { ...eventOptions, pointerId: 1, pointerType: "mouse" } as PointerEventInit),
      );
    } catch { /* ignore */ }
    target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    try {
      target.dispatchEvent(
        new PointerEvent("pointerup", { ...eventOptions, pointerId: 1, pointerType: "mouse" } as PointerEventInit),
      );
    } catch { /* ignore */ }
    target.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    target.dispatchEvent(new MouseEvent("click", eventOptions));
  };

  const dispatchKeyboard = (target: HTMLElement, key: "space" | "enter"): void => {
    const isSpace = key === "space";
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: isSpace ? " " : "Enter",
      code: isSpace ? "Space" : "Enter",
      keyCode: isSpace ? 32 : 13,
      bubbles: true,
      cancelable: true,
    }));
    target.dispatchEvent(new KeyboardEvent("keyup", {
      key: isSpace ? " " : "Enter",
      code: isSpace ? "Space" : "Enter",
      keyCode: isSpace ? 32 : 13,
      bubbles: true,
      cancelable: true,
    }));
  };

  const clickOnce = (target: HTMLElement, m: ClickMethod, cx: number, cy: number): void => {
    if (m === "native") { target.click(); return; }
    if (m === "synthetic") { dispatchSyntheticClick(target, cx, cy); return; }
    dispatchKeyboard(target, m === "keyboard-space" ? "space" : "enter");
  };

  const scoreTextMatch = (raw: string, targetText: string): number => {
    const t = raw.trim();
    if (!t) return 0;
    if (t === targetText) return 100;
    if (t.includes(targetText)) {
      return 60 - Math.min(40, Math.max(0, t.length - targetText.length));
    }
    if (targetText.includes(t) && t.length >= 2) return 40;
    return 0;
  };

  const findBestChildByText = (root: HTMLElement, targetText: string): { el: HTMLElement; matchedText: string; score: number } | null => {
    const candidates = root.querySelectorAll(
      "button, a, [role=\"button\"], [role=\"option\"], [role=\"menuitem\"], [role=\"tab\"], " +
      "div, span, li, label, p",
    );

    let best: HTMLElement | null = null;
    let bestMatchedText = "";
    let bestScore = 0;

    for (const candidate of Array.from(candidates)) {
      if (candidate === root) continue;
      const el = candidate as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) continue;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
        continue;
      }

      const textSources = [
        (el.textContent || "").trim(),
        el.getAttribute("aria-label")?.trim() || "",
        el.getAttribute("title")?.trim() || "",
      ].filter(Boolean);

      let score = 0;
      let matchedText = "";
      for (const src of textSources) {
        const s = scoreTextMatch(src, targetText);
        if (s > score) {
          score = s;
          matchedText = src;
        }
      }
      if (score <= 0) continue;

      const tag = el.tagName.toLowerCase();
      if (tag === "button" || tag === "a") score += 15;
      if (el.getAttribute("role") === "button") score += 12;
      if (el.childElementCount === 0) score += 8;
      if ((el.textContent || "").trim() === targetText) score += 10;

      if (score > bestScore) {
        bestScore = score;
        best = el;
        bestMatchedText = matchedText;
      }
    }

    if (!best || bestScore < 40) return null;

    const rect = best.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(cx, cy) as HTMLElement | null;
    if (topEl && best !== topEl && !best.contains(topEl)) {
      best = topEl;
    }

    return { el: best, matchedText: bestMatchedText, score: bestScore };
  };

  const steps: string[] = [];
  const log = (s: string) => steps.push(s);

  const targetText = expectedText.trim();
  if (!targetText) {
    return { ok: false, childNotFound: true, error: "expected text is empty", debug: { steps, frameHref: location.href } };
  }

  const annotatedEl = document.querySelector(selector) as HTMLElement | null;
  if (!annotatedEl) {
    log("element-not-found");
    return {
      ok: false,
      elementNotFound: true,
      error: `选择器未匹配到元素: ${selector}`,
      debug: { steps, frameHref: location.href },
    };
  }

  log("found-root-element");
  const childHit = findBestChildByText(annotatedEl, targetText);
  if (!childHit) {
    log("child-text-not-found");
    return {
      ok: false,
      childNotFound: true,
      error: `选择器 ${selector} 的子树中未找到与 "${targetText}" 匹配的可点击子元素`,
      debug: { steps, frameHref: location.href },
    };
  }

  const clickTarget = childHit.el;
  log(`child-text-match score=${childHit.score} text="${childHit.matchedText.slice(0, 30)}"`);

  const anyEl = clickTarget as HTMLElement & { scrollIntoViewIfNeeded?: () => void };
  if (typeof anyEl.scrollIntoViewIfNeeded === "function") {
    anyEl.scrollIntoViewIfNeeded();
  } else {
    clickTarget.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
  }

  // click-point-heading-v1（child-text 路径同样优先标题）
  const resolvePreferredClickPoint = (el: HTMLElement): { x: number; y: number; via: string } => {
    const root = el.getBoundingClientRect();
    const fallback = {
      x: root.left + root.width / 2,
      y: root.top + root.height / 2,
      via: "box-center",
    };
    const fromRect = (r: DOMRect, via: string) => ({
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      via,
    });
    const heading = el.querySelector("h1,h2,h3,h4,h5,[role='heading']") as HTMLElement | null;
    if (heading) {
      const hr = heading.getBoundingClientRect();
      if (hr.width >= 8 && hr.height >= 8) return fromRect(hr, "heading-center");
    }
    if (root.height >= 40) {
      return {
        x: root.left + root.width / 2,
        y: root.top + root.height * 0.62,
        via: "tall-box-lower",
      };
    }
    return fallback;
  };

  const preferred = resolvePreferredClickPoint(clickTarget);
  const cx = preferred.x;
  const cy = preferred.y;
  log(`click-point:${preferred.via}`);

  const g = window as Window & { __showAgentCursor?: (x: number, y: number, t?: string) => void };
  if (g.__showAgentCursor) g.__showAgentCursor(cx, cy, "click");

  if (isOverlayBlocked(clickTarget, cx, cy)) {
    log("overlay-blocked");
    return {
      ok: false,
      error: `选择器 ${selector} 下匹配 "${targetText}" 的子元素被遮挡`,
      overlayBlocked: true,
      debug: { steps, frameHref: location.href },
    };
  }

  const ancestorLink = findAncestorLink(clickTarget);
  const opensNewTab = ancestorLink ? linkOpensNewTab(ancestorLink) : false;
  const isAnchor = clickTarget.tagName.toLowerCase() === "a";

  const snapshotBefore = takeSnapshot(clickTarget, annotatedEl);
  const diagBefore = selectionDiag(clickTarget, "before");
  log("snapshot-before");

  const clickMethod = (
    method === "native" || method === "synthetic" ||
    method === "keyboard-space" || method === "keyboard-enter"
      ? method
      : "native"
  ) as ClickMethod;

  if (isAnchor || opensNewTab) {
    clickOnce(clickTarget, "native", cx, cy);
    log("click-native");
  } else {
    clickOnce(clickTarget, clickMethod, cx, cy);
    log(`click-${clickMethod}`);
  }

  const resolveLiveTarget = (): HTMLElement => {
    if (clickTarget.isConnected) return clickTarget;
    const again = document.querySelector(selector) as HTMLElement | null;
    if (again && annotatedEl.contains(again)) {
      // 尽量回到同 data-iso 格子
      const iso =
        clickTarget.getAttribute("data-iso") ||
        clickTarget.closest("[data-iso]")?.getAttribute("data-iso") ||
        "";
      if (iso) {
        const live = document.querySelector(
          `[role="gridcell"][data-iso="${iso}"], [data-iso="${iso}"]`,
        ) as HTMLElement | null;
        if (live) return live;
      }
    }
    return again || clickTarget;
  };

  const intervalMs = 50;
  const deadline = Date.now() + Math.max(0, waitTimeoutMs);
  let domReason: DomChangeReason | null = null;
  let liveTarget = resolveLiveTarget();
  let snapshotAfter = takeSnapshot(liveTarget, annotatedEl.isConnected ? annotatedEl : liveTarget);

  while (Date.now() <= deadline) {
    liveTarget = resolveLiveTarget();
    const root = annotatedEl.isConnected ? annotatedEl : liveTarget;
    snapshotAfter = takeSnapshot(liveTarget, root);
    domReason = diffSnapshots(snapshotBefore, snapshotAfter, root);
    if (domReason) break;
    if (Date.now() + intervalMs > deadline) break;
    await sleepMs(intervalMs);
  }

  liveTarget = resolveLiveTarget();
  log(domReason ? `dom-${domReason}` : "dom-no-change");
  const verifyLine =
    `domReason=${domReason ?? "null"} changed=${!!domReason}` +
    ` snapAria=${snapshotBefore.target.ariaSelected ?? "null"}->${snapshotAfter.target.ariaSelected ?? "null"}` +
    ` ${diagBefore} || ${selectionDiag(liveTarget, "after")}` +
    ` tag=${clickTarget.tagName.toLowerCase()}` +
    ` text=${(clickTarget.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}`;

  return {
    ok: true,
    opensNewTab,
    ancestorLinkHref: snapshotBefore.ancestorLinkHref,
    clicked: {
      tag: clickTarget.tagName.toLowerCase(),
      id: clickTarget.id || undefined,
      text: (clickTarget.textContent || "").trim().slice(0, 50),
      point: { x: Math.round(cx), y: Math.round(cy) },
      resolvedVia: "child-text",
      matchedText: childHit.matchedText.slice(0, 80),
    },
    method: isAnchor || opensNewTab ? "native" : clickMethod,
    domChanged: !!domReason,
    domReason,
    snapshotBefore,
    snapshotAfter,
    debug: { steps, frameHref: location.href },
    verifyLine,
  };
}

type ClickIndexNavTargetDetails = { sourceTabId?: number; tabId?: number; url?: string };

async function watchClickTabOutcomeDuring(
  tabId: number,
  windowId: number,
  tabsBefore: Set<number>,
  urlBefore: string | undefined,
  fn: () => Promise<void>,
  tailMs: number,
): Promise<TabOutcome> {
  const outcome: TabOutcome = { newTabs: [] };
  const browser = getContext().browser as any;
  const navTargets: ClickIndexNavTargetDetails[] = [];
  const downloadById = new Map<number, NonNullable<TabOutcome["download"]>>();

  const onNavTarget = (details: ClickIndexNavTargetDetails) => {
    if (details.sourceTabId === tabId) navTargets.push(details);
  };

  const upsertDownload = (item: {
    id?: number;
    filename?: string;
    url?: string;
    mime?: string;
    state?: string;
  }) => {
    if (typeof item.id !== "number") return;
    const prev = downloadById.get(item.id);
    downloadById.set(item.id, {
      id: item.id,
      filename: item.filename || prev?.filename,
      url: item.url || prev?.url,
      mime: item.mime || prev?.mime,
      state: item.state || prev?.state,
    });
  };

  const onDownloadCreated = (item: {
    id?: number;
    filename?: string;
    url?: string;
    mime?: string;
    state?: string;
  }) => {
    console.log("[ClickDownload]", "onCreated", {
      tabId,
      windowId,
      id: item.id,
      filename: item.filename,
      url: item.url,
      mime: item.mime,
      state: item.state,
    });
    upsertDownload(item);
  };

  const onDownloadChanged = (delta: {
    id: number;
    filename?: { current?: string };
    url?: { current?: string };
    mime?: { current?: string };
    state?: { current?: string };
  }) => {
    // 只更新本窗口内 onCreated 已登记的下载，避免误收其它标签的下载事件
    if (!downloadById.has(delta.id)) {
      console.log("[ClickDownload]", "onChanged:skip-untracked", {
        tabId,
        id: delta.id,
        trackedIds: [...downloadById.keys()],
        state: delta.state?.current,
        filename: delta.filename?.current,
      });
      return;
    }
    const prev = downloadById.get(delta.id);
    console.log("[ClickDownload]", "onChanged", {
      tabId,
      id: delta.id,
      filename: delta.filename?.current ?? prev?.filename,
      url: delta.url?.current ?? prev?.url,
      mime: delta.mime?.current ?? prev?.mime,
      state: delta.state?.current ?? prev?.state,
    });
    upsertDownload({
      id: delta.id,
      filename: delta.filename?.current ?? prev?.filename,
      url: delta.url?.current ?? prev?.url,
      mime: delta.mime?.current ?? prev?.mime,
      state: delta.state?.current ?? prev?.state,
    });
  };

  const hasDownloadsApi = !!browser.downloads;
  const canListenCreated = !!browser.downloads?.onCreated?.addListener;
  const canListenChanged = !!browser.downloads?.onChanged?.addListener;
  console.log("[ClickDownload]", "watch:start", {
    tabId,
    windowId,
    urlBefore,
    tailMs,
    hasDownloadsApi,
    canListenCreated,
    canListenChanged,
  });

  if (browser.webNavigation?.onCreatedNavigationTarget?.addListener) {
    browser.webNavigation.onCreatedNavigationTarget.addListener(onNavTarget);
  }
  if (canListenCreated) {
    browser.downloads.onCreated.addListener(onDownloadCreated);
  } else {
    console.warn("[ClickDownload]", "watch:no-onCreated-api");
  }
  if (canListenChanged) {
    browser.downloads.onChanged.addListener(onDownloadChanged);
  } else {
    console.warn("[ClickDownload]", "watch:no-onChanged-api");
  }

  try {
    await fn();
    console.log("[ClickDownload]", "watch:after-click-fn", {
      tabId,
      downloadCount: downloadById.size,
      downloadIds: [...downloadById.keys()],
    });
    await delayMs(tailMs);
  } finally {
    if (browser.webNavigation?.onCreatedNavigationTarget?.removeListener) {
      try {
        browser.webNavigation.onCreatedNavigationTarget.removeListener(onNavTarget);
      } catch { /* ignore */ }
    }
    if (browser.downloads?.onCreated?.removeListener) {
      try {
        browser.downloads.onCreated.removeListener(onDownloadCreated);
      } catch { /* ignore */ }
    }
    if (browser.downloads?.onChanged?.removeListener) {
      try {
        browser.downloads.onChanged.removeListener(onDownloadChanged);
      } catch { /* ignore */ }
    }
    console.log("[ClickDownload]", "watch:listeners-removed", {
      tabId,
      downloadCount: downloadById.size,
    });
  }

  // 补全 filename（onCreated 时常为空，search 可拿到最终名）
  if (downloadById.size > 0 && typeof browser.downloads?.search === "function") {
    for (const id of [...downloadById.keys()]) {
      try {
        const items = await browser.downloads.search({ id });
        const item = Array.isArray(items) ? items[0] : undefined;
        if (item && typeof item.id === "number") {
          console.log("[ClickDownload]", "search:enrich", {
            id: item.id,
            filename: item.filename,
            url: item.url,
            mime: item.mime,
            state: item.state,
          });
          upsertDownload(item);
        }
      } catch (e) {
        console.warn("[ClickDownload]", "search:fail", { id, error: String(e) });
      }
    }
  }

  if (downloadById.size > 0) {
    // 取最新一条（id 最大）作为主结果
    outcome.download = [...downloadById.values()].sort((a, b) => b.id - a.id)[0];
  }

  console.log("[ClickDownload]", "watch:done", {
    tabId,
    windowId,
    downloadCount: downloadById.size,
    download: outcome.download ?? null,
    newTabs: outcome.newTabs.length,
  });

  for (const d of navTargets) {
    if (typeof d.tabId === "number" && !tabsBefore.has(d.tabId)) {
      outcome.newTabs.push({ tabId: d.tabId, url: d.url });
    }
  }

  try {
    const tabsAfter = await tabsQuery({ windowId });
    for (const t of tabsAfter) {
      if (typeof t.id === "number" && !tabsBefore.has(t.id)) {
        if (!outcome.newTabs.some((n) => n.tabId === t.id)) {
          outcome.newTabs.push({ tabId: t.id, url: typeof t.url === "string" ? t.url : undefined });
        }
      }
    }
  } catch { /* ignore */ }

  try {
    const tabAfter = await getTabById(tabId);
    const urlAfter = typeof tabAfter?.url === "string" ? tabAfter.url : undefined;
    if (urlBefore && urlAfter && urlBefore !== urlAfter && outcome.newTabs.length === 0) {
      outcome.sameTabNavigation = { url: urlAfter };
    }
  } catch { /* ignore */ }

  return outcome;
}

function pickClickIndexFrameResult(
  results: Array<{ frameId: number; result: unknown }>,
): { frameId: number; result: ClickPageAttemptResult } | null {
  const hits = results
    .map((r) => ({ frameId: r.frameId, result: r.result as ClickPageAttemptResult | null }))
    .filter((r) => r.result != null) as Array<{ frameId: number; result: ClickPageAttemptResult }>;

  if (hits.length === 0) return null;

  const okHits = hits.filter((h) => h.result.ok);
  const pool = okHits.length > 0 ? okHits : hits;

  const overlayError = pool.find((h) => h.result.overlayBlocked);
  if (overlayError) return overlayError;

  const notFoundError = pool.find((h) => h.result.elementNotFound);
  if (notFoundError && okHits.length === 0) return notFoundError;

  const childNotFoundError = pool.find((h) => h.result.childNotFound);
  if (childNotFoundError && okHits.length === 0) return childNotFoundError;

  const visibleError = pool.find((h) => h.result.error && !h.result.ok);
  if (visibleError && okHits.length === 0) return visibleError;

  const verified = pool.find((h) => h.result.domChanged);
  if (verified) return verified;

  return pool[0];
}

function clickIndexFallbackMethod(first: ClickMethod, tag?: string): ClickMethod | null {
  if (tag === "a") return null;
  if (first === "native") return "synthetic";
  if (first === "synthetic") return "keyboard-space";
  return null;
}

async function browser_clickCore(
  args: Record<string, unknown>,
  meta: { somIndex?: number } = {},
): Promise<unknown> {
  const selector = args.selector as string;
  if (!selector) {
    return { error: "selector is required", implTag: BROWSER_CLICK_UNIFIED_SOM_TAG };
  }

  const somIndex = meta.somIndex;
  const waitMs = typeof args.waitMs === "number" ? args.waitMs : CLICK_INDEX_DEFAULT_WAIT_MS;
  const methodArg = typeof args.method === "string" ? args.method : "auto";
  const expectedText =
    typeof args.text === "string" && args.text.trim() ? args.text.trim() : null;

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab", implTag: BROWSER_CLICK_UNIFIED_SOM_TAG };

  let windowId: number;
  let urlBefore: string | undefined;
  try {
    const tab = await getTabById(tabId);
    windowId = tab.windowId;
    urlBefore = typeof tab.url === "string" ? tab.url : undefined;
  } catch (e) {
    return { error: String(e), implTag: BROWSER_CLICK_UNIFIED_SOM_TAG };
  }

  await ensureClickIndicator(tabId);

  const tabsBeforeList = await tabsQuery({ windowId });
  const tabsBefore = new Set(
    tabsBeforeList.map((t) => t.id).filter((id): id is number => typeof id === "number"),
  );

  let attemptSeq = 0;

  console.log(CLICK_TRACE_LOG, "core:start", {
    tabId,
    selector,
    somIndex,
    waitMs,
    methodArg,
    expectedText,
    implTag: BROWSER_CLICK_UNIFIED_SOM_TAG,
  });

  type AttemptRecord = {
    method: ClickMethod | "cdp-mouse";
    ok: boolean;
    reason?: string;
    frameId?: number;
    phase?: "selector" | "child-text" | "cdp";
  };

  const attempts: AttemptRecord[] = [];
  let lastFrameHit: { frameId: number; result: ClickPageAttemptResult } | null = null;
  let lastTabOutcome: TabOutcome = { newTabs: [] };
  let lastVerify = { verified: false, reason: "no-observable-change" };
  let lastVerifyLine = "";

  const methods: ClickMethod[] =
    methodArg === "auto" ? ["native", "synthetic"] : [methodArg as ClickMethod];

  for (let i = 0; i < methods.length; i++) {
    const method = methods[i];
    if (i > 0 && lastVerify.verified) break;

    attemptSeq += 1;
    console.log(CLICK_TRACE_LOG, "attempt:start", {
      attemptSeq,
      phase: "selector",
      method,
      methodIndex: i,
      methodsQueue: [...methods],
      tabId,
      selector,
      somIndex,
    });

    const frameHitRef: { hit: { frameId: number; result: ClickPageAttemptResult } | null } = { hit: null };

    lastTabOutcome = await watchClickTabOutcomeDuring(
      tabId,
      windowId,
      tabsBefore,
      urlBefore,
      async () => {
        const results = await execAllFramesPerFrame(
          tabId,
          {
            world: "MAIN",
            func: clickSelectorPageAttempt,
            args: [selector, method, waitMs],
          },
          { perFrameMs: waitMs + 1500 },
        );
        frameHitRef.hit = pickClickIndexFrameResult(results);
      },
      CLICK_INDEX_TAB_WATCH_MS,
    );

    const frameHit = frameHitRef.hit;
    lastFrameHit = frameHit;

    if (!frameHit) {
      attempts.push({ method, ok: false, reason: "element-not-found", phase: "selector" });
      console.log(CLICK_TRACE_LOG, "attempt:done", {
        attemptSeq,
        phase: "selector",
        method,
        ok: false,
        reason: "element-not-found",
        tabId,
      });
      continue;
    }

    const page = frameHit.result;

    if (!page.ok) {
      const failReason = page.elementNotFound
        ? "element-not-found"
        : page.overlayBlocked
          ? "overlay-blocked"
          : page.error;
      attempts.push({
        method,
        ok: false,
        reason: failReason,
        frameId: frameHit.frameId,
        phase: "selector",
      });
      console.log(CLICK_TRACE_LOG, "attempt:done", {
        attemptSeq,
        phase: "selector",
        method,
        ok: false,
        reason: failReason,
        frameId: frameHit.frameId,
        pageOk: false,
        tabId,
      });
      if (page.overlayBlocked) break;
      continue;
    }

    const merged = mergeClickDomAndTabOutcome({
      domChanged: !!page.domChanged,
      domReason: page.domReason ?? null,
      tabOutcome: lastTabOutcome,
      opensNewTab: !!page.opensNewTab,
    });

    lastVerify = merged;
    if (typeof page.verifyLine === "string") lastVerifyLine = page.verifyLine;
    attempts.push({
      method: page.method ?? method,
      ok: merged.verified,
      reason: merged.reason,
      frameId: frameHit.frameId,
      phase: "selector",
    });
    console.log(
      "[jev] click-verify " +
        `tab=${tabId} index=${somIndex ?? "-"} method=${page.method ?? method} verified=${merged.verified} reason=${merged.reason} ` +
        (typeof page.verifyLine === "string" ? page.verifyLine : `domReason=${page.domReason ?? "null"}`),
    );
    console.log(CLICK_TRACE_LOG, "attempt:done", {
      attemptSeq,
      phase: "selector",
      method: page.method ?? method,
      ok: merged.verified,
      reason: merged.reason,
      frameId: frameHit.frameId,
      domChanged: !!page.domChanged,
      domReason: page.domReason ?? null,
      newTabs: lastTabOutcome.newTabs?.length ?? 0,
      download: lastTabOutcome.download ?? null,
      tabId,
    });

    if (merged.verified) break;

    const fb = clickIndexFallbackMethod(method, page.clicked?.tag);
    if (methodArg === "auto" && fb && i === 0 && !page.opensNewTab && page.clicked?.tag !== "a") {
      if (!methods.includes(fb)) {
        console.log(CLICK_TRACE_LOG, "attempt:enqueue-fallback", {
          attemptSeq,
          from: method,
          fallback: fb,
          tag: page.clicked?.tag,
          tabId,
        });
        methods.push(fb);
      }
    } else {
      break;
    }
  }

  // 观测失败且传入 text：在匹配元素子树内再点一轮
  if (!lastVerify.verified && expectedText && lastFrameHit?.result.ok) {
    const childMethods: ClickMethod[] =
      methodArg === "auto" ? ["native", "synthetic"] : [methodArg as ClickMethod];

    for (const method of childMethods) {
      if (lastVerify.verified) break;

      attemptSeq += 1;
      console.log(CLICK_TRACE_LOG, "attempt:start", {
        attemptSeq,
        phase: "child-text",
        method,
        expectedText,
        tabId,
        selector,
        somIndex,
      });

      const frameHitRef: { hit: { frameId: number; result: ClickPageAttemptResult } | null } = { hit: null };

      lastTabOutcome = await watchClickTabOutcomeDuring(
        tabId,
        windowId,
        tabsBefore,
        urlBefore,
        async () => {
          const results = await execAllFramesPerFrame(
            tabId,
            {
              world: "MAIN",
              func: clickSelectorChildByTextPageAttempt,
              args: [selector, expectedText, method, waitMs],
            },
            { perFrameMs: waitMs + 1500 },
          );
          frameHitRef.hit = pickClickIndexFrameResult(results);
        },
        CLICK_INDEX_TAB_WATCH_MS,
      );

      const frameHit = frameHitRef.hit;
      if (!frameHit) {
        attempts.push({ method, ok: false, reason: "element-not-found", phase: "child-text" });
        console.log(CLICK_TRACE_LOG, "attempt:done", {
          attemptSeq,
          phase: "child-text",
          method,
          ok: false,
          reason: "element-not-found",
          tabId,
        });
        continue;
      }

      const page = frameHit.result;
      lastFrameHit = frameHit;

      if (!page.ok) {
        const failReason = page.childNotFound
          ? "child-text-not-found"
          : page.elementNotFound
            ? "element-not-found"
            : page.overlayBlocked
              ? "overlay-blocked"
              : page.error;
        attempts.push({
          method,
          ok: false,
          reason: failReason,
          frameId: frameHit.frameId,
          phase: "child-text",
        });
        console.log(CLICK_TRACE_LOG, "attempt:done", {
          attemptSeq,
          phase: "child-text",
          method,
          ok: false,
          reason: failReason,
          frameId: frameHit.frameId,
          tabId,
        });
        if (page.overlayBlocked || page.childNotFound) break;
        continue;
      }

      const merged = mergeClickDomAndTabOutcome({
        domChanged: !!page.domChanged,
        domReason: page.domReason ?? null,
        tabOutcome: lastTabOutcome,
        opensNewTab: !!page.opensNewTab,
      });

      lastVerify = merged;
      if (typeof page.verifyLine === "string") lastVerifyLine = page.verifyLine;
      attempts.push({
        method: page.method ?? method,
        ok: merged.verified,
        reason: merged.reason,
        frameId: frameHit.frameId,
        phase: "child-text",
      });
      console.log(
        "[jev] click-verify " +
          `tab=${tabId} index=${somIndex ?? "-"} phase=child-text method=${page.method ?? method} verified=${merged.verified} reason=${merged.reason} ` +
          (typeof page.verifyLine === "string" ? page.verifyLine : `domReason=${page.domReason ?? "null"}`),
      );
      console.log(CLICK_TRACE_LOG, "attempt:done", {
        attemptSeq,
        phase: "child-text",
        method: page.method ?? method,
        ok: merged.verified,
        reason: merged.reason,
        frameId: frameHit.frameId,
        tabId,
      });

      if (merged.verified) break;
    }
  }

  // CDP 真实鼠标兜底（含 <a target=_blank>：脚本 .click() 常被弹窗拦截）
  if (
    !lastVerify.verified
    && lastFrameHit?.result.ok
    && lastFrameHit.result.clicked?.point
    && !lastFrameHit.result.overlayBlocked
    && !lastFrameHit.result.elementNotFound
  ) {
    const point = lastFrameHit.result.clicked.point;
    const opensNewTab = !!lastFrameHit.result.opensNewTab;
    const cdpWatchMs = opensNewTab
      ? Math.max(CLICK_INDEX_CDP_TAB_WATCH_MS, Math.min(Math.max(waitMs, 1500), 4000))
      : Math.max(CLICK_INDEX_TAB_WATCH_MS, waitMs);

    attemptSeq += 1;
    console.log(CLICK_TRACE_LOG, "attempt:start", {
      attemptSeq,
      phase: "cdp",
      method: "cdp-mouse",
      tabId,
      windowId,
      urlBefore,
      point,
      opensNewTab,
      cdpWatchMs,
      priorReason: lastVerify.reason,
      implTag: BROWSER_CLICK_CDP_FALLBACK_TAG,
    });

    let cdpError: string | undefined;
    let cdpTabUrl: string | undefined;
    let cdpTabActive: boolean | undefined;
    lastTabOutcome = await watchClickTabOutcomeDuring(
      tabId,
      windowId,
      tabsBefore,
      urlBefore,
      async () => {
        const cdpResult = await cdpMouseClickSession(tabId, point.x, point.y, "left");
        if ("error" in cdpResult) {
          cdpError = cdpResult.error;
          cdpTabUrl = cdpResult.tabUrl;
          cdpTabActive = cdpResult.tabActive;
        }
      },
      cdpWatchMs,
    );

    if (cdpError) {
      const reasonWithTab = cdpTabUrl
        ? `${cdpError} (tabUrl=${cdpTabUrl}, active=${cdpTabActive === true})`
        : cdpError;
      attempts.push({
        method: "cdp-mouse",
        ok: false,
        reason: reasonWithTab,
        frameId: lastFrameHit.frameId,
        phase: "cdp",
      });
      console.log(CLICK_TRACE_LOG, "attempt:done", {
        attemptSeq,
        phase: "cdp",
        method: "cdp-mouse",
        ok: false,
        reason: reasonWithTab,
        cdpTabUrl: cdpTabUrl ?? null,
        cdpTabActive: cdpTabActive ?? null,
        tabId,
        implTag: BROWSER_CLICK_CDP_FALLBACK_TAG,
      });
    } else {
      const merged = mergeClickDomAndTabOutcome({
        domChanged: false,
        domReason: null,
        tabOutcome: lastTabOutcome,
        opensNewTab,
      });
      lastVerify = merged;
      attempts.push({
        method: "cdp-mouse",
        ok: merged.verified,
        reason: merged.reason,
        frameId: lastFrameHit.frameId,
        phase: "cdp",
      });
      console.log(CLICK_TRACE_LOG, "attempt:done", {
        attemptSeq,
        phase: "cdp",
        method: "cdp-mouse",
        ok: merged.verified,
        reason: merged.reason,
        newTabs: lastTabOutcome.newTabs,
        sameTabNavigation: lastTabOutcome.sameTabNavigation ?? null,
        download: lastTabOutcome.download ?? null,
        tabId,
        implTag: BROWSER_CLICK_CDP_FALLBACK_TAG,
      });
    }
  }

  const clickVerifyTextParts = (): Array<string | null | undefined> => [
    expectedText,
    lastFrameHit?.result.clicked?.text,
    lastFrameHit?.result.clicked?.matchedText,
  ];

  if (!lastFrameHit) {
    console.log(CLICK_TRACE_LOG, "core:return", {
      tabId,
      selector,
      somIndex,
      ok: false,
      reason: "element-not-found",
      attemptCount: attempts.length,
      attemptSeq,
      attempts,
    });
    return attachVerificationCodeAgreementInstruction(
      buildClickNotFoundResponse(selector, attempts, { somIndex }),
      ...clickVerifyTextParts(),
    );
  }

  const page = lastFrameHit.result;
  if (!page.ok) {
    const hint = page.elementNotFound
      ? (somIndex != null ? CLICK_INDEX_RESCREEN_HINT : "元素未找到，请确认 selector。")
      : page.overlayBlocked
        ? "元素被遮挡，请 scroll 或重新 browser_screenshot。"
        : undefined;
    console.log(CLICK_TRACE_LOG, "core:return", {
      tabId,
      selector,
      somIndex,
      ok: false,
      reason: page.elementNotFound ? "element-not-found" : page.overlayBlocked ? "overlay-blocked" : page.error,
      attemptCount: attempts.length,
      attemptSeq,
      attempts,
    });
    return attachVerificationCodeAgreementInstruction(
      {
        ok: false,
        reason: page.elementNotFound ? "element-not-found" : page.overlayBlocked ? "overlay-blocked" : undefined,
        error: page.error,
        selector,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        attempts,
        hint,
        implTag: BROWSER_CLICK_UNIFIED_SOM_TAG,
      },
      ...clickVerifyTextParts(),
    );
  }

  const clickOk = lastVerify.verified;
  const hint = buildClickIndexHint(clickOk, lastVerify.reason, lastTabOutcome, somIndex);

  console.log(
    "[jev] click-verify-final " +
      `tab=${tabId} index=${somIndex ?? "-"} ok=${clickOk} reason=${lastVerify.reason} ` +
      (lastVerifyLine || "-"),
  );

  return attachVerificationCodeAgreementInstruction(
    {
      ok: clickOk,
      reason: lastVerify.reason,
      selector,
      ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      ...(lastTabOutcome.download ? { download: lastTabOutcome.download } : {}),
      ...(lastVerifyLine ? { verifyLine: lastVerifyLine } : {}),
      attempts,
      hint,
      implTag: BROWSER_CLICK_UNIFIED_SOM_TAG,
    },
    ...clickVerifyTextParts(),
  );
}

async function browser_click(args: Record<string, unknown>): Promise<unknown> {
  console.log(CLICK_TRACE_LOG, "tool:enter", {
    index: args.index ?? null,
    selector: args.selector ?? null,
    text: typeof args.text === "string" ? args.text : null,
    method: args.method ?? "auto",
    conversationId: args.conversationId ?? null,
  });
  const resolved = resolveSomLocatorArgs(args, {
    requireLocator: true,
    implTag: BROWSER_CLICK_UNIFIED_SOM_TAG,
  });
  if (!resolved.ok) {
    console.log(CLICK_TRACE_LOG, "tool:resolve-fail", resolved);
    return resolved;
  }
  const result = await browser_clickCore(resolved.args, { somIndex: resolved.somIndex });
  console.log(CLICK_TRACE_LOG, "tool:exit", {
    somIndex: resolved.somIndex ?? null,
    selector: resolved.args.selector ?? null,
    ok: (result as { ok?: boolean })?.ok ?? null,
    reason: (result as { reason?: string })?.reason ?? null,
    error: (result as { error?: string })?.error ?? null,
  });
  return result;
}

async function browser_click_index2(args: Record<string, unknown>): Promise<unknown> {
  // 兼容旧 tool 名
  return browser_click(args);
}

// ========== SoM 统一底层：type / long_press / hover / drag（som-interaction-unified-v1）==========

function verifyTypedValue(expected: string, actual: string | null, clear: boolean): boolean {
  if (actual == null) return false;
  if (actual === expected) return true;
  if (!clear && expected.length > 0 && actual.includes(expected)) return true;
  return false;
}

async function readFieldValueBySelector(tabId: number, selector: string): Promise<string | null> {
  const results = await execAllFramesPerFrame(
    tabId,
    {
      world: "MAIN",
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          return (el as HTMLInputElement).value ?? "";
        }
        if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
          return (el.textContent || "").trim();
        }
        return null;
      },
      args: [selector],
    },
    { perFrameMs: 800 },
  );
  for (const r of results) {
    if (r.result != null && typeof r.result === "string") return r.result;
  }
  return null;
}

async function focusTypeTarget(tabId: number, selector: string): Promise<unknown> {
  const results = await (getContext().browser.scripting as any).executeScript({
    target: { tabId },
    func: (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { error: `element not found: ${sel}` };
      el.scrollIntoView({ block: "nearest", behavior: "instant" });
      el.focus();
      return { ok: true, focused: document.activeElement === el };
    },
    args: [selector],
  });
  return results?.[0]?.result ?? { error: "focus failed" };
}

async function clearFieldBySelector(tabId: number, selector: string): Promise<void> {
  await execAllFramesPerFrame(
    tabId,
    {
      world: "MAIN",
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return;
        el.focus();
        const nativeSetter =
          el.tagName === "TEXTAREA"
            ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
            : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          const inp = el as HTMLInputElement;
          inp.select?.();
          if (nativeSetter) nativeSetter.call(inp, "");
          else inp.value = "";
          inp.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        } else if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
          el.textContent = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
      args: [selector],
    },
    { perFrameMs: 800 },
  );
}

/** CDP Input.insertText — 合成 fill 校验失败时的兜底 */
async function cdpInsertTextSession(
  tabId: number,
  text: string,
): Promise<{ ok: true; method: "cdp-insertText" } | { error: string }> {
  const dbg = (getContext().browser as any).debugger;
  if (!dbg?.attach || !dbg?.sendCommand || !dbg?.detach) {
    return { error: "debugger API unavailable" };
  }

  let attached = false;
  try {
    await cdpAttachTab(dbg, tabId);
    attached = true;
    await dbg.sendCommand({ tabId }, "Input.insertText", { text });
    return { ok: true, method: "cdp-insertText" };
  } catch (e) {
    return { error: String(e) };
  } finally {
    if (attached) {
      try { await dbg.detach({ tabId }); } catch { /* ignore */ }
    }
  }
}

async function submitSearchInputEnter(tabId: number, selector: string): Promise<void> {
  await execAllFramesPerFrame(
    tabId,
    {
      world: "MAIN",
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (!el) return;
        const enterOpts: KeyboardEventInit = { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
        el.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
        el.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
        const form = el.closest("form");
        if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      },
      args: [selector],
    },
    { perFrameMs: 800 },
  );
}

async function browser_typeCore(
  args: Record<string, unknown>,
  meta: { somIndex?: number } = {},
): Promise<unknown> {
  const selector = args.selector as string;
  const text = args.text as string;
  const clear = (args.clear as boolean) ?? true;
  const somIndex = meta.somIndex;
  if (!selector) return { error: "selector is required", implTag: BROWSER_TYPE_UNIFIED_SOM_TAG };
  if (!text && text !== '') return { error: "text is required", implTag: BROWSER_TYPE_UNIFIED_SOM_TAG };

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab", implTag: BROWSER_TYPE_UNIFIED_SOM_TAG };

  const notFoundMsg = somIndex != null
    ? `未找到编号 [${somIndex}] 的元素（页面可能已变化，请重新截图）`
    : `选择器未匹配到可输入元素: ${selector}`;

  try {
    const results = await execAllFramesPerFrame(tabId, {
      world: "MAIN",
      func: async (sel: string, val: string, clr: boolean) => {
        const href = (() => {
          try {
            return String(location.href || "");
          } catch {
            return "";
          }
        })();
        const isTop = (() => {
          try {
            return window === window.top;
          } catch {
            return false;
          }
        })();

        // 空白 iframe 无目标元素，跳过（勿带 error，以免盖住主 frame 成功结果）
        if (!isTop && (!href || href === "about:blank")) {
          return null;
        }

        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;

        try {
          try {
            el.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
          } catch {
            el.scrollIntoView(true);
          }
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          el.focus();

          const isContentEditable = el.isContentEditable || el.getAttribute("contenteditable") === "true";
          const isInput = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";

          if (isInput) {
            const inp = el as HTMLInputElement;

            // 必须按实际标签取 setter：Input 的 setter 调在 TEXTAREA 上会 Illegal invocation
            const nativeSetter =
              el.tagName === "TEXTAREA"
                ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
                : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

            // ── readonly 输入框（日期选择器、自定义下拉等）──
            if (inp.readOnly || inp.getAttribute("readonly") !== null) {
              inp.focus();
              inp.click();
              await sleep(400);

              const pickerSelectors = [
                ".cal-wrap", ".cal-cm", ".datepicker", ".datepicker-dropdown",
                ".ant-picker-dropdown", ".el-date-picker", ".el-picker-panel",
                '[class*="calendar"]', '[class*="date-picker"]', '[class*="picker-panel"]',
              ];
              const calContainer = document.querySelector(pickerSelectors.join(","));

              if (calContainer) {
                const nums = val.match(/\d+/g);
                const targetDay = nums ? String(Number(nums[nums.length - 1])) : null;

                if (targetDay) {
                  const cells = calContainer.querySelectorAll(
                    '.cell, td, [class*="day"], [class*="date-cell"], [class*="picker-cell"]',
                  );
                  let clicked = false;
                  for (const cell of cells) {
                    const hc = cell as HTMLElement;
                    const isClickable = hc.style.cursor === "pointer"
                      || window.getComputedStyle(hc).cursor === "pointer";
                    if (!isClickable) continue;
                    if ((hc.textContent || "").trim() === targetDay) {
                      hc.click();
                      clicked = true;
                      break;
                    }
                  }
                  if (clicked) {
                    return {
                      ok: true,
                      typedInto: { tag: "readonly-input", id: el.id || undefined, type: inp.type || undefined },
                      text: val,
                      method: "calendar-cell-click",
                    };
                  }
                }
              }

              if (nativeSetter) nativeSetter.call(inp, val);
              else inp.value = val;
              inp.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
              inp.dispatchEvent(new Event("change", { bubbles: true }));

              return {
                ok: true,
                typedInto: { tag: el.tagName.toLowerCase(), id: el.id || undefined, type: inp.type || undefined },
                text: val,
                method: "direct-value-set",
                valueAfter: inp.value ?? "",
                isSearchInput: false,
                skipCdpFallback: true,
              };
            }

            // ── 普通可编辑：synthetic fill 优先（A/B：非 CDP 优先）；CDP 仅校验失败兜底 ──
            inp.focus();

            if (clr) {
              inp.select();
              if (nativeSetter) nativeSetter.call(inp, "");
              else inp.value = "";
              inp.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
            }

            const nextValue = clr ? val : `${inp.value || ""}${val}`;
            if (nativeSetter) nativeSetter.call(inp, nextValue);
            else inp.value = nextValue;

            inp.dispatchEvent(
              new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                data: val,
                inputType: "insertText",
              }),
            );
            inp.dispatchEvent(new Event("change", { bubbles: true }));

            const inputType = (inp.type || "").toLowerCase();
            return {
              ok: true,
              typedInto: {
                tag: el.tagName.toLowerCase(),
                id: el.id || undefined,
                type: inp.type || undefined,
              },
              text: val,
              method: "synthetic-fill",
              valueAfter: inp.value ?? "",
              isSearchInput: inputType === "search",
            };
          } else if (isContentEditable) {
            if (clr) {
              el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" } as any));
              el.textContent = "";
            }
            el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: val } as any));
            if (clr) el.textContent = val;
            else el.textContent = (el.textContent || "") + val;
            el.dispatchEvent(new Event("input", { bubbles: true }));

            return {
              ok: true,
              typedInto: {
                tag: el.tagName.toLowerCase(),
                id: el.id || undefined,
                type: el.getAttribute("type") || undefined,
              },
              text: val,
              method: "synthetic-contenteditable",
              valueAfter: (el.textContent || "").trim(),
              isSearchInput: false,
            };
          } else {
            return { error: `元素 (${el.tagName.toLowerCase()}) 不是可输入的元素: ${sel}` };
          }
        } catch (e) {
          const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          return {
            ok: false,
            error: `type failed after element hit: ${msg}`,
          };
        }
      },
      args: [selector, text, clear],
    }, { perFrameMs: 4000 });

    // 优先任意 frame 成功；miss 返回 null，不会盖住成功结果
    const hit: any = results?.find((r: any) => r.result && r.result.ok)?.result
      || results?.find((r: any) => r.result && r.result.error)?.result;
    if (!hit) {
      return {
        error: notFoundMsg,
        implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
        selector,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      };
    }
    if (hit.error) {
      return {
        ok: false,
        verified: false,
        error: hit.error,
        selector,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
      };
    }

    // 日历格子点击也需要 MAIN world 兜底（与 click_index 同理）
    if (hit.ok && hit.method === "calendar-cell-click") {
      try {
        await execAllFramesPerFrame(tabId, {
          world: "MAIN",
          func: (targetDay: string) => {
            const selectors = [
              ".cal-wrap", ".cal-cm", ".datepicker", ".datepicker-dropdown",
              ".ant-picker-dropdown", ".el-date-picker", ".el-picker-panel",
              '[class*="calendar"]', '[class*="date-picker"]', '[class*="picker-panel"]',
            ];
            const cal = document.querySelector(selectors.join(","));
            if (!cal) return;
            const cells = cal.querySelectorAll(
              '.cell, td, [class*="day"], [class*="date-cell"], [class*="picker-cell"]',
            );
            for (const cell of cells) {
              const hc = cell as HTMLElement;
              if (hc.style.cursor !== "pointer" && getComputedStyle(hc).cursor !== "pointer") continue;
              if ((hc.textContent || "").trim() === targetDay) { hc.click(); return; }
            }
          },
          args: [String(Number(text.match(/\d+/g)?.pop() || "0"))],
        }, { perFrameMs: 1000 });
      } catch { /* ignore */ }
      return {
        ...hit,
        verified: true,
        finalValue: text,
        selector,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
      };
    }

    let method: string = hit.method ?? "synthetic-fill";
    let finalValue = typeof hit.valueAfter === "string"
      ? hit.valueAfter
      : (await readFieldValueBySelector(tabId, selector)) ?? "";
    let verified = verifyTypedValue(text, finalValue, clear);

    if (!verified && !hit.skipCdpFallback) {
      const focusResult = await focusTypeTarget(tabId, selector);
      if (focusResult && typeof focusResult === "object" && "error" in (focusResult as Record<string, unknown>)) {
        return {
          ok: false,
          verified: false,
          error: (focusResult as { error: string }).error,
          expected: text,
          finalValue,
          method,
          selector,
          ...(somIndex != null ? { index: somIndex, somIndex } : {}),
          implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
          hint: "合成输入未生效且 focus 失败，无法 CDP 兜底。",
        };
      }

      await delayMs(120);
      if (clear) await clearFieldBySelector(tabId, selector);
      const cdpResult = await cdpInsertTextSession(tabId, text);
      if ("error" in cdpResult) {
        return {
          ok: false,
          verified: false,
          error: cdpResult.error,
          expected: text,
          finalValue,
          method,
          selector,
          ...(somIndex != null ? { index: somIndex, somIndex } : {}),
          implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
          hint: "合成输入未生效，CDP insertText 也失败。",
        };
      }

      method = cdpResult.method;
      await delayMs(120);
      finalValue = (await readFieldValueBySelector(tabId, selector)) ?? "";
      verified = verifyTypedValue(text, finalValue, clear);
    }

    if (!verified) {
      return {
        ok: false,
        verified: false,
        error: "输入校验失败：页面值与期望文本不一致",
        expected: text,
        finalValue,
        method,
        selector,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
        hint: "请 browser_screenshot 确认输入框内容，或检查是否为受控组件/禁用状态。",
      };
    }

    if (hit.isSearchInput) {
      await submitSearchInputEnter(tabId, selector);
    }

    return {
      ok: true,
      verified: true,
      finalValue,
      method,
      typedInto: hit.typedInto,
      text,
      selector,
      ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
    };
  } catch (e) {
    return { error: String(e), implTag: BROWSER_TYPE_UNIFIED_SOM_TAG };
  }
}

async function browser_type(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveSomLocatorArgs(args, {
    requireLocator: true,
    implTag: BROWSER_TYPE_UNIFIED_SOM_TAG,
  });
  if (!resolved.ok) return resolved;
  const result = await browser_typeCore(resolved.args, { somIndex: resolved.somIndex });
  // 浮层等待改由 Jev loop type 后轮询 blockingOverlay.present（勿在此固定 sleep）
  return result;
}

async function browser_type_index(args: Record<string, unknown>): Promise<unknown> {
  return browser_type(args);
}

async function browser_long_pressCore(
  args: Record<string, unknown>,
  meta: { somIndex?: number } = {},
): Promise<unknown> {
  const selector = args.selector as string | undefined;
  const duration = (args.duration as number | undefined) ?? 1000;
  const somIndex = meta.somIndex;
  if (!selector) return { error: "selector is required", implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG };
  if (duration < 100 || duration > 120000) return { error: "duration must be 100~120000 ms", implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG };

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab", implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG };

  await ensureClickIndicator(tabId);

  const notFoundMsg = somIndex != null
    ? `未找到编号 [${somIndex}] 的元素（页面可能已变化，请重新截图）`
    : `选择器未匹配到元素: ${selector}`;

  try {
    const pressResults = await execAllFramesPerFrame(tabId, {
      world: "MAIN",
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return { error: `元素不可见: ${sel}` };

        const anyEl = el as any;
        if (typeof anyEl.scrollIntoViewIfNeeded === 'function') {
          anyEl.scrollIntoViewIfNeeded();
        } else {
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        }

        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;

        const g: any = window as any;
        if (g.__showAgentCursor) g.__showAgentCursor(cx, cy, 'longpress');

        el.focus();

        const opts: MouseEventInit = {
          bubbles: true, cancelable: true, view: window,
          clientX: cx, clientY: cy, screenX: cx, screenY: cy,
          button: 0, buttons: 1,
        };

        el.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }));
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        try { el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' })); } catch {}
        el.dispatchEvent(new MouseEvent('mousedown', opts));

        try {
          const touch = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy, pageX: cx, pageY: cy });
          el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
        } catch {}

        (window as any).__longPressState = {
          cx, cy,
          selector: sel,
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 50),
        };

        return { ok: true, phase: 'pressing', cx: Math.round(cx), cy: Math.round(cy) };
      },
      args: [selector],
    }, { perFrameMs: 1000 });

    const pressResult: any = pressResults?.find((r: any) => r.result && r.result.ok)?.result
                     || pressResults?.find((r: any) => r.result && r.result.error)?.result;
    if (!pressResult) return { error: notFoundMsg, implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG, selector, ...(somIndex != null ? { index: somIndex, somIndex } : {}) };
    if (pressResult.error) return { ...pressResult, implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG, selector, ...(somIndex != null ? { index: somIndex, somIndex } : {}) };

    await new Promise(resolve => setTimeout(resolve, duration));

    const releaseResults = await execAllFramesPerFrame(tabId, {
      world: "MAIN",
      func: () => {
        const state = (window as any).__longPressState;
        if (!state) return null;

        const { cx, cy, selector: sel } = state;

        let el = sel ? document.querySelector(sel) as HTMLElement | null : null;
        if (!el) el = document.elementFromPoint(cx, cy) as HTMLElement | null;
        if (!el) return { error: 'element gone after long press' };

        const opts: MouseEventInit = {
          bubbles: true, cancelable: true, view: window,
          clientX: cx, clientY: cy, screenX: cx, screenY: cy,
          button: 0, buttons: 0,
        };

        try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' })); } catch {}
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));

        try {
          const touch = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy, pageX: cx, pageY: cy });
          el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
        } catch {}

        const g: any = window as any;
        if (g.__hideAgentCursor) g.__hideAgentCursor();
        delete (window as any).__longPressState;

        return {
          ok: true,
          phase: 'released',
          duration: 'completed',
          tag: state.tag,
          text: state.text,
        };
      },
      args: [],
    }, { perFrameMs: 1000 });

    const releaseResult: any = releaseResults?.find((r: any) => r.result && r.result.ok)?.result
                       || releaseResults?.find((r: any) => r.result && r.result.error)?.result;
    const result = releaseResult || { ok: true, phase: 'released', duration: 'completed' };
    return {
      ...result,
      selector,
      ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG,
    };
  } catch (e) {
    return { error: String(e), implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG };
  }
}

async function browser_long_press(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveSomLocatorArgs(args, {
    requireLocator: true,
    implTag: BROWSER_LONG_PRESS_UNIFIED_SOM_TAG,
  });
  if (!resolved.ok) return resolved;
  return browser_long_pressCore(resolved.args, { somIndex: resolved.somIndex });
}

async function browser_long_press_index(args: Record<string, unknown>): Promise<unknown> {
  return browser_long_press(args);
}

/** CDP 真实鼠标移动（触发 CSS :hover）；仅在 synthetic 验证失败后由 browser_hoverCore 调用 */
async function realMouseHoverSession(
  tabId: number,
  x: number,
  y: number,
  dwellMs: number,
): Promise<boolean> {
  const dbg = (getContext().browser as any).debugger;
  if (!dbg?.attach || !dbg?.sendCommand || !dbg?.detach) return false;

  let attached = false;
  const rx = Math.round(x);
  const ry = Math.round(y);

  try {
    await cdpAttachTab(dbg, tabId);
    attached = true;

    const move = async () => {
      await dbg.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: rx,
        y: ry,
        button: "none",
        buttons: 0,
      });
    };

    await move();
    const deadline = Date.now() + dwellMs;
    while (Date.now() < deadline) {
      const wait = Math.min(HOVER_MOVE_INTERVAL_MS, deadline - Date.now());
      if (wait <= 0) break;
      await new Promise<void>((r) => setTimeout(r, wait));
      await move();
    }
    return true;
  } catch (e) {
    console.warn("[browser_hover] CDP real mouse failed, fallback synthetic", e);
    return false;
  } finally {
    if (attached) {
      try { await dbg.detach({ tabId }); } catch { /* ignore */ }
    }
  }
}

function hoverLocatePageFunc(sel: string): {
  ok: true;
  cx: number;
  cy: number;
  tag: string;
  text: string;
} | { error: string } | null {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { error: `元素不可见: ${sel}` };

  const anyEl = el as HTMLElement & { scrollIntoViewIfNeeded?: () => void };
  if (typeof anyEl.scrollIntoViewIfNeeded === "function") {
    anyEl.scrollIntoViewIfNeeded();
  } else {
    el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
  }

  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  const g = window as Window & { __showAgentCursor?: (x: number, y: number, t?: string) => void };
  if (g.__showAgentCursor) g.__showAgentCursor(cx, cy, "hover");

  return {
    ok: true,
    cx,
    cy,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || "").trim().slice(0, 100),
  };
}

async function hoverSyntheticDwellAndVerifyPageFunc(
  sel: string,
  cx: number,
  cy: number,
  holdMs: number,
  moveIntervalMs: number,
): Promise<{ ok: true; verified: boolean; reason: string } | { error: string }> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return { error: `element gone: ${sel}` };

  const hashClassTokens = (className: string): string => {
    if (!className || typeof className !== "string") return "";
    return className.split(/\s+/).filter(Boolean).sort().join("|");
  };

  const snapshotBefore = {
    ariaExpanded: el.getAttribute("aria-expanded"),
    openDialogCount: document.querySelectorAll("dialog[open]").length,
    classTokenHash: hashClassTokens(typeof el.className === "string" ? el.className : ""),
  };

  const baseOpts = (x: number, y: number): MouseEventInit => ({
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons: 0,
  });

  const dispatchHover = (target: HTMLElement, x: number, y: number) => {
    const opts = baseOpts(x, y);
    target.dispatchEvent(new MouseEvent("mouseenter", { ...opts, bubbles: false }));
    target.dispatchEvent(new MouseEvent("mouseover", opts));
    try {
      target.dispatchEvent(new PointerEvent("pointerover", { ...opts, pointerId: 1, pointerType: "mouse" } as PointerEventInit));
    } catch { /* ignore */ }
    target.dispatchEvent(new MouseEvent("mousemove", opts));
  };

  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    dispatchHover(node, cx, cy);
    node = node.parentElement;
  }

  const deadline = Date.now() + holdMs;
  while (Date.now() < deadline) {
    dispatchHover(el, cx, cy);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(moveIntervalMs, remaining));
  }

  let verified = false;
  let reason = "no-observable-hover";

  try {
    if (el.matches(":hover")) {
      verified = true;
      reason = "css-hover";
    }
  } catch { /* ignore */ }

  if (!verified) {
    const ariaExpanded = el.getAttribute("aria-expanded");
    if (snapshotBefore.ariaExpanded !== ariaExpanded && ariaExpanded === "true") {
      verified = true;
      reason = "aria-expanded-changed";
    }
  }

  if (!verified) {
    const classTokenHash = hashClassTokens(typeof el.className === "string" ? el.className : "");
    if (classTokenHash !== snapshotBefore.classTokenHash) {
      verified = true;
      reason = "class-changed";
    }
  }

  if (!verified && document.querySelectorAll("dialog[open]").length > snapshotBefore.openDialogCount) {
    verified = true;
    reason = "dialog-opened";
  }

  if (!verified) {
    const menuSel = '[role="menu"], [role="listbox"], [aria-expanded="true"], [class*="dropdown"], [class*="popover"], [class*="tooltip"]';
    for (const candidate of Array.from(document.querySelectorAll(menuSel))) {
      const menu = candidate as HTMLElement;
      const rect = menu.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const style = window.getComputedStyle(menu);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      const er = el.getBoundingClientRect();
      const near =
        rect.bottom >= er.top - 40 && rect.top <= er.bottom + 40
        && rect.right >= er.left - 80 && rect.left <= er.right + 80;
      if (near || el.contains(menu) || menu.contains(el)) {
        verified = true;
        reason = "menu-visible";
        break;
      }
    }
  }

  return { ok: true, verified, reason };
}

function hoverHideCursorPageFunc(): void {
  const g = window as Window & { __hideAgentCursor?: () => void };
  g.__hideAgentCursor?.();
}

async function browser_hoverCore(
  args: Record<string, unknown>,
  meta: { somIndex?: number } = {},
): Promise<unknown> {
  const selector = args.selector as string;
  const somIndex = meta.somIndex;
  const dwellMsRaw = typeof args.dwellMs === "number" ? args.dwellMs : HOVER_DEFAULT_DWELL_MS;
  const dwellMs = Math.min(HOVER_MAX_DWELL_MS, Math.max(0, dwellMsRaw));
  if (!selector) return { error: "selector is required", implTag: BROWSER_HOVER_UNIFIED_SOM_TAG };

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab", implTag: BROWSER_HOVER_UNIFIED_SOM_TAG };

  await ensureClickIndicator(tabId);

  const notFoundMsg = somIndex != null
    ? `未找到编号 [${somIndex}] 的元素（页面可能已变化，请重新截图）`
    : `选择器未匹配到元素: ${selector}`;

  try {
    const locateResults = await execAllFramesPerFrame(tabId, {
      world: "MAIN",
      func: hoverLocatePageFunc,
      args: [selector],
    }, { perFrameMs: 1500 });

    const located = locateResults.find((r) => r.result && (r.result as { ok?: boolean }).ok) as
      | { frameId: number; result: { ok: true; cx: number; cy: number; tag: string; text: string } }
      | undefined;
    const locateErr = locateResults.find((r) => r.result && (r.result as { error?: string }).error)?.result as
      | { error: string }
      | undefined;

    if (!located) {
      if (locateErr?.error) {
        return { error: locateErr.error, implTag: BROWSER_HOVER_UNIFIED_SOM_TAG, selector, ...(somIndex != null ? { index: somIndex, somIndex } : {}) };
      }
      return { error: notFoundMsg, implTag: BROWSER_HOVER_UNIFIED_SOM_TAG, selector, ...(somIndex != null ? { index: somIndex, somIndex } : {}) };
    }

    const { cx, cy, tag, text } = located.result;
    const frameId = located.frameId;

    // 1. 先 synthetic（无 debug 黄条）
    const synthResults = await execAllFramesPerFrame(tabId, {
      world: "MAIN",
      func: hoverSyntheticDwellAndVerifyPageFunc,
      args: [selector, cx, cy, dwellMs, HOVER_MOVE_INTERVAL_MS],
    }, { perFrameMs: dwellMs + 2000 });

    const synthHit = synthResults.find((r) => r.result && (r.result as { ok?: boolean }).ok) as
      | { frameId: number; result: { ok: true; verified: boolean; reason: string } }
      | undefined;

    let hoverVerified = synthHit?.result.verified ?? false;
    let verifyReason = synthHit?.result.reason ?? "synthetic-no-hit";
    let usedRealMouse = false;

    // 2. synthetic 未观察到 hover 效果 + 主 frame → CDP 兜底
    if (!hoverVerified && frameId === 0) {
      usedRealMouse = await realMouseHoverSession(tabId, cx, cy, dwellMs);
      if (usedRealMouse) {
        hoverVerified = true;
        verifyReason = "cdp-fallback";
      }
    }

    await execAllFramesPerFrame(tabId, {
      world: "MAIN",
      func: hoverHideCursorPageFunc,
      args: [],
    }, { perFrameMs: 500 });

    return {
      ok: true,
      dwellMs,
      hoverDwell: HOVER_REAL_MOUSE_TAG,
      verified: hoverVerified,
      reason: verifyReason,
      usedRealMouse,
      tag,
      text,
      point: { x: Math.round(cx), y: Math.round(cy) },
      frameId,
      selector,
      ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      implTag: BROWSER_HOVER_UNIFIED_SOM_TAG,
      hint: usedRealMouse
        ? "synthetic 未生效，已用 CDP 真实鼠标兜底（可能出现 debug 黄条）。"
        : !hoverVerified && frameId !== 0
          ? "元素在 iframe 内，无法 CDP；synthetic 未观察到 hover 效果。"
          : !hoverVerified
            ? "synthetic 与 CDP 均未观察到 hover 效果，可加大 dwellMs 或 browser_screenshot 确认。"
            : undefined,
    };
  } catch (e) {
    return { error: String(e), implTag: BROWSER_HOVER_UNIFIED_SOM_TAG };
  }
}

async function browser_hover(args: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveSomLocatorArgs(args, {
    requireLocator: true,
    implTag: BROWSER_HOVER_UNIFIED_SOM_TAG,
  });
  if (!resolved.ok) return resolved;
  return browser_hoverCore(resolved.args, { somIndex: resolved.somIndex });
}

async function browser_hover_index(args: Record<string, unknown>): Promise<unknown> {
  return browser_hover(args);
}

const BROWSER_HIGHLIGHT_TAG = "highlight-v3";
/** Console filter: `[highlight-trace-v1]` — browser_highlight resolve + top-frame render */
const HL_TRACE = "[highlight-trace-v1]";
const HIGHLIGHT_DEFAULT_PULSES = 3;
const HIGHLIGHT_DEFAULT_DURATION_MS = 500;
const HIGHLIGHT_MAX_PULSES = 8;
const HIGHLIGHT_MAX_DURATION_MS = 2000;
const HIGHLIGHT_DOT_PX = 5;

function parseHighlightPulseArgs(args: Record<string, unknown>): { pulses: number; durationMs: number } {
  const pulsesRaw =
    typeof args.pulses === "number" && Number.isFinite(args.pulses) ? args.pulses : HIGHLIGHT_DEFAULT_PULSES;
  const pulses = Math.min(HIGHLIGHT_MAX_PULSES, Math.max(1, Math.floor(pulsesRaw)));
  const durationRaw =
    typeof args.durationMs === "number" && Number.isFinite(args.durationMs)
      ? args.durationMs
      : HIGHLIGHT_DEFAULT_DURATION_MS;
  const durationMs = Math.min(HIGHLIGHT_MAX_DURATION_MS, Math.max(120, Math.floor(durationRaw)));
  return { pulses, durationMs };
}

type HighlightResolveResult =
  | {
      ok: true;
      mode: "element" | "point";
      scrolled: boolean;
      rect: { x: number; y: number; width: number; height: number };
      point?: { x: number; y: number };
      offset?: { x: number; y: number };
      box?: { left: number; top: number; width: number; height: number };
      tag: string;
      text: string;
    }
  | { ok: false; error: string; elementNotFound?: boolean };

function pickHighlightFrameResult(
  results: Array<{ frameId: number; result: unknown }>,
): { frameId: number; result: HighlightResolveResult } | null {
  const hits = results
    .map((r) => ({ frameId: r.frameId, result: r.result as HighlightResolveResult | null }))
    .filter((r) => r.result != null) as Array<{ frameId: number; result: HighlightResolveResult }>;
  if (hits.length === 0) return null;
  const okHit = hits.find((h) => h.result.ok);
  if (okHit) return okHit;
  const notFound = hits.find((h) => !h.result.ok && "elementNotFound" in h.result && h.result.elementNotFound);
  return notFound ?? hits[0]!;
}

/**
 * 各 frame：找锚定元素 → scroll → 换算为【顶层视口】坐标（沿 frameElement 累加）。
 * 不绘制 overlay。须自洽（executeScript 序列化）。
 */
function highlightResolvePageFunc(
  selector: string,
  doScroll: boolean,
  offsetX: number | null,
  offsetY: number | null,
): HighlightResolveResult {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) {
    return { ok: false, elementNotFound: true, error: `选择器未匹配到元素: ${selector}` };
  }

  let scrolled = false;
  if (doScroll) {
    try {
      const anyEl = el as HTMLElement & { scrollIntoViewIfNeeded?: () => void };
      if (typeof anyEl.scrollIntoViewIfNeeded === "function") {
        anyEl.scrollIntoViewIfNeeded();
      } else {
        el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      }
      scrolled = true;
    } catch {
      /* ignore */
    }
  }

  const rect = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || "").trim().slice(0, 80);

  const toTopViewport = (localX: number, localY: number): { x: number; y: number } | null => {
    let x = localX;
    let y = localY;
    let w: Window = window;
    while (w && w !== w.top) {
      const fe = w.frameElement as HTMLElement | null;
      if (!fe) {
        return null;
      }
      const fr = fe.getBoundingClientRect();
      x += fr.left;
      y += fr.top;
      w = w.parent as Window;
    }
    return { x, y };
  };

  const topLeft = toTopViewport(rect.left, rect.top);
  if (!topLeft) {
    return {
      ok: false,
      error:
        "无法换算到顶层视口（跨域 iframe）。请对主页面上的 captcha/iframe 容器使用 index，并用 x/y 表示容器内偏移。",
    };
  }

  const elementRect = {
    x: Math.round(topLeft.x),
    y: Math.round(topLeft.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };

  const hasPoint =
    offsetX != null
    && offsetY != null
    && Number.isFinite(offsetX)
    && Number.isFinite(offsetY);

  if (hasPoint) {
    const topPt = toTopViewport(rect.left + offsetX!, rect.top + offsetY!);
    if (!topPt) {
      return {
        ok: false,
        error:
          "无法换算到顶层视口（跨域 iframe）。请对主页面上的 captcha/iframe 容器使用 index，并用 x/y 表示容器内偏移。",
      };
    }
    return {
      ok: true,
      mode: "point",
      scrolled,
      rect: elementRect,
      point: { x: Math.round(topPt.x), y: Math.round(topPt.y) },
      offset: { x: Math.round(offsetX!), y: Math.round(offsetY!) },
      tag,
      text,
    };
  }

  const pad = 4;
  return {
    ok: true,
    mode: "element",
    scrolled,
    rect: elementRect,
    box: {
      left: Math.max(0, elementRect.x - pad),
      top: Math.max(0, elementRect.y - pad),
      width: Math.max(8, elementRect.width + pad * 2),
      height: Math.max(8, elementRect.height + pad * 2),
    },
    tag,
    text,
  };
}

/**
 * 仅在顶层 document 绘制 overlay（point=全屏层+圆点；element=顶层 fixed 框）。
 * 必须自洽：chrome.scripting.executeScript 只序列化本函数，不能引用外层 helper。
 */
function highlightRenderOverlayPageFunc(
  mode: "element" | "point",
  label: string,
  pulses: number,
  durationMs: number,
  dotPx: number,
  pointX: number | null,
  pointY: number | null,
  boxLeft: number | null,
  boxTop: number | null,
  boxWidth: number | null,
  boxHeight: number | null,
): { ok: true } | { ok: false; error: string } {
  const ROOT_ID = "__doma-highlight-root";
  const STYLE_ID = "__doma-highlight-style";
  // page console：筛 [highlight-trace-v1]
  console.log("[highlight-trace-v1]", "page:render:start", {
    mode,
    pointX,
    pointY,
    boxLeft,
    boxTop,
    boxWidth,
    boxHeight,
    href: location.href,
  });

  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.querySelectorAll("[id^='__doma-highlight-']").forEach((n) => n.remove());

  const labelText = String(label || "").trim();
  const totalMs = Math.max(0, pulses) * Math.max(0, durationMs) + 80;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
  @keyframes __doma_hl_pulse {
    0%, 100% { opacity: 0.2; box-shadow: 0 0 0 0 rgba(255, 107, 53, 0.0); }
    50% { opacity: 1; box-shadow: 0 0 0 4px rgba(255, 107, 53, 0.35); }
  }
`;
    document.documentElement.appendChild(style);
  }

  const cleanupLater = () => {
    window.setTimeout(() => {
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    }, totalMs);
  };

  if (mode === "point") {
    if (pointX == null || pointY == null || !Number.isFinite(pointX) || !Number.isFinite(pointY)) {
      console.warn("[highlight-trace-v1]", "page:render:fail", { error: "invalid point coordinates" });
      return { ok: false, error: "invalid point coordinates" };
    }
    const vx = Math.round(pointX);
    const vy = Math.round(pointY);
    const half = dotPx / 2;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      pointerEvents: "none",
      boxSizing: "border-box",
    } as CSSStyleDeclaration);

    const dot = document.createElement("div");
    dot.id = "__doma-highlight-dot";
    Object.assign(dot.style, {
      position: "absolute",
      left: `${vx}px`,
      top: `${vy}px`,
      width: `${dotPx}px`,
      height: `${dotPx}px`,
      marginLeft: `${-half}px`,
      marginTop: `${-half}px`,
      borderRadius: "50%",
      background: "#FF6B35",
      border: "1px solid #fff",
      boxSizing: "border-box",
      animation: `__doma_hl_pulse ${durationMs}ms ease-in-out ${pulses}`,
    } as CSSStyleDeclaration);
    root.appendChild(dot);

    if (labelText) {
      const lab = document.createElement("div");
      lab.id = "__doma-highlight-label";
      lab.textContent = labelText.slice(0, 80);
      Object.assign(lab.style, {
        position: "absolute",
        left: `${vx + 8}px`,
        top: `${vy - 28}px`,
        maxWidth: "240px",
        padding: "2px 8px",
        borderRadius: "4px",
        background: "#FF6B35",
        color: "#fff",
        fontSize: "12px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: "20px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      } as CSSStyleDeclaration);
      root.appendChild(lab);
    }

    document.documentElement.appendChild(root);
    cleanupLater();
    console.log("[highlight-trace-v1]", "page:render:done", { mode: "point", vx, vy, totalMs });
    return { ok: true };
  }

  if (
    boxLeft == null
    || boxTop == null
    || boxWidth == null
    || boxHeight == null
    || !Number.isFinite(boxLeft)
    || !Number.isFinite(boxTop)
  ) {
    console.warn("[highlight-trace-v1]", "page:render:fail", { error: "invalid box coordinates" });
    return { ok: false, error: "invalid box coordinates" };
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  Object.assign(root.style, {
    position: "fixed",
    left: `${Math.round(boxLeft)}px`,
    top: `${Math.round(boxTop)}px`,
    width: `${Math.round(boxWidth)}px`,
    height: `${Math.round(boxHeight)}px`,
    zIndex: "2147483646",
    pointerEvents: "none",
    boxSizing: "border-box",
  } as CSSStyleDeclaration);

  const box = document.createElement("div");
  box.id = "__doma-highlight-box";
  Object.assign(box.style, {
    position: "absolute",
    inset: "0",
    border: "2px solid #FF6B35",
    borderRadius: "6px",
    background: "rgba(255, 107, 53, 0.12)",
    boxSizing: "border-box",
    animation: `__doma_hl_pulse ${durationMs}ms ease-in-out ${pulses}`,
  } as CSSStyleDeclaration);
  root.appendChild(box);

  if (labelText) {
    const lab = document.createElement("div");
    lab.id = "__doma-highlight-label";
    lab.textContent = labelText.slice(0, 80);
    Object.assign(lab.style, {
      position: "absolute",
      left: "0",
      top: "-28px",
      maxWidth: "240px",
      padding: "2px 8px",
      borderRadius: "4px",
      background: "#FF6B35",
      color: "#fff",
      fontSize: "12px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      lineHeight: "20px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
    } as CSSStyleDeclaration);
    root.appendChild(lab);
  }

  document.documentElement.appendChild(root);
  cleanupLater();
  console.log("[highlight-trace-v1]", "page:render:done", {
    mode: "element",
    left: Math.round(boxLeft),
    top: Math.round(boxTop),
    totalMs,
  });
  return { ok: true };
}

async function browser_highlightCore(
  args: Record<string, unknown>,
  meta: { somIndex?: number } = {},
): Promise<unknown> {
  const selector = args.selector as string;
  const somIndex = meta.somIndex;
  if (!selector) {
    console.warn(HL_TRACE, "core:no-selector", { somIndex });
    return { ok: false, error: "selector is required", stage: "resolve", implTag: BROWSER_HIGHLIGHT_TAG };
  }

  const label = typeof args.label === "string" ? args.label : "";
  const { pulses, durationMs } = parseHighlightPulseArgs(args);
  const doScroll = args.scroll !== false;

  const rawX = args.x;
  const rawY = args.y;
  const xOk = typeof rawX === "number" && Number.isFinite(rawX);
  const yOk = typeof rawY === "number" && Number.isFinite(rawY);
  // 只传 x 或只传 y：缺省侧按 0，走画圆点（勿回退成整元素高亮）
  const hasOffset = xOk || yOk;
  const offsetX = hasOffset ? (xOk ? rawX : 0) : null;
  const offsetY = hasOffset ? (yOk ? rawY : 0) : null;

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) {
    console.warn(HL_TRACE, "core:no-tab");
    return { ok: false, error: "no tab", stage: "resolve", implTag: BROWSER_HIGHLIGHT_TAG };
  }

  console.log(HL_TRACE, "core:start", {
    tabId,
    selector,
    somIndex: somIndex ?? null,
    offsetX,
    offsetY,
    doScroll,
    pulses,
    durationMs,
  });

  const notFoundMsg =
    somIndex != null
      ? `未找到编号 [${somIndex}] 的元素（页面可能已变化，请重新截图）`
      : `选择器未匹配到元素: ${selector}`;

  try {
    const results = await execAllFramesPerFrame(
      tabId,
      {
        world: "MAIN",
        func: highlightResolvePageFunc,
        args: [selector, doScroll, offsetX, offsetY],
      },
      { perFrameMs: 3000 },
    );
    console.log(HL_TRACE, "resolve:raw", {
      frameCount: results.length,
      frames: results.map((r) => {
        const res = r.result as HighlightResolveResult | null;
        return {
          frameId: r.frameId,
          ok: res?.ok ?? null,
          error: res && !res.ok ? res.error : null,
          elementNotFound: res && !res.ok ? !!res.elementNotFound : null,
          mode: res && res.ok ? res.mode : null,
          point: res && res.ok ? res.point ?? null : null,
          box: res && res.ok ? res.box ?? null : null,
        };
      }),
    });

    const frameHit = pickHighlightFrameResult(results);
    const resolved = frameHit?.result;
    if (!resolved) {
      console.warn(HL_TRACE, "resolve:none", { selector, somIndex });
      return {
        ok: false,
        error: notFoundMsg,
        stage: "resolve",
        selector,
        implTag: BROWSER_HIGHLIGHT_TAG,
      };
    }
    if (!resolved.ok) {
      console.warn(HL_TRACE, "resolve:fail", {
        frameId: frameHit.frameId,
        error: resolved.error,
        elementNotFound: !!resolved.elementNotFound,
      });
      return {
        ok: false,
        error: resolved.error || notFoundMsg,
        stage: "resolve",
        selector,
        resolveFrameId: frameHit.frameId,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        implTag: BROWSER_HIGHLIGHT_TAG,
      };
    }

    console.log(HL_TRACE, "resolve:picked", {
      frameId: frameHit.frameId,
      mode: resolved.mode,
      rect: resolved.rect,
      point: resolved.point ?? null,
      offset: resolved.offset ?? null,
      box: resolved.box ?? null,
      tag: resolved.tag,
    });

    const renderArgs: [
      "element" | "point",
      string,
      number,
      number,
      number,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
    ] = [
      resolved.mode,
      label,
      pulses,
      durationMs,
      HIGHLIGHT_DOT_PX,
      resolved.mode === "point" ? (resolved.point?.x ?? null) : null,
      resolved.mode === "point" ? (resolved.point?.y ?? null) : null,
      resolved.mode === "element" ? (resolved.box?.left ?? null) : null,
      resolved.mode === "element" ? (resolved.box?.top ?? null) : null,
      resolved.mode === "element" ? (resolved.box?.width ?? null) : null,
      resolved.mode === "element" ? (resolved.box?.height ?? null) : null,
    ];

    console.log(HL_TRACE, "render:args", { renderArgs });

    let renderResults: any;
    try {
      renderResults = await (getContext().browser.scripting as any).executeScript({
        target: { tabId, frameIds: [0] },
        world: "MAIN",
        func: highlightRenderOverlayPageFunc,
        args: renderArgs,
      });
    } catch (renderErr) {
      console.warn(HL_TRACE, "render:throw", renderErr);
      return {
        ok: false,
        error: `highlight render: executeScript threw: ${renderErr instanceof Error ? renderErr.message : String(renderErr)}`,
        stage: "render",
        selector,
        resolveFrameId: frameHit.frameId,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        implTag: BROWSER_HIGHLIGHT_TAG,
      };
    }

    const lastError =
      (getContext().browser.runtime as any)?.lastError?.message
      ?? null;
    console.log(HL_TRACE, "render:raw", {
      resultCount: Array.isArray(renderResults) ? renderResults.length : 0,
      first: renderResults?.[0] ?? null,
      lastError,
    });

    const renderHit = renderResults?.[0]?.result as { ok: boolean; error?: string } | undefined;
    if (!renderHit?.ok) {
      const detail = renderHit?.error
        ? renderHit.error
        : lastError
          ? `empty executeScript result (lastError=${lastError})`
          : "empty executeScript result";
      console.warn(HL_TRACE, "render:fail", { renderHit: renderHit ?? null, lastError, detail });
      return {
        ok: false,
        error: `highlight render: ${detail}`,
        stage: "render",
        selector,
        resolveFrameId: frameHit.frameId,
        renderRaw: renderResults?.[0] ?? null,
        ...(somIndex != null ? { index: somIndex, somIndex } : {}),
        implTag: BROWSER_HIGHLIGHT_TAG,
      };
    }

    console.log(HL_TRACE, "core:ok", {
      mode: resolved.mode,
      point: resolved.point ?? null,
      resolveFrameId: frameHit.frameId,
    });

    return {
      ok: true,
      mode: resolved.mode,
      scrolled: resolved.scrolled,
      pulses,
      durationMs,
      label: label.trim() || undefined,
      rect: resolved.rect,
      ...(resolved.point ? { point: resolved.point } : {}),
      ...(resolved.offset ? { offset: resolved.offset } : {}),
      tag: resolved.tag,
      text: resolved.text,
      selector,
      resolveFrameId: frameHit.frameId,
      renderFrameId: 0,
      ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      implTag: BROWSER_HIGHLIGHT_TAG,
    };
  } catch (e) {
    console.warn(HL_TRACE, "core:throw", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stage: "resolve",
      selector,
      ...(somIndex != null ? { index: somIndex, somIndex } : {}),
      implTag: BROWSER_HIGHLIGHT_TAG,
    };
  }
}

async function browser_highlight(args: Record<string, unknown>): Promise<unknown> {
  console.log(HL_TRACE, "tool:enter", {
    index: args.index ?? null,
    selector: args.selector ?? null,
    x: args.x ?? null,
    y: args.y ?? null,
    scroll: args.scroll !== false,
    label: typeof args.label === "string" ? args.label.slice(0, 40) : null,
  });
  const resolved = resolveSomLocatorArgs(args, {
    requireLocator: true,
    implTag: BROWSER_HIGHLIGHT_TAG,
  });
  if (!resolved.ok) {
    console.warn(HL_TRACE, "tool:resolve-fail", resolved);
    return resolved;
  }
  const result = await browser_highlightCore(resolved.args, { somIndex: resolved.somIndex });
  console.log(HL_TRACE, "tool:exit", {
    ok: (result as { ok?: boolean })?.ok ?? null,
    stage: (result as { stage?: string })?.stage ?? null,
    error: (result as { error?: string })?.error ?? null,
    mode: (result as { mode?: string })?.mode ?? null,
    point: (result as { point?: unknown })?.point ?? null,
  });
  return result;
}

async function browserDragPageFunc(
  fromSel: string,
  toSel: string | null,
  dx: number | null,
  dy: number | null,
): Promise<Record<string, unknown> | null> {
  const SYNTHETIC_STEPS = 12;
  const STEP_MS = 16;

  const isRangeInput = (node: Element | null): node is HTMLInputElement =>
    !!node && node.tagName === "INPUT" && (node as HTMLInputElement).type === "range";

  const resolveRangeInput = (root: HTMLElement): HTMLInputElement | null => {
    if (isRangeInput(root)) return root;
    const inner = root.querySelector('input[type="range"]');
    return isRangeInput(inner) ? inner : null;
  };

  const getRangeThumbX = (input: HTMLInputElement): number => {
    const tr = input.getBoundingClientRect();
    const min = parseFloat(input.min || "0");
    const max = parseFloat(input.max || "100");
    const val = parseFloat(input.value || String(min));
    const span = max - min || 1;
    return tr.left + ((val - min) / span) * tr.width;
  };

  const readRangeDisplay = (input: HTMLInputElement): string | null => {
    const parent = input.parentElement;
    if (!parent) return null;
    const display = parent.querySelector("#range, output, [class*='slider-value'], [class*='value']");
    const text = display?.textContent?.trim();
    return text || null;
  };

  let el = document.querySelector(fromSel) as HTMLElement | null;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return { error: `起始元素不可见: ${fromSel}` };

  const anyEl = el as HTMLElement & { scrollIntoViewIfNeeded?: () => void };
  if (typeof anyEl.scrollIntoViewIfNeeded === "function") {
    anyEl.scrollIntoViewIfNeeded();
  } else {
    el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
  }

  const rangeEl = resolveRangeInput(el);
  if (rangeEl) el = rangeEl;

  const r = el.getBoundingClientRect();
  let startX = rangeEl ? getRangeThumbX(rangeEl) : r.left + r.width / 2;
  let startY = r.top + r.height / 2;
  let endX = startX;
  let endY = startY;
  let dropEl: HTMLElement | null = null;

  if (toSel) {
    dropEl = document.querySelector(toSel) as HTMLElement | null;
    if (!dropEl) return { error: `目标选择器未匹配到元素: ${toSel}` };
    const tr = dropEl.getBoundingClientRect();
    if (tr.width === 0 && tr.height === 0) return { error: `目标元素不可见: ${toSel}` };
    endX = tr.left + tr.width / 2;
    endY = tr.top + tr.height / 2;
  } else if (dx != null || dy != null) {
    endX = startX + (dx ?? 0);
    endY = startY + (dy ?? 0);
  }

  const isDraggable = el.getAttribute("draggable") === "true" || (el as HTMLAnchorElement).draggable === true;

  const snapshot = (fromEl: HTMLElement, toTarget?: HTMLElement | null) => {
    const fr = fromEl.getBoundingClientRect();
    const header = fromEl.querySelector("header");
    const out: Record<string, unknown> = {
      fromLeft: Math.round(fr.left),
      fromTop: Math.round(fr.top),
      fromText: (fromEl.textContent || "").trim().slice(0, 80),
      fromHeader: header ? (header.textContent || "").trim() : null,
      fromParentId: fromEl.parentElement?.id || "",
      fromNextId: (fromEl.nextElementSibling as HTMLElement | null)?.id || "",
    };
    if (fromEl.tagName === "INPUT") out.fromValue = (fromEl as HTMLInputElement).value;
    if (isRangeInput(fromEl)) out.rangeDisplay = readRangeDisplay(fromEl);
    if (toTarget) {
      out.toLeft = Math.round(toTarget.getBoundingClientRect().left);
      out.toHeader = (toTarget.querySelector("header")?.textContent || "").trim() || null;
    }
    return out;
  };

  const verifyDrag = (
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fromEl: HTMLElement,
    toTarget?: HTMLElement | null,
  ): { verified: boolean; reason: string } => {
    if (before.fromValue != null && before.fromValue !== after.fromValue) {
      return { verified: true, reason: "input-value-changed" };
    }
    if (before.rangeDisplay != null && before.rangeDisplay !== after.rangeDisplay) {
      return { verified: true, reason: "range-display-changed" };
    }
    if (before.fromLeft !== after.fromLeft || before.fromTop !== after.fromTop) {
      return { verified: true, reason: "position-changed" };
    }
    if (before.fromHeader != null && before.fromHeader !== after.fromHeader) {
      return { verified: true, reason: "content-swapped" };
    }
    if (
      typeof before.fromText === "string" && before.fromText.length > 0
      && before.fromText !== after.fromText
    ) {
      return { verified: true, reason: "text-changed" };
    }
    if (before.fromParentId !== after.fromParentId) {
      return { verified: true, reason: "parent-changed" };
    }
    if (before.fromNextId !== after.fromNextId) {
      return { verified: true, reason: "sibling-changed" };
    }
    if (toTarget && before.toHeader && after.fromHeader === before.toHeader) {
      return { verified: true, reason: "swapped-with-target" };
    }
    if (toTarget && before.toLeft != null) {
      const fr = fromEl.getBoundingClientRect();
      if (Math.abs(fr.left - (before.toLeft as number)) < 24) {
        return { verified: true, reason: "moved-to-target-area" };
      }
    }
    return { verified: false, reason: "no-observable-drag" };
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const runSyntheticMouseDrag = async () => {
    const g = window as Window & { __showAgentCursor?: (x: number, y: number, t?: string) => void };
    if (g.__showAgentCursor) g.__showAgentCursor(startX, startY, "drag");

    const baseOpts: MouseEventInit = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new MouseEvent("mouseenter", { ...baseOpts, clientX: startX, clientY: startY }));
    el.dispatchEvent(new MouseEvent("mouseover", { ...baseOpts, clientX: startX, clientY: startY, buttons: 0 }));
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", {
        ...baseOpts, clientX: startX, clientY: startY, buttons: 1, pointerId: 1, pointerType: "mouse",
      } as PointerEventInit));
    } catch { /* ignore */ }
    el.dispatchEvent(new MouseEvent("mousedown", { ...baseOpts, clientX: startX, clientY: startY, buttons: 1 }));

    for (let i = 1; i <= SYNTHETIC_STEPS; i++) {
      const x = startX + ((endX - startX) * i) / SYNTHETIC_STEPS;
      const y = startY + ((endY - startY) * i) / SYNTHETIC_STEPS;
      const moveOpts: MouseEventInit = { ...baseOpts, clientX: x, clientY: y, buttons: 1 };
      el.dispatchEvent(new MouseEvent("mousemove", moveOpts));
      document.dispatchEvent(new MouseEvent("mousemove", moveOpts));
      try {
        el.dispatchEvent(new PointerEvent("pointermove", {
          ...moveOpts, pointerId: 1, pointerType: "mouse",
        } as PointerEventInit));
      } catch { /* ignore */ }
      await sleep(STEP_MS);
    }

    const releaseTarget = document.elementFromPoint(endX, endY) as HTMLElement | null;
    const releaseEl = releaseTarget ?? el;
    const upOpts: MouseEventInit = { ...baseOpts, clientX: endX, clientY: endY, buttons: 0 };
    try {
      releaseEl.dispatchEvent(new PointerEvent("pointerup", {
        ...upOpts, pointerId: 1, pointerType: "mouse",
      } as PointerEventInit));
    } catch { /* ignore */ }
    releaseEl.dispatchEvent(new MouseEvent("mouseup", upOpts));
    releaseEl.dispatchEvent(new MouseEvent("click", upOpts));
    return releaseEl;
  };

  const runRangeInputDrag = (targetX: number): { ok: boolean; value?: string; reason?: string } => {
    if (!isRangeInput(el)) {
      return { ok: false, reason: "not-range-input" };
    }

    const min = parseFloat(el.min || "0");
    const max = parseFloat(el.max || "100");
    const stepRaw = el.step;
    const step = stepRaw === "" || stepRaw == null ? 1 : parseFloat(stepRaw) || 1;
    const tr = el.getBoundingClientRect();
    if (tr.width <= 0) return { ok: false, reason: "range-zero-width" };

    const ratio = Math.max(0, Math.min(1, (targetX - tr.left) / tr.width));
    let val = min + ratio * (max - min);

    if (step > 0) {
      const steps = Math.round((val - min) / step);
      val = min + steps * step;
      const decimals = (String(step).split(".")[1] || "").length;
      val = parseFloat(val.toFixed(Math.max(decimals, 2)));
    }
    val = Math.max(min, Math.min(max, val));

    const beforeVal = el.value;
    const beforeDisplay = readRangeDisplay(el);
    const nextVal = String(val);
    el.focus();
    el.value = nextVal;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextVal }));
    } catch { /* ignore */ }
    const changeEv = new Event("change", { bubbles: true });
    el.dispatchEvent(changeEv);
    if (typeof el.onchange === "function") {
      try { el.onchange.call(el, changeEv); } catch { /* ignore */ }
    }

    const afterDisplay = readRangeDisplay(el);
    const valueChanged = el.value !== beforeVal;

    return {
      ok: valueChanged || (beforeDisplay != null && afterDisplay !== beforeDisplay),
      value: el.value,
      reason: valueChanged ? "range-value-changed" : "range-value-set",
    };
  };

  const runHtml5DndDrag = (): { ok: boolean; reason?: string; dropTag?: string } => {
    let dt: DataTransfer;
    try {
      dt = new DataTransfer();
      dt.setData("text/plain", el.id || fromSel);
      dt.effectAllowed = "all";
    } catch {
      return { ok: false, reason: "dataTransfer-unavailable" };
    }

    const evtBase: DragEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      dataTransfer: dt,
    };

    const dragStart = new DragEvent("dragstart", { ...evtBase, clientX: startX, clientY: startY });
    if (!el.dispatchEvent(dragStart)) {
      return { ok: false, reason: "dragstart-canceled" };
    }

    el.dispatchEvent(new DragEvent("drag", { ...evtBase, clientX: startX, clientY: startY }));

    let target = dropEl;
    if (!target) {
      target = document.elementFromPoint(endX, endY) as HTMLElement | null;
    }
    if (!target) target = el;

    target.dispatchEvent(new DragEvent("dragenter", { ...evtBase, clientX: endX, clientY: endY }));
    target.dispatchEvent(new DragEvent("dragover", { ...evtBase, clientX: endX, clientY: endY }));
    target.dispatchEvent(new DragEvent("drop", { ...evtBase, clientX: endX, clientY: endY }));
    el.dispatchEvent(new DragEvent("dragend", { ...evtBase, clientX: endX, clientY: endY }));

    return { ok: true, dropTag: target.tagName.toLowerCase() };
  };

  const g = window as Window & { __hideAgentCursor?: () => void };
  const before = snapshot(el, dropEl);
  let method: "synthetic" | "range-input" | "html5-dnd" = "synthetic";
  let usedHtml5Dnd = false;
  let usedRangeInput = false;
  let rangeValue: string | undefined;
  let releaseEl: HTMLElement = el;

  const buildResult = (verify: { verified: boolean; reason: string }) => {
    const hint = usedRangeInput
      ? "原生 range 滑块已按轨道位置设置 value 并触发 change。"
      : usedHtml5Dnd
        ? "synthetic 未生效，已用 HTML5 DnD（dragstart/drop）兜底。"
        : !verify.verified && isRangeInput(el)
          ? "range 滑块拖动未生效；请确认 SoM 标在 input[type=range] 上，并传 offsetX（offsetY 可省略）。"
          : !verify.verified && isDraggable
            ? "draggable 元素 synthetic 与 DnD 均未观察到变化，请重新截图确认编号。"
            : !verify.verified
              ? "未观察到拖动效果，可加大 offset 或确认目标 toSelector。"
              : undefined;

    return {
      ok: verify.verified,
      ...(verify.verified ? {} : { error: hint || "drag-not-verified" }),
      verified: verify.verified,
      reason: verify.reason,
      method,
      usedHtml5Dnd,
      usedRangeInput,
      ...(rangeValue != null ? { rangeValue } : {}),
      draggable: isDraggable,
      from: { x: Math.round(startX), y: Math.round(startY) },
      to: { x: Math.round(endX), y: Math.round(endY) },
      fromTag: el.tagName.toLowerCase(),
      toTag: releaseEl.tagName.toLowerCase(),
      ...(hint ? { hint } : {}),
    };
  };

  try {
    // range 滑块：跳过无效 synthetic，直接设 value
    if (rangeEl) {
      const gCursor = window as Window & { __showAgentCursor?: (x: number, y: number, t?: string) => void };
      gCursor.__showAgentCursor?.(startX, startY, "drag");
      gCursor.__showAgentCursor?.(endX, endY, "drag");

      const range = runRangeInputDrag(endX);
      usedRangeInput = range.ok;
      method = "range-input";
      rangeValue = range.value;
      await sleep(50);

      let verify = verifyDrag(before, snapshot(el, dropEl), el, dropEl);
      if (!verify.verified && range.ok && range.reason) {
        verify = { verified: true, reason: range.reason };
      }

      g.__hideAgentCursor?.();
      return buildResult(verify);
    }

    releaseEl = await runSyntheticMouseDrag();
    await sleep(50);
    let after = snapshot(el, dropEl);
    let verify = verifyDrag(before, after, el, dropEl);

    if (!verify.verified && isDraggable) {
      const dnd = runHtml5DndDrag();
      if (dnd.ok) {
        usedHtml5Dnd = true;
        method = "html5-dnd";
        await sleep(50);
        after = snapshot(el, dropEl);
        verify = verifyDrag(before, after, el, dropEl);
        if (dnd.dropTag) releaseEl = dropEl ?? el;
      }
    }

    g.__hideAgentCursor?.();

    return buildResult(verify);
  } catch (e) {
    g.__hideAgentCursor?.();
    return { error: String(e) };
  }
}

async function browser_dragCore(
  args: Record<string, unknown>,
  meta: { somFromIndex?: number; somToIndex?: number } = {},
): Promise<unknown> {
  const fromSelector = (args.fromSelector as string | undefined) ?? (args.selector as string | undefined);
  const toSelector = args.toSelector as string | undefined;
  const offsetX = args.offsetX as number | undefined;
  const offsetY = args.offsetY as number | undefined;
  const somFromIndex = meta.somFromIndex;
  const somToIndex = meta.somToIndex;

  if (!fromSelector) return { error: "fromSelector is required", implTag: BROWSER_DRAG_UNIFIED_SOM_TAG };
  if (!toSelector && offsetX == null && offsetY == null) {
    return { error: "toSelector or offsetX/offsetY required", implTag: BROWSER_DRAG_UNIFIED_SOM_TAG };
  }

  const normOffsetX = offsetX ?? 0;
  const normOffsetY = offsetY ?? 0;

  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab", implTag: BROWSER_DRAG_UNIFIED_SOM_TAG };

  await ensureClickIndicator(tabId);

  const notFoundFromMsg = somFromIndex != null
    ? `未找到起始编号 [${somFromIndex}] 的元素（页面可能已变化，请重新截图）`
    : `起始选择器未匹配到元素: ${fromSelector}`;

  try {
    const dragResults = await execAllFramesPerFrame(tabId, {
      world: "MAIN",
      func: browserDragPageFunc,
      args: [fromSelector, toSelector ?? null, toSelector ? null : normOffsetX, toSelector ? null : normOffsetY],
    }, { perFrameMs: DRAG_SYNTHETIC_STEPS * DRAG_STEP_MS + 3000 });

    const hit: any = dragResults?.find((r: any) => r.result && (r.result as { ok?: boolean }).ok)?.result
             || dragResults?.find((r: any) => r.result && ((r.result as { error?: string }).error || (r.result as { ok?: boolean }).ok === false))?.result;
    if (!hit) return { error: notFoundFromMsg, implTag: BROWSER_DRAG_UNIFIED_SOM_TAG, fromSelector, ...(somFromIndex != null ? { fromIndex: somFromIndex } : {}) };
    if (hit.error || hit.ok === false) {
      return {
        ...hit,
        ok: false,
        implTag: BROWSER_DRAG_UNIFIED_SOM_TAG,
        fromSelector,
        toSelector,
        ...(somFromIndex != null ? { fromIndex: somFromIndex, ...(somToIndex != null ? { toIndex: somToIndex } : {}) } : {}),
        dragDnd: BROWSER_DRAG_DND_TAG,
        dragRange: BROWSER_DRAG_RANGE_TAG,
      };
    }

    return {
      ...hit,
      fromSelector,
      ...(toSelector ? { toSelector } : { offsetX, offsetY }),
      ...(somFromIndex != null ? { fromIndex: somFromIndex, ...(somToIndex != null ? { toIndex: somToIndex } : {}) } : {}),
      implTag: BROWSER_DRAG_UNIFIED_SOM_TAG,
      dragDnd: BROWSER_DRAG_DND_TAG,
      dragRange: BROWSER_DRAG_RANGE_TAG,
    };
  } catch (e) {
    return { error: String(e), implTag: BROWSER_DRAG_UNIFIED_SOM_TAG };
  }
}

async function browser_drag(args: Record<string, unknown>): Promise<unknown> {
  const fromResolved = resolveSomLocatorArgs(args, {
    indexKey: "fromIndex",
    selectorKey: "fromSelector",
    requireLocator: true,
    implTag: BROWSER_DRAG_UNIFIED_SOM_TAG,
  });
  if (!fromResolved.ok) return fromResolved;

  let nextArgs = fromResolved.args;
  const toIndexRaw = nextArgs.toIndex;
  const toIndex =
    typeof toIndexRaw === "number" && Number.isFinite(toIndexRaw) ? Math.floor(toIndexRaw) : null;
  if (toIndex != null) {
    const { toIndex: _omit, ...rest } = nextArgs;
    nextArgs = { ...rest, toSelector: somIndexToSelector(toIndex) };
  } else if ("toIndex" in nextArgs) {
    const { toIndex: _omit, ...rest } = nextArgs;
    nextArgs = rest;
  }

  return browser_dragCore(nextArgs, {
    somFromIndex: fromResolved.somIndex,
    ...(toIndex != null ? { somToIndex: toIndex } : {}),
  });
}

async function browser_drag_index(args: Record<string, unknown>): Promise<unknown> {
  return browser_drag(args);
}

async function browser_type_index_user_data(args: Record<string, unknown>): Promise<unknown> {
  const index = args.index as number;
  const key = args.key as string | undefined;
  const clear = (args.clear as boolean) ?? true;
  if (index == null) return { error: "index is required" };
  if (!key) return { error: "key is required" };

  try {
    const store = new TempDataStore();
    const record = await store.get(key);
    if (!record) return { error: "user data not found" };
    return browser_type({
      index,
      text: record.value,
      clear,
      conversationId: args.conversationId,
    });
  } catch (e) {
    return { error: String(e) };
  }
}

// ========== 清洗 HTML ==========

async function browser_get_clean_html(args: Record<string, unknown>): Promise<unknown> {
  const selector = (args.selector as string | undefined) ?? null;
  const maxLength = (args.maxLength as number | undefined) ?? 3000;
  
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string | null, maxLen: number) => {
        const root = sel ? document.querySelector(sel) : document.body;
        if (!root) return { error: "element not found" };
        
        // 克隆节点以避免修改原始 DOM
        const clone = root.cloneNode(true) as HTMLElement;
        
        // ========== 第一层：剔除无用标签 ==========
        const tagsToRemove = [
          'script', 'style', 'link', 'meta', 'noscript',
          'svg', 'path', 'iframe', 'video', 'audio', 'canvas',
          'template', 'slot', 'portal',
        ];
        for (const tag of tagsToRemove) {
          clone.querySelectorAll(tag).forEach(el => el.remove());
        }
        
        // 移除注释节点
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
        const comments: Comment[] = [];
        while (walker.nextNode()) comments.push(walker.currentNode as Comment);
        comments.forEach(c => c.remove());
        
        // ========== 第二层：清理冗余属性 ==========
        const attrsToRemove = [
          'style', 'class',                           // 样式
          'data-v-', 'data-reactid', '__vue',         // 框架内部（前缀匹配）
          'onclick', 'onmouseover', 'onmouseout',     // 内联事件
          'onfocus', 'onblur', 'onchange', 'onsubmit',
          'onkeydown', 'onkeyup', 'onkeypress',
          'onload', 'onerror',
          'srcset', 'sizes',                          // 响应式图片
          'integrity', 'crossorigin',                  // 安全属性
        ];
        
        // 保留的属性白名单
        const attrsToKeep = new Set([
          'id', 'name', 'type', 'value', 'placeholder',
          'href', 'src', 'alt', 'title',
          'role', 'aria-label', 'aria-labelledby', 'aria-describedby',
          'for', 'action', 'method',
          'disabled', 'readonly', 'checked', 'selected',
          'min', 'max', 'step', 'pattern',
          'rows', 'cols', 'maxlength',
          'tabindex',
        ]);
        
        clone.querySelectorAll('*').forEach(el => {
          const attrs = Array.from(el.attributes);
          for (const attr of attrs) {
            const name = attr.name.toLowerCase();
            
            // 检查是否在保留白名单中
            if (attrsToKeep.has(name)) continue;
            
            // 检查是否需要移除
            let shouldRemove = false;
            for (const pattern of attrsToRemove) {
              if (name === pattern || name.startsWith(pattern)) {
                shouldRemove = true;
                break;
              }
            }
            
            // 移除所有 data-* 属性（除了少数有用的）
            if (name.startsWith('data-') && 
                !['data-testid', 'data-id', 'data-value', 'data-date'].includes(name)) {
              shouldRemove = true;
            }
            
            if (shouldRemove) {
              el.removeAttribute(attr.name);
            }
          }
        });
        
        // ========== 第三层：简化结构 ==========
        // 移除空的 div/span（无文本、无子元素）
        let changed = true;
        while (changed) {
          changed = false;
          clone.querySelectorAll('div, span').forEach(el => {
            if (!el.textContent?.trim() && el.children.length === 0) {
              el.remove();
              changed = true;
            }
          });
        }
        
        // 展开只有单个子元素的无意义容器
        clone.querySelectorAll('div, span').forEach(el => {
          if (el.children.length === 1 && !el.textContent?.trim().replace(el.children[0].textContent || '', '')) {
            const child = el.children[0];
            if (!el.id && !el.getAttribute('role')) {
              el.replaceWith(child);
            }
          }
        });
        
        // ========== 格式化输出 ==========
        // 移除多余空白
        let html = clone.innerHTML
          .replace(/\s+/g, ' ')
          .replace(/> </g, '>\n<')
          .trim();
        
        // 截断
        if (html.length > maxLen) {
          html = html.slice(0, maxLen) + '\n<!-- ... truncated -->';
        }
        
        // 统计保留的关键元素
        const stats = {
          buttons: clone.querySelectorAll('button, [role="button"]').length,
          links: clone.querySelectorAll('a[href]').length,
          inputs: clone.querySelectorAll('input, select, textarea').length,
          forms: clone.querySelectorAll('form').length,
        };
        
        return {
          html,
          length: html.length,
          stats,
        };
      },
      args: [selector, maxLength],
    });
    
    const result = results?.[0]?.result;
    if (result?.error) return result;
    
    return {
      ok: true,
      ...result,
    };
  } catch (e) {
    return { error: String(e) };
  }
}

async function browser_get_video_caption(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = args.conversationId as string | undefined;
  if (!conversationId) {
    return { ok: false, error: "conversationId required" };
  }

  const tabId = await getTabIdByConversationId(conversationId);
  if (!tabId) return { ok: false, error: "no tab" };

  try {
    const caption = await VideoPageTools.findVideosCaption(tabId);
    if (caption == null) {
      return { ok: false, message: "未找到字幕或拉取失败" };
    }
    return { ok: true, caption };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_seek_video(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = args.conversationId as string | undefined;
  if (!conversationId) {
    return { ok: false, error: "conversationId required" };
  }

  const seconds = Number(args.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return { ok: false, error: "invalid seconds" };
  }

  const tabId = await getTabIdByConversationId(conversationId);
  if (!tabId) return { ok: false, error: "no tab" };

  const videoUuid =
    typeof args.videoUuid === "string" && args.videoUuid.trim()
      ? args.videoUuid.trim()
      : undefined;

  try {
    return await VideoPageTools.seekVideoPlayer(tabId, seconds, videoUuid);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_download_files(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = args.conversationId as string | undefined;
  if (!conversationId) {
    return { ok: false, error: "conversationId required" };
  }

  const assetIdList = Array.isArray(args.assetIdList)
    ? args.assetIdList.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
    : [];
  const fileInfoList = Array.isArray(args.fileInfoList)
    ? (args.fileInfoList as { fileName?: string; content?: string; mimeType?: string }[])
    : [];

  if (!assetIdList.length && !fileInfoList.length) {
    return {
      ok: false,
      error: "assetIdList or fileInfoList required",
      hint: "优先传 browser_html_to_pdf 返回的 assetId；小文本再用 fileInfoList",
    };
  }

  const tabId = await getTabIdByConversationId(conversationId);
  if (!tabId) return { ok: false, error: "no tab" };

  const browser = getContext().browser;
  const downloaded: Array<{ fileName: string; source: "asset" | "fileInfo"; assetId?: string; downloadId?: number }> = [];
  const failed: Array<{ source: "asset" | "fileInfo"; assetId?: string; fileName?: string; error: string }> = [];

  const triggerDownload = (url: string, fileName: string): Promise<number | undefined> =>
    new Promise((resolve) => {
      try {
        browser.downloads.download({ url, filename: fileName }, (id: number) => {
          if (browser.runtime?.lastError) {
            console.warn("[download_files] error:", browser.runtime.lastError);
            resolve(undefined);
            return;
          }
          resolve(id);
        });
      } catch (e) {
        console.warn("[download_files] threw:", e);
        resolve(undefined);
      }
    });

  for (const assetId of assetIdList) {
    try {
      const asset = await getWorkspaceToolAsset(assetId);
      if (!asset) {
        failed.push({ source: "asset", assetId, error: "asset_not_found" });
        continue;
      }
      const fileName = (asset.fileName || "download.bin").replace(/[/\\?%*:|"<>]/g, "_");
      const blobUrl = URL.createObjectURL(asset.blob);
      try {
        const downloadId = await triggerDownload(blobUrl, fileName);
        if (downloadId == null) {
          // blob URL 在部分环境下 downloads 不稳定，退回 data URL（体积大时可能失败）
          const buf = await asset.blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          const b64 = btoa(binary);
          const mime = asset.mimeType || "application/octet-stream";
          const dataUrl = `data:${mime};base64,${b64}`;
          const id2 = await triggerDownload(dataUrl, fileName);
          if (id2 == null) {
            failed.push({ source: "asset", assetId, fileName, error: "download_failed" });
          } else {
            downloaded.push({ fileName, source: "asset", assetId, downloadId: id2 });
          }
        } else {
          downloaded.push({ fileName, source: "asset", assetId, downloadId });
        }
      } finally {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {
            /* ignore */
          }
        }, 60_000);
      }
    } catch (e) {
      failed.push({
        source: "asset",
        assetId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  for (const fileInfo of fileInfoList) {
    const fileName = typeof fileInfo?.fileName === "string" ? fileInfo.fileName.trim() : "";
    const content = typeof fileInfo?.content === "string" ? fileInfo.content : "";
    const mimeType =
      typeof fileInfo?.mimeType === "string" && fileInfo.mimeType.trim()
        ? fileInfo.mimeType.trim()
        : "text/plain;charset=utf-8";
    if (!fileName) {
      failed.push({ source: "fileInfo", error: "fileName required" });
      continue;
    }
    try {
      const dataUrl = `data:${mimeType};charset=utf-8,` + encodeURIComponent(content);
      const downloadId = await triggerDownload(dataUrl, fileName);
      if (downloadId == null) {
        failed.push({ source: "fileInfo", fileName, error: "download_failed" });
      } else {
        downloaded.push({ fileName, source: "fileInfo", downloadId });
      }
    } catch (e) {
      failed.push({
        source: "fileInfo",
        fileName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    ok: failed.length === 0,
    downloaded,
    failed,
    count: downloaded.length,
  };
}

/** 规范化 PDF 文件名 */
function normalizePdfFileName(raw: unknown): string {
  let name = typeof raw === "string" && raw.trim() ? raw.trim() : "document.pdf";
  name = name.replace(/[/\\?%*:|"<>]/g, "_");
  if (!/\.pdf$/i.test(name)) name = `${name}.pdf`;
  return name;
}

function wrapHtmlForPdf(html: string): string {
  const trimmed = html.trim();
  if (/<html[\s>]/i.test(trimmed)) return trimmed;
  const looksMarkup = /<[a-z][\s\S]*>/i.test(trimmed);
  const body = looksMarkup
    ? trimmed
    : `<pre style="white-space:pre-wrap;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;margin:0">${escapeHtmlForPdf(trimmed)}</pre>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #111;
    padding: 24px;
  }
  h1,h2,h3 { line-height: 1.3; }
  img { max-width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtmlForPdf(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function waitTabStatusComplete(tabId: number, timeoutMs = 20000): Promise<void> {
  const browser = getContext().browser;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        browser.tabs.onUpdated.removeListener(onUpdated);
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("tab load timeout")), timeoutMs);
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") finish();
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    void browser.tabs.get(tabId).then((tab: { status?: string }) => {
      if (tab?.status === "complete") finish();
    }).catch(() => {
      /* wait for event */
    });
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * HTML → PDF：临时标签页渲染 + CDP Page.printToPDF，支持中文/富文本。
 * 生成后下载，默认再开标签查看。
 */
async function browser_html_to_pdf(args: Record<string, unknown>): Promise<unknown> {
  const htmlRaw = typeof args.html === "string" ? args.html : "";
  if (!htmlRaw.trim()) {
    return { ok: false, error: "html required" };
  }
  const fileName = normalizePdfFileName(args.fileName);
  const openAfter = args.open !== false;
  const landscape = args.landscape === true;
  const browser = getContext().browser;
  const dbg = (browser as any).debugger;
  if (!dbg?.attach || !dbg?.sendCommand || !dbg?.detach) {
    return { ok: false, error: "debugger API unavailable (required for HTML→PDF)" };
  }

  const fullHtml = wrapHtmlForPdf(htmlRaw);
  // SW 里 blob URL 对 tabs 不稳定；data URL 对「hello」级文档足够
  const htmlUrl = `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;

  let tabId: number | undefined;
  let attached = false;
  let suppressArmed = false;
  try {
    await setChatPanelSuppressTabBind(true);
    suppressArmed = true;

    const tab = await browser.tabs.create({ url: htmlUrl, active: false });
    tabId = tab?.id;
    if (tabId == null) {
      return { ok: false, error: "failed to create preview tab" };
    }

    await waitTabStatusComplete(tabId);
    await new Promise((r) => setTimeout(r, 250));

    // data: 页无异扩展 embed，直接 attach（避免 executeScript 失败）
    await dbg.attach({ tabId }, "1.3");
    attached = true;

    const result = await dbg.sendCommand({ tabId }, "Page.printToPDF", {
      printBackground: true,
      landscape,
      preferCSSPageSize: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.5,
      marginRight: 0.5,
    });
    const b64 = typeof result?.data === "string" ? result.data : "";
    if (!b64) {
      return { ok: false, error: "Page.printToPDF returned empty data" };
    }

    const pdfBytes = base64ToUint8Array(b64);
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    const conversationId =
      typeof args.conversationId === "string" ? args.conversationId.trim() : undefined;

    const asset = await putWorkspaceToolAsset({
      blob: pdfBlob,
      mimeType: "application/pdf",
      fileName,
      conversationId,
    });

    const doDownload = args.download !== false;
    const pdfUrl = `data:application/pdf;base64,${b64}`;
    let downloadId: number | undefined;
    if (doDownload) {
      downloadId = await new Promise<number | undefined>((resolve) => {
        try {
          browser.downloads.download(
            { url: pdfUrl, filename: fileName, saveAs: false },
            (id: number) => {
              if (browser.runtime?.lastError) {
                console.warn("[html_to_pdf] download error:", browser.runtime.lastError);
                resolve(undefined);
                return;
              }
              resolve(id);
            },
          );
        } catch (e) {
          console.warn("[html_to_pdf] download threw:", e);
          resolve(undefined);
        }
      });
    }

    let openedTabId: number | undefined;
    if (openAfter) {
      try {
        const opened = await browser.tabs.create({ url: pdfUrl, active: true });
        openedTabId = opened?.id;
      } catch (e) {
        console.warn("[html_to_pdf] open pdf tab failed:", e);
      }
    }

    return {
      ok: true,
      assetId: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      bytes: pdfBytes.byteLength,
      downloadId: downloadId ?? null,
      openedTabId: openedTabId ?? null,
      hint: "已生成 PDF。写入工作区请调用 browser_write_workspace({ assetId, fileName })，勿把 PDF 内容放进对话。",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (attached && tabId != null) {
      try {
        await dbg.detach({ tabId });
      } catch {
        /* ignore */
      }
    }
    if (tabId != null) {
      try {
        await browser.tabs.remove(tabId);
      } catch {
        /* ignore */
      }
    }
    if (suppressArmed) {
      await setChatPanelSuppressTabBind(false);
    }
  }
}

const RUNNER_OFF_HINT =
  "CLI Runner 未启动：连接器 → 命令运行器，执行 ~/bin/doma-cli-runner start -d";

async function browser_cli_list(_args: Record<string, unknown>): Promise<unknown> {
  const health = await fetchCliRunnerHealth();
  const commands = (await listCliCatalogCommands()).map((c) => ({
    commandId: c.id,
    name: c.name,
    description: c.description,
    source: c.source,
    runnerRequired: c.runnerRequired,
    args: c.args || {},
    examples: c.examples || [],
  }));
  return {
    ok: true,
    runnerRunning: health.running,
    runnerVersion: health.version || null,
    commands,
    hint: health.running
      ? "具名 CLI → browser_cli_run；通用 shell → browser_cli_shell"
      : RUNNER_OFF_HINT,
  };
}

async function browser_cli_run(args: Record<string, unknown>): Promise<unknown> {
  const commandId = typeof args.commandId === "string" ? args.commandId.trim() : "";
  if (!commandId) {
    return { ok: false, error: "commandId_required", hint: "先 browser_cli_list" };
  }

  const def = await getCliCatalogCommand(commandId);
  if (!def) {
    return {
      ok: false,
      error: "unknown_command",
      hint: "不在 CLI 目录中；先 browser_cli_list，或改用 browser_cli_shell",
    };
  }

  const health = await fetchCliRunnerHealth();
  if (!health.running) {
    return { ok: false, error: "runner_offline", hint: RUNNER_OFF_HINT };
  }

  if (def.id === "reveal" || def.name === "reveal") {
    const path = typeof args.path === "string" ? args.path.trim() : "";
    if (!path) {
      return { ok: false, error: "path_required", hint: "reveal 需要绝对路径 path" };
    }
    const result = await revealPathInFileManager(path);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        detail: result.detail,
        hint:
          result.error === "runner_offline"
            ? RUNNER_OFF_HINT
            : "检查 path 是否为存在的绝对路径",
      };
    }
    return { ok: true, commandId: "reveal", path: result.path };
  }

  const argsStr = typeof args.args === "string" ? args.args : "";
  const result = await execCliCommand(def.name, argsStr);
  if (result.error === "runner_offline" || result.error === "exec_not_supported") {
    return {
      ok: false,
      error: result.error,
      detail: result.detail,
      hint:
        result.error === "runner_offline"
          ? RUNNER_OFF_HINT
          : "请重新上传并安装最新 doma_cli_runner.py 后 start -d",
    };
  }
  return {
    ok: result.ok,
    commandId: def.id,
    name: def.name,
    command: result.command,
    args: argsStr,
    exitCode: result.exitCode ?? (result.ok ? 0 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.ok ? undefined : result.error,
    detail: result.detail,
  };
}

async function browser_cli_shell(args: Record<string, unknown>): Promise<unknown> {
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (!command) {
    return { ok: false, error: "command_required" };
  }
  let timeoutSec = 120;
  if (typeof args.timeoutSec === "number" && Number.isFinite(args.timeoutSec)) {
    timeoutSec = Math.max(1, Math.min(300, Math.floor(args.timeoutSec)));
  }

  const health = await fetchCliRunnerHealth();
  if (!health.running) {
    return { ok: false, error: "runner_offline", hint: RUNNER_OFF_HINT };
  }

  const result = await runCliShell(command, timeoutSec);
  if (result.error === "runner_offline" || result.error === "shell_not_supported") {
    return {
      ok: false,
      error: result.error,
      detail: result.detail,
      hint:
        result.error === "runner_offline"
          ? RUNNER_OFF_HINT
          : "请重新上传并安装最新 doma_cli_runner.py 后 start -d",
    };
  }
  return {
    ok: result.ok,
    command: result.command || command,
    shell: result.shell,
    exitCode: result.exitCode ?? (result.ok ? 0 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.ok ? undefined : result.error,
    detail: result.detail,
    hint: result.ok
      ? undefined
      : "命令失败或未安装：根据 stderr/exitCode 调整；不必事先探测是否安装",
  };
}

async function browser_write_workspace(args: Record<string, unknown>): Promise<unknown> {
  const assetId = typeof args.assetId === "string" ? args.assetId.trim() : "";
  const fileNameArg = typeof args.fileName === "string" ? args.fileName.trim() : "";
  const path = typeof args.path === "string" ? args.path : "";
  const hasContent = typeof args.content === "string";
  const content = hasContent ? (args.content as string) : "";

  if (!assetId && !hasContent) {
    return {
      ok: false,
      error: "assetId or content required",
      hint: "优先传 browser_html_to_pdf 返回的 assetId；小文本可用 content",
    };
  }

  try {
    let data: string | Blob;
    let fileName = fileNameArg;

    if (assetId) {
      const asset = await getWorkspaceToolAsset(assetId);
      if (!asset) {
        return {
          ok: false,
          error: "asset_not_found",
          hint: "assetId 无效或已过期；请重新调用生成文件的 tool（如 browser_html_to_pdf）",
        };
      }
      data = asset.blob;
      if (!fileName) fileName = asset.fileName;
    } else {
      data = content;
      if (!fileName && !path.trim()) {
        return { ok: false, error: "fileName required when using content" };
      }
    }

    const result = await writeWorkspaceFile({
      path: path || undefined,
      fileName: fileName || undefined,
      data,
    });
    return {
      ok: true,
      relativePath: result.relativePath,
      bytes: result.bytes,
      assetId: assetId || null,
      hint: "已写入工作区；用户可在侧栏工作区页刷新查看",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "workspace_not_authorized") {
      return {
        ok: false,
        error: "workspace_not_authorized",
        hint: "用户尚未授权工作区目录；请提示先点击侧栏文件夹图标打开工作区并选择文件夹",
      };
    }
    if (msg === "workspace_permission_denied") {
      return {
        ok: false,
        error: "workspace_permission_denied",
        hint: "工作区权限已失效；请提示用户重新打开工作区页并授权目录",
      };
    }
    return { ok: false, error: msg };
  }
}

async function browser_download_search(args: Record<string, unknown>): Promise<unknown> {
  const browser = getContext().browser;
  if (typeof browser.downloads?.search !== "function") {
    return { ok: false, error: "downloads API unavailable" };
  }

  const rawLimit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : 10;
  const limit = Math.max(1, Math.min(50, rawLimit));

  const query: Record<string, unknown> = {
    orderBy: ["-startTime"],
    limit,
  };

  const state = typeof args.state === "string" ? args.state.trim() : "";
  if (state === "in_progress" || state === "interrupted" || state === "complete") {
    query.state = state;
  }

  if (typeof args.startedAfterMs === "number" && Number.isFinite(args.startedAfterMs)) {
    query.startedAfter = new Date(Math.floor(args.startedAfterMs)).toISOString();
  }

  const filenameRegex = typeof args.filenameRegex === "string" ? args.filenameRegex.trim() : "";
  if (filenameRegex) query.filenameRegex = filenameRegex;

  const urlRegex = typeof args.urlRegex === "string" ? args.urlRegex.trim() : "";
  if (urlRegex) query.urlRegex = urlRegex;

  const searchQuery = typeof args.query === "string" ? args.query.trim() : "";
  if (searchQuery) query.query = [searchQuery];

  try {
    const items = await browser.downloads.search(query);
    const list = Array.isArray(items) ? items : [];
    return {
      ok: true,
      count: list.length,
      downloads: list.map((item: any) => ({
        id: item?.id,
        filename: item?.filename ?? "",
        url: item?.url ?? "",
        finalUrl: item?.finalUrl ?? "",
        mime: item?.mime ?? "",
        state: item?.state ?? "",
        startTime: item?.startTime ?? "",
        endTime: item?.endTime ?? "",
        bytesReceived: item?.bytesReceived,
        totalBytes: item?.totalBytes,
        fileSize: item?.fileSize,
        exists: item?.exists,
        danger: item?.danger,
        paused: item?.paused,
        canResume: item?.canResume,
        error: item?.error,
      })),
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_element_get_style(args: Record<string, unknown>): Promise<unknown> {
  const selector = args.selector as string;
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  const result = await execAllFramesPerFrame(tabId, {
    func: (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement;
      if (!el) return { error: "element not found" };
      return {
        ok: true,
        style: el.style.cssText,
        computedStyle: (() => {
          const styleObj: Record<string, string> = {};
          const computed = window.getComputedStyle(el);
          for (let i = 0; i < computed.length; i++) {
            const key = computed[i];
            styleObj[key] = computed.getPropertyValue(key);
          }
          return styleObj;
        })(),
      };
    },
    args: [selector],
  }, { perFrameMs: 1000 });
  const hit =
    result?.find((r: any) => r?.result && (r.result as any).ok)?.result
    || result?.find((r: any) => r?.result && (r.result as any).error)?.result
    || result?.[0]?.result;
  return hit;
}

async function browser_element_add_style(args: Record<string, unknown>): Promise<unknown> {
  const selectors = args.selectors as string[];
  const style = args.style as string;
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  const result = await execAllFramesPerFrame(tabId, {
    func: (selectors: string[], style: string) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement;
        if (!el) return { error: "element not found" };
        el.style.cssText = style;
      }
      return { ok: true };
    },
    args: [selectors, style],
  }, { perFrameMs: 1000 });
  const hit =
    result?.find((r: any) => r?.result && (r.result as any).ok)?.result
    || result?.find((r: any) => r?.result && (r.result as any).error)?.result
    || result?.[0]?.result;
  return hit;
}

async function browser_element_remove_style(args: Record<string, unknown>): Promise<unknown> {
  const selectors = args.selectors as string[];
  const tabId = await getTabIdByConversationId(args.conversationId as string);
  if (!tabId) return { error: "no tab" };
  const result = await execAllFramesPerFrame(tabId, {
    func: (selectors: string[]) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement;
        if (!el) return { error: "element not found" };
        el.style.cssText = "";
      }
      return { ok: true };
    },
    args: [selectors],
  }, { perFrameMs: 1000 });
  const hit =
    result?.find((r: any) => r?.result && (r.result as any).ok)?.result
    || result?.find((r: any) => r?.result && (r.result as any).error)?.result
    || result?.[0]?.result;
  return hit;
}

async function browser_user_data(): Promise<unknown> {
  try {
    const store = new TempDataStore();
    const records = await store.list();
    return {
      ok: true,
      data: records.map((r) => ({
        key: r.key,
        desc: (r.desc || "").trim() || r.key,
      })),
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function resolveStorePayload(args: Record<string, unknown>): unknown | undefined {
  if (Array.isArray(args.rows)) return args.rows;
  if (typeof args.text === "string") return args.text;
  if (args.data !== undefined) return args.data;
  return undefined;
}

async function browser_store_put(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = typeof args.conversationId === "string" ? args.conversationId.trim() : "";
  if (!conversationId) return { ok: false, error: "conversationId required" };
  const data = resolveStorePayload(args);
  if (data === undefined) return { ok: false, error: "rows or text required" };
  try {
    return await putAgentSessionStore({
      conversationId,
      data,
      storeId: typeof args.storeId === "string" ? args.storeId.trim() : undefined,
      desc: typeof args.desc === "string" ? args.desc.trim() : undefined,
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_store_append(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = typeof args.conversationId === "string" ? args.conversationId.trim() : "";
  const storeId = typeof args.storeId === "string" ? args.storeId.trim() : "";
  if (!conversationId) return { ok: false, error: "conversationId required" };
  if (!storeId) return { ok: false, error: "storeId required" };
  const data = resolveStorePayload(args);
  if (data === undefined) return { ok: false, error: "rows or text required" };
  try {
    return await appendAgentSessionStore({ conversationId, storeId, data });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_store_produce(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = typeof args.conversationId === "string" ? args.conversationId.trim() : "";
  const storeId = typeof args.storeId === "string" ? args.storeId.trim() : "";
  if (!conversationId) return { ok: false, error: "conversationId required" };
  if (!storeId) return { ok: false, error: "storeId required" };

  const deliveryRaw = typeof args.delivery === "string" ? args.delivery.trim().toLowerCase() : "display";
  const delivery = deliveryRaw === "download" ? "download" : "display";
  const fields = Array.isArray(args.fields)
    ? args.fields.filter((f): f is string => typeof f === "string")
    : undefined;

  try {
    const result = await produceAgentSessionStore({
      conversationId,
      storeId,
      format: typeof args.format === "string" ? args.format : undefined,
      fields,
      delivery,
      fileName: typeof args.fileName === "string" ? args.fileName : undefined,
      maxDisplayChars: typeof args.maxDisplayChars === "number" ? args.maxDisplayChars : undefined,
    });

    if (delivery === "download" && result.ok === true && typeof result.content === "string") {
      const fileName = typeof result.fileName === "string" ? result.fileName : "export.txt";
      const mimeType = typeof result.mimeType === "string" ? result.mimeType : "text/plain";
      const downloadResult = await browser_download_files({
        conversationId,
        fileInfoList: [{ fileName, content: result.content, mimeType }],
      });
      if (downloadResult && typeof downloadResult === "object" && (downloadResult as { ok?: boolean }).ok === false) {
        return downloadResult;
      }
      return {
        ok: true,
        delivery: "download",
        storeId,
        fileName,
        mimeType,
        bytes: result.bytes,
        itemCount: result.itemCount,
        downloaded: true,
        note: "File downloaded to user; do not repeat full content in assistant reply.",
      };
    }

    return result;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_spill_produce(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = typeof args.conversationId === "string" ? args.conversationId.trim() : "";
  const spillRef = typeof args.spillRef === "string" ? args.spillRef.trim() : "";
  if (!conversationId) return { ok: false, error: "conversationId required" };
  if (!spillRef) return { ok: false, error: "spillRef required" };

  const deliveryRaw = typeof args.delivery === "string" ? args.delivery.trim().toLowerCase() : "display";
  const delivery = deliveryRaw === "download" ? "download" : "display";
  const fields = Array.isArray(args.fields)
    ? args.fields.filter((f): f is string => typeof f === "string")
    : undefined;

  try {
    const result = await produceContextSpill({
      conversationId,
      spillRef,
      format: typeof args.format === "string" ? args.format : undefined,
      fields,
      path: typeof args.path === "string" ? args.path : undefined,
      delivery,
      fileName: typeof args.fileName === "string" ? args.fileName : undefined,
      maxDisplayChars: typeof args.maxDisplayChars === "number" ? args.maxDisplayChars : undefined,
    });

    if (delivery === "download" && result.ok === true && typeof result.content === "string") {
      const fileName = typeof result.fileName === "string" ? result.fileName : "export.txt";
      const mimeType = typeof result.mimeType === "string" ? result.mimeType : "text/plain";
      const downloadResult = await browser_download_files({
        conversationId,
        fileInfoList: [{ fileName, content: result.content, mimeType }],
      });
      if (downloadResult && typeof downloadResult === "object" && (downloadResult as { ok?: boolean }).ok === false) {
        return downloadResult;
      }
      return {
        ok: true,
        delivery: "download",
        spillRef,
        fileName,
        mimeType,
        bytes: result.bytes,
        itemCount: result.itemCount,
        kind: result.kind,
        downloaded: true,
        note: "File downloaded to user; do not repeat full content in assistant reply.",
      };
    }

    return result;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_spill_get(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = typeof args.conversationId === "string" ? args.conversationId.trim() : "";
  const spillRef = typeof args.spillRef === "string" ? args.spillRef.trim() : "";
  if (!conversationId) return { ok: false, error: "conversationId required" };
  if (!spillRef) return { ok: false, error: "spillRef required" };

  const modeRaw = typeof args.mode === "string" ? args.mode.trim() : "slice";
  const mode =
    modeRaw === "peek" || modeRaw === "tail" || modeRaw === "full" || modeRaw === "slice" || modeRaw === "grep"
      ? modeRaw
      : "slice";

  try {
    const fields = Array.isArray(args.fields)
      ? args.fields.filter((f): f is string => typeof f === "string")
      : undefined;
    return await readContextSpillSlice({
      conversationId,
      spillRef,
      mode,
      offset: typeof args.offset === "number" ? args.offset : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
      fields,
      pattern: typeof args.pattern === "string" ? args.pattern : undefined,
      contextChars: typeof args.contextChars === "number" ? args.contextChars : undefined,
      ignoreCase: args.ignoreCase === true,
      path: typeof args.path === "string" ? args.path : undefined,
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_get_upload_file(args: Record<string, unknown>): Promise<unknown> {
  const fileId = typeof args.fileId === "string" ? args.fileId.trim() : "";
  if (!fileId) return { ok: false, error: "fileId required" };
  const maxBytes =
    typeof args.maxBytes === "number" && Number.isFinite(args.maxBytes) ? Math.max(0, Math.floor(args.maxBytes)) : 6 * 1024 * 1024;
  const pageOpts = normalizeLinePageOptions({
    offset: typeof args.offset === "number" ? args.offset : undefined,
    limit: typeof args.limit === "number" ? args.limit : undefined,
  });
  const sheetIndex = typeof args.sheetIndex === "number" ? args.sheetIndex : undefined;
  const sheetName = typeof args.sheetName === "string" ? args.sheetName.trim() : undefined;

  try {
    const rec = await getUploadFile(fileId);
    if (!rec) return { ok: false, error: "file not found or expired", fileId };
    if (rec.size > maxBytes) {
      return { ok: false, error: `file too large (${rec.size} bytes)`, fileId, maxBytes };
    }

    const name = rec.name;
    const mimeType = rec.type || rec.blob.type || "application/octet-stream";

    if (isSpreadsheetUpload(name, mimeType)) {
      try {
        let parsedSheets = rec.parsedSheets;
        if (!parsedSheets?.length && (/\.csv$/i.test(name) || mimeType.toLowerCase().includes("csv"))) {
          parsedSheets = await csvBlobToStoredSheet(rec.blob, "Sheet1");
        }
        if (!parsedSheets?.length) {
          return {
            ok: false,
            error: "spreadsheet index missing, please re-upload the file",
            fileId,
            name,
          };
        }
        const page = paginateStoredSpreadsheet(parsedSheets, {
          offset: pageOpts.offset,
          limit: pageOpts.limit,
          sheetIndex,
          sheetName: sheetName || undefined,
        });
        if (!page || page.pagination.total === 0) {
          return { ok: false, error: "spreadsheet is empty or unreadable", fileId, name };
        }
        return {
          ok: true,
          fileId: rec.id,
          name,
          mimeType,
          size: rec.size,
          lastModified: rec.lastModified,
          type: "file",
          kind: "spreadsheet",
          sheetName: page.sheetName,
          sheetIndex: page.sheetIndex,
          totalSheets: page.totalSheets,
          sheetNames: page.sheetNames,
          columnCount: page.columnCount,
          pagination: page.pagination,
          rows: page.rows,
          text: page.text,
        };
      } catch (e) {
        return { ok: false, error: `failed to read spreadsheet: ${String(e)}`, fileId, name };
      }
    }

    if (isTextUpload(name, mimeType)) {
      const page = await readTextLinePage(rec.blob, pageOpts);
      return {
        ok: true,
        fileId: rec.id,
        name,
        mimeType,
        size: rec.size,
        lastModified: rec.lastModified,
        type: "file",
        kind: "text",
        pagination: page.pagination,
        lines: page.lines,
        text: page.text,
      };
    }

    const base64 = await blobToBase64(rec.blob);
    return {
      ok: true,
      fileId: rec.id,
      name,
      mimeType,
      size: rec.size,
      lastModified: rec.lastModified,
      base64,
      type: "file",
      kind: "binary",
    };
  } catch (e) {
    return { ok: false, error: String(e), fileId };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.onload = () => {
      const r = String(reader.result ?? "");
      // data:<mime>;base64,<data>
      const i = r.indexOf("base64,");
      resolve(i >= 0 ? r.slice(i + "base64,".length) : r);
    };
    reader.readAsDataURL(blob);
  });
}

// ========== 扩展 API 通用入口（chrome.* / browser.*） ==========

function getExtensionApiRoot(): any {
  // getContext() 已负责兼容 chrome.* / browser.*，这里直接复用即可
  return (getContext() as any).browser;
}

function listApiSurface(root: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!root || typeof root !== "object") return out;
  const namespaces = Object.keys(root).filter((k) => !!k && k !== "extension" && k !== "i18n");
  for (const ns of namespaces) {
    const v = root[ns];
    if (!v || typeof v !== "object") continue;
    const methods = Object.keys(v)
      .filter((m) => typeof v[m] === "function")
      .sort();
    if (methods.length) out[ns] = methods;
  }
  return out;
}

function isAllowedApiPath(path: string): boolean {
  // 最小可用白名单：避免直接暴露 cookies/management 等高风险能力
  return /^(tabs|runtime|storage|scripting|tabGroups|windows|action|notifications|alarms|bookmarks|history|webNavigation)\./.test(path);
}

/**
 * 静态调用 chrome.notifications，供商店权限扫描识别；
 * browser_extension_api 的 notifications.create 走此路径。
 */
async function createDesktopNotification(
  options: Record<string, unknown>,
  notificationId?: string,
): Promise<string> {
  const api = getContext().browser.notifications;
  if (!api?.create) throw new Error("notifications API unavailable");
  if (notificationId) {
    return (await api.create(notificationId, options)) as string;
  }
  return (await api.create(options)) as string;
}

async function callApiWithPromisify(fn: Function, thisArg: any, args: any[], timeoutMs: number): Promise<unknown> {
  // 1) 如果本身返回 Promise，直接 await
  try {
    const maybe = fn.apply(thisArg, args);
    if (maybe && typeof maybe === "object" && typeof (maybe as any).then === "function") {
      return await maybe;
    }
  } catch (e) {
    // 如果同步抛错，直接返回错误
    throw e;
  }

  // 2) 否则按 callback 风格处理：追加 callback，并读取 runtime.lastError
  const browser = getExtensionApiRoot();
  return await new Promise((resolve, reject) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, Math.max(1, timeoutMs));

    const cb = (...cbArgs: any[]) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      const lastError = browser?.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message || String(lastError)));
        return;
      }
      if (cbArgs.length <= 1) resolve(cbArgs[0]);
      else resolve(cbArgs);
    };

    try {
      fn.apply(thisArg, [...args, cb]);
    } catch (e) {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      reject(e);
    }
  });
}

async function browser_extension_api(args: Record<string, unknown>): Promise<unknown> {
  const op = typeof args.op === "string" ? args.op.trim() : "";
  const root = getExtensionApiRoot();
  if (!root) return { ok: false, error: "no extension api root found" };

  if (op === "list") {
    return { ok: true, namespaces: listApiSurface(root) };
  }

  if (op !== "call") {
    return { ok: false, error: 'op must be "list" or "call"' };
  }

  const path = typeof args.path === "string" ? args.path.trim() : "";
  if (!path) return { ok: false, error: "path required when op=call" };
  if (!isAllowedApiPath(path)) {
    return { ok: false, error: `api path not allowed: ${path}` };
  }

  const timeoutMs =
    typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs) ? Math.max(1, Math.floor(args.timeoutMs)) : 10_000;

  let callArgs: any[] = [];
  if (typeof args.argsJson === "string" && args.argsJson.trim()) {
    try {
      const parsed = JSON.parse(args.argsJson);
      callArgs = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      return { ok: false, error: `argsJson parse failed: ${String(e)}` };
    }
  }

  // 任务完成等桌面通知：走静态 notifications.create，便于商店权限审查识别
  if (path === "notifications.create") {
    try {
      let notificationId: string | undefined;
      let options: Record<string, unknown> | undefined;
      if (
        callArgs.length >= 2 &&
        typeof callArgs[0] === "string" &&
        callArgs[1] &&
        typeof callArgs[1] === "object"
      ) {
        notificationId = callArgs[0];
        options = callArgs[1] as Record<string, unknown>;
      } else if (callArgs[0] && typeof callArgs[0] === "object") {
        options = callArgs[0] as Record<string, unknown>;
      } else {
        return { ok: false, error: "notifications.create requires options object" };
      }
      const result = await createDesktopNotification(options, notificationId);
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  const parts = path.split(".").filter(Boolean);
  let cur: any = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (!cur || (typeof cur !== "object" && typeof cur !== "function")) {
      return { ok: false, error: `invalid api path at ${parts.slice(0, i).join(".")}` };
    }
    cur = cur[key];
  }

  if (typeof cur === "function") {
    const thisArg = parts.length >= 2 ? (root as any)[parts[0]] : root;
    try {
      const result = await callApiWithPromisify(cur, thisArg, callArgs, timeoutMs);
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // 非函数：返回属性快照
  try {
    return { ok: true, result: JSON.parse(JSON.stringify(cur)) };
  } catch {
    return { ok: true, result: String(cur) };
  }
}

async function browser_list_conversactions(args: Record<string, unknown>): Promise<unknown> {
  await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted);
  return { ok: true, conversations: listConversationContexts() };
}

async function browser_delete_conversactions(args: Record<string, unknown>): Promise<unknown> {
  await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted);
  const targetConversationIds = args.targetConversationIds as string[];
  const ids: string[] = [];
  for (const targetConversationId of targetConversationIds) {
    const id = typeof targetConversationId === "string" ? targetConversationId.trim() : "";
    if (!id) continue;
    ids.push(id);
    removeConversationContext(id);
    try {
      await deleteSpecAssetsByConversation(id);
    } catch (e) {
      console.warn("[browserTools] deleteSpecAssetsByConversation failed:", e);
    }
    try {
      await deleteExtensionAssetsByConversation(id);
    } catch (e) {
      console.warn("[browserTools] deleteExtensionAssetsByConversation failed:", e);
    }
    try {
      await deleteAgentSessionStoresByConversation(id);
    } catch (e) {
      console.warn("[browserTools] deleteAgentSessionStoresByConversation failed:", e);
    }
    try {
      await deleteContextSpillsByConversation(id);
    } catch (e) {
      console.warn("[browserTools] deleteContextSpillsByConversation failed:", e);
    }
  }
  // 消息库 / context usage 仅在侧栏删除，避免 SW 引用 chatStorage
  const side = await deleteConversationsInChatPanel(ids);
  if (!side.ok) {
    console.warn("[browserTools] side panel chatStorage delete failed:", side.error);
  }
  return { ok: true };
}


async function browser_get_conversaction(args: Record<string, unknown>): Promise<unknown> {
  await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted);
  const targetConversationId = args.targetConversationId as string;
  return { ok: true, conversation: getConversationContext(targetConversationId) };
}

async function browser_refresh_conversactions(_args: Record<string, unknown>): Promise<unknown> {
  const res = await refreshConversationsInChatPanel();
  if (!res.ok) return { ok: false, error: res.error || "side panel refresh failed" };
  return { ok: true };
}


async function browser_skill_image_recognition(args: Record<string, unknown>): Promise<unknown> {
  const imageUrl = typeof args.imageUrl === "string" ? args.imageUrl.trim() : "";
  const fileId = typeof args.fileId === "string" ? args.fileId.trim() : "";

  if (imageUrl && fileId) {
    return {
      ok: false,
      error: "Provide either imageUrl or fileId, not both. Use imageUrl for page/remote images; fileId only for user attachedFiles.",
    };
  }
  if (imageUrl) {
    return { ok: true, imageUrl, imageRecognition: true };
  }
  if (fileId) {
    const rec = await getUploadFile(fileId);
    if (rec?.blob) {
      const base64 = await blobToBase64(rec.blob);
      return {
        ok: true,
        imageUrl: `data:${rec.type || rec.blob.type || "application/octet-stream"};base64,${base64}`,
        imageRecognition: true,
        fileId: fileId
      };
    }
    return {
      ok: false,
      error: `fileId "${fileId}" not found or expired. Do not invent fileId. If the image is on the page or a remote URL, retry with imageUrl (img src). fileId is only for ids from user attachedFiles in the message.`,
    };
  }
  return {
    ok: false,
    error: "imageUrl or fileId required. Use imageUrl for page/remote images; fileId only for user upload attachedFiles ids.",
  };
}


/* [disabled 2026-06-18] browser_skill_background_browse — see disabledFeatures.record.md
function buildBackgroundBrowsePrompt(url: string, taskPrompt: string): string {
  const task = taskPrompt.trim();
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep raw url
  }

  return `<interactionBlock>
# 最优先使用以下上下文
## 约束
- 当前标签页已打开并加载：${url}
- 你已在 ${host} 目标页，禁止 browser_navigate / 新开标签再次打开同站；直接在当前页搜索、点击、阅读即可。
- 调用 browser_navigate 时，active 参数必须为 false。
## 收尾
- 任务完成后自动关闭当前 tab。
</interactionBlock>${task}`;
}

async function browser_skill_background_browse(args: Record<string, unknown>): Promise<unknown> {
  const url = args.url as string;
  const prompt = args.prompt as string;

  const conversationId = args.conversationId as string | undefined;
  console.log("[browserTools] browser_skill_background_browse called:", { url, prompt });
  
  if (!url) return { error: "url required" };
  if (!conversationId) return { error: "conversationId required" };

  const thinkId = newThinkId();
  const newTab = await getContext().browser.tabs.create({ url, active: false });
  getContext().browser.runtime.sendMessage({
    origin: "background",
    operate: "chat/runTabBackground",
    sourceConversationId: conversationId,
    newTabId: newTab.id,
    url: url,
    prompt: buildBackgroundBrowsePrompt(url, prompt),
    thinkId: thinkId,
  });

  return {
    ok: true,
    thinkId: thinkId,
    url: url,
    tabId: newTab.id,
  };
}
*/

// ========== UI 规格书元素截图（独立于 browser_screenshot / SoM） ==========

async function browser_capture_element_shot(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = args.conversationId as string | undefined;
  const selector = args.selector as string | undefined;
  const state = typeof args.state === "string" ? args.state.trim() : "";
  const componentId = typeof args.componentId === "string" ? args.componentId.trim() : undefined;
  const padding = typeof args.padding === "number" ? args.padding : 8;
  const maxWidth = typeof args.maxWidth === "number" ? args.maxWidth : 960;

  if (!conversationId) return { ok: false, error: "conversationId required" };
  if (!selector) return { ok: false, error: "selector required" };
  if (!state) return { ok: false, error: "state required (e.g. default, hover)" };

  const tabId = await getTabIdByConversationId(conversationId);
  if (!tabId) return { ok: false, error: "no tab" };

  const scrollRes = await scrollSelectorIntoView(tabId, selector);
  if ("error" in scrollRes) return { ok: false, error: scrollRes.error };

  await new Promise((r) => setTimeout(r, 150));

  const rectRes = await getSelectorRect(tabId, selector);
  if ("error" in rectRes) return { ok: false, error: rectRes.error };

  const viewport = await captureSpecViewportDataUrl(tabId);
  let viewportDataUrl: string;
  if ("error" in viewport) {
    const shot = await captureScreenshot(tabId, { maxWidth: 2400, grayscale: false });
    if ("error" in shot) return { ok: false, error: shot.error };
    viewportDataUrl = `data:${shot.mimeType};base64,${shot.base64}`;
  } else {
    viewportDataUrl = viewport.dataUrl;
  }

  const cropRes = await cropViewportToElement(tabId, viewportDataUrl, rectRes.rect, {
    padding,
    maxWidth,
    jpegQuality: 0.88,
  });
  if ("error" in cropRes) return { ok: false, error: cropRes.error };

  const assetId = createSpecAssetId();
  try {
    await putSpecAsset({
      id: assetId,
      conversationId,
      componentId,
      state,
      mimeType: "image/jpeg",
      blob: dataUrlToBlob(cropRes.dataUrl),
      width: cropRes.width,
      height: cropRes.height,
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const label = componentId ? `${componentId} ${state}` : state;
  return {
    ok: true,
    assetId,
    ref: `doma-spec:${assetId}`,
    markdown: `![${label}](doma-spec:${assetId})`,
    state,
    componentId,
    width: cropRes.width,
    height: cropRes.height,
  };
}

function normalizeExtensionFilePath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\\/g, "/");
}

async function browser_save_extension_files(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = typeof args.conversationId === "string" ? args.conversationId.trim() : "";
  if (!conversationId) return { ok: false, error: "conversationId required" };

  const name = toExtensionPackageSlug(String(args.name ?? ""));
  const displayTitle = toExtensionDisplayTitle(String(args.name ?? "") || name);
  const description = String(args.description ?? "").trim().slice(0, 1024);
  if (!name) return { ok: false, error: "name required" };
  if (!description) return { ok: false, error: "description required" };

  const filesRaw = Array.isArray(args.files) ? args.files : [];
  const files: Array<{ path: string; content: string }> = [];
  for (const item of filesRaw) {
    if (!item || typeof item !== "object") continue;
    const path = normalizeExtensionFilePath(String((item as { path?: unknown }).path ?? ""));
    const content = String((item as { content?: unknown }).content ?? "");
    if (!path || !content) continue;
    if (path.includes("..")) continue;
    files.push({ path, content });
  }
  if (!files.length) return { ok: false, error: "files required (non-empty path+content)" };

  let identity: Awaited<ReturnType<typeof generateExtensionIdentity>>;
  try {
    identity = await generateExtensionIdentity();
  } catch (e) {
    return { ok: false, error: `failed to generate extension key: ${String(e)}` };
  }

  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const manifestPath =
    [...byPath.keys()].find((p) => p === "manifest.json" || p.endsWith("/manifest.json")) ?? null;
  if (manifestPath) {
    try {
      byPath.set(manifestPath, injectManifestKey(byPath.get(manifestPath)!, identity.manifestKey));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  } else {
    const stubManifest = injectManifestKey(
      JSON.stringify(
        {
          name: displayTitle,
          description,
          version: "1.0.0",
          manifest_version: 3,
          action: { default_title: displayTitle },
          background: { service_worker: "background.js" },
          permissions: ["activeTab", "scripting"],
          host_permissions: ["<all_urls>"],
        },
        null,
        2,
      ),
      identity.manifestKey,
    );
    byPath.set("manifest.json", stubManifest);
  }

  {
    const mp =
      [...byPath.keys()].find((p) => p === "manifest.json" || p.endsWith("/manifest.json")) ??
      "manifest.json";
    byPath.set(mp, ensureManifestServiceWorker(byPath.get(mp)!, byPath.keys()));
    byPath.set(mp, injectManifestDisplayTitle(byPath.get(mp)!, displayTitle));
  }

  // 有 popup 时底部居中注入 Created by DomA（不依赖模型手写）
  for (const p of [...byPath.keys()]) {
    if (!/(^|\/)popup\.html$/i.test(p)) continue;
    byPath.set(p, injectPopupCreatedByFooter(byPath.get(p)!));
  }

  const packageIssues = validateExtensionPackage(byPath);
  if (packageIssues.length) {
    return {
      ok: false,
      error: "extension package validation failed",
      issues: packageIssues,
      hint: "按 issues[].message 修正对应文件后，重新调用 browser_save_extension_files。常见修复：manifest 加 background.service_worker；popup 用 sendMessage；background 用 onMessage.addListener 且异步 return true。",
    };
  }

  if (![...byPath.keys()].some((p) => /(^|\/)README\.md$/i.test(p))) {
    byPath.set(
      "README.md",
      [
        `# ${displayTitle}`,
        "",
        description,
        "",
        "## Install (Load unpacked)",
        "",
        "1. Open `chrome://extensions`",
        "2. Enable **Developer mode**",
        "3. Click **Load unpacked** and select this folder",
        "",
        `Extension ID (stable): \`${identity.extensionId}\``,
        "",
      ].join("\n"),
    );
  }

  const binaryAssets: Array<{ path: string; blob: Blob; mimeType: string }> = [];
  if (!packageHasIconFiles(byPath.keys())) {
    try {
      const icons = await generateDefaultExtensionIcons(name);
      if (icons) {
        const mp =
          [...byPath.keys()].find((p) => p === "manifest.json" || p.endsWith("/manifest.json")) ??
          "manifest.json";
        byPath.set(
          mp,
          injectManifestIcons(byPath.get(mp)!, icons.iconsField, icons.actionDefaultIcon),
        );
        for (const f of icons.files) {
          binaryAssets.push({ path: f.path, blob: f.blob, mimeType: "image/png" });
        }
      }
    } catch (e) {
      console.warn("[browser_save_extension_files] default icons failed", e);
    }
  }

  const assets: Array<{ id: string; path: string }> = [];
  try {
    for (const [path, content] of byPath) {
      const id = createExtensionAssetId();
      const mimeType = path.endsWith(".json")
        ? "application/json"
        : path.endsWith(".html")
          ? "text/html"
          : path.endsWith(".md")
            ? "text/markdown"
            : "text/javascript";
      await putExtensionAsset({
        id,
        conversationId,
        packageName: name,
        path,
        mimeType,
        blob: new Blob([content], { type: mimeType }),
      });
      assets.push({ id, path });
    }
    for (const bin of binaryAssets) {
      const id = createExtensionAssetId();
      await putExtensionAsset({
        id,
        conversationId,
        packageName: name,
        path: bin.path,
        mimeType: bin.mimeType,
        blob: bin.blob,
      });
      assets.push({ id, path: bin.path });
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const payload = {
    name: displayTitle,
    description,
    extensionId: identity.extensionId,
    assets,
  };
  const markdown = buildExtensionFenceMarkdown(payload);
  return {
    ok: true,
    ...payload,
    packageName: name,
    markdown,
    hint: "把返回的 markdown 原样输出给用户（瘦 ```extension 卡片）。不要再粘贴源码全文。",
  };
}

async function browser_invoke_agent_skill(args: Record<string, unknown>): Promise<unknown> {
  const skillName = String(args.skill_name ?? '').trim();
  if (!skillName) return { ok: false, error: 'skill_name is required' };

  await AgentSkillRegistry.ensureUserSkillsLoaded();
  const skill = AgentSkillRegistry.getSkillByName(skillName);
  if (!skill) {
    return { ok: false, error: `Skill 不存在: ${skillName}` };
  }
  if (skill.disableModelInvocation) {
    return {
      ok: false,
      error: `Skill "${skillName}" 仅支持手动 /${skillName} 调用（disable-model-invocation）`,
    };
  }

  return {
    ok: true,
    skill: skill.name,
    description: skill.description,
    instructions: skill.body,
    hint: 'Skill 已加载。请严格按 instructions 执行后续 browser 工具操作。',
  };
}

/** 上下文触顶摘要：校验 summary；真正清空 LLM history 由 ChatPanel / LlmService 处理 */
async function browser_conversation_summarized(args: Record<string, unknown>): Promise<unknown> {
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  if (!summary) {
    return { ok: false, error: "summary is required" };
  }
  return {
    ok: true,
    summary,
    hint: "摘要已接收。系统将清空旧上下文并仅保留该摘要后继续用户原请求。",
  };
}

async function browser_plan(args: Record<string, unknown>): Promise<unknown> {
  const planName = args.planName as string;
  if (!planName) return { ok: false, error: 'planName is required' };
  const stepList = args.stepList as string[];
  if (!stepList) return { ok: false, error: 'stepList is required' };
  const planId = args.planId as string;
  if (!planId) return { ok: false, error: 'planId is required' };

  const enrichedStepList = Array.isArray(stepList)
    ? stepList.map((raw, i) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const step = { ...(raw as Record<string, unknown>) };
        const id =
          typeof step.id === "string" && step.id.trim() ? step.id.trim() : `step-${i + 1}`;
        step.id = id;
        const suffix = `操作完成调用 browser_step_done({planId: "${planId}", stepId: "${id}", success: boolean}) 返回步骤结果`;
        const intent = typeof step.intent === "string" ? step.intent.trim() : "";
        step.intent = intent ? `${intent}。${suffix}` : suffix;
        return step;
      })
    : [];

  return {
    ok: true,
    planName,
    planId,
    stepList: enrichedStepList,
    instructions: `
    - 后续所有的操作必须按照 planId/planName 指定的步骤清单执行
    - 每个步骤操作完成必须调用 browser_step_done({planId: "${planId}", stepId: "step-x", success: boolean})
    - 在单个步骤内连续收到2次tool工具返回error:,ok: false, verified: false, 则调用 browser_step_done({planId: "${planId}", stepId: "step-x", success: false}) 告知失败`,
  };
}

async function browser_step_done(args: Record<string, unknown>): Promise<unknown> {
  const planId = args.planId as string;
  if (!planId) return { ok: false, error: 'planId is required' };
  const stepId = args.stepId as string;
  if (!stepId) return { ok: false, error: 'stepId is required' };
  const success = args.success as boolean;
  if (success === undefined) return { ok: false, error: 'success is required' };

  if (!success){
    return {
      ok: true,
      planId,
      stepId,
      instructions: `
      - 查找后续提到的操作失败的原因
      - 找到原因后不要自己重新尝试
      - 只需要要列出的这么做的原因，如果有原始数据可以一并给出
      - 询问用户下一步要怎么做
      `,
      success
    };
  }
  
  return { ok: true, planId, stepId, success };
}

async function browser_plan_questions(args: Record<string, unknown>): Promise<unknown> {
  const conversationId = args.conversationId as string | undefined;
  if (!conversationId?.trim()) return { ok: false, error: "conversationId is required" };

  const questionList = normalizePlanQuestionList(args.questionList);
  if (!questionList.length) return { ok: false, error: "questionList is required" };

  try {
    const panelResult = await requestPlanQuestionsFromChatPanel(conversationId.trim(), questionList);
    if (panelResult.skipped) {
      return { ok: true, content: "" };
    }
    return { ok: true, content: panelResult.content ?? "" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function browser_plan_cancel(args: Record<string, unknown>): Promise<unknown> {
  const planId = args.planId as string;
  const planName = args.planName as string;
  if (!planId) return { ok: false, error: 'planId is required' };
  if (!planName) return { ok: false, error: 'planName is required' };

  return { ok: true, instructions: `已取消规划的任务: ${planId}/${planName}, 直接结束当前对话。` };
}

function requestPlanQuestionsFromChatPanel(
  conversationId: string,
  questionList: PlanQuestionItem[],
): Promise<{ skipped: boolean; content?: string }> {
  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `plan-q-${Date.now()}`;

  return (async () => {
    const response = await sendToSidePanel<{ skipped?: boolean; content?: string }>(
      {
        operate: "chat/planQuestionsShow",
        conversationId,
        requestId,
        questionList,
      },
      // 等用户填完问卷，超时放宽
      { timeoutMs: 30 * 60_000 },
    );
        if (!response || typeof response !== "object") {
      throw new Error("plan questions: empty panel response");
    }
    return {
      skipped: response.skipped === true,
      ...(typeof response.content === "string" ? { content: response.content } : {}),
    };
  })();
}

async function browser_memory_upsert(args: Record<string, unknown>): Promise<unknown> {
  const key = typeof args.key === "string" ? args.key.trim() : "";
  const content = typeof args.content === "string" ? args.content.trim() : "";
  if (!key || !content) {
    return { ok: false, error: "key and content required" };
  }

  const sourceRaw = typeof args.source === "string" ? args.source.trim().toLowerCase() : "";
  if (sourceRaw !== "explicit" && sourceRaw !== "implicit") {
    return { ok: false, error: "source must be explicit or implicit" };
  }
  const source = sourceRaw as MemorySource;

  const scope = typeof args.scope === "string" ? args.scope.trim() : undefined;
  const categoryRaw = typeof args.category === "string" ? args.category.trim() : "";
  const allowedCats = new Set([
    "preference",
    "profile",
    "constraint",
    "site_habit",
    "other",
  ]);
  const category = allowedCats.has(categoryRaw)
    ? (categoryRaw as MemoryCategory)
    : undefined;

  let aliases: string[] | undefined;
  if (Array.isArray(args.aliases)) {
    aliases = args.aliases
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean);
  } else if (typeof args.aliases === "string" && args.aliases.trim()) {
    aliases = [args.aliases.trim()];
  }

  try {
    const item = await memoryWrite({
      key,
      content,
      scope,
      category,
      aliases,
      source,
    });
    return {
      ok: true,
      id: item.id,
      key: item.key,
      content: item.content,
      scope: item.scope,
      source: item.source,
      instruction: "记忆已写入。勿再次调用 browser_memory_upsert，除非用户本轮再次明确要求写入记忆。",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ========== 工具注册表 ==========

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  browser_extension_api: (args) => browser_extension_api(args),
  browser_get_current_tab: (args) => browser_get_current_tab(args),
  browser_get_tab: (args) => browser_get_tab(args),
  browser_list_tabs: (args) => browser_list_tabs(args),
  browser_navigate: (args) => browser_navigate(args),
  browser_close_tab: (args) => browser_close_tab(args),
  browser_reload_tab: (args) => browser_reload_tab(args),
  browser_call_tab: (args) => browser_call_tab(args),
  browser_click: (args) => browser_click(args),
  browser_type: (args) => browser_type(args),
  browser_scroll: (args) => browser_scroll(args),
  browser_get_page_content: (args) => browser_get_page_content(args),
  browser_get_elements: (args) => browser_get_elements(args),
  browser_wait: (args) => browser_wait(args),
  browser_execute_script: (args) => browser_execute_script(args),
  browser_hover: (args) => browser_hover(args),
  browser_hover_index: (args) => browser_hover_index(args),
  browser_highlight: (args) => browser_highlight(args),
  browser_drag: (args) => browser_drag(args),
  browser_drag_index: (args) => browser_drag_index(args),
  browser_select_option: (args) => browser_select_option(args),
  // browser_click_text: (args) => browser_click_text(args),
  browser_double_click: (args) => browser_double_click(args),
  browser_get_select_options: (args) => browser_get_select_options(args),
  browser_mouse_click: (args) => browser_mouse_click(args),
  browser_long_press: (args) => browser_long_press(args),
  browser_set_input_value: (args) => browser_set_input_value(args),
  browser_set_input_user_data: (args) => browser_set_input_user_data(args),
  browser_pick_date: (args) => browser_pick_date(args),
  browser_toggle_checkbox: (args) => browser_toggle_checkbox(args),
  browser_multi_select: (args) => browser_multi_select(args),
  browser_get_form_fields: (args) => browser_get_form_fields(args),
  browser_submit_form: (args) => browser_submit_form(args),
  browser_press_key: (args) => browser_press_key(args),
  browser_press_key_index: (args) => browser_press_key_index(args),
  browser_get_clipboard: () => browser_get_clipboard(),
  browser_set_clipboard: (args) => browser_set_clipboard(args),
  browser_screenshot: (args) => browser_screenshot(args),
  browser_screenshot_area: (args) => browser_screenshot_area(args),
  browser_capture_element_shot: (args) => browser_capture_element_shot(args),
  browser_save_extension_files: (args) => browser_save_extension_files(args),
  browser_click_index: (args) => browser_click_index2(args),
  browser_type_index: (args) => browser_type_index(args),
  browser_type_index_user_data: (args) => browser_type_index_user_data(args),
  browser_long_press_index: (args) => browser_long_press_index(args),
  browser_get_clean_html: (args) => browser_get_clean_html(args),
  browser_get_video_caption: (args) => browser_get_video_caption(args),
  browser_seek_video: (args) => browser_seek_video(args),
  browser_element_get_style: (args) => browser_element_get_style(args),
  browser_element_add_style: (args) => browser_element_add_style(args),
  browser_element_remove_style: (args) => browser_element_remove_style(args),
  browser_user_data: () => browser_user_data(),
  browser_store_put: (args) => browser_store_put(args),
  browser_store_append: (args) => browser_store_append(args),
  browser_store_produce: (args) => browser_store_produce(args),
  browser_spill_produce: (args) => browser_spill_produce(args),
  browser_spill_get: (args) => browser_spill_get(args),
  browser_get_upload_file: (args) => browser_get_upload_file(args),
  browser_list_conversactions: (args) => browser_list_conversactions(args),
  browser_delete_conversactions: (args) => browser_delete_conversactions(args),
  browser_get_conversaction: (args) => browser_get_conversaction(args),
  browser_refresh_conversactions: (args) => browser_refresh_conversactions(args),
  browser_download_files: (args) => browser_download_files(args),
  browser_html_to_pdf: (args) => browser_html_to_pdf(args),
  browser_write_workspace: (args) => browser_write_workspace(args),
  browser_cli_list: (args) => browser_cli_list(args),
  browser_cli_run: (args) => browser_cli_run(args),
  browser_cli_shell: (args) => browser_cli_shell(args),
  browser_download_search: (args) => browser_download_search(args),
  browser_list_iframes: (args) => browser_list_iframes(args),
  browser_get_iframe: (args) => browser_get_iframe(args),
  browser_skill_image_recognition: (args) => browser_skill_image_recognition(args),
  browser_invoke_agent_skill: (args) => browser_invoke_agent_skill(args),
  browser_conversation_summarized: (args) => browser_conversation_summarized(args),
  browser_memory_upsert: (args) => browser_memory_upsert(args),
  browser_plan: (args) => browser_plan(args),
  browser_step_done: (args) => browser_step_done(args),
  browser_plan_questions: (args) => browser_plan_questions(args),
  browser_plan_cancel: (args) => browser_plan_cancel(args),
  ...getEditionToolHandlers({
    getTabIdByConversationId,
  }),
};

export type ChatSlashCommandDef = {
  id: string;
  descriptionKey: string;
};

export type ChatSlashSkillDef = {
  id: string;
  name: string;
  descriptionKey?: string;
  description?: string;
  source?: 'builtin' | 'user' | 'hub';
};

/** 侧栏 `/` 斜杠命令列表（descriptionKey 在 UI 层走 i18n；Pro 命令由插槽注入） */
export function getCommands(): ChatSlashCommandDef[] {
  return [...getEditionSlashCommands()];
}

/** 侧栏 `/` Skills 列表（descriptionKey 在 UI 层走 i18n，否则用 frontmatter description） */
export async function getSkills(): Promise<ChatSlashSkillDef[]> {
  await AgentSkillRegistry.ensureUserSkillsLoaded();
  return AgentSkillRegistry.getCatalogEntries().map((entry) => ({
    id: entry.id,
    name: entry.name,
    descriptionKey: entry.descriptionKey,
    description: entry.description,
    source: entry.source,
  }));
}

export { saveUserSkillFromForm, deleteUserSkill, getUserSkillForEdit };

export async function runBrowserTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const toolArgs: Record<string, unknown> = { ...(args ?? {}) };
  const conversationId = toolArgs.conversationId as string | undefined;
  if (!conversationId) {
    return { error: "conversationId required" };
  }

  // if (automationHandler(name)) {
  //   await injectBreathingBorder(conversationId);
  // }
  console.log("runBrowserTool==================", name, toolArgs);
  const handler = TOOL_HANDLERS[name];
  if (!handler) return { error: `unknown tool: ${name}` };
  const result = await handler(toolArgs);
  // await injectBreathingBorder(conversationId, false);
  return result;
}
