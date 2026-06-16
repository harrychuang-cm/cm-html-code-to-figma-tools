import assert from "node:assert/strict";
import test from "node:test";
import { unpackFigcapture, unpackMultiCaptureFigcapture } from "../../../packages/capture-schema/dist/index.js";
import { captureElementTree } from "../dist/capture-core.js";
import {
  buildCapturePackageData,
  buildConfirmedExportPackage,
  buildMultiCaptureExportPackage,
  createScreenshotCropFallbackProvider,
  downloadFigcaptureArchive,
  inspectArchiveFileNames
} from "../dist/capture-package.js";

function createBreakpointCapture(width) {
  return captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width, height: 900 },
      styles: {},
      attributes: {},
      children: []
    },
    { width, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/dashboard",
      title: "Dashboard",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );
}

function createExportFixtureCapture() {
  return captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-image",
          rect: { x: 32, y: 32, width: 200, height: 120 },
          styles: {},
          attributes: { src: "data:image/png;base64,iVBORw0KGgo=" },
          children: []
        },
        {
          tagName: "canvas",
          sourceNodeId: "dom-canvas",
          rect: { x: 260, y: 32, width: 200, height: 120 },
          styles: {},
          attributes: {},
          children: []
        },
        {
          tagName: "svg",
          sourceNodeId: "dom-svg",
          rect: { x: 480, y: 32, width: 12, height: 12 },
          styles: {},
          attributes: {
            svgMarkup: "<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\"/></svg>"
          },
          children: []
        },
        {
          tagName: "span",
          sourceNodeId: "dom-css-icon",
          rect: { x: 512, y: 32, width: 12, height: 12 },
          styles: {
            maskImage: "url(data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2012%2012%22%2F%3E)"
          },
          attributes: {},
          children: []
        }
      ]
    },
    { width: 1440, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/dashboard",
      title: "Dashboard",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );
}

test("confirmed export creates one .figcapture archive with required files and assets", async () => {
  const exportPackage = await buildConfirmedExportPackage(
    createExportFixtureCapture(),
    "data:image/png;base64,iVBORw0KGgo="
  );
  const names = inspectArchiveFileNames(exportPackage.bytes);
  const unpacked = unpackFigcapture(exportPackage.bytes);

  assert.equal(exportPackage.filename, "dashboard-1440x900.figcapture");
  assert.deepEqual(names, [
    "assets/fallback-1.png",
    "assets/icon-1.svg",
    "assets/image-1.png",
    "assets/vector-1.svg",
    "capture.json",
    "diagnostics.json",
    "figma-plan.json",
    "manifest.json",
    "screenshot.png"
  ]);
  assert.equal(unpacked.capture.root.children[0].assetRef, "assets/image-1.png");
  assert.equal(unpacked.capture.root.children[1].fallbackRef, "assets/fallback-1.png");
  assert.equal(unpacked.capture.root.children[2].assetRef, "assets/vector-1.svg");
  assert.equal(unpacked.capture.root.children[3].assetRef, "assets/icon-1.svg");
  assert.equal(unpacked.figmaPlan.frames.length, 2);
  assert.deepEqual(unpacked.figmaPlan.frames.map((frame) => frame.role), [
    "Source Screenshot",
    "Editable Accurate"
  ]);
});

test("multi-capture export bundles every breakpoint into a single .figcapture", async () => {
  const exportPackage = await buildMultiCaptureExportPackage([
    {
      width: 1440,
      label: "1440",
      capture: createBreakpointCapture(1440),
      screenshotDataUrl: "data:image/png;base64,iVBORw0KGgo="
    },
    {
      width: 375,
      label: "375",
      capture: createBreakpointCapture(375),
      screenshotDataUrl: "data:image/png;base64,iVBORw0KGgo="
    }
  ]);

  const bundle = unpackMultiCaptureFigcapture(exportPackage.bytes);

  assert.equal(exportPackage.filename, "dashboard-1440-375.figcapture");
  assert.equal(exportPackage.packageData.captures.length, 2);
  assert.deepEqual(bundle.captures.map((entry) => entry.width), [1440, 375]);
  assert.equal(bundle.captures[0].packageData.manifest.viewportWidth, 1440);
  assert.equal(bundle.captures[1].packageData.manifest.viewportWidth, 375);
});

test("multi-capture export requires at least one breakpoint", async () => {
  await assert.rejects(() => buildMultiCaptureExportPackage([]));
});

test("confirmed export packages screenshot-cropped fallback bytes when direct canvas bytes are unavailable", async () => {
  const cropBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 55]);
  const exportPackage = await buildConfirmedExportPackage(
    createExportFixtureCapture(),
    "data:image/png;base64,iVBORw0KGgo=",
    {
      async fallbackRasterProvider(node) {
        assert.equal(node.sourceNodeId, "dom-canvas");
        return cropBytes;
      }
    }
  );
  const unpacked = unpackFigcapture(exportPackage.bytes);

  assert.deepEqual(Array.from(unpacked.assets["assets/fallback-1.png"]), Array.from(cropBytes));
});

test("screenshot crop fallback provider maps viewport rects to screenshot bitmap pixels", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const cropBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 88]);
  let drawArgs = null;

  globalThis.createImageBitmap = async () => ({ width: 200, height: 100 });
  globalThis.OffscreenCanvas = class MockOffscreenCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    getContext(type) {
      assert.equal(type, "2d");
      return {
        drawImage(...args) {
          drawArgs = args;
        }
      };
    }

    async convertToBlob(options) {
      assert.deepEqual(options, { type: "image/png" });
      return {
        async arrayBuffer() {
          return cropBytes.buffer.slice(cropBytes.byteOffset, cropBytes.byteOffset + cropBytes.byteLength);
        }
      };
    }
  };

  try {
    const provider = createScreenshotCropFallbackProvider(
      "data:image/png;base64,iVBORw0KGgo=",
      { width: 100, height: 50 }
    );
    const bytes = await provider({
      rect: { x: 10, y: 5, width: 20, height: 10 }
    });

    assert.deepEqual(Array.from(bytes), Array.from(cropBytes));
    assert.equal(drawArgs[1], 20);
    assert.equal(drawArgs[2], 10);
    assert.equal(drawArgs[3], 40);
    assert.equal(drawArgs[4], 20);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  }
});

