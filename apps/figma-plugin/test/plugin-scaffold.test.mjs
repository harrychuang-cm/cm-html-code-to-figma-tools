import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { packFigcapture } from "../../../packages/capture-schema/dist/index.js";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import { describePluginRuntime } from "../dist/code-module.js";
import { createImportPackageTransferMessages } from "../dist/message-bridge.js";

// The classic runtime streams IMPORT_PROGRESS messages while rendering, so the
// terminal result (IMPORT_SUCCESS / IMPORT_ERROR) is not necessarily posted[0].
function resultMessage(posted) {
  return posted.find(
    (message) => message.type === "IMPORT_SUCCESS" || message.type === "IMPORT_ERROR"
  );
}

function replaceAsciiAll(bytes, from, to) {
  assert.equal(from.length, to.length);
  const result = new Uint8Array(bytes);
  const fromBytes = new TextEncoder().encode(from);
  const toBytes = new TextEncoder().encode(to);

  for (let index = 0; index <= result.length - fromBytes.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < fromBytes.length; offset += 1) {
      if (result[index + offset] !== fromBytes[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      result.set(toBytes, index);
      index += fromBytes.length - 1;
    }
  }

  return result;
}

test("figma plugin shell defines the default output frames", () => {
  assert.deepEqual(describePluginRuntime().outputFrames, [
    "Source Screenshot",
    "Editable Accurate"
  ]);
});

test("figma plugin runtime build uses classic scripts for manual loading", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const ui = await readFile("apps/figma-plugin/dist/ui.html", "utf8");
  const manifest = JSON.parse(await readFile("apps/figma-plugin/dist/manifest.json", "utf8"));
  const pluginPackage = JSON.parse(await readFile("apps/figma-plugin/package.json", "utf8"));

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
  assert.equal(ui.includes("__PLUGIN_VERSION__"), false);
  assert(ui.includes(`v${pluginPackage.version}`));
  assert.equal(manifest.name, `Production UI Import v${pluginPackage.version}`);
  assert(ui.includes("IMPORT_PACKAGE"));
});

test("classic Figma runtime rejects unsafe archive entry names", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
      throw new Error("Import should stop before rendering");
    }
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "unsafe.figcapture",
    bytes: replaceAsciiAll(packFigcapture(createValidPackage()), "manifest.json", "../evil.jsonx")
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, "IMPORT_ERROR");
  assert.equal(posted[0].error.category, "invalid-package");
  assert.match(posted[0].error.message, /parent directory/);
  assert.equal(figma.currentPage.children.length, 0);
});

test("classic Figma runtime imports chunked package transfers", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function createNode(type) {
    return {
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
      const node = createNode("TEXT");
      node.characters = "";
      node.textAutoResize = "";
      node.setRangeFontName = function () {};
      node.setRangeFontSize = function () {};
      node.setRangeFills = function () {};
      return node;
    },
    createImage(bytes) {
      return {
        hash: `hash-${bytes.length}`
      };
    },
    async loadFontAsync() {}
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });

  const messages = createImportPackageTransferMessages(
    "dashboard.figcapture",
    packFigcapture(createValidPackage()),
    { chunkSize: 19, transferId: "classic-transfer" }
  );
  for (const message of messages) {
    await figma.ui.onmessage(message);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert(posted.some((message) => message.type === "IMPORT_PROGRESS" && message.phase === "receiving"));
  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert.equal(resultMessage(posted).report.createdFrameCount, 2);
});

test("classic Figma runtime omits transparent viewport-clipped table spacers", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
    createdNodes.push(node);
    return node;
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
      return {
        hash: `hash-${bytes.length}`
      };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    manifest: {
      ...basePackage.manifest,
      viewportWidth: 390,
      viewportHeight: 844
    },
    capture: {
      ...basePackage.capture,
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
            id: "node-table-wrapper",
            sourceNodeId: "dom-table-wrapper",
            nodeType: "element",
            tagName: "div",
            rect: { x: 16, y: 543.75, width: 358, height: 55 },
            styles: {
              display: "block",
              width: "358px",
              height: "55px",
              overflow: "auto hidden",
              overflowX: "auto",
              overflowY: "hidden"
            },
            attributes: {},
            children: [{
              id: "node-table",
              sourceNodeId: "dom-table",
              nodeType: "element",
              tagName: "table",
              rect: { x: 16, y: 543.75, width: 374, height: 55 },
              styles: {
                display: "table",
                width: "900px",
                height: "55px"
              },
              attributes: {},
              children: [{
                id: "node-row",
                sourceNodeId: "dom-row",
                nodeType: "element",
                tagName: "tr",
                rect: { x: 16, y: 543.75, width: 374, height: 55 },
                styles: {
                  display: "flex",
                  width: "900px",
                  height: "55px"
                },
                attributes: {},
                children: [
                  {
                    id: "node-rank-heading",
                    sourceNodeId: "dom-rank-heading",
                    nodeType: "element",
                    tagName: "th",
                    textContent: "排名",
                    rect: { x: 16, y: 543.75, width: 45, height: 55 },
                    styles: {
                      display: "flex",
                      width: "45px",
                      height: "55px",
                      backgroundColor: "rgb(240, 240, 240)",
                      fontSize: "14px",
                      lineHeight: "21px"
                    },
                    attributes: {},
                    children: []
                  },
                  {
                    id: "node-name-heading",
                    sourceNodeId: "dom-name-heading",
                    nodeType: "element",
                    tagName: "th",
                    textContent: "基金名稱",
                    rect: { x: 61, y: 543.75, width: 150, height: 55 },
                    styles: {
                      display: "flex",
                      width: "150px",
                      height: "55px",
                      backgroundColor: "rgb(240, 240, 240)",
                      fontSize: "14px",
                      lineHeight: "21px"
                    },
                    attributes: {},
                    children: []
                  },
                  {
                    id: "node-hidden-nav-heading",
                    sourceNodeId: "dom-hidden-nav-heading",
                    nodeType: "element",
                    tagName: "th",
                    rect: { x: 376, y: 543.75, width: 14, height: 55 },
                    styles: {
                      display: "flex",
                      width: "90px",
                      height: "55px",
                      backgroundColor: "rgba(0, 0, 0, 0)"
                    },
                    attributes: {},
                    children: []
                  },
                  {
                    id: "node-return-heading",
                    sourceNodeId: "dom-return-heading",
                    nodeType: "element",
                    tagName: "th",
                    rect: { x: 211, y: 543.75, width: 165, height: 55 },
                    styles: {
                      display: "flex",
                      width: "165px",
                      height: "55px"
                    },
                    attributes: {},
                    children: [{
                      id: "node-return-heading-text",
                      sourceNodeId: "dom-return-heading-text",
                      nodeType: "text",
                      tagName: "#text",
                      textContent: "1年",
                      rect: { x: 348.33, y: 560.75, width: 19.67, height: 21 },
                      styles: {
                        fontSize: "14px",
                        lineHeight: "21px"
                      },
                      attributes: {},
                      children: []
                    }]
                  }
                ]
              }]
            }]
          }
        ]
      }
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "table.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const nestedNodes = flattenNodes(figma.currentPage.children);
  const hiddenSpacer = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-hidden-nav-heading");
  const rowFrame = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-row");
  const returnHeading = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-return-heading");

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert.equal(hiddenSpacer, undefined);
  assert(rowFrame);
  assert.deepEqual(rowFrame.children.map((node) => node.pluginData.sourceNodeId), [
    "dom-rank-heading",
    "dom-name-heading",
    "dom-return-heading"
  ]);
  assert(returnHeading);
  assert.equal(returnHeading.x, 195);
});

