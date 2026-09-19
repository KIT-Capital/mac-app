import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("global button press feedback", () => {
  it("gives enabled native buttons a tactile pressed state", () => {
    assert.match(
      css,
      /button:not\(:disabled\):active\s*\{[^}]*translateY\(1px\)[^}]*scale\(0\.98\)/s,
    );
    assert.match(
      css,
      /button:not\(:disabled\):active\s*\{[^}]*filter:\s*brightness\(0\.92\)/s,
    );
    assert.match(
      css,
      /button:not\(:disabled\):active\s*\{[^}]*--tw-shadow:\s*0 1px 2px/s,
    );
  });

  it("keeps disabled buttons still and honors reduced motion", () => {
    assert.doesNotMatch(css, /button:active\s*\{/);
    assert.match(
      css,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[\s\S]*button:not\(:disabled\)[^{]*\{[^}]*transition-duration:\s*0ms/s,
    );
  });
});
