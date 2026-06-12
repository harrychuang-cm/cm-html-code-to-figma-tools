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

test("content runtime page metrics, scroll, and pinned hiding respond with expected shapes", async () => {
  const { pageMetrics, scrollToAndSettle, setPinnedHidden } = await import("../dist/content.js");

  const fixedHeader = {
    computedPosition: "fixed",
    style: { visibility: "" }
  };
  const staticDiv = {
    computedPosition: "static",
    style: { visibility: "" }
  };
  const fakeDocument = {
    documentElement: { scrollWidth: 1440, scrollHeight: 5200 },
    body: { scrollWidth: 1440, scrollHeight: 5100 },
    querySelectorAll() {
      return [fixedHeader, staticDiv];
    }
  };
  let scrolledTo = null;
  const fakeWindow = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    scrollTo(_x, y) {
      scrolledTo = y;
      this.scrollY = y;
    },
    getComputedStyle(element) {
      return { position: element.computedPosition };
    }
  };

  const metrics = pageMetrics(fakeDocument, fakeWindow);
  assert.equal(metrics.documentWidth, 1440);
  assert.equal(metrics.documentHeight, 5200);
  assert.equal(metrics.viewport.height, 800);

  const scrolled = await scrollToAndSettle(1600, fakeWindow);
  assert.equal(scrolledTo, 1600);
  assert.equal(scrolled.scrollY, 1600);

  const hidden = setPinnedHidden(true, fakeDocument, fakeWindow);
  assert.equal(hidden.pinnedCount, 1);
  assert.equal(fixedHeader.style.visibility, "hidden");
  assert.equal(staticDiv.style.visibility, "");

  const restored = setPinnedHidden(false, fakeDocument, fakeWindow);
  assert.equal(restored.pinnedCount, 0);
  assert.equal(fixedHeader.style.visibility, "");
});

function createFullPageCapture(documentHeight) {
  return captureElementTree(
    {
      tagName: "body",
      rect: { x: 0, y: 0, width: 1440, height: documentHeight },
      styles: {},
      attributes: {},
      children: []
    },
    { width: 1280, height: 800, devicePixelRatio: 2, scrollX: 0, scrollY: 120 },
    {
      sourceUrl: "https://app.example.com/landing",
      title: "Landing",
      captureTimestamp: "2026-06-12T08:00:00.000Z",
      captureMode: "full-page",
      captureBounds: { width: 1440, height: documentHeight },
      clipToViewport: false
    }
  );
}

function fakePackageBuilder() {
  return {
    filename: "landing.figcapture",
    bytes: new Uint8Array([1, 2, 3]),
    packageData: { diagnostics: createEmptyDiagnostics() }
  };
}

function fullPageMetrics(documentHeight) {
  return {
    documentWidth: 1440,
    documentHeight,
    viewport: { width: 1280, height: 800, devicePixelRatio: 2, scrollX: 0, scrollY: 120 }
  };
}

function createFullPageContentRequest(calls, documentHeight) {
  return async (_api, _tabId, message) => {
    calls.push(message);
    if (message.type === "FIGCAPTURE_PAGE_METRICS") {
      return { status: "success", metrics: fullPageMetrics(documentHeight) };
    }
    if (message.type === "FIGCAPTURE_SCROLL_TO") {
      return { status: "success", scrollY: message.scrollY, scrollX: 0 };
    }
    if (message.type === "FIGCAPTURE_SET_PINNED_HIDDEN") {
      return { status: "success", pinnedCount: message.hidden ? 1 : 0 };
    }
    if (message.type === "FIGCAPTURE_COLLECT_DOM") {
      return { status: "success", capture: createFullPageCapture(message.documentHeight) };
    }
    throw new Error(`Unexpected message ${message.type}`);
  };
}

