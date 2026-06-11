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
      "rotation",
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
      rotation: 0,
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
    async loadFontAsync(fontName) {
      const key = `${fontName.family} ${fontName.style}`;
      if (key === "Missing Classic Bold Italic" ||
        key === "Missing Classic Regular" ||
        key === "Classic Sans Bold Italic") {
        throw new Error(`Missing font ${key}`);
      }
    }
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
            id: "node-classic-font",
            sourceNodeId: "dom-classic-font",
            nodeType: "text",
            tagName: "#text",
            textContent: "Font stack",
            rect: { x: 32, y: 268, width: 96, height: 24 },
            styles: {
              fontFamily: "\"Missing Classic\", \"Classic Sans\", sans-serif",
              fontStyle: "italic",
              fontWeight: "700",
              fontSize: "16px",
              color: "rgb(17, 24, 39)"
            },
            attributes: {},
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
            id: "node-etf-nav-link",
            sourceNodeId: "dom-etf-nav-link",
            nodeType: "element",
            tagName: "a",
            textContent: "熱門ETF排行榜",
            rect: { x: 300, y: 0, width: 135.38, height: 48 },
            styles: {
              fontFamily: "Inter",
              fontSize: "18px",
              lineHeight: "27px",
              whiteSpace: "normal",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              color: "rgb(194, 41, 46)",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "etfRankNav__link" },
            children: [
              {
                id: "node-etf-nav-link-after",
                sourceNodeId: "dom-etf-nav-link-after",
                nodeType: "pseudo",
                tagName: "::after",
                rect: { x: 434.38, y: 24, width: 1, height: 20 },
                styles: {
                  position: "absolute",
                  backgroundColor: "rgb(212, 212, 212)"
                },
                attributes: { "data-pseudo": "::after" },
                children: []
              }
            ]
          },
          {
            id: "node-about-etf-link",
            sourceNodeId: "dom-about-etf-link",
            nodeType: "element",
            tagName: "a",
            textContent: "關於ETF",
            rect: { x: 456, y: 0, width: 81.27, height: 48 },
            styles: {
              fontFamily: "Inter",
              fontSize: "18px",
              lineHeight: "27px",
              whiteSpace: "normal",
              display: "flex",
              alignItems: "center",
              color: "rgb(194, 41, 46)",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "etfExplanation__navLink" },
            children: []
          },
          {
            id: "node-member-points-link",
            sourceNodeId: "dom-member-points-link",
            nodeType: "element",
            tagName: "a",
            textContent: "P點:",
            rect: { x: 620, y: 0, width: 50.08, height: 16 },
            styles: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              fontFamily: "Inter",
              fontSize: "12px",
              lineHeight: "16px",
              color: "rgb(255, 255, 255)",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "cm-blackbar__headerMemberLinkText cm-blackbar__headerMemberRow" },
            children: [
              {
                id: "node-member-points-svg",
                sourceNodeId: "dom-member-points-svg",
                nodeType: "element",
                tagName: "svg",
                rect: { x: 620, y: 0, width: 16, height: 16 },
                styles: {},
                attributes: { assetKind: "svg" },
                assetRef: "assets/vector-1.svg",
                children: []
              },
              {
                id: "node-member-points-count",
                sourceNodeId: "dom-member-points-count",
                nodeType: "text",
                tagName: "span",
                textContent: "4",
                rect: { x: 662.88, y: 0, width: 7.2, height: 16 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "12px",
                  lineHeight: "16px",
                  color: "rgb(255, 255, 255)"
                },
                attributes: { class: "cm-blackbar__headerMemberCoins" },
                children: []
              }
            ]
          },
          {
            id: "node-member-name",
            sourceNodeId: "dom-member-name",
            nodeType: "text",
            tagName: "a",
            textContent: "harry_chuang",
            rect: { x: 692, y: 0, width: 48, height: 16 },
            styles: {
              display: "block",
              fontFamily: "Inter",
              fontSize: "12px",
              lineHeight: "16px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              width: "48px",
              color: "rgb(255, 255, 255)",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "cm-blackbar__headerMemberLinkText cm-blackbar__headerMemberName" },
            children: []
          },
          {
            id: "node-active-tab",
            sourceNodeId: "dom-active-tab",
            nodeType: "element",
            tagName: "div",
            rect: { x: 760, y: 0, width: 64, height: 60 },
            styles: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: { class: "nav__cate nav__item--active" },
            children: [
              {
                id: "node-active-tab-label",
                sourceNodeId: "dom-active-tab-label",
                nodeType: "text",
                tagName: "#text",
                textContent: "討論",
                rect: { x: 776, y: 18, width: 32, height: 24 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "rgb(54, 54, 54)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-active-tab-after",
                sourceNodeId: "dom-active-tab-after",
                nodeType: "pseudo",
                tagName: "::after",
                rect: { x: 776, y: 58, width: 32, height: 2 },
                styles: {
                  content: "\"\"",
                  display: "block",
                  position: "absolute",
                  backgroundColor: "rgb(194, 41, 46)"
                },
                attributes: { "data-pseudo": "::after" },
                children: []
              }
            ]
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
          },
          {
            id: "node-outline-button",
            sourceNodeId: "dom-outline-button",
            nodeType: "element",
            tagName: "button",
            rect: { x: 760, y: 96, width: 120, height: 36 },
            styles: {
              display: "inline-flex",
              backgroundColor: "rgba(0, 0, 0, 0)",
              outlineWidth: "2px",
              outlineStyle: "solid",
              outlineColor: "rgb(31, 95, 191)",
              zIndex: "20",
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
                rect: { x: 804, y: 104, width: 32, height: 20 },
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
          },
          {
            id: "node-arrow-img",
            sourceNodeId: "dom-arrow-img",
            nodeType: "element",
            tagName: "img",
            rect: { x: 840, y: 12, width: 16, height: 16 },
            styles: {
              objectFit: "fill",
              transform: "matrix(-1, 0, 0, -1, 0, 0)",
              transformOrigin: "8px 8px",
              backgroundColor: "rgba(0, 0, 0, 0)"
            },
            attributes: {
              alt: "下一張",
              assetKind: "svg"
            },
            assetRef: "assets/arrow.svg",
            children: []
          },
          {
            id: "node-carousel-fade",
            sourceNodeId: "dom-carousel-fade",
            nodeType: "element",
            tagName: "div",
            rect: { x: 820, y: 0, width: 56, height: 330 },
            styles: {
              backgroundColor: "rgba(0, 0, 0, 0)",
              backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))"
            },
            attributes: { class: "carousel__fade" },
            children: []
          },
          {
            id: "node-readmore-text",
            sourceNodeId: "dom-readmore-text",
            nodeType: "element",
            tagName: "div",
            rect: { x: 32, y: 300, width: 540, height: 81 },
            styles: {
              display: "block",
              overflowX: "visible",
              overflowY: "hidden",
              maxHeight: "81px",
              lineHeight: "27px",
              color: "rgb(54, 54, 54)"
            },
            attributes: { class: "textRule__text textRule__text--limited" },
            children: [
              {
                id: "node-readmore-line-1",
                sourceNodeId: "dom-readmore-line-1",
                nodeType: "text",
                tagName: "#text",
                textContent: "全球最會賺航海王！專訪長榮海運董總：你有注意到我們的名片嗎？",
                rect: { x: 32, y: 300, width: 540, height: 27 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "18px",
                  lineHeight: "27px",
                  color: "rgb(54, 54, 54)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-readmore-line-4",
                sourceNodeId: "dom-readmore-line-4",
                nodeType: "text",
                tagName: "#text",
                textContent: "海，多變。",
                rect: { x: 32, y: 381, width: 540, height: 27 },
                styles: {
                  fontFamily: "Inter",
                  fontSize: "18px",
                  lineHeight: "27px",
                  color: "rgb(54, 54, 54)"
                },
                attributes: {},
                children: []
              },
              {
                id: "node-readmore-button",
                sourceNodeId: "dom-readmore-button",
                nodeType: "element",
                tagName: "button",
                textContent: "閱讀更多",
                rect: { x: 500, y: 354, width: 96, height: 27 },
                styles: {
                  display: "inline-flex",
                  flexDirection: "row",
                  alignItems: "center",
                  position: "absolute",
                  fontFamily: "Inter",
                  fontSize: "18px",
                  lineHeight: "27px",
                  color: "rgb(194, 41, 46)",
                  backgroundColor: "rgba(0, 0, 0, 0)",
                  backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))"
                },
                attributes: { class: "textRule__btn textRule__btn--absolute" },
                children: [
                  {
                    id: "node-readmore-button-before",
                    sourceNodeId: "dom-readmore-button-before",
                    nodeType: "pseudo",
                    tagName: "::before",
                    textContent: "...",
                    rect: { x: 500, y: 354, width: 30, height: 27 },
                    styles: {
                      content: "\"...\"",
                      display: "inline",
                      fontFamily: "Inter",
                      fontSize: "18px",
                      lineHeight: "27px",
                      color: "rgb(54, 54, 54)",
                      backgroundColor: "rgba(0, 0, 0, 0)"
                    },
                    attributes: { "data-pseudo": "::before" },
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    assets: {
      "assets/image-1.png": new TextEncoder().encode(JSON.stringify({
        kind: "external-image-reference",
        src: "https://example.com/chart.png"
      })),
      "assets/vector-1.svg": new TextEncoder().encode("<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\"/></svg>"),
      "assets/arrow.svg": new TextEncoder().encode("<svg width=\"10\" height=\"17\" viewBox=\"0 0 10 17\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L10 8.5L0 17Z\" fill=\"#676767\"/></svg>")
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
  const classicFontText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-classic-font");
  const answerText = nestedNodes.find((node) => node.type === "TEXT" && node.characters === "9則回答");
  const answerBacking = nestedNodes.find((node) => node.type === "FRAME" && node.name === "Text Background / 9則回答");
  const actionRowFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-action-row");
  const responseRowFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-response-row");
  const chartAsideFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-chart-aside");
  const headerLinkFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-header-link-item");
  const headerLinkNoArrowFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-header-link-no-arrow");
  const headerLinkNoArrowText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-header-link-no-arrow-text");
  const etfNavDirectText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-etf-nav-link::text");
  const aboutEtfText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-about-etf-link");
  const visibleBadgeFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-visible-badge");
  const visibleBadgeText = visibleBadgeFrame
    ? flattenNodes([visibleBadgeFrame]).find((node) => node.type === "TEXT" && node.characters === "讚")
    : null;
  const memberPointsFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-member-points-link");
  const memberPointsChildren = memberPointsFrame ? memberPointsFrame.children : [];
  const memberNameText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-member-name");
  const activeTabFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-active-tab");
  const activeTabUnderline = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-active-tab-after");
  const outlineButtonFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-outline-button");
  const readMoreFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-readmore-text");
  const readMoreButtonFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-readmore-button");
  const readMoreEllipsisText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-readmore-button-before");
  const readMoreLabelText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-readmore-button::text");
  const carouselFade = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-carousel-fade");
  const placeholder = nestedNodes.find((node) => node.pluginData.assetRef === "assets/image-1.png");
  const vectorNode = nestedNodes.find((node) => node.type === "VECTOR" && node.pluginData.assetRef === "assets/vector-1.svg");
  const arrowWrapper = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-arrow-img");
  const arrowVector = arrowWrapper ? arrowWrapper.children.find((node) => node.type === "VECTOR") : null;

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
  assert(classicFontText);
  assert.equal(classicFontText.fontName.family, "Classic Sans");
  assert.equal(classicFontText.fontName.style, "Regular");
  assert.equal(posted[0].report.fontSubstitutions.length, 1);
  assert.equal(posted[0].report.fontSubstitutions[0].used.family, "Classic Sans");
  assert.equal(posted[0].report.fontSubstitutions[0].used.style, "Regular");
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
  assert(etfNavDirectText);
  assert.equal(etfNavDirectText.characters, "熱門ETF排行榜");
  assert.equal(etfNavDirectText.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(etfNavDirectText.layoutSizingHorizontal, "HUG");
  assert.equal(etfNavDirectText.layoutSizingVertical, "HUG");
  assert.equal(etfNavDirectText.y, 10.5);
  assert.equal(etfNavDirectText.height, 27);
  assert(aboutEtfText);
  assert.equal(aboutEtfText.characters, "關於ETF");
  assert.equal(aboutEtfText.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(aboutEtfText.layoutSizingHorizontal, "HUG");
  assert.equal(aboutEtfText.layoutSizingVertical, "HUG");
  assert.equal(aboutEtfText.y, 10.5);
  assert.equal(aboutEtfText.height, 27);
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
  assert(memberPointsFrame);
  assert.equal(memberPointsFrame.layoutMode, "HORIZONTAL");
  assert.equal(memberPointsChildren[0].type, "VECTOR");
  assert.equal(memberPointsChildren[1].characters, "P點:");
  assert.equal(memberPointsChildren[1].pluginData.sourceNodeId, "dom-member-points-link::text");
  assert.equal(memberPointsChildren[2].characters, "4");
  assert(memberNameText);
  assert.equal(memberNameText.textAutoResize, "TRUNCATE");
  assert.equal(memberNameText.layoutSizingHorizontal, "FIXED");
  assert.equal(memberNameText.width, 48);
  assert(activeTabFrame);
  assert.equal(activeTabFrame.layoutMode, "");
  assert.equal(activeTabFrame.pluginData.autoLayoutSkippedReason, "absolute-position-child");
  assert(activeTabUnderline);
  assert.equal(activeTabUnderline.type, "RECTANGLE");
  assert.equal(activeTabUnderline.fills[0].color.r, 194 / 255);
  assert.equal(activeTabUnderline.fills[0].color.g, 41 / 255);
  assert.equal(activeTabUnderline.fills[0].color.b, 46 / 255);
  assert.equal(activeTabUnderline.x, 16);
  assert.equal(activeTabUnderline.y, 58);
  assert(outlineButtonFrame);
  assert.equal(outlineButtonFrame.pluginData.cssZIndex, "20");
  assert.equal(outlineButtonFrame.strokeWeight, 2);
  assert.equal(outlineButtonFrame.strokes[0].color.r, 31 / 255);
  assert.equal(outlineButtonFrame.strokes[0].color.g, 95 / 255);
  assert.equal(outlineButtonFrame.strokes[0].color.b, 191 / 255);
  assert(readMoreFrame);
  assert.equal(readMoreFrame.clipsContent, true);
  assert.equal(readMoreFrame.height, 81);
  assert(readMoreFrame.children.some((node) => node.pluginData.sourceNodeId === "dom-readmore-line-4" && node.y >= 81));
  assert(readMoreButtonFrame);
  assert.equal(readMoreButtonFrame.fills[0].type, "GRADIENT_LINEAR");
  assert(readMoreEllipsisText);
  assert.equal(readMoreEllipsisText.characters, "...");
  assert(readMoreLabelText);
  assert.equal(readMoreLabelText.characters, "閱讀更多");
  assert.deepEqual(readMoreButtonFrame.children.map((node) => node.characters), ["...", "閱讀更多"]);
  assert(carouselFade);
  assert.equal(carouselFade.fills[0].type, "GRADIENT_LINEAR");
  assert(placeholder);
  assert.equal(placeholder.fills[0].type, "SOLID");
  assert.equal(placeholder.pluginData.fallbackReason, "external or unsupported image asset");
  assert(vectorNode);
  assert.match(vectorNode.svg, /<path/);
  assert(arrowWrapper);
  assert.equal(arrowWrapper.type, "FRAME");
  assert.equal(arrowWrapper.width, 16);
  assert.equal(arrowWrapper.height, 16);
  assert(arrowVector);
  assert.equal(arrowVector.rotation, 180);
  assert.equal(arrowVector.width, 9.41);
  assert.equal(arrowVector.height, 16);
  assert.equal(arrowVector.x, 12.71);
  assert.equal(arrowVector.y, 16);
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
