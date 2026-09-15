import { assertDatabaseMapping } from "../../lib/env/database-mapping.mjs";

const role = process.argv.includes("--migrate")
  ? "migrate"
  : process.argv.includes("--app")
    ? "app"
    : process.argv.includes("--startup")
      ? "startup"
      : "guard";

const result = assertDatabaseMapping(process.env, { role });

console.log(
  JSON.stringify({
    ok: true,
    role,
    idle: result.idle ?? false,
    appEnv: result.appEnv,
    neonBranch: result.neonBranch,
    endpointId: result.endpointId,
    errors: [],
  }),
);
