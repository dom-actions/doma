/**
 * 后台 tab viewport 截图（html2canvas）。
 * 由 manifest content_scripts 注入；SW/browserTools 通过 chat/captureViewport 调用。
 * SoM 编号由 browserTools 收集几何后在截图压缩阶段 Canvas 合成（som-post-composite-v1）；
 * 本脚本只负责截取当前 viewport（干净页面，无 #__som-container）。
 */
import html2canvas from "html2canvas";

const ext = typeof chrome !== "undefined" ? chrome : browser;

const CAPTURE_VIEWPORT_OPERATE = "chat/captureViewport";
const REGISTRY_KEY = "__domaScreenshotCaptureRegistered";
const CAPTURE_IGNORED_TAGS = new Set(["SCRIPT", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED"]);

function shouldIgnoreCaptureElement(element) {
  if (CAPTURE_IGNORED_TAGS.has(element.tagName)) return true;
  if (element.tagName !== "LINK") return false;

  const rel = element.relList;
  return (
    element.as?.toLowerCase() === "script" ||
    rel?.contains("modulepreload") ||
    rel?.contains("preload") ||
    rel?.contains("prefetch")
  );
}

async function captureViewportDataUrl(jpegQuality) {
  if (window !== window.top) {
    throw new Error("capture only supported in top frame");
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 0 || h <= 0) {
    throw new Error("invalid viewport size");
  }

  console.log("[Screenshot/contentScript] captureViewport start", {
    url: location.href,
    w,
    h,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    dpr: window.devicePixelRatio || 1,
  });

  const canvas = await html2canvas(document.documentElement, {
    x: window.scrollX,
    y: window.scrollY,
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
    useCORS: true,
    allowTaint: false,
    // 克隆页面时避免 iframe 导航或脚本预加载在扩展源下触发 CSP/重复执行。
    ignoreElements: shouldIgnoreCaptureElement,
    // 后台 tab 降采样，减轻限速页面上 html2canvas 挂起
    scale: Math.min(window.devicePixelRatio || 1, 1),
    logging: false,
  });

  const q = Number.isFinite(jpegQuality) ? Math.min(1, Math.max(0.1, jpegQuality)) : 0.7;
  return canvas.toDataURL("image/jpeg", q);
}

const CAPTURE_VIEWPORT_TIMEOUT_MS = 45_000;

async function captureViewportDataUrlWithTimeout(jpegQuality) {
  let timer;
  try {
    return await Promise.race([
      captureViewportDataUrl(jpegQuality),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("capture viewport timeout")),
          CAPTURE_VIEWPORT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

if (!globalThis[REGISTRY_KEY]) {
  globalThis[REGISTRY_KEY] = true;
  globalThis.__domaCaptureViewport = captureViewportDataUrlWithTimeout;

  ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.operate !== CAPTURE_VIEWPORT_OPERATE) return;
    if (window !== window.top) return;

    if (message.ping) {
      sendResponse({ pong: true });
      return true;
    }

    const startedAt = performance.now();
    const quality =
      typeof message.quality === "number" && Number.isFinite(message.quality)
        ? message.quality / 100
        : 0.7;

    void captureViewportDataUrlWithTimeout(quality)
      .then((dataUrl) => {
        const elapsedMs = Math.round(performance.now() - startedAt);
        console.log("[Screenshot/contentScript] captureViewport ok", {
          url: location.href,
          elapsedMs,
          dataUrlLen: dataUrl.length,
        });
        sendResponse({ ok: true, dataUrl, captureSource: "contentScript", elapsedMs });
      })
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err);
        const elapsedMs = Math.round(performance.now() - startedAt);
        console.warn("[Screenshot/contentScript] captureViewport failed", {
          url: location.href,
          elapsedMs,
          error,
        });
        sendResponse({
          ok: false,
          error,
          elapsedMs,
        });
      });

    return true;
  });
}
