export const IMPORT_PACKAGE = "IMPORT_PACKAGE";
export const IMPORT_PACKAGE_TRANSFER_START = "IMPORT_PACKAGE_TRANSFER_START";
export const IMPORT_PACKAGE_TRANSFER_CHUNK = "IMPORT_PACKAGE_TRANSFER_CHUNK";
export const IMPORT_PACKAGE_TRANSFER_END = "IMPORT_PACKAGE_TRANSFER_END";
export const IMPORT_SUCCESS = "IMPORT_SUCCESS";
export const IMPORT_ERROR = "IMPORT_ERROR";
export const IMPORT_PROGRESS = "IMPORT_PROGRESS";
export const DEFAULT_IMPORT_PACKAGE_CHUNK_SIZE = 256 * 1024;

let nextTransferSequence = 0;

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

export function createImportPackageTransferMessages(filename, bytes, options = {}) {
  const packageBytes = toUint8Array(bytes);
  const chunkSize = normalizeChunkSize(options.chunkSize);
  const totalChunks = Math.ceil(packageBytes.byteLength / chunkSize);
  const transferId = options.transferId ?? createTransferId(filename);
  const messages = [{
    type: IMPORT_PACKAGE_TRANSFER_START,
    transferId,
    filename,
    totalBytes: packageBytes.byteLength,
    totalChunks,
    chunkSize,
    matchVariables: options.matchVariables !== false
  }];

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, packageBytes.byteLength);
    messages.push({
      type: IMPORT_PACKAGE_TRANSFER_CHUNK,
      transferId,
      index,
      bytes: packageBytes.slice(start, end)
    });
  }

  messages.push({
    type: IMPORT_PACKAGE_TRANSFER_END,
    transferId
  });
  return messages;
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

