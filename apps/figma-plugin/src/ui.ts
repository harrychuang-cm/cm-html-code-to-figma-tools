import { createImportUiState, readSelectedFigcapture } from "./importer.ts";

const input = globalThis.document?.getElementById("capture-file");
const status = globalThis.document?.getElementById("import-status");

input?.addEventListener("change", async () => {
  if (status) {
    const file = input.files?.[0];
    if (!file) {
      status.textContent = "Select a .figcapture file";
      return;
    }
    const validation = await readSelectedFigcapture(file);
    status.textContent = createImportUiState(validation).message;
  }
});

export function describePluginUi() {
  return {
    accepts: ".figcapture"
  };
}
