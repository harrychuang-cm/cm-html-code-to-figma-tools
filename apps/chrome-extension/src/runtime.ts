import { summarizeDiagnostics } from "@figma-capture/capture-schema";
import {
  buildConfirmedExportPackage,
  buildMultiCaptureExportPackage,
  downloadFigcaptureArchive
} from "./capture-package.ts";
import { stitchScreenshotSegments } from "./stitch-screenshot.ts";
import { normalizeBreakpointWidths, breakpointLabel } from "./breakpoints.ts";
import { createDeviceEmulationSession } from "./device-emulation.ts";
import {
  captureVisibleScreenshot,
  callChromeApi,
  runtimeError,
  toRuntimeErrorPayload
} from "./screenshot.ts";

export const CAPTURE_ACTIVE_TAB_MESSAGE = "FIGCAPTURE_CAPTURE_ACTIVE_TAB";
export const EXPORT_CONFIRMED_MESSAGE = "FIGCAPTURE_EXPORT_CONFIRMED";
export const GET_PENDING_CAPTURE_MESSAGE = "FIGCAPTURE_GET_PENDING_CAPTURE";
export const CAPTURE_DOM_MESSAGE = "FIGCAPTURE_COLLECT_DOM";
export const PAGE_METRICS_MESSAGE = "FIGCAPTURE_PAGE_METRICS";
export const SCROLL_TO_MESSAGE = "FIGCAPTURE_SCROLL_TO";
export const SET_PINNED_HIDDEN_MESSAGE = "FIGCAPTURE_SET_PINNED_HIDDEN";
export const SELECT_ELEMENT_MESSAGE = "FIGCAPTURE_SELECT_ELEMENT";

export const MAX_FULL_PAGE_HEIGHT = 20000;
export const MAX_FULL_PAGE_SEGMENTS = 25;
export const MAX_CDP_SCREENSHOT_BITMAP_DIMENSION = 16384;
export const MAX_PREVIEW_SCREENSHOT_DATA_URL_BYTES = 8 * 1024 * 1024;

export const RUNTIME_ERROR_CATEGORIES = {
  MISSING_ACTIVE_TAB: "missing-active-tab",
  CAPTURE_SCRIPT_FAILED: "capture-script-failed",
  SCREENSHOT_FAILED: "screenshot-failed",
  PACKAGE_GENERATION_FAILED: "package-generation-failed",
  DOWNLOAD_FAILED: "download-failed",
  MISSING_PENDING_CAPTURE: "missing-pending-capture",
  ALL_BREAKPOINTS_FAILED: "all-breakpoints-failed"
};

let pendingCapture = null;

