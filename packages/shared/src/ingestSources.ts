import { z } from "zod";

export const ADAPTER_KINDS = [
  "auto",
  "mommy_poppins",
  "eventbrite",
  "luma",
  "partiful",
  "generic",
] as const;

export type AdapterKind = (typeof ADAPTER_KINDS)[number];

export const IngestSourceConfigSchema = z.object({
  /** Display name shown on admin chips + logs, e.g. "Mommy Poppins NYC" */
  name: z.string().min(1),
  /** Public listing / calendar URL to pull from */
  url: z.string().url(),
  /**
   * Which adapter to use. "auto" picks from the URL hostname.
   * Unknown hosts use the generic JSON-LD scraper.
   */
  adapter: z.enum(ADAPTER_KINDS).default("auto"),
  enabled: z.boolean().default(true),
  /** Optional metro tags for filtering / display */
  metroIds: z.array(z.string()).default([]),
  /** Days ahead to walk for day-based calendars (Mommy Poppins) */
  days: z.number().int().min(1).max(60).default(30),
  /** How many detail pages to enrich (rest use list data) */
  maxDetails: z.number().int().min(0).max(500).default(120),
  notes: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
  createdBy: z.string().optional(),
  lastRunAt: z.any().optional(),
  lastRunStatus: z.enum(["success", "partial", "failed", "running"]).optional(),
  lastRunId: z.string().optional(),
  lastStats: z
    .object({
      fetched: z.number().optional(),
      created: z.number().optional(),
      updated: z.number().optional(),
      skipped: z.number().optional(),
      durationMs: z.number().optional(),
    })
    .optional(),
});

export type IngestSourceConfig = z.infer<typeof IngestSourceConfigSchema>;

export function detectAdapterFromUrl(url: string): Exclude<AdapterKind, "auto"> {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("mommypoppins")) return "mommy_poppins";
    if (host.includes("eventbrite")) return "eventbrite";
    if (host.includes("lu.ma") || host.includes("luma.com")) return "luma";
    if (host.includes("partiful")) return "partiful";
  } catch {
    // fall through
  }
  return "generic";
}
