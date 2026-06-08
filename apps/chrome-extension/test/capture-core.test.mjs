import assert from "node:assert/strict";
import test from "node:test";
import {
  captureElementTree,
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
