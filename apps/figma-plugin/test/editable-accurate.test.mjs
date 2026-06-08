import assert from "node:assert/strict";
import test from "node:test";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import {
  createAccurateNodeModels,
  createMemoryFigmaAdapter,
  renderThreeFrames
} from "../dist/renderer.js";

function createRenderablePackage() {
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
              borderTopRightRadius: "8px",
              borderBottomRightRadius: "8px",
              borderBottomLeftRadius: "8px",
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
              fontFamily: "Inter",
              fontSize: "20px",
              fontWeight: "600",
              lineHeight: "28px",
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
          }
        ]
      }
    },
    diagnostics: {
      ...base.diagnostics,
      fallbackReasons: [
        { sourceNodeId: "dom-canvas", reason: "canvas fallback" }
      ]
    },
    assets: {
      "assets/image-1.png": new Uint8Array([1]),
      "assets/fallback-1.png": new Uint8Array([2])
    }
  };
}

test("accurate renderer creates text, image, shape, and fallback node models", () => {
  const models = createAccurateNodeModels(createRenderablePackage());
  const bySource = new Map(models.map((model) => [model.sourceNodeId, model]));

  assert.equal(bySource.get("dom-card").type, "RECTANGLE");
  assert.deepEqual(bySource.get("dom-card").rect, { x: 24, y: 32, width: 320, height: 180 });
  assert.deepEqual(bySource.get("dom-card").style.fills, ["rgb(255, 255, 255)"]);
  assert.deepEqual(bySource.get("dom-card").style.strokes, [{ color: "rgb(229, 231, 235)", width: 1 }]);
  assert.equal(bySource.get("dom-card").style.cornerRadius, 8);
  assert.deepEqual(bySource.get("dom-card").style.effects, [{ type: "shadow", value: "0px 4px 12px rgba(0, 0, 0, 0.12)" }]);

  assert.equal(bySource.get("dom-text").type, "TEXT");
  assert.equal(bySource.get("dom-text").text, "Revenue");
  assert.equal(bySource.get("dom-text").style.text.fontSize, 20);

  assert.equal(bySource.get("dom-image").type, "IMAGE");
  assert.equal(bySource.get("dom-image").assetRef, "assets/image-1.png");

  assert.equal(bySource.get("dom-canvas").type, "FALLBACK_IMAGE");
  assert.equal(bySource.get("dom-canvas").fallbackReason, "canvas fallback");
});

test("renderThreeFrames appends accurate editable layers to Editable Accurate frame", () => {
  const adapter = createMemoryFigmaAdapter();
  const result = renderThreeFrames(adapter, createRenderablePackage());
  const editableFrame = result.frames[1];

  assert.equal(editableFrame.role, "Editable Accurate");
  assert.equal(editableFrame.children.some((node) => node.type === "TEXT" && node.characters === "Revenue"), true);
  assert.equal(editableFrame.children.some((node) => node.type === "IMAGE" && node.assetRef === "assets/image-1.png"), true);
  assert.equal(editableFrame.children.some((node) => node.type === "IMAGE" && node.fallbackReason === "canvas fallback"), true);
  assert.equal(editableFrame.children.some((node) => node.type === "RECTANGLE" && node.style.cornerRadius === 8), true);
});
