import { renderImportReport } from "./report.ts";
import {
  IMPORT_ERROR,
  IMPORT_SUCCESS,
  createImportErrorMessage,
  normalizePluginMessage,
  postPluginMessage,
  readFileAsImportPackageMessage
} from "./message-bridge.ts";

export function connectFigmaPluginUi(
  documentRef = globalThis.document,
  parentWindow = globalThis.parent,
  windowRef = globalThis.window
) {
  const input = documentRef?.getElementById("capture-file");
  const status = documentRef?.getElementById("import-status");

  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      setStatus(status, "Select a .figcapture file");
      return;
    }

    setStatus(status, "Reading .figcapture...");
    renderUiError(documentRef, null);
    try {
      const message = await readFileAsImportPackageMessage(file);
      setStatus(status, "Importing...");
      postPluginMessage(parentWindow, message);
    } catch (error) {
      renderIncomingMessage(documentRef, createImportErrorMessage(error));
    }
  });

  windowRef?.addEventListener?.("message", (event) => {
    renderIncomingMessage(documentRef, normalizePluginMessage(event));
  });
}

export function describePluginUi() {
  return {
    accepts: ".figcapture"
  };
}

export function renderIncomingMessage(documentRef, message) {
  if (message?.type === IMPORT_SUCCESS) {
    setStatus(documentRef.getElementById("import-status"), "Import complete");
    renderUiError(documentRef, null);
    renderImportReport(documentRef, message.report);
    return;
  }

  if (message?.type === IMPORT_ERROR) {
    renderUiError(documentRef, message.error);
  }
}

export function renderUiError(documentRef, error) {
  if (error) {
    setStatus(documentRef.getElementById("import-status"), error.message);
  }
  setText(documentRef, "import-error-category", error?.category ?? "");
}

function setStatus(element, message) {
  if (element) {
    element.textContent = message;
  }
}

function setText(documentRef, id, text) {
  const element = documentRef.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

connectFigmaPluginUi();
