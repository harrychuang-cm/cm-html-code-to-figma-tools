import assert from "node:assert/strict";
import test from "node:test";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import {
  createAutoLayoutNodeModels,
  detectAutoLayoutCandidates
} from "../dist/auto-layout.js";
import {
  createMemoryFigmaAdapter,
  renderAutoLayoutExperimental,
  renderThreeFrames
} from "../dist/renderer.js";

function node(sourceNodeId, tagName, rect, options = {}) {
  return {
    id: sourceNodeId,
    sourceNodeId,
    nodeType: "element",
    tagName,
    rect,
    styles: options.styles ?? {},
    attributes: options.attributes ?? {},
    textContent: options.textContent ?? "",
    children: options.children ?? []
  };
}

function packageWithChildren(children) {
  const base = createValidPackage();
  return {
    ...base,
    capture: {
      ...base.capture,
      root: {
        ...base.capture.root,
        children
      }
    }
  };
}

test("eligible horizontal button group receives auto layout with confidence", () => {
  const button = node("dom-button", "button", { x: 20, y: 20, width: 160, height: 40 }, {
    children: [
      node("dom-icon", "span", { x: 32, y: 30, width: 16, height: 16 }),
      node("dom-label", "span", { x: 56, y: 30, width: 64, height: 16 })
    ]
  });
  const capture = packageWithChildren([button]).capture;
  const candidates = detectAutoLayoutCandidates(capture);
  const candidate = candidates.find((item) => item.sourceNodeId === "dom-button");

  assert.equal(candidate.pattern, "button inner content");
  assert.equal(candidate.direction, "HORIZONTAL");
  assert.equal(candidate.applied, true);
  assert(candidate.confidence >= 0.9);
});

test("risky layouts are skipped with reasons", () => {
  const capture = packageWithChildren([
    node("dom-overlap", "div", { x: 0, y: 0, width: 200, height: 80 }, {
      attributes: { class: "toolbar" },
      children: [
        node("dom-a", "span", { x: 10, y: 10, width: 80, height: 20 }),
        node("dom-b", "span", { x: 40, y: 10, width: 80, height: 20 })
      ]
    }),
    node("dom-grid", "section", { x: 0, y: 100, width: 400, height: 200 }, {
      attributes: { class: "card-list" },
      styles: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr" },
      children: []
    }),
    node("dom-fixed", "div", { x: 0, y: 0, width: 400, height: 60 }, {
      attributes: { role: "toolbar" },
      styles: { position: "fixed" },
      children: []
    }),
    node("dom-virtualized", "div", { x: 0, y: 320, width: 400, height: 200 }, {
      attributes: { class: "virtualized-list", "data-virtualized": "true" },
      children: []
    })
  ]).capture;
  const candidates = detectAutoLayoutCandidates(capture);
  const reasons = new Map(candidates.map((item) => [item.sourceNodeId, item.skippedReason]));

  assert.equal(reasons.get("dom-overlap"), "overlapping layout");
  assert.equal(reasons.get("dom-grid"), "complex CSS grid");
  assert.equal(reasons.get("dom-fixed"), "fixed overlay");
  assert.equal(reasons.get("dom-virtualized"), "virtualized list");
});

test("auto layout candidates are detected but not emitted as a default frame", () => {
  const button = node("dom-button", "button", { x: 20, y: 20, width: 160, height: 40 }, {
    children: [
      node("dom-icon", "span", { x: 32, y: 30, width: 16, height: 16 }),
      node("dom-label", "span", { x: 56, y: 30, width: 64, height: 16 })
    ]
  });
  const packageData = packageWithChildren([button]);
  const adapter = createMemoryFigmaAdapter();
  const result = renderThreeFrames(adapter, packageData);
  const createdNodes = renderAutoLayoutExperimental(adapter, {
    role: "Auto Layout Experimental",
    children: []
  }, packageData);

  assert.deepEqual(createAutoLayoutNodeModels(packageData.capture).map((item) => item.sourceNodeId), ["dom-button"]);
  assert.equal(result.frames.length, 2);
  assert.equal(result.autoLayoutFrameEnabled, false);
  assert.equal(createdNodes[0].layoutMode, "HORIZONTAL");
  assert.equal(createdNodes[0].pattern, "button inner content");
});
