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

test("full-page source screenshots use packaged tiles when available", () => {
  const base = createValidPackage();
  const packageData = {
    ...base,
    manifest: {
      ...base.manifest,
      captureMode: "full-page",
      documentWidth: 1440,
      documentHeight: 3400,
      devicePixelRatio: 2
    },
    assets: {
      ...base.assets,
      "assets/source-screenshot/tile-0000.png": pngHeaderBytes(2880, 3600),
      "assets/source-screenshot/tile-0001.png": pngHeaderBytes(2880, 3200)
    }
  };
  const adapter = createMemoryFigmaAdapter();
  const result = renderThreeFrames(adapter, packageData);
  const sourceLayers = result.frames[0].children;

  assert.equal(sourceLayers.length, 2);
  assert.deepEqual(sourceLayers.map((layer) => layer.name), [
    "Source screenshot / Tile 1",
    "Source screenshot / Tile 2"
  ]);
  assert.deepEqual(sourceLayers.map((layer) => ({
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    locked: layer.locked
  })), [
    { x: 0, y: 0, width: 1440, height: 1800, locked: true },
    { x: 0, y: 1800, width: 1440, height: 1600, locked: true }
  ]);
  assert.equal(result.sourceScreenshotLayer, sourceLayers[0]);
  assert.deepEqual(result.sourceScreenshotLayers, sourceLayers);
});

test("viewport manifests keep viewport-sized frames", () => {
  const models = createFrameModels(createValidPackage());
  assert(models.every((model) => model.width === 1440 && model.height === 900));
});

test("frame models offset every frame by originX so breakpoint groups do not overlap", () => {
  const baseModels = createFrameModels(createValidPackage());
  assert.deepEqual(baseModels.map((model) => model.x), [0, 1440 + 80]);

  const offsetModels = createFrameModels(createValidPackage(), { originX: 3040 });
  assert.deepEqual(offsetModels.map((model) => model.x), [3040, 3040 + 1440 + 80]);
});

function pngHeaderBytes(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  writeUint32(bytes, 16, width);
  writeUint32(bytes, 20, height);
  return bytes;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
