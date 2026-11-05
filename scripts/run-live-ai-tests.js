import { spawn } from "node:child_process";

const vitest = process.platform === "win32"
  ? "node_modules/.bin/vitest.cmd"
  : "node_modules/.bin/vitest";

const child = spawn(
  vitest,
  ["run", "--config", "vitest.config.js", "server/services/extractor.integration.test.js"],
  {
    env: { ...process.env, RUN_LIVE_AI: "1" },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
