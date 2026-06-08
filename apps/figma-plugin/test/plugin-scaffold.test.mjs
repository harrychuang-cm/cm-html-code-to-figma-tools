import assert from "node:assert/strict";
import test from "node:test";
import { describePluginRuntime } from "../dist/code.js";

test("figma plugin shell defines the three output frames", () => {
  assert.deepEqual(describePluginRuntime().outputFrames, [
    "Source Screenshot",
    "Editable Accurate",
    "Auto Layout Experimental"
  ]);
});
