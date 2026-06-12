import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDiagnostics } from "../../../packages/capture-schema/dist/index.js";
import { createValidationSummary, renderCapturePreview, renderRuntimeError } from "../dist/popup.js";

test("popup validation summary reads counts from diagnostics", () => {
  const diagnostics = createEmptyDiagnostics({
    status: "warning",
    counts: {
      fallbacks: 2,
      missingAssets: 1,
      unsupportedStyles: 3
    }
  });

  assert.deepEqual(createValidationSummary(diagnostics, "ready"), {
    fallbackCount: 2,
    missingAssetCount: 1,
    unsupportedStyleCount: 3,
    packageGenerationStatus: "ready"
  });
});

test("popup preview renders screenshot and diagnostics before download", () => {
  const elements = new Map([
    ["capture-preview", { hidden: true }],
    ["screenshot-preview", { src: "" }],
    ["download-button", { disabled: true }],
    ["source-url", { textContent: "" }],
    ["viewport-size", { textContent: "" }],
    ["fallback-count", { textContent: "" }],
    ["missing-asset-count", { textContent: "" }],
    ["unsupported-style-count", { textContent: "" }],
    ["package-generation-status", { textContent: "" }],
    ["runtime-error-category", { textContent: "" }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };

  renderCapturePreview(documentRef, {
    screenshotUrl: "data:image/png;base64,iVBORw0KGgo=",
    sourceUrl: "https://app.example.com/dashboard",
    viewport: { width: 1440, height: 900 },
    packageGenerationStatus: "ready",
    diagnostics: createEmptyDiagnostics({
      status: "warning",
      counts: {
        fallbacks: 4,
        missingAssets: 0,
        unsupportedStyles: 2
      }
    })
  });

  assert.equal(elements.get("capture-preview").hidden, false);
  assert.equal(elements.get("screenshot-preview").src, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(elements.get("source-url").textContent, "https://app.example.com/dashboard");
  assert.equal(elements.get("viewport-size").textContent, "1440 x 900");
  assert.equal(elements.get("fallback-count").textContent, "4");
  assert.equal(elements.get("missing-asset-count").textContent, "0");
  assert.equal(elements.get("unsupported-style-count").textContent, "2");
  assert.equal(elements.get("package-generation-status").textContent, "ready");
  assert.equal(elements.get("download-button").disabled, false);
});

test("popup renders runtime error category and disables download", () => {
  const elements = new Map([
    ["capture-status", { textContent: "" }],
    ["download-button", { disabled: false }],
    ["runtime-error-category", { textContent: "" }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };

  renderRuntimeError(documentRef, {
    category: "missing-active-tab",
    message: "No active tab"
  });

  assert.equal(elements.get("capture-status").textContent, "No active tab");
  assert.equal(elements.get("runtime-error-category").textContent, "missing-active-tab");
  assert.equal(elements.get("download-button").disabled, true);
});

test("popup capture mode defaults to viewport and reads full-page selection", async () => {
  const { selectedCaptureMode } = await import("../dist/popup.js");

  const noSelection = {
    getElementById() {
      return undefined;
    }
  };
  assert.equal(selectedCaptureMode(noSelection), "viewport");

  const fullPageSelected = {
    getElementById(id) {
      return id === "capture-mode-full-page" ? { checked: true } : undefined;
    }
  };
  assert.equal(selectedCaptureMode(fullPageSelected), "full-page");
});

test("popup capture click sends selected captureMode in the runtime message", async () => {
  const { connectPopup } = await import("../dist/popup.js");
  const listeners = new Map();
  const elements = new Map([
    ["capture-button", {
      addEventListener(type, handler) {
        listeners.set(`capture-${type}`, handler);
      }
    }],
    ["capture-status", { textContent: "" }],
    ["download-button", {
      disabled: true,
      addEventListener() {}
    }],
    ["capture-mode-full-page", { checked: true }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };
  const sentMessages = [];
  const chromeApi = {
    runtime: {
      async sendMessage(message) {
        sentMessages.push(message);
        return { status: "error", error: { category: "missing-active-tab", message: "no tab" } };
      }
    }
  };

  connectPopup(documentRef, chromeApi);
  await listeners.get("capture-click")();

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "FIGCAPTURE_CAPTURE_ACTIVE_TAB");
  assert.equal(sentMessages[0].captureMode, "full-page");
});

test("popup preview shows capture mode and document size for full-page captures", () => {
  const elements = new Map([
    ["capture-preview", { hidden: true }],
    ["screenshot-preview", { src: "" }],
    ["download-button", { disabled: true }],
    ["source-url", { textContent: "" }],
    ["viewport-size", { textContent: "" }],
    ["capture-mode-label", { textContent: "" }],
    ["document-size", { textContent: "" }],
    ["fallback-count", { textContent: "" }],
    ["missing-asset-count", { textContent: "" }],
    ["unsupported-style-count", { textContent: "" }],
    ["package-generation-status", { textContent: "" }],
    ["runtime-error-category", { textContent: "" }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };

  renderCapturePreview(documentRef, {
    screenshotUrl: "data:image/png;base64,iVBORw0KGgo=",
    sourceUrl: "https://app.example.com/landing",
    viewport: { width: 1280, height: 800 },
    captureMode: "full-page",
    documentWidth: 1440,
    documentHeight: 5200,
    packageGenerationStatus: "ready",
    diagnostics: createEmptyDiagnostics()
  });

  assert.equal(elements.get("capture-mode-label").textContent, "full-page");
  assert.equal(elements.get("document-size").textContent, "1440 x 5200");

  renderCapturePreview(documentRef, {
    screenshotUrl: "data:image/png;base64,iVBORw0KGgo=",
    sourceUrl: "https://app.example.com/dashboard",
    viewport: { width: 1280, height: 800 },
    packageGenerationStatus: "ready",
    diagnostics: createEmptyDiagnostics()
  });

  assert.equal(elements.get("capture-mode-label").textContent, "viewport");
  assert.equal(elements.get("document-size").textContent, "-");
});
