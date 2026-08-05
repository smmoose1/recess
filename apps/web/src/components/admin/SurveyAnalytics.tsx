"use client";

import { Fragment, useMemo, useState } from "react";
import { METROS } from "@recess/shared";

export type SurveyQuestionRow = {
  id: string;
  prompt: string;
  type: string;
  active: boolean;
  options?: string[];
};

export type SurveyResponseRow = {
  id: string;
  questionId: string;
  questionPrompt?: string;
  questionType?: string;
  answer: unknown;
  answerSummary?: string;
  userId: string;
  metroId?: string | null;
  unlockedPage?: number;
  filtersSnapshot?: {
    metroId?: string;
    eventType?: string;
    ageLabel?: string;
    businessName?: string;
  } | null;
  meta?: {
    ip?: string | null;
    userAgent?: string | null;
    geo?: {
      city?: string | null;
      region?: string | null;
      country?: string | null;
      countryCode?: string | null;
      postal?: string | null;
      timezone?: string | null;
      isp?: string | null;
    } | null;
    client?: {
      timezone?: string;
      locale?: string;
      platform?: string;
      screen?: string;
      referrer?: string;
    } | null;
  } | null;
  geoCity?: string | null;
  geoRegion?: string | null;
  geoCountry?: string | null;
  geoPostal?: string | null;
  createdAt?: Date;
};

type Props = {
  questions: SurveyQuestionRow[];
  responses: SurveyResponseRow[];
  onRefresh: () => void;
};

function formatAnswer(answer: unknown, summary?: string): string {
  if (summary) return summary;
  if (answer == null) return "—";
  if (typeof answer === "string" || typeof answer === "number") return String(answer);
  if (Array.isArray(answer)) return answer.join(", ");
  if (typeof answer === "object") {
    const o = answer as Record<string, unknown>;
    if (o.name || o.email || o.zip) {
      return [o.name, o.email, o.zip].filter(Boolean).join(" · ");
    }
    try {
      return JSON.stringify(answer);
    } catch {
      return String(answer);
    }
  }
  return String(answer);
}

