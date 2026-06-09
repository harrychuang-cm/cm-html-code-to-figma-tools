import {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  EXPORT_CONFIRMED_MESSAGE,
  handleCaptureActiveTab,
  handleConfirmExport,
  resolveActiveTab
} from "./runtime.ts";

export {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  EXPORT_CONFIRMED_MESSAGE,
  handleCaptureActiveTab,
  handleConfirmExport,
  resolveActiveTab
};

export function describeBackgroundRuntime() {
  return {
    localFirst: true,
    uploadEndpoints: [],
    requiredPermissions: ["activeTab", "scripting", "downloads"],
    hostPermissions: ["<all_urls>"],
    credentialFields: [],
    captureTarget: "active-current-window-tab"
  };
}

export function assertLocalFirstManifest(manifest) {
  const runtime = describeBackgroundRuntime();
  const permissions = manifest.permissions ?? [];
  const hostPermissions = manifest.host_permissions ?? [];
  const extraPermissions = permissions.filter((permission) => !runtime.requiredPermissions.includes(permission));
  const extraHostPermissions = hostPermissions.filter((permission) => !runtime.hostPermissions.includes(permission));

  return {
    ok: extraPermissions.length === 0 && extraHostPermissions.length === 0 && !hasCredentialInput(manifest),
    extraPermissions,
    extraHostPermissions,
    hasCredentialInput: hasCredentialInput(manifest)
  };
}

export function registerBackgroundRuntime(chromeApi = globalThis.chrome) {
  chromeApi?.runtime?.onMessage?.addListener?.((message, _sender, sendResponse) => {
    if (message?.type === EXPORT_CONFIRMED_MESSAGE) {
      handleConfirmExport(chromeApi)
        .then((response) => sendResponse(response));
      return true;
    }

    if (message?.type !== CAPTURE_ACTIVE_TAB_MESSAGE) {
      return false;
    }

    handleCaptureActiveTab(chromeApi)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({
        status: "error",
        error: {
          category: error.category ?? "capture-script-failed",
          message: error.message
        }
      }));

    return true;
  });
}

function hasCredentialInput(manifest) {
  return JSON.stringify(manifest).toLowerCase().includes("password");
}

registerBackgroundRuntime();
