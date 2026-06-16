import assert from "node:assert/strict";
import test from "node:test";
import { captureElementTree } from "../dist/capture-core.js";
import { TRANSPARENT_PNG, captureVisualAssets, firstCssImageUrl } from "../dist/asset-capture.js";

test("asset capture creates image assets and raster fallback assets", async () => {
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

  const result = await captureVisualAssets(capture);

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

test("asset capture uses serialized canvas bitmap bytes when available", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "canvas",
          sourceNodeId: "dom-canvas",
          rect: { x: 20, y: 20, width: 120, height: 80 },
          styles: {},
          attributes: {
            canvasDataUrl: "data:image/png;base64,iVBORw0KGgo="
          },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture);

  assert.equal(result.capture.root.children[0].fallbackRef, "assets/fallback-1.png");
  assert.deepEqual(Array.from(result.assets["assets/fallback-1.png"]), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(result.diagnostics.fallbackReasons, [
    { sourceNodeId: "dom-canvas", reason: "canvas fallback" }
  ]);
});

test("asset capture uses async raster provider when canvas serialization is unavailable", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "canvas",
          sourceNodeId: "dom-canvas",
          rect: { x: 20, y: 20, width: 120, height: 80 },
          styles: {},
          attributes: {},
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );
  const cropBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 99]);
  const providerCalls = [];

  const result = await captureVisualAssets(capture, {
    async fallbackRasterProvider(node) {
      providerCalls.push(node.sourceNodeId);
      return cropBytes;
    }
  });

  assert.deepEqual(providerCalls, ["dom-canvas"]);
  assert.deepEqual(Array.from(result.assets["assets/fallback-1.png"]), Array.from(cropBytes));
});

test("asset capture replaces transparent serialized canvas placeholder with raster provider bytes", async () => {
  const transparentCanvasDataUrl = `data:image/png;base64,${Buffer.from(TRANSPARENT_PNG).toString("base64")}`;
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "canvas",
          sourceNodeId: "dom-canvas",
          rect: { x: 20, y: 20, width: 120, height: 80 },
          styles: {},
          attributes: {
            canvasDataUrl: transparentCanvasDataUrl
          },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );
  const cropBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 42]);

  const result = await captureVisualAssets(capture, {
    async fallbackRasterProvider() {
      return cropBytes;
    }
  });

  assert.deepEqual(Array.from(result.assets["assets/fallback-1.png"]), Array.from(cropBytes));
});

test("asset capture records missing image sources and unsupported styles", async () => {
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

  const result = await captureVisualAssets(capture);

  assert.equal(result.diagnostics.counts.missingAssets, 1);
  assert.equal(result.diagnostics.counts.unsupportedStyles, 1);
  assert.equal(result.diagnostics.counts.fallbacks, 1);
  assert.equal(result.diagnostics.status, "warning");
  assert.equal(result.capture.root.children[1].fallbackRef, "assets/fallback-1.png");
});

test("asset capture packages inline svg and css mask icon assets", async () => {
  const svgDataUrl = "data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M4%202l4%204-4%204%22%2F%3E%3C%2Fsvg%3E";
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "svg",
          sourceNodeId: "dom-svg",
          rect: { x: 20, y: 20, width: 12, height: 12 },
          styles: {},
          attributes: {
            svgMarkup: "<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\"/></svg>"
          },
          children: []
        },
        {
          tagName: "span",
          sourceNodeId: "dom-mask-icon",
          rect: { x: 40, y: 20, width: 12, height: 12 },
          styles: {
            maskImage: `url(\"${svgDataUrl}\")`
          },
          attributes: {},
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture);

  assert.deepEqual(Object.keys(result.assets).sort(), [
    "assets/icon-1.svg",
    "assets/vector-1.svg"
  ]);
  assert.equal(result.capture.root.children[0].assetRef, "assets/vector-1.svg");
  assert.equal(result.capture.root.children[0].attributes.assetKind, "svg");
  assert.equal(result.capture.root.children[1].assetRef, "assets/icon-1.svg");
  assert.equal(result.capture.root.children[1].attributes.assetKind, "svg");
  assert.match(new TextDecoder().decode(result.assets["assets/vector-1.svg"]), /<path/);
  assert.match(new TextDecoder().decode(result.assets["assets/icon-1.svg"]), /<svg/);
});

