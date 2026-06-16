import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_CODES,
  FigcaptureValidationError,
  assertValidCapturePackage,
  summarizeDiagnostics,
  validateCapture,
  validateCapturePackage,
  validateManifest
} from "../dist/index.js";
import { createValidPackage } from "../fixtures/valid-package.mjs";

test("valid package preserves viewport metadata, DOM tree, styles, layout boxes, and source ids", () => {
  const packageData = createValidPackage();
  const validation = validateCapturePackage(packageData);

  assert.equal(validation.ok, true);
  assert.equal(packageData.manifest.viewportWidth, 1440);
  assert.equal(packageData.capture.viewport.scrollY, 120);
  assert.equal(packageData.capture.root.children[0].sourceNodeId, "dom-2");
  assert.equal(packageData.capture.root.children[0].styles.fontFamily, "Inter");
  assert.deepEqual(packageData.capture.root.children[0].rect, { x: 32, y: 40, width: 120, height: 28 });
});

test("unsupported schemaVersion returns a stable validation category", () => {
  const packageData = createValidPackage({
    manifest: {
      ...createValidPackage().manifest,
      schemaVersion: "9.9.9"
    }
  });

  const validation = validateManifest(packageData.manifest);

  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0].code, ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION);
  assert.equal(validation.errors[0].path, "manifest.schemaVersion");
});

test("invalid capture reports missing DOM and layout contract fields", () => {
  const invalidCapture = {
    sourceUrl: "https://app.example.com/dashboard",
    viewport: {
      width: 1440,
      height: 900,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0
    },
    root: {
      id: "node-1",
      nodeType: "element",
      tagName: "main",
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      attributes: {},
      children: []
    }
  };

  const validation = validateCapture(invalidCapture);
  const paths = validation.errors.map((item) => item.path);

  assert.equal(validation.ok, false);
  assert(paths.includes("capture.root.sourceNodeId"));
  assert(paths.includes("capture.root.styles"));
});

test("diagnostics summary exposes designer-facing validation counts", () => {
  const packageData = createValidPackage();
  const summary = summarizeDiagnostics(packageData.diagnostics);

  assert.deepEqual(summary, {
    fallbackCount: 1,
    missingAssetCount: 0,
    unsupportedStyleCount: 1,
    autoLayoutCandidateCount: 1,
    status: "warning"
  });
});

test("assertValidCapturePackage throws with validation errors for invalid package data", () => {
  assert.throws(
    () => assertValidCapturePackage({}),
    (error) => {
      assert(error instanceof FigcaptureValidationError);
      assert(error.errors.length > 0);
      return true;
    }
  );
});

test("full-page manifest fields validate when well formed", () => {
  const packageData = createValidPackage();
  const validation = validateManifest({
    ...packageData.manifest,
    captureMode: "full-page",
    documentWidth: 1440,
    documentHeight: 5200
  });

  assert.equal(validation.ok, true);
});

test("element manifest mode validates without document dimensions", () => {
  const packageData = createValidPackage();
  const validation = validateManifest({
    ...packageData.manifest,
    captureMode: "element",
    viewportWidth: 320,
    viewportHeight: 180
  });

  assert.equal(validation.ok, true);
});

test("invalid captureMode is rejected", () => {
  const packageData = createValidPackage();
  const validation = validateManifest({
    ...packageData.manifest,
    captureMode: "partial"
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0].path, "manifest.captureMode");
});

test("invalid includeScreenshot metadata is rejected", () => {
  const packageData = createValidPackage();
  const validation = validateManifest({
    ...packageData.manifest,
    includeScreenshot: "false"
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0].path, "manifest.includeScreenshot");
});

test("full-page manifest requires positive document dimensions", () => {
  const packageData = createValidPackage();
  const validation = validateManifest({
    ...packageData.manifest,
    captureMode: "full-page",
    documentWidth: 1440
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0].path, "manifest.documentHeight");
});

test("viewport packages without full-page fields remain valid", () => {
  const packageData = createValidPackage();
  const validation = validateManifest(packageData.manifest);

  assert.equal(validation.ok, true);
});
