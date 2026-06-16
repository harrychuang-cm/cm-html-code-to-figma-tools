import assert from "node:assert/strict";
import test from "node:test";
import {
  createFigcaptureFileMap,
  packFigcapture,
  packFigcaptureFiles,
  packMultiCaptureFigcapture
} from "../../../packages/capture-schema/dist/index.js";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import {
  importPackageBytes,
  registerFigmaPluginRuntime
} from "../dist/code-module.js";
import {
  DEFAULT_IMPORT_PACKAGE_CHUNK_SIZE,
  createImportPackageTransferMessages,
  createImportPackageMessage,
  postImportPackageFile,
  readFileAsImportPackageMessage
} from "../dist/message-bridge.js";
import {
  createFigmaApiAdapter,
  createMockFigmaApi,
  fontNamesFromStyle,
  isSupportedRasterImage
} from "../dist/figma-adapter.js";
import { renderIncomingMessage } from "../dist/ui.js";

function createRuntimePackage(overrides = {}) {
  const base = createValidPackage();
  return {
    ...base,
    capture: {
      ...base.capture,
      root: {
        ...base.capture.root,
        children: [
          {
            id: "node-card",
            sourceNodeId: "dom-card",
            nodeType: "element",
            tagName: "section",
            rect: { x: 24, y: 32, width: 320, height: 180 },
            styles: {
              backgroundColor: "rgb(255, 255, 255)",
              borderTopWidth: "1px",
              borderTopColor: "rgb(229, 231, 235)",
              borderTopLeftRadius: "8px",
              boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)",
              zIndex: "3"
            },
            attributes: { class: "card" },
            children: []
          },
          {
            id: "node-text",
            sourceNodeId: "dom-text",
            nodeType: "text",
            tagName: "#text",
            textContent: "Revenue",
            rect: { x: 40, y: 48, width: 120, height: 28 },
            styles: {
              fontFamily: "Unavailable Sans",
              fontSize: "20px",
              fontWeight: "600",
              color: "rgb(17, 24, 39)"
            },
            attributes: {},
            children: []
          },
          {
            id: "node-image",
            sourceNodeId: "dom-image",
            nodeType: "element",
            tagName: "img",
            rect: { x: 40, y: 88, width: 220, height: 100 },
            styles: {},
            attributes: { alt: "Chart" },
            assetRef: "assets/image-1.png",
            children: []
          },
          {
            id: "node-canvas",
            sourceNodeId: "dom-canvas",
            nodeType: "element",
            tagName: "canvas",
            rect: { x: 280, y: 88, width: 80, height: 100 },
            styles: {},
            attributes: {},
            fallbackRef: "assets/fallback-1.png",
            children: []
          },
          {
            id: "node-svg",
            sourceNodeId: "dom-svg",
            nodeType: "element",
            tagName: "svg",
            rect: { x: 380, y: 88, width: 12, height: 12 },
            styles: {},
            attributes: { assetKind: "svg" },
            assetRef: "assets/vector-1.svg",
            children: []
          }
        ]
      }
    },
    diagnostics: {
      ...base.diagnostics,
      fallbackReasons: [
        { sourceNodeId: "dom-canvas", reason: "canvas fallback" }
      ],
      counts: {
        fallbacks: 1,
        missingAssets: 0,
        unsupportedStyles: 1
      }
    },
    assets: {
      "assets/image-1.png": new Uint8Array([1, 2, 3]),
      "assets/fallback-1.png": new Uint8Array([4, 5, 6]),
      "assets/vector-1.svg": new TextEncoder().encode("<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\"/></svg>")
    },
    ...overrides
  };
}

test("Figma API adapter creates real frame, image, text, rectangle, fallback, and auto layout nodes", async () => {
  let imageCreateCount = 0;
  const figmaApi = {
    ...createMockFigmaApi({ unavailableFamilies: ["Unavailable Sans"] }),
    createImage(bytes) {
      imageCreateCount += 1;
      if (!isSupportedRasterImage(bytes)) {
        throw new Error("Unsupported image bytes");
      }
      return {
        hash: `hash-${bytes.length}`
      };
    }
  };
  const packageData = createRuntimePackage();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: packageData.assets
  });

  const result = await importPackageBytes(packFigcapture(packageData), {
    adapter
  });

  assert.equal(result.status, "success");
  assert.equal(result.renderResult.frames.length, 2);
  assert(result.renderResult.frames.every((frame) => frame.width === 1440 && frame.height === 900));
  assert.equal(result.renderResult.frames[0].children[0].locked, true);
  assert.equal(result.renderResult.frames[0].children[0].imageHash, "hash-4");
  assert.equal(result.renderResult.frames[0].children[0].fills[0].scaleMode, "CROP");
  assert.deepEqual(result.renderResult.frames[0].children[0].fills[0].imageTransform, [
    [1, 0, 0],
    [0, 1, 0]
  ]);
  assert.equal(imageCreateCount, 1);
  const editableNodes = flattenNodes(result.renderResult.frames[1].children);
  const cardNode = editableNodes.find((node) => node.pluginData?.sourceNodeId === "dom-card");
  assert.equal(editableNodes.some((node) => node.type === "TEXT" && node.characters === "Revenue"), true);
  assert.equal(editableNodes.some((node) => node.type === "RECTANGLE" && node.cornerRadius === 8), true);
  assert.equal(cardNode.pluginData.cssZIndex, "3");
  const vectorNode = editableNodes.find((node) => node.type === "VECTOR" && node.assetRef === "assets/vector-1.svg");
  assert(vectorNode);
  assert.match(vectorNode.svg, /<path/);
  const imagePlaceholder = editableNodes.find((node) => node.assetRef === "assets/image-1.png");
  assert(imagePlaceholder);
  assert.equal(imagePlaceholder.fills[0].type, "SOLID");
  assert.equal(imagePlaceholder.fallbackReason, "external or unsupported image asset");
  assert.equal(editableNodes.some((node) => node.fallbackReason === "canvas fallback"), true);
  assert.equal(result.report.createdFrameCount, 2);
  assert.equal(result.report.fontSubstitutions.length, 1);
  assert.deepEqual(result.report.fontSubstitutions[0].used, { family: "Inter", style: "Regular" });
});

