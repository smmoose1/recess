import * as cheerio from "cheerio";
import type { NormalizedEvent } from "@recess/shared";
import type { AdapterResult } from "./types";

type Region = {
  id: number;
  slug: string;
  label: string;
  defaultCity: string;
  defaultRegion: string;
  defaultLat: number;
  defaultLng: number;
};

const REGION_DEFAULTS: Record<string, Omit<Region, "id" | "slug" | "label">> = {
  "new-york-city": {
    defaultCity: "New York",
    defaultRegion: "NY",
    defaultLat: 40.7128,
    defaultLng: -74.006,
  },
  westchester: {
    defaultCity: "White Plains",
    defaultRegion: "NY",
    defaultLat: 41.034,
    defaultLng: -73.7629,
  },
  connecticut: {
    defaultCity: "Connecticut",
    defaultRegion: "CT",
    defaultLat: 41.3083,
    defaultLng: -72.9279,
  },
};

type ListCard = {
  nid: string;
  title: string;
  href: string;
  venue?: string;
  startsAt?: Date;
  endsAt?: Date;
  tags: string[];
  day: string;
  region: Region;
};

/** Parse Mommy Poppins calendar URL → region info */
export function parseMommyPoppinsUrl(url: string): Region | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/events\/(\d+)\/([a-z0-9-]+)\//i);
    if (!m) return null;
    const id = Number(m[1]);
    const slug = m[2].toLowerCase();
    const defaults = REGION_DEFAULTS[slug] || {
      defaultCity: slug.replace(/-/g, " "),
      defaultRegion: "NY",
      defaultLat: 40.7128,
      defaultLng: -74.006,
    };
    return { id, slug, label: slug, ...defaults };
  } catch {
    return null;
  }
}

function dayUrl(region: Region, day: string): string {
  return `https://mommypoppins.com/events/${region.id}/${region.slug}/all/tag/all/age/${day}/all/all/type/0/deals/0/near/all`;
}

function eachDay(days: number): string[] {
  const out: string[] = [];
  const start = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Mommy Poppins ${res.status} for ${url}`);
  return res.text();
}

function parseList(html: string, region: Region, day: string): ListCard[] {
  const $ = cheerio.load(html);
  const cards: ListCard[] = [];

  $(".views-row").each((_, el) => {
    const root = $(el);
    const nid = root.attr("data-analytics-nid") || "";
    const title = (root.attr("data-analytics-title") || "")
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&");
    if (!nid || !title) return;

    let href =
      root.find('a[href*="/event/"]').first().attr("href") ||
      root.find("a[href]").first().attr("href") ||
      "";
    if (!href) return;
    if (href.startsWith("/")) href = `https://mommypoppins.com${href}`;

    const venue = root.find(".views-field-title p").first().text().trim();
    const tags = root
      .find(".tags-and-deal li")
      .map((__, li) => $(li).text().trim())
      .get()
      .filter(Boolean);

    const times = root.find("time[datetime]");
    let startsAt: Date | undefined;
    let endsAt: Date | undefined;
    if (times.length > 0) {
      const startRaw = times.eq(0).attr("datetime");
      if (startRaw) startsAt = new Date(startRaw);
      if (times.length > 1) {
        const endRaw = times.eq(1).attr("datetime");
        if (endRaw) endsAt = new Date(endRaw);
      }
    }
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      startsAt = new Date(`${day}T16:00:00.000Z`);
    }

    cards.push({
      nid,
      title,
      href,
      venue: venue || undefined,
      startsAt,
      endsAt,
      tags,
      day,
      region,
    });
  });

  return cards;
}

function mapEventType(tags: string[]): string {
  const joined = tags.join(" ").toLowerCase();
  if (joined.includes("camp")) return "camp";
  if (joined.includes("class") || joined.includes("workshop")) return "class";
  if (joined.includes("park") || joined.includes("outdoor")) return "outdoors";
  if (joined.includes("museum")) return "museum";
  if (joined.includes("show") || joined.includes("exhibit")) return "show";
  if (joined.includes("sport")) return "sports";
  if (joined.includes("party")) return "party";
  return "other";
}

function cityCoords(
  city: string,
  region: Region
): { lat: number; lng: number } {
  const key = city.toLowerCase();
  const map: Record<string, { lat: number; lng: number }> = {
    brooklyn: { lat: 40.6782, lng: -73.9442 },
    manhattan: { lat: 40.7831, lng: -73.9712 },
    queens: { lat: 40.7282, lng: -73.7949 },
    bronx: { lat: 40.8448, lng: -73.8648 },
    "new york": { lat: 40.7128, lng: -74.006 },
    "white plains": { lat: 41.034, lng: -73.7629 },
    yonkers: { lat: 40.9312, lng: -73.8988 },
    scarsdale: { lat: 40.942, lng: -73.807 },
    bronxville: { lat: 40.9382, lng: -73.8321 },
    chappaqua: { lat: 41.1595, lng: -73.7649 },
    stamford: { lat: 41.0534, lng: -73.5387 },
    greenwich: { lat: 41.0262, lng: -73.6282 },
    "new haven": { lat: 41.3083, lng: -72.9279 },
  };
  return map[key] || { lat: region.defaultLat, lng: region.defaultLng };
}

