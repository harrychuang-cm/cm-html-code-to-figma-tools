import assert from "node:assert/strict";
import test from "node:test";
import { unpackFigcapture } from "../../../packages/capture-schema/dist/index.js";
import { captureElementTree } from "../dist/capture-core.js";
import {
  buildConfirmedExportPackage,
  createScreenshotCropFallbackProvider,
  downloadFigcaptureArchive,
  inspectArchiveFileNames
} from "../dist/capture-package.js";

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
