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

test("capture preserves overflow and max-size styles for clipped read-more text", () => {
  const capture = captureElementTree(
    {
      tagName: "div",
      sourceNodeId: "dom-readmore-text",
      rect: { x: 24, y: 40, width: 540, height: 81 },
      styles: {
        display: "block",
        overflow: "hidden",
        overflowX: "hidden",
        overflowY: "hidden",
        maxHeight: "81px",
        maxWidth: "540px",
        textOverflow: "clip",
        lineHeight: "27px"
      },
      attributes: { class: "textRule__text textRule__text--limited" },
      children: [
        {
          tagName: "div",
          sourceNodeId: "dom-readmore-line-1",
          textContent: "全球最會賺航海王！專訪長榮海運董總",
          rect: { x: 24, y: 40, width: 540, height: 27 },
          styles: { lineHeight: "27px" },
          attributes: { class: "textRule__line" },
          children: []
        }
      ]
    },
    { width: 800, height: 600, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/readmore",
      title: "Read more",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  assert.equal(capture.root.styles.overflow, "hidden");
  assert.equal(capture.root.styles.overflowY, "hidden");
  assert.equal(capture.root.styles.maxHeight, "81px");
  assert.equal(capture.root.styles.maxWidth, "540px");
  assert.equal(capture.root.styles.textOverflow, "clip");
});

test("document capture reads computed overflow axes and max-size styles", () => {
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

  const readMoreText = createElement("div", {
    rect: { x: 24, y: 40, width: 540, height: 81 },
    attributes: [{ name: "class", value: "textRule__text textRule__text--limited" }],
    children: [
      createElement("div", {
        rect: { x: 24, y: 40, width: 540, height: 27 },
        attributes: [{ name: "class", value: "textRule__line" }],
        childNodes: [{ nodeType: 3, textContent: "全球最會賺航海王！專訪長榮海運董總" }]
      })
    ]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 800, height: 600 },
    children: [readMoreText]
  });

  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Read more",
    location: { href: "https://app.example.com/readmore" }
  }, {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/readmore" },
    getComputedStyle(element) {
      const className = element.attributes?.find((attribute) => attribute.name === "class")?.value ?? "";
      return {
        display: "block",
        position: "static",
        overflow: className.includes("textRule__text") ? "hidden" : "visible",
        overflowX: className.includes("textRule__text") ? "hidden" : "visible",
        overflowY: className.includes("textRule__text") ? "hidden" : "visible",
        maxHeight: className.includes("textRule__text") ? "81px" : "none",
        maxWidth: className.includes("textRule__text") ? "540px" : "none",
        textOverflow: className.includes("textRule__text") ? "clip" : "clip",
        lineHeight: className.includes("textRule__line") ? "27px" : "normal",
        visibility: "visible",
        opacity: "1",
        backgroundColor: "rgba(0, 0, 0, 0)",
        color: "rgb(54, 54, 54)"
      };
    }
  });
  const limitedText = capture.root.children[0];

  assert.equal(limitedText.styles.overflowY, "hidden");
  assert.equal(limitedText.styles.maxHeight, "81px");
  assert.equal(limitedText.styles.maxWidth, "540px");
  assert.equal(limitedText.styles.textOverflow, "clip");
});

