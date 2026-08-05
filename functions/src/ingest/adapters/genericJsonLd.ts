import type { NormalizedEvent } from "@recess/shared";
import type { AdapterResult } from "./types";

/**
 * Catch-all adapter for sites we don't have a dedicated scraper for.
 * Fetches the URL and extracts schema.org Event objects from JSON-LD.
 */
export async function ingestGenericJsonLd(options: {
  url: string;
  sourceKey?: string;
}): Promise<AdapterResult> {
  const diagnostics: string[] = [];
  const events: NormalizedEvent[] = [];
  const platform = "manual"; // stored as manual/generic provenance
  const sourceKey = options.sourceKey || "generic";

  try {
    const res = await fetch(options.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    diagnostics.push(`fetch status=${res.status} len=${html.length}`);
    if (!res.ok) {
      return {
        events: [],
        diagnostics: [...diagnostics, `HTTP ${res.status}`],
      };
    }

    const blocks = [
      ...html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      ),
    ];
    diagnostics.push(`jsonld blocks=${blocks.length}`);

    const seen = new Set<string>();
    for (const block of blocks) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(block[1]);
      } catch {
        continue;
      }
      const nodes = flattenLd(parsed);
      for (const node of nodes) {
        if (!isEventNode(node)) continue;
        const mapped = mapEvent(node, options.url, sourceKey, platform);
        if (!mapped || seen.has(mapped.externalId)) continue;
        seen.add(mapped.externalId);
        events.push(mapped);
      }
    }

    diagnostics.push(`normalized=${events.length}`);
  } catch (err) {
    diagnostics.push(
      `error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { events, diagnostics };
}

function flattenLd(node: unknown): Record<string, unknown>[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flattenLd);
  if (typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown>[] = [obj];
  if (Array.isArray(obj["@graph"])) out.push(...obj["@graph"].flatMap(flattenLd));
  if (Array.isArray(obj.itemListElement)) {
    for (const el of obj.itemListElement) {
      if (el && typeof el === "object") {
        const item = (el as { item?: unknown }).item ?? el;
        out.push(...flattenLd(item));
      }
    }
  }
  return out;
}

function isEventNode(node: Record<string, unknown>): boolean {
  const t = node["@type"];
  if (t === "Event") return true;
  if (Array.isArray(t) && t.includes("Event")) return true;
  return Boolean(node.startDate && node.name);
}

function mapEvent(
  node: Record<string, unknown>,
  sourceUrl: string,
  sourceKey: string,
  platform: "manual"
): NormalizedEvent | null {
  const name = String(node.name || "").trim();
  const startDate = node.startDate ? new Date(String(node.startDate)) : null;
  if (!name || !startDate || Number.isNaN(startDate.getTime())) return null;

  const location = (node.location || {}) as Record<string, unknown>;
  const address = (location.address || {}) as Record<string, unknown>;
  const geo = (location.geo || {}) as Record<string, unknown>;
  const url = String(node.url || sourceUrl);
  const idBase =
    String(node["@id"] || url || name).slice(0, 120) +
    "_" +
    startDate.toISOString().slice(0, 16);

  return {
    externalId: `${sourceKey}_${hash(idBase)}`,
    platform,
    title: name,
    organization: String(
      (node.organizer as { name?: string } | undefined)?.name ||
        location.name ||
        "Listing"
    ),
    eventType: "other",
    ageGroup: { min: 0, max: 18, label: "All ages" },
    description: String(node.description || "").slice(0, 4000),
    links: { primary: url, source: sourceUrl },
    startsAt: startDate,
    endsAt: node.endDate ? new Date(String(node.endDate)) : undefined,
    timezone: "America/New_York",
    location: {
      name: String(location.name || address.addressLocality || "Unknown"),
      address: String(address.streetAddress || ""),
      city: String(address.addressLocality || ""),
      region: String(address.addressRegion || ""),
      country: String(address.addressCountry || "US"),
      lat: Number(geo.latitude || 40.7128),
      lng: Number(geo.longitude || -74.006),
    },
  };
}

function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
