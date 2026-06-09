import assert from "node:assert/strict";
import test from "node:test";
import {
  createFigcaptureFileMap,
  packFigcapture,
  packFigcaptureFiles
} from "../../../packages/capture-schema/dist/index.js";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import {
  importPackageBytes,
  registerFigmaPluginRuntime
} from "../dist/code-module.js";
import {
  createImportPackageMessage,
  readFileAsImportPackageMessage
} from "../dist/message-bridge.js";
import {
  createFigmaApiAdapter,
  createMockFigmaApi,
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
              boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)"
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
  assert.equal(imageCreateCount, 1);
  const editableNodes = flattenNodes(result.renderResult.frames[1].children);
  assert.equal(editableNodes.some((node) => node.type === "TEXT" && node.characters === "Revenue"), true);
  assert.equal(editableNodes.some((node) => node.type === "RECTANGLE" && node.cornerRadius === 8), true);
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
  assert.equal(elements.get("auto-layout-confidence-summary").textContent, "1 applied / 2 skipped / 0.88");
});

function flattenNodes(nodes) {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}