test("full-page capture orchestrates metrics, pre-scroll, DOM capture, segments, and restore in order", async () => {
  const calls = [];
  const stitchedSegments = [];
  let stitchOptions = null;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: "https://app.example.com/landing", title: "Landing" }];
        }
      }
    },
    contentRequest: createFullPageContentRequest(calls, 2400),
    screenshotAdapter: async () => SCREENSHOT_DATA_URL,
    stitcher: async (segments, options) => {
      stitchedSegments.push(...segments);
      stitchOptions = options;
      return "data:image/png;base64,stitched";
    },
    packageBuilder: fakePackageBuilder,
    getPending: () => null,
    setPending: () => {}
  });

  const response = await runtime.captureActiveTab({ captureMode: "full-page" });

  const types = calls.map((call) => call.type);
  assert.equal(types[0], "FIGCAPTURE_PAGE_METRICS");
  const preScroll = calls.slice(1, 4);
  assert.deepEqual(preScroll.map((call) => [call.type, call.scrollY]), [
    ["FIGCAPTURE_SCROLL_TO", 0],
    ["FIGCAPTURE_SCROLL_TO", 800],
    ["FIGCAPTURE_SCROLL_TO", 1600]
  ]);
  assert.equal(calls[4].type, "FIGCAPTURE_COLLECT_DOM");
  assert.equal(calls[4].mode, "full-page");
  assert.equal(calls[4].documentWidth, 1440);
  assert.equal(calls[4].documentHeight, 2400);
  const pinnedHideIndex = calls.findIndex((call) => call.type === "FIGCAPTURE_SET_PINNED_HIDDEN" && call.hidden === true);
  assert.ok(pinnedHideIndex > 5, "pinned hiding happens after the first segment");
  const lastTwo = calls.slice(-2);
  assert.equal(lastTwo[0].type, "FIGCAPTURE_SET_PINNED_HIDDEN");
  assert.equal(lastTwo[0].hidden, false);
  assert.equal(lastTwo[1].type, "FIGCAPTURE_SCROLL_TO");
  assert.equal(lastTwo[1].scrollY, 120);

  assert.deepEqual(stitchedSegments.map((segment) => segment.scrollY), [0, 800, 1600]);
  assert.deepEqual(stitchOptions, { documentWidth: 1440, documentHeight: 2400, devicePixelRatio: 2 });
  assert.equal(response.status, "ready");
  assert.equal(response.preview.captureMode, "full-page");
  assert.equal(response.preview.documentWidth, 1440);
  assert.equal(response.preview.documentHeight, 2400);
  assert.equal(response.preview.screenshotDataUrl, "data:image/png;base64,stitched");
});

test("full-page capture restores scroll and pinned visibility when a segment fails", async () => {
  const calls = [];
  let screenshotAttempts = 0;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: "https://app.example.com/landing", title: "Landing" }];
        }
      }
    },
    contentRequest: createFullPageContentRequest(calls, 2400),
    screenshotAdapter: async () => {
      screenshotAttempts += 1;
      const error = new Error("rate limited");
      error.category = RUNTIME_ERROR_CATEGORIES.SCREENSHOT_FAILED;
      throw error;
    },
    stitcher: async () => "data:image/png;base64,stitched",
    packageBuilder: fakePackageBuilder,
    getPending: () => null,
    setPending: () => {}
  });

  await assert.rejects(
    () => runtime.captureActiveTab({ captureMode: "full-page" }),
    (error) => error.category === RUNTIME_ERROR_CATEGORIES.SCREENSHOT_FAILED
  );

  assert.equal(screenshotAttempts, 2, "segment screenshot retries once before failing");
  const lastTwo = calls.slice(-2);
  assert.equal(lastTwo[0].type, "FIGCAPTURE_SET_PINNED_HIDDEN");
  assert.equal(lastTwo[0].hidden, false);
  assert.equal(lastTwo[1].type, "FIGCAPTURE_SCROLL_TO");
  assert.equal(lastTwo[1].scrollY, 120);
});

test("full-page capture truncates overlong pages and records a diagnostics warning", async () => {
  const calls = [];
  let pending = null;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: "https://app.example.com/landing", title: "Landing" }];
        }
      }
    },
    contentRequest: createFullPageContentRequest(calls, 50000),
    screenshotAdapter: async () => SCREENSHOT_DATA_URL,
    stitcher: async () => "data:image/png;base64,stitched",
    packageBuilder: fakePackageBuilder,
    getPending: () => pending,
    setPending: (value) => {
      pending = value;
    }
  });

  const response = await runtime.captureActiveTab({ captureMode: "full-page" });

  const domCall = calls.find((call) => call.type === "FIGCAPTURE_COLLECT_DOM");
  assert.equal(domCall.documentHeight, 20000);
  assert.equal(response.preview.documentHeight, 20000);
  assert.equal(
    response.preview.diagnostics.warnings.includes("full-page capture truncated to 20000px of 50000px"),
    true
  );
  assert.equal(pending.truncationWarning, "full-page capture truncated to 20000px of 50000px");
});

test("viewport capture mode keeps existing behavior without full-page messages", async () => {
  const capture = createRuntimeCapture();
  const calls = [];
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: capture.sourceUrl, title: capture.title }];
        }
      }
    },
    contentMessage: async () => capture,
    contentRequest: async (_api, _tabId, message) => {
      calls.push(message);
      return { status: "success" };
    },
    screenshotAdapter: async () => SCREENSHOT_DATA_URL,
    packageBuilder: fakePackageBuilder,
    getPending: () => null,
    setPending: () => {}
  });

  const response = await runtime.captureActiveTab({});

  assert.equal(response.status, "ready");
  assert.equal(response.preview.captureMode, "viewport");
  assert.equal(calls.length, 0);
});
