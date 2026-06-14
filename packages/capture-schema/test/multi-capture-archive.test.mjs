import assert from "node:assert/strict";
import test from "node:test";
import {
  MULTI_CAPTURE_BUNDLE_VERSION,
  MULTI_CAPTURE_INDEX_FILE,
  FigcaptureValidationError,
  packFigcapture,
  packMultiCaptureFigcapture,
  unpackMultiCaptureFigcapture,
  readFigcaptureFiles
} from "../dist/index.js";
import { createValidPackage } from "../fixtures/valid-package.mjs";

function packageForWidth(width) {
  const packageData = createValidPackage();
  packageData.manifest.viewportWidth = width;
  packageData.capture.viewport.width = width;
  return packageData;
}

test("packMultiCaptureFigcapture namespaces each breakpoint and writes an index file", () => {
  const archive = packMultiCaptureFigcapture({
    captures: [
      { width: 1440, packageData: packageForWidth(1440) },
      { width: 375, packageData: packageForWidth(375) }
    ]
  });
  const files = readFigcaptureFiles(archive);

  assert.ok(files[MULTI_CAPTURE_INDEX_FILE], "expected a captures.json index file");
  assert.ok(files["captures/0/manifest.json"], "expected breakpoint 0 files namespaced");
  assert.ok(files["captures/1/manifest.json"], "expected breakpoint 1 files namespaced");
  assert.ok(files["captures/0/assets/image-1.png"], "expected breakpoint assets namespaced");
});

test("unpackMultiCaptureFigcapture round-trips multiple breakpoints in order", () => {
  const archive = packMultiCaptureFigcapture({
    captures: [
      { width: 1440, label: "1440", packageData: packageForWidth(1440) },
      { width: 375, label: "375", packageData: packageForWidth(375) }
    ]
  });
  const bundle = unpackMultiCaptureFigcapture(archive);

  assert.equal(bundle.bundleVersion, MULTI_CAPTURE_BUNDLE_VERSION);
  assert.equal(bundle.captures.length, 2);
  assert.deepEqual(bundle.captures.map((entry) => entry.width), [1440, 375]);
  assert.deepEqual(bundle.captures.map((entry) => entry.label), ["1440", "375"]);
  assert.equal(bundle.captures[0].packageData.manifest.viewportWidth, 1440);
  assert.equal(bundle.captures[1].packageData.manifest.viewportWidth, 375);
  assert.equal(bundle.captures[0].packageData.capture.root.children[1].assetRef, "assets/image-1.png");
  assert.ok(bundle.captures[0].packageData.screenshot instanceof Uint8Array);
});

test("unpackMultiCaptureFigcapture reads a legacy single-capture package as one breakpoint", () => {
  const legacyArchive = packFigcapture(packageForWidth(1024));
  const bundle = unpackMultiCaptureFigcapture(legacyArchive);

  assert.equal(bundle.captures.length, 1);
  assert.equal(bundle.captures[0].width, 1024);
  assert.equal(bundle.captures[0].label, "1024");
  assert.equal(bundle.captures[0].packageData.manifest.viewportWidth, 1024);
});

test("packMultiCaptureFigcapture rejects an empty bundle", () => {
  assert.throws(
    () => packMultiCaptureFigcapture({ captures: [] }),
    (error) => {
      assert.ok(error instanceof FigcaptureValidationError);
      return true;
    }
  );
});