test("Figma API adapter maps browser-ordered CSS box-shadow values to effects", async () => {
  const figmaApi = createMockFigmaApi();
  const basePackage = createRuntimePackage();
  const packageData = createRuntimePackage({
    capture: {
      ...basePackage.capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 700, height: 560 },
        styles: {},
        attributes: {},
        children: [{
          id: "node-chat-panel",
          sourceNodeId: "dom-chat-panel",
          nodeType: "element",
          tagName: "div",
          rect: { x: 40, y: 20, width: 601, height: 520 },
          styles: {
            borderTopLeftRadius: "15px",
            borderTopRightRadius: "15px",
            borderBottomRightRadius: "15px",
            borderBottomLeftRadius: "15px",
            boxShadow: "rgba(0, 0, 0, 0.2) 0px 4px 36px 0px"
          },
          attributes: { class: "chat__area" },
          children: []
        }]
      }
    }
  });

  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const panel = flattenNodes(result.renderResult.frames[1].children)
    .find((node) => node.pluginData?.sourceNodeId === "dom-chat-panel");

  assert.equal(result.status, "success");
  assert(panel);
  assert.deepEqual(panel.effects, [{
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.2 },
    offset: { x: 0, y: 4 },
    radius: 36,
    spread: 0,
    visible: true,
    blendMode: "NORMAL"
  }]);
});

test("Figma API adapter falls back to a screenshot crop when a raster asset cannot decode", async () => {
  const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const screenshotBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const figmaApi = {
    ...createMockFigmaApi(),
    createImage(bytes) {
      if (bytes[0] === 0x52 && bytes[8] === 0x57) {
        throw new Error("Unsupported WebP");
      }
      return {
        hash: `hash-${bytes.length}`
      };
    }
  };
  const basePackage = createRuntimePackage();
  const packageData = createRuntimePackage({
    manifest: {
      ...basePackage.manifest,
      viewportWidth: 390,
      viewportHeight: 844
    },
    capture: {
      ...basePackage.capture,
      viewport: { width: 390, height: 844, devicePixelRatio: 3, scrollX: 0, scrollY: 0 },
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 390, height: 844 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-banner",
            sourceNodeId: "dom-banner",
            nodeType: "element",
            tagName: "img",
            rect: { x: 0, y: 159, width: 390, height: 93.75 },
            styles: {},
            attributes: { alt: "banner" },
            assetRef: "assets/banner.webp",
            children: []
          }
        ]
      }
    },
    screenshot: screenshotBytes,
    assets: {
      "assets/banner.webp": webpBytes
    }
  });

  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const editableNodes = flattenNodes(result.renderResult.frames[1].children);
  const banner = editableNodes.find((node) => node.pluginData?.sourceNodeId === "dom-banner");

  assert.equal(result.status, "success");
  assert(banner);
  assert.equal(banner.type, "RECTANGLE");
  assert.equal(banner.name, "Image / banner / Screenshot Crop");
  assert.equal(banner.pluginData.assetRef, "assets/banner.webp");
  assert.match(banner.pluginData.fallbackReason, /screenshot crop fallback/);
  assert.equal(banner.children.length, 0);
  assert.equal(banner.fills[0].scaleMode, "CROP");
  assert.equal(banner.fills[0].imageHash, "hash-4");
  assert.deepEqual(banner.fills[0].imageTransform, [
    [1, 0, 0],
    [0, 0.11, 0.19]
  ]);
});

test("Figma API adapter falls back to a screenshot crop when an image asset is unsupported", async () => {
  const screenshotBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const figmaApi = createMockFigmaApi();
  const basePackage = createRuntimePackage();
  const packageData = createRuntimePackage({
    manifest: {
      ...basePackage.manifest,
      viewportWidth: 390,
      viewportHeight: 844
    },
    capture: {
      ...basePackage.capture,
      viewport: { width: 390, height: 844, devicePixelRatio: 3, scrollX: 0, scrollY: 0 },
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 390, height: 844 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-product",
            sourceNodeId: "dom-product",
            nodeType: "element",
            tagName: "img",
            rect: { x: 24, y: 332, width: 156, height: 208 },
            styles: {},
            attributes: { alt: "product" },
            assetRef: "assets/product.json",
            children: []
          }
        ]
      }
    },
    screenshot: screenshotBytes,
    assets: {
      "assets/product.json": new TextEncoder().encode(JSON.stringify({
        kind: "external-image-reference",
        src: "https://example.com/product.png"
      }))
    }
  });

  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const editableNodes = flattenNodes(result.renderResult.frames[1].children);
  const product = editableNodes.find((node) => node.pluginData?.sourceNodeId === "dom-product");

  assert.equal(result.status, "success");
  assert(product);
  assert.equal(product.type, "RECTANGLE");
  assert.equal(product.name, "Image / product / Screenshot Crop");
  assert.match(product.pluginData.fallbackReason, /screenshot crop fallback/);
  assert.equal(product.children.length, 0);
  assert.equal(product.fills[0].scaleMode, "CROP");
  assert.deepEqual(product.fills[0].imageTransform, [
    [0.4, 0, 0.06],
    [0, 0.25, 0.39]
  ]);
});

test("Figma API adapter falls back to a full-page screenshot crop when a contained raster asset has the wrong aspect ratio", async () => {
  const screenshotBytes = pngHeaderBytes(2880, 11764);
  const figmaApi = createMockFigmaApi();
  const basePackage = createRuntimePackage();
  const packageData = createRuntimePackage({
    manifest: {
      ...basePackage.manifest,
      captureMode: "full-page",
      viewportWidth: 1440,
      viewportHeight: 973,
      documentWidth: 1440,
      documentHeight: 5882
    },
    capture: {
      ...basePackage.capture,
      viewport: { width: 1440, height: 973, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 1440, height: 5882 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-logo",
            sourceNodeId: "dom-logo",
            nodeType: "element",
            tagName: "img",
            rect: { x: 40, y: 6, width: 156, height: 52 },
            styles: { objectFit: "contain" },
            attributes: { alt: "Logo" },
            assetRef: "assets/logo.png",
            children: []
          }
        ]
      }
    },
    screenshot: screenshotBytes,
    assets: {
      "assets/logo.png": pngHeaderBytes(312, 628)
    }
  });

  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const editableNodes = flattenNodes(result.renderResult.frames[1].children);
  const logo = editableNodes.find((node) => node.pluginData?.sourceNodeId === "dom-logo");

  assert.equal(result.status, "success");
  assert(logo);
  assert.equal(logo.type, "RECTANGLE");
  assert.equal(logo.name, "Image / Logo / Screenshot Crop");
  assert.equal(logo.children.length, 0);
  assert.equal(logo.fills[0].scaleMode, "CROP");
  assert.deepEqual(logo.fills[0].imageTransform, [
    [0.11, 0, 0.03],
    [0, 0.01, 0]
  ]);
  assert.match(logo.pluginData.fallbackReason, /asset aspect ratio mismatch/);
});