test("full-page export crops screenshot fallbacks against document dimensions", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const cropBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 99]);
  const canvasSizes = [];
  const drawCalls = [];

  globalThis.createImageBitmap = async () => ({ width: 2880, height: 11764 });
  globalThis.OffscreenCanvas = class MockOffscreenCanvas {
    constructor(width, height) {
      canvasSizes.push({ width, height });
    }

    getContext(type) {
      assert.equal(type, "2d");
      return {
        drawImage(...args) {
          drawCalls.push(args);
        }
      };
    }

    async convertToBlob() {
      return {
        async arrayBuffer() {
          return cropBytes.buffer.slice(cropBytes.byteOffset, cropBytes.byteOffset + cropBytes.byteLength);
        }
      };
    }
  };

  const capture = captureElementTree(
    {
      tagName: "body",
      rect: { x: 0, y: 0, width: 1440, height: 5882 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-logo",
          rect: { x: 40, y: 6, width: 156, height: 52 },
          styles: { objectFit: "contain" },
          attributes: {
            currentSrc: "https://pocketstudio.com.tw/_ipx/f_webp&q_85&s_312x104/images/logo.webp",
            alt: "口袋 Studio"
          },
          children: []
        }
      ]
    },
    { width: 1440, height: 973, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://pocketstudio.com.tw/",
      title: "Studio",
      captureTimestamp: "2026-06-15T09:10:50.410Z",
      captureMode: "full-page",
      captureBounds: { width: 1440, height: 5882 }
    }
  );

  try {
    const packageData = await buildCapturePackageData(
      capture,
      "data:image/png;base64,iVBORw0KGgo=",
      {
        async assetResolver() {
          return {
            bytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
            contentType: "image/webp"
          };
        },
        async imageRasterProvider() {
          return null;
        }
      }
    );

    assert.equal(packageData.capture.root.children[0].assetRef, "assets/image-1.png");
    assert.deepEqual(canvasSizes[0], { width: 312, height: 104 });
    assert.equal(drawCalls[0][1], 80);
    assert.equal(drawCalls[0][2], 12);
    assert.equal(drawCalls[0][3], 312);
    assert.equal(drawCalls[0][4], 104);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  }
});

test("full-page export packages source screenshot tiles for stable Figma rendering", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const tileBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 116]);
  const canvasSizes = [];
  const drawCalls = [];

  globalThis.createImageBitmap = async () => ({ width: 2880, height: 11764 });
  globalThis.OffscreenCanvas = class MockOffscreenCanvas {
    constructor(width, height) {
      canvasSizes.push({ width, height });
    }

    getContext(type) {
      assert.equal(type, "2d");
      return {
        drawImage(...args) {
          drawCalls.push(args);
        }
      };
    }

    async convertToBlob() {
      return {
        async arrayBuffer() {
          return tileBytes.buffer.slice(tileBytes.byteOffset, tileBytes.byteOffset + tileBytes.byteLength);
        }
      };
    }
  };

  const capture = captureElementTree(
    {
      tagName: "body",
      rect: { x: 0, y: 0, width: 1440, height: 5882 },
      styles: {},
      attributes: {},
      children: []
    },
    { width: 1440, height: 973, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://pocketstudio.com.tw/",
      title: "Studio",
      captureTimestamp: "2026-06-15T09:10:50.410Z",
      captureMode: "full-page",
      captureBounds: { width: 1440, height: 5882 }
    }
  );

  try {
    const packageData = await buildCapturePackageData(capture, "data:image/png;base64,iVBORw0KGgo=");
    const tileNames = Object.keys(packageData.assets).filter((name) => name.startsWith("assets/source-screenshot/tile-"));

    assert.deepEqual(tileNames, [
      "assets/source-screenshot/tile-0000.png",
      "assets/source-screenshot/tile-0001.png",
      "assets/source-screenshot/tile-0002.png",
      "assets/source-screenshot/tile-0003.png"
    ]);
    assert.deepEqual(canvasSizes, [
      { width: 2880, height: 3600 },
      { width: 2880, height: 3600 },
      { width: 2880, height: 3600 },
      { width: 2880, height: 964 }
    ]);
    assert.deepEqual(drawCalls.map((args) => [args[1], args[2], args[3], args[4]]), [
      [0, 0, 2880, 3600],
      [0, 3600, 2880, 3600],
      [0, 7200, 2880, 3600],
      [0, 10800, 2880, 964]
    ]);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  }
});

test("download adapter sends a single .figcapture file through Chrome downloads", async () => {
  const calls = [];
  const chromeApi = {
    downloads: {
      async download(options) {
        calls.push(options);
        return 7;
      }
    }
  };
  const exportPackage = await buildConfirmedExportPackage(
    createExportFixtureCapture(),
    "data:image/png;base64,iVBORw0KGgo="
  );

  const downloadId = await downloadFigcaptureArchive(chromeApi, exportPackage);

  assert.equal(downloadId, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].filename, "dashboard-1440x900.figcapture");
  assert.equal(calls[0].conflictAction, "uniquify");
  assert.equal(calls[0].saveAs, true);
  assert.match(calls[0].url, /^data:application\/octet-stream;base64,/);
});
