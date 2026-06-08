export const CAPTURE_ACTIVE_TAB_MESSAGE = "FIGCAPTURE_CAPTURE_ACTIVE_TAB";
export const EXPORT_CONFIRMED_MESSAGE = "FIGCAPTURE_EXPORT_CONFIRMED";

export function describeBackgroundRuntime() {
  return {
    localFirst: true,
    uploadEndpoints: [],
    requiredPermissions: ["activeTab", "scripting", "downloads"],
    credentialFields: [],
    captureTarget: "active-current-window-tab"
  };
}

export function assertLocalFirstManifest(manifest) {
  const runtime = describeBackgroundRuntime();
  const permissions = manifest.permissions ?? [];
  const extraPermissions = permissions.filter((permission) => !runtime.requiredPermissions.includes(permission));

  return {
    ok: extraPermissions.length === 0 && !hasCredentialInput(manifest),
    extraPermissions,
    hasCredentialInput: hasCredentialInput(manifest)
  };
}

export async function resolveActiveTab(chromeApi = globalThis.chrome) {
  if (!chromeApi?.tabs?.query) {
    throw new Error("Chrome tabs API is unavailable");
  }

  const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.id) {
    throw new Error("No active tab is available for capture");
  }

  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? ""
  };
}

export async function handleCaptureActiveTab(chromeApi = globalThis.chrome) {
  const tab = await resolveActiveTab(chromeApi);
  return {
    status: "ready",
    localFirst: true,
    tab
  };
}

export function registerBackgroundRuntime(chromeApi = globalThis.chrome) {
  chromeApi?.runtime?.onMessage?.addListener?.((message, _sender, sendResponse) => {
    if (message?.type === EXPORT_CONFIRMED_MESSAGE) {
      sendResponse({
        status: "error",
        error: {
          category: "missing-capture-preview",
          message: "Run capture preview before confirming export"
        }
      });
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
          category: "missing-permissions",
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
