import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDiagnostics } from "../../../packages/capture-schema/dist/index.js";
import { captureElementTree } from "../dist/capture-core.js";
import {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  EXPORT_CONFIRMED_MESSAGE,
  RUNTIME_ERROR_CATEGORIES,
  createChromeCaptureRuntime,
  handleCaptureActiveTab,
  handleConfirmExport,
  sendContentCaptureMessage
} from "../dist/runtime.js";
import { captureVisibleScreenshot } from "../dist/screenshot.js";

const SCREENSHOT_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function createRuntimeCapture() {
  return captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 1280, height: 720 },
      styles: { backgroundColor: "rgb(255, 255, 255)" },
      attributes: { role: "main" },
      children: []
    },
    { width: 1280, height: 720, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/dashboard",
      title: "Dashboard",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );
}

test("visible screenshot adapter returns data URL and maps failures to screenshot-failed", async () => {
  const successChrome = {
    tabs: {
      async captureVisibleTab(options) {
        assert.deepEqual(options, { format: "png" });
        return SCREENSHOT_DATA_URL;
      }
    }
  };
  assert.equal(await captureVisibleScreenshot(successChrome), SCREENSHOT_DATA_URL);

  await assert.rejects(
    () => captureVisibleScreenshot({ tabs: { async captureVisibleTab() { throw new Error("restricted page"); } } }),
    (error) => error.category === RUNTIME_ERROR_CATEGORIES.SCREENSHOT_FAILED
  );
});

test("runtime capture resolves active tab, collects DOM capture, captures screenshot, and stores ready preview", async () => {
  const capture = createRuntimeCapture();
  const chromeApi = {
    tabs: {
      async query(query) {
        assert.deepEqual(query, { active: true, currentWindow: true });
        return [{ id: 42, url: capture.sourceUrl, title: capture.title }];
      }
    }
  };
  let pending = null;
  const runtime = createChromeCaptureRuntime({
    chromeApi,
    contentMessage: async (_api, tabId) => {
      assert.equal(tabId, 42);
      return capture;
    },
    screenshotAdapter: async () => SCREENSHOT_DATA_URL,
    packageBuilder(captured, screenshotDataUrl) {
      assert.equal(captured, capture);
      assert.equal(screenshotDataUrl, SCREENSHOT_DATA_URL);
      return {
        filename: "dashboard-1280x720.figcapture",
        bytes: new Uint8Array([1, 2, 3]),
        packageData: {
          diagnostics: createEmptyDiagnostics({
            counts: {
              fallbacks: 1,
              missingAssets: 2,
              unsupportedStyles: 3
            }
          })
        }
      };
    },
    getPending: () => pending,
    setPending: (value) => {
      pending = value;
    }
  });

  const response = await runtime.captureActiveTab();

  assert.equal(response.status, "ready");
  assert.equal(response.tab.id, 42);
  assert.equal(response.preview.sourceUrl, "https://app.example.com/dashboard");
  assert.deepEqual(response.preview.viewport, {
    width: 1280,
    height: 720,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0
  });
  assert.equal(response.preview.screenshotDataUrl, SCREENSHOT_DATA_URL);
  assert.equal(response.preview.diagnosticsSummary.fallbackCount, 1);
  assert.equal(response.preview.diagnosticsSummary.missingAssetCount, 2);
  assert.equal(response.preview.diagnosticsSummary.unsupportedStyleCount, 3);
  assert.equal(response.preview.packageStatus, "ready");
  assert.equal(pending.capture, capture);
});

test("runtime capture returns missing-active-tab when no active tab id exists", async () => {
  const response = await handleCaptureActiveTab({
    tabs: {
      async query() {
        return [{ url: "https://app.example.com/dashboard" }];
      }
    }
  });

  assert.equal(response.status, "error");
  assert.equal(response.error.category, RUNTIME_ERROR_CATEGORIES.MISSING_ACTIVE_TAB);
});

