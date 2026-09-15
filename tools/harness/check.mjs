import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requiredDocs = [
  "AGENTS.md", "CLAUDE.md", "docs/README.md", "docs/SYSTEM-GOVERNANCE-RULE.md",
  "docs/architecture.md", "docs/business-logic.md", "docs/api.md",
  "docs/design-system.md", "docs/security.md", "docs/config-and-env-map.md",
];
const allowedFiles = new Set([...requiredDocs, "package.json", "product-os.lock.json", ".claude/settings.json"]);
const limit = 1024 * 1024;

function hasClaudeImport(content) {
  let fence = null;
  let commentDepth = 0;
  for (const line of content.split(/\r?\n/)) {
    if (commentDepth === 0) {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = null;
        continue;
      }
      if (fence) continue;
    }
    // Inspect original lines, never join fragments across removed comments.
    // Nested/malformed comments are conservatively hidden until fully closed.
    if (commentDepth > 0 || line.includes("<!--")) {
      for (const marker of line.matchAll(/<!--|--!?>/g)) {
        commentDepth = marker[0] === "<!--" ? commentDepth + 1 : Math.max(0, commentDepth - 1);
      }
      continue;
    }
    if (/^\s*@(?:\.\/)?AGENTS\.md\s*$/.test(line)) return true;
  }
  return false;
}

