export type IngestLogLevel = "info" | "warn" | "error";

export type IngestLogLine = {
  at: string; // ISO
  level: IngestLogLevel;
  source?: string;
  message: string;
  detail?: string;
};

export type SourceRunStats = {
  sourceId: string;
  sourceName: string;
  url: string;
  adapter: string;
  /** @deprecated alias of adapter for older UI */
  platform: string;
  status: "success" | "partial" | "failed" | "skipped";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  skipReasons: Record<string, number>;
  sampleTitles: string[];
  sampleExternalIds: string[];
  errors: string[];
  warnings: string[];
};

export type IngestRunStats = {
  fetched: number;
  created: number;
  updated: number;
  upserted: number;
  skipped: number;
  errors: number;
  warnings: number;
};
