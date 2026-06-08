import assert from "node:assert/strict";
import test from "node:test";
import {
  createFigcaptureFileMap,
  packFigcapture,
  packFigcaptureFiles
} from "../../../packages/capture-schema/dist/index.js";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import { createImportUiState, validatePackageBytes } from "../dist/importer.js";

test("figma import validation accepts a valid .figcapture package", () => {
  const validation = validatePackageBytes(packFigcapture(createValidPackage()));
  const state = createImportUiState(validation);

  assert.equal(validation.ok, true);
  assert.equal(state.status, "ready");
  assert.equal(state.canImport, true);
});

test("figma import validation reports missing manifest separately", () => {
  const files = createFigcaptureFileMap(createValidPackage());
  delete files["manifest.json"];
  const validation = validatePackageBytes(packFigcaptureFiles(files));
  const state = createImportUiState(validation);

  assert.equal(validation.ok, false);
  assert.equal(validation.error.category, "missing-manifest");
  assert.equal(state.message, "Package metadata is missing");
});

test("figma import validation reports missing screenshot separately", () => {
  const files = createFigcaptureFileMap(createValidPackage());
  delete files["screenshot.png"];
  const validation = validatePackageBytes(packFigcaptureFiles(files));

  assert.equal(validation.ok, false);
  assert.equal(validation.error.category, "missing-screenshot");
  assert.equal(validation.error.message, "Source screenshot is missing");
});

test("figma import validation reports unsupported schemaVersion separately", () => {
  const packageData = createValidPackage({
    manifest: {
      ...createValidPackage().manifest,
      schemaVersion: "99.0.0"
    }
  });
  const validation = validatePackageBytes(packFigcaptureFiles(createFigcaptureFileMap(packageData)));

  assert.equal(validation.ok, false);
  assert.equal(validation.error.category, "unsupported-schema-version");
  assert.equal(validation.error.message, "Capture package schema version is unsupported");
});