/** Static inspection only. Never import, execute, or print target file contents. */
export async function checkHarness(root) {
  const findings = [];
  const add = (id, status, file, message) => findings.push({ id, status, file, message });
  let resolvedRoot;
  try {
    const candidate = path.resolve(root);
    const info = await lstat(candidate);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Invalid root");
    resolvedRoot = await realpath(candidate);
  } catch {
    add("root", "blocked", null, "Project root must be an accessible ordinary directory, not a symlink.");
    return result(findings);
  }

  async function readAllowed(file, required = true) {
    if (!allowedFiles.has(file)) throw new Error("File is not allowlisted");
    let handle;
    try {
      const components = file.split("/");
      let current = resolvedRoot;
      for (let index = 0; index < components.length; index += 1) {
        current = path.join(current, components[index]);
        const info = await lstat(current);
        if (info.isSymbolicLink() || (index < components.length - 1 ? !info.isDirectory() : !info.isFile())) {
          add(`path:${file}`, "blocked", file, "Refusing a symlink or non-regular path; target was not read.");
          return null;
        }
      }
      const canonical = await realpath(current);
      const relative = path.relative(resolvedRoot, canonical);
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
        add(`path:${file}`, "blocked", file, "Refusing a path outside the selected project.");
        return null;
      }
      handle = await open(canonical, "r");
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit) {
        add(`file:${file}`, "blocked", file, "Expected a regular file no larger than 1 MiB.");
        return null;
      }
      // A bounded read also limits a concurrently growing file.
      const buffer = Buffer.alloc(limit + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > limit) {
        add(`file:${file}`, "blocked", file, "File exceeds the 1 MiB inspection limit.");
        return null;
      }
      const content = buffer.subarray(0, bytesRead).toString("utf8");
      if (!content.trim()) {
        add(`file:${file}`, "blocked", file, "Required structure cannot be assessed from an empty file.");
        return null;
      }
      return content;
    } catch (error) {
      if (error.code === "ENOENT") {
        add(`file:${file}`, required ? "blocked" : "warning", file,
          required ? "Required project file is missing." : "Optional editor declaration is absent; installed capabilities remain unverified.");
      } else add(`file:${file}`, "blocked", file, "File could not be inspected safely; no file contents or system error details are emitted.");
      return null;
    } finally {
      if (handle) await handle.close();
    }
  }

  for (const file of requiredDocs) {
    const content = await readAllowed(file);
    if (content === null) continue;
    if (file === "CLAUDE.md" && !hasClaudeImport(content)) {
      add("claude-bridge", "blocked", file, "Claude entry point must import the shared root AGENTS.md; a mention alone is not an import.");
    } else add(`structure:${file}`, "present", file, "Non-empty required file is present; its policy quality and actual editor loading are not verified.");
  }

  async function readJson(file, required = true) {
    const content = await readAllowed(file, required);
    if (content === null) return null;
    try {
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Not an object");
      return parsed;
    } catch {
      add(`json:${file}`, "blocked", file, "Expected a valid JSON object; parser details are withheld to avoid disclosing values.");
      return null;
    }
  }

  const manifest = await readJson("package.json");
  if (manifest) {
    for (const gate of ["lint", "typecheck", "test", "build"]) {
      const command = manifest.scripts?.[gate];
      const placeholder = typeof command !== "string" || !command.trim() ||
        /^(?:true|:|exit(?:\s+\d+)?|echo\s+[^;&|\n]*)\s*$/i.test(command.trim()) ||
        /(?:TODO|not implemented|no test specified)/i.test(command);
      add(`gate:${gate}`, placeholder ? "blocked" : "declared", "package.json", placeholder
        ? `Required ${gate} command is missing or an obvious placeholder.`
        : `${gate} command is declared, not executed or proven effective.`);
    }
    const pinned = typeof manifest.packageManager === "string" && /^[a-z][a-z0-9-]*@\d+\.\d+\.\d+(?:\+[^\s]+)?$/.test(manifest.packageManager);
    add("toolchain", "warning", "package.json", pinned
      ? "Package manager has an exact declaration; installation, integrity and runtime versions remain unverified."
      : "Exact package-manager version is not declared; resolve toolchain pins before reproducible verification.");
  }

  const lock = await readJson("product-os.lock.json");
  if (lock) {
    const fieldsValid = ["productOSVersion", "kitVersion", "rollbackRef"].every((key) => typeof lock[key] === "string" && lock[key].trim()) &&
      typeof lock.sourceManifestSha256 === "string" && /^[a-f0-9]{64}$/i.test(lock.sourceManifestSha256) && Array.isArray(lock.exceptions);
    if (!["proposed", "adopted"].includes(lock.state) || !fieldsValid) {
      add("adoption", "blocked", "product-os.lock.json", "Adoption record needs proposed/adopted state, versions, source digest, exceptions and rollback reference; no values are printed.");
    } else add("adoption", "warning", "product-os.lock.json", lock.state === "proposed"
      ? "Baseline is proposed, not adopted. Do not claim release compliance."
      : "Baseline declares adopted; signature, release trust, compatibility and adoption behavior are not verified by this check.");
  }

  const settings = await readJson(".claude/settings.json", false);
  if (settings) add("editor-plugins", "warning", ".claude/settings.json", "Editor settings are declared; plugin installation, immutable pins, permissions and actual loading in each editor remain unverified.");
  add("runtime", "warning", null, "Static structure only: no tests, services, CI, CodeQL, permissions, reports, backups or production readiness were verified. Optional integrations are not required by this check.");
  return result(findings);
}

function result(findings) {
  return { schemaVersion: 1, mode: "read-only-static", status: findings.some((finding) => finding.status === "blocked") ? "blocked" : "assessment-required", findings };
}

async function runCli() {
  const args = process.argv.slice(2);
  let root;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root" && !root && args[index + 1] && !args[index + 1].startsWith("--")) root = args[++index];
    else if (args[index] === "--json" && !json) json = true;
    else throw new Error("Usage: node tools/harness/check.mjs --root <project-directory> [--json]");
  }
  if (!root) throw new Error("Usage: node tools/harness/check.mjs --root <project-directory> [--json]");
  const assessment = await checkHarness(root);
  if (json) console.log(JSON.stringify(assessment, null, 2));
  else {
    console.log(`Norfolk harness: ${assessment.status} (read-only static assessment)`);
    for (const finding of assessment.findings) console.log(`[${finding.status}] ${finding.file ?? "assessment"}: ${finding.message}`);
  }
  process.exitCode = assessment.status === "blocked" ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runCli(); }
  catch { console.error("Harness check could not complete. Use --root <project-directory> [--json]; no target values are disclosed."); process.exitCode = 2; }
}