test("asset capture keeps simple inline svg icons as vector assets", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "svg",
          sourceNodeId: "dom-svg-icon",
          rect: { x: 20, y: 20, width: 12, height: 12 },
          styles: {},
          attributes: {
            svgMarkup: "<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\"/></svg>"
          },
          children: [
            {
              tagName: "path",
              rect: { x: 20, y: 20, width: 12, height: 12 },
              styles: {},
              attributes: { d: "M4 2l4 4-4 4" },
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

  const result = await captureVisualAssets(capture);

  assert.deepEqual(Object.keys(result.assets), ["assets/vector-1.svg"]);
  assert.equal(result.capture.root.children[0].assetRef, "assets/vector-1.svg");
  assert.equal(result.capture.root.children[0].fallbackRef, undefined);
  assert.equal(result.capture.root.children[0].attributes.assetKind, "svg");
});

test("asset capture uses screenshot fallback for complex inline svg charts", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 375, height: 973 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "svg",
          sourceNodeId: "dom-chart",
          rect: { x: 80, y: 320, width: 512, height: 320 },
          styles: {},
          attributes: {
            svgMarkup:
              "<svg viewBox=\"0 0 512 320\"><g><rect x=\"12\" y=\"24\" width=\"8\" height=\"260\"/><rect x=\"36\" y=\"140\" width=\"8\" height=\"144\"/><rect x=\"60\" y=\"150\" width=\"8\" height=\"134\"/><rect x=\"84\" y=\"178\" width=\"8\" height=\"106\"/><rect x=\"108\" y=\"196\" width=\"8\" height=\"88\"/><text x=\"12\" y=\"304\">元大台灣50</text></g></svg>"
          },
          children: [
            {
              tagName: "g",
              rect: { x: 80, y: 320, width: 512, height: 320 },
              styles: {},
              attributes: {},
              children: [
                {
                  tagName: "rect",
                  rect: { x: 92, y: 344, width: 8, height: 260 },
                  styles: {},
                  attributes: {},
                  children: []
                },
                {
                  tagName: "rect",
                  rect: { x: 116, y: 460, width: 8, height: 144 },
                  styles: {},
                  attributes: {},
                  children: []
                },
                {
                  tagName: "rect",
                  rect: { x: 140, y: 470, width: 8, height: 134 },
                  styles: {},
                  attributes: {},
                  children: []
                },
                {
                  tagName: "rect",
                  rect: { x: 164, y: 498, width: 8, height: 106 },
                  styles: {},
                  attributes: {},
                  children: []
                },
                {
                  tagName: "rect",
                  rect: { x: 188, y: 516, width: 8, height: 88 },
                  styles: {},
                  attributes: {},
                  children: []
                },
                {
                  tagName: "text",
                  textContent: "元大台灣50",
                  rect: { x: 92, y: 624, width: 72, height: 18 },
                  styles: {},
                  attributes: {},
                  children: []
                }
              ]
            }
          ]
        }
      ]
    },
    { width: 375, height: 973, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com/etf",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );
  const cropBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 77]);
  const providerCalls = [];

  const result = await captureVisualAssets(capture, {
    async fallbackRasterProvider(node) {
      providerCalls.push(node.sourceNodeId);
      return cropBytes;
    }
  });

  assert.deepEqual(providerCalls, ["dom-chart"]);
  assert.deepEqual(Object.keys(result.assets), ["assets/fallback-1.png"]);
  assert.equal(result.capture.root.children[0].assetRef, undefined);
  assert.equal(result.capture.root.children[0].fallbackRef, "assets/fallback-1.png");
  assert.deepEqual(Array.from(result.assets["assets/fallback-1.png"]), Array.from(cropBytes));
  assert.equal(result.diagnostics.counts.fallbacks, 1);
  assert.deepEqual(result.diagnostics.fallbackReasons, [
    { sourceNodeId: "dom-chart", reason: "complex svg fallback" }
  ]);
});

