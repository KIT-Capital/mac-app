import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BRAND_PRESETS, MAC, brandFromSettings, resolveBrandPreset } from "./theme.ts";

const FORBIDDEN = /\b(loan|lender|interest|financing|collateral|borrower)\b/i;
const MAC_HEX = /#(?:FCB040|0E2A44|E8D5C0)/i;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

describe("brand presets", () => {
  it("keeps Mechanical Art Capital as the default Logo-FF palette", () => {
    const mac = resolveBrandPreset("mac");
    assert.equal(mac.id, "mac");
    assert.equal(mac.companyName, "Mechanical Art Capital");
    assert.equal(mac.palette.primary, MAC.navy);
    assert.equal(mac.palette.accent, MAC.gold);
    assert.equal(mac.palette.soft, MAC.champagne);
    assert.match(mac.wordmark, /logo-ff/);
    assert.equal(brandFromSettings({}).id, "mac");
  });

  it("samples MB&F from the Limus screens without claiming endorsement", () => {
    const mbf = resolveBrandPreset("mbf");
    assert.equal(mbf.id, "mbf");
    assert.equal(mbf.companyName, "MB&F");
    assert.equal(mbf.paletteNote, "sampled — confirm with MB&F");
    assert.notEqual(mbf.palette.primary, MAC.navy);
    assert.notEqual(mbf.palette.accent, MAC.gold);
    assert.match(mbf.wordmark, /mbf/);
    assert.doesNotMatch(mbf.companyName, /endorse/i);
  });

  it("refuses an unknown preset id", () => {
    assert.equal(resolveBrandPreset("other"), undefined);
  });

  it("keeps splash copy free of forbidden credit words under both presets", () => {
    for (const preset of Object.values(BRAND_PRESETS)) {
      assert.doesNotMatch(preset.splash, FORBIDDEN);
    }
  });

  it("has no MAC palette hex left in app or component screens", async () => {
    const files = [
      ...await walk(join(ROOT, "app")),
      ...await walk(join(ROOT, "components")),
    ].filter((path) => /\.(tsx|ts|css|mjs)$/.test(path));
    const hits = [];
    for (const path of files) {
      const text = await readFile(path, "utf8");
      if (MAC_HEX.test(text)) hits.push(path.slice(ROOT.length + 1));
    }
    assert.deepEqual(hits, []);
  });
});