function parseAge(html: string): { min: number; max: number; label: string } {
  const ageMatch =
    html.match(/Age:\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i) ||
    html.match(/>\s*Ages?\s*([^<]{1,40})</i);
  const raw = (ageMatch?.[1] || "All ages").trim();
  const range = raw.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]), label: raw };
  }
  if (/all\s*ages/i.test(raw)) return { min: 0, max: 18, label: "All ages" };
  return { min: 0, max: 18, label: raw || "All ages" };
}

function cardToNormalized(
  card: ListCard,
  extras?: {
    description?: string;
    ageGroup?: { min: number; max: number; label: string };
    organization?: string;
    address?: string;
    city?: string;
    tickets?: string;
  }
): NormalizedEvent {
  const city = extras?.city || card.region.defaultCity;
  const geo = cityCoords(city, card.region);
  return {
    externalId: `${card.nid}_${card.day}`,
    platform: "mommy_poppins",
    title: card.title,
    organization:
      extras?.organization || card.venue || "Mommy Poppins listing",
    eventType: mapEventType(card.tags),
    ageGroup: extras?.ageGroup || { min: 0, max: 18, label: "All ages" },
    description: extras?.description || "",
    links: {
      primary: extras?.tickets || card.href,
      source: card.href,
      tickets: extras?.tickets,
    },
    startsAt: card.startsAt!,
    endsAt: card.endsAt,
    timezone: "America/New_York",
    location: {
      name: card.venue || city,
      address: extras?.address || "",
      city,
      region: card.region.defaultRegion,
      country: "US",
      lat: geo.lat,
      lng: geo.lng,
    },
  };
}

async function enrichFromDetail(card: ListCard): Promise<NormalizedEvent> {
  try {
    const html = await fetchText(card.href);
    const ageGroup = parseAge(html);
    const ldMatch = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i
    );
    if (!ldMatch) return cardToNormalized(card, { ageGroup });
    let graph: unknown;
    try {
      graph = JSON.parse(ldMatch[1]);
    } catch {
      return cardToNormalized(card, { ageGroup });
    }
    const nodes = Array.isArray((graph as { "@graph"?: unknown[] })["@graph"])
      ? (graph as { "@graph": Record<string, unknown>[] })["@graph"]
      : [graph as Record<string, unknown>];
    const event = nodes.find((n) => n?.["@type"] === "Event");
    if (!event) return cardToNormalized(card, { ageGroup });

    const location = (event.location || {}) as Record<string, unknown>;
    const address = (location.address || {}) as Record<string, unknown>;
    const offers = (event.offers || {}) as Record<string, unknown>;
    if (event.startDate) {
      const start = new Date(String(event.startDate));
      if (!Number.isNaN(start.getTime())) card.startsAt = start;
    }
    if (event.endDate) {
      const end = new Date(String(event.endDate));
      if (!Number.isNaN(end.getTime())) card.endsAt = end;
    }

    return cardToNormalized(card, {
      description: String(event.description || ""),
      ageGroup,
      organization: String(
        location.name || card.venue || "Mommy Poppins listing"
      ),
      address: String(address.streetAddress || ""),
      city: String(address.addressLocality || card.region.defaultCity),
      tickets: offers.url ? String(offers.url) : undefined,
    });
  } catch {
    return cardToNormalized(card);
  }
}

export async function ingestMommyPoppins(options: {
  url: string;
  days?: number;
  maxDetails?: number;
  enrichDetails?: boolean;
}): Promise<AdapterResult> {
  const days = options.days ?? 30;
  const enrichDetails = options.enrichDetails ?? true;
  const maxDetails = options.maxDetails ?? 120;
  const diagnostics: string[] = [];

  const region = parseMommyPoppinsUrl(options.url);
  if (!region) {
    return {
      events: [],
      diagnostics: [
        `Could not parse Mommy Poppins region from URL: ${options.url}`,
        "Expected /events/{id}/{slug}/…",
      ],
    };
  }

  diagnostics.push(
    `region id=${region.id} slug=${region.slug} url=${options.url}`
  );

  const dayList = eachDay(days);
  diagnostics.push(
    `walking ${dayList.length} days (${dayList[0]} → ${dayList[dayList.length - 1]})`
  );

  const cards: ListCard[] = [];
  for (const day of dayList) {
    const url = dayUrl(region, day);
    try {
      const html = await fetchText(url);
      const parsed = parseList(html, region, day);
      cards.push(...parsed);
      if (parsed.length > 0) {
        diagnostics.push(`list ${day} cards=${parsed.length}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      diagnostics.push(
        `list ${day} error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const unique = new Map<string, ListCard>();
  for (const card of cards) unique.set(`${card.nid}_${card.day}`, card);
  diagnostics.push(`unique cards=${unique.size} (raw=${cards.length})`);

  const out: NormalizedEvent[] = [];
  let enriched = 0;
  for (const card of unique.values()) {
    if (enrichDetails && enriched < maxDetails) {
      out.push(await enrichFromDetail(card));
      enriched += 1;
      await new Promise((r) => setTimeout(r, enriched % 10 === 0 ? 200 : 100));
    } else {
      out.push(cardToNormalized(card));
    }
  }

  diagnostics.push(
    `normalized=${out.length} enrichedDetails=${enriched} listOnly=${out.length - enriched}`
  );
  return { events: out, diagnostics };
}
