import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDiagnostics } from "../../../packages/capture-schema/dist/index.js";
import { captureElementTree } from "../dist/capture-core.js";
import {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  EXPORT_CONFIRMED_MESSAGE,
  GET_PENDING_CAPTURE_MESSAGE,
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

test("runtime capture omits oversized preview screenshots from popup response", async () => {
  const capture = createRuntimeCapture();
  const oversizedScreenshot = `data:image/png;base64,${"a".repeat(96)}`;
  let pending = null;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: capture.sourceUrl, title: capture.title }];
        }
      }
    },
    contentMessage: async () => capture,
    screenshotAdapter: async () => oversizedScreenshot,
    previewScreenshotMaxBytes: 32,
    packageBuilder(captured, screenshotDataUrl) {
      assert.equal(captured, capture);
      assert.equal(screenshotDataUrl, oversizedScreenshot);
      return {
        filename: "dashboard-1280x720.figcapture",
        bytes: new Uint8Array([1, 2, 3]),
        packageData: { diagnostics: createEmptyDiagnostics() }
      };
    },
    getPending: () => pending,
    setPending: (value) => {
      pending = value;
    }
  });

  const response = await runtime.captureActiveTab();

  assert.equal(response.status, "ready");
  assert.equal(response.preview.screenshotDataUrl, undefined);
  assert.equal(response.preview.screenshotUrl, undefined);
  assert.equal(response.preview.screenshotPreviewStatus, "omitted");
  assert.equal(pending.screenshotDataUrl, oversizedScreenshot);
  assert.equal(JSON.stringify(response).includes(oversizedScreenshot), false);
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
  assert.equal(GET_PENDING_CAPTURE_MESSAGE, "FIGCAPTURE_GET_PENDING_CAPTURE");
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

test("content viewport DOM capture waits for render settle before snapshot", async () => {
  const { collectDom } = await import("../dist/content.js");
  const settleCalls = [];
  let settled = false;
  const chart = {
    tagName: "svg",
    attributes: [],
    children: [],
    childNodes: [],
    get outerHTML() {
      return settled
        ? "<svg data-layout=\"mobile\"></svg>"
        : "<svg data-layout=\"desktop\"></svg>";
    },
    getBoundingClientRect() {
      return { x: 24, y: 40, width: 320, height: 160 };
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    children: [chart],
    childNodes: [],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 375, height: 800 };
    }
  };
  const fakeDocument = {
    body,
    documentElement: body,
    title: "Responsive chart",
    location: { href: "https://app.example.com/chart" }
  };
  const fakeWindow = {
    innerWidth: 375,
    innerHeight: 800,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    requestAnimationFrame(callback) {
      settleCalls.push("raf");
      callback();
    },
    setTimeout(callback, delay) {
      settleCalls.push(["timeout", delay]);
      settled = true;
      callback();
    },
    getComputedStyle(_element, pseudo) {
      if (pseudo) {
        return { display: "none", content: "none" };
      }
      return { display: "block" };
    }
  };

  const capture = await collectDom({}, fakeDocument, fakeWindow);

  assert.deepEqual(settleCalls, ["raf", "raf", ["timeout", 250]]);
  assert.equal(capture.root.children[0].attributes.svgMarkup, "<svg data-layout=\"mobile\"></svg>");
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

function fakeMultiPackageBuilder(breakpoints) {
  return {
    filename: `dashboard-${breakpoints.map((bp) => bp.width).join("-")}.figcapture`,
    bytes: new Uint8Array([1]),
    packageData: {
      captures: breakpoints.map((bp) => ({
        width: bp.width,
        label: bp.label,
        packageData: {
          capture: bp.capture,
          diagnostics: createEmptyDiagnostics()
        }
      }))
    }
  };
}

test("runtime captures breakpoint screenshots through the emulation session with a clipped CDP shot", async () => {
  const cdpShots = [];
  let visibleTabCalls = 0;
  let pending = null;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: "https://app.example.com/dashboard", title: "Dashboard" }];
        }
      }
    },
    contentMessage: async () => createRuntimeCapture(),
    // captureVisibleTab must NOT be used while emulation is active.
    screenshotAdapter: async () => {
      visibleTabCalls += 1;
      return SCREENSHOT_DATA_URL;
    },
    emulationFactory: () => {
      let width = 0;
      return {
        async attach() {},
        async setWidth(value) {
          width = value;
        },
        async captureScreenshot(params) {
          cdpShots.push({ width, params });
          return `data:image/png;base64,cdp-${width}`;
        },
        async clear() {},
        async detach() {}
      };
    },
    multiPackageBuilder: fakeMultiPackageBuilder,
    getPending: () => pending,
    setPending: (value) => {
      pending = value;
    }
  });

  const response = await runtime.captureActiveTab({ breakpointWidths: [1440, 375] });

  assert.equal(visibleTabCalls, 0, "must not fall back to captureVisibleTab during emulation");
  assert.deepEqual(cdpShots.map((shot) => shot.width), [1440, 375]);
  // The viewport screenshot is clipped to the reflowed viewport and rendered with
  // captureBeyondViewport so mobile/zero-height surfaces still produce pixels.
  for (const shot of cdpShots) {
    assert.equal(shot.params.captureBeyondViewport, true);
    assert.deepEqual(shot.params.clip, { x: 0, y: 0, width: 1280, height: 720, scale: 1 });
  }
  assert.equal(response.preview.screenshotDataUrl, "data:image/png;base64,cdp-1440");
  assert.deepEqual(
    response.preview.breakpoints.map((entry) => entry.screenshotDataUrl),
    [undefined, undefined]
  );
  assert.deepEqual(
    pending.breakpoints.map((entry) => entry.screenshotDataUrl),
    ["data:image/png;base64,cdp-1440", "data:image/png;base64,cdp-375"]
  );
});