test("Figma API adapter uses source screenshot tiles for contained raster crop fallback", () => {
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {
      "assets/logo.png": pngHeaderBytes(280, 46),
      "assets/source-screenshot/tile-0000.png": pngHeaderBytes(2880, 1786),
      "assets/source-screenshot/tile-0001.png": pngHeaderBytes(2880, 1787),
      "assets/source-screenshot/tile-0002.png": pngHeaderBytes(2880, 1786),
      "assets/source-screenshot/tile-0003.png": pngHeaderBytes(2880, 1786),
      "assets/source-screenshot/tile-0004.png": pngHeaderBytes(2880, 1786),
      "assets/source-screenshot/tile-0005.png": pngHeaderBytes(2880, 1787),
      "assets/source-screenshot/tile-0006.png": pngHeaderBytes(2880, 1786),
      "assets/source-screenshot/tile-0007.png": pngHeaderBytes(2880, 1786),
      "assets/source-screenshot/tile-0008.png": pngHeaderBytes(2880, 1786),
      "assets/source-screenshot/tile-0009.png": pngHeaderBytes(2880, 308)
    },
    screenshot: pngHeaderBytes(2880, 16384),
    viewport: { width: 1440, height: 16510 }
  });

  const logo = adapter.createImageLayer({
    name: "Image / Footer Logo",
    assetRef: "assets/logo.png",
    x: 40,
    y: 16232.61,
    width: 140,
    height: 47,
    rect: { x: 40, y: 16232.61, width: 140, height: 47 },
    absoluteRect: { x: 40, y: 16232.61, width: 140, height: 47 },
    style: { objectFit: "contain" }
  });

  assert.equal(logo.type, "RECTANGLE");
  assert.equal(logo.name, "Image / Footer Logo / Screenshot Crop");
  assert.equal(logo.children.length, 0);
  assert.equal(logo.pluginData.cropAssetRef, "assets/source-screenshot/tile-0009.png");
  assert.equal(logo.fills[0].scaleMode, "CROP");
  assert.deepEqual(logo.fills[0].imageTransform, [
    [0.1, 0, 0.03],
    [0, 0.15, 0.11]
  ]);
  assert.match(logo.pluginData.fallbackReason, /asset aspect ratio mismatch/);
});

test("Figma API adapter maps contained raster images to FIT without screenshot crop", () => {
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {
      "assets/logo.png": pngHeaderBytes(312, 104)
    },
    screenshot: pngHeaderBytes(2880, 16384),
    viewport: { width: 1440, height: 16510 }
  });

  const logo = adapter.createImageLayer({
    name: "Image / Logo",
    assetRef: "assets/logo.png",
    x: 40,
    y: 6,
    width: 156,
    height: 52,
    rect: { x: 40, y: 6, width: 156, height: 52 },
    style: { objectFit: "contain" }
  });

  assert.equal(logo.type, "RECTANGLE");
  assert.equal(logo.fills[0].type, "IMAGE");
  assert.equal(logo.fills[0].scaleMode, "FIT");
  assert.equal(logo.pluginData.fallbackReason, undefined);
});

test("Figma API adapter applies side-specific strokes for rounded partial borders", async () => {
  const figmaApi = createMockFigmaApi();
  const basePackage = createRuntimePackage();
  const packageData = createRuntimePackage({
    capture: {
      ...basePackage.capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 390, height: 120 },
        styles: {},
        attributes: {},
        children: [{
          id: "node-more-button",
          sourceNodeId: "dom-more-button",
          nodeType: "element",
          tagName: "button",
          textContent: "更多",
          rect: { x: 322.93, y: 60, width: 67.07, height: 48 },
          styles: {
            display: "flex",
            width: "67.0703px",
            height: "48px",
            paddingLeft: "8px",
            paddingRight: "8px",
            borderTopWidth: "1px",
            borderTopStyle: "solid",
            borderTopColor: "rgb(229, 229, 229)",
            borderLeftWidth: "1px",
            borderLeftStyle: "solid",
            borderLeftColor: "rgb(229, 229, 229)",
            borderTopLeftRadius: "100px",
            borderTopRightRadius: "4px",
            borderBottomRightRadius: "4px",
            borderBottomLeftRadius: "100px",
            fontSize: "16px",
            lineHeight: "24px"
          },
          attributes: { type: "button" },
          children: []
        }]
      }
    }
  });

  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const nodes = flattenNodes(result.renderResult.frames[1].children);
  const button = nodes.find((node) => node.type === "FRAME" && node.pluginData?.sourceNodeId === "dom-more-button");

  assert.equal(result.status, "success");
  assert(button);
  assert.equal(button.cornerRadius, 100);
  assert.equal(button.strokeAlign, "INSIDE");
  assert.equal(button.strokeTopWeight, 1);
  assert.equal(button.strokeRightWeight, 0);
  assert.equal(button.strokeBottomWeight, 0);
  assert.equal(button.strokeLeftWeight, 1);
  assert.equal(button.children.some((node) => /^Border \//.test(node.name)), false);
});

test("Figma API adapter tries CSS font-family stack before default fallback", async () => {
  const figmaApi = createMockFigmaApi({
    unavailableFonts: [
      { family: "Missing Webfont", style: "Bold Italic" },
      { family: "Missing Webfont", style: "Regular" },
      { family: "Available Sans", style: "Bold Italic" }
    ]
  });
  const packageData = createRuntimePackage({
    capture: {
      ...createRuntimePackage().capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 400, height: 120 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-title",
            sourceNodeId: "dom-title",
            nodeType: "text",
            tagName: "#text",
            textContent: "Title",
            rect: { x: 24, y: 24, width: 80, height: 24 },
            styles: {
              fontFamily: "\"Missing Webfont\", \"Available Sans\", sans-serif",
              fontStyle: "italic",
              fontWeight: "700",
              fontSize: "16px",
              lineHeight: "24px",
              color: "rgb(17, 24, 39)"
            },
            attributes: {},
            children: []
          }
        ]
      }
    }
  });

  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const title = flattenNodes(result.renderResult.frames[1].children).find((node) => node.sourceNodeId === "dom-title");

  assert.deepEqual(fontNamesFromStyle({
    fontFamily: "\"Missing Webfont\", \"Available Sans\", sans-serif",
    fontStyle: "italic",
    fontWeight: "700"
  }), [
    { family: "Missing Webfont", style: "Bold Italic" },
    { family: "Available Sans", style: "Bold Italic" },
    { family: "Missing Webfont", style: "Regular" },
    { family: "Available Sans", style: "Regular" }
  ]);
  assert.deepEqual(title.fontName, { family: "Available Sans", style: "Regular" });
  assert.equal(result.report.fontSubstitutions.length, 1);
  assert.deepEqual(result.report.fontSubstitutions[0].requested, { family: "Missing Webfont", style: "Bold Italic" });
  assert.deepEqual(result.report.fontSubstitutions[0].used, { family: "Available Sans", style: "Regular" });
  assert.equal(result.report.fontSubstitutionSummary, "Missing Webfont Bold Italic -> Available Sans Regular");
  assert.deepEqual(figmaApi.loadedFonts.map((font) => `${font.family} ${font.style}`), [
    "Missing Webfont Bold Italic",
    "Available Sans Bold Italic",
    "Missing Webfont Regular",
    "Available Sans Regular"
  ]);
});

