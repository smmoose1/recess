import type { NormalizedEvent } from "@recess/shared";
import type { AdapterResult } from "./types";

const SEARCH_URL = "https://www.eventbrite.com/api/v3/destination/search/";
const DEFAULT_WARM_URL = "https://www.eventbrite.com/d/ny--new-york/kids/";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type EbResult = {
  id?: string;
  eventbrite_event_id?: string;
  name?: string;
  summary?: string;
  full_description?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  timezone?: string;
  url?: string;
  primary_venue?: {
    name?: string;
    address?: {
      city?: string;
      region?: string;
      country?: string;
      address_1?: string;
      latitude?: string;
      longitude?: string;
    };
  };
  primary_organizer?: { name?: string };
  tags?: { display_name?: string }[];
};

function mapEventType(tags: EbResult["tags"]): string {
  const names = (tags || []).map((t) => t.display_name || "").join(" ").toLowerCase();
  if (names.includes("class") || names.includes("workshop")) return "class";
  if (names.includes("sport")) return "sports";
  if (names.includes("music") || names.includes("film") || names.includes("performance"))
    return "show";
  if (names.includes("camp")) return "camp";
  return "other";
}

function parseLocalDate(date: string, time: string | undefined): Date {
  // Eventbrite returns wall-clock local date/time.
  const t = (time || "12:00").slice(0, 5);
  const d = new Date(`${date}T${t}:00`);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(`${date}T12:00:00Z`);
}

function toNormalized(raw: EbResult): NormalizedEvent | null {
  const id = String(raw.eventbrite_event_id || raw.id || "");
  if (!id || !raw.name || !raw.start_date) return null;
  const tz = raw.timezone || "America/New_York";
  const start = parseLocalDate(raw.start_date, raw.start_time);
  if (Number.isNaN(start.getTime())) return null;
  const end = raw.end_date
    ? parseLocalDate(raw.end_date, raw.end_time)
    : undefined;
  const addr = raw.primary_venue?.address;
  const lat = Number(addr?.latitude || 40.7128);
  const lng = Number(addr?.longitude || -74.006);

  return {
    externalId: id,
    platform: "eventbrite",
    title: raw.name,
    organization:
      raw.primary_organizer?.name ||
      raw.primary_venue?.name ||
      "Eventbrite host",
    eventType: mapEventType(raw.tags),
    ageGroup: { min: 0, max: 12, label: "Kids / Family" },
    description: raw.full_description || raw.summary || "",
    links: {
      primary: raw.url || `https://www.eventbrite.com/e/${id}`,
      source: raw.url || `https://www.eventbrite.com/e/${id}`,
      tickets: raw.url,
    },
    startsAt: start,
    endsAt: end && !Number.isNaN(end.getTime()) ? end : undefined,
    timezone: tz,
    location: {
      name: raw.primary_venue?.name || addr?.city || "New York",
      address: addr?.address_1 || "",
      city: addr?.city || "New York",
      region: addr?.region || "NY",
      country: addr?.country || "US",
      lat,
      lng,
    },
  };
}

function parseSetCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  // fetch may join multiple set-cookie with comma incorrectly; also try getSetCookie
  for (const part of header.split(/,(?=\s*[^;]+=)/)) {
    const [pair] = part.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function warmSession(
  warmUrl: string,
  diagnostics: string[]
): Promise<{
  cookies: Record<string, string>;
  csrf: string;
  html: string;
  placeId?: string;
  query?: string;
}> {
  const res = await fetch(warmUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie().join(", ")
      : res.headers.get("set-cookie");
  const cookies = parseSetCookie(setCookie);
  const html = await res.text();
  diagnostics.push(
    `warm ${res.status} len=${html.length} hasServerData=${html.includes("__SERVER_DATA__")} cookies=${Object.keys(cookies).join(",") || "none"}`
  );

  if (!res.ok) {
    throw new Error(`Eventbrite warm failed HTTP ${res.status}`);
  }

  let csrf = cookies.csrftoken || "";
  if (!csrf) {
    const m = html.match(/csrftoken["']?\s*[:=]\s*["']([^"']+)/i);
    csrf = m?.[1] || "";
  }
  if (!csrf) {
    diagnostics.push("warn: no csrftoken from warm — API search may fail");
  }

  let placeId: string | undefined;
  let query: string | undefined;
  if (html.includes("__SERVER_DATA__")) {
    try {
      const marker = "window.__SERVER_DATA__ = ";
      const idx = html.indexOf(marker);
      const raw = html.slice(idx + marker.length);
      let depth = 0;
      let end = -1;
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === "{") depth += 1;
        else if (raw[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      if (end !== -1) {
        const data = JSON.parse(raw.slice(0, end)) as {
          placeId?: string | number;
          search_data?: {
            event_search?: { places?: string[]; q?: string };
            events?: { results?: EbResult[] };
          };
        };
        placeId =
          String(data.placeId || data.search_data?.event_search?.places?.[0] || "") ||
          undefined;
        query = data.search_data?.event_search?.q || undefined;
        const embedded = data.search_data?.events?.results?.length || 0;
        diagnostics.push(
          `warm parsed placeId=${placeId || "none"} q=${query || ""} embeddedResults=${embedded}`
        );
      }
    } catch (err) {
      diagnostics.push(
        `warm parse error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { cookies, csrf, html, placeId, query };
}

async function searchDestination(options: {
  placeId: string;
  query: string;
  page: number;
  pageSize: number;
  cookies: Record<string, string>;
  csrf: string;
}): Promise<{ results: EbResult[]; pageCount: number; status: number }> {
  const payload = {
    event_search: {
      dates: "current_future",
      dedup: true,
      page_size: options.pageSize,
      q: options.query,
      places: [options.placeId],
      page: options.page,
    },
    "expand.destination_event": [
      "primary_venue",
      "image",
      "primary_organizer",
      "ticket_availability",
    ],
    browse_surface: "search",
  };

  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://www.eventbrite.com",
    Referer: DEFAULT_WARM_URL,
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (options.csrf) {
    headers["X-CSRFToken"] = options.csrf;
    headers["X-Requested-With"] = "XMLHttpRequest";
  }
  const cookie = cookieHeader(options.cookies);
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  // Merge any new cookies
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie().join(", ")
      : res.headers.get("set-cookie");
  Object.assign(options.cookies, parseSetCookie(setCookie));

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`destination/search HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    events?: { results?: EbResult[]; pagination?: { page_count?: number } };
  };
  return {
    results: data.events?.results || [],
    pageCount: data.events?.pagination?.page_count || 1,
    status: res.status,
  };
}

function eventsFromWarmHtml(
  html: string,
  diagnostics: string[]
): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const seen = new Set<string>();
  if (!html.includes("__SERVER_DATA__")) return out;
  try {
    const marker = "window.__SERVER_DATA__ = ";
    const idx = html.indexOf(marker);
    const raw = html.slice(idx + marker.length);
    let depth = 0;
    let end = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "{") depth += 1;
      else if (raw[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) return out;
    const data = JSON.parse(raw.slice(0, end)) as {
      search_data?: { events?: { results?: EbResult[] } };
    };
    for (const rawEvent of data.search_data?.events?.results || []) {
      const mapped = toNormalized(rawEvent);
      if (!mapped || seen.has(mapped.externalId)) continue;
      seen.add(mapped.externalId);
      out.push(mapped);
    }
    diagnostics.push(`html embedded normalized=${out.length}`);
  } catch (err) {
    diagnostics.push(
      `html embed parse error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return out;
}

export async function ingestEventbrite(options: {
  url: string;
  maxPages?: number;
}): Promise<AdapterResult> {
  const maxPages = options.maxPages ?? 2;
  const warmUrl = options.url || DEFAULT_WARM_URL;
  const diagnostics: string[] = [`discoveryUrl=${warmUrl}`];
  const out: NormalizedEvent[] = [];
  const seen = new Set<string>();

  try {
    const session = await warmSession(warmUrl, diagnostics);

    // Always keep embedded results from the warmed page
    for (const event of eventsFromWarmHtml(session.html, diagnostics)) {
      if (seen.has(event.externalId)) continue;
      seen.add(event.externalId);
      out.push(event);
    }

    if (session.csrf && session.placeId) {
      const query = session.query || "kids";
      for (let page = 1; page <= maxPages; page++) {
        try {
          const { results, pageCount, status } = await searchDestination({
            placeId: session.placeId,
            query,
            page,
            pageSize: 20,
            cookies: session.cookies,
            csrf: session.csrf,
          });
          diagnostics.push(
            `api place=${session.placeId} q=${query} page=${page} status=${status} results=${results.length}`
          );
          for (const raw of results) {
            const mapped = toNormalized(raw);
            if (!mapped || seen.has(mapped.externalId)) continue;
            seen.add(mapped.externalId);
            out.push(mapped);
          }
          if (page >= pageCount || results.length === 0) break;
          await new Promise((r) => setTimeout(r, 400));
        } catch (err) {
          diagnostics.push(
            `api page=${page} error: ${err instanceof Error ? err.message : String(err)}`
          );
          break;
        }
      }
    } else if (!session.placeId) {
      diagnostics.push("warn: no placeId on page — used embedded HTML results only");
    }
  } catch (err) {
    diagnostics.push(
      `session/api path failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  diagnostics.push(`total normalized=${out.length}`);
  return { events: out, diagnostics };
}