function startOfDay(d: string): Date | null {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function endOfDay(d: string): Date | null {
  if (!d) return null;
  const dt = new Date(`${d}T23:59:59.999`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function SurveyAnalytics({ questions, responses, onRefresh }: Props) {
  const [questionId, setQuestionId] = useState("all");
  const [answerFilter, setAnswerFilter] = useState("all");
  const [metroId, setMetroId] = useState("all");
  const [country, setCountry] = useState("all");
  const [city, setCity] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const questionMap = useMemo(() => {
    const m = new Map<string, SurveyQuestionRow>();
    for (const q of questions) m.set(q.id, q);
    return m;
  }, [questions]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const r of responses) {
      const c = r.geoCountry || r.meta?.geo?.country;
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [responses]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const r of responses) {
      const c = r.geoCity || r.meta?.geo?.city;
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [responses]);

  const answerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of responses) {
      if (questionId !== "all" && r.questionId !== questionId) continue;
      const label = formatAnswer(r.answer, r.answerSummary);
      if (label) set.add(label);
    }
    return Array.from(set).sort();
  }, [responses, questionId]);

  const filtered = useMemo(() => {
    const from = startOfDay(dateFrom);
    const to = endOfDay(dateTo);
    const needle = search.trim().toLowerCase();

    return responses
      .filter((r) => {
        if (questionId !== "all" && r.questionId !== questionId) return false;
        const answerLabel = formatAnswer(r.answer, r.answerSummary);
        if (answerFilter !== "all" && answerLabel !== answerFilter) return false;
        const rowMetro = r.metroId || r.filtersSnapshot?.metroId || "";
        if (metroId !== "all" && rowMetro !== metroId) return false;
        const rowCountry = r.geoCountry || r.meta?.geo?.country || "";
        if (country !== "all" && rowCountry !== country) return false;
        const rowCity = r.geoCity || r.meta?.geo?.city || "";
        if (city !== "all" && rowCity !== city) return false;
        if (from && (!r.createdAt || r.createdAt < from)) return false;
        if (to && (!r.createdAt || r.createdAt > to)) return false;
        if (needle) {
          const hay = [
            answerLabel,
            r.questionPrompt,
            r.userId,
            r.meta?.ip,
            rowCity,
            rowCountry,
            r.geoPostal,
            r.meta?.geo?.isp,
            r.meta?.client?.timezone,
            JSON.stringify(r.filtersSnapshot || {}),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort(
        (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
      );
  }, [
    responses,
    questionId,
    answerFilter,
    metroId,
    country,
    city,
    dateFrom,
    dateTo,
    search,
  ]);

  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of filtered) {
      const key = formatAnswer(r.answer, r.answerSummary) || "(empty)";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const locationBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of filtered) {
      const key =
        [r.geoCity || r.meta?.geo?.city, r.geoRegion || r.meta?.geo?.region, r.geoCountry || r.meta?.geo?.country]
          .filter(Boolean)
          .join(", ") || "Unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  const maxBreak = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <section className="mb-8 rounded-[28px] bg-white p-5 shadow-[var(--recess-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Survey analytics</h2>
          <p className="mt-1 text-sm font-semibold text-black/60">
            Filter by question, answer, date, metro, and geo metadata (IP lookup).
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <label className="text-sm font-bold">
          Question
          <select
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            value={questionId}
            onChange={(e) => {
              setQuestionId(e.target.value);
              setAnswerFilter("all");
            }}
          >
            <option value="all">All questions</option>
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.prompt}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          Answer
          <select
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            value={answerFilter}
            onChange={(e) => setAnswerFilter(e.target.value)}
          >
            <option value="all">All answers</option>
            {answerOptions.map((a) => (
              <option key={a} value={a}>
                {a.length > 80 ? `${a.slice(0, 80)}…` : a}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          Metro (browse filter)
          <select
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            value={metroId}
            onChange={(e) => setMetroId(e.target.value)}
          >
            <option value="all">All metros</option>
            {METROS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          Country (IP)
          <select
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          City (IP)
          <select
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="all">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          From
          <input
            type="date"
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>

        <label className="text-sm font-bold">
          To
          <input
            type="date"
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>

        <label className="text-sm font-bold">
          Search
          <input
            className="mt-1 w-full rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2 font-semibold"
            placeholder="email, zip, ISP, IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[22px] bg-[var(--recess-cream)] p-4 lg:col-span-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-black/45">
            Responses
          </p>
          <p className="mt-1 text-4xl font-extrabold">{filtered.length}</p>
          <p className="text-sm font-semibold text-black/55">
            of {responses.length} total
          </p>
        </div>

        <div className="rounded-[22px] bg-[var(--recess-cream)] p-4 lg:col-span-1">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-black/45">
            Answer mix
          </p>
          <ul className="space-y-2">
            {breakdown.slice(0, 6).map((row) => (
              <li key={row.label}>
                <div className="mb-1 flex justify-between gap-2 text-xs font-bold">
                  <span className="truncate">{row.label}</span>
                  <span>{row.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[var(--recess-coral)]"
                    style={{ width: `${(row.count / maxBreak) * 100}%` }}
                  />
                </div>
              </li>
            ))}
            {breakdown.length === 0 ? (
              <li className="text-sm font-semibold text-black/50">No data</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-[22px] bg-[var(--recess-cream)] p-4 lg:col-span-1">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-black/45">
            Top locations (IP)
          </p>
          <ul className="space-y-1.5 text-sm font-semibold">
            {locationBreakdown.map((row) => (
              <li key={row.label} className="flex justify-between gap-2">
                <span className="truncate">{row.label}</span>
                <span className="font-extrabold">{row.count}</span>
              </li>
            ))}
            {locationBreakdown.length === 0 ? (
              <li className="text-black/50">No geo yet — new responses will fill this in</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b font-extrabold">
              <th className="py-2 pr-2">When</th>
              <th className="pr-2">Question</th>
              <th className="pr-2">Answer</th>
              <th className="pr-2">Metro</th>
              <th className="pr-2">Location</th>
              <th className="pr-2">IP / ISP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const q =
                questionMap.get(r.questionId)?.prompt ||
                r.questionPrompt ||
                r.questionId;
              const open = expanded === r.id;
              const loc = [
                r.geoCity || r.meta?.geo?.city,
                r.geoRegion || r.meta?.geo?.region,
                r.geoCountry || r.meta?.geo?.country,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <Fragment key={r.id}>
                  <tr className="border-b border-black/5 align-top">
                    <td className="py-2 pr-2 whitespace-nowrap font-semibold">
                      {r.createdAt?.toLocaleString?.() || "—"}
                    </td>
                    <td className="pr-2 font-bold">{q}</td>
                    <td className="pr-2 max-w-[220px] truncate font-semibold">
                      {formatAnswer(r.answer, r.answerSummary)}
                    </td>
                    <td className="pr-2">
                      {r.metroId || r.filtersSnapshot?.metroId || "—"}
                    </td>
                    <td className="pr-2">{loc || "—"}</td>
                    <td className="pr-2 text-xs font-semibold">
                      <div>{r.meta?.ip || "—"}</div>
                      <div className="text-black/45">{r.meta?.geo?.isp || ""}</div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="rounded-full bg-[var(--recess-cream)] px-3 py-1 text-xs font-bold"
                        onClick={() => setExpanded(open ? null : r.id)}
                      >
                        {open ? "Hide" : "Meta"}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-black/5 bg-[var(--recess-cream)]/40">
                      <td colSpan={7} className="px-3 py-3 text-xs font-semibold leading-relaxed">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="font-extrabold uppercase tracking-wide text-black/45">
                              Geo
                            </p>
                            <p>
                              {[
                                r.geoCity || r.meta?.geo?.city,
                                r.geoRegion || r.meta?.geo?.region,
                                r.geoPostal || r.meta?.geo?.postal,
                                r.geoCountry || r.meta?.geo?.country,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </p>
                            <p className="text-black/55">
                              TZ:{" "}
                              {r.meta?.geo?.timezone ||
                                r.meta?.client?.timezone ||
                                "—"}
                            </p>
                          </div>
                          <div>
                            <p className="font-extrabold uppercase tracking-wide text-black/45">
                              Device / client
                            </p>
                            <p>
                              {r.meta?.client?.platform || "—"} ·{" "}
                              {r.meta?.client?.locale || "—"} ·{" "}
                              {r.meta?.client?.screen || "—"}
                            </p>
                            <p className="truncate text-black/55">
                              UA: {r.meta?.userAgent || "—"}
                            </p>
                            <p className="truncate text-black/55">
                              Referrer: {r.meta?.client?.referrer || "—"}
                            </p>
                          </div>
                          <div>
                            <p className="font-extrabold uppercase tracking-wide text-black/45">
                              Browse filters at submit
                            </p>
                            <p>
                              {r.filtersSnapshot
                                ? JSON.stringify(r.filtersSnapshot)
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="font-extrabold uppercase tracking-wide text-black/45">
                              User
                            </p>
                            <p className="truncate">{r.userId}</p>
                            <p>Unlock page: {r.unlockedPage ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="mt-4 text-sm font-semibold text-black/50">
            No responses match these filters.
          </p>
        ) : null}
      </div>
    </section>
  );
}
