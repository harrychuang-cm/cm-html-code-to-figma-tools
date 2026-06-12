import assert from "node:assert/strict";
import test from "node:test";
import { stitchScreenshotSegments } from "../dist/stitch-screenshot.js";

function createFakeCanvasFactory(record) {
  return function createCanvas(width, height) {
    record.width = width;
    record.height = height;
    return {
      getContext() {
        return {
          drawImage(bitmap, x, y) {
            record.draws.push({ dataUrl: bitmap.dataUrl, x, y });
          }
        };
      },
      async convertToBlob() {
        return {
          async arrayBuffer() {
            return Uint8Array.from([137, 80, 78, 71]).buffer;
          }
        };
      }
    };
  };
}

test("segments draw at scrollY times devicePixelRatio offsets", async () => {
  const record = { draws: [], width: 0, height: 0 };
  const dataUrl = await stitchScreenshotSegments(
    [
      { dataUrl: "segment-0", scrollY: 0 },
      { dataUrl: "segment-1", scrollY: 800 },
      { dataUrl: "segment-2", scrollY: 1600 }
    ],
    {
      documentWidth: 1440,
      documentHeight: 2400,
      devicePixelRatio: 2,
      createCanvas: createFakeCanvasFactory(record),
      createBitmap: async (segmentDataUrl) => ({ dataUrl: segmentDataUrl })
    }
  );

  assert.equal(record.width, 2880);
  assert.equal(record.height, 4800);
  assert.deepEqual(record.draws.map((draw) => draw.y), [0, 1600, 3200]);
  assert.deepEqual(record.draws.map((draw) => draw.dataUrl), ["segment-0", "segment-1", "segment-2"]);
  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test("missing canvas APIs fail with screenshot-failed category", async () => {
  await assert.rejects(
    stitchScreenshotSegments(
      [{ dataUrl: "segment-0", scrollY: 0 }],
      {
        documentWidth: 1440,
        documentHeight: 2400,
        devicePixelRatio: 1,
        createCanvas: () => ({ getContext: () => null }),
        createBitmap: async () => ({})
      }
    ),
    (error) => error.category === "screenshot-failed"
  );

  await assert.rejects(
    stitchScreenshotSegments([], { documentWidth: 1440, documentHeight: 2400 }),
    (error) => error.category === "screenshot-failed"
  );
});