test("asset capture packages pseudo-element css image assets", async () => {
  const svgDataUrl = "data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%3E%3Ccircle%20cx%3D%228%22%20cy%3D%228%22%20r%3D%228%22%2F%3E%3C%2Fsvg%3E";
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "::after",
          nodeType: "pseudo",
          sourceNodeId: "dom-verified-label-after",
          rect: { x: 148, y: 46, width: 16, height: 16 },
          styles: {
            display: "inline-block",
            backgroundImage: `url(\"${svgDataUrl}\")`
          },
          attributes: { "data-pseudo": "::after" },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-10T10:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture);
  const pseudo = result.capture.root.children[0];

  assert.deepEqual(Object.keys(result.assets), ["assets/icon-1.svg"]);
  assert.equal(pseudo.assetRef, "assets/icon-1.svg");
  assert.equal(pseudo.attributes.assetKind, "svg");
  assert.match(new TextDecoder().decode(result.assets["assets/icon-1.svg"]), /<circle/);
});

test("asset capture packages pseudo-element content URL image assets", async () => {
  const svgDataUrl = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgOCA5Ij48cGF0aCBkPSJNMiAybDQgNC00IDQiLz48L3N2Zz4=";
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "::after",
          nodeType: "pseudo",
          sourceNodeId: "dom-sort-after",
          textContent: "",
          rect: { x: 148, y: 46, width: 8, height: 21 },
          styles: {
            display: "block",
            content: `url(\"${svgDataUrl}\")`,
            backgroundImage: "none"
          },
          attributes: { "data-pseudo": "::after" },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-10T10:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture);
  const pseudo = result.capture.root.children[0];

  assert.deepEqual(Object.keys(result.assets), ["assets/icon-1.svg"]);
  assert.equal(pseudo.assetRef, "assets/icon-1.svg");
  assert.equal(pseudo.attributes.assetKind, "svg");
  assert.match(new TextDecoder().decode(result.assets["assets/icon-1.svg"]), /<path/);
});

test("asset capture uses lazy data-src svg when img src is a transparent placeholder", async () => {
  const placeholderGif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const plusSvg = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNNS43MTQzNiAwLjcxMzg2N1YxMC43MTM5TTAuNzE0MzU1IDUuNzEzODdIMTAuNzE0NCIgc3Ryb2tlPSIjQjBCMEIwIiBzdHJva2Utd2lkdGg9IjEuNDI4NTciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==";
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-lazy-plus",
          rect: { x: 20, y: 20, width: 12, height: 12 },
          styles: {},
          attributes: {
            currentSrc: placeholderGif,
            src: placeholderGif,
            "data-src": plusSvg
          },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture);
  const node = result.capture.root.children[0];

  assert.equal(node.assetRef, "assets/image-1.svg");
  assert.equal(node.attributes.assetKind, "svg");
  assert.equal(node.attributes.assetSource, plusSvg);
  assert.match(new TextDecoder().decode(result.assets["assets/image-1.svg"]), /stroke="#B0B0B0"/);
});

