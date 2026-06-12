import assert from "node:assert/strict";
import test from "node:test";
import {
  annotateRepeatedSiblingGroups,
  createSemanticNameMap,
  semanticNameForNode
} from "../dist/semantic-naming.js";

function node(sourceNodeId, tagName, rect, options = {}) {
  return {
    id: sourceNodeId,
    sourceNodeId,
    nodeType: options.nodeType ?? "element",
    tagName,
    textContent: options.textContent ?? "",
    rect,
    styles: options.styles ?? {},
    attributes: options.attributes ?? {},
    children: options.children ?? []
  };
}

const viewport = { width: 1440, height: 900 };

test("semantic tags map to readable names", () => {
  assert.equal(semanticNameForNode(node("n1", "header", { x: 0, y: 0, width: 1440, height: 64 })), "Header");
  assert.equal(semanticNameForNode(node("n2", "nav", { x: 0, y: 0, width: 600, height: 40 })), "Navigation");
  assert.equal(semanticNameForNode(node("n3", "footer", { x: 0, y: 836, width: 1440, height: 64 })), "Footer");
  assert.equal(semanticNameForNode(node("n4", "ul", { x: 0, y: 0, width: 200, height: 300 })), "List");
  assert.equal(semanticNameForNode(node("n5", "li", { x: 0, y: 0, width: 200, height: 40 })), "List Item");
  assert.equal(semanticNameForNode(node("n6", "aside", { x: 0, y: 0, width: 240, height: 800 })), "Sidebar");
});

test("plain div without semantics returns null", () => {
  assert.equal(semanticNameForNode(node("n1", "div", { x: 10, y: 100, width: 200, height: 50 }), { viewport }), null);
});

test("aria roles map when tag is non-semantic", () => {
  assert.equal(
    semanticNameForNode(node("n1", "div", { x: 0, y: 0, width: 1440, height: 64 }, { attributes: { role: "banner" } })),
    "Header"
  );
  assert.equal(
    semanticNameForNode(node("n2", "div", { x: 0, y: 0, width: 400, height: 300 }, { attributes: { role: "dialog" } })),
    "Modal"
  );
  assert.equal(
    semanticNameForNode(node("n3", "div", { x: 0, y: 836, width: 1440, height: 64 }, { attributes: { role: "contentinfo" } })),
    "Footer"
  );
});

test("unknown aria role falls through to null", () => {
  assert.equal(
    semanticNameForNode(node("n1", "div", { x: 10, y: 100, width: 100, height: 30 }, { attributes: { role: "doc-glossary" } })),
    null
  );
});

test("interactive layers append aria-label or single-line text suffix", () => {
  assert.equal(
    semanticNameForNode(node("n1", "button", { x: 0, y: 0, width: 80, height: 32 }, { attributes: { "aria-label": "登入" } })),
    "Button / 登入"
  );
  const buttonWithSpan = node("n2", "button", { x: 0, y: 0, width: 80, height: 32 }, {
    children: [node("n2.1", "span", { x: 8, y: 8, width: 64, height: 16 }, { textContent: "登入" })]
  });
  assert.equal(semanticNameForNode(buttonWithSpan), "Button / 登入");
});

test("multiline text does not become a suffix", () => {
  const button = node("n1", "button", { x: 0, y: 0, width: 80, height: 60 }, { textContent: "第一行\n第二行" });
  assert.equal(semanticNameForNode(button), "Button");
});

test("label suffix is truncated to 32 characters", () => {
  const longLabel = "x".repeat(64);
  const name = semanticNameForNode(node("n1", "a", { x: 0, y: 0, width: 300, height: 20 }, { textContent: longLabel }));
  assert.equal(name, `Link / ${"x".repeat(32)}`);
});

test("geometric header heuristic names top full-width container", () => {
  const child = node("n1.1", "div", { x: 0, y: 10, width: 200, height: 40 }, { textContent: "Logo" });
  const header = node("n1", "div", { x: 0, y: 0, width: 1440, height: 72 }, { children: [child] });
  assert.equal(semanticNameForNode(header, { viewport }), "Header");
});

test("geometric footer heuristic names bottom full-width container", () => {
  const child = node("n1.1", "div", { x: 0, y: 850, width: 200, height: 30 }, { textContent: "© 2026" });
  const footer = node("n1", "div", { x: 0, y: 840, width: 1440, height: 60 }, { children: [child] });
  assert.equal(semanticNameForNode(footer, { viewport }), "Footer");
});

test("narrow or tall containers do not match header heuristic", () => {
  const child = node("n1.1", "div", { x: 0, y: 10, width: 100, height: 40 });
  const narrow = node("n1", "div", { x: 0, y: 0, width: 600, height: 72 }, { children: [child] });
  assert.equal(semanticNameForNode(narrow, { viewport }), null);
  const tall = node("n2", "div", { x: 0, y: 0, width: 1440, height: 600 }, { children: [child] });
  assert.equal(semanticNameForNode(tall, { viewport }), null);
});