test("Figma API adapter maps CSS medium font weight to a medium font style", async () => {
  const figmaApi = createMockFigmaApi({
    unavailableFonts: [
      { family: "Noto Sans TC", style: "Medium" }
    ]
  });
  const basePackage = createRuntimePackage();
  const packageData = createRuntimePackage({
    capture: {
      ...basePackage.capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 240, height: 80 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-medium",
            sourceNodeId: "dom-medium",
            nodeType: "text",
            tagName: "#text",
            textContent: "安聯台灣科技基金",
            rect: { x: 16, y: 16, width: 126, height: 48 },
            styles: {
              fontFamily: "Inter, \"Noto Sans TC\", \"Pingfang TC\", sans-serif",
              fontSize: "16px",
              fontWeight: "500",
              lineHeight: "24px",
              color: "rgb(54, 54, 54)"
            },
            attributes: {},
            children: []
          }
        ]
      }
    }
  });

  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const mediumText = flattenNodes(result.renderResult.frames[1].children)
    .find((node) => node.sourceNodeId === "dom-medium");

  assert.deepEqual(fontNamesFromStyle({
    fontFamily: "Inter, \"Noto Sans TC\", \"Pingfang TC\", sans-serif",
    fontWeight: "500"
  }, undefined, "安聯台灣科技基金"), [
    { family: "Noto Sans TC", style: "Medium" },
    { family: "Pingfang TC", style: "Medium" },
    { family: "Inter", style: "Medium" },
    { family: "Noto Sans TC", style: "Regular" },
    { family: "Pingfang TC", style: "Regular" },
    { family: "Inter", style: "Regular" }
  ]);
  assert.deepEqual(fontNamesFromStyle({
    fontFamily: "Inter",
    fontWeight: "600"
  }), [
    { family: "Inter", style: "Semi Bold" },
    { family: "Inter", style: "SemiBold" },
    { family: "Inter", style: "Semibold" },
    { family: "Inter", style: "Demi Bold" },
    { family: "Inter", style: "DemiBold" },
    { family: "Inter", style: "Bold" },
    { family: "Inter", style: "Regular" }
  ]);
  assert.deepEqual(mediumText.fontName, { family: "Pingfang TC", style: "Medium" });
});

test("Figma API adapter chooses auto-width and fixed-width text modes", async () => {
  const figmaApi = createMockFigmaApi();
  const packageData = createRuntimePackage({
    capture: {
      ...createRuntimePackage().capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 400, height: 180 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-user-name",
            sourceNodeId: "dom-user-name",
            nodeType: "text",
            tagName: "#text",
            textContent: "harry_chuang",
            rect: { x: 24, y: 8, width: 108, height: 24 },
            styles: {
              fontFamily: "Inter",
              fontSize: "16px",
              fontWeight: "700",
              lineHeight: "24px",
              color: "rgb(22, 22, 22)"
            },
            attributes: {},
            children: []
          },
          {
            id: "node-long-topic",
            sourceNodeId: "dom-long-topic",
            nodeType: "text",
            tagName: "#text",
            textContent: "費半狂瀉點燃賣壓，台股寫史上最大盤中跌點！",
            rect: { x: 24, y: 24, width: 244, height: 40 },
            styles: {
              fontFamily: "Inter",
              fontSize: "16px",
              fontWeight: "700",
              lineHeight: "20px",
              color: "rgb(22, 22, 22)"
            },
            attributes: {},
            children: []
          },
          {
            id: "node-price",
            sourceNodeId: "dom-price",
            nodeType: "text",
            tagName: "#text",
            textContent: "48.35",
            rect: { x: 24, y: 84, width: 47, height: 24 },
            styles: {
              fontFamily: "Inter",
              fontSize: "16px",
              fontWeight: "700",
              lineHeight: "24px",
              color: "rgb(255, 255, 255)",
              backgroundColor: "rgb(0, 131, 83)",
              borderTopLeftRadius: "2px"
            },
            attributes: {},
            children: []
          },
          {
            id: "node-outline-button",
            sourceNodeId: "dom-outline-button",
            nodeType: "element",
            tagName: "button",
            rect: { x: 80, y: 132, width: 120, height: 36 },
            styles: {
              display: "inline-flex",
              backgroundColor: "rgba(0, 0, 0, 0)",
              outlineWidth: "2px",
              outlineStyle: "solid",
              outlineColor: "rgb(31, 95, 191)",
              borderTopLeftRadius: "6px",
              borderTopRightRadius: "6px",
              borderBottomRightRadius: "6px",
              borderBottomLeftRadius: "6px"
            },
            attributes: { class: "btn btn-outline" },
            children: [
              {
                id: "node-outline-button-text",
                sourceNodeId: "dom-outline-button-text",
                nodeType: "text",
                tagName: "#text",
                textContent: "取消",
                rect: { x: 124, y: 140, width: 32, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "14px",
                  fontWeight: "400",
                  lineHeight: "20px",
                  color: "rgb(31, 95, 191)"
                },
                attributes: {},
                children: []
              }
            ]
          }
        ]
      }
    }
  });
  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const editableNodes = flattenNodes(result.renderResult.frames[1].children);
  const userName = editableNodes.find((node) => node.type === "TEXT" && node.characters === "harry_chuang");
  const longTopic = editableNodes.find((node) => node.type === "TEXT" && node.characters.includes("費半狂瀉"));
  const backing = editableNodes.find((node) => node.type === "FRAME" && node.sourceNodeId === "dom-price");
  const price = flattenNodes([backing]).find((node) => node.type === "TEXT" && node.characters === "48.35");
  const outlineButton = editableNodes.find((node) => node.type === "FRAME" && node.sourceNodeId === "dom-outline-button");

  assert.equal(userName.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(userName.layoutSizingHorizontal, "HUG");
  assert.equal(userName.layoutSizingVertical, "HUG");
  assert.equal(userName.layoutGrow, 0);
  assert.equal(longTopic.width, 244);
  assert.equal(longTopic.textAutoResize, "HEIGHT");
  assert.equal(longTopic.layoutSizingHorizontal, "FIXED");
  assert.equal(longTopic.layoutSizingVertical, "HUG");
  assert(backing);
  assert.equal(backing.fills[0].type, "SOLID");
  assert.equal(backing.cornerRadius, 2);
  assert.equal(price.width, 47);
  assert.equal(price.textAutoResize, "HEIGHT");
  assert.equal(price.layoutSizingHorizontal, "FIXED");
  assert.equal(price.layoutSizingVertical, "HUG");
  assert.deepEqual(price.fills[0].color, { r: 1, g: 1, b: 1 });
  assert(outlineButton);
  assert.equal(outlineButton.strokeWeight, 2);
  assert.deepEqual(outlineButton.strokes[0].color, { r: 31 / 255, g: 95 / 255, b: 191 / 255 });
});