test("asset capture keeps non-placeholder currentSrc before lazy data-src", async () => {
  const svgDataSrc = "data:image/svg+xml,%3Csvg%2F%3E";
  const loadedPng = "data:image/png;base64,iVBORw0KGgo=";
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-loaded",
          rect: { x: 20, y: 20, width: 12, height: 12 },
          styles: {},
          attributes: {
            currentSrc: loadedPng,
            "data-src": svgDataSrc
          },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture);
  const node = result.capture.root.children[0];

  assert.equal(node.assetRef, "assets/image-1.png");
  assert.equal(node.attributes.assetKind, "raster");
  assert.equal(node.attributes.assetSource, loadedPng);
  assert.deepEqual(Array.from(result.assets["assets/image-1.png"]), [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("asset capture resolves remote image bytes and records fetch failures", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-remote-ok",
          rect: { x: 20, y: 20, width: 100, height: 100 },
          styles: {},
          attributes: { currentSrc: "https://cdn.example.com/chart.png" },
          children: []
        },
        {
          tagName: "img",
          sourceNodeId: "dom-remote-fail",
          rect: { x: 140, y: 20, width: 100, height: 100 },
          styles: {},
          attributes: { src: "https://cdn.example.com/missing.png" },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture, {
    async assetResolver(source) {
      if (source.url.includes("missing")) {
        throw new Error("not found");
      }
      return {
        bytes: new Uint8Array([137, 80, 78, 71]),
        contentType: "image/png"
      };
    }
  });

  assert.deepEqual(Array.from(result.assets["assets/image-1.png"]), [137, 80, 78, 71]);
  assert.equal(result.diagnostics.counts.missingAssets, 1);
  assert.deepEqual(result.diagnostics.missingAssets, ["dom-remote-fail"]);
  assert.match(new TextDecoder().decode(result.assets["assets/image-2.png"]), /asset fetch failed/);
});

test("asset capture rasterizes fetched WebP bytes before screenshot crop fallback", async () => {
  const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const rasterizedPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 91]);
  const screenshotCrop = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 13]);
  const calls = [];
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-logo",
          rect: { x: 20, y: 20, width: 140, height: 47 },
          styles: { objectFit: "contain" },
          attributes: { currentSrc: "https://cdn.example.com/logo.webp" },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture, {
    async assetResolver() {
      return {
        bytes: webpBytes,
        contentType: "image/webp"
      };
    },
    async imageRasterProvider(source, bytes, contentType) {
      calls.push(["image", source.sourceNodeId, bytes.byteLength, contentType]);
      return rasterizedPng;
    },
    async fallbackRasterProvider(node) {
      calls.push(["screenshot", node.sourceNodeId]);
      return screenshotCrop;
    }
  });

  assert.deepEqual(calls, [["image", "dom-logo", webpBytes.byteLength, "image/webp"]]);
  assert.equal(result.capture.root.children[0].assetRef, "assets/image-1.png");
  assert.equal(result.capture.root.children[0].attributes.assetKind, "raster");
  assert.deepEqual(Array.from(result.assets["assets/image-1.png"]), Array.from(rasterizedPng));
});

test("asset capture unwraps Nuxt IPX image URLs before resolving assets", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "img",
          sourceNodeId: "dom-avatar",
          rect: { x: 1355, y: 15, width: 34, height: 34 },
          styles: { objectFit: "cover" },
          attributes: {
            currentSrc: "https://pocketstudio.com.tw/_ipx/f_webp&q_85/https://fsv.cmoney.tw/cmstatic/head-icons/a53.gif",
            src: "/_ipx/f_webp&q_85/https://fsv.cmoney.tw/cmstatic/head-icons/a53.gif",
            srcset: "/_ipx/f_webp&amp;q_85/https://fsv.cmoney.tw/cmstatic/head-icons/a53.gif 1x, /_ipx/f_webp&amp;q_85/https://fsv.cmoney.tw/cmstatic/head-icons/a53.gif 2x"
          },
          children: []
        }
      ]
    },
    { width: 1440, height: 973, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://pocketstudio.com.tw",
      captureTimestamp: "2026-06-15T08:00:00.000Z"
    }
  );
  const gifBytes = Uint8Array.from([71, 73, 70, 56, 57, 97]);
  const resolvedSources = [];
  let fallbackCalls = 0;

  const result = await captureVisualAssets(capture, {
    async assetResolver(source) {
      resolvedSources.push(source.url);
      return {
        bytes: gifBytes,
        contentType: "image/gif"
      };
    },
    fallbackRasterProvider() {
      fallbackCalls += 1;
      return Uint8Array.from([137, 80, 78, 71]);
    }
  });
  const avatar = result.capture.root.children[0];

  assert.deepEqual(resolvedSources, ["https://fsv.cmoney.tw/cmstatic/head-icons/a53.gif"]);
  assert.equal(fallbackCalls, 0);
  assert.equal(avatar.assetRef, "assets/image-1.gif");
  assert.equal(avatar.attributes.assetKind, "raster");
  assert.equal(avatar.attributes.assetSource, "https://fsv.cmoney.tw/cmstatic/head-icons/a53.gif");
  assert.deepEqual(Array.from(result.assets["assets/image-1.gif"]), Array.from(gifBytes));
  assert.deepEqual(result.sourceNodeMap, [
    { sourceNodeId: "dom-avatar", assetRef: "assets/image-1.gif" }
  ]);
  assert.equal(result.diagnostics.counts.fallbacks, 0);
});

