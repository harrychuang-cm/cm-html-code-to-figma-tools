import {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  EXPORT_CONFIRMED_MESSAGE
} from "./runtime.ts";
import { summarizeDiagnostics } from "@figma-capture/capture-schema";

export function connectPopup(documentRef = globalThis.document, chromeApi = globalThis.chrome) {
  const button = documentRef?.getElementById("capture-button");
  const status = documentRef?.getElementById("capture-status");
  const downloadButton = documentRef?.getElementById("download-button");

  button?.addEventListener("click", async () => {
    setStatus(status, "Capturing active tab...");
    setDownloadEnabled(downloadButton, false);
    try {
      const response = await chromeApi.runtime.sendMessage({
        type: CAPTURE_ACTIVE_TAB_MESSAGE,
        captureMode: selectedCaptureMode(documentRef)
      });
      if (response?.status === "error") {
        renderRuntimeError(documentRef, response.error);
        return;
      }
      setStatus(status, `Ready to capture ${response.tab.title || response.tab.url}`);
      if (response.preview) {
        renderCapturePreview(documentRef, response.preview);
      }
    } catch (error) {
      setStatus(status, error.message);
    }
  });

  downloadButton?.addEventListener("click", async () => {
    setStatus(status, "Preparing .figcapture...");
    setDownloadEnabled(downloadButton, false);
    try {
      const response = await chromeApi.runtime.sendMessage({ type: EXPORT_CONFIRMED_MESSAGE });
      if (response?.status === "error") {
        renderRuntimeError(documentRef, response.error);
        return;
      }
      setStatus(status, `Downloaded ${response.filename}`);
    } catch (error) {
      setStatus(status, error.message);
    }
  });
}

function setStatus(status, message) {
  if (status) {
    status.textContent = message;
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
    image.src = preview.screenshotDataUrl ?? preview.screenshotUrl;
  }
  if (previewRoot) {
    previewRoot.hidden = false;
  }
  setDownloadEnabled(downloadButton, summary.packageGenerationStatus === "ready");

  return summary;
}

export function renderRuntimeError(documentRef, error) {
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
  const fullPageRadio = documentRef?.getElementById?.("capture-mode-full-page");
  return fullPageRadio?.checked ? "full-page" : "viewport";
}

function viewportLabel(viewport = {}) {
  if (!viewport.width || !viewport.height) {
    return "";
  }
  return `${viewport.width} x ${viewport.height}`;
}

connectPopup();
