import assert from "node:assert/strict";
import test from "node:test";
import { unpackFigcapture } from "../../../packages/capture-schema/dist/index.js";
import { captureElementTree } from "../dist/capture-core.js";
import {
  buildConfirmedExportPackage,
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

test("confirmed export creates one .figcapture archive with required files and assets", () => {
  const exportPackage = buildConfirmedExportPackage(
    createExportFixtureCapture(),
    "data:image/png;base64,iVBORw0KGgo="
  );
  const names = inspectArchiveFileNames(exportPackage.bytes);
  const unpacked = unpackFigcapture(exportPackage.bytes);

  assert.equal(exportPackage.filename, "dashboard-1440x900.figcapture");
  assert.deepEqual(names, [
    "assets/fallback-1.png",
    "assets/image-1.png",
    "capture.json",
    "diagnostics.json",
    "figma-plan.json",
    "manifest.json",
    "screenshot.png"
  ]);
  assert.equal(unpacked.capture.root.children[0].assetRef, "assets/image-1.png");
  assert.equal(unpacked.capture.root.children[1].fallbackRef, "assets/fallback-1.png");
  assert.equal(unpacked.figmaPlan.frames.length, 3);
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
  const exportPackage = buildConfirmedExportPackage(
    createExportFixtureCapture(),
    "data:image/png;base64,iVBORw0KGgo="
  );

  const downloadId = await downloadFigcaptureArchive(chromeApi, exportPackage);

  assert.equal(downloadId, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].filename, "dashboard-1440x900.figcapture");
  assert.equal(calls[0].saveAs, true);
  assert.match(calls[0].url, /^(blob:|data:application\/zip;base64,)/);
});
