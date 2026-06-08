import { renderThreeFrames } from "./renderer.ts";

export function describePluginRuntime() {
  return {
    outputFrames: [
      "Source Screenshot",
      "Editable Accurate",
      "Auto Layout Experimental"
    ]
  };
}

export function importCaptureIntoFrames(adapter, packageData) {
  return renderThreeFrames(adapter, packageData);
}