export function createChromeCaptureRuntime(options = {}) {
  const chromeApi = options.chromeApi ?? globalThis.chrome;
  const screenshotAdapter = options.screenshotAdapter ?? captureVisibleScreenshot;
  const packageBuilder = options.packageBuilder ?? buildConfirmedExportPackage;
  const multiPackageBuilder = options.multiPackageBuilder ?? buildMultiCaptureExportPackage;
  const assetResolver = options.assetResolver ?? createFetchAssetResolver();
  const downloader = options.downloader ?? downloadFigcaptureArchive;
  const contentMessage = options.contentMessage ?? sendContentCaptureMessage;
  const contentRequest = options.contentRequest ?? sendContentRequest;
  const stitcher = options.stitcher ?? stitchScreenshotSegments;
  const emulationFactory = options.emulationFactory ?? createDeviceEmulationSession;
  const previewScreenshotMaxBytes = options.previewScreenshotMaxBytes ?? MAX_PREVIEW_SCREENSHOT_DATA_URL_BYTES;
  const getPending = options.getPending ?? (() => pendingCapture);
  const setPending = options.setPending ?? ((value) => {
    pendingCapture = value;
  });

  async function buildPreviewResult(tab, capture, screenshotDataUrl, truncationWarning = null) {
    let previewPackage;
    try {
      previewPackage = await packageBuilder(capture, screenshotDataUrl, { assetResolver });
    } catch (error) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.PACKAGE_GENERATION_FAILED,
        error?.message ?? "Capture package could not be generated",
        error
      );
    }
    if (truncationWarning) {
      previewPackage.packageData.diagnostics.warnings.push(truncationWarning);
    }

    const preview = createPreviewPayload(capture, screenshotDataUrl, previewPackage.packageData.diagnostics, tab, {
      previewScreenshotMaxBytes
    });
    setPending({
      tab,
      capture,
      screenshotDataUrl,
      preview,
      truncationWarning
    });

    return {
      status: "ready",
      localFirst: true,
      tab,
      preview
    };
  }

  function visibleScreenshot(tab) {
    return screenshotAdapter(chromeApi, { tab });
  }

  function clipFor(width, height, x = 0, y = 0) {
    const w = Number(width);
    const h = Number(height);
    if (!(w > 0) || !(h > 0)) {
      return null;
    }
    return { x: Number(x) || 0, y: Number(y) || 0, width: w, height: h, scale: 1 };
  }

  // When a device-emulation override is active, the real viewport pixels live in
  // the debugger surface, not in the browser window that captureVisibleTab reads.
  // Capturing through the same CDP session with captureBeyondViewport + an explicit
  // clip renders exactly the reflowed region, so the screenshot matches the emulated
  // width and stays correct even when the emulated surface is mobile/zero-height
  // (which otherwise yields a blank image). Sessions without CDP screenshot support
  // (e.g. the single, non-emulated capture) fall back to the window grab.
  function screenshotFor(session) {
    if (session && typeof session.captureScreenshot === "function") {
      const fn = (_tab, clip) => session.captureScreenshot(
        clip ? { clip, captureBeyondViewport: true } : { captureBeyondViewport: false }
      );
      fn.supportsClip = true;
      return fn;
    }
    return visibleScreenshot;
  }

  async function captureSegmentScreenshot(tab, screenshot) {
    try {
      return await screenshot(tab);
    } catch {
      return await screenshot(tab);
    }
  }

  async function captureViewportOnce(tab, screenshot = visibleScreenshot) {
    const capture = await contentMessage(chromeApi, tab.id);
    const clip = clipFor(capture?.viewport?.width, capture?.viewport?.height);
    const screenshotDataUrl = await screenshot(tab, clip);
    return { capture, screenshotDataUrl, truncationWarning: null };
  }

  async function captureElementOnce(tab, screenshot = visibleScreenshot) {
    const selectionResponse = await contentRequest(chromeApi, tab.id, { type: SELECT_ELEMENT_MESSAGE });
    const selection = normalizeElementSelection(selectionResponse?.selection);
    const domResponse = await contentRequest(chromeApi, tab.id, {
      type: CAPTURE_DOM_MESSAGE,
      mode: "element",
      selection
    });
    if (!domResponse?.capture) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
        "Content runtime did not return selected element capture data"
      );
    }

    const screenshotDataUrl = await captureElementScreenshot(tab, selection, screenshot);
    return { capture: domResponse.capture, screenshotDataUrl, truncationWarning: null };
  }

  async function captureFullPageOnce(tab, screenshot = visibleScreenshot) {
    const metricsResponse = await contentRequest(chromeApi, tab.id, { type: PAGE_METRICS_MESSAGE });
    const metrics = metricsResponse?.metrics;
    if (!metrics?.viewport?.width || !metrics?.viewport?.height) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
        "Content runtime did not return page metrics"
      );
    }

    const plan = computeFullPageCapturePlan(metrics);
    const truncationWarning = plan.truncated
      ? `full-page capture truncated to ${plan.documentHeight}px of ${plan.rawDocumentHeight}px`
      : null;
    let capture;

    try {
      // Pre-scroll through the page to trigger lazy-loaded content, then collect
      // the full-page DOM tree.
      for (const offset of plan.segmentOffsets) {
        await contentRequest(chromeApi, tab.id, { type: SCROLL_TO_MESSAGE, scrollY: offset });
      }

      const domResponse = await contentRequest(chromeApi, tab.id, {
        type: CAPTURE_DOM_MESSAGE,
        mode: "full-page",
        documentWidth: plan.documentWidth,
        documentHeight: plan.documentHeight
      });
      if (!domResponse?.capture) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
          "Content runtime did not return capture data"
        );
      }
      capture = domResponse.capture;

      if (screenshot.supportsClip) {
        // Short CDP captures can render the whole emulated page in a single shot.
        // Tall pages must be clipped into slices because Chrome clamps very large
        // screenshot bitmaps; stretching the clamped bitmap distorts the source frame.
        await contentRequest(chromeApi, tab.id, { type: SCROLL_TO_MESSAGE, scrollY: 0 });
        if (shouldSegmentCdpFullPageCapture(plan, metrics.viewport)) {
          const segments = [];
          const clips = cdpFullPageClipSegments(plan, metrics.viewport);
          for (let index = 0; index < clips.length; index += 1) {
            const clip = clips[index];
            const dataUrl = await captureSegmentScreenshot(
              tab,
              () => screenshot(tab, clipFor(clip.width, clip.height, 0, clip.y))
            );
            segments.push({
              dataUrl,
              scrollY: clip.y,
              width: clip.width,
              height: clip.height
            });
            if (index === 0 && clips.length > 1) {
              await contentRequest(chromeApi, tab.id, { type: SET_PINNED_HIDDEN_MESSAGE, hidden: true });
            }
          }
          const screenshotDataUrl = await stitcher(segments, {
            documentWidth: plan.documentWidth,
            documentHeight: plan.documentHeight,
            devicePixelRatio: metrics.viewport.devicePixelRatio ?? 1,
            outputScale: 1
          });
          return { capture, screenshotDataUrl, truncationWarning };
        }
        const screenshotDataUrl = await screenshot(tab, clipFor(plan.documentWidth, plan.documentHeight));
        return { capture, screenshotDataUrl, truncationWarning };
      }

      const segments = [];
      for (let index = 0; index < plan.segmentOffsets.length; index += 1) {
        const scrollResponse = await contentRequest(chromeApi, tab.id, {
          type: SCROLL_TO_MESSAGE,
          scrollY: plan.segmentOffsets[index]
        });
        const dataUrl = await captureSegmentScreenshot(tab, screenshot);
        segments.push({
          dataUrl,
          scrollY: scrollResponse?.scrollY ?? plan.segmentOffsets[index]
        });
        if (index === 0 && plan.segmentOffsets.length > 1) {
          await contentRequest(chromeApi, tab.id, { type: SET_PINNED_HIDDEN_MESSAGE, hidden: true });
        }
      }

      const screenshotDataUrl = await stitcher(segments, {
        documentWidth: plan.documentWidth,
        documentHeight: plan.documentHeight,
        devicePixelRatio: metrics.viewport.devicePixelRatio ?? 1
      });
      return { capture, screenshotDataUrl, truncationWarning };
    } finally {
      await contentRequest(chromeApi, tab.id, { type: SET_PINNED_HIDDEN_MESSAGE, hidden: false })
        .catch(() => null);
      await contentRequest(chromeApi, tab.id, { type: SCROLL_TO_MESSAGE, scrollY: metrics.viewport.scrollY ?? 0 })
        .catch(() => null);
    }
  }

  async function captureElementScreenshot(tab, selection, screenshot) {
    const documentRect = selection.documentRect;
    const documentClip = clipFor(documentRect.width, documentRect.height, documentRect.x, documentRect.y);
    if (!documentClip) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
        "Selected element has no screenshot bounds"
      );
    }

    if (screenshot.supportsClip) {
      return screenshot(tab, documentClip);
    }

    const cdpScreenshot = await captureElementScreenshotWithDebugger(tab, documentClip).catch((error) => {
      return { error };
    });
    if (typeof cdpScreenshot === "string") {
      return cdpScreenshot;
    }

    const visibleDataUrl = await screenshot(tab);
    const croppedDataUrl = await cropScreenshotDataUrlToClip(visibleDataUrl, selection.rect, selection.viewport);
    if (croppedDataUrl) {
      return croppedDataUrl;
    }

    throw runtimeError(
      RUNTIME_ERROR_CATEGORIES.SCREENSHOT_FAILED,
      cdpScreenshot?.error?.message ?? "Could not capture the selected element screenshot",
      cdpScreenshot?.error
    );
  }

  async function captureElementScreenshotWithDebugger(tab, clip) {
    const session = emulationFactory(chromeApi, tab.id);
    try {
      await session.attach();
      if (typeof session.captureScreenshot !== "function") {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.SCREENSHOT_FAILED,
          "Chrome debugger screenshot API is unavailable for selected element capture"
        );
      }
      return await session.captureScreenshot({ clip, captureBeyondViewport: true });
    } finally {
      if (typeof session.detach === "function") {
        await session.detach().catch(() => null);
      }
    }
  }

  function captureOnce(tab, captureMode, screenshot = visibleScreenshot) {
    if (captureMode === "full-page") {
      return captureFullPageOnce(tab, screenshot);
    }
    if (captureMode === "element") {
      return captureElementOnce(tab, screenshot);
    }
    return captureViewportOnce(tab, screenshot);
  }

  async function captureBreakpoints(tab, widths, captureMode) {
    const session = emulationFactory(chromeApi, tab.id);
    const screenshot = screenshotFor(session);
    const breakpoints = [];
    const failures = [];

    try {
      await session.attach();
      for (const width of widths) {
        try {
          await session.setWidth(width);
          const single = await captureOnce(tab, captureMode, screenshot);
          breakpoints.push({
            width,
            label: breakpointLabel(width),
            capture: single.capture,
            screenshotDataUrl: single.screenshotDataUrl,
            truncationWarning: single.truncationWarning
          });
        } catch (error) {
          failures.push({ width, message: error?.message ?? "Breakpoint capture failed" });
        } finally {
          await session.clear();
        }
      }
    } finally {
      await session.detach();
    }

    if (breakpoints.length === 0) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.ALL_BREAKPOINTS_FAILED,
        failures[0]?.message ?? "No breakpoint could be captured"
      );
    }

    return buildMultiPreviewResult(tab, breakpoints, failures);
  }

  async function buildMultiPreviewResult(tab, breakpoints, failures) {
    let previewPackage;
    try {
      previewPackage = await multiPackageBuilder(breakpoints, { assetResolver });
    } catch (error) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.PACKAGE_GENERATION_FAILED,
        error?.message ?? "Capture package could not be generated",
        error
      );
    }

    const captureEntries = previewPackage.packageData.captures;
    const primary = captureEntries[0];
    const preview = {
      ...createPreviewPayload(
        primary.packageData.capture,
        breakpoints[0].screenshotDataUrl,
        primary.packageData.diagnostics,
        tab,
        { previewScreenshotMaxBytes }
      ),
      multiCapture: true,
      breakpoints: captureEntries.map((entry, index) => ({
        width: entry.width,
        label: entry.label,
        viewport: {
          width: entry.packageData.capture.viewport.width,
          height: entry.packageData.capture.viewport.height
        },
        captureMode: entry.packageData.capture.captureMode ?? "viewport",
        diagnostics: entry.packageData.diagnostics,
        diagnosticsSummary: summarizeDiagnostics(entry.packageData.diagnostics)
      })),
      failures
    };

    setPending({
      tab,
      multiCapture: true,
      breakpoints,
      preview
    });

    return {
      status: "ready",
      localFirst: true,
      tab,
      preview
    };
  }

  return {
    async captureActiveTab(captureOptions = {}) {
      const tab = await resolveActiveTab(chromeApi);
      const captureMode = normalizeCaptureMode(captureOptions.captureMode);

      const widths = captureMode === "element"
        ? []
        : normalizeBreakpointWidths(captureOptions.breakpointWidths ?? []);
      if (widths.length > 0) {
        return captureBreakpoints(tab, widths, captureMode);
      }

      const single = await captureOnce(tab, captureMode);
      return buildPreviewResult(tab, single.capture, single.screenshotDataUrl, single.truncationWarning);
    },

    async confirmExport() {
      const pending = getPending();
      if (!pending) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.MISSING_PENDING_CAPTURE,
          "Run capture preview before confirming export"
        );
      }

      let exportPackage;
      try {
        exportPackage = pending.multiCapture
          ? await multiPackageBuilder(pending.breakpoints, { assetResolver })
          : await packageBuilder(pending.capture, pending.screenshotDataUrl, { assetResolver });
      } catch (error) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.PACKAGE_GENERATION_FAILED,
          error?.message ?? "Capture package could not be generated",
          error
        );
      }
      if (!pending.multiCapture && pending.truncationWarning) {
        exportPackage.packageData.diagnostics.warnings.push(pending.truncationWarning);
      }

      let downloadId;
      try {
        downloadId = await downloader(chromeApi, exportPackage);
      } catch (error) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.DOWNLOAD_FAILED,
          error?.message ?? "Capture package could not be downloaded",
          error
        );
      }

      setPending(null);
      return {
        status: "downloaded",
        filename: exportPackage.filename,
        downloadId
      };
    },

    getPendingPreview() {
      const pending = getPending();
      if (!pending?.preview) {
        return { status: "empty" };
      }
      return {
        status: "ready",
        localFirst: true,
        tab: pending.tab,
        preview: pending.preview
      };
    }
  };
}