test("document capture preserves input placeholder metadata without storing input values", () => {
  function createElement(tagName, options = {}) {
    const attributes = options.attributes ?? [];
    return {
      tagName,
      attributes,
      value: options.value ?? "",
      childNodes: options.childNodes ?? [],
      children: options.children ?? [],
      getAttribute(name) {
        return attributes.find((attribute) => attribute.name === name)?.value ?? null;
      },
      getBoundingClientRect() {
        return options.rect;
      }
    };
  }

  const searchInput = createElement("input", {
    rect: { x: 808, y: 42, width: 450, height: 32 },
    value: "",
    attributes: [
      { name: "id", value: "SearchbarSearchInput" },
      { name: "class", value: "searchbar__input" },
      { name: "placeholder", value: "搜尋股票/ETF代碼、名稱或人名" },
      { name: "value", value: "should-not-be-captured" }
    ]
  });
  const filledInput = createElement("input", {
    rect: { x: 808, y: 82, width: 450, height: 32 },
    value: "2330",
    attributes: [
      { name: "placeholder", value: "搜尋股票/ETF代碼、名稱或人名" }
    ]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 1440, height: 120 },
    children: [searchInput, filledInput]
  });

  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Search",
    location: { href: "https://app.example.com/search" }
  }, {
    innerWidth: 1440,
    innerHeight: 120,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/search" },
    getComputedStyle(_element, pseudoName) {
      if (pseudoName === "::placeholder") {
        return {
          display: "inline",
          visibility: "visible",
          opacity: "1",
          color: "rgb(143, 143, 143)",
          content: "normal"
        };
      }
      return {
        display: "block",
        position: "static",
        width: "450px",
        height: "32px",
        paddingLeft: "36px",
        paddingRight: "8px",
        fontSize: "14px",
        lineHeight: "21px",
        overflow: "clip",
        overflowX: "clip",
        overflowY: "clip",
        textOverflow: "clip",
        visibility: "visible",
        opacity: "1",
        backgroundColor: "rgb(247, 247, 247)",
        color: "rgb(0, 0, 0)"
      };
    }
  });

  const empty = capture.root.children[0];
  const filled = capture.root.children[1];

  assert.equal(empty.attributes.placeholder, "搜尋股票/ETF代碼、名稱或人名");
  assert.equal(empty.attributes.value, undefined);
  assert.equal(empty.attributes["data-has-value"], undefined);
  assert.equal(empty.styles.placeholderColor, "rgb(143, 143, 143)");
  assert.equal(filled.attributes.placeholder, "搜尋股票/ETF代碼、名稱或人名");
  assert.equal(filled.attributes.value, undefined);
  assert.equal(filled.attributes["data-has-value"], "true");
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
          paddingLeft: "16px",
          marginLeft: "auto",
          marginRight: "0px"
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
  assert.equal(capture.root.children[0].styles.marginLeft, "auto");
  assert.equal(capture.root.children[0].styles.marginRight, "0px");
});

