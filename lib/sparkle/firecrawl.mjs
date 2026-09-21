import { fetchWithTimeout } from "../fetch-timeout.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function parseFirecrawlResults(body) {
  const rows = asList(body?.data ?? body?.web);
  return rows.map((row) => ({
    url: String(row?.url ?? ""),
    title: String(row?.title ?? ""),
    text: String(row?.description ?? row?.markdown ?? row?.content ?? ""),
  })).filter((row) => row.url || row.title);
}

export async function searchFirecrawl(query, apiKey, fetcher = fetch) {
  const response = await fetchWithTimeout(
    "https://api.firecrawl.dev/v1/search",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: 5 }),
    },
    8_000,
    fetcher,
  );
  if (!response.ok) return [];
  return parseFirecrawlResults(await response.json().catch(() => null));
}