test("classic Figma runtime keeps rounded partial borders as side strokes", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
    createdNodes.push(node);
    return node;
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
      return {
        hash: `hash-${bytes.length}`
      };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    manifest: {
      ...basePackage.manifest,
      viewportWidth: 390,
      viewportHeight: 120
    },
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

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "rounded-border.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const nestedNodes = flattenNodes(figma.currentPage.children);
  const button = nestedNodes.find((node) => node.type === "FRAME" && node.pluginData.sourceNodeId === "dom-more-button");

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert(button);
  assert.equal(button.cornerRadius, 100);
  assert.equal(button.strokeAlign, "INSIDE");
  assert.equal(button.strokeTopWeight, 1);
  assert.equal(button.strokeRightWeight, 0);
  assert.equal(button.strokeBottomWeight, 0);
  assert.equal(button.strokeLeftWeight, 1);
  assert.equal(button.children.some((node) => /^Border \//.test(node.name)), false);
});

test("classic Figma runtime maps browser-ordered CSS box-shadow values to effects", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
      effects: [],
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
    createdNodes.push(node);
    return node;
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
      return { hash: `hash-${bytes.length}` };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = {
    ...basePackage,
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
            boxShadow: "rgba(0, 0, 0, 0.05) 0px 0px 2px 0px, rgba(0, 0, 0, 0.2) 0px 4px 36px 0px"
          },
          attributes: { class: "chat__area" },
          children: []
        }]
      }
    }
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "shadow.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const panel = flattenNodes(figma.currentPage.children)
    .find((node) => node.pluginData.sourceNodeId === "dom-chat-panel");

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert(panel);
  assert.deepEqual(JSON.parse(JSON.stringify(panel.effects)), [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.05 },
      offset: { x: 0, y: 0 },
      radius: 2,
      spread: 0,
      visible: true,
      blendMode: "NORMAL"
    },
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.2 },
      offset: { x: 0, y: 4 },
      radius: 36,
      spread: 0,
      visible: true,
      blendMode: "NORMAL"
    }
  ]);
});

test("classic Figma runtime places transparent padded emoji text in the content box", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
      effects: [],
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
    createdNodes.push(node);
    return node;
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
      return { hash: `hash-${bytes.length}` };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = {
    ...basePackage,
    manifest: {
      ...basePackage.manifest,
      viewportWidth: 100,
      viewportHeight: 80
    },
    capture: {
      ...basePackage.capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 100, height: 80 },
        styles: {},
        attributes: {},
        children: [{
          id: "node-chat-bubble",
          sourceNodeId: "dom-chat-bubble",
          nodeType: "element",
          tagName: "div",
          rect: { x: 10, y: 12, width: 54, height: 39 },
          styles: {
            position: "relative",
            width: "54px",
            height: "39px",
            backgroundColor: "rgb(240, 240, 240)",
            borderTopLeftRadius: "19px",
            borderTopRightRadius: "19px",
            borderBottomRightRadius: "19px",
            borderBottomLeftRadius: "19px"
          },
          attributes: { class: "message__text message__text--first" },
          children: [{
            id: "node-chat-emoji",
            sourceNodeId: "dom-chat-emoji",
            nodeType: "element",
            tagName: "pre",
            textContent: "🥰",
            rect: { x: 10, y: 12, width: 54, height: 39 },
            styles: {
              display: "block",
              width: "54px",
              height: "39px",
              backgroundColor: "rgba(0, 0, 0, 0)",
              color: "rgb(54, 54, 54)",
              fontSize: "16px",
              lineHeight: "21px",
              whiteSpace: "pre-wrap",
              paddingLeft: "19px",
              paddingRight: "19px",
              paddingTop: "9px",
              paddingBottom: "9px"
            },
            attributes: { class: "message__pre text-dark-800" },
            children: []
          }]
        }]
      }
    }
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "emoji.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const accurateFrame = figma.currentPage.children.find((frame) => frame.name.includes("Editable Accurate"));
  const emoji = flattenNodes(accurateFrame.children)
    .find((node) => node.pluginData.sourceNodeId === "dom-chat-emoji");

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert(emoji);
  assert.equal(emoji.x, 19);
  assert.equal(emoji.y, 9);
  assert.equal(emoji.width, 16);
  assert.equal(emoji.height, 21);
  assert.equal(emoji.characters, "🥰");
  assert.equal(emoji.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(emoji.layoutSizingHorizontal, "HUG");
});

test("classic Figma runtime preserves transparent padded interactive tab wrappers", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
      effects: [],
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
    createdNodes.push(node);
    return node;
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
      return { hash: `hash-${bytes.length}` };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = {
    ...basePackage,
    manifest: {
      ...basePackage.manifest,
      viewportWidth: 1342,
      viewportHeight: 520
    },
    capture: {
      ...basePackage.capture,
      root: {
        id: "node-etf-subtabs",
        sourceNodeId: "dom-etf-subtabs",
        nodeType: "element",
        tagName: "nav",
        rect: { x: 271, y: 420, width: 992, height: 37 },
        styles: {
          display: "flex",
          flexDirection: "row",
          gap: "4px",
          columnGap: "4px",
          width: "992px",
          height: "37px",
          paddingLeft: "8px",
          paddingRight: "8px",
          paddingTop: "0px",
          paddingBottom: "0px",
          overflow: "auto",
          overflowX: "auto",
          overflowY: "hidden"
        },
        attributes: { class: "etfRankPage__subTabs" },
        children: [
          {
            id: "node-etf-subtab-hot",
            sourceNodeId: "dom-etf-subtab-hot",
            nodeType: "element",
            tagName: "a",
            textContent: "熱門ETF",
            rect: { x: 279, y: 420, width: 69.875, height: 37 },
            styles: {
              display: "flex",
              alignItems: "center",
              width: "69.875px",
              height: "37px",
              backgroundColor: "rgba(0, 0, 0, 0)",
              color: "rgb(54, 54, 54)",
              fontSize: "14px",
              fontWeight: "500",
              lineHeight: "21px",
              whiteSpace: "nowrap",
              paddingLeft: "8px",
              paddingRight: "8px",
              paddingTop: "8px",
              paddingBottom: "8px"
            },
            attributes: { class: "etfRankPage__subTab etfRankPage__subTab--active" },
            children: []
          },
          {
            id: "node-etf-subtab-dividend",
            sourceNodeId: "dom-etf-subtab-dividend",
            nodeType: "element",
            tagName: "a",
            textContent: "配息",
            rect: { x: 352.875, y: 420, width: 44.063, height: 37 },
            styles: {
              display: "flex",
              alignItems: "center",
              width: "44.063px",
              height: "37px",
              backgroundColor: "rgba(0, 0, 0, 0)",
              color: "rgb(54, 54, 54)",
              fontSize: "14px",
              fontWeight: "500",
              lineHeight: "21px",
              whiteSpace: "nowrap",
              paddingLeft: "8px",
              paddingRight: "8px",
              paddingTop: "8px",
              paddingBottom: "8px"
            },
            attributes: { class: "etfRankPage__subTab" },
            children: []
          }
        ]
      }
    }
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "etf-tabs.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const accurateFrame = figma.currentPage.children.find((frame) => frame.name.includes("Editable Accurate"));
  const nestedNodes = flattenNodes(accurateFrame.children);
  const nav = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-etf-subtabs");
  const hotTab = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-etf-subtab-hot");
  const hotLabel = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-etf-subtab-hot::text");

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert(nav);
  assert(hotTab);
  assert(hotLabel);
  assert.equal(nav.layoutMode, "HORIZONTAL");
  assert.equal(nav.itemSpacing, 4);
  assert.equal(nav.paddingLeft, 8);
  assert.equal(hotTab.type, "FRAME");
  assert.equal(hotTab.x, 8);
  assert.equal(hotTab.y, 0);
  assert.equal(hotTab.width, 69.875);
  assert.equal(hotTab.height, 37);
  assert.equal(hotTab.layoutMode, "HORIZONTAL");
  assert.equal(hotTab.primaryAxisAlignItems, "CENTER");
  assert.equal(hotTab.counterAxisAlignItems, "CENTER");
  assert.equal(hotTab.paddingLeft, 8);
  assert.equal(hotTab.paddingRight, 8);
  assert.equal(hotTab.paddingTop, 8);
  assert.equal(hotTab.paddingBottom, 8);
  assert.equal(hotLabel.type, "TEXT");
  assert.equal(hotLabel.x, 8);
  assert.equal(hotLabel.y, 8);
  assert.equal(hotLabel.width, 53.88);
  assert.equal(hotLabel.height, 21);
  assert.equal(hotLabel.characters, "熱門ETF");
  assert.equal(hotLabel.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(hotLabel.layoutSizingHorizontal, "HUG");
});

test("classic Figma runtime gives absolute read-more overlays a backdrop fill", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
    createdNodes.push(node);
    return node;
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
      return {
        hash: `hash-${bytes.length}`
      };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root: {
        id: "node-card",
        sourceNodeId: "dom-card",
        nodeType: "element",
        tagName: "section",
        rect: { x: 0, y: 0, width: 728, height: 180 },
        styles: { backgroundColor: "rgb(255, 255, 255)" },
        attributes: {},
        children: [{
          id: "node-text-rule",
          sourceNodeId: "dom-text-rule",
          nodeType: "element",
          tagName: "div",
          rect: { x: 16, y: 16, width: 696, height: 135 },
          styles: {
            position: "relative",
            overflow: "hidden",
            overflowX: "hidden",
            overflowY: "hidden"
          },
          attributes: {},
          children: [{
            id: "node-read-more",
            sourceNodeId: "dom-read-more",
            nodeType: "element",
            tagName: "button",
            textContent: "閱讀更多",
            rect: { x: 624, y: 126, width: 88, height: 25 },
            styles: {
              position: "absolute",
              left: "608px",
              top: "110px",
              color: "rgb(194, 41, 46)",
              backgroundColor: "rgba(0, 0, 0, 0)",
              fontSize: "18px",
              whiteSpace: "nowrap"
            },
            attributes: {},
            children: [{
              id: "node-read-more-ellipsis",
              sourceNodeId: "dom-read-more-ellipsis",
              nodeType: "pseudo",
              tagName: "::before",
              textContent: "...",
              rect: { x: 624, y: 128, width: 30, height: 22 },
              styles: {
                content: "\"...\"",
                display: "inline",
                color: "rgb(54, 54, 54)",
                fontSize: "18px"
              },
              attributes: { "data-pseudo": "::before" },
              children: []
            }]
          }]
        }]
      }
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "read-more.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const readMore = flattenNodes(figma.currentPage.children)
    .find((node) => node.type === "FRAME" && node.pluginData.sourceNodeId === "dom-read-more");

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert(readMore);
  assert.equal(readMore.fills.length, 1);
  assert.equal(readMore.fills[0].type, "SOLID");
  assert.equal(readMore.fills[0].color.r, 1);
  assert.equal(readMore.fills[0].color.g, 1);
  assert.equal(readMore.fills[0].color.b, 1);
});

