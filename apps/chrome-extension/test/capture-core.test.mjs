import assert from "node:assert/strict";
import test from "node:test";
import {
  captureElementTree,
  captureVisibleViewportFromDocument,
  createManifestFromCapture,
  isRectInViewport
} from "../dist/capture-core.js";

test("content capture filters elements outside the visible viewport", () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 1440, height: 1600 },
      styles: { display: "grid" },
      attributes: { role: "main" },
      children: [
        {
          tagName: "section",
          sourceNodeId: "dom-visible",
          textContent: "Visible revenue",
          rect: { x: 24, y: 40, width: 320, height: 120 },
          styles: { color: "rgb(17, 24, 39)" },
          attributes: { class: "card" },
          children: []
        },
        {
          tagName: "section",
          sourceNodeId: "dom-offscreen",
          textContent: "Offscreen content",
          rect: { x: 24, y: 1100, width: 320, height: 120 },
          styles: { color: "rgb(17, 24, 39)" },
          attributes: { class: "card" },
          children: []
        }
      ]
    },
    { width: 1440, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 200 },
    {
      sourceUrl: "https://app.example.com/dashboard",
      title: "Dashboard",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  assert.equal(capture.root.children.length, 1);
  assert.equal(capture.root.children[0].sourceNodeId, "dom-visible");
  assert.equal(capture.root.children[0].textContent, "Visible revenue");
});

test("visible viewport capture clamps long root and partially visible rectangles", () => {
  const capture = captureElementTree(
    {
      tagName: "body",
      rect: { x: 0, y: 0, width: 1440, height: 3200 },
      styles: { display: "block" },
      attributes: {},
      children: [
        {
          tagName: "section",
          sourceNodeId: "dom-partial",
          rect: { x: 100, y: 800, width: 300, height: 400 },
          styles: {},
          attributes: {},
          children: []
        },
        {
          tagName: "section",
          sourceNodeId: "dom-offscreen",
          rect: { x: 100, y: 1200, width: 300, height: 120 },
          styles: {},
          attributes: {},
          children: []
        }
      ]
    },
    { width: 1440, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/long",
      title: "Long page",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  assert.deepEqual(capture.root.rect, { x: 0, y: 0, width: 1440, height: 900 });
  assert.equal(capture.root.children.length, 1);
  assert.deepEqual(capture.root.children[0].rect, { x: 100, y: 800, width: 300, height: 100 });
});

test("visible viewport clipping can be disabled for future full-page capture paths", () => {
  const capture = captureElementTree(
    {
      tagName: "body",
      rect: { x: 0, y: 0, width: 1440, height: 3200 },
      styles: {},
      attributes: {},
      children: []
    },
    { width: 1440, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/full",
      title: "Full page",
      captureTimestamp: "2026-06-08T08:00:00.000Z",
      clipToViewport: false
    }
  );

  assert.deepEqual(capture.root.rect, { x: 0, y: 0, width: 1440, height: 3200 });
});

test("content capture preserves viewport metadata for future import stages", () => {
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 390, height: 844 },
      styles: { display: "block" },
      attributes: {},
      children: []
    },
    { width: 390, height: 844, devicePixelRatio: 3, scrollX: 0, scrollY: 64 },
    {
      sourceUrl: "https://app.example.com/mobile",
      title: "Mobile dashboard",
      captureTimestamp: "2026-06-08T09:00:00.000Z",
      deviceLabel: "mobile"
    }
  );
  const manifest = createManifestFromCapture(capture, { deviceLabel: "mobile" });

  assert.equal(manifest.viewportWidth, 390);
  assert.equal(manifest.viewportHeight, 844);
  assert.equal(manifest.devicePixelRatio, 3);
  assert.equal(manifest.scrollY, 64);
  assert.equal(manifest.sourceUrl, "https://app.example.com/mobile");
  assert.equal(manifest.captureTimestamp, "2026-06-08T09:00:00.000Z");
  assert.equal(manifest.deviceLabel, "mobile");
});

test("content capture normalizes direct text by css white-space semantics", () => {
  const rawIndentedText = "\n          成交量\n          44,279 張\n        ";
  const rawPreText = " A\n  B ";
  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 400, height: 300 },
      styles: { display: "block" },
      attributes: {},
      children: [
        textElement("normal", rawIndentedText, { whiteSpace: "normal" }),
        textElement("nowrap", rawIndentedText, { whiteSpace: "nowrap" }),
        textElement("missing", rawIndentedText, {}),
        textElement("unknown", rawIndentedText, { whiteSpace: "balance" }),
        textElement("pre", rawPreText, { whiteSpace: "pre" }),
        textElement("pre-wrap", rawPreText, { whiteSpace: "pre-wrap" }),
        textElement("break-spaces", rawPreText, { whiteSpace: "break-spaces" }),
        textElement("pre-line", "\n          第一行\n          第二行\n        ", { whiteSpace: "pre-line" })
      ]
    },
    { width: 400, height: 300, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/whitespace",
      title: "Whitespace",
      captureTimestamp: "2026-06-08T09:00:00.000Z"
    }
  );

  const children = capture.root.children;
  assert.equal(children[0].textContent, "成交量 44,279 張");
  assert.equal(children[1].textContent, "成交量 44,279 張");
  assert.equal(children[2].textContent, "成交量 44,279 張");
  assert.equal(children[3].textContent, "成交量 44,279 張");
  assert.equal(children[4].textContent, rawPreText);
  assert.equal(children[5].textContent, rawPreText);
  assert.equal(children[6].textContent, rawPreText);
  assert.equal(children[7].textContent, "第一行\n第二行");
});