test("Figma API adapter applies CSS flex alignment to Auto Layout nodes", async () => {
  const figmaApi = createMockFigmaApi();
  const packageData = createRuntimePackage({
    capture: {
      ...createRuntimePackage().capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 400, height: 120 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-top-menu",
            sourceNodeId: "dom-top-menu",
            nodeType: "element",
            tagName: "ul",
            rect: { x: 0, y: 0, width: 300, height: 28 },
            styles: {
              display: "flex",
              flexDirection: "row",
              gap: "16px",
              alignItems: "center",
              justifyContent: "center"
            },
            attributes: {},
            children: [
              {
                id: "node-label",
                sourceNodeId: "dom-label",
                nodeType: "text",
                tagName: "#text",
                textContent: "理財寶商城",
                rect: { x: 100, y: 0, width: 60, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "12px",
                  lineHeight: "20px",
                  color: "rgb(255, 255, 255)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-chev",
                sourceNodeId: "dom-chev",
                nodeType: "element",
                tagName: "span",
                rect: { x: 176, y: 0, width: 12, height: 12 },
                styles: {
                  backgroundColor: "rgb(255, 255, 255)"
                },
                attributes: {},
                children: []
              }
            ]
          }
        ]
      }
    }
  });
  const result = await importPackageBytes(packFigcapture(packageData), { figmaApi });
  const editableNodes = flattenNodes(result.renderResult.frames[1].children);
  const topMenu = editableNodes.find((node) => node.sourceNodeId === "dom-top-menu");
  const label = editableNodes.find((node) => node.sourceNodeId === "dom-label");

  assert.equal(topMenu.layoutMode, "HORIZONTAL");
  assert.equal(topMenu.counterAxisAlignItems, "CENTER");
  assert.equal(topMenu.primaryAxisAlignItems, "CENTER");
  assert.equal(topMenu.paddingTop, 0);
  assert.equal(topMenu.paddingBottom, 0);
  assert.equal(topMenu.paddingLeft, 0);
  assert.equal(topMenu.paddingRight, 0);
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.layoutSizingVertical, "HUG");
});

test("Figma API adapter reapplies absolute positioning after appending to auto layout parent", () => {
  const createdNodes = [];
  function createNode(type) {
    const node = {
      type,
      name: "",
      children: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fills: [],
      strokes: [],
      pluginData: {},
      _layoutPositioning: "",
      resize(width, height) {
        this.width = width;
        this.height = height;
      },
      appendChild(child) {
        child.parent = this;
        this.children.push(child);
      },
      setPluginData(key, value) {
        this.pluginData[key] = value;
      }
    };
    Object.defineProperty(node, "layoutPositioning", {
      get() {
        return this._layoutPositioning;
      },
      set(value) {
        if (!this.parent) {
          throw new Error("layoutPositioning requires an auto-layout parent");
        }
        this._layoutPositioning = value;
      }
    });
    createdNodes.push(node);
    return node;
  }

  const figmaApi = {
    createdNodes,
    createFrame() {
      return createNode("FRAME");
    },
    createRectangle() {
      return createNode("RECTANGLE");
    }
  };
  const adapter = createFigmaApiAdapter(figmaApi);
  const parent = adapter.createFrameLayer({
    name: "Radio Group",
    rect: { x: 0, y: 0, width: 104, height: 24 },
    style: { fills: ["rgb(228, 228, 228)"], strokes: [], effects: [], text: null },
    autoLayout: {
      applied: true,
      layoutMode: "HORIZONTAL",
      itemSpacing: 4,
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 2,
      paddingBottom: 2
    },
    children: []
  });
  const childModel = {
    name: "Active Indicator",
    rect: { x: 2, y: 2, width: 48, height: 20 },
    style: { fills: ["rgb(255, 255, 255)"], strokes: [], effects: [], text: null },
    layoutPositioning: "ABSOLUTE",
    children: []
  };
  const child = adapter.createRectLayer(childModel);

  assert.equal(child.layoutPositioning, "");
  adapter.appendChild(parent, child, childModel);
  assert.equal(child.layoutPositioning, "ABSOLUTE");
});

test("Figma API adapter preserves SVG image aspect ratio and CSS rotation", () => {
  const svgBytes = new TextEncoder().encode(
    "<svg width=\"10\" height=\"17\" viewBox=\"0 0 10 17\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L10 8.5L0 17Z\" fill=\"#676767\"/></svg>"
  );
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {
      "assets/arrow.svg": svgBytes
    }
  });

  const node = adapter.createImageLayer({
    name: "Vector / Next",
    sourceNodeId: "dom-arrow",
    assetRef: "assets/arrow.svg",
    assetKind: "svg",
    rect: { x: 100, y: 40, width: 16, height: 16 },
    style: {
      objectFit: "fill",
      transform: "matrix(-1, 0, 0, -1, 0, 0)",
      transformOrigin: "8px 8px"
    }
  });

  assert.equal(node.type, "FRAME");
  assert.equal(node.width, 16);
  assert.equal(node.height, 16);
  assert.equal(node.children.length, 1);
  const vector = node.children[0];
  assert.equal(vector.type, "VECTOR");
  assert.equal(vector.rotation, 180);
  assert.equal(vector.height, 16);
  assert.equal(vector.width, 9.41);
  assert.equal(vector.x, 12.71);
  assert.equal(vector.y, 16);
});

