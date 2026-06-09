import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { packFigcapture } from "../../../packages/capture-schema/dist/index.js";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import { describePluginRuntime } from "../dist/code-module.js";

test("figma plugin shell defines the default output frames", () => {
  assert.deepEqual(describePluginRuntime().outputFrames, [
    "Source Screenshot",
    "Editable Accurate"
  ]);
});

test("figma plugin runtime build uses classic scripts for manual loading", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const ui = await readFile("apps/figma-plugin/dist/ui.html", "utf8");

  assert.equal(main.includes("import "), false);
  assert.equal(main.includes("export "), false);
  assert.equal(main.includes("..."), false);
  assert.equal(main.includes("?."), false);
  assert.equal(main.includes("??"), false);
  assert.equal(main.includes("TextDecoder"), false);
  assert.equal(main.includes("new URL"), false);
  assert.equal(main.includes("Uint8Array.from"), false);
  assert.equal(ui.includes("type=\"module\""), false);
  assert.equal(ui.includes("src=\"ui.js\""), false);
  assert(ui.includes("IMPORT_PACKAGE"));
});

test("classic Figma runtime keeps editable layers when an image asset is unsupported", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
  const createdNodes = [];

  function createNode(type) {
    const allowedProperties = new Set([
      "type",
      "name",
      "children",
      "x",
      "y",
      "width",
      "height",
      "locked",
      "fills",
      "strokes",
      "strokeWeight",
      "cornerRadius",
      "clipsContent",
      "layoutMode",
      "primaryAxisSizingMode",
      "counterAxisSizingMode",
      "primaryAxisAlignItems",
      "counterAxisAlignItems",
      "itemSpacing",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
      "paddingBottom",
      "fontName",
      "characters",
      "fontSize",
      "textAutoResize",
      "layoutSizingHorizontal",
      "layoutSizingVertical",
      "layoutGrow",
      "lineHeight",
      "svg",
      "pluginData"
    ]);
    const node = {
      type,
      name: "",
      children: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      locked: false,
      fills: [],
      strokes: [],
      strokeWeight: 0,
      cornerRadius: 0,
      clipsContent: false,
      layoutMode: "",
      primaryAxisSizingMode: "",
      counterAxisSizingMode: "",
      primaryAxisAlignItems: "",
      counterAxisAlignItems: "",
      itemSpacing: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      fontName: null,
      characters: "",
      fontSize: 0,
      textAutoResize: "",
      layoutSizingHorizontal: "",
      layoutSizingVertical: "",
      layoutGrow: 0,
      lineHeight: null,
      svg: "",
      pluginData: {},
      resize(width, height) {
        this.width = width;
        this.height = height;
      },
      appendChild(child) {
        this.children.push(child);
      },
      setPluginData(key, value) {
        this.pluginData[key] = value;
      }
    };
    const proxy = new Proxy(node, {
      set(target, property, value) {
        if (!allowedProperties.has(property)) {
          throw new TypeError("object is not extensible");
        }
        target[property] = value;
        return true;
      }
    });
    createdNodes.push(proxy);
    return proxy;
  }

  const figma = {
    currentPage: {
      children: [],
      appendChild(child) {
        this.children.push(child);
      }
    },
    ui: {
      onmessage: null,
      postMessage(message) {
        posted.push(message);
      }
    },
    showUI() {},
    createFrame() {
      return createNode("FRAME");
    },
    createRectangle() {
      return createNode("RECTANGLE");
    },
    createText() {
      return createNode("TEXT");
    },
    createImage(bytes) {
      if (!isPng(bytes)) {
        throw new Error("Unsupported image bytes");
      }
      return {
        hash: `hash-${bytes.length}`
      };
    },
    createNodeFromSvg(svg) {
      const node = createNode("VECTOR");
      node.svg = svg;
      return node;
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root: {
        ...basePackage.capture.root,
        styles: {
          display: "block",
          backgroundColor: "rgb(255, 255, 255)"
        },
        children: [
          {
            id: "node-nav",
            sourceNodeId: "dom-nav",
            nodeType: "element",
            tagName: "nav",
            rect: { x: 32, y: 24, width: 220, height: 40 },
            styles: {
              display: "flex",
              flexDirection: "row",
              gap: "16px",
              alignItems: "center",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: {
              role: "navigation"
            },
            children: [
              {
                id: "node-nav-text-1",
                sourceNodeId: "dom-nav-text-1",
                nodeType: "text",
                tagName: "#text",
                textContent: "Home",
                rect: { x: 40, y: 34, width: 48, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "14px",
                  color: "rgb(17, 24, 39)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-nav-text-2",
                sourceNodeId: "dom-nav-text-2",
                nodeType: "text",
                tagName: "#text",
                textContent: "Reports",
                rect: { x: 104, y: 34, width: 64, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "14px",
                  color: "rgb(17, 24, 39)"
                },
                attributes: {},
                children: []
              }
            ]
          },
          {
            id: "node-image",
            sourceNodeId: "dom-image",
            nodeType: "element",
            tagName: "img",
            rect: { x: 32, y: 96, width: 240, height: 160 },
            styles: {
              objectFit: "cover"
            },
            attributes: {
              src: "https://app.example.com/chart.png",
              alt: "Chart"
            },
            assetRef: "assets/image-1.png",
            children: []
          },
          {
            id: "node-answer-count",
            sourceNodeId: "dom-answer-count",
            nodeType: "text",
            tagName: "#text",
            textContent: "9則回答",
            rect: { x: 1011, y: 884, width: 54, height: 20 },
            styles: {
              fontFamily: "Inter",
              fontSize: "15px",
              fontWeight: "700",
              lineHeight: "20.1px",
              color: "rgb(103, 103, 103)",
              backgroundColor: "rgba(0, 0, 0, 0)",
              borderTopLeftRadius: "4px",
              borderTopRightRadius: "4px",
              borderBottomRightRadius: "4px",
              borderBottomLeftRadius: "4px",
              borderTopWidth: "0px",
              borderRightWidth: "0px",
              borderBottomWidth: "0px",
              borderLeftWidth: "0px"
            },
            attributes: { class: "btn articleResponse__comment text-dark-600" },
            children: []
          },
          {
            id: "node-action-row",
            sourceNodeId: "dom-action-row",
            nodeType: "element",
            tagName: "div",
            rect: { x: 32, y: 280, width: 696, height: 38 },
            styles: {
              display: "flex",
              flexDirection: "row-reverse",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "articleHavior__body" },
            children: [
              {
                id: "node-action-tip",
                sourceNodeId: "dom-action-tip",
                nodeType: "text",
                tagName: "#text",
                textContent: "打賞",
                rect: { x: 566, y: 280, width: 162, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "15px",
                  lineHeight: "20px",
                  color: "rgb(103, 103, 103)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-action-share",
                sourceNodeId: "dom-action-share",
                nodeType: "text",
                tagName: "#text",
                textContent: "分享",
                rect: { x: 388, y: 280, width: 162, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "15px",
                  lineHeight: "20px",
                  color: "rgb(103, 103, 103)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-action-comment",
                sourceNodeId: "dom-action-comment",
                nodeType: "text",
                tagName: "#text",
                textContent: "留言",
                rect: { x: 210, y: 280, width: 162, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "15px",
                  lineHeight: "20px",
                  color: "rgb(103, 103, 103)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-action-like",
                sourceNodeId: "dom-action-like",
                nodeType: "text",
                tagName: "#text",
                textContent: "讚",
                rect: { x: 32, y: 280, width: 162, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "15px",
                  lineHeight: "20px",
                  color: "rgb(103, 103, 103)"
                },
                attributes: {},
                children: []
              }
            ]
          },
          {
            id: "node-response-row",
            sourceNodeId: "dom-response-row",
            nodeType: "element",
            tagName: "div",
            rect: { x: 32, y: 330, width: 696, height: 20.1 },
            styles: {
              display: "flex",
              flexDirection: "row",
              gap: "normal",
              justifyContent: "normal",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "articleResponse__body" },
            children: [
              {
                id: "node-response-like",
                sourceNodeId: "dom-response-like",
                nodeType: "text",
                tagName: "#text",
                textContent: "313",
                rect: { x: 32, y: 330, width: 52.16, height: 20.1 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "15px",
                  fontWeight: "700",
                  lineHeight: "20.1px",
                  color: "rgb(103, 103, 103)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-response-worth",
                sourceNodeId: "dom-response-worth",
                nodeType: "text",
                tagName: "#text",
                textContent: "50P",
                rect: { x: 92.16, y: 330, width: 51.83, height: 20.1 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "15px",
                  fontWeight: "700",
                  lineHeight: "20.1px",
                  color: "rgb(103, 103, 103)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-response-comments",
                sourceNodeId: "dom-response-comments",
                nodeType: "text",
                tagName: "#text",
                textContent: "82則留言",
                rect: { x: 665, y: 330, width: 63, height: 20.1 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "15px",
                  fontWeight: "700",
                  lineHeight: "20.1px",
                  color: "rgb(103, 103, 103)"
                },
                attributes: {},
                children: []
              }
            ]
          },
          {
            id: "node-chart-aside",
            sourceNodeId: "dom-chart-aside",
            nodeType: "element",
            tagName: "div",
            rect: { x: 300, y: 24, width: 300, height: 240 },
            styles: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "chartContainerTrend page__aside" },
            children: [
              {
                id: "node-chart-summary",
                sourceNodeId: "dom-chart-summary",
                nodeType: "element",
                tagName: "section",
                rect: { x: 316, y: 40, width: 268, height: 60 },
                styles: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px"
                },
                attributes: {},
                children: [
                  {
                    id: "node-chart-title",
                    sourceNodeId: "dom-chart-title",
                    nodeType: "text",
                    tagName: "#text",
                    textContent: "加權指數",
                    rect: { x: 316, y: 40, width: 64, height: 20 },
                    styles: {
                      fontFamily: "Inter",
                      fontSize: "16px",
                      lineHeight: "20px",
                      color: "rgb(54, 54, 54)"
                    },
                    attributes: {},
                    children: []
                  }
                ]
              },
              {
                id: "node-chart-area",
                sourceNodeId: "dom-chart-area",
                nodeType: "element",
                tagName: "div",
                rect: { x: 316, y: 100, width: 268, height: 148 },
                styles: {
                  display: "block"
                },
                attributes: {},
                children: [
                  {
                    id: "node-chart-canvas",
                    sourceNodeId: "dom-chart-canvas",
                    nodeType: "element",
                    tagName: "canvas",
                    rect: { x: 316, y: 104, width: 268, height: 144 },
                    styles: {},
                    attributes: {},
                    fallbackRef: "assets/fallback-1.png",
                    children: []
                  }
                ]
              }
            ]
          },
          {
            id: "node-header-link-item",
            sourceNodeId: "dom-header-link-item",
            nodeType: "element",
            tagName: "li",
            rect: { x: 100, y: 0, width: 84, height: 28 },
            styles: {
              display: "list-item",
              lineHeight: "28px",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "cm-blackbar__headerLinkItem" },
            children: [
              {
                id: "node-header-link-text",
                sourceNodeId: "dom-header-link-text",
                nodeType: "text",
                tagName: "#text",
                textContent: "股市爆料同學會",
                rect: { x: 100, y: 0, width: 84, height: 20 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "12px",
                  lineHeight: "20px",
                  color: "rgb(255, 255, 255)"
                },
                attributes: { class: "cm-blackbar__headerLinkText" },
                children: []
              }
            ]
          },
          {
            id: "node-header-link-no-arrow",
            sourceNodeId: "dom-header-link-no-arrow",
            nodeType: "element",
            tagName: "li",
            rect: { x: 184.91, y: 0, width: 84, height: 28 },
            styles: {
              display: "flex",
              alignItems: "center",
              height: "28px",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "cm-blackbar__headerLinkItem" },
            children: [
              {
                id: "node-header-link-no-arrow-text",
                sourceNodeId: "dom-header-link-no-arrow-text",
                nodeType: "text",
                tagName: "#text",
                textContent: "作者專區",
                rect: { x: 184.91, y: 0, width: 48, height: 28 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "12px",
                  lineHeight: "20px",
                  color: "rgb(255, 255, 255)"
                },
                attributes: { class: "cm-blackbar__headerLinkText" },
                children: []
              }
            ]
          },
          {
            id: "node-visible-badge",
            sourceNodeId: "dom-visible-badge",
            nodeType: "text",
            tagName: "#text",
            textContent: "讚",
            rect: { x: 380, y: 904.6, width: 20, height: 20.5 },
            styles: {
              fontFamily: "Inter",
              fontSize: "12px",
              lineHeight: "normal",
              color: "rgb(255, 255, 255)",
              backgroundColor: "rgb(54, 54, 54)",
              paddingTop: "2px",
              paddingRight: "4px",
              paddingBottom: "2px",
              paddingLeft: "4px",
              borderTopLeftRadius: "27px",
              borderTopRightRadius: "27px",
              borderBottomRightRadius: "27px",
              borderBottomLeftRadius: "27px"
            },
            attributes: { class: "articleHavior__mark text-light bg-dark-800" },
            children: []
          },
          {
            id: "node-svg",
            sourceNodeId: "dom-svg",
            nodeType: "element",
            tagName: "svg",
            rect: { x: 288, y: 96, width: 12, height: 12 },
            styles: {},
            attributes: {
              assetKind: "svg"
            },
            assetRef: "assets/vector-1.svg",
            children: []
          }
        ]
      }
    },
    assets: {
      "assets/image-1.png": new TextEncoder().encode(JSON.stringify({
        kind: "external-image-reference",
        src: "https://example.com/chart.png"
      })),
      "assets/vector-1.svg": new TextEncoder().encode("<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\"/></svg>")
    }
  });

  vm.runInNewContext(main, { figma, Uint8Array, ArrayBuffer, DataView, Error, JSON, Math, Number, Object, Promise, String, Boolean, Array, isFinite, parseFloat });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "dashboard.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, "IMPORT_SUCCESS");
  assert.equal(posted[0].report.createdFrameCount, 2);
  assert(posted[0].report.autoLayoutConfidenceSummary.appliedCount >= 1);

  const accurateFrame = figma.currentPage.children.find((frame) => frame.name.includes("Editable Accurate"));
  const nestedNodes = flattenNodes(accurateFrame.children);
  const autoLayoutFrame = nestedNodes.find((node) => node.type === "FRAME" && node.layoutMode === "HORIZONTAL");
  const navText = nestedNodes.find((node) => node.type === "TEXT" && node.characters === "Home");
  const answerText = nestedNodes.find((node) => node.type === "TEXT" && node.characters === "9則回答");
  const answerBacking = nestedNodes.find((node) => node.type === "FRAME" && node.name === "Text Background / 9則回答");
  const actionRowFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-action-row");
  const responseRowFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-response-row");
  const chartAsideFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-chart-aside");
  const headerLinkFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-header-link-item");
  const headerLinkNoArrowFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-header-link-no-arrow");
  const headerLinkNoArrowText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-header-link-no-arrow-text");
  const visibleBadgeFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-visible-badge");
  const visibleBadgeText = visibleBadgeFrame
    ? flattenNodes([visibleBadgeFrame]).find((node) => node.type === "TEXT" && node.characters === "讚")
    : null;
  const placeholder = nestedNodes.find((node) => node.pluginData.assetRef === "assets/image-1.png");
  const vectorNode = nestedNodes.find((node) => node.type === "VECTOR" && node.pluginData.assetRef === "assets/vector-1.svg");

  assert(autoLayoutFrame);
  assert.equal(autoLayoutFrame.itemSpacing, 16);
  assert.equal(autoLayoutFrame.primaryAxisSizingMode, "FIXED");
  assert.equal(autoLayoutFrame.counterAxisSizingMode, "FIXED");
  assert.equal(autoLayoutFrame.counterAxisAlignItems, "CENTER");
  assert.equal(autoLayoutFrame.pluginData.autoLayoutConfidence, "0.92");
  assert(navText);
  assert.equal(navText.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(navText.layoutSizingHorizontal, "HUG");
  assert.equal(navText.layoutSizingVertical, "HUG");
  assert(answerText);
  assert.equal(answerText.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(answerText.layoutSizingHorizontal, "HUG");
  assert.equal(answerText.layoutSizingVertical, "HUG");
  assert.equal(answerBacking, undefined);
  assert(actionRowFrame);
  assert.equal(actionRowFrame.layoutMode, "HORIZONTAL");
  assert.deepEqual(actionRowFrame.children.map((node) => node.characters), ["讚", "留言", "分享", "打賞"]);
  assert(responseRowFrame);
  assert.equal(responseRowFrame.layoutMode, "");
  assert.equal(responseRowFrame.pluginData.autoLayoutSkippedReason, "non-uniform-spacing");
  assert.deepEqual(responseRowFrame.children.map((node) => node.x), [0, 60.16, 633]);
  assert(chartAsideFrame);
  assert.equal(chartAsideFrame.layoutMode, "VERTICAL");
  assert.equal(chartAsideFrame.primaryAxisAlignItems, "SPACE_BETWEEN");
  assert.equal(chartAsideFrame.paddingLeft, 16);
  assert.equal(chartAsideFrame.paddingRight, 16);
  assert.equal(chartAsideFrame.paddingTop, 16);
  assert.equal(chartAsideFrame.paddingBottom, 16);
  assert(headerLinkFrame);
  assert.equal(headerLinkFrame.layoutMode, "HORIZONTAL");
  assert.equal(headerLinkFrame.counterAxisAlignItems, "CENTER");
  assert.equal(headerLinkFrame.paddingTop, 0);
  assert.equal(headerLinkFrame.paddingBottom, 0);
  assert(headerLinkNoArrowFrame);
  assert.equal(headerLinkNoArrowFrame.layoutMode, "HORIZONTAL");
  assert.equal(headerLinkNoArrowFrame.counterAxisAlignItems, "CENTER");
  assert.equal(headerLinkNoArrowFrame.paddingTop, 0);
  assert.equal(headerLinkNoArrowFrame.paddingBottom, 0);
  assert(headerLinkNoArrowText);
  assert.equal(headerLinkNoArrowText.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(headerLinkNoArrowText.layoutSizingHorizontal, "HUG");
  assert.equal(headerLinkNoArrowText.layoutSizingVertical, "HUG");
  assert(visibleBadgeFrame);
  assert.equal(visibleBadgeFrame.layoutMode, "HORIZONTAL");
  assert.equal(visibleBadgeFrame.primaryAxisAlignItems, "CENTER");
  assert.equal(visibleBadgeFrame.counterAxisAlignItems, "CENTER");
  assert.equal(visibleBadgeFrame.paddingLeft, 4);
  assert.equal(visibleBadgeFrame.paddingRight, 4);
  assert.equal(visibleBadgeFrame.paddingTop, 2);
  assert.equal(visibleBadgeFrame.paddingBottom, 2);
  assert(visibleBadgeText);
  assert.equal(visibleBadgeText.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(visibleBadgeText.layoutSizingHorizontal, "HUG");
  assert.equal(visibleBadgeText.layoutSizingVertical, "HUG");
  assert(placeholder);
  assert.equal(placeholder.fills[0].type, "SOLID");
  assert.equal(placeholder.pluginData.fallbackReason, "external or unsupported image asset");
  assert(vectorNode);
  assert.match(vectorNode.svg, /<path/);
});

function flattenNodes(nodes) {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children || [])]);
}

function isPng(bytes) {
  return bytes.length >= 4
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47;
}
