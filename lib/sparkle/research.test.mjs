import test from "node:test";
import assert from "node:assert/strict";
import { researchCatalog } from "./research.mjs";

test("Sparkle without provider keys is unavailable and writes nothing", async () => {
  await assert.rejects(
    () => researchCatalog({ kind: "brand", id: "brand-rolex", query: "Rolex" }, {}),
    { message: "SPARKLE_UNAVAILABLE" },
  );
});

test("Sparkle returns a suggestion payload from mocked adapters", async () => {
  const fetcher = async (url) => {
    const href = String(url);
    if (href.includes("exa.ai")) {
      return {
        ok: true,
        json: async () => ({
          results: [{
            url: "https://example.com/daytona",
            title: "Rolex Daytona 116500LN",
            text: "Asking $28,000 to $32,000 https://cdn.example.com/daytona.jpg",
          }],
        }),
      };
    }
    if (href.includes("firecrawl")) {
      return {
        ok: true,
        json: async () => ({ data: [] }),
      };
    }
    return { ok: false, json: async () => null };
  };
  const suggestion = await researchCatalog(
    { kind: "brand", id: "brand-rolex", query: "Rolex Daytona" },
    { EXA_API_KEY: "test-exa" },
    fetcher,
  );
  assert.equal(suggestion.kind, "brand");
  assert.equal(suggestion.id, "brand-rolex");
  assert.equal(suggestion.models.length > 0, true);
  assert.equal(suggestion.range.typicalLow, 28000);
  assert.equal(suggestion.range.typicalHigh, 32000);
  assert.equal(suggestion.photos[0].license, "unknown");
  assert.ok(suggestion.marketSourceUrls.includes("https://example.com/daytona"));
});