test("document capture records computed vertical-align for table-cell text import", () => {
  const cell = {
    nodeType: 1,
    tagName: "td",
    attributes: [],
    childNodes: [{ nodeType: 3, textContent: "100.25" }],
    children: [],
    getBoundingClientRect() {
      return { x: 24, y: 40, width: 120, height: 64 };
    }
  };
  const body = {
    nodeType: 1,
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [cell],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 400, height: 320 };
    }
  };
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Table",
    location: { href: "https://app.example.com/table" }
  }, {
    innerWidth: 400,
    innerHeight: 320,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/table" },
    getComputedStyle(element) {
      if (element === cell) {
        return {
          display: "table-cell",
          verticalAlign: "middle",
          textAlign: "right",
          whiteSpace: "normal"
        };
      }
      return { display: "block", whiteSpace: "normal" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  assert.equal(capture.root.children[0].styles.verticalAlign, "middle");
  assert.equal(capture.root.children[0].styles.textAlign, "right");
  assert.equal(capture.root.children[0].textContent, "100.25");
});

test("document capture records computed z-index for stacking diagnostics", () => {
  const overlay = {
    tagName: "div",
    attributes: [{ name: "class", value: "toast" }],
    childNodes: [],
    children: [],
    getBoundingClientRect() {
      return { x: 24, y: 24, width: 200, height: 80 };
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [overlay],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 400, height: 320 };
    }
  };
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Stack",
    location: { href: "https://app.example.com/stack" }
  }, {
    innerWidth: 400,
    innerHeight: 320,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/stack" },
    getComputedStyle(element) {
      if (element === overlay) {
        return {
          display: "block",
          position: "fixed",
          zIndex: "1200",
          backgroundColor: "rgb(255, 255, 255)"
        };
      }
      return { display: "block", zIndex: "auto" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  assert.equal(capture.root.children[0].styles.position, "fixed");
  assert.equal(capture.root.children[0].styles.zIndex, "1200");
});

test("document capture records computed font stack and style", () => {
  const label = {
    tagName: "span",
    attributes: [],
    childNodes: [{ nodeType: 3, textContent: "Title" }],
    children: [],
    getBoundingClientRect() {
      return { x: 24, y: 24, width: 80, height: 24 };
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [label],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 400, height: 320 };
    }
  };
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Font",
    location: { href: "https://app.example.com/font" }
  }, {
    innerWidth: 400,
    innerHeight: 320,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/font" },
    getComputedStyle(element) {
      if (element === label) {
        return {
          display: "inline",
          fontFamily: "\"Missing Webfont\", \"Available Sans\", sans-serif",
          fontStyle: "italic",
          fontWeight: "700",
          fontSize: "16px",
          whiteSpace: "normal"
        };
      }
      return { display: "block", fontFamily: "system-ui", fontStyle: "normal", whiteSpace: "normal" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  const capturedLabel = capture.root.children[0];
  assert.equal(capturedLabel.styles.fontFamily, "\"Missing Webfont\", \"Available Sans\", sans-serif");
  assert.equal(capturedLabel.styles.fontStyle, "italic");
  assert.equal(capturedLabel.styles.fontWeight, "700");
});

test("document capture records clipped background gradient text styles", () => {
  const rank = {
    tagName: "span",
    attributes: [],
    childNodes: [{ nodeType: 3, textContent: "1" }],
    children: [],
    getBoundingClientRect() {
      return { x: 48, y: 18, width: 40, height: 33 };
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [rank],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 320, height: 80 };
    }
  };
  const gradient = "linear-gradient(to right, rgb(222, 190, 135), rgb(192, 139, 78))";
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Rank",
    location: { href: "https://app.example.com/rank" }
  }, {
    innerWidth: 320,
    innerHeight: 80,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/rank" },
    getComputedStyle(element) {
      if (element === rank) {
        return {
          display: "inline",
          position: "static",
          whiteSpace: "normal",
          fontFamily: "Inter",
          fontSize: "28px",
          fontWeight: "700",
          lineHeight: "33px",
          color: "rgb(149, 149, 149)",
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: gradient,
          backgroundClip: "text",
          webkitBackgroundClip: "text",
          webkitTextFillColor: "rgba(0, 0, 0, 0)"
        };
      }
      return {
        display: "block",
        position: "static",
        whiteSpace: "normal",
        backgroundColor: "rgba(0, 0, 0, 0)"
      };
    }
  }, {
    captureTimestamp: "2026-06-11T02:45:59.000Z"
  });

  const capturedRank = capture.root.children[0];
  assert.equal(capturedRank.textContent, "1");
  assert.equal(capturedRank.styles.backgroundImage, gradient);
  assert.equal(capturedRank.styles.backgroundClip, "text");
  assert.equal(capturedRank.styles.webkitBackgroundClip, "text");
  assert.equal(capturedRank.styles.webkitTextFillColor, "rgba(0, 0, 0, 0)");
});