export function isImportPackageTransferMessage(message) {
  return message?.type === IMPORT_PACKAGE_TRANSFER_START ||
    message?.type === IMPORT_PACKAGE_TRANSFER_CHUNK ||
    message?.type === IMPORT_PACKAGE_TRANSFER_END;
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

export async function readFileAsImportPackageTransferMessages(file, options = {}) {
  const bytes = await readFigcaptureFileBytes(file);
  return createImportPackageTransferMessages(file.name, bytes, options);
}

export async function postImportPackageFile(target, file, options = {}) {
  let messages;
  try {
    messages = await readFileAsImportPackageTransferMessages(file, options);
  } catch (error) {
    if (error?.category) {
      throw error;
    }
    throw bridgeError("file-transfer-failed", error?.message ?? "Could not read .figcapture file", error);
  }

  const startMessage = messages[0];
  const totalChunks = startMessage.totalChunks ?? 0;
  let sentChunks = 0;
  try {
    for (const message of messages) {
      postPluginMessage(target, message);
      if (message.type === IMPORT_PACKAGE_TRANSFER_CHUNK) {
        sentChunks += 1;
        options.onProgress?.({
          filename: startMessage.filename,
          totalBytes: startMessage.totalBytes,
          totalChunks,
          sentChunks,
          sentBytes: Math.min(sentChunks * startMessage.chunkSize, startMessage.totalBytes)
        });
        await yieldToEventLoop();
      }
    }
  } catch (error) {
    throw bridgeError("file-transfer-failed", error?.message ?? "Could not transfer .figcapture file", error);
  }

  return {
    filename: startMessage.filename,
    totalBytes: startMessage.totalBytes,
    totalChunks
  };
}

export function bridgeError(category, message, cause) {
  const error = new Error(message);
  error.category = category;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

export function createImportPackageTransferReceiver() {
  let transfer = null;

  return {
    accept(message) {
      if (message?.type === IMPORT_PACKAGE_TRANSFER_START) {
        transfer = createTransferState(message);
        return {
          status: "pending",
          phase: "receiving",
          filename: transfer.filename,
          processed: 0,
          total: transfer.totalChunks
        };
      }

      if (message?.type === IMPORT_PACKAGE_TRANSFER_CHUNK) {
        assertActiveTransfer(transfer, message);
        const index = Number(message.index);
        if (!Number.isInteger(index) || index < 0 || index >= transfer.totalChunks) {
          throw bridgeError("file-transfer-failed", "Received an invalid .figcapture chunk index");
        }
        const bytes = toUint8Array(message.bytes);
        const previous = transfer.chunks[index];
        transfer.chunks[index] = bytes;
        if (!transfer.received[index]) {
          transfer.received[index] = true;
          transfer.receivedChunks += 1;
          transfer.receivedBytes += bytes.byteLength;
        } else {
          transfer.receivedBytes += bytes.byteLength - previous.byteLength;
        }
        return {
          status: "pending",
          phase: "receiving",
          filename: transfer.filename,
          processed: transfer.receivedChunks,
          total: transfer.totalChunks
        };
      }

      if (message?.type === IMPORT_PACKAGE_TRANSFER_END) {
        assertActiveTransfer(transfer, message);
        const completed = createImportPackageMessage(transfer.filename, assembleTransferBytes(transfer), {
          matchVariables: transfer.matchVariables
        });
        transfer = null;
        return {
          status: "complete",
          message: completed
        };
      }

      return null;
    }
  };
}

function readFigcaptureFileBytes(file) {
  if (!file) {
    throw bridgeError("missing-file", "Select a .figcapture file");
  }
  if (!file.name.endsWith(".figcapture")) {
    throw bridgeError("invalid-extension", "Select a .figcapture file");
  }
  return file.arrayBuffer()
    .then((buffer) => new Uint8Array(buffer))
    .catch((error) => {
      throw bridgeError("file-transfer-failed", error?.message ?? "Could not read .figcapture file", error);
    });
}

function createTransferState(message) {
  const filename = typeof message.filename === "string" ? message.filename : "";
  const transferId = typeof message.transferId === "string" ? message.transferId : "";
  const totalBytes = Number(message.totalBytes);
  const totalChunks = Number(message.totalChunks);
  if (!filename || !transferId || !Number.isInteger(totalBytes) || totalBytes < 0 ||
    !Number.isInteger(totalChunks) || totalChunks < 0) {
    throw bridgeError("file-transfer-failed", "Received an invalid .figcapture transfer start message");
  }
  return {
    transferId,
    filename,
    totalBytes,
    totalChunks,
    matchVariables: message.matchVariables !== false,
    chunks: new Array(totalChunks),
    received: new Array(totalChunks).fill(false),
    receivedChunks: 0,
    receivedBytes: 0
  };
}

function assertActiveTransfer(transfer, message) {
  if (!transfer) {
    throw bridgeError("file-transfer-failed", "Received .figcapture transfer data without an active transfer");
  }
  if (message.transferId !== transfer.transferId) {
    throw bridgeError("file-transfer-failed", "Received .figcapture transfer data for an unknown transfer");
  }
}

function assembleTransferBytes(transfer) {
  if (transfer.receivedChunks !== transfer.totalChunks) {
    throw bridgeError("file-transfer-failed", "The .figcapture transfer ended before every chunk was received");
  }
  const bytes = new Uint8Array(transfer.totalBytes);
  let offset = 0;
  for (let index = 0; index < transfer.totalChunks; index += 1) {
    const chunk = transfer.chunks[index];
    if (!chunk) {
      throw bridgeError("file-transfer-failed", "The .figcapture transfer is missing a chunk");
    }
    if (offset + chunk.byteLength > bytes.byteLength) {
      throw bridgeError("file-transfer-failed", "The .figcapture transfer is larger than expected");
    }
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== transfer.totalBytes) {
    throw bridgeError("file-transfer-failed", "The .figcapture transfer size did not match the expected size");
  }
  return bytes;
}

function normalizeChunkSize(value) {
  const chunkSize = Number(value) || DEFAULT_IMPORT_PACKAGE_CHUNK_SIZE;
  return Math.max(1, Math.floor(chunkSize));
}

function createTransferId(filename) {
  nextTransferSequence += 1;
  return `figcapture-${Date.now()}-${nextTransferSequence}-${String(filename ?? "file").replace(/[^a-z0-9._-]+/gi, "-")}`;
}

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
