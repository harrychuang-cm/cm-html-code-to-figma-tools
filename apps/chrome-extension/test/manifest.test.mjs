import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEmptyDiagnostics } from "../../../packages/capture-schema/dist/index.js";
import {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  assertLocalFirstManifest,
  describeBackgroundRuntime,
  handleCaptureActiveTab
} from "../dist/background.js";
import { captureElementTree } from "../dist/capture-core.js";

test("extension shell is local-first and uses the expected permissions", async () => {
  const manifest = JSON.parse(await readFile("apps/chrome-extension/manifest.json", "utf8"));
  const runtime = describeBackgroundRuntime();

  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "downloads", "debugger"]);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.deepEqual(runtime.uploadEndpoints, []);
  assert.deepEqual(runtime.hostPermissions, ["<all_urls>"]);
  assert.equal(runtime.localFirst, true);
  assert.equal(runtime.captureTarget, "active-current-window-tab");
  assert.equal(assertLocalFirstManifest(manifest).ok, true);
});

test("background capture shell resolves only the active current-window tab", async () => {
  const calls = [];
  const chromeApi = {
    tabs: {
      async query(query) {
        calls.push(query);
        return [{ id: 42, url: "https://app.example.com/dashboard", title: "Dashboard" }];
      }
    }
  };

  const capture = captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      styles: {},
      attributes: {},
      children: []
    },
    { width: 1440, height: 900, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/dashboard",
      title: "Dashboard",
      captureTimestamp: "2026-06-08T08:00:00.000Z"
    }
  );

  const response = await handleCaptureActiveTab(chromeApi, {
    contentMessage: async () => capture,
    screenshotAdapter: async () => "data:image/png;base64,iVBORw0KGgo=",
    packageBuilder() {
      return {
        filename: "dashboard-1440x900.figcapture",
        bytes: new Uint8Array([1]),
        packageData: { diagnostics: createEmptyDiagnostics() }
      };
    }
  });

  assert.equal(CAPTURE_ACTIVE_TAB_MESSAGE, "FIGCAPTURE_CAPTURE_ACTIVE_TAB");
  assert.deepEqual(calls, [{ active: true, currentWindow: true }]);
  assert.equal(response.localFirst, true);
  assert.equal(response.tab.id, 42);
  assert.equal(response.status, "ready");
  assert.equal(response.preview.packageStatus, "ready");
});

test("extension shell has no credential input or upload endpoint", async () => {
  const manifest = JSON.parse(await readFile("apps/chrome-extension/manifest.json", "utf8"));
  const popup = await readFile("apps/chrome-extension/popup.html", "utf8");
  const runtime = describeBackgroundRuntime();

  assert.equal(assertLocalFirstManifest(manifest).hasCredentialInput, false);
  assert.equal(popup.includes("type=\"password\""), false);
  assert.deepEqual(runtime.credentialFields, []);
  assert.deepEqual(runtime.uploadEndpoints, []);
});

test("injectable content script is a classic script without module syntax", async () => {
  const source = await readFile("apps/chrome-extension/dist/content-script.js", "utf8");

  assert.equal(source.includes("import "), false);
  assert.equal(source.includes("export "), false);
  assert(source.includes("FIGCAPTURE_COLLECT_DOM"));
  assert(source.includes("__figcaptureContentRuntimeState"));
  assert(source.includes("2026-06-15-full-page-v3"));
  assert(source.includes("canvasDataUrl"));
  assert(source.includes("backgroundSize"));
  assert(source.includes("backgroundPosition"));
  assert(source.includes("backgroundRepeat"));
  assert(source.includes("maskComposite"));
  assert(source.includes("webkitMaskComposite"));
});