export function computeFullPageCapturePlan(metrics, limits = {}) {
  const maxHeight = limits.maxHeight ?? MAX_FULL_PAGE_HEIGHT;
  const maxSegments = limits.maxSegments ?? MAX_FULL_PAGE_SEGMENTS;
  const viewportHeight = Math.max(1, Number(metrics.viewport?.height ?? 0));
  const documentWidth = Math.max(Number(metrics.documentWidth ?? 0), Number(metrics.viewport?.width ?? 0));
  const rawDocumentHeight = Math.max(Number(metrics.documentHeight ?? 0), viewportHeight);
  const heightLimit = Math.min(maxHeight, maxSegments * viewportHeight);
  const documentHeight = Math.min(rawDocumentHeight, heightLimit);

  const segmentOffsets = [];
  for (let offset = 0; offset + viewportHeight < documentHeight; offset += viewportHeight) {
    segmentOffsets.push(offset);
  }
  const lastOffset = Math.max(0, documentHeight - viewportHeight);
  if (segmentOffsets[segmentOffsets.length - 1] !== lastOffset) {
    segmentOffsets.push(lastOffset);
  }
  if (segmentOffsets.length === 0) {
    segmentOffsets.push(0);
  }

  return {
    documentWidth,
    documentHeight,
    rawDocumentHeight,
    truncated: documentHeight < rawDocumentHeight,
    segmentOffsets
  };
}