test("css image URL extraction ignores unsupported gradients", () => {
  assert.equal(firstCssImageUrl("linear-gradient(red, blue)"), null);
  assert.equal(firstCssImageUrl("url('data:image/svg+xml,%3Csvg%2F%3E')"), "data:image/svg+xml,%3Csvg%2F%3E");
});

test("asset capture keeps CSS background image assets on nodes with children", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 400, height: 120 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "div",
          sourceNodeId: "dom-logo",
          rect: { x: 20, y: 10, width: 90, height: 46 },
          styles: {
            backgroundImage: "url(\"https://cdn.example.com/logo.svg\")",
            backgroundSize: "100% auto"
          },
          attributes: {},
          children: [
            {
              tagName: "span",
              sourceNodeId: "dom-logo-version",
              textContent: "v6.11.0",
              rect: { x: 88, y: 44, width: 36, height: 8 },
              styles: { color: "rgb(133, 133, 133)", fontSize: "12px" },
              attributes: {},
              children: []
            }
          ]
        }
      ]
    },
    { width: 400, height: 120, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://example.com",
      captureTimestamp: "2026-06-16T02:47:01.730Z"
    }
  );
  const svgBytes = new TextEncoder().encode("<svg viewBox=\"0 0 90 46\"></svg>");

  const result = await captureVisualAssets(capture, {
    async assetResolver(source) {
      assert.equal(source.assetKind, "svg");
      assert.equal(source.sourceNodeId, "dom-logo");
      return {
        bytes: svgBytes,
        contentType: "image/svg+xml"
      };
    }
  });
  const logo = result.capture.root.children[0];

  assert.equal(logo.assetRef, "assets/icon-1.svg");
  assert.equal(logo.attributes.assetKind, "svg");
  assert.equal(logo.attributes.assetRole, "css-background");
  assert.equal(logo.children[0].textContent, "v6.11.0");
  assert.deepEqual(Array.from(result.assets["assets/icon-1.svg"]), Array.from(svgBytes));
  assert.deepEqual(result.sourceNodeMap, [
    { sourceNodeId: "dom-logo", assetRef: "assets/icon-1.svg" }
  ]);
});

test("closed shadow host becomes screenshot crop fallback with reason", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "my-locked-widget",
          sourceNodeId: "dom-closed-host",
          rect: { x: 40, y: 40, width: 320, height: 160 },
          styles: {},
          attributes: { "data-closed-shadow-root": "true" },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/components",
      captureTimestamp: "2026-06-12T08:00:00.000Z"
    }
  );

  const croppedBytes = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4]);
  const result = await captureVisualAssets(capture, {
    fallbackRasterProvider: () => croppedBytes
  });

  const host = result.capture.root.children[0];
  assert.equal(host.fallbackRef, "assets/fallback-1.png");
  assert.deepEqual(Array.from(result.assets["assets/fallback-1.png"]), Array.from(croppedBytes));
  assert.deepEqual(result.diagnostics.fallbackReasons, [
    { sourceNodeId: "dom-closed-host", reason: "closed shadow root fallback" }
  ]);
  assert.equal(result.diagnostics.counts.missingAssets, 0);
});

test("closed shadow host crop failure records missing asset without blocking export", async () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      styles: {},
      attributes: {},
      children: [
        {
          tagName: "my-locked-widget",
          sourceNodeId: "dom-closed-host",
          rect: { x: 40, y: 40, width: 320, height: 160 },
          styles: {},
          attributes: { "data-closed-shadow-root": "true" },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/components",
      captureTimestamp: "2026-06-12T08:00:00.000Z"
    }
  );

  const result = await captureVisualAssets(capture);

  const host = result.capture.root.children[0];
  assert.equal(host.fallbackRef, "assets/fallback-1.png");
  assert.deepEqual(Array.from(result.assets["assets/fallback-1.png"]), Array.from(TRANSPARENT_PNG));
  assert.deepEqual(result.diagnostics.fallbackReasons, [
    { sourceNodeId: "dom-closed-host", reason: "closed shadow root fallback" }
  ]);
  assert.equal(result.diagnostics.counts.missingAssets, 1);
  assert.deepEqual(result.diagnostics.missingAssets, ["dom-closed-host"]);
});
