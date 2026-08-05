import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  detectAdapterFromUrl,
  type AdapterKind,
} from "@recess/shared";
import { ingestEventbrite } from "./adapters/eventbrite";
import { ingestGenericJsonLd } from "./adapters/genericJsonLd";
import { ingestMommyPoppins } from "./adapters/mommyPoppins";
import type { AdapterResult } from "./adapters/types";
import { upsertNormalized } from "./upsertNormalized";
import type {
  IngestLogLine,
  IngestRunStats,
  SourceRunStats,
} from "./types";

export type FirestoreIngestSource = {
  id: string;
  name: string;
  url: string;
  adapter?: AdapterKind;
  enabled?: boolean;
  metroIds?: string[];
  days?: number;
  maxDetails?: number;
  notes?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function pushLog(
  lines: IngestLogLine[],
  level: IngestLogLine["level"],
  message: string,
  source?: string,
  detail?: string
) {
  const line: IngestLogLine = {
    at: nowIso(),
    level,
    message,
    ...(source ? { source } : {}),
    ...(detail ? { detail: detail.slice(0, 2000) } : {}),
  };
  lines.push(line);
  if (level === "error")
    logger.error(`[ingest] ${source || ""} ${message}`, detail);
  else if (level === "warn")
    logger.warn(`[ingest] ${source || ""} ${message}`, detail);
  else logger.info(`[ingest] ${source || ""} ${message}`, detail);
}

function resolveAdapter(source: FirestoreIngestSource): Exclude<AdapterKind, "auto"> {
  const chosen = source.adapter && source.adapter !== "auto"
    ? source.adapter
    : detectAdapterFromUrl(source.url);
  return chosen;
}

async function runAdapter(
  source: FirestoreIngestSource,
  adapter: Exclude<AdapterKind, "auto">
): Promise<AdapterResult> {
  switch (adapter) {
    case "mommy_poppins":
      return ingestMommyPoppins({
        url: source.url,
        days: source.days ?? 30,
        maxDetails: source.maxDetails ?? 120,
        enrichDetails: true,
      });
    case "eventbrite":
      return ingestEventbrite({
        url: source.url,
        maxPages: 3,
      });
    case "luma":
    case "partiful":
    case "generic":
    default:
      return ingestGenericJsonLd({
        url: source.url,
        sourceKey: source.id,
      });
  }
}

async function runConfiguredSource(
  source: FirestoreIngestSource,
  lines: IngestLogLine[]
): Promise<SourceRunStats> {
  const adapter = resolveAdapter(source);
  const label = source.name;
  const startedAt = nowIso();
  const startedMs = Date.now();

  pushLog(
    lines,
    "info",
    `Starting “${label}” via ${adapter}`,
    label,
    source.url
  );

  const stats: SourceRunStats = {
    sourceId: source.id,
    sourceName: source.name,
    url: source.url,
    adapter,
    platform: adapter,
    status: "success",
    startedAt,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    skipReasons: {},
    sampleTitles: [],
    sampleExternalIds: [],
    errors: [],
    warnings: [],
  };

  try {
    const adapterResult = await runAdapter(source, adapter);
    for (const note of adapterResult.diagnostics) {
      const level =
        note.startsWith("warn") || note.includes(" error") ? "warn" : "info";
      pushLog(lines, level, note, label);
    }

    stats.fetched = adapterResult.events.length;
    pushLog(
      lines,
      stats.fetched === 0 ? "warn" : "info",
      `Fetched ${stats.fetched} normalized events`,
      label
    );

    if (stats.fetched === 0) {
      stats.status = "failed";
      stats.warnings.push("fetched_zero");
    } else {
      const result = await upsertNormalized(adapterResult.events);
      stats.created = result.created;
      stats.updated = result.updated;
      stats.skipped = result.skipped;
      stats.skipReasons = result.skipReasons;
      stats.sampleTitles = result.sampleTitles;
      stats.sampleExternalIds = result.sampleExternalIds;
      pushLog(
        lines,
        "info",
        `Upserted created=${result.created} updated=${result.updated} skipped=${result.skipped}`,
        label,
        JSON.stringify(result.skipReasons)
      );
      if (result.created + result.updated === 0) stats.status = "failed";
      else if (result.skipped > 0) stats.status = "partial";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    stats.status = "failed";
    stats.errors.push(message);
    pushLog(lines, "error", message, label, stack);
  }

  stats.finishedAt = nowIso();
  stats.durationMs = Date.now() - startedMs;
  pushLog(
    lines,
    stats.status === "failed" ? "error" : "info",
    `Finished “${label}” in ${stats.durationMs}ms (${stats.status})`,
    label
  );
  return stats;
}

export async function loadEnabledSources(
  sourceId?: string
): Promise<FirestoreIngestSource[]> {
  const db = getFirestore();
  if (sourceId && sourceId !== "all") {
    const snap = await db.doc(`ingestSources/${sourceId}`).get();
    if (!snap.exists) {
      throw new Error(`Ingest source not found: ${sourceId}`);
    }
    return [{ id: snap.id, ...(snap.data() as Omit<FirestoreIngestSource, "id">) }];
  }

  const snap = await db
    .collection("ingestSources")
    .where("enabled", "==", true)
    .get();

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<FirestoreIngestSource, "id">),
  }));
}

