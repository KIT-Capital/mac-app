import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { assertDatabaseMapping } from "../../lib/env/database-mapping.mjs";

const require = createRequire(import.meta.url);
const nextBin = join(dirname(require.resolve("next/package.json")), "dist/bin/next");

assertDatabaseMapping(process.env, { role: "startup" });

const nextArgs = process.argv.slice(2);
if (nextArgs.length === 0) {
  console.error(JSON.stringify({ ok: false, errors: ["START_ARGS_REQUIRED"] }));
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
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
