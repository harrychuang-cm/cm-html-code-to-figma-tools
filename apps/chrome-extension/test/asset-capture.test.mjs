import assert from "node:assert/strict";
import test from "node:test";
import { captureElementTree } from "../dist/capture-core.js";
import { captureVisualAssets } from "../dist/asset-capture.js";

test("asset capture creates image assets and raster fallback assets", () => {
  const capture = captureElementTree(
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
          styles: { objectFit: "cover" },
          attributes: {
            src: "data:image/png;base64,iVBORw0KGgo=",
            alt: "Preview"
          },
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
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = captureVisualAssets(capture);

  assert.deepEqual(Object.keys(result.assets).sort(), ["assets/fallback-1.png", "assets/image-1.png"]);
  assert.equal(result.capture.root.children[0].assetRef, "assets/image-1.png");
  assert.equal(result.capture.root.children[1].fallbackRef, "assets/fallback-1.png");
  assert.equal(result.diagnostics.counts.fallbacks, 1);
  assert.deepEqual(result.diagnostics.fallbackReasons, [
    { sourceNodeId: "dom-canvas", reason: "canvas fallback" }
  ]);
  assert.deepEqual(result.sourceNodeMap, [
    { sourceNodeId: "dom-image", assetRef: "assets/image-1.png" },
    { sourceNodeId: "dom-canvas", fallbackRef: "assets/fallback-1.png" }
  ]);
});

test("asset capture records missing image sources and unsupported styles", () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-missing-image",
          rect: { x: 20, y: 20, width: 100, height: 100 },
          styles: { filter: "blur(2px)" },
          attributes: {},
          children: []
        },
        {
          tagName: "svg",
          sourceNodeId: "dom-svg",
          rect: { x: 140, y: 20, width: 100, height: 100 },
          styles: {},
          attributes: { role: "img" },
          children: [
            {
              tagName: "path",
              rect: { x: 140, y: 20, width: 100, height: 100 },
              styles: {},
              attributes: {},
              children: []
            }
          ]
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = captureVisualAssets(capture);

  assert.equal(result.diagnostics.counts.missingAssets, 1);
  assert.equal(result.diagnostics.counts.unsupportedStyles, 1);
  assert.equal(result.diagnostics.counts.fallbacks, 1);
  assert.equal(result.diagnostics.status, "warning");
  assert.equal(result.capture.root.children[1].fallbackRef, "assets/fallback-1.png");
});
