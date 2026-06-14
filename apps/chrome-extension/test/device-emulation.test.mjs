import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeviceEmulationSession,
  deviceMetricsForWidth,
  EMULATION_FAILED
} from "../dist/device-emulation.js";

function createMockChrome(calls) {
  return {
    runtime: {},
    debugger: {
      attach(target, version, callback) {
        calls.push({ method: "attach", target, version });
        callback();
      },
      sendCommand(target, method, params, callback) {
        calls.push({ method, target, params });
        callback({});
      },
      detach(target, callback) {
        calls.push({ method: "detach", target });
        callback();
      }
    }
  };
}

test("deviceMetricsForWidth emulates mobile for narrow widths only", () => {
  assert.equal(deviceMetricsForWidth(375).width, 375);
  assert.equal(deviceMetricsForWidth(375).mobile, true);
  assert.equal(deviceMetricsForWidth(768).mobile, true);
  assert.equal(deviceMetricsForWidth(1440).mobile, false);
});

test("device emulation session attaches, sets metrics, clears, and detaches in order", async () => {
  const calls = [];
  const chromeApi = createMockChrome(calls);
  const session = createDeviceEmulationSession(chromeApi, 42);

  await session.attach();
  await session.setWidth(375);
  await session.clear();
  await session.detach();

  assert.deepEqual(
    calls.map((call) => call.method),
    ["attach", "Emulation.setDeviceMetricsOverride", "Emulation.clearDeviceMetricsOverride", "detach"]
  );
  assert.equal(calls[0].target.tabId, 42);
  assert.equal(calls[1].params.width, 375);
  assert.equal(session.isAttached(), false);
});

test("device emulation session reports a runtime error when the debugger API is missing", async () => {
  const session = createDeviceEmulationSession({ runtime: {} }, 1);
  await assert.rejects(() => session.attach(), (error) => {
    assert.equal(error.category, EMULATION_FAILED);
    return true;
  });
});

test("device emulation clear and detach are no-ops before attach", async () => {
  const calls = [];
  const chromeApi = createMockChrome(calls);
  const session = createDeviceEmulationSession(chromeApi, 7);

  await session.clear();
  await session.detach();

  assert.deepEqual(calls, []);
});