test("Figma API adapter resolves SVG currentColor from captured computed color", () => {
  const svgBytes = new TextEncoder().encode(
    "<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"><path fill=\"currentColor\" stroke=\"currentColor\" d=\"M4 4h8v8H4z\"/></svg>"
  );
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {
      "assets/current-color.svg": svgBytes
    }
  });

  const node = adapter.createImageLayer({
    name: "Vector / Icon",
    sourceNodeId: "dom-icon",
    assetRef: "assets/current-color.svg",
    assetKind: "svg",
    rect: { x: 0, y: 0, width: 16, height: 16 },
    style: {
      color: "color(srgb 0.85098 0.866667 0.894118)",
      objectFit: "fill"
    }
  });

  assert.equal(node.type, "VECTOR");
  assert.equal(node.svg.includes("currentColor"), false);
  assert.match(node.svg, /fill="rgb\(217, 221, 228\)"/);
  assert.match(node.svg, /stroke="rgb\(217, 221, 228\)"/);
});

test("Figma API adapter clips auto-sized CSS background SVG assets to the captured box", () => {
  const svgBytes = new TextEncoder().encode(
    "<svg width=\"74px\" height=\"40px\" viewBox=\"0 0 74 40\"><path fill=\"#fff\" d=\"M0 0h74v40H0z\"/></svg>"
  );
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {
      "assets/logo.svg": svgBytes
    }
  });

  const node = adapter.createImageLayer({
    name: "Background image",
    sourceNodeId: "dom-logo::background-image",
    assetRef: "assets/logo.svg",
    assetKind: "svg",
    assetRole: "css-background",
    rect: { x: 0, y: 0, width: 74, height: 20 },
    style: {
      imageScaleMode: "FILL",
      objectFit: "fill"
    }
  });

  assert.equal(node.type, "FRAME");
  assert.equal(node.width, 74);
  assert.equal(node.height, 20);
  assert.equal(node.pluginData.assetRole, "css-background");
  assert.equal(node.clipsContent, true);
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].type, "VECTOR");
  assert.equal(node.children[0].width, 74);
  assert.equal(node.children[0].height, 40);
  assert.equal(node.children[0].x, 0);
  assert.equal(node.children[0].y, 0);
});

test("Figma API adapter preserves border radius on raster image layers", () => {
  const png = pngHeaderBytes(105, 140);
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {
      "assets/poster.png": png
    }
  });

  const node = adapter.createImageLayer({
    name: "Image / poster",
    sourceNodeId: "dom-poster",
    assetRef: "assets/poster.png",
    assetKind: "raster",
    rect: { x: 0, y: 0, width: 105, height: 140 },
    style: {
      cornerRadius: 8,
      objectFit: "cover"
    }
  });

  assert.equal(node.type, "RECTANGLE");
  assert.equal(node.cornerRadius, 8);
  assert.equal(node.fills[0].type, "IMAGE");
});

test("Figma API adapter crops ambiguous CSS background SVG sprites from the screenshot", () => {
  const svgBytes = new TextEncoder().encode(
    "<svg width=\"252px\" height=\"161px\" viewBox=\"0 0 252 161\"><path fill=\"#fff\" d=\"M0 0h252v161H0z\"/></svg>"
  );
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {
      "assets/logo.svg": svgBytes
    },
    screenshot: pngHeaderBytes(1440, 973),
    viewport: { width: 1440, height: 973 }
  });

  const node = adapter.createImageLayer({
    name: "Background image",
    sourceNodeId: "dom-logo::background-image",
    assetRef: "assets/logo.svg",
    assetKind: "svg",
    assetRole: "css-background",
    rect: { x: 0, y: 0, width: 90, height: 46 },
    absoluteRect: { x: 20, y: 4, width: 90, height: 46 },
    styles: {
      backgroundImage: "url(\"https://cdn.example.com/logo.svg\")"
    },
    style: {
      imageScaleMode: "FILL",
      objectFit: "fill"
    }
  });

  assert.equal(node.type, "RECTANGLE");
  assert.equal(node.name, "Background image / Screenshot Crop");
  assert.equal(node.fills[0].type, "IMAGE");
  assert.equal(node.fills[0].scaleMode, "CROP");
  assert.equal(node.pluginData.assetRef, "assets/logo.svg");
  assert.match(node.pluginData.fallbackReason, /css background SVG sizing unavailable/);
});

test("Figma API adapter crops the screenshot for missing CSS background SVG assets", () => {
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi, {
    assets: {},
    screenshot: pngHeaderBytes(390, 844),
    viewport: { width: 390, height: 844 }
  });

  const node = adapter.createImageLayer({
    name: "Background image",
    sourceNodeId: "dom-logo::background-image",
    assetRef: null,
    assetKind: "svg",
    assetRole: "css-background",
    rect: { x: 0, y: 0, width: 90, height: 46 },
    absoluteRect: { x: 20, y: 4, width: 90, height: 46 },
    style: {
      imageScaleMode: "FILL",
      objectFit: "fill"
    }
  });

  assert.equal(node.type, "RECTANGLE");
  assert.equal(node.name, "Background image / Screenshot Crop");
  assert.equal(node.fills[0].type, "IMAGE");
  assert.equal(node.fills[0].scaleMode, "CROP");
  assert.equal(node.pluginData.assetRole, undefined);
  assert.match(node.pluginData.fallbackReason, /missing image asset; screenshot crop fallback/);
});

