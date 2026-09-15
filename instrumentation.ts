export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { assertDatabaseMapping } = await import("./lib/env/database-mapping.mjs");
  assertDatabaseMapping(process.env, { role: "startup" });
}
