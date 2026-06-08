import { CAPTURE_ACTIVE_TAB_MESSAGE } from "./background.ts";
import { summarizeDiagnostics } from "@figma-capture/capture-schema";

export function connectPopup(documentRef = globalThis.document, chromeApi = globalThis.chrome) {
  const button = documentRef?.getElementById("capture-button");
  const status = documentRef?.getElementById("capture-status");

  button?.addEventListener("click", async () => {
    setStatus(status, "Capturing active tab...");
    try {
      const response = await chromeApi.runtime.sendMessage({ type: CAPTURE_ACTIVE_TAB_MESSAGE });
      if (response?.status === "error") {
        setStatus(status, response.error.message);
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

  setText(documentRef, "fallback-count", String(summary.fallbackCount));
  setText(documentRef, "missing-asset-count", String(summary.missingAssetCount));
  setText(documentRef, "unsupported-style-count", String(summary.unsupportedStyleCount));
  setText(documentRef, "package-generation-status", summary.packageGenerationStatus);

  if (image) {
    image.src = preview.screenshotUrl;
  }
  if (previewRoot) {
    previewRoot.hidden = false;
  }
  if (downloadButton) {
    downloadButton.disabled = summary.packageGenerationStatus !== "ready";
  }

  return summary;
}

function setText(documentRef, id, text) {
  const element = documentRef.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

connectPopup();
