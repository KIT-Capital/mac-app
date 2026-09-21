import { fetchWithTimeout } from "../fetch-timeout.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function parseExaResults(body) {
  return asList(body?.results).map((row) => ({
    url: String(row?.url ?? ""),
    title: String(row?.title ?? ""),
    text: String(row?.text ?? row?.snippet ?? ""),
  })).filter((row) => row.url || row.title);
}

export async function searchExa(query, apiKey, fetcher = fetch) {
  const response = await fetchWithTimeout(
    "https://api.exa.ai/search",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: 5,
        type: "auto",
        contents: { text: { maxCharacters: 800 } },
      }),
    },
    8_000,
    fetcher,
  );
  if (!response.ok) return [];
  return parseExaResults(await response.json().catch(() => null));
}