test("classic Figma runtime renders clipped background gradients as text fills", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
    createdNodes.push(node);
    return node;
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
      return {
        hash: `hash-${bytes.length}`
      };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const gradient = "linear-gradient(to right, color(srgb 0.870588 0.745098 0.529412), color(srgb 0.752941 0.545098 0.305882))";
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root: {
        ...basePackage.capture.root,
        children: [
          {
            id: "node-rank",
            sourceNodeId: "dom-rank",
            nodeType: "text",
            tagName: "#text",
            textContent: "1",
            rect: { x: 48, y: 18, width: 40, height: 33 },
            styles: {
              backgroundColor: "rgba(0, 0, 0, 0)",
              backgroundImage: gradient,
              backgroundClip: "text",
              webkitBackgroundClip: "text",
              webkitTextFillColor: "rgba(0, 0, 0, 0)",
              color: "rgb(149, 149, 149)",
              fontFamily: "Inter",
              fontSize: "28px",
              fontWeight: "700",
              lineHeight: "33px"
            },
            attributes: {},
            children: []
          }
        ]
      }
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "rank.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert.equal(createdNodes.some((node) => node.name === "Text Background / 1"), false);

  const accurateFrame = figma.currentPage.children.find((frame) => frame.name.includes("Editable Accurate"));
  const rankText = flattenNodes(accurateFrame.children).find((node) => node.type === "TEXT" && node.characters === "1");
  assert(rankText);
  assert.equal(rankText.fills.length, 1);
  assert.equal(rankText.fills[0].type, "GRADIENT_LINEAR");
  assert.equal(Number(rankText.fills[0].gradientStops[0].color.r.toFixed(6)), 0.870588);
});

