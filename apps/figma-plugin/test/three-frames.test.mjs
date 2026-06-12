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
    "Dashboard / 1440x900 / Editable Accurate"
  ]);
  assert(models.every((model) => model.width === 1440));
  assert(models.every((model) => model.height === 900));
});

test("mocked Figma API creates source and editable frames with locked source screenshot", () => {
  const adapter = createMemoryFigmaAdapter();
  const packageData = createValidPackage();
  const result = renderThreeFrames(adapter, packageData);

  assert.equal(result.frames.length, 2);
  assert(result.frames.every((frame) => frame.width === 1440 && frame.height === 900));
  assert.equal(result.frames[0].children.length, 1);
  assert.equal(result.frames[0].children[0].name, "Source screenshot");
  assert.equal(result.frames[0].children[0].locked, true);
  assert(adapter.createdFrames.length > result.frames.length);
  assert.equal(result.sourceScreenshotLayer.type, "IMAGE");
  assert.equal(result.autoLayoutFrameEnabled, false);
});

test("full-page manifests create document-sized frames and screenshot layer", () => {
  const base = createValidPackage();
  const packageData = {
    ...base,
    manifest: {
      ...base.manifest,
      captureMode: "full-page",
      documentWidth: 1440,
      documentHeight: 5200
    }
  };

  const models = createFrameModels(packageData);
  assert.deepEqual(models.map((model) => model.name), [
    "Dashboard / 1440x5200 / Source Screenshot",
    "Dashboard / 1440x5200 / Editable Accurate"
  ]);
  assert(models.every((model) => model.width === 1440 && model.height === 5200));

  const adapter = createMemoryFigmaAdapter();
  const result = renderThreeFrames(adapter, packageData);
  assert(result.frames.every((frame) => frame.width === 1440 && frame.height === 5200));
  assert.equal(result.sourceScreenshotLayer.width, 1440);
  assert.equal(result.sourceScreenshotLayer.height, 5200);
});

test("viewport manifests keep viewport-sized frames", () => {
  const models = createFrameModels(createValidPackage());
  assert(models.every((model) => model.width === 1440 && model.height === 900));
});
