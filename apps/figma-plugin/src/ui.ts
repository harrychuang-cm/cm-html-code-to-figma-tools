import { renderImportReport } from "./report.ts";
import {
  IMPORT_ERROR,
  IMPORT_PROGRESS,
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
  const dropZone = documentRef?.getElementById("drop-zone");

  const startImport = async (file) => {
    if (!file) {
      setStatusState(documentRef, "idle", "Select a .figcapture file");
      return;
    }

    setSelectedFile(documentRef, file.name);
    resetReport(documentRef);
    renderUiError(documentRef, null);
    setStatusState(documentRef, "working", "Reading file…");
    showProgress(documentRef, { phase: "reading", message: "Reading file", indeterminate: true });
    try {
      const matchVariables = readMatchVariables(documentRef);
      const message = await readFileAsImportPackageMessage(file, { matchVariables });
      setStatusState(documentRef, "working", "Importing…");
      showProgress(documentRef, { phase: "importing", message: "Importing", indeterminate: true });
      postPluginMessage(parentWindow, message);
    } catch (error) {
      renderIncomingMessage(documentRef, createImportErrorMessage(error));
    }
  };

  input?.addEventListener("change", () => {
    startImport(input.files?.[0]);
  });

  if (dropZone?.addEventListener) {
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault?.();
      dropZone.classList?.add("is-dragover");
    });
    const clearDrag = () => dropZone.classList?.remove("is-dragover");
    dropZone.addEventListener("dragleave", clearDrag);
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault?.();
      clearDrag();
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        startImport(file);
      }
    });
  }

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
  if (message?.type === IMPORT_PROGRESS) {
    renderProgress(documentRef, message);
    return;
  }

  if (message?.type === IMPORT_SUCCESS) {
    completeProgress(documentRef);
    setStatusState(documentRef, "success", "Import complete");
    renderUiError(documentRef, null);
    renderImportReport(documentRef, message.report);
    return;
  }

  if (message?.type === IMPORT_ERROR) {
    hideProgress(documentRef);
    renderUiError(documentRef, message.error);
  }
}

export function renderUiError(documentRef, error) {
  const banner = documentRef?.getElementById?.("import-error");
  if (error) {
    setStatusState(documentRef, "error", error.message ?? "Import failed");
    setText(documentRef, "import-error-message", error.message ?? "Import failed");
    setText(documentRef, "import-error-category", error.category ?? "");
    if (banner) {
      banner.hidden = false;
    }
    return;
  }
  setText(documentRef, "import-error-category", "");
  if (banner) {
    banner.hidden = true;
  }
}

function renderProgress(documentRef, message) {
  const total = Number(message?.total) || 0;
  const processed = Number(message?.processed) || 0;
  const indeterminate = total <= 0;
  showProgress(documentRef, {
    phase: message?.phase,
    message: message?.message ?? message?.label ?? "Importing",
    indeterminate
  });
  setStatusState(documentRef, "working", message?.message ?? "Importing…");
  setText(documentRef, "progress-label", message?.label ?? message?.message ?? "Importing…");
  const countEl = documentRef?.getElementById?.("progress-count");
  if (countEl) {
    countEl.textContent = total > 0 ? `${Math.min(processed, total)} / ${total}` : "";
  }
  if (!indeterminate) {
    setProgressWidth(documentRef, Math.round((processed / total) * 100));
  }
}

function showProgress(documentRef, { phase, message, indeterminate } = {}) {
  const root = documentRef?.getElementById?.("import-progress");
  if (!root) {
    return;
  }
  root.hidden = false;
  root.classList?.toggle("is-indeterminate", Boolean(indeterminate));
  setText(documentRef, "progress-label", message ?? "Preparing…");
  const countEl = documentRef?.getElementById?.("progress-count");
  if (countEl && indeterminate) {
    countEl.textContent = "";
  }
  if (indeterminate) {
    setProgressWidth(documentRef, 0);
  }
}

function completeProgress(documentRef) {
  const root = documentRef?.getElementById?.("import-progress");
  if (!root) {
    return;
  }
  root.classList?.remove("is-indeterminate");
  setProgressWidth(documentRef, 100);
  setText(documentRef, "progress-label", "Done");
  if (typeof globalThis.setTimeout === "function") {
    globalThis.setTimeout(() => hideProgress(documentRef), 600);
  }
}

function hideProgress(documentRef) {
  const root = documentRef?.getElementById?.("import-progress");
  if (root) {
    root.hidden = true;
    root.classList?.remove("is-indeterminate");
  }
}

function setProgressWidth(documentRef, percent) {
  const fill = documentRef?.getElementById?.("progress-bar-fill");
  if (fill?.style) {
    fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

function resetReport(documentRef) {
  const report = documentRef?.getElementById?.("import-report");
  if (report) {
    report.hidden = true;
  }
}

function setSelectedFile(documentRef, name) {
  const dropZone = documentRef?.getElementById?.("drop-zone");
  dropZone?.classList?.add("has-file");
  const el = documentRef?.getElementById?.("selected-file");
  if (el) {
    el.textContent = name;
    el.hidden = false;
  }
}

function setStatusState(documentRef, state, message) {
  const row = documentRef?.getElementById?.("import-status-row");
  if (row?.setAttribute) {
    row.setAttribute("data-state", state);
  }
  setText(documentRef, "import-status", message);
}

function readMatchVariables(documentRef) {
  const toggle = documentRef?.getElementById?.("match-variables");
  return toggle ? toggle.checked !== false : true;
}

function setText(documentRef, id, text) {
  const element = documentRef?.getElementById?.(id);
  if (element) {
    element.textContent = text;
  }
}

connectFigmaPluginUi();
