import {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  EXPORT_CONFIRMED_MESSAGE,
  GET_PENDING_CAPTURE_MESSAGE
} from "./runtime.ts";
import { summarizeDiagnostics } from "@figma-capture/capture-schema";
import {
  normalizeBreakpointWidths,
  parseCustomBreakpointWidth
} from "./breakpoints.ts";

export function connectPopup(documentRef = globalThis.document, chromeApi = globalThis.chrome) {
  const button = documentRef?.getElementById("capture-button");
  const status = documentRef?.getElementById("capture-status");
  const downloadButton = documentRef?.getElementById("download-button");
  const addBreakpointButton = documentRef?.getElementById("add-breakpoint-button");
  const captureModeInputs = documentRef?.querySelectorAll?.("input[name='capture-mode']") ?? [];

  for (const input of Array.from(captureModeInputs)) {
    input.addEventListener?.("change", () => updateCaptureModeUi(documentRef));
  }
  updateCaptureModeUi(documentRef);
  restorePendingPreview(documentRef, chromeApi);

  addBreakpointButton?.addEventListener("click", () => {
    const input = documentRef.getElementById("custom-breakpoint-input");
    const result = addCustomBreakpoint(documentRef, input?.value);
    if (result.ok && input) {
      input.value = "";
    }
  });

  button?.addEventListener("click", async () => {
    const captureMode = selectedCaptureMode(documentRef);
    const breakpointWidths = captureMode === "element" ? [] : selectedBreakpointWidths(documentRef);
    if (captureMode !== "element" && breakpointWidths.length === 0) {
      setCaptureState(documentRef, "error", "Select at least one breakpoint before capturing");
      return;
    }

    setCaptureState(
      documentRef,
      "working",
      captureMode === "element"
        ? "Select an element on the page…"
        : `Capturing ${breakpointWidths.length} breakpoint(s): ${breakpointWidths.join(", ")}px…`
    );
    setCaptureProgressVisible(documentRef, true);
    setDownloadEnabled(downloadButton, false);
    try {
      const response = await chromeApi.runtime.sendMessage({
        type: CAPTURE_ACTIVE_TAB_MESSAGE,
        captureMode,
        breakpointWidths
      });
      if (response?.status === "error") {
        renderRuntimeError(documentRef, response.error);
        return;
      }
      setCaptureProgressVisible(documentRef, false);
      setCaptureState(documentRef, "success", `Captured ${response.tab.title || response.tab.url}`);
      if (response.preview) {
        renderCapturePreview(documentRef, response.preview);
      }
    } catch (error) {
      setCaptureProgressVisible(documentRef, false);
      setCaptureState(documentRef, "error", error.message);
    }
  });

  downloadButton?.addEventListener("click", async () => {
    setCaptureState(documentRef, "working", "Preparing .figcapture…");
    setCaptureProgressVisible(documentRef, true);
    setDownloadEnabled(downloadButton, false);
    try {
      const response = await chromeApi.runtime.sendMessage({ type: EXPORT_CONFIRMED_MESSAGE });
      if (response?.status === "error") {
        renderRuntimeError(documentRef, response.error);
        return;
      }
      setCaptureProgressVisible(documentRef, false);
      setCaptureState(documentRef, "success", `Downloaded ${response.filename}`);
      setDownloadEnabled(downloadButton, true);
    } catch (error) {
      setCaptureProgressVisible(documentRef, false);
      setCaptureState(documentRef, "error", error.message);
    }
  });
}

async function restorePendingPreview(documentRef, chromeApi) {
  if (typeof chromeApi?.runtime?.sendMessage !== "function") {
    return;
  }
  try {
    const response = await chromeApi.runtime.sendMessage({ type: GET_PENDING_CAPTURE_MESSAGE });
    if (response?.status !== "ready" || !response.preview) {
      return;
    }
    renderCapturePreview(documentRef, response.preview);
    setCaptureState(documentRef, "success", `Captured ${response.tab?.title || response.tab?.url || response.preview.sourceUrl}`);
  } catch {
    // Pending preview restoration is opportunistic; normal capture still works.
  }
}

function setCaptureState(documentRef, state, message) {
  const row = documentRef?.getElementById?.("capture-status-row");
  if (row?.setAttribute) {
    row.setAttribute("data-state", state);
  }
  setText(documentRef, "capture-status", message);
}

function setCaptureProgressVisible(documentRef, visible) {
  const progress = documentRef?.getElementById?.("capture-progress");
  if (progress) {
    progress.hidden = !visible;
  }
}

export function describePopupRuntime() {
  return {
    previewBeforeDownload: true,
    credentialFields: []
  };
}

export function createValidationSummary(diagnostics, packageGenerationStatus) {
  const summary = summarizeDiagnostics(diagnostics);
  return {
    fallbackCount: summary.fallbackCount,
    missingAssetCount: summary.missingAssetCount,
    unsupportedStyleCount: summary.unsupportedStyleCount,
    packageGenerationStatus
  };
}

