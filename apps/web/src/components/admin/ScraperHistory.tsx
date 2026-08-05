"use client";

import { useState } from "react";

export type IngestLogLine = {
  at: string;
  level: "info" | "warn" | "error";
  source?: string;
  message: string;
  detail?: string;
};

export type SourceRunStats = {
  sourceId?: string;
  sourceName?: string;
  url?: string;
  adapter?: string;
  platform: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  skipReasons?: Record<string, number>;
  sampleTitles?: string[];
  sampleExternalIds?: string[];
  errors?: string[];
  warnings?: string[];
};

export type IngestRunRow = {
  id: string;
  platform: string;
  trigger: string;
  status: string;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  stats?: {
    fetched?: number;
    created?: number;
    updated?: number;
    upserted?: number;
    skipped?: number;
    errors?: number;
    warnings?: number;
  };
  sources?: SourceRunStats[];
  logs?: IngestLogLine[];
  errorSummary?: string | null;
  warningSummary?: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  success: "bg-[var(--recess-grass)]/30 text-black",
  partial: "bg-[var(--recess-sun)]/50 text-black",
  failed: "bg-[var(--recess-coral)]/20 text-[var(--recess-coral)]",
  running: "bg-[var(--recess-sky)]/30 text-black",
};

type Props = {
  runs: IngestRunRow[];
  onRefresh: () => void;
};

export function ScraperHistory({ runs, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="mb-8 rounded-[28px] bg-white p-5 shadow-[var(--recess-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Scraper history</h2>
          <p className="mt-1 text-sm font-semibold text-black/60">
            Per-run counts, sample titles, skip reasons, and log lines for debugging.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full border-2 border-black/10 px-4 py-2 text-sm font-bold"
        >
          Refresh
        </button>
      </div>

      {runs.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-[var(--recess-cream)] px-4 py-3 text-sm font-semibold">
          No ingest runs yet. Hit <strong>Run all now</strong> to create the first log.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {runs.map((run) => {
            const open = expanded === run.id;
            return (
              <li
                key={run.id}
                className="rounded-[22px] border-2 border-black/5 bg-[var(--recess-cream)]/60"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : run.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                >
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${STATUS_STYLE[run.status] || "bg-black/10"}`}
                  >
                    {run.status}
                  </span>
                  <span className="font-bold">{run.platform}</span>
                  <span className="text-xs font-semibold uppercase text-black/45">
                    {run.trigger}
                  </span>
                  <span className="text-sm font-semibold text-black/65">
                    {run.startedAt?.toLocaleString?.() || "—"}
                  </span>
                  <span className="ml-auto text-sm font-bold">
                    {run.stats?.fetched ?? 0} fetched ·{" "}
                    {run.stats?.created ?? 0} new ·{" "}
                    {run.stats?.updated ?? 0} updated ·{" "}
                    {run.stats?.skipped ?? 0} skipped
                    {typeof run.durationMs === "number"
                      ? ` · ${(run.durationMs / 1000).toFixed(1)}s`
                      : ""}
                  </span>
                </button>

                {open ? (
                  <div className="space-y-4 border-t border-black/5 px-4 py-4">
                    {run.errorSummary ? (
                      <p className="rounded-2xl bg-[var(--recess-coral)]/10 px-3 py-2 text-sm font-bold text-[var(--recess-coral)]">
                        {run.errorSummary}
                      </p>
                    ) : null}
                    {run.warningSummary ? (
                      <p className="rounded-2xl bg-[var(--recess-sun)]/30 px-3 py-2 text-sm font-bold">
                        {run.warningSummary}
                      </p>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      {(run.sources || []).map((source, idx) => (
                        <div
                          key={`${run.id}-${source.sourceId || source.platform}-${idx}`}
                          className="rounded-2xl bg-white p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-extrabold">
                              {source.sourceName || source.platform}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${STATUS_STYLE[source.status] || "bg-black/10"}`}
                            >
                              {source.status}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold text-black/45">
                            {(source.adapter || source.platform) +
                              (source.url ? ` · ${source.url}` : "")}
                          </p>
                          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                            <dt className="text-black/50">Fetched</dt>
                            <dd className="font-bold">{source.fetched}</dd>
                            <dt className="text-black/50">Created</dt>
                            <dd className="font-bold">{source.created}</dd>
                            <dt className="text-black/50">Updated</dt>
                            <dd className="font-bold">{source.updated}</dd>
                            <dt className="text-black/50">Skipped</dt>
                            <dd className="font-bold">{source.skipped}</dd>
                            <dt className="text-black/50">Duration</dt>
                            <dd className="font-bold">
                              {source.durationMs
                                ? `${(source.durationMs / 1000).toFixed(1)}s`
                                : "—"}
                            </dd>
                          </dl>

                          {source.skipReasons &&
                          Object.keys(source.skipReasons).length > 0 ? (
                            <p className="mt-2 text-xs font-semibold text-black/60">
                              Skip reasons: {JSON.stringify(source.skipReasons)}
                            </p>
                          ) : null}

                          {(source.sampleTitles || []).length > 0 ? (
                            <div className="mt-3">
                              <p className="text-xs font-extrabold uppercase tracking-wide text-black/45">
                                Sample titles
                              </p>
                              <ul className="mt-1 list-disc pl-4 text-sm font-semibold">
                                {source.sampleTitles!.map((t) => (
                                  <li key={t}>{t}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {(source.errors || []).length > 0 ? (
                            <ul className="mt-2 space-y-1 text-xs font-bold text-[var(--recess-coral)]">
                              {source.errors!.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-black/45">
                        Log ({run.logs?.length || 0} lines)
                      </p>
                      <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl bg-black px-3 py-3 font-mono text-[11px] leading-relaxed text-green-300">
                        {(run.logs || []).length === 0 ? (
                          <p className="text-white/50">No log lines stored.</p>
                        ) : (
                          run.logs!.map((line, i) => (
                            <div
                              key={`${run.id}-log-${i}`}
                              className={
                                line.level === "error"
                                  ? "text-red-300"
                                  : line.level === "warn"
                                    ? "text-yellow-200"
                                    : "text-green-300"
                              }
                            >
                              <span className="text-white/40">
                                {new Date(line.at).toLocaleTimeString()}{" "}
                              </span>
                              <span className="uppercase">[{line.level}]</span>{" "}
                              {line.source ? `${line.source}: ` : ""}
                              {line.message}
                              {line.detail ? (
                                <pre className="whitespace-pre-wrap text-white/50">
                                  {line.detail}
                                </pre>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                      <p className="mt-2 text-[11px] font-semibold text-black/40">
                        Run ID: {run.id}
                      </p>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