export function normalizeCaptureMode(value) {
  return value === "full-page" || value === "element" ? value : "viewport";
}

export function normalizeElementSelection(selection = {}) {
  const rect = normalizeSelectionRect(selection.rect, "Selected element viewport bounds are missing");
  const documentRect = normalizeSelectionRect(
    selection.documentRect ?? {
      x: rect.x + Number(selection.viewport?.scrollX ?? 0),
      y: rect.y + Number(selection.viewport?.scrollY ?? 0),
      width: rect.width,
      height: rect.height
    },
    "Selected element document bounds are missing"
  );
  const viewport = {
    width: Number(selection.viewport?.width ?? 0),
    height: Number(selection.viewport?.height ?? 0),
    devicePixelRatio: Number(selection.viewport?.devicePixelRatio ?? 1) || 1,
    scrollX: Number(selection.viewport?.scrollX ?? 0) || 0,
    scrollY: Number(selection.viewport?.scrollY ?? 0) || 0
  };
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw runtimeError(
      RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
      "Selected element viewport metadata is missing"
    );
  }
  return {
    ...selection,
    rect,
    documentRect,
    viewport
  };
}

function normalizeSelectionRect(rect = {}, message) {
  const normalized = {
    x: Number(rect.x ?? rect.left ?? 0) || 0,
    y: Number(rect.y ?? rect.top ?? 0) || 0,
    width: Number(rect.width ?? 0),
    height: Number(rect.height ?? 0)
  };
  if (!(normalized.width > 0) || !(normalized.height > 0)) {
    throw runtimeError(RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED, message);
  }
  return normalized;
}