export async function runIngest(options: {
  /** Firestore ingestSources doc id, or "all" for every enabled source */
  sourceId?: string;
  trigger: "schedule" | "manual";
  uid?: string;
}): Promise<{
  runId: string;
  status: string;
  stats: IngestRunStats;
  sources: SourceRunStats[];
  errors: string[];
}> {
  const db = getFirestore();
  const runRef = db.collection("ingestRuns").doc();
  const lines: IngestLogLine[] = [];
  const runStartedMs = Date.now();
  const sourceId = options.sourceId || "all";

  const sourcesToRun = await loadEnabledSources(sourceId);
  pushLog(
    lines,
    "info",
    `Ingest run started (trigger=${options.trigger}, sourceId=${sourceId}, count=${sourcesToRun.length})`
  );

  if (sourcesToRun.length === 0) {
    pushLog(
      lines,
      "warn",
      "No enabled ingest sources found. Add one in Admin → Ingestion."
    );
  }

  await runRef.set({
    sourceId,
    platform: sourceId,
    trigger: options.trigger,
    startedAt: FieldValue.serverTimestamp(),
    status: "running",
    triggeredBy: options.uid || null,
    stats: {
      fetched: 0,
      created: 0,
      updated: 0,
      upserted: 0,
      skipped: 0,
      errors: 0,
      warnings: 0,
    },
    sources: [],
    logs: lines,
  });

  const sources: SourceRunStats[] = [];

  try {
    for (const source of sourcesToRun) {
      const sourceStats = await runConfiguredSource(source, lines);
      sources.push(sourceStats);

      await runRef.set(
        {
          sources,
          logs: lines.slice(-300),
          stats: aggregateStats(sources),
        },
        { merge: true }
      );

      await db
        .collection("ingestSources")
        .doc(source.id)
        .set(
          {
            lastRunAt: FieldValue.serverTimestamp(),
            lastRunStatus: sourceStats.status,
            lastRunId: runRef.id,
            lastStats: {
              fetched: sourceStats.fetched,
              created: sourceStats.created,
              updated: sourceStats.updated,
              skipped: sourceStats.skipped,
              durationMs: sourceStats.durationMs,
            },
          },
          { merge: true }
        );
    }

    const stats = aggregateStats(sources);
    const hardFails = sources.filter((s) => s.status === "failed").length;
    const status =
      sources.length === 0
        ? "failed"
        : hardFails === sources.length
          ? "failed"
          : hardFails > 0 || stats.warnings > 0 || stats.skipped > 0
            ? "partial"
            : "success";

    const errorSummary = sources
      .flatMap((s) => s.errors.map((e) => `${s.sourceName}: ${e}`))
      .join(" | ");

    await runRef.set(
      {
        finishedAt: FieldValue.serverTimestamp(),
        durationMs: Date.now() - runStartedMs,
        status,
        stats,
        sources,
        logs: lines.slice(-300),
        errorSummary: errorSummary || null,
        warningSummary:
          sources
            .flatMap((s) => s.warnings.map((w) => `${s.sourceName}: ${w}`))
            .join(" | ") || null,
      },
      { merge: true }
    );

    pushLog(lines, "info", `Run complete status=${status}`);
    await runRef.set({ logs: lines.slice(-300) }, { merge: true });

    return {
      runId: runRef.id,
      status,
      stats,
      sources,
      errors: sources.flatMap((s) => s.errors),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    pushLog(lines, "error", `Run crashed: ${message}`, undefined, stack);
    await runRef.set(
      {
        finishedAt: FieldValue.serverTimestamp(),
        durationMs: Date.now() - runStartedMs,
        status: "failed",
        errorSummary: message,
        logs: lines.slice(-300),
        sources,
        stats: aggregateStats(sources),
      },
      { merge: true }
    );
    throw err;
  }
}

function aggregateStats(sources: SourceRunStats[]): IngestRunStats {
  return sources.reduce<IngestRunStats>(
    (acc, s) => ({
      fetched: acc.fetched + s.fetched,
      created: acc.created + s.created,
      updated: acc.updated + s.updated,
      upserted: acc.upserted + s.created + s.updated,
      skipped: acc.skipped + s.skipped,
      errors: acc.errors + s.errors.length,
      warnings: acc.warnings + s.warnings.length,
    }),
    {
      fetched: 0,
      created: 0,
      updated: 0,
      upserted: 0,
      skipped: 0,
      errors: 0,
      warnings: 0,
    }
  );
}
