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
    },
    querySelectorAll(selector) {
      if (selector === ".breakpoint-preset") {
        return [{ checked: true, value: "1440" }];
      }
      return [];
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
  assert.deepEqual(sentMessages[0].breakpointWidths, [1440]);
});

test("popup selects checked preset and custom-list breakpoint widths, normalized widest first", async () => {
  const { selectedBreakpointWidths } = await import("../dist/popup.js");
  const documentRef = {
    querySelectorAll(selector) {
      if (selector === ".breakpoint-preset") {
        return [
          { checked: true, value: "1440" },
          { checked: false, value: "1024" },
          { checked: true, value: "375" }
        ];
      }
      return [{ getAttribute: () => "768" }];
    }
  };

  assert.deepEqual(selectedBreakpointWidths(documentRef), [1440, 768, 375]);
});

test("popup capture click is blocked when no breakpoint is selected", async () => {
  const { connectPopup } = await import("../dist/popup.js");
  const listeners = new Map();
  const status = { textContent: "" };
  const elements = new Map([
    ["capture-button", {
      addEventListener(type, handler) {
        listeners.set(`capture-${type}`, handler);
      }
    }],
    ["capture-status", status],
    ["download-button", { disabled: true, addEventListener() {} }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    }
  };
  let sent = 0;
  const chromeApi = { runtime: { async sendMessage() { sent += 1; return {}; } } };

  connectPopup(documentRef, chromeApi);
  await listeners.get("capture-click")();

  assert.equal(sent, 0);
  assert.match(status.textContent, /at least one breakpoint/);
});

test("popup add custom breakpoint validates input and appends a list item", async () => {
  const { addCustomBreakpoint } = await import("../dist/popup.js");
  const appended = [];
  const errorElement = { textContent: "seed" };
  const documentRef = {
    getElementById(id) {
      if (id === "breakpoint-error") return errorElement;
      if (id === "breakpoint-list") return { appendChild(node) { appended.push(node); } };
      return undefined;
    },
    createElement() {
      return { setAttribute(name, value) { this[name] = value; }, textContent: "" };
    },
    querySelectorAll() {
      return [];
    }
  };

  const invalid = addCustomBreakpoint(documentRef, "12.5");
  assert.equal(invalid.ok, false);
  assert.equal(appended.length, 0);
  assert.notEqual(errorElement.textContent, "");

  const valid = addCustomBreakpoint(documentRef, "1280");
  assert.equal(valid.ok, true);
  assert.equal(valid.width, 1280);
  assert.equal(appended.length, 1);
  assert.equal(appended[0]["data-width"], "1280");
  assert.equal(errorElement.textContent, "");
});

test("popup add custom breakpoint skips a duplicate of an already-selected width", async () => {
  const { addCustomBreakpoint } = await import("../dist/popup.js");
  const appended = [];
  const documentRef = {
    getElementById(id) {
      if (id === "breakpoint-error") return { textContent: "" };
      if (id === "breakpoint-list") return { appendChild(node) { appended.push(node); } };
      return undefined;
    },
    createElement() {
      return { setAttribute() {}, textContent: "" };
    },
    querySelectorAll(selector) {
      if (selector === ".breakpoint-preset") {
        return [{ checked: true, value: "1440" }];
      }
      return [];
    }
  };

  const result = addCustomBreakpoint(documentRef, "1440");
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(appended.length, 0);
});

test("popup preview lists every captured breakpoint for a multi-capture result", () => {
  const elements = new Map([
    ["capture-preview", { hidden: true }],
    ["screenshot-preview", { src: "" }],
    ["download-button", { disabled: true }],
    ["source-url", { textContent: "" }],
    ["viewport-size", { textContent: "" }],
    ["preview-breakpoints", { textContent: "" }],
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
    multiCapture: true,
    breakpoints: [
      { width: 1440, label: "1440" },
      { width: 768, label: "768" },
      { width: 375, label: "375" }
    ],
    diagnostics: createEmptyDiagnostics()
  });

  assert.equal(elements.get("preview-breakpoints").textContent, "1440, 768, 375");
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