export function shouldSegmentCdpFullPageCapture(plan = {}, viewport = {}, limits = {}) {
  const maxBitmapDimension = limits.maxBitmapDimension ?? MAX_CDP_SCREENSHOT_BITMAP_DIMENSION;
  const dpr = Number(viewport.devicePixelRatio ?? 1) || 1;
  const width = Number(plan.documentWidth ?? 0);
  const height = Number(plan.documentHeight ?? 0);
  return width * dpr > maxBitmapDimension || height * dpr > maxBitmapDimension;
}

export async function cropScreenshotDataUrlToClip(screenshotDataUrl, clip = {}, viewport = {}) {
  if (
    typeof screenshotDataUrl !== "string" ||
    !screenshotDataUrl.startsWith("data:image/") ||
    typeof globalThis.createImageBitmap !== "function" ||
    typeof globalThis.OffscreenCanvas !== "function" ||
    typeof globalThis.Blob !== "function"
  ) {
    return null;
  }

  const bitmap = await decodeScreenshotDataUrlBitmap(screenshotDataUrl);
  if (!bitmap?.width || !bitmap?.height) {
    return null;
  }

  try {
    const crop = screenshotCropRectForBitmap(clip, viewport, bitmap);
    if (crop.width <= 0 || crop.height <= 0) {
      return null;
    }
    const canvas = new globalThis.OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext?.("2d");
    if (!context?.drawImage || typeof canvas.convertToBlob !== "function") {
      return null;
    }
    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return await blobToDataUrl(blob);
  } finally {
    bitmap.close?.();
  }
}

