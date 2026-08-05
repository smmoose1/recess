export type GeoInfo = {
  ip: string;
  city?: string;
  region?: string;
  regionCode?: string;
  country?: string;
  countryCode?: string;
  postal?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  source: "ip-api" | "headers" | "unknown";
};

function firstForwardedIp(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return header.split(",")[0]?.trim() || undefined;
}

export function extractRequestIp(raw: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const headers = raw.headers || {};
  const xf = headers["x-forwarded-for"];
  const forwarded = Array.isArray(xf) ? xf[0] : xf;
  return (
    firstForwardedIp(forwarded) ||
    (typeof headers["x-real-ip"] === "string" ? headers["x-real-ip"] : undefined) ||
    raw.ip ||
    undefined
  );
}

/** Best-effort geo lookup. Fails soft — never blocks survey submit. */
export async function lookupGeo(ip: string | undefined): Promise<GeoInfo | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") {
    return ip
      ? { ip, source: "unknown", city: "Local" }
      : null;
  }

  // Skip obviously private ranges
  if (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.")
  ) {
    return { ip, source: "unknown", city: "Private network" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    // ip-api.com free tier (non-HTTPS on free plan)
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,query`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ip, source: "unknown" };
    const data = (await res.json()) as {
      status?: string;
      country?: string;
      countryCode?: string;
      region?: string;
      regionName?: string;
      city?: string;
      zip?: string;
      lat?: number;
      lon?: number;
      timezone?: string;
      isp?: string;
      org?: string;
      query?: string;
    };
    if (data.status !== "success") return { ip, source: "unknown" };
    return {
      ip: data.query || ip,
      city: data.city,
      region: data.regionName,
      regionCode: data.region,
      country: data.country,
      countryCode: data.countryCode,
      postal: data.zip,
      lat: data.lat,
      lng: data.lon,
      timezone: data.timezone,
      isp: data.isp,
      org: data.org,
      source: "ip-api",
    };
  } catch {
    return { ip, source: "unknown" };
  }
}

export function answerSummary(answer: unknown): string {
  if (answer == null) return "";
  if (typeof answer === "string" || typeof answer === "number") {
    return String(answer);
  }
  if (Array.isArray(answer)) return answer.join(", ");
  if (typeof answer === "object") {
    const obj = answer as Record<string, unknown>;
    if (obj.name || obj.email || obj.zip) {
      return [obj.name, obj.email, obj.zip].filter(Boolean).join(" · ");
    }
    try {
      return JSON.stringify(answer);
    } catch {
      return String(answer);
    }
  }
  return String(answer);
}