test("document capture records transform styles for rotated visual assets", () => {
  const arrow = {
    tagName: "IMG",
    attributes: [
      { name: "class", value: "carousel-arrow carousel-arrow--next" },
      { name: "alt", value: "Next" },
      { name: "src", value: "data:image/svg+xml,%3Csvg%2F%3E" }
    ],
    currentSrc: "data:image/svg+xml,%3Csvg%2F%3E",
    childNodes: [],
    children: [],
    getBoundingClientRect() {
      return { x: 24, y: 24, width: 16, height: 16 };
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [arrow],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 400, height: 300 };
    }
  };
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Transform",
    location: { href: "https://app.example.com/transform" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/transform" },
    getComputedStyle(element) {
      if (element === arrow) {
        return {
          display: "block",
          width: "16px",
          height: "16px",
          objectFit: "fill",
          transform: "matrix(-1, 0, 0, -1, 0, 0)",
          transformOrigin: "8px 8px",
          backgroundColor: "rgba(0, 0, 0, 0)"
        };
      }
      return { display: "block", backgroundColor: "rgba(0, 0, 0, 0)" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  const capturedArrow = capture.root.children[0];
  assert.equal(capturedArrow.styles.transform, "matrix(-1, 0, 0, -1, 0, 0)");
  assert.equal(capturedArrow.styles.transformOrigin, "8px 8px");
});

test("document capture records button border and outline styles", () => {
  const button = {
    tagName: "button",
    attributes: [{ name: "class", value: "secondary" }],
    childNodes: [],
    children: [],
    getBoundingClientRect() {
      return { x: 32, y: 48, width: 120, height: 36 };
    }
  };
  const body = {
    tagName: "body",
    attributes: [],
    childNodes: [],
    children: [button],
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 400, height: 300 };
    }
  };
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Button",
    location: { href: "https://app.example.com/button" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/button" },
    getComputedStyle(element) {
      if (element === button) {
        return {
          display: "inline-flex",
          backgroundColor: "rgba(0, 0, 0, 0)",
          borderTopWidth: "1px",
          borderTopStyle: "solid",
          borderTopColor: "rgb(194, 41, 46)",
          borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: "rgb(194, 41, 46)",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "rgb(194, 41, 46)",
          borderLeftWidth: "1px",
          borderLeftStyle: "solid",
          borderLeftColor: "rgb(194, 41, 46)",
          outlineWidth: "2px",
          outlineStyle: "solid",
          outlineColor: "rgb(31, 95, 191)",
          outlineOffset: "2px"
        };
      }
      return { display: "block", backgroundColor: "rgba(0, 0, 0, 0)" };
    }
  }, {
    captureTimestamp: "2026-06-08T09:00:00.000Z"
  });

  const capturedButton = capture.root.children[0];
  assert.equal(capturedButton.styles.borderTopStyle, "solid");
  assert.equal(capturedButton.styles.borderBottomColor, "rgb(194, 41, 46)");
  assert.equal(capturedButton.styles.outlineWidth, "2px");
  assert.equal(capturedButton.styles.outlineStyle, "solid");
  assert.equal(capturedButton.styles.outlineColor, "rgb(31, 95, 191)");
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

test("document capture records textual pseudo-elements and gradient masks", () => {
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

  const readMoreButton = createElement("button", {
    rect: { x: 320, y: 160, width: 96, height: 27 },
    childNodes: [{ nodeType: 3, textContent: "閱讀更多" }]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 600, height: 360 },
    children: [readMoreButton]
  });
  const gradient = "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))";
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Textual Pseudo",
    location: { href: "https://app.example.com/readmore" }
  }, {
    innerWidth: 600,
    innerHeight: 360,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/readmore" },
    getComputedStyle(element, pseudoElement) {
      if (element === readMoreButton && pseudoElement === "::before") {
        return {
          content: "\"...\"",
          display: "inline",
          position: "absolute",
          left: "0px",
          top: "0px",
          width: "auto",
          height: "auto",
          fontSize: "18px",
          lineHeight: "27px",
          color: "rgb(54, 54, 54)",
          backgroundImage: gradient,
          backgroundColor: "rgba(0, 0, 0, 0)",
          opacity: "1"
        };
      }
      return {
        display: "inline-flex",
        position: "relative",
        whiteSpace: "nowrap",
        fontSize: "18px",
        lineHeight: "27px",
        backgroundColor: "rgba(0, 0, 0, 0)"
      };
    }
  }, {
    captureTimestamp: "2026-06-10T10:00:00.000Z"
  });

  const pseudo = capture.root.children[0].children[0];
  assert.equal(capture.root.children[0].textContent, "閱讀更多");
  assert.equal(pseudo.tagName, "::before");
  assert.equal(pseudo.nodeType, "pseudo");
  assert.equal(pseudo.textContent, "...");
  assert.deepEqual(pseudo.rect, { x: 320, y: 160, width: 30.24, height: 27 });
  assert.equal(pseudo.styles.backgroundImage, gradient);
});

test("document capture treats pseudo content URLs as images instead of text", () => {
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

  const sortLabel = createElement("div", {
    rect: { x: 100, y: 40, width: 54, height: 29 },
    childNodes: [{ nodeType: 3, textContent: "最相關" }]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 400, height: 240 },
    children: [sortLabel]
  });
  const svgDataUrl = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI5IiB2aWV3Qm94PSIwIDAgOCA5Ii8+";
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Content Url",
    location: { href: "https://app.example.com/content-url" }
  }, {
    innerWidth: 400,
    innerHeight: 240,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/content-url" },
    getComputedStyle(element, pseudoElement) {
      if (element === sortLabel && pseudoElement === "::after") {
        return {
          content: `url("${svgDataUrl}")`,
          display: "block",
          position: "static",
          width: "8px",
          height: "21px",
          fontSize: "14px",
          lineHeight: "21px",
          backgroundColor: "rgba(0, 0, 0, 0)",
          opacity: "1"
        };
      }
      return {
        display: "flex",
        position: "static",
        whiteSpace: "nowrap",
        fontSize: "16px",
        lineHeight: "16px",
        backgroundColor: "rgba(0, 0, 0, 0)"
      };
    }
  }, {
    captureTimestamp: "2026-06-10T10:00:00.000Z"
  });

  const pseudo = capture.root.children[0].children[0];
  assert.equal(pseudo.tagName, "::after");
  assert.equal(pseudo.nodeType, "pseudo");
  assert.equal(pseudo.textContent, "");
  assert.deepEqual(pseudo.rect, { x: 100, y: 40, width: 8, height: 21 });
  assert.equal(pseudo.styles.content, `url("${svgDataUrl}")`);
});

