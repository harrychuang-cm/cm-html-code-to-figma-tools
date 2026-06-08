import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_SCHEMA_VERSION, describeCaptureSchema } from "../dist/index.js";

test("capture schema scaffold exposes version and required debug files", () => {
  const description = describeCaptureSchema();

  assert.equal(CURRENT_SCHEMA_VERSION, "1.0.0");
  assert.equal(description.schemaVersion, "1.0.0");
  assert.deepEqual(description.requiredFiles, [
    "manifest.json",
    "capture.json",
    "figma-plan.json",
    "screenshot.png",
    "diagnostics.json"
  ]);
});