test("runtime captures emulated full-page breakpoints as a single clipped CDP shot", async () => {
  const shots = [];
  let stitchCalls = 0;
  let pending = null;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 7, url: "https://app.example.com/dashboard", title: "Dashboard" }];
        }
      }
    },
    contentRequest: async (_api, _tabId, message) => {
      if (message.type === "FIGCAPTURE_PAGE_METRICS") {
        return {
          status: "success",
          metrics: {
            documentWidth: 375,
            documentHeight: 2400,
            viewport: { width: 375, height: 800, devicePixelRatio: 2, scrollX: 0, scrollY: 0 }
          }
        };
      }
      if (message.type === "FIGCAPTURE_COLLECT_DOM") {
        return { status: "success", capture: createRuntimeCapture() };
      }
      return { status: "success", scrollY: message.scrollY ?? 0 };
    },
    stitcher: async () => {
      stitchCalls += 1;
      return "data:image/png;base64,stitched";
    },
    emulationFactory: () => ({
      async attach() {},
      async setWidth() {},
      async captureScreenshot(params) {
        shots.push(params);
        return "data:image/png;base64,cdp-fullpage";
      },
      async clear() {},
      async detach() {}
    }),
    multiPackageBuilder: fakeMultiPackageBuilder,
    getPending: () => pending,
    setPending: (value) => {
      pending = value;
    }
  });

  const response = await runtime.captureActiveTab({
    breakpointWidths: [375],
    captureMode: "full-page"
  });

  assert.equal(stitchCalls, 0, "emulated full-page must not scroll-stitch");
  assert.equal(shots.length, 1, "one CDP shot covers the whole emulated page");
  assert.equal(shots[0].captureBeyondViewport, true);
  assert.deepEqual(shots[0].clip, { x: 0, y: 0, width: 375, height: 2400, scale: 1 });
  assert.equal(response.preview.screenshotDataUrl, "data:image/png;base64,cdp-fullpage");
  assert.equal(response.preview.breakpoints[0].screenshotDataUrl, undefined);
  assert.equal(pending.breakpoints[0].screenshotDataUrl, "data:image/png;base64,cdp-fullpage");
});

