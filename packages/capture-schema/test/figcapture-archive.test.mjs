import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_CODES,
  FigcaptureValidationError,
  createFigcaptureFileMap,
  packFigcapture,
  packFigcaptureFiles,
  readFigcaptureFiles,
  unpackFigcapture
} from "../dist/index.js";
import { createValidPackage } from "../fixtures/valid-package.mjs";

test("packFigcapture creates a zip-compatible package with required files and assets", () => {
  const archive = packFigcapture(createValidPackage());
  const files = readFigcaptureFiles(archive);

  assert(archive instanceof Uint8Array);
  assert.deepEqual(Object.keys(files).sort(), [
    "assets/image-1.png",
    "capture.json",
    "diagnostics.json",
    "figma-plan.json",
    "manifest.json",
    "screenshot.png"
  ]);
});

test("unpackFigcapture returns validated package data", () => {
  const original = createValidPackage();
  const unpacked = unpackFigcapture(packFigcapture(original));

  assert.equal(unpacked.manifest.schemaVersion, "1.0.0");
  assert.equal(unpacked.capture.root.children[1].assetRef, "assets/image-1.png");
  assert.equal(unpacked.diagnostics.counts.fallbacks, 1);
  assert(unpacked.screenshot instanceof Uint8Array);
});

test("unpackFigcapture rejects missing manifest with a readable category", () => {
  const files = createFigcaptureFileMap(createValidPackage());
  delete files["manifest.json"];
  const archive = packFigcaptureFiles(files);

  assert.throws(
    () => unpackFigcapture(archive),
    (error) => {
      assert(error instanceof FigcaptureValidationError);
      assert.equal(error.errors[0].code, ERROR_CODES.MISSING_FILE);
      assert.equal(error.errors[0].path, "manifest.json");
      return true;
    }
  );
});

test("unpackFigcapture rejects unsupported schemaVersion with a readable category", () => {
  const packageData = createValidPackage({
    manifest: {
      ...createValidPackage().manifest,
      schemaVersion: "2.0.0"
    }
  });
  const archive = packFigcaptureFiles(createFigcaptureFileMap(packageData));

  assert.throws(
    () => unpackFigcapture(archive),
    (error) => {
      assert(error instanceof FigcaptureValidationError);
      assert.equal(error.errors[0].code, ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION);
      assert.equal(error.errors[0].path, "manifest.schemaVersion");
      return true;
    }
  );
});
