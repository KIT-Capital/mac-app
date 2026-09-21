import { searchApify } from "./apify.mjs";
import { searchExa } from "./exa.mjs";
import { searchFirecrawl } from "./firecrawl.mjs";

const MONEY = /\$[\d,]+(?:\.\d+)?/g;
const IMAGE = /https?:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?\S*)?/gi;

function sparkleKeys(env = process.env) {
  return {
    exa: String(env.EXA_API_KEY ?? "").trim(),
    firecrawl: String(env.FIRECRAWL_API_KEY ?? "").trim(),
    apify: String(env.APIFY_TOKEN ?? "").trim(),
  };
}

export function sparkleConfigured(env = process.env) {
  const keys = sparkleKeys(env);
  return Boolean(keys.exa || keys.firecrawl || keys.apify);
}

function dollarsFromText(text) {
  const amounts = [...String(text).matchAll(MONEY)]
    .map((match) => Number(match[0].replace(/[$,]/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!amounts.length) return null;
  return {
    typicalLow: Math.min(...amounts),
    typicalHigh: Math.max(...amounts),
  };
}

function photosFromText(text, url) {
  const found = [...String(text).matchAll(IMAGE)].map((match) => match[0]);
  if (found.length) {
    return found.slice(0, 3).map((sourceUrl) => ({
      sourceUrl,
      license: "unknown",
      attribution: "",
    }));
  }
  if (/^https?:\/\//.test(url)) {
    return [{ sourceUrl: url, license: "unknown", attribution: "" }];
  }
  return [];
}

function modelFromTitle(title) {
  const cleaned = String(title).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(" — ")[0].split(" | ")[0];
  return {
    name: parts.slice(0, 80),
    reference: parts.slice(0, 40),
  };
}

async function safeSearch(run) {
  try {
    return await run();
  } catch {
    return [];
  }
}

/**
 * Suggestion only. Callers persist nothing until the appraiser saves a row.
 */
export async function researchCatalog(input, env = process.env, fetcher = fetch) {
  const keys = sparkleKeys(env);
  if (!keys.exa && !keys.firecrawl && !keys.apify) {
    throw new Error("SPARKLE_UNAVAILABLE");
  }
  const kind = input.kind === "model" ? "model" : "brand";
  const query = String(input.query ?? "").trim();
  if (!query) throw new Error("CATALOG_ENTRY_INVALID");
  const hits = [];
  if (keys.exa) hits.push(...await safeSearch(() => searchExa(query, keys.exa, fetcher)));
  if (keys.firecrawl) hits.push(...await safeSearch(() => searchFirecrawl(query, keys.firecrawl, fetcher)));
  if (keys.apify) hits.push(...await safeSearch(() => searchApify(query, keys.apify, fetcher)));
  const marketSourceUrls = [...new Set(hits.map((hit) => hit.url).filter(Boolean))];
  const combinedText = hits.map((hit) => `${hit.title} ${hit.text}`).join("\n");
  const range = dollarsFromText(combinedText);
  const photos = hits.flatMap((hit) => photosFromText(`${hit.title} ${hit.text}`, hit.url)).slice(0, 5);
  const models = kind === "brand"
    ? hits.map((hit) => modelFromTitle(hit.title)).filter(Boolean).slice(0, 5)
    : [];
  return {
    kind,
    id: String(input.id ?? ""),
    query,
    models: models.map((model, index) => ({
      name: model.name,
      reference: model.reference,
      typicalLow: range?.typicalLow ?? 0,
      typicalHigh: range?.typicalHigh ?? 0,
      photoSourceUrl: photos[index]?.sourceUrl ?? "",
      photoLicense: photos[index]?.license ?? "unknown",
      photoAttribution: photos[index]?.attribution ?? "",
    })),
    range: range ?? { typicalLow: 0, typicalHigh: 0 },
    photos,
    marketSourceUrls,
    marketRetrievedOn: new Date().toISOString().slice(0, 10),
  };
}
