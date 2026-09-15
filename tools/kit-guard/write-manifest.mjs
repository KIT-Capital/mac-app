#!/usr/bin/env node
/**
 * Writes .kit/manifest.json by hashing what is actually on disk.
 *
 * WHY A SCRIPT AND NOT THE AGENT: the manifest is the claim kit-guard checks
 * the diff against. If the agent hand-wrote it, the guard would be comparing
 * the agent's claim to the agent's claim — no independent check at all. This
 * reads the real bytes, so a file the agent wrote but "forgot" to list still
 * shows up as an unclaimed write.
 *
 * Usage:
 *   node tools/kit-guard/write-manifest.mjs \
 *     --kit-sha <sha> --org <org> --files <newline-or-comma-separated paths>
 *
 * Supply only the reviewed installed-file list. Marker matches describe
 * sensitivity, not ownership; discovery cannot distinguish FOREIGN files.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const argOf = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const kitSha = argOf("--kit-sha");
const org = argOf("--org");
const discover = args.includes("--discover");

if (discover) {
  console.error("error: --discover is unsafe for existing project ownership. Pass an explicit reviewed --files list of installed Kit-managed files; leave FOREIGN files unclaimed.");
  process.exit(2);
}

if (!kitSha || !org) {
  console.error("error: --kit-sha and --org are both required.");
  process.exit(2);
}
for (const f of [".kit/markers.json", ".kit/payloads.json"]) {
  if (!existsSync(f)) {
    console.error(`error: ${f} is missing — equip must install it before writing the manifest.`);
    process.exit(2);
  }
}

const markers = JSON.parse(readFileSync(".kit/markers.json", "utf8"));
const payloads = JSON.parse(readFileSync(".kit/payloads.json", "utf8"));
const orgRule = payloads.payloads[org] || payloads.default;
const allowed = new Set(orgRule.allowedSensitivities || []);

const matches = (pattern, path) =>
  pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : pattern === path;

function sensitivityOf(path) {
  let best = null;
  for (const [pattern, sens] of Object.entries(markers.markers)) {
    if (matches(pattern, path) && (!best || pattern.length > best.pattern.length)) {
      best = { pattern, sens };
    }
  }
  return best ? best.sens : markers.unmatchedDefault || "norfolk-only";
}

// Selection is reviewed separately; hashing bytes does not prove ownership.
const paths = [...new Set(argOf("--files", "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];

if (!paths.length) {
  console.error("error: no files to record. Pass an explicit reviewed --files list.");
  process.exit(2);
}

const files = {};
const refused = [];
for (const p of paths.sort()) {
  if (p.toLowerCase() === ".kit/manifest.json" || /[\\:]/.test(p)
    || [...p].some((character) => character.charCodeAt(0) < 32)
    || p.split("/").some((part) => ["", ".", "..", ".git"].includes(part.toLowerCase()) || /[. ]$/.test(part))) {
    console.error("error: selection must contain canonical repository-relative paths, excluding Git metadata and the manifest itself.");
    process.exit(2);
  }
  if (!existsSync(p)) {
    console.error(`error: ${p} does not exist on disk — refusing to claim a file that isn't there.`);
    process.exit(2);
  }
  const sens = sensitivityOf(p);
  if (!allowed.has(sens)) {
    // Do not record it — and say so. A manifest that quietly omits a
    // boundary-crossing file would let kit-guard's scope rule catch it as an
    // unclaimed write, but naming it here is the clearer failure.
    refused.push({ path: p, sens });
    continue;
  }
  files[p] = {
    sha256: createHash("sha256").update(readFileSync(p)).digest("hex"),
    sensitivity: sens,
  };
}

if (refused.length) {
  console.error(
    `\nerror: ${refused.length} file(s) are on disk but a "${orgRule.class}" repo may not hold them:`,
  );
  refused.forEach((r) => console.error(`  ${r.path}  (${r.sens})`));
  console.error("\nStop and report the rejected selection. Do not delete pre-existing files; removal requires separate approval.");
  process.exit(1);
}

const manifest = {
  kitRepo: "Norfolk-Group/norfolk-kit",
  kitSha,
  equippedAt: new Date().toISOString().slice(0, 10),
  org,
  payloadClass: orgRule.class,
  files,
};

writeFileSync(".kit/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote .kit/manifest.json — ${Object.keys(files).length} files, payload class "${orgRule.class}"`);