test("classic Figma runtime preserves awwrated header CSS background logos and rounded controls", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function captureNode(sourceNodeId, tagName, rect, extra = {}) {
    return {
      id: `node-${sourceNodeId}`,
      sourceNodeId,
      nodeType: extra.nodeType ?? "element",
      tagName,
      textContent: extra.textContent ?? "",
      rect,
      styles: extra.styles ?? {},
      attributes: extra.attributes ?? {},
      ...(extra.assetRef ? { assetRef: extra.assetRef } : {}),
      children: extra.children ?? []
    };
  }

  function createNode(type) {
    return {
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
      effects: [],
      strokeWeight: 0,
      cornerRadius: 0,
      clipsContent: false,
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
      return { hash: `hash-${bytes.length}` };
    },
    createNodeFromSvg(svg) {
      const node = createNode("VECTOR");
      node.svg = svg;
      return node;
    },
    async loadFontAsync() {}
  };

  const gradient = "linear-gradient(45deg, rgb(255, 23, 85), rgb(47, 84, 197))";
  const basePackage = createValidPackage();
  const root = captureNode("dom-root", "body", { x: 0, y: 0, width: 1440, height: 720 }, {
    children: [
      captureNode("dom-netflix", "div", { x: 635.5, y: 20, width: 74, height: 20 }, {
        assetRef: "assets/netflix.svg",
        attributes: { assetKind: "svg", assetRole: "css-background" },
        styles: {
          backgroundImage: "url(\"https://awwrated.com/images/logo/logo_netflix_light.svg\")",
          backgroundPosition: "0px 0px",
          backgroundRepeat: "repeat",
          backgroundSize: "auto 40px",
          overflow: "hidden",
          overflowX: "hidden",
          overflowY: "hidden"
        }
      }),
      captureNode("dom-disney", "div", { x: 760.5, y: 12.5, width: 64, height: 35 }, {
        assetRef: "assets/disney.svg",
        attributes: { assetKind: "svg", assetRole: "css-background" },
        styles: {
          backgroundImage: "url(\"https://awwrated.com/images/logo/logo_disneyplus_light.svg\")",
          backgroundPosition: "0px -35px",
          backgroundRepeat: "repeat",
          backgroundSize: "auto 70px",
          overflow: "hidden",
          overflowX: "hidden",
          overflowY: "hidden"
        }
      }),
      captureNode("dom-aww", "div", { x: 20, y: 4, width: 90, height: 46 }, {
        assetRef: "assets/awwrated.svg",
        attributes: { class: "aww-logo", assetKind: "svg", assetRole: "css-background" },
        styles: {
          backgroundImage: "url(\"https://awwrated.com/images/common/logo_awwrated_light.svg\")",
          backgroundPosition: "50% 50%",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain"
        },
        children: [
          captureNode("dom-aww-version", "span", { x: 89.5, y: 43, width: 36, height: 8 }, {
            textContent: "v6.11.0",
            styles: { color: "rgb(133, 133, 133)", fontSize: "8px", lineHeight: "8px" }
          })
        ]
      }),
      captureNode("dom-remove-ads", "button", { x: 1144, y: 12, width: 112, height: 36 }, {
        styles: {
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: gradient,
          backgroundClip: "text",
          webkitBackgroundClip: "text",
          webkitTextFillColor: "rgba(0, 0, 0, 0)",
          overflow: "hidden",
          overflowX: "hidden",
          overflowY: "hidden"
        },
        children: [
          captureNode("dom-remove-ads-label", "div", { x: 1159, y: 20, width: 82, height: 20 }, {
            textContent: "享受無廣告",
            styles: {
              color: "rgba(255, 255, 255, 0.8)",
              webkitTextFillColor: "rgba(0, 0, 0, 0)",
              fontSize: "13px",
              fontWeight: "700",
              lineHeight: "20px"
            }
          }),
          captureNode("dom-remove-ads::before", "::before", { x: 1144, y: 12, width: 112, height: 36 }, {
            nodeType: "pseudo",
            styles: {
              position: "absolute",
              backgroundColor: "rgba(0, 0, 0, 0)",
              backgroundImage: gradient,
              maskImage: "linear-gradient(rgb(255, 255, 255) 0px, rgb(255, 255, 255) 0px), linear-gradient(rgb(255, 255, 255) 0px, rgb(255, 255, 255) 0px)",
              webkitMaskImage: "linear-gradient(rgb(255, 255, 255) 0px, rgb(255, 255, 255) 0px), linear-gradient(rgb(255, 255, 255) 0px, rgb(255, 255, 255) 0px)",
              maskComposite: "exclude, exclude",
              webkitMaskComposite: "exclude, exclude",
              paddingTop: "2.6px",
              paddingRight: "2.6px",
              paddingBottom: "2.6px",
              paddingLeft: "2.6px",
              borderTopLeftRadius: "20px",
              borderTopRightRadius: "20px",
              borderBottomRightRadius: "20px",
              borderBottomLeftRadius: "20px"
            }
          })
        ]
      }),
      captureNode("dom-avatar", "div", { x: 1273, y: 18, width: 24, height: 24 }, {
        assetRef: "assets/avatar.png",
        attributes: { class: "avatar", assetKind: "raster", assetRole: "css-background" },
        styles: {
          backgroundImage: "url(\"https://awwrated.com/images/avatar/users/avatar-user-red.jpg\")",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          borderTopLeftRadius: "50%",
          borderTopRightRadius: "50%",
          borderBottomRightRadius: "50%",
          borderBottomLeftRadius: "50%"
        }
      }),
      captureNode("dom-card", "a", { x: 200, y: 120, width: 105, height: 140 }, {
        assetRef: "assets/poster.png",
        attributes: { assetKind: "raster", assetRole: "css-background" },
        styles: {
          backgroundImage: "url(\"https://cdn.example.com/poster.png\")",
          backgroundSize: "cover",
          overflow: "hidden",
          overflowX: "hidden",
          overflowY: "hidden",
          borderTopLeftRadius: "8px",
          borderTopRightRadius: "8px",
          borderBottomRightRadius: "8px",
          borderBottomLeftRadius: "8px"
        },
        children: [
          captureNode("dom-card-title", "div", { x: 210, y: 235, width: 80, height: 16 }, {
            textContent: "鐵拳教育",
            styles: { color: "rgb(255, 255, 255)", fontSize: "12px", lineHeight: "16px" }
          }),
          captureNode("dom-card-rank", "b", { x: 277, y: 120, width: 28, height: 28 }, {
            textContent: "1",
            styles: {
              display: "flex",
              position: "absolute",
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: "linear-gradient(223deg, rgb(0, 63, 255) 0%, rgb(255, 0, 68) 100%)",
              color: "rgb(255, 255, 255)",
              fontSize: "14px",
              fontWeight: "700",
              lineHeight: "14px",
              borderTopRightRadius: "8px",
              borderBottomLeftRadius: "8px"
            }
          })
        ]
      })
    ]
  });
  const packageData = createValidPackage({
    ...basePackage,
    capture: {
      ...basePackage.capture,
      root
    },
    assets: {
      "assets/netflix.svg": new TextEncoder().encode("<svg width=\"74px\" height=\"40px\" viewBox=\"0 0 74 40\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"74\" height=\"40\" fill=\"white\"/></svg>"),
      "assets/disney.svg": new TextEncoder().encode("<svg width=\"37px\" height=\"40px\" viewBox=\"0 0 37 40\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"37\" height=\"40\" fill=\"white\"/></svg>"),
      "assets/awwrated.svg": new TextEncoder().encode("<svg width=\"252px\" height=\"161px\" viewBox=\"0 0 252 161\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"252\" height=\"161\" fill=\"white\"/></svg>"),
      "assets/avatar.png": pngHeaderBytes(24, 24),
      "assets/poster.png": pngHeaderBytes(105, 140)
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "awwrated-header.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = resultMessage(posted);
  assert.equal(success.type, "IMPORT_SUCCESS");

  const accurateFrame = figma.currentPage.children.find((frame) => frame.name.includes("Editable Accurate"));
  const nodes = flattenNodes(accurateFrame.children);
  const netflixLogo = nodes.find((node) => node.pluginData.sourceNodeId === "dom-netflix");
  const disneyLogo = nodes.find((node) => node.pluginData.sourceNodeId === "dom-disney");
  const awwLogoBackground = nodes.find((node) => node.pluginData.sourceNodeId === "dom-aww::background-image");
  const border = nodes.find((node) => node.pluginData.sourceNodeId === "dom-remove-ads::before");
  const removeAdsText = nodes.find((node) => node.type === "TEXT" && node.characters === "享受無廣告");
  const avatar = nodes.find((node) => node.pluginData.sourceNodeId === "dom-avatar");
  const card = nodes.find((node) => node.pluginData.sourceNodeId === "dom-card");
  const cardBackground = nodes.find((node) => node.pluginData.sourceNodeId === "dom-card::background-image");
  const rankFrame = nodes.find((node) => node.pluginData.sourceNodeId === "dom-card-rank");

  assert(netflixLogo);
  assert.equal(netflixLogo.type, "FRAME");
  assert.equal(netflixLogo.width, 74);
  assert.equal(netflixLogo.height, 20);
  assert.equal(netflixLogo.children[0].width, 74);
  assert.equal(netflixLogo.children[0].height, 40);
  assert.equal(netflixLogo.pluginData.assetRole, "css-background");

  assert(disneyLogo);
  assert.equal(disneyLogo.type, "FRAME");
  assert.equal(disneyLogo.width, 64);
  assert.equal(disneyLogo.height, 35);
  assert(Math.abs(disneyLogo.children[0].width - 64.75) < 0.01);
  assert.equal(disneyLogo.children[0].height, 70);
  assert.equal(disneyLogo.children[0].y, -35);

  assert(awwLogoBackground);
  assert.equal(awwLogoBackground.pluginData.assetRole, "css-background");

  assert(border);
  assert.equal(border.fills.length, 0);
  assert.equal(border.strokes[0].type, "GRADIENT_LINEAR");
  assert.equal(border.strokeWeight, 2.6);
  assert.equal(border.cornerRadius, 20);

  assert(removeAdsText);
  assert.equal(removeAdsText.fills[0].type, "GRADIENT_LINEAR");

  assert(avatar);
  assert.equal(avatar.cornerRadius >= 12, true);
  assert.equal(avatar.pluginData.assetRole, "css-background");

  assert(card);
  assert.equal(card.cornerRadius, 8);
  assert.equal(card.clipsContent, true);
  assert(cardBackground);
  assert.equal(cardBackground.cornerRadius, 8);
  assert.equal(cardBackground.pluginData.assetRole, "css-background");
  assert(rankFrame);
  assert.equal(rankFrame.x, 77);
  assert.equal(rankFrame.y, 0);
  assert.equal(rankFrame.topLeftRadius, 0);
  assert.equal(rankFrame.topRightRadius, 8);
  assert.equal(rankFrame.bottomRightRadius, 0);
  assert.equal(rankFrame.bottomLeftRadius, 8);
  assert.equal(rankFrame.primaryAxisAlignItems, "CENTER");
  assert.equal(rankFrame.counterAxisAlignItems, "CENTER");
  assert(rankFrame.children.some((node) => node.type === "TEXT" && node.characters === "1"));
  const rankText = rankFrame.children.find((node) => node.type === "TEXT" && node.characters === "1");
  assert.equal(rankText.layoutPositioning, undefined);
  assert.equal(rankText.layoutSizingHorizontal, "HUG");
  assert.equal(rankText.layoutSizingVertical, "HUG");
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
      "effects",
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
      "textAlignHorizontal",
      "layoutSizingHorizontal",
      "layoutSizingVertical",
      "layoutPositioning",
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
      layoutPositioning: "",
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
        key === "Classic Sans Bold Italic" ||
        key === "Noto Sans TC Medium") {
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
            id: "node-webp-banner",
            sourceNodeId: "dom-webp-banner",
            nodeType: "element",
            tagName: "img",
            rect: { x: 0, y: 159, width: 390, height: 94 },
            styles: {},
            attributes: {
              alt: "Banner"
            },
            assetRef: "assets/banner.webp",
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
            id: "node-classic-medium",
            sourceNodeId: "dom-classic-medium",
            nodeType: "text",
            tagName: "#text",
            textContent: "中文 Medium",
            rect: { x: 144, y: 268, width: 112, height: 24 },
            styles: {
              fontFamily: "Inter, \"Noto Sans TC\", \"Pingfang TC\", sans-serif",
              fontWeight: "500",
              fontSize: "16px",
              color: "rgb(54, 54, 54)"
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
                styles: {
                  color: "rgb(255, 255, 255)"
                },
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
            styles: {
              color: "color(srgb 0.85098 0.866667 0.894118)"
            },
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
            id: "node-card-bottom-fade",
            sourceNodeId: "dom-card-bottom-fade",
            nodeType: "element",
            tagName: "div",
            rect: { x: 900, y: 141, width: 280, height: 360 },
            styles: {
              backgroundColor: "rgba(0, 0, 0, 0)",
              backgroundImage: "linear-gradient(rgba(0, 0, 0, 0), rgb(0, 0, 0))"
            },
            attributes: { class: "masterCreatorCard__fade" },
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
      "assets/banner.webp": new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      "assets/fallback-1.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "assets/vector-1.svg": new TextEncoder().encode("<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\" fill=\"currentColor\"/></svg>"),
      "assets/arrow.svg": new TextEncoder().encode("<svg width=\"10\" height=\"17\" viewBox=\"0 0 10 17\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L10 8.5L0 17Z\" fill=\"#676767\"/></svg>")
    }
  });

  vm.runInNewContext(main, { figma, Uint8Array, Uint32Array, ArrayBuffer, DataView, Error, JSON, Math, Number, Object, Promise, String, Boolean, Array, isFinite, parseFloat });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "dashboard.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const successMessage = resultMessage(posted);
  assert.equal(successMessage.type, "IMPORT_SUCCESS", JSON.stringify(successMessage));
  assert.equal(successMessage.report.createdFrameCount, 2);
  assert(successMessage.report.autoLayoutConfidenceSummary.appliedCount >= 1);

  // Importing streams progress: at least one IMPORT_PROGRESS message reaches the
  // UI, it carries a real total, and the percentage never moves backwards.
  const progressMessages = posted.filter((message) => message.type === "IMPORT_PROGRESS");
  assert(progressMessages.length >= 1, "expected IMPORT_PROGRESS messages");
  assert(progressMessages.some((message) => message.total > 0), "expected a determinate total");
  const rendering = progressMessages.filter((message) => message.phase === "rendering" && message.total > 0);
  for (let index = 1; index < rendering.length; index += 1) {
    assert(rendering[index].processed >= rendering[index - 1].processed, "progress must not regress");
  }
  assert.equal(posted.indexOf(successMessage), posted.length - 1, "success must be the final message");

  const accurateFrame = figma.currentPage.children.find((frame) => frame.name.includes("Editable Accurate"));
  const nestedNodes = flattenNodes(accurateFrame.children);
  const autoLayoutFrame = nestedNodes.find((node) => node.type === "FRAME" && node.layoutMode === "HORIZONTAL");
  const navText = nestedNodes.find((node) => node.type === "TEXT" && node.characters === "Home");
  const classicFontText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-classic-font");
  const classicMediumText = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-classic-medium");
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
  const cardBottomFade = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-card-bottom-fade");
  const placeholder = nestedNodes.find((node) => node.pluginData.assetRef === "assets/image-1.png");
  const webpBannerFallback = nestedNodes.find((node) => node.pluginData.sourceNodeId === "dom-webp-banner");
  const vectorNode = nestedNodes.find((node) => node.type === "VECTOR" && node.pluginData.assetRef === "assets/vector-1.svg");
  const currentColorVector = nestedNodes.find((node) => node.type === "VECTOR" && node.pluginData.sourceNodeId === "dom-svg");
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
  const classicFontSubstitution = successMessage.report.fontSubstitutions
    .find((item) => item.sourceNodeId === "dom-classic-font");
  assert(classicFontSubstitution);
  assert.equal(classicFontSubstitution.used.family, "Classic Sans");
  assert.equal(classicFontSubstitution.used.style, "Regular");
  const classicMediumSubstitution = successMessage.report.fontSubstitutions
    .find((item) => item.sourceNodeId === "dom-classic-medium");
  assert(classicMediumSubstitution);
  assert.equal(classicMediumSubstitution.used.family, "Pingfang TC");
  assert.equal(classicMediumSubstitution.used.style, "Medium");
  assert(classicMediumText);
  assert.equal(classicMediumText.fontName.family, "Pingfang TC");
  assert.equal(classicMediumText.fontName.style, "Medium");
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
  assert.match(memberPointsChildren[0].svg, /fill="rgb\(255, 255, 255\)"/);
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
  assert(cardBottomFade);
  assert.equal(cardBottomFade.fills[0].type, "GRADIENT_LINEAR");
  assert.deepEqual(Array.from(cardBottomFade.fills[0].gradientTransform, (row) => Array.from(row)), [
    [0, 1, 0],
    [-1, 0, 1]
  ]);
  assert(placeholder);
  assert.equal(placeholder.type, "RECTANGLE");
  assert.match(placeholder.name, /Screenshot Crop$/);
  assert.match(placeholder.pluginData.fallbackReason, /screenshot crop fallback/);
  assert.equal(placeholder.children.length, 0);
  assert.equal(placeholder.fills[0].scaleMode, "CROP");
  assert(webpBannerFallback);
  assert.equal(webpBannerFallback.type, "RECTANGLE");
  assert.match(webpBannerFallback.pluginData.fallbackReason, /screenshot crop fallback/);
  assert.equal(webpBannerFallback.children.length, 0);
  assert.equal(webpBannerFallback.fills[0].scaleMode, "CROP");
  assert(vectorNode);
  assert.match(vectorNode.svg, /<path/);
  assert(currentColorVector);
  assert.equal(currentColorVector.svg.includes("currentColor"), false);
  assert.match(currentColorVector.svg, /fill="rgb\(217, 221, 228\)"/);
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

test("classic Figma runtime matches module runtime semantic names, collapsed tree, and statistics", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const { createEditableLayoutNodeModels, summarizeSemanticNamingModels } = await import("../dist/layout-tree.js");
  const posted = [];

  function captureNode(sourceNodeId, tagName, rect, extra = {}) {
    return {
      id: `node-${sourceNodeId}`,
      sourceNodeId,
      nodeType: "element",
      tagName,
      textContent: extra.textContent ?? "",
      rect,
      styles: extra.styles ?? {},
      attributes: extra.attributes ?? {},
      children: extra.children ?? []
    };
  }

  const card = (id, x) => captureNode(id, "div", { x, y: 200, width: 200, height: 180 }, {
    attributes: { class: "card" },
    styles: { backgroundColor: "rgb(255, 255, 255)", borderTopLeftRadius: "8px" },
    children: [
      captureNode(`${id}-title`, "p", { x: x + 16, y: 216, width: 80, height: 20 }, {
        textContent: "標題",
        styles: { fontSize: "14px", color: "rgb(17, 24, 39)" }
      })
    ]
  });
  const root = captureNode("dom-root", "body", { x: 0, y: 0, width: 1440, height: 900 }, {
    children: [
      captureNode("dom-header", "header", { x: 0, y: 0, width: 1440, height: 64 }, {
        styles: { backgroundColor: "rgb(255, 255, 255)" },
        children: [
          captureNode("dom-nav", "nav", { x: 32, y: 12, width: 400, height: 40 }, {
            styles: { backgroundColor: "rgb(247, 247, 247)" }
          })
        ]
      }),
      captureNode("dom-login", "button", { x: 1300, y: 16, width: 80, height: 32 }, {
        textContent: "登入",
        styles: { fontSize: "14px", color: "rgb(17, 24, 39)" }
      }),
      card("dom-card-a", 20),
      card("dom-card-b", 240),
      captureNode("dom-wrapper", "div", { x: 600, y: 200, width: 300, height: 200 }, {
        children: [
          captureNode("dom-inner", "div", { x: 600, y: 200, width: 300, height: 200 }, {
            styles: { backgroundColor: "rgb(240, 240, 240)" },
            children: [
              captureNode("dom-inner-label", "p", { x: 616, y: 216, width: 60, height: 20 }, {
                textContent: "內容",
                styles: { fontSize: "14px", color: "rgb(17, 24, 39)" }
              })
            ]
          })
        ]
      }),
      captureNode("dom-footer", "footer", { x: 0, y: 836, width: 1440, height: 64 }, {
        styles: { backgroundColor: "rgb(17, 24, 39)" }
      })
    ]
  });
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root
    },
    diagnostics: {
      ...basePackage.diagnostics,
      fallbackReasons: []
    }
  });

  const moduleModels = createEditableLayoutNodeModels(packageData);
  const moduleSummary = summarizeSemanticNamingModels(moduleModels);
  const flattenModelNames = (model) => [model.name, ...(model.children ?? []).flatMap(flattenModelNames)];
  const moduleNames = flattenModelNames(moduleModels[0]);

  function createNode(type) {
    return {
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
      return {
        hash: `hash-${bytes.length}`
      };
    },
    async loadFontAsync() {}
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "parity.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const accurateFrame = figma.currentPage.children[1];
  const flattenRenderedNames = (node) => [node.name, ...(node.children ?? []).flatMap(flattenRenderedNames)];
  const classicNames = (accurateFrame.children ?? []).flatMap(flattenRenderedNames);

  assert.deepEqual(classicNames, moduleNames);
  for (const expected of ["Header", "Navigation", "Button / 登入", "Card 1", "Card 2", "Footer"]) {
    assert.ok(classicNames.includes(expected), `expected ${expected} in ${JSON.stringify(classicNames)}`);
  }
  assert.equal(moduleModels[0].children.some((child) => child.sourceNodeId === "dom-wrapper"), false);

  assert.deepEqual(JSON.parse(JSON.stringify(success.report.semanticNamingSummary)), moduleSummary);
  assert.equal(success.report.semanticNamingSummary.repeatedGroups, 1);
  assert.equal(success.report.semanticNamingSummary.collapsedWrappers >= 1, true);
});