test("Figma API adapter converts CSS linear gradients to Figma paints", () => {
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi);

  const horizontalNode = adapter.createRectLayer({
    name: "Shape / fade",
    sourceNodeId: "dom-fade",
    rect: { x: 0, y: 0, width: 56, height: 330 },
    style: {
      fills: ["linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))"]
    }
  });

  assert.equal(horizontalNode.fills.length, 1);
  assert.equal(horizontalNode.fills[0].type, "GRADIENT_LINEAR");
  assert.deepEqual(horizontalNode.fills[0].gradientTransform, [
    [1, 0, 0],
    [0, 1, 0]
  ]);
  assert.deepEqual(horizontalNode.fills[0].gradientStops.map((stop) => stop.position), [0, 1]);
  assert.deepEqual(horizontalNode.fills[0].gradientStops[0].color, { r: 1, g: 1, b: 1, a: 0 });
  assert.deepEqual(horizontalNode.fills[0].gradientStops[1].color, { r: 1, g: 1, b: 1, a: 1 });

  const verticalNode = adapter.createRectLayer({
    name: "Shape / card fade",
    sourceNodeId: "dom-card-fade",
    rect: { x: 0, y: 141, width: 280, height: 360 },
    style: {
      fills: ["linear-gradient(rgba(0, 0, 0, 0), rgb(0, 0, 0))"]
    }
  });

  assert.equal(verticalNode.fills.length, 1);
  assert.equal(verticalNode.fills[0].type, "GRADIENT_LINEAR");
  assert.deepEqual(verticalNode.fills[0].gradientTransform, [
    [0, 1, 0],
    [-1, 0, 1]
  ]);
  assert.deepEqual(verticalNode.fills[0].gradientStops.map((stop) => stop.position), [0, 1]);
  assert.deepEqual(verticalNode.fills[0].gradientStops[0].color, { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(verticalNode.fills[0].gradientStops[1].color, { r: 0, g: 0, b: 0, a: 1 });
});

test("Figma API adapter converts CSS linear gradients to stroke paints", () => {
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi);

  const node = adapter.createRectLayer({
    name: "Shape / ::before",
    sourceNodeId: "dom-button-before",
    rect: { x: 0, y: 0, width: 112, height: 36 },
    style: {
      fills: [],
      strokes: [{
        color: "linear-gradient(45deg, rgb(255, 23, 85), rgb(47, 84, 197))",
        width: 2.6
      }],
      cornerRadius: 20
    }
  });

  assert.equal(node.fills.length, 0);
  assert.equal(node.strokes.length, 1);
  assert.equal(node.strokes[0].type, "GRADIENT_LINEAR");
  assert.equal(node.strokeWeight, 2.6);
  assert.equal(node.cornerRadius, 20);
});

test("Figma API adapter parses CSS Color 4 values from browser-computed styles", async () => {
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi);

  const text = await adapter.createTextLayer({
    name: "Text / Explore",
    sourceNodeId: "dom-explore",
    rect: { x: 0, y: 0, width: 120, height: 24 },
    text: "探索",
    textAutoResize: "WIDTH_AND_HEIGHT",
    style: {
      text: {
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: "400",
        lineHeight: "24px",
        color: "color(srgb 0.85098 0.866667 0.894118)"
      }
    }
  });

  const gradient = adapter.createRectLayer({
    name: "Shape / color-srgb-gradient",
    sourceNodeId: "dom-gradient",
    rect: { x: 0, y: 0, width: 120, height: 24 },
    style: {
      fills: ["linear-gradient(to right, color(srgb 1 0.298039 0.415686 / 0), color(srgb 1 0.298039 0.415686))"]
    }
  });

  assert.equal(Number(text.fills[0].color.r.toFixed(6)), 0.85098);
  assert.equal(Number(text.fills[0].color.g.toFixed(6)), 0.866667);
  assert.equal(Number(text.fills[0].color.b.toFixed(6)), 0.894118);
  assert.equal(gradient.fills[0].type, "GRADIENT_LINEAR");
  assert.equal(gradient.fills[0].gradientStops[0].color.a, 0);
  assert.equal(Number(gradient.fills[0].gradientStops[1].color.g.toFixed(6)), 0.298039);
});

test("Figma API adapter applies clipped background gradients to text fills", async () => {
  const figmaApi = createMockFigmaApi();
  const adapter = createFigmaApiAdapter(figmaApi);
  const gradient = "linear-gradient(to right, rgb(222, 190, 135), rgb(192, 139, 78))";

  const node = await adapter.createTextLayer({
    name: "Text / 1",
    sourceNodeId: "dom-rank",
    rect: { x: 0, y: 0, width: 40, height: 33 },
    text: "1",
    textAutoResize: "WIDTH_AND_HEIGHT",
    style: {
      text: {
        fontFamily: "Inter",
        fontSize: 28,
        fontWeight: "700",
        lineHeight: "33px",
        color: "rgb(149, 149, 149)",
        textAlign: "right",
        fills: [gradient]
      }
    }
  });

  assert.equal(node.characters, "1");
  assert.equal(node.textAlignHorizontal, "RIGHT");
  assert.equal(node.fills.length, 1);
  assert.equal(node.fills[0].type, "GRADIENT_LINEAR");
  assert.deepEqual(node.fills[0].gradientStops.map((stop) => stop.position), [0, 1]);
  assert.deepEqual(node.fills[0].gradientStops[0].color, { r: 222 / 255, g: 190 / 255, b: 135 / 255, a: 1 });
  assert.deepEqual(node.fills[0].gradientStops[1].color, { r: 192 / 255, g: 139 / 255, b: 78 / 255, a: 1 });
});

test("plugin runtime bridge imports a valid package and posts success report", async () => {
  const posted = [];
  const figmaApi = {
    ...createMockFigmaApi(),
    showUI() {},
    ui: {
      postMessage(message) {
        posted.push(message);
      },
      onmessage: null
    }
  };
  assert.equal(registerFigmaPluginRuntime(figmaApi), true);

  await figmaApi.ui.onmessage(createImportPackageMessage(
    "dashboard.figcapture",
    packFigcapture(createRuntimePackage())
  ));

  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, "IMPORT_SUCCESS");
  assert.equal(posted[0].report.createdFrameCount, 2);
});

test("plugin runtime bridge imports package chunks after reassembly", async () => {
  const posted = [];
  const figmaApi = {
    ...createMockFigmaApi(),
    showUI() {},
    ui: {
      postMessage(message) {
        posted.push(message);
      },
      onmessage: null
    }
  };
  assert.equal(registerFigmaPluginRuntime(figmaApi), true);

  const messages = createImportPackageTransferMessages(
    "dashboard.figcapture",
    packFigcapture(createRuntimePackage()),
    { chunkSize: 17, transferId: "runtime-transfer" }
  );
  for (const message of messages) {
    await figmaApi.ui.onmessage(message);
  }

  assert(posted.some((message) => message.type === "IMPORT_PROGRESS" && message.phase === "receiving"));
  assert.equal(posted.at(-1).type, "IMPORT_SUCCESS");
  assert.equal(posted.at(-1).report.createdFrameCount, 2);
});

test("plugin runtime bridge rejects invalid packages without creating nodes", async () => {
  const figmaApi = createMockFigmaApi();
  const files = createFigcaptureFileMap(createRuntimePackage());
  delete files["screenshot.png"];
  const result = await importPackageBytes(packFigcaptureFiles(files), {
    figmaApi
  });

  assert.equal(result.status, "error");
  assert.equal(result.error.category, "missing-screenshot");
  assert.equal(figmaApi.createdNodes.length, 0);
});

