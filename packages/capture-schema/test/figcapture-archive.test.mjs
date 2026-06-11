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

test("packFigcaptureFiles rejects unsafe archive file names", () => {
  const files = createFigcaptureFileMap(createValidPackage());
  files["assets/../secret.png"] = new Uint8Array([1]);

  assert.throws(
    () => packFigcaptureFiles(files),
    (error) => {
      assert(error instanceof FigcaptureValidationError);
      assert.equal(error.errors[0].code, ERROR_CODES.INVALID_FIELD);
      assert.match(error.errors[0].message, /parent directory/);
      return true;
    }
  );
});

test("readFigcaptureFiles rejects unsafe entry names from external archives", () => {
  const archive = replaceAsciiAll(
    packFigcapture(createValidPackage()),
    "manifest.json",
    "../evil.jsonx"
  );

  assert.throws(
    () => readFigcaptureFiles(archive),
    (error) => {
      assert(error instanceof FigcaptureValidationError);
      assert.equal(error.errors[0].code, ERROR_CODES.INVALID_FIELD);
      assert.equal(error.errors[0].path, "../evil.jsonx");
      assert.match(error.errors[0].message, /parent directory/);
      return true;
    }
  );
});

test("readFigcaptureFiles rejects duplicate entry names from external archives", () => {
  const files = createFigcaptureFileMap(createValidPackage());
  files["screenshot.pnx"] = new Uint8Array([1, 2, 3]);
  const archive = replaceAsciiAll(
    packFigcaptureFiles(files),
    "screenshot.pnx",
    "screenshot.png"
  );

  assert.throws(
    () => readFigcaptureFiles(archive),
    (error) => {
      assert(error instanceof FigcaptureValidationError);
      assert.equal(error.errors[0].code, ERROR_CODES.INVALID_FIELD);
      assert.equal(error.errors[0].path, "screenshot.png");
      assert.match(error.errors[0].message, /Duplicate ZIP entry/);
      return true;
    }
  );
});

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