test("classic Figma runtime centers margin-auto children in vertical auto layout", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function captureNode(sourceNodeId, tagName, rect, extra = {}) {
    return {
      id: `node-${sourceNodeId}`,
      sourceNodeId,
      nodeType: "element",
      tagName,
      textContent: extra.textContent ?? "",
      rect,
      styles: extra.styles ?? {},
      attributes: extra.attributes ?? {},
      children: extra.children ?? []
    };
  }

  function createNode(type) {
    return {
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
  }

  const root = captureNode("dom-root", "body", { x: 0, y: 0, width: 1434, height: 1131.25 }, {
    children: [
      captureNode("dom-section", "div", { x: 0, y: 0, width: 1434, height: 1131.25 }, {
        styles: {
          display: "flex",
          flexDirection: "column",
          paddingTop: "100px",
          paddingBottom: "100px"
        },
        children: [
          captureNode("dom-section-a", "div", { x: 117, y: 100, width: 1200, height: 455.63 }, {
            styles: {
              backgroundColor: "rgb(255, 255, 255)",
              marginLeft: "117px",
              marginRight: "117px",
              width: "1200px",
              maxWidth: "1200px"
            }
          }),
          captureNode("dom-section-b", "div", { x: 117, y: 675.62, width: 1200, height: 455.63 }, {
            styles: {
              backgroundColor: "rgb(255, 255, 255)",
              marginLeft: "117px",
              marginRight: "117px",
              width: "1200px",
              maxWidth: "1200px"
            }
          })
        ]
      })
    ]
  });
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root
    }
  });
  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) { return { hash: `hash-${bytes.length}` }; },
    async loadFontAsync() {}
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "centered.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const accurateFrame = figma.currentPage.children[1];
  const section = flattenNodes(accurateFrame.children).find((node) => node.pluginData?.sourceNodeId === "dom-section");
  assert(section);
  assert.equal(section.layoutMode, "VERTICAL");
  assert.equal(section.counterAxisAlignItems, "CENTER");
  assert.equal(section.paddingLeft, 0);
  assert.equal(section.paddingRight, 0);
});

