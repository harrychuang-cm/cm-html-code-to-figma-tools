import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--test", "test/e2e-smoke.test.mjs"], {
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
