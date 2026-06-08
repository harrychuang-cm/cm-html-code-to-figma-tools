import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CAPTURE_ACTIVE_TAB_MESSAGE,
  assertLocalFirstManifest,
  describeBackgroundRuntime,
  handleCaptureActiveTab
} from "../dist/background.js";

test("extension shell is local-first and uses the expected permissions", async () => {
  const manifest = JSON.parse(await readFile("apps/chrome-extension/manifest.json", "utf8"));
  const runtime = describeBackgroundRuntime();

  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "downloads"]);
  assert.deepEqual(runtime.uploadEndpoints, []);
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

  const response = await handleCaptureActiveTab(chromeApi);

  assert.equal(CAPTURE_ACTIVE_TAB_MESSAGE, "FIGCAPTURE_CAPTURE_ACTIVE_TAB");
  assert.deepEqual(calls, [{ active: true, currentWindow: true }]);
  assert.equal(response.localFirst, true);
  assert.equal(response.tab.id, 42);
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