test("runtime segments emulated full-page CDP screenshots when bitmap height would be clamped", async () => {
  const shots = [];
  const stitchedSegments = [];
  let stitchOptions = null;
  let pending = null;
  const calls = [];
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 7, url: "https://app.example.com/dashboard", title: "Dashboard" }];
        }
      }
    },
    contentRequest: async (_api, _tabId, message) => {
      calls.push(message);
      if (message.type === "FIGCAPTURE_PAGE_METRICS") {
        return {
          status: "success",
          metrics: {
            documentWidth: 1440,
            documentHeight: 16510,
            viewport: { width: 1440, height: 973, devicePixelRatio: 2, scrollX: 0, scrollY: 0 }
          }
        };
      }
      if (message.type === "FIGCAPTURE_COLLECT_DOM") {
        return { status: "success", capture: createFullPageCapture(16510) };
      }
      return { status: "success", scrollY: message.scrollY ?? 0 };
    },
    stitcher: async (segments, options) => {
      stitchedSegments.push(...segments);
      stitchOptions = options;
      return "data:image/png;base64,stitched-cdp";
    },
    emulationFactory: () => ({
      async attach() {},
      async setWidth() {},
      async captureScreenshot(params) {
        shots.push(params);
        return `data:image/png;base64,cdp-segment-${shots.length}`;
      },
      async clear() {},
      async detach() {}
    }),
    multiPackageBuilder: fakeMultiPackageBuilder,
    getPending: () => pending,
    setPending: (value) => {
      pending = value;
    }
  });

  const response = await runtime.captureActiveTab({
    breakpointWidths: [1440],
    captureMode: "full-page"
  });

  assert(shots.length > 1, "tall full-page CDP capture should be segmented");
  assert.deepEqual(shots[0].clip, { x: 0, y: 0, width: 1440, height: 973, scale: 1 });
  assert.deepEqual(shots.at(-1).clip, { x: 0, y: 15568, width: 1440, height: 942, scale: 1 });
  assert(shots.every((shot) => shot.captureBeyondViewport === true));
  assert.equal(stitchedSegments.length, shots.length);
  assert.deepEqual(stitchedSegments[0], {
    dataUrl: "data:image/png;base64,cdp-segment-1",
    scrollY: 0,
    width: 1440,
    height: 973
  });
  assert.deepEqual(stitchOptions, {
    documentWidth: 1440,
    documentHeight: 16510,
    devicePixelRatio: 2,
    outputScale: 1
  });
  assert.equal(
    calls.some((call) => call.type === "FIGCAPTURE_SET_PINNED_HIDDEN" && call.hidden === true),
    true
  );
  assert.equal(response.preview.screenshotDataUrl, "data:image/png;base64,stitched-cdp");
  assert.equal(pending.breakpoints[0].screenshotDataUrl, "data:image/png;base64,stitched-cdp");
});

test("runtime captures multiple breakpoints sequentially with device emulation and stores a multi-capture preview", async () => {
  const emulationCalls = [];
  let pending = null;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: "https://app.example.com/dashboard", title: "Dashboard" }];
        }
      }
    },
    contentMessage: async () => createRuntimeCapture(),
    screenshotAdapter: async () => SCREENSHOT_DATA_URL,
    emulationFactory: (_api, tabId) => ({
      async attach() {
        emulationCalls.push(["attach", tabId]);
      },
      async setWidth(width) {
        emulationCalls.push(["setWidth", width]);
      },
      async clear() {
        emulationCalls.push(["clear"]);
      },
      async detach() {
        emulationCalls.push(["detach"]);
      }
    }),
    multiPackageBuilder: fakeMultiPackageBuilder,
    getPending: () => pending,
    setPending: (value) => {
      pending = value;
    }
  });

  const response = await runtime.captureActiveTab({ breakpointWidths: [375, 1440] });

  assert.equal(response.status, "ready");
  assert.equal(response.preview.multiCapture, true);
  assert.deepEqual(response.preview.breakpoints.map((entry) => entry.width), [1440, 375]);
  assert.deepEqual(emulationCalls, [
    ["attach", 42],
    ["setWidth", 1440],
    ["clear"],
    ["setWidth", 375],
    ["clear"],
    ["detach"]
  ]);
  assert.equal(pending.multiCapture, true);
  assert.equal(pending.breakpoints.length, 2);
});

test("runtime records a failed breakpoint and continues with the remaining breakpoints", async () => {
  const emulationCalls = [];
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: "https://app.example.com/dashboard", title: "Dashboard" }];
        }
      }
    },
    contentMessage: async () => createRuntimeCapture(),
    screenshotAdapter: async () => SCREENSHOT_DATA_URL,
    emulationFactory: () => ({
      async attach() {
        emulationCalls.push("attach");
      },
      async setWidth(width) {
        emulationCalls.push(`setWidth-${width}`);
        if (width === 1440) {
          throw new Error("emulate failed");
        }
      },
      async clear() {
        emulationCalls.push("clear");
      },
      async detach() {
        emulationCalls.push("detach");
      }
    }),
    multiPackageBuilder: fakeMultiPackageBuilder,
    getPending: () => null,
    setPending: () => {}
  });

  const response = await runtime.captureActiveTab({ breakpointWidths: [1440, 375] });

  assert.equal(response.preview.breakpoints.length, 1);
  assert.equal(response.preview.breakpoints[0].width, 375);
  assert.deepEqual(response.preview.failures, [{ width: 1440, message: "emulate failed" }]);
  assert.equal(emulationCalls.includes("detach"), true);
});

