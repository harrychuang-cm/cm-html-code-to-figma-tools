import assert from "node:assert/strict";
import test from "node:test";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import {
  createFrameModels,
  createMemoryFigmaAdapter,
  renderThreeFrames
} from "../dist/renderer.js";

test("frame models include source identity, viewport size, and role", () => {
  const models = createFrameModels(createValidPackage());

  assert.deepEqual(models.map((model) => model.name), [
    "Dashboard / 1440x900 / Source Screenshot",
    "Dashboard / 1440x900 / Editable Accurate",
    "Dashboard / 1440x900 / Auto Layout Experimental"
  ]);
  assert(models.every((model) => model.width === 1440));
  assert(models.every((model) => model.height === 900));
});

test("mocked Figma API creates exactly three same-size frames and locked source screenshot", () => {
  const adapter = createMemoryFigmaAdapter();
  const packageData = createValidPackage();
  const result = renderThreeFrames(adapter, packageData);

  assert.equal(adapter.createdFrames.length, 3);
  assert(adapter.createdFrames.every((frame) => frame.width === 1440 && frame.height === 900));
  assert.equal(adapter.createdFrames[0].children.length, 1);
  assert.equal(adapter.createdFrames[0].children[0].name, "Source screenshot");
  assert.equal(adapter.createdFrames[0].children[0].locked, true);
  assert.equal(result.sourceScreenshotLayer.type, "IMAGE");
});