test("document capture records inline pseudo-element css image icons", () => {
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

  const verifiedLabel = createElement("div", {
    rect: { x: 32, y: 40, width: 132, height: 28 },
    attributes: [
      { name: "class", value: "navbar__text line-clamp line-clamp-1" },
      { name: "hasverified", value: "true" }
    ],
    childNodes: [{ nodeType: 3, textContent: "創作者計畫" }]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 400, height: 300 },
    children: [verifiedLabel]
  });
  const svgDataUrl = "data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%2F%3E";
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Inline Pseudo Icon",
    location: { href: "https://app.example.com/inline-pseudo-icon" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/inline-pseudo-icon" },
    getComputedStyle(element, pseudoElement) {
      if (element === verifiedLabel && pseudoElement === "::after") {
        return {
          content: "\"\"",
          display: "inline-block",
          position: "static",
          width: "16px",
          height: "16px",
          backgroundImage: `url("${svgDataUrl}")`,
          backgroundColor: "rgba(0, 0, 0, 0)",
          opacity: "1"
        };
      }
      if (element === verifiedLabel) {
        return {
          display: "block",
          position: "static",
          whiteSpace: "nowrap",
          backgroundColor: "rgba(0, 0, 0, 0)"
        };
      }
      return { display: "block", backgroundColor: "rgba(0, 0, 0, 0)" };
    }
  }, {
    captureTimestamp: "2026-06-10T10:00:00.000Z"
  });

  const pseudo = capture.root.children[0].children[0];
  assert.equal(capture.root.children[0].textContent, "創作者計畫");
  assert.equal(pseudo.tagName, "::after");
  assert.equal(pseudo.nodeType, "pseudo");
  assert.deepEqual(pseudo.rect, { x: 148, y: 46, width: 16, height: 16 });
  assert.equal(pseudo.styles.backgroundImage, `url("${svgDataUrl}")`);
});

test("document capture places no-offset absolute after pseudo icons on the trailing edge", () => {
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

  const label = createElement("div", {
    rect: { x: 80, y: 24, width: 120, height: 28 },
    childNodes: [{ nodeType: 3, textContent: "創作者計畫" }]
  });
  const body = createElement("body", {
    rect: { x: 0, y: 0, width: 400, height: 300 },
    children: [label]
  });
  const capture = captureVisibleViewportFromDocument({
    body,
    documentElement: body,
    title: "Absolute Pseudo Icon",
    location: { href: "https://app.example.com/absolute-pseudo-icon" }
  }, {
    innerWidth: 400,
    innerHeight: 300,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    location: { href: "https://app.example.com/absolute-pseudo-icon" },
    getComputedStyle(element, pseudoElement) {
      if (element === label && pseudoElement === "::after") {
        return {
          content: "\"\"",
          display: "block",
          position: "absolute",
          width: "16px",
          height: "16px",
          backgroundImage: "url(data:image/svg+xml,%3Csvg%2F%3E)",
          backgroundColor: "rgba(0, 0, 0, 0)",
          opacity: "1"
        };
      }
      return { display: "block", backgroundColor: "rgba(0, 0, 0, 0)" };
    }
  }, {
    captureTimestamp: "2026-06-10T10:00:00.000Z"
  });

  const pseudo = capture.root.children[0].children[0];
  assert.equal(pseudo.tagName, "::after");
  assert.deepEqual(pseudo.rect, { x: 184, y: 30, width: 16, height: 16 });
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