export function cdpFullPageClipSegments(plan = {}, viewport = {}, limits = {}) {
  const maxBitmapDimension = limits.maxBitmapDimension ?? MAX_CDP_SCREENSHOT_BITMAP_DIMENSION;
  const dpr = Number(viewport.devicePixelRatio ?? 1) || 1;
  const documentWidth = Math.max(1, Number(plan.documentWidth ?? viewport.width ?? 0));
  const documentHeight = Math.max(1, Number(plan.documentHeight ?? viewport.height ?? 0));
  const viewportHeight = Math.max(1, Number(viewport.height ?? documentHeight));
  const maxCssHeightForBitmap = Math.max(1, Math.floor(maxBitmapDimension / Math.max(dpr, 1)));
  const segmentHeight = Math.max(1, Math.min(viewportHeight, maxCssHeightForBitmap, documentHeight));
  const segments = [];
  for (let y = 0; y < documentHeight; y += segmentHeight) {
    segments.push({
      x: 0,
      y,
      width: documentWidth,
      height: Math.min(segmentHeight, documentHeight - y)
    });
  }
  return segments;
}

export function createFetchAssetResolver(fetchImpl = globalThis.fetch?.bind(globalThis)) {
  return async function resolveAsset(source) {
    if (!fetchImpl) {
      throw new Error("Fetch API is unavailable for asset capture");
    }
    const response = await fetchImpl(source.url, {
      credentials: "include",
      cache: "force-cache"
    });
    if (!response?.ok) {
      throw new Error(`Asset request failed: ${response?.status ?? "unknown"}`);
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers?.get?.("content-type") ?? ""
    };
  };
}