test("content capture message injects content script when initial message path fails", async () => {
  const capture = createRuntimeCapture();
  const calls = [];
  const chromeApi = {
    tabs: {
      async sendMessage(tabId, message) {
        calls.push(["sendMessage", tabId, message.type]);
        if (calls.length === 1) {
          throw new Error("receiving end does not exist");
        }
        return { status: "success", capture };
      }
    },
    scripting: {
      async executeScript(options) {
        calls.push(["executeScript", options.target.tabId, options.files[0]]);
      }
    }
  };

  const result = await sendContentCaptureMessage(chromeApi, 42);

  assert.equal(result, capture);
  assert.deepEqual(calls, [
    ["sendMessage", 42, "FIGCAPTURE_COLLECT_DOM"],
    ["executeScript", 42, "content-script.js"],
    ["sendMessage", 42, "FIGCAPTURE_COLLECT_DOM"]
  ]);
});

test("content capture message maps failed content response to capture-script-failed", async () => {
  await assert.rejects(
    () => sendContentCaptureMessage({
      tabs: {
        async sendMessage() {
          return {
            status: "error",
            error: { message: "DOM capture failed" }
          };
        }
      }
    }, 42),
    (error) => error.category === RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED
  );
});

test("confirmed export downloads exactly one package after ready preview", async () => {
  const capture = createRuntimeCapture();
  const chromeApi = {};
  let buildCount = 0;
  const downloadCalls = [];
  const runtime = createChromeCaptureRuntime({
    chromeApi,
    getPending: () => ({
      capture,
      screenshotDataUrl: SCREENSHOT_DATA_URL
    }),
    setPending: () => {},
    packageBuilder(captured, screenshotDataUrl) {
      buildCount += 1;
      assert.equal(captured, capture);
      assert.equal(screenshotDataUrl, SCREENSHOT_DATA_URL);
      return {
        filename: "dashboard-1280x720.figcapture",
        bytes: new Uint8Array([1, 2, 3]),
        packageData: { diagnostics: createEmptyDiagnostics() }
      };
    },
    async downloader(api, exportPackage) {
      assert.equal(api, chromeApi);
      downloadCalls.push(exportPackage);
      return 9;
    }
  });

  const response = await runtime.confirmExport();

  assert.equal(response.status, "downloaded");
  assert.equal(response.filename, "dashboard-1280x720.figcapture");
  assert.equal(response.downloadId, 9);
  assert.equal(buildCount, 1);
  assert.equal(downloadCalls.length, 1);
});

test("confirmed export returns missing-pending-capture without pending state", async () => {
  const response = await handleConfirmExport({}, { getPending: () => null });

  assert.equal(response.status, "error");
  assert.equal(response.error.category, RUNTIME_ERROR_CATEGORIES.MISSING_PENDING_CAPTURE);
});

test("confirmed export maps package generation and download failures", async () => {
  const capture = createRuntimeCapture();
  const pending = { capture, screenshotDataUrl: SCREENSHOT_DATA_URL };
  const packageFailure = await handleConfirmExport({}, {
    getPending: () => pending,
    packageBuilder() {
      throw new Error("zip failed");
    }
  });
  assert.equal(packageFailure.error.category, RUNTIME_ERROR_CATEGORIES.PACKAGE_GENERATION_FAILED);

  const downloadFailure = await handleConfirmExport({}, {
    getPending: () => pending,
    packageBuilder() {
      return {
        filename: "dashboard-1280x720.figcapture",
        bytes: new Uint8Array([1]),
        packageData: { diagnostics: createEmptyDiagnostics() }
      };
    },
    async downloader() {
      throw new Error("download denied");
    }
  });
  assert.equal(downloadFailure.error.category, RUNTIME_ERROR_CATEGORIES.DOWNLOAD_FAILED);
});

test("runtime message constants remain stable", () => {
  assert.equal(CAPTURE_ACTIVE_TAB_MESSAGE, "FIGCAPTURE_CAPTURE_ACTIVE_TAB");
  assert.equal(EXPORT_CONFIRMED_MESSAGE, "FIGCAPTURE_EXPORT_CONFIRMED");
});