export function renderCapturePreview(documentRef, preview) {
  const summary = createValidationSummary(preview.diagnostics, preview.packageGenerationStatus);
  const previewRoot = documentRef.getElementById("capture-preview");
  const image = documentRef.getElementById("screenshot-preview");
  const downloadButton = documentRef.getElementById("download-button");

  setText(documentRef, "source-url", preview.sourceUrl ?? "");
  setText(documentRef, "viewport-size", viewportLabel(preview.viewport));
  setText(documentRef, "preview-breakpoints", breakpointPreviewLabel(preview));
  setText(documentRef, "capture-mode-label", preview.captureMode ?? "viewport");
  setText(
    documentRef,
    "document-size",
    preview.captureMode === "full-page" && preview.documentWidth && preview.documentHeight
      ? `${preview.documentWidth} x ${preview.documentHeight}`
      : "-"
  );
  setText(documentRef, "fallback-count", String(summary.fallbackCount));
  setText(documentRef, "missing-asset-count", String(summary.missingAssetCount));
  setText(documentRef, "unsupported-style-count", String(summary.unsupportedStyleCount));
  setText(documentRef, "package-generation-status", summary.packageGenerationStatus);
  setText(documentRef, "runtime-error-category", "");

  if (image) {
    const screenshotPreview = preview.screenshotDataUrl ?? preview.screenshotUrl;
    if (screenshotPreview) {
      image.src = screenshotPreview;
      image.hidden = false;
    } else {
      image.removeAttribute?.("src");
      image.hidden = true;
    }
  }
  if (previewRoot) {
    previewRoot.hidden = false;
  }
  setDownloadEnabled(downloadButton, summary.packageGenerationStatus === "ready");

  return summary;
}

export function renderRuntimeError(documentRef, error) {
  const row = documentRef?.getElementById?.("capture-status-row");
  if (row?.setAttribute) {
    row.setAttribute("data-state", "error");
  }
  const progress = documentRef?.getElementById?.("capture-progress");
  if (progress) {
    progress.hidden = true;
  }
  setText(documentRef, "capture-status", error?.message ?? "Capture failed");
  setText(documentRef, "runtime-error-category", error?.category ?? "runtime-error");
  setDownloadEnabled(documentRef.getElementById("download-button"), false);
}

function setText(documentRef, id, text) {
  const element = documentRef.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function setDownloadEnabled(downloadButton, enabled) {
  if (downloadButton) {
    downloadButton.disabled = !enabled;
  }
}

export function selectedCaptureMode(documentRef) {
  const elementRadio = documentRef?.getElementById?.("capture-mode-element");
  if (elementRadio?.checked) {
    return "element";
  }
  const fullPageRadio = documentRef?.getElementById?.("capture-mode-full-page");
  return fullPageRadio?.checked ? "full-page" : "viewport";
}

function updateCaptureModeUi(documentRef) {
  const mode = selectedCaptureMode(documentRef);
  const button = documentRef?.getElementById?.("capture-button");
  const breakpointSection = documentRef?.getElementById?.("breakpoint-select");
  if (button) {
    button.textContent = mode === "element"
      ? "Select element"
      : mode === "full-page"
        ? "Capture full page"
        : "Capture viewport";
  }
  if (breakpointSection) {
    breakpointSection.setAttribute?.("data-disabled", mode === "element" ? "true" : "false");
    breakpointSection.setAttribute?.("aria-disabled", mode === "element" ? "true" : "false");
  }
}

export function selectedBreakpointWidths(documentRef) {
  const widths = [];

  const presets = documentRef?.querySelectorAll?.(".breakpoint-preset") ?? [];
  for (const input of Array.from(presets)) {
    if (input.checked) {
      widths.push(Number(input.value));
    }
  }

  const customItems = documentRef?.querySelectorAll?.("#breakpoint-list [data-width]") ?? [];
  for (const item of Array.from(customItems)) {
    const value = item.getAttribute?.("data-width") ?? item.dataset?.width;
    widths.push(Number(value));
  }

  return normalizeBreakpointWidths(widths);
}

export function addCustomBreakpoint(documentRef, rawValue) {
  const errorElement = documentRef.getElementById("breakpoint-error");
  const parsed = parseCustomBreakpointWidth(rawValue);
  if (!parsed.ok) {
    if (errorElement) {
      errorElement.textContent = parsed.error;
    }
    return { ok: false, error: parsed.error };
  }

  if (errorElement) {
    errorElement.textContent = "";
  }

  if (selectedBreakpointWidths(documentRef).includes(parsed.width)) {
    return { ok: true, width: parsed.width, duplicate: true };
  }

  const list = documentRef.getElementById("breakpoint-list");
  if (list?.appendChild && typeof documentRef.createElement === "function") {
    const item = documentRef.createElement("li");
    item.setAttribute?.("data-width", String(parsed.width));
    item.textContent = `${parsed.width} px`;
    list.appendChild(item);
  }

  return { ok: true, width: parsed.width };
}

function breakpointPreviewLabel(preview) {
  if (Array.isArray(preview.breakpoints) && preview.breakpoints.length > 0) {
    return preview.breakpoints.map((entry) => entry.label ?? `${entry.width}`).join(", ");
  }
  if (preview.viewport?.width) {
    return `${preview.viewport.width}`;
  }
  return "-";
}

function viewportLabel(viewport = {}) {
  if (!viewport.width || !viewport.height) {
    return "";
  }
  return `${viewport.width} x ${viewport.height}`;
}

connectPopup();