test("classic Figma runtime orders auto-layout children by captured visual position", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function captureNode(sourceNodeId, tagName, rect, extra = {}) {
    return {
      id: `node-${sourceNodeId}`,
      sourceNodeId,
      nodeType: extra.nodeType ?? "element",
      tagName,
      textContent: extra.textContent ?? "",
      rect,
      styles: extra.styles ?? {},
      attributes: extra.attributes ?? {},
      children: extra.children ?? []
    };
  }

  function captureText(sourceNodeId, textContent, rect, styles = {}) {
    return captureNode(sourceNodeId, "#text", rect, {
      nodeType: "text",
      textContent,
      styles: {
        fontSize: "14px",
        lineHeight: "16px",
        color: "rgb(255, 255, 255)",
        ...styles
      }
    });
  }

  function createNode(type) {
    return {
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
  }

  const root = captureNode("dom-rating-section", "section", { x: 232.47, y: 763, width: 169.55, height: 72 }, {
    styles: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center"
    },
    children: [
      captureNode("dom-rating-label", "h6", { x: 232.47, y: 787, width: 169.55, height: 48 }, {
        styles: { display: "flex", flexDirection: "column", paddingTop: "10px" },
        children: [
          captureText("dom-rating-info", "推薦!", { x: 232.47, y: 797, width: 32.89, height: 16 }),
          captureText("dom-rating-author", "By LV 7 吉比寶（愛看影片）", { x: 232.47, y: 817, width: 169.55, height: 18 })
        ]
      }),
      captureNode("dom-rating-stars", "div", { x: 232.47, y: 763, width: 139, height: 24 }, {
        styles: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center"
        },
        children: [
          captureText("dom-rating-avatar", "●", { x: 232.47, y: 763, width: 24, height: 24 }),
          captureText("dom-rating-star", "★", { x: 259.47, y: 767, width: 16, height: 16 })
        ]
      })
    ]
  });
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root
    }
  });
  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) { return { hash: `hash-${bytes.length}` }; },
    async loadFontAsync() {}
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "visual-order.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const accurateFrame = figma.currentPage.children[1];
  const section = flattenNodes(accurateFrame.children).find((node) => node.pluginData?.sourceNodeId === "dom-rating-section");
  assert(section);
  assert.equal(section.layoutMode, "VERTICAL");
  assert.deepEqual(
    section.children.map((node) => node.pluginData?.sourceNodeId),
    ["dom-rating-stars", "dom-rating-label"]
  );
});

