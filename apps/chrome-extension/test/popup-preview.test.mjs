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
