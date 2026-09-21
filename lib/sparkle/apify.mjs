import { fetchWithTimeout } from "../fetch-timeout.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function parseApifyResults(body) {
  return asList(body).map((row) => ({
    url: String(row?.url ?? row?.sourceUrl ?? ""),
    title: String(row?.title ?? row?.pageTitle ?? ""),
    text: String(row?.text ?? row?.markdown ?? row?.price ?? ""),
  })).filter((row) => row.url || row.title);
}

export async function searchApify(query, token, fetcher = fetch) {
  const response = await fetchWithTimeout(
    "https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?timeout=8",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        startUrls: [{ url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }],
        maxCrawlPages: 1,
      }),
    },
    8_000,
    fetcher,
  );
  if (!response.ok) return [];
  return parseApifyResults(await response.json().catch(() => null));
}