test("card heuristic requires visible box and two renderable children", () => {
  const cardStyles = {
    backgroundColor: "rgb(255, 255, 255)",
    borderTopLeftRadius: "8px",
    borderTopRightRadius: "8px",
    borderBottomRightRadius: "8px",
    borderBottomLeftRadius: "8px"
  };
  const children = [
    node("n1.1", "div", { x: 16, y: 16, width: 200, height: 120 }, { attributes: {}, children: [node("n1.1.1", "img", { x: 16, y: 16, width: 200, height: 120 })] }),
    node("n1.2", "div", { x: 16, y: 144, width: 200, height: 20 }, { textContent: "標題" })
  ];
  const card = node("n1", "div", { x: 100, y: 200, width: 232, height: 180 }, { styles: cardStyles, children });
  assert.equal(semanticNameForNode(card, { viewport }), "Card");

  const oneChildCard = node("n2", "div", { x: 100, y: 200, width: 232, height: 180 }, { styles: cardStyles, children: [children[0]] });
  assert.equal(semanticNameForNode(oneChildCard, { viewport }), null);
});

test("class tokens match whole tokens only", () => {
  assert.equal(
    semanticNameForNode(node("n1", "div", { x: 0, y: 0, width: 200, height: 100 }, { attributes: { class: "product-card" } })),
    "Card"
  );
  assert.equal(
    semanticNameForNode(node("n2", "div", { x: 0, y: 0, width: 200, height: 100 }, { attributes: { class: "scarden" } })),
    null
  );
  assert.equal(
    semanticNameForNode(node("n3", "div", { x: 0, y: 0, width: 80, height: 32 }, { attributes: { class: "primaryButton" }, textContent: "送出" })),
    "Button / 送出"
  );
});

test("semantic tag wins over class token", () => {
  const navWithCardClass = node("n1", "nav", { x: 0, y: 0, width: 600, height: 40 }, { attributes: { class: "card" } });
  assert.equal(semanticNameForNode(navWithCardClass), "Navigation");
});

test("repeated siblings with same signature are numbered in visual order", () => {
  const card = (id, x) => node(id, "div", { x, y: 100, width: 200, height: 180 }, {
    attributes: { class: "card" },
    children: [
      node(`${id}.1`, "img", { x, y: 100, width: 200, height: 120 }),
      node(`${id}.2`, "p", { x, y: 230, width: 200, height: 40 }, { textContent: "說明" })
    ]
  });
  const shuffled = [card("c2", 240), card("c1", 20), card("c3", 460)];
  const overrides = annotateRepeatedSiblingGroups(shuffled);
  assert.equal(overrides.get("c1"), "Card 1");
  assert.equal(overrides.get("c2"), "Card 2");
  assert.equal(overrides.get("c3"), "Card 3");
});

test("structurally different siblings are not grouped", () => {
  const a = node("a", "div", { x: 0, y: 0, width: 200, height: 100 }, {
    attributes: { class: "card" },
    children: [node("a.1", "img", { x: 0, y: 0, width: 200, height: 60 })]
  });
  const b = node("b", "div", { x: 220, y: 0, width: 200, height: 100 }, {
    attributes: { class: "card" },
    children: [node("b.1", "p", { x: 220, y: 0, width: 200, height: 20 }, { textContent: "文" })]
  });
  const overrides = annotateRepeatedSiblingGroups([a, b]);
  assert.equal(overrides.size, 0);
});

test("single member groups and unnamed groups receive no index", () => {
  const lone = node("a", "div", { x: 0, y: 0, width: 200, height: 100 }, { attributes: { class: "card" } });
  assert.equal(annotateRepeatedSiblingGroups([lone]).size, 0);

  const plain = (id, x) => node(id, "div", { x, y: 0, width: 100, height: 100 });
  assert.equal(annotateRepeatedSiblingGroups([plain("p1", 0), plain("p2", 120)]).size, 0);
});

test("createSemanticNameMap names tree nodes and counts repeated groups", () => {
  const card = (id, x) => node(id, "div", { x, y: 200, width: 200, height: 180 }, {
    attributes: { class: "card" },
    children: [node(`${id}.1`, "p", { x, y: 210, width: 180, height: 20 }, { textContent: "內容" })]
  });
  const root = node("root", "body", { x: 0, y: 0, width: 1440, height: 900 }, {
    children: [
      node("hdr", "header", { x: 0, y: 0, width: 1440, height: 64 }, {
        children: [node("hdr.1", "nav", { x: 0, y: 0, width: 600, height: 64 })]
      }),
      card("c1", 20),
      card("c2", 240)
    ]
  });
  const result = createSemanticNameMap(root, viewport);
  assert.equal(result.names.get("hdr"), "Header");
  assert.equal(result.names.get("hdr.1"), "Navigation");
  assert.equal(result.names.get("c1"), "Card 1");
  assert.equal(result.names.get("c2"), "Card 2");
  assert.equal(result.repeatedGroupCount, 1);
});

test("derivation failure returns null instead of throwing", () => {
  const broken = {
    sourceNodeId: "x",
    nodeType: "element",
    get tagName() {
      throw new Error("boom");
    }
  };
  assert.equal(semanticNameForNode(broken), null);
  const map = createSemanticNameMap(broken, viewport);
  assert.equal(map.names.size, 0);
});