test("plugin UI bridge sends .figcapture files as bounded chunks", async () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const posted = [];
  const progress = [];
  const target = {
    postMessage(message, origin) {
      posted.push({ message, origin });
    }
  };

  const result = await postImportPackageFile(target, {
    name: "large.figcapture",
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  }, {
    chunkSize: 4,
    transferId: "ui-transfer",
    matchVariables: false,
    onProgress(item) {
      progress.push(item);
    }
  });

  assert.deepEqual(result, {
    filename: "large.figcapture",
    totalBytes: 10,
    totalChunks: 3
  });
  assert.deepEqual(posted.map((entry) => entry.origin), ["*", "*", "*", "*", "*"]);
  assert.deepEqual(posted.map((entry) => entry.message.pluginMessage.type), [
    "IMPORT_PACKAGE_TRANSFER_START",
    "IMPORT_PACKAGE_TRANSFER_CHUNK",
    "IMPORT_PACKAGE_TRANSFER_CHUNK",
    "IMPORT_PACKAGE_TRANSFER_CHUNK",
    "IMPORT_PACKAGE_TRANSFER_END"
  ]);
  assert.deepEqual(posted
    .filter((entry) => entry.message.pluginMessage.type === "IMPORT_PACKAGE_TRANSFER_CHUNK")
    .map((entry) => Array.from(entry.message.pluginMessage.bytes)), [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9]
  ]);
  assert.deepEqual(progress.map((item) => [item.sentChunks, item.totalChunks, item.sentBytes]), [
    [1, 3, 4],
    [2, 3, 8],
    [3, 3, 10]
  ]);
});

test("plugin UI bridge defaults to conservative transfer chunks", () => {
  const bytes = new Uint8Array(DEFAULT_IMPORT_PACKAGE_CHUNK_SIZE * 2 + 17);
  const messages = createImportPackageTransferMessages("large.figcapture", bytes, {
    transferId: "default-chunk-size"
  });
  const start = messages[0];
  const chunks = messages.filter((message) => message.type === "IMPORT_PACKAGE_TRANSFER_CHUNK");

  assert.equal(DEFAULT_IMPORT_PACKAGE_CHUNK_SIZE, 256 * 1024);
  assert.equal(start.chunkSize, DEFAULT_IMPORT_PACKAGE_CHUNK_SIZE);
  assert.equal(start.totalChunks, 3);
  assert(chunks.every((message) => message.bytes.byteLength <= DEFAULT_IMPORT_PACKAGE_CHUNK_SIZE));
  assert.equal(chunks.at(-1).bytes.byteLength, 17);
});

test("plugin UI reports file transfer error and renders success without raw JSON", async () => {
  await assert.rejects(
    () => readFileAsImportPackageMessage({
      name: "dashboard.figcapture",
      async arrayBuffer() {
        throw new Error("File read denied");
      }
    }),
    (error) => error.category === "file-transfer-failed"
  );

  const elements = new Map([
    ["import-status", { textContent: "" }],
    ["import-error-category", { textContent: "" }],
    ["import-report", { hidden: true }],
    ["created-frame-count", { textContent: "" }],
    ["created-node-count", { textContent: "" }],
    ["import-fallback-count", { textContent: "" }],
    ["import-missing-asset-count", { textContent: "" }],
    ["import-unsupported-style-count", { textContent: "" }],
    ["font-substitution-count", { textContent: "" }],
    ["font-substitution-summary", { textContent: "" }],
    ["auto-layout-confidence-summary", { textContent: "" }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };

  renderIncomingMessage(documentRef, {
    type: "IMPORT_SUCCESS",
    report: {
      createdFrameCount: 2,
      createdNodeCount: 8,
      fallbackCount: 1,
      missingAssetCount: 0,
      unsupportedStyleCount: 1,
      fontSubstitutions: [],
      autoLayoutConfidenceSummary: {
        appliedCount: 1,
        skippedCount: 2,
        averageConfidence: 0.88
      }
    }
  });

  assert.equal(elements.get("import-status").textContent, "Import complete");
  assert.equal(elements.get("import-report").hidden, false);
  assert.equal(elements.get("created-frame-count").textContent, "2");
  assert.equal(elements.get("font-substitution-count").textContent, "0");
  assert.equal(elements.get("font-substitution-summary").textContent, "");
  assert.equal(elements.get("auto-layout-confidence-summary").textContent, "1 applied / 2 skipped / 0.88");
});

function flattenNodes(nodes) {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

function pngHeaderBytes(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  writeUint32(bytes, 16, width);
  writeUint32(bytes, 20, height);
  return bytes;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function narrowPackage(width) {
  const base = createRuntimePackage();
  return {
    ...base,
    manifest: { ...base.manifest, viewportWidth: width },
    capture: { ...base.capture, viewport: { ...base.capture.viewport, width } }
  };
}

test("import lays out multiple breakpoints side by side and aggregates the report", async () => {
  const figmaApi = createMockFigmaApi();
  const bytes = packMultiCaptureFigcapture({
    captures: [
      { width: 1440, label: "1440", packageData: narrowPackage(1440) },
      { width: 375, label: "375", packageData: narrowPackage(375) }
    ]
  });

  const result = await importPackageBytes(bytes, { figmaApi });

  assert.equal(result.status, "success");
  assert.equal(result.captures.length, 2);
  assert.deepEqual(result.captures.map((entry) => entry.width), [1440, 375]);
  assert.equal(result.captures[0].renderResult.frames[0].x, 0);
  assert.equal(result.captures[1].renderResult.frames[0].x, 2 * (1440 + 80));
  assert.equal(result.captures[1].renderResult.frames[1].x, 2 * (1440 + 80) + (375 + 80));
  assert.equal(result.report.createdFrameCount, 4);
});

test("import sorts breakpoints widest-first regardless of bundle order", async () => {
  const figmaApi = createMockFigmaApi();
  const bytes = packMultiCaptureFigcapture({
    captures: [
      { width: 375, label: "375", packageData: narrowPackage(375) },
      { width: 1440, label: "1440", packageData: narrowPackage(1440) }
    ]
  });

  const result = await importPackageBytes(bytes, { figmaApi });

  assert.deepEqual(result.captures.map((entry) => entry.width), [1440, 375]);
  assert.equal(result.captures[0].renderResult.frames[0].x, 0);
});

test("import reads a legacy single-capture package as one breakpoint", async () => {
  const figmaApi = createMockFigmaApi();
  const result = await importPackageBytes(packFigcapture(createRuntimePackage()), { figmaApi });

  assert.equal(result.status, "success");
  assert.equal(result.captures.length, 1);
  assert.equal(result.captures[0].renderResult.frames[0].x, 0);
  assert.equal(result.report.createdFrameCount, 2);
});