export async function resolveActiveTab(chromeApi = globalThis.chrome) {
  if (!chromeApi?.tabs?.query) {
    throw runtimeError(
      RUNTIME_ERROR_CATEGORIES.MISSING_ACTIVE_TAB,
      "Chrome tabs API is unavailable"
    );
  }

  const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.id) {
    throw runtimeError(
      RUNTIME_ERROR_CATEGORIES.MISSING_ACTIVE_TAB,
      "No active tab is available for capture"
    );
  }

  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? ""
  };
}

export async function sendContentCaptureMessage(chromeApi, tabId) {
  const response = await sendContentRequest(chromeApi, tabId, { type: CAPTURE_DOM_MESSAGE });
  if (!response?.capture) {
    throw runtimeError(
      RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
      "Content runtime did not return capture data"
    );
  }
  return response.capture;
}

export async function sendContentRequest(chromeApi, tabId, message) {
  try {
    return await requestContentResponse(chromeApi, tabId, message);
  } catch (firstError) {
    if (!chromeApi?.scripting?.executeScript) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
        firstError?.message ?? "Content capture script failed",
        firstError
      );
    }

    try {
      await chromeApi.scripting.executeScript({
        target: { tabId },
        files: ["content-script.js"]
      });
      return await requestContentResponse(chromeApi, tabId, message);
    } catch (error) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
        error?.message ?? "Content capture script failed",
        error
      );
    }
  }
}

export async function handleCaptureActiveTab(chromeApi = globalThis.chrome, options = {}) {
  try {
    return await createChromeCaptureRuntime({ chromeApi, ...options })
      .captureActiveTab({
        captureMode: options.captureMode,
        breakpointWidths: options.breakpointWidths
      });
  } catch (error) {
    return {
      status: "error",
      error: toRuntimeErrorPayload(error, RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED)
    };
  }
}

export async function handleConfirmExport(chromeApi = globalThis.chrome, options = {}) {
  try {
    return await createChromeCaptureRuntime({ chromeApi, ...options }).confirmExport();
  } catch (error) {
    return {
      status: "error",
      error: toRuntimeErrorPayload(error, RUNTIME_ERROR_CATEGORIES.DOWNLOAD_FAILED)
    };
  }
}

export async function handleGetPendingCapture(chromeApi = globalThis.chrome, options = {}) {
  try {
    return createChromeCaptureRuntime({ chromeApi, ...options }).getPendingPreview();
  } catch (error) {
    return {
      status: "error",
      error: toRuntimeErrorPayload(error, RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED)
    };
  }
}

export function createPreviewPayload(capture, screenshotDataUrl, diagnostics, tab = {}, options = {}) {
  const summary = summarizeDiagnostics(diagnostics);
  const previewScreenshot = boundedPreviewScreenshotDataUrl(screenshotDataUrl, options);
  const captureMode = normalizeCaptureMode(capture.captureMode);
  const payload = {
    sourceUrl: capture.sourceUrl || tab.url || "",
    viewport: {
      width: capture.viewport.width,
      height: capture.viewport.height,
      devicePixelRatio: capture.viewport.devicePixelRatio,
      scrollX: capture.viewport.scrollX,
      scrollY: capture.viewport.scrollY
    },
    diagnostics,
    diagnosticsSummary: summary,
    packageGenerationStatus: "ready",
    packageStatus: "ready",
    screenshotPreviewStatus: previewScreenshot ? "ready" : "omitted",
    ...(captureMode === "full-page"
      ? {
        captureMode: "full-page",
        documentWidth: capture.documentWidth,
        documentHeight: capture.documentHeight
      }
      : captureMode === "element"
        ? { captureMode: "element" }
      : { captureMode: "viewport" })
  };
  if (previewScreenshot) {
    payload.screenshotDataUrl = previewScreenshot;
    payload.screenshotUrl = previewScreenshot;
  }
  return payload;
}

