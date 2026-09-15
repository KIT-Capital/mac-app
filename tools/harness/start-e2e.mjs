import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

delete process.env.RESEND_API_KEY;

const start = fileURLToPath(new URL("./start-mac-app.mjs", import.meta.url));
const child = spawn(process.execPath, [start, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});