test("classic Figma runtime keeps transformed labels auto-width and pseudo bar opacity fills", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function captureNode(sourceNodeId, tagName, rect, extra = {}) {
    return {
      id: `node-${sourceNodeId}`,
      sourceNodeId,
      nodeType: extra.nodeType ?? "element",
      tagName,
      textContent: extra.textContent ?? "",
      rect,
      styles: extra.styles ?? {},
      attributes: extra.attributes ?? {},
      children: extra.children ?? []
    };
  }

  function createNode(type) {
    return {
      type,
      name: "",
      children: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fills: [],
      strokes: [],
      effects: [],
      strokeWeight: 0,
      cornerRadius: 0,
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
  }

  const root = captureNode("dom-root", "main", { x: 0, y: 0, width: 160, height: 40 }, {
    children: [
      captureNode("dom-popularity-label", "p", { x: 32.05, y: 3.7, width: 35.9, height: 12.6 }, {
        textContent: "超人氣!",
        styles: {
          display: "block",
          position: "relative",
          width: "39.8906px",
          height: "14px",
          fontSize: "12px",
          lineHeight: "14px",
          whiteSpace: "nowrap",
          overflow: "visible",
          overflowX: "visible",
          textOverflow: "clip",
          transform: "matrix(0.9, 0, 0, 0.9, 0, 0)",
          color: "rgb(255, 255, 255)"
        }
      }),
      captureNode("dom-rating-border-after", "::after", { x: 0, y: 18, width: 100, height: 20 }, {
        nodeType: "pseudo",
        styles: {
          display: "block",
          position: "absolute",
          content: "\"\"",
          opacity: "0.2",
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "linear-gradient(270deg, rgb(91, 110, 255) 0%, rgb(0, 40, 131) 100%)",
          borderTopWidth: "0.5px",
          borderRightWidth: "0.5px",
          borderBottomWidth: "0.5px",
          borderLeftWidth: "0.5px",
          borderTopStyle: "solid",
          borderRightStyle: "solid",
          borderBottomStyle: "solid",
          borderLeftStyle: "solid",
          borderTopColor: "rgb(49, 57, 255)",
          borderRightColor: "rgb(49, 57, 255)",
          borderBottomColor: "rgb(49, 57, 255)",
          borderLeftColor: "rgb(49, 57, 255)",
          borderTopLeftRadius: "10px",
          borderTopRightRadius: "10px",
          borderBottomRightRadius: "10px",
          borderBottomLeftRadius: "10px"
        }
      })
    ]
  });
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root
    }
  });
  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) { return { hash: `hash-${bytes.length}` }; },
    async loadFontAsync() {}
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "awwrated-rating-bar.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const accurateFrame = figma.currentPage.children[1];
  const nodes = flattenNodes(accurateFrame.children);
  const label = nodes.find((node) => node.pluginData?.sourceNodeId === "dom-popularity-label");
  const overlay = nodes.find((node) => node.pluginData?.sourceNodeId === "dom-rating-border-after");

  assert(label);
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert(overlay);
  assert.equal(overlay.fills.length, 1);
  assert.equal(overlay.fills[0].type, "GRADIENT_LINEAR");
  assert.equal(overlay.opacity, 0.2);
  assert.equal(overlay.strokes[0].type, "SOLID");
  assert.equal(overlay.strokeWeight, 0.5);
});

test("classic Figma runtime applies auto layout to centered non-flex flow groups", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function captureNode(sourceNodeId, tagName, rect, extra = {}) {
    return {
      id: `node-${sourceNodeId}`,
      sourceNodeId,
      nodeType: extra.nodeType ?? "element",
      tagName,
      textContent: extra.textContent ?? "",
      rect,
      styles: extra.styles ?? {},
      attributes: extra.attributes ?? {},
      children: extra.children ?? []
    };
  }

  function createNode(type) {
    return {
      type,
      name: "",
      children: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fills: [],
      strokes: [],
      effects: [],
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
  }

  const root = captureNode("dom-root", "main", { x: 0, y: 0, width: 1160, height: 120 }, {
    children: [
      captureNode("dom-sponsor-heading", "h5", { x: 0, y: 0, width: 1160, height: 40 }, {
        textContent: "スポンサー",
        styles: {
          display: "block",
          textAlign: "center",
          fontSize: "14px",
          lineHeight: "20px"
        },
        children: [
          captureNode("dom-sponsor-link", "a", { x: 533, y: 0, width: 164, height: 40 }, {
            textContent: "スポンサーになる",
            styles: {
              display: "inline-block",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              fontSize: "13px",
              lineHeight: "13px"
            },
            children: [
              captureNode("dom-sponsor-plus", "span", { x: 655, y: 8, width: 24, height: 24 }, {
                textContent: "+1",
                styles: {
                  display: "inline",
                  fontSize: "13px",
                  lineHeight: "24px"
                }
              })
            ]
          })
        ]
      }),
      captureNode("dom-metric-section", "section", { x: 471.23, y: 60, width: 217.54, height: 52 }, {
        textContent: "2025年の総ユニーク訪問者数",
        styles: {
          display: "block",
          textAlign: "center",
          fontSize: "16px",
          lineHeight: "26px"
        },
        children: [
          captureNode("dom-metric-value", "b", { x: 471.23, y: 86, width: 217.54, height: 26 }, {
            textContent: "610,000",
            styles: {
              display: "block",
              textAlign: "center",
              fontSize: "24px",
              lineHeight: "26px"
            }
          })
        ]
      })
    ]
  });
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root
    }
  });
  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) { return { hash: `hash-${bytes.length}` }; },
    async loadFontAsync() {}
  };

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "non-flex-flow.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const nodes = flattenNodes(figma.currentPage.children);
  const heading = nodes.find((node) => node.pluginData?.sourceNodeId === "dom-sponsor-heading");
  const link = nodes.find((node) => node.pluginData?.sourceNodeId === "dom-sponsor-link");
  const metric = nodes.find((node) => node.pluginData?.sourceNodeId === "dom-metric-section");

  assert.equal(resultMessage(posted).type, "IMPORT_SUCCESS");
  assert.equal(heading?.layoutMode, "HORIZONTAL");
  assert.equal(heading?.primaryAxisAlignItems, "CENTER");
  assert.equal(link?.layoutMode, "HORIZONTAL");
  assert.equal(link?.counterAxisAlignItems, "CENTER");
  assert.equal(metric?.layoutMode, "VERTICAL");
  assert.equal(metric?.counterAxisAlignItems, "CENTER");
  assert.deepEqual(metric?.children.map((node) => node.pluginData?.sourceNodeId), [
    "dom-metric-section::text",
    "dom-metric-value"
  ]);
});