function boundedPreviewScreenshotDataUrl(screenshotDataUrl, options = {}) {
  if (typeof screenshotDataUrl !== "string" || !screenshotDataUrl.startsWith("data:image/")) {
    return null;
  }
  const maxBytes = normalizePreviewScreenshotMaxBytes(options.previewScreenshotMaxBytes);
  // Screenshot data URLs are ASCII base64; length is a tight byte estimate and
  // avoids allocating a second giant string just to measure UTF-8 size.
  if (screenshotDataUrl.length > maxBytes) {
    return null;
  }
  return screenshotDataUrl;
}

function normalizePreviewScreenshotMaxBytes(value) {
  const maxBytes = Number(value);
  if (Number.isFinite(maxBytes) && maxBytes >= 0) {
    return Math.floor(maxBytes);
  }
  return MAX_PREVIEW_SCREENSHOT_DATA_URL_BYTES;
}

async function decodeScreenshotDataUrlBitmap(dataUrl) {
  let blob = null;
  if (typeof globalThis.fetch === "function") {
    try {
      blob = await (await globalThis.fetch(dataUrl)).blob();
    } catch {
      blob = null;
    }
  }
  if (!blob) {
    blob = new globalThis.Blob([dataUrlToBytes(dataUrl)], {
      type: dataUrlMediaType(dataUrl) || "image/png"
    });
  }
  return globalThis.createImageBitmap(blob);
}

function screenshotCropRectForBitmap(rect = {}, viewport = {}, bitmap = {}) {
  const viewportWidth = Number(viewport.width ?? bitmap.width ?? 0);
  const viewportHeight = Number(viewport.height ?? bitmap.height ?? 0);
  const scaleX = viewportWidth > 0 ? bitmap.width / viewportWidth : 1;
  const scaleY = viewportHeight > 0 ? bitmap.height / viewportHeight : 1;
  const left = Math.max(0, Math.round(Number(rect.x ?? 0) * scaleX));
  const top = Math.max(0, Math.round(Number(rect.y ?? 0) * scaleY));
  const right = Math.min(bitmap.width, Math.round((Number(rect.x ?? 0) + Number(rect.width ?? 0)) * scaleX));
  const bottom = Math.min(bitmap.height, Math.round((Number(rect.y ?? 0) + Number(rect.height ?? 0)) * scaleY));

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

async function blobToDataUrl(blob) {
  return `data:${blob.type || "image/png"};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
}

function dataUrlToBytes(dataUrl) {
  const [, payload = ""] = String(dataUrl).split(",");
  if (typeof atob === "function") {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return Uint8Array.from(Buffer.from(payload, "base64"));
}

function dataUrlMediaType(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+)/);
  return match?.[1] ?? "";
}

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.slice(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

async function requestContentResponse(chromeApi, tabId, message) {
  if (!chromeApi?.tabs?.sendMessage) {
    throw new Error("Chrome tab messaging API is unavailable");
  }

  const response = await callChromeApi(
    chromeApi.tabs.sendMessage,
    chromeApi.tabs,
    [tabId, message],
    chromeApi
  );

  if (response?.status !== "success") {
    const errorMessage = response?.error?.message ?? "Content runtime did not return capture data";
    throw runtimeError(RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED, errorMessage);
  }

  return response;
}