test("document capture records computed whiteSpace and collapses browser-normal text", () => {
  function createElement(tagName, options = {}) {
    return {
      tagName,
      attributes: [],
      childNodes: options.childNodes ?? [],
      children: options.children ?? [],
      getBoundingClientRect() {
        return options.rect;
      }
    };
  }

  const volumeRow = createElement("div", {
    rect: { x: 10, y: 10, width: 200, height: 24 },
    childNodes: [{
      nodeType: 3,
      textContent: "\n          成交量\n          44,279 張\n        "
    }]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 400, height: 300 },
    children: [volumeRow]
  });
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Whitespace",
    location: { href: "https://app.example.com/whitespace" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/whitespace" },
    getComputedStyle(element) {
      return element === volumeRow
        ? { display: "block", whiteSpace: "normal" }
        : { display: "block", whiteSpace: "normal" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  assert.equal(capture.root.children[0].styles.whiteSpace, "normal");
  assert.equal(capture.root.children[0].textContent, "成交量 44,279 張");
});

test("document capture records computed padding styles", () => {
  const panel = {
    tagName: "DIV",
    attributes: [{ name: "class", value: "chartContainerTrend page__aside" }],
    childNodes: [],
    children: [],
    getBoundingClientRect() {
      return { x: 24, y: 24, width: 300, height: 240 };
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [panel],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 400, height: 320 };
    }
  };
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Padding",
    location: { href: "https://app.example.com/padding" }
  }, {
    innerWidth: 400,
    innerHeight: 320,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/padding" },
    getComputedStyle(element) {
      if (element === panel) {
        return {
          display: "flex",
          paddingTop: "16px",
          paddingRight: "16px",
          paddingBottom: "16px",
          paddingLeft: "16px"
        };
      }
      return { display: "block" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  assert.equal(capture.root.children[0].styles.paddingTop, "16px");
  assert.equal(capture.root.children[0].styles.paddingRight, "16px");
  assert.equal(capture.root.children[0].styles.paddingBottom, "16px");
  assert.equal(capture.root.children[0].styles.paddingLeft, "16px");
});

test("document capture records visible pseudo-element decoration boxes", () => {
  function createElement(tagName, options = {}) {
    return {
      tagName,
      attributes: options.attributes ?? [],
      childNodes: options.childNodes ?? [],
      children: options.children ?? [],
      getBoundingClientRect() {
        return options.rect;
      }
    };
  }

  const activeTab = createElement("div", {
    rect: { x: 100, y: 20, width: 64, height: 60 },
    attributes: [{ name: "class", value: "nav__cate nav__item--active" }]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 400, height: 300 },
    children: [activeTab]
  });
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Pseudo",
    location: { href: "https://app.example.com/pseudo" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/pseudo" },
    getComputedStyle(element, pseudoElement) {
      if (element === activeTab && pseudoElement === "::after") {
        return {
          content: "\"\"",
          display: "block",
          position: "absolute",
          left: "16px",
          bottom: "0px",
          width: "32px",
          height: "2px",
          backgroundColor: "rgb(194, 41, 46)",
          opacity: "1"
        };
      }
      return { display: "block", backgroundColor: "rgba(0, 0, 0, 0)" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  const pseudo = capture.root.children[0].children[0];
  assert.equal(pseudo.tagName, "::after");
  assert.equal(pseudo.nodeType, "pseudo");
  assert.equal(pseudo.attributes["data-pseudo"], "::after");
  assert.deepEqual(pseudo.rect, { x: 116, y: 78, width: 32, height: 2 });
  assert.equal(pseudo.styles.backgroundColor, "rgb(194, 41, 46)");
});

test("absolute pseudo-element rect uses nearest positioned containing block", () => {
  function createElement(tagName, options = {}) {
    return {
      tagName,
      attributes: options.attributes ?? [],
      childNodes: options.childNodes ?? [],
      children: options.children ?? [],
      getBoundingClientRect() {
        return options.rect;
      }
    };
  }

  const activeLabel = createElement("div", {
    rect: { x: 116, y: 38, width: 32, height: 24 },
    attributes: [{ name: "class", value: "nav__cate nav__item--active" }]
  });
  const positionedTab = createElement("li", {
    rect: { x: 100, y: 20, width: 64, height: 60 },
    attributes: [{ name: "class", value: "nav__item" }],
    children: [activeLabel]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 400, height: 300 },
    children: [positionedTab]
  });
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Pseudo containing block",
    location: { href: "https://app.example.com/pseudo-containing-block" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/pseudo-containing-block" },
    getComputedStyle(element, pseudoElement) {
      if (element === activeLabel && pseudoElement === "::after") {
        return {
          content: "\"\"",
          display: "block",
          position: "absolute",
          left: "0px",
          top: "57px",
          width: "64px",
          height: "3px",
          backgroundColor: "rgb(194, 41, 46)",
          opacity: "1"
        };
      }
      if (element === positionedTab) {
        return { display: "block", position: "relative", backgroundColor: "rgba(0, 0, 0, 0)" };
      }
      if (element === activeLabel) {
        return { display: "block", position: "static", backgroundColor: "rgba(0, 0, 0, 0)" };
      }
      return { display: "block", backgroundColor: "rgba(0, 0, 0, 0)" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  const pseudo = capture.root.children[0].children[0].children[0];
  assert.equal(pseudo.tagName, "::after");
  assert.deepEqual(pseudo.rect, { x: 100, y: 77, width: 64, height: 3 });
});

test("content capture records visual asset sources from DOM and computed styles", () => {
  function createElement(tagName, options = {}) {
    return {
      tagName,
      currentSrc: options.currentSrc ?? "",
      outerHTML: options.outerHTML ?? "",
      attributes: options.attributes ?? [],
      childNodes: [],
      children: options.children ?? [],
      getBoundingClientRect() {
        return options.rect;
      }
    };
  }

  const image = createElement("IMG", {
    currentSrc: "https://cdn.example.com/current-chart.png",
    rect: { x: 10, y: 10, width: 100, height: 80 },
    attributes: [{ name: "src", value: "https://cdn.example.com/fallback-chart.png" }]
  });
  const svg = createElement("svg", {
    outerHTML: "<svg viewBox=\"0 0 12 12\"><path d=\"M4 2l4 4-4 4\"/></svg>",
    rect: { x: 130, y: 10, width: 12, height: 12 },
    attributes: [{ name: "role", value: "img" }]
  });
  const icon = createElement("span", {
    rect: { x: 160, y: 10, width: 12, height: 12 },
    attributes: [{ name: "class", value: "icon" }]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 400, height: 300 },
    children: [image, svg, icon]
  });
  const styles = new Map([
    [body, { display: "block" }],
    [image, { display: "block", objectFit: "cover" }],
    [svg, { display: "block" }],
    [icon, {
      display: "block",
      backgroundImage: "none",
      maskImage: "url(data:image/svg+xml,%3Csvg%2F%3E)",
      webkitMaskImage: "url(data:image/svg+xml,%3Csvg%2F%3E)"
    }]
  ]);
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Visual assets",
    location: { href: "https://app.example.com/assets" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/assets" },
    getComputedStyle(element) {
      return styles.get(element) ?? {};
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  assert.equal(capture.root.children[0].attributes.currentSrc, "https://cdn.example.com/current-chart.png");
  assert.match(capture.root.children[1].attributes.svgMarkup, /<path/);
  assert.equal(capture.root.children[2].styles.maskImage, "url(data:image/svg+xml,%3Csvg%2F%3E)");
  assert.equal(capture.root.children[2].styles.webkitMaskImage, "url(data:image/svg+xml,%3Csvg%2F%3E)");
});

function textElement(sourceNodeId, textContent, styles) {
  return {
    tagName: "div",
    sourceNodeId,
    textContent,
    rect: { x: 10, y: 10, width: 200, height: 24 },
    styles: { display: "block", ...styles },
    attributes: {},
    children: []
  };
}

test("content capture records serialized canvas data URL when available", () => {
  const canvas = {
    tagName: "CANVAS",
    attributes: [],
    childNodes: [],
    children: [],
    getBoundingClientRect() {
      return { x: 10, y: 10, width: 120, height: 80 };
    },
    toDataURL(type) {
      assert.equal(type, "image/png");
      return "data:image/png;base64,iVBORw0KGgo=";
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [canvas],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 400, height: 300 };
    }
  };
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Canvas",
    location: { href: "https://app.example.com/canvas" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/canvas" },
    getComputedStyle() {
      return { display: "block" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  assert.equal(capture.root.children[0].attributes.canvasDataUrl, "data:image/png;base64,iVBORw0KGgo=");
});

test("visible viewport intersection excludes zero-size and below-fold rectangles", () => {
  const viewport = { width: 1440, height: 900 };

  assert.equal(isRectInViewport({ x: 10, y: 10, width: 10, height: 10 }, viewport), true);
  assert.equal(isRectInViewport({ x: 10, y: 950, width: 10, height: 10 }, viewport), false);
  assert.equal(isRectInViewport({ x: 10, y: 10, width: 0, height: 10 }, viewport), false);
});

test("content runtime declares visible viewport metadata fields", async () => {
  const runtime = (await import("../dist/content.js")).describeContentRuntime();

  assert.equal(runtime.captureScope, "visible-viewport");
  assert.deepEqual(runtime.metadataFields, [
    "viewportWidth",
    "viewportHeight",
    "devicePixelRatio",
    "scrollX",
    "scrollY",
    "sourceUrl",
    "captureTimestamp"
  ]);
});