test("classic Figma runtime sizes full-page frames to the document dimensions", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function createNode(type) {
    return {
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
      return {
        hash: `hash-${bytes.length}`
      };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    manifest: {
      ...basePackage.manifest,
      captureMode: "full-page",
      documentWidth: 1440,
      documentHeight: 5200
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "full-page.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const frames = figma.currentPage.children;
  assert.equal(frames.length, 2);
  for (const frame of frames) {
    assert.equal(frame.width, 1440);
    assert.equal(frame.height, 5200);
    assert.match(frame.name, /1440x5200/);
  }
  const screenshotLayer = frames[0].children[0];
  assert.equal(screenshotLayer.width, 1440);
  assert.equal(screenshotLayer.height, 5200);
});

test("classic Figma runtime uses packaged full-page screenshot tiles", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function createNode(type) {
    return {
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
  }

  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) {
      return { hash: `hash-${bytes.length}` };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const screenshotBytes = new Uint8Array([...pngHeaderBytes(2880, 6800), 0x01]);
  const packageData = createValidPackage({
    manifest: {
      ...basePackage.manifest,
      captureMode: "full-page",
      documentWidth: 1440,
      documentHeight: 3400,
      devicePixelRatio: 2
    },
    screenshot: screenshotBytes,
    assets: {
      ...basePackage.assets,
      "assets/source-screenshot/tile-0000.png": pngHeaderBytes(2880, 3600),
      "assets/source-screenshot/tile-0001.png": pngHeaderBytes(2880, 3200)
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "full-page-tiled.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const sourceFrame = figma.currentPage.children[0];
  assert.deepEqual(sourceFrame.children.map((node) => ({
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    scaleMode: node.fills[0].scaleMode,
    imageTransform: JSON.parse(JSON.stringify(node.fills[0].imageTransform))
  })), [
    { name: "Source screenshot / Tile 1", x: 0, y: 0, width: 1440, height: 1800, scaleMode: "CROP", imageTransform: [[1, 0, 0], [0, 1, 0]] },
    { name: "Source screenshot / Tile 2", x: 0, y: 1800, width: 1440, height: 1600, scaleMode: "CROP", imageTransform: [[1, 0, 0], [0, 1, 0]] }
  ]);
});

test("classic Figma runtime scales clamped full-page screenshot tiles to document height", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function createNode(type) {
    return {
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
  }

  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) {
      return { hash: `hash-${bytes.length}` };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    manifest: {
      ...basePackage.manifest,
      captureMode: "full-page",
      documentWidth: 1440,
      documentHeight: 16510,
      devicePixelRatio: 2
    },
    screenshot: pngHeaderBytes(2880, 16384),
    assets: {
      ...basePackage.assets,
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
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "full-page-clamped.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const sourceLayers = figma.currentPage.children[0].children;
  assert.equal(sourceLayers.length, 10);
  assert.equal(sourceLayers[0].y, 0);
  assert.equal(sourceLayers.at(-1).y + sourceLayers.at(-1).height, 16510);
  assert(sourceLayers.every((node) => node.width === 1440));
  assert(sourceLayers.every((node) => node.fills[0].scaleMode === "CROP"));
  assert(sourceLayers.every((node) => JSON.stringify(node.fills[0].imageTransform) === JSON.stringify([
    [1, 0, 0],
    [0, 1, 0]
  ])));
});

test("classic Figma runtime uses source screenshot tiles for image crop fallback", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];

  function createNode(type) {
    return {
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
  }

  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) {
      return { hash: `hash-${bytes.length}` };
    },
    async loadFontAsync() {}
  };
  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    manifest: {
      ...basePackage.manifest,
      captureMode: "full-page",
      documentWidth: 1440,
      documentHeight: 16510,
      devicePixelRatio: 2
    },
    capture: {
      ...basePackage.capture,
      viewport: { width: 1440, height: 973, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 1440, height: 16510 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-footer-logo",
            sourceNodeId: "dom-footer-logo",
            nodeType: "element",
            tagName: "img",
            rect: { x: 40, y: 16232.61, width: 140, height: 47 },
            styles: { objectFit: "contain" },
            attributes: { alt: "Footer Logo" },
            assetRef: "assets/logo.png",
            children: []
          }
        ]
      }
    },
    screenshot: pngHeaderBytes(2880, 16384),
    assets: {
      ...basePackage.assets,
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
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "full-page-logo-fallback.figcapture",
    bytes: packFigcapture(packageData)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const success = posted.find((message) => message.type === "IMPORT_SUCCESS");
  assert.ok(success, `expected IMPORT_SUCCESS, got ${JSON.stringify(posted)}`);

  const editableNodes = flattenNodes(figma.currentPage.children[1].children);
  const footerLogo = editableNodes.find((node) => node.pluginData.sourceNodeId === "dom-footer-logo");
  assert(footerLogo);
  assert.equal(footerLogo.type, "RECTANGLE");
  assert.equal(footerLogo.children.length, 0);
  assert.equal(footerLogo.pluginData.cropAssetRef, "assets/source-screenshot/tile-0009.png");
  assert.equal(footerLogo.fills[0].scaleMode, "CROP");
  assert.deepEqual(JSON.parse(JSON.stringify(footerLogo.fills[0].imageTransform)), [
    [0.1, 0, 0.03],
    [0, 0.15, 0.11]
  ]);
  assert.match(footerLogo.pluginData.fallbackReason, /asset aspect ratio mismatch/);
});

test("classic Figma runtime binds matching colors and numbers to local variables", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
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
      cornerRadius: 0,
      pluginData: {},
      boundFields: {},
      resize(width, height) {
        this.width = width;
        this.height = height;
      },
      appendChild(child) {
        this.children.push(child);
      },
      setPluginData(key, value) {
        this.pluginData[key] = value;
      },
      setBoundVariable(field, variable) {
        this.boundFields[field] = variable.id;
      }
    };
    createdNodes.push(node);
    return node;
  }

  const redVariable = { id: "var-red", valuesByMode: { mode: { r: 1, g: 0, b: 0, a: 1 } } };
  const radiusVariable = { id: "var-radius-8", valuesByMode: { mode: 8 } };

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
      return { hash: `hash-${bytes.length}` };
    },
    async loadFontAsync() {},
    variables: {
      async getLocalVariablesAsync(type) {
        if (type === "COLOR") return [redVariable];
        if (type === "FLOAT") return [radiusVariable];
        return [];
      },
      setBoundVariableForPaint(paint, field, variable) {
        return {
          ...paint,
          boundVariables: { [field]: { type: "VARIABLE_ALIAS", id: variable.id } }
        };
      }
    }
  };

  const basePackage = createValidPackage();
  const packageData = createValidPackage({
    capture: {
      ...basePackage.capture,
      root: {
        id: "node-root",
        sourceNodeId: "dom-root",
        nodeType: "element",
        tagName: "main",
        rect: { x: 0, y: 0, width: 390, height: 200 },
        styles: {},
        attributes: {},
        children: [
          {
            id: "node-card",
            sourceNodeId: "dom-card",
            nodeType: "element",
            tagName: "div",
            rect: { x: 16, y: 16, width: 200, height: 120 },
            styles: {
              backgroundColor: "rgb(255, 0, 0)",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              borderBottomLeftRadius: "8px",
              borderBottomRightRadius: "8px"
            },
            attributes: {},
            children: []
          }
        ]
      }
    }
  });

  vm.runInNewContext(main, {
    figma,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    isFinite,
    parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "card.figcapture",
    bytes: packFigcapture(packageData),
    matchVariables: true
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const card = flattenNodes(figma.currentPage.children).find(
    (node) => node.pluginData.sourceNodeId === "dom-card"
  );
  assert(card, "card node should be created");
  assert.equal(card.fills[0].boundVariables.color.id, "var-red", "red fill should bind to the color variable");
  assert.equal(card.boundFields.topLeftRadius, "var-radius-8", "corner radius should bind to the float variable");

  const success = resultMessage(posted);
  assert.equal(success.type, "IMPORT_SUCCESS");
  assert.equal(success.report.variableBindings.available, true);
  assert.equal(success.report.variableBindings.colors, 1);
  assert.equal(success.report.variableBindings.numbers, 1);
});

test("classic Figma runtime skips variable binding when matchVariables is false", async () => {
  const main = await readFile("apps/figma-plugin/dist/code.js", "utf8");
  const posted = [];
  let variablesQueried = 0;

  function createNode(type) {
    return {
      type,
      name: "",
      children: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fills: [],
      strokes: [],
      cornerRadius: 0,
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
  }

  const figma = {
    currentPage: { children: [], appendChild(child) { this.children.push(child); } },
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return createNode("FRAME"); },
    createRectangle() { return createNode("RECTANGLE"); },
    createText() { return createNode("TEXT"); },
    createImage(bytes) { return { hash: `hash-${bytes.length}` }; },
    async loadFontAsync() {},
    variables: {
      async getLocalVariablesAsync() {
        variablesQueried += 1;
        return [];
      },
      setBoundVariableForPaint(paint) { return paint; }
    }
  };

  vm.runInNewContext(main, {
    figma, Uint8Array, Uint32Array, ArrayBuffer, DataView, Error, JSON, Math,
    Number, Object, Promise, String, Boolean, Array, isFinite, parseFloat
  });
  await figma.ui.onmessage({
    type: "IMPORT_PACKAGE",
    filename: "card.figcapture",
    bytes: packFigcapture(createValidPackage()),
    matchVariables: false
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(variablesQueried, 0, "must not query variables when matching is disabled");
  const success = resultMessage(posted);
  assert.equal(success.type, "IMPORT_SUCCESS");
  assert.equal(success.report.variableBindings.available, false);
});
