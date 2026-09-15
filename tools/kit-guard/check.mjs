#!/usr/bin/env node
/**
 * kit-guard — the control that does not depend on anyone reading a diff.
 *
 * WHY THIS EXISTS: the equip and tidy skills write changes AND write the
 * plain-English summary the owner approves on. That is circular trust: a wrong
 * or flattering summary is undetectable by the one person in the loop. This
 * check is the machine half — it refuses to let a PR merge if it violates the
 * boundaries, whatever the summary says.
 *
 * Five rules, all fail-closed:
 *   1. BRAND BOUNDARY  — every kit-managed file present in the repo must carry
 *      a sensitivity this org is allowed to hold. Catches both a bad payload
 *      and a standing violation (e.g. a repo transferred between orgs).
 *   2. MANIFEST SCOPE  — a kit/tidy PR may not add or modify kit-managed paths
 *      that the manifest does not claim. Stops silent scope creep.
 *   3. NO DELETIONS    — equip/tidy PRs carry zero deletions. Real removals go
 *      on a `deletions/`-prefixed branch, where they are allowed, so approval
 *      is unambiguous.
 *   4. MARKER COVERAGE — an unmatched path is treated as kit-only, which no org
 *      may hold, so forgetting to mark a new file means it ships nowhere
 *      instead of leaking somewhere.
 *   5. FILE SIZE       — nothing over 5MB. Large assets go in R2 and the repo
 *      stores the URL. Git keeps every version of a binary forever in every
 *      clone, and removing it later reclaims nothing.
 *
 * Usage (CI):  node tools/kit-guard/check.mjs --base origin/main --head HEAD
 * Usage (dry): node tools/kit-guard/check.mjs --audit-only
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const argOf = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const AUDIT_ONLY = args.includes("--audit-only");
const BASE = argOf("--base", "origin/main");
const HEAD = argOf("--head", "HEAD");

// A branch that declares itself a deletions PR may contain deletions.
const BRANCH = argOf("--branch", process.env.GITHUB_HEAD_REF || "");
const DELETIONS_BRANCH = BRANCH.startsWith("deletions/");

// Large files belong in R2, not in git (Ricardo, 2026-07-31). Git stores every
// version of every binary forever, so a 40MB asset committed twice is 80MB in
// the clone of everyone who ever touches the repo, permanently — `git rm` does
// not reclaim it. Enforced rather than remembered.
const MAX_FILE_BYTES = Number(argOf("--max-file-bytes", 5 * 1024 * 1024));

const failures = [];
const notes = [];
const fail = (rule, msg) => failures.push({ rule, msg });

// ── inputs ────────────────────────────────────────────────────────────────
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

if (!existsSync(".kit/manifest.json")) {
  console.log("kit-guard: no .kit/manifest.json — repo is not equipped. Nothing to check.");
  process.exit(0);
}
const manifest = read(".kit/manifest.json");
const payloads = existsSync(".kit/payloads.json") ? read(".kit/payloads.json") : null;
const markers = existsSync(".kit/markers.json") ? read(".kit/markers.json") : null;

if (!payloads || !markers) {
  fail("SETUP", "`.kit/payloads.json` and `.kit/markers.json` must both be present in an equipped repo — equip installs them. Without them this check cannot enforce anything, so it fails rather than passing blind.");
  report();
}

// which org is this repo in, right now?
const repoEnv = process.env.GITHUB_REPOSITORY || "";
const currentOrg = repoEnv.includes("/") ? repoEnv.split("/")[0] : manifest.org || "";
const orgRule = payloads.payloads[currentOrg] || payloads.default;
const allowed = new Set(orgRule.allowedSensitivities || []);

notes.push(`repo org: ${currentOrg || "(unknown)"} → payload class "${orgRule.class}"`);
notes.push(`allowed sensitivities: ${[...allowed].join(", ") || "(none)"}`);
if (manifest.org && currentOrg && manifest.org !== currentOrg) {
  notes.push(`NOTE: manifest was written for org "${manifest.org}" but this repo now lives in "${currentOrg}" — evaluating against the CURRENT org, as it should be.`);
}

// ── glob matching (only the two forms markers.json uses) ──────────────────
function matches(pattern, path) {
  if (pattern.endsWith("/**")) return path.startsWith(pattern.slice(0, -2));
  return pattern === path;
}
function sensitivityOf(path) {
  // most specific (longest) matching pattern wins
  let best = null;
  for (const [pattern, sens] of Object.entries(markers.markers)) {
    if (matches(pattern, path) && (!best || pattern.length > best.pattern.length)) {
      best = { pattern, sens };
    }
  }
  return best ? best.sens : markers.unmatchedDefault || "norfolk-only";
}
const isKitManaged = (path) =>
  Object.keys(markers.markers).some((p) => matches(p, path));

// ── RULE 1 + 4: brand boundary over everything the manifest claims ────────
for (const [path, entry] of Object.entries(manifest.files || {})) {
  const sens = entry.sensitivity || sensitivityOf(path);
  if (!allowed.has(sens)) {
    fail(
      "BRAND-BOUNDARY",
      sens === "kit-only"
        ? `\`${path}\` is marked **kit-only** — it lives in norfolk-kit and is never copied anywhere. The Manual app reads it; repos do not carry it. Remove it.`
        : `\`${path}\` is marked **${sens}**, which a "${orgRule.class}" repo may not hold. ` +
          (manifest.org && manifest.org !== currentOrg
            ? "This repo appears to have moved orgs — the file must be removed."
            : "Equip should never have added it; remove it from this PR."),
    );
  }
  if (!entry.sensitivity && sensitivityOf(path) === (markers.unmatchedDefault || "norfolk-only")) {
    notes.push(`unmarked path defaulted to ${markers.unmatchedDefault}: ${path}`);
  }
}

// ── diff-based rules (skipped in audit mode) ──────────────────────────────
if (!AUDIT_ONLY) {
  // -z is not cosmetic. Without it git QUOTES any path containing a non-ASCII
  // character ("brand/.../OBRA P\303\215A.svg"), the quoted form matches no
  // marker pattern, and the file skips BOTH the scope and boundary checks —
  // a silent bypass for any filename with an accent in it. Found 2026-07-31.
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--name-status", "-z", `${BASE}...${HEAD}`], {
      encoding: "utf8",
    });
  } catch (e) {
    fail("SETUP", `could not compute the diff (${BASE}...${HEAD}): ${e.message}`);
    report();
  }

  const claimed = new Set(Object.keys(manifest.files || {}));
  // .kit/manifest.json itself is written by every equip run
  claimed.add(".kit/manifest.json");

  // -z format: status NUL path NUL, except renames/copies which emit
  // status NUL oldpath NUL newpath NUL. The new path is the one to judge;
  // tidy legitimately moves files, so a rename is not a deletion.
  const tokens = diff.split("\0").filter(Boolean);
  const entries = [];
  for (let i = 0; i < tokens.length; ) {
    const code = tokens[i++][0];
    if (code === "R" || code === "C") {
      i++; // old path
      entries.push({ code, path: tokens[i++] });
    } else {
      entries.push({ code, path: tokens[i++] });
    }
  }

  for (const { code, path } of entries) {
    // RULE 3 — no deletions, unless the branch declares itself a deletions PR.
    // Without this escape hatch the rule is a trap: the design REQUIRES real
    // deletions to arrive in their own PR, and the guard would refuse that PR
    // too, so nothing could ever be removed. The branch name is the declaration
    // of intent — it is visible in the PR title area before anyone clicks merge.
    if (code === "D") {
      if (!DELETIONS_BRANCH) {
        fail(
          "NO-DELETIONS",
          `\`${path}\` is deleted in this PR. Equip and tidy PRs carry zero deletions — put removals on a \`deletions/\`-prefixed branch so the approval is unambiguous.`,
        );
      }
      continue;
    }

    // RULE 2 — no kit-managed writes the manifest does not claim
    if ((code === "A" || code === "M" || code === "R") && isKitManaged(path) && !claimed.has(path)) {
      fail(
        "MANIFEST-SCOPE",
        `\`${path}\` is a kit-managed path but is not listed in \`.kit/manifest.json\`. Either equip should claim it, or it does not belong in this PR.`,
      );
    }

    // RULE 5 — large files belong in R2, not git. Applies to EVERY added file,
    // kit-managed or not: git keeps every version of a binary forever in every
    // clone, and removing it later does not reclaim the space.
    if ((code === "A" || code === "M") && existsSync(path)) {
      const bytes = statSync(path).size;
      if (bytes > MAX_FILE_BYTES) {
        const mb = (n) => (n / 1024 / 1024).toFixed(1);
        fail(
          "FILE-SIZE",
          `\`${path}\` is ${mb(bytes)}MB, over the ${mb(MAX_FILE_BYTES)}MB limit. Large files go in R2 and the repo stores the URL. Git keeps every version forever in every clone, and \`git rm\` later does not reclaim it.`,
        );
      }
    }

    // RULE 1 (again, on the diff) — catches files added outside the manifest path too
    if ((code === "A" || code === "M") && isKitManaged(path)) {
      const sens = sensitivityOf(path);
      if (!allowed.has(sens)) {
        fail(
          "BRAND-BOUNDARY",
          sens === "kit-only"
            ? `\`${path}\` is marked **kit-only** — it lives in norfolk-kit and is never copied anywhere. The Manual app reads it; repos do not carry it.`
            : `\`${path}\` (marked **${sens}**) is being written into a "${orgRule.class}" repo, which may not hold it.`,
        );
      }
    }
  }
}

report();

// ── output ────────────────────────────────────────────────────────────────
function report() {
  const uniq = [...new Map(failures.map((f) => [f.rule + f.msg, f])).values()];
  console.log("## kit-guard\n");
  notes.forEach((n) => console.log(`- ${n}`));
  console.log("");

  if (uniq.length === 0) {
    console.log("✅ **Passed.** Boundaries intact, no out-of-manifest writes, no deletions.");
    process.exit(0);
  }

  console.log(`❌ **${uniq.length} violation${uniq.length === 1 ? "" : "s"} — this PR must not merge.**\n`);
  for (const rule of ["BRAND-BOUNDARY", "FILE-SIZE", "MANIFEST-SCOPE", "NO-DELETIONS", "SETUP"]) {
    const hits = uniq.filter((f) => f.rule === rule);
    if (!hits.length) continue;
    console.log(`### ${rule}`);
    hits.forEach((h) => console.log(`- ${h.msg}`));
    console.log("");
  }
  console.log(
    "> This check exists because the same agent writes both the change and the summary you read. " +
      "It does not care what the summary says.",
  );
  process.exit(1);
}
