export const IMPORT_PACKAGE = "IMPORT_PACKAGE";
export const IMPORT_SUCCESS = "IMPORT_SUCCESS";
export const IMPORT_ERROR = "IMPORT_ERROR";
export const IMPORT_PROGRESS = "IMPORT_PROGRESS";

export function createImportProgressMessage(progress = {}) {
  return {
    type: IMPORT_PROGRESS,
    phase: progress.phase ?? "importing",
    processed: progress.processed ?? 0,
    total: progress.total ?? 0,
    label: progress.label ?? "",
    message: progress.message ?? ""
  };
}

export function createImportPackageMessage(filename, bytes, options = {}) {
  return {
    type: IMPORT_PACKAGE,
    filename,
    bytes: toUint8Array(bytes),
    matchVariables: options.matchVariables !== false
  };
}

export function createImportSuccessMessage(report) {
  return {
    type: IMPORT_SUCCESS,
    report
  };
}

export function createImportErrorMessage(error) {
  return {
    type: IMPORT_ERROR,
    error: {
      category: error?.category ?? "import-error",
      message: error?.message ?? "Import failed"
    }
  };
}

export function normalizePluginMessage(eventOrMessage) {
  return eventOrMessage?.data?.pluginMessage ??
    eventOrMessage?.pluginMessage ??
    eventOrMessage;
}

export function isImportPackageMessage(message) {
  return message?.type === IMPORT_PACKAGE &&
    typeof message.filename === "string" &&
    message.bytes !== undefined;
}

export function postPluginMessage(target, message) {
  target?.postMessage?.({ pluginMessage: message }, "*");
}

export async function readFileAsImportPackageMessage(file, options = {}) {
  if (!file) {
    throw bridgeError("missing-file", "Select a .figcapture file");
  }
  if (!file.name.endsWith(".figcapture")) {
    throw bridgeError("invalid-extension", "Select a .figcapture file");
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return createImportPackageMessage(file.name, bytes, options);
  } catch (error) {
    throw bridgeError("file-transfer-failed", error?.message ?? "Could not read .figcapture file", error);
  }
}

export function bridgeError(category, message, cause) {
  const error = new Error(message);
  error.category = category;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes);
  }
  if (bytes?.buffer instanceof ArrayBuffer) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset ?? 0, bytes.byteLength);
  }
  return new Uint8Array(bytes ?? []);
}
