import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("agreement document import boundary", () => {
  it("does not import object-store remove on the document path", () => {
    const files = [
      "lib/db/agreement-documents.ts",
      "app/api/agreement-documents/route.ts",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /store\.remove|\.remove\(/);
    }
  });
});