test("runtime reports all-breakpoints-failed when every breakpoint capture fails", async () => {
  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: "https://app.example.com/dashboard", title: "Dashboard" }];
        }
      }
    },
    contentMessage: async () => {
      throw new Error("dom capture failed");
    },
    screenshotAdapter: async () => SCREENSHOT_DATA_URL,
    emulationFactory: () => ({
      async attach() {},
      async setWidth() {},
      async clear() {},
      async detach() {}
    }),
    multiPackageBuilder: fakeMultiPackageBuilder,
    getPending: () => null,
    setPending: () => {}
  });

  await assert.rejects(
    () => runtime.captureActiveTab({ breakpointWidths: [1440] }),
    (error) => error.category === RUNTIME_ERROR_CATEGORIES.ALL_BREAKPOINTS_FAILED
  );
});

test("confirmed export builds and downloads a single multi-capture package", async () => {
  const downloads = [];
  let built = 0;
  const runtime = createChromeCaptureRuntime({
    chromeApi: {},
    getPending: () => ({
      multiCapture: true,
      breakpoints: [
        { width: 1440, label: "1440", capture: createRuntimeCapture(), screenshotDataUrl: SCREENSHOT_DATA_URL },
        { width: 375, label: "375", capture: createRuntimeCapture(), screenshotDataUrl: SCREENSHOT_DATA_URL }
      ]
    }),
    setPending: () => {},
    multiPackageBuilder: (breakpoints) => {
      built += 1;
      assert.equal(breakpoints.length, 2);
      return {
        filename: "dashboard-1440-375.figcapture",
        bytes: new Uint8Array([1]),
        packageData: { captures: [] }
      };
    },
    async downloader(_api, exportPackage) {
      downloads.push(exportPackage);
      return 5;
    }
  });

  const response = await runtime.confirmExport();

  assert.equal(response.status, "downloaded");
  assert.equal(response.filename, "dashboard-1440-375.figcapture");
  assert.equal(built, 1);
  assert.equal(downloads.length, 1);
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

test("element capture selects one DOM node and captures the matching clipped screenshot", async () => {
  const calls = [];
  const shots = [];
  let visibleScreenshots = 0;
  const selection = {
    id: "selection-1",
    rect: { x: 100, y: 200, width: 320, height: 180 },
    documentRect: { x: 100, y: 600, width: 320, height: 180 },
    viewport: { width: 1440, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 400 }
  };
  const capture = captureElementTree(
    {
      tagName: "article",
      rect: { x: 0, y: 0, width: 320, height: 180 },
      styles: {},
      attributes: {},
      children: []
    },
    { width: 320, height: 180, devicePixelRatio: 2, scrollX: 0, scrollY: 400 },
    {
      sourceUrl: "https://app.example.com/cards",
      title: "Cards",
      captureTimestamp: "2026-06-16T03:10:00.000Z",
      captureMode: "element",
      captureBounds: { width: 320, height: 180 }
    }
  );

  const runtime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query() {
          return [{ id: 42, url: capture.sourceUrl, title: capture.title }];
        }
      }
    },
    contentRequest: async (_api, _tabId, message) => {
      calls.push(message);
      if (message.type === "FIGCAPTURE_SELECT_ELEMENT") {
        return { status: "success", selection };
      }
      if (message.type === "FIGCAPTURE_COLLECT_DOM") {
        assert.equal(message.mode, "element");
        assert.equal(message.selection.id, "selection-1");
        return { status: "success", capture };
      }
      throw new Error(`Unexpected message ${message.type}`);
    },
    screenshotAdapter: async () => {
      visibleScreenshots += 1;
      return SCREENSHOT_DATA_URL;
    },
    emulationFactory: () => ({
      async attach() {},
      async captureScreenshot(params) {
        shots.push(params);
        return "data:image/png;base64,element-cdp";
      },
      async detach() {}
    }),
    packageBuilder: fakePackageBuilder,
    getPending: () => null,
    setPending: () => {}
  });

  const response = await runtime.captureActiveTab({
    captureMode: "element",
    breakpointWidths: [1440, 375]
  });

  assert.deepEqual(calls.map((call) => call.type), [
    "FIGCAPTURE_SELECT_ELEMENT",
    "FIGCAPTURE_COLLECT_DOM"
  ]);
  assert.deepEqual(shots, [{
    clip: { x: 100, y: 600, width: 320, height: 180, scale: 1 },
    captureBeyondViewport: true
  }]);
  assert.equal(visibleScreenshots, 0);
  assert.equal(response.status, "ready");
  assert.equal(response.preview.captureMode, "element");
  assert.deepEqual(response.preview.viewport, {
    width: 320,
    height: 180,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 400
  });
  assert.equal(response.preview.screenshotDataUrl, "data:image/png;base64,element-cdp");
});
