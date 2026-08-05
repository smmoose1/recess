"use client";

import { useEffect, useState } from "react";
import { AGE_GROUP_PRESETS, EVENT_TYPES, METROS } from "@recess/shared";
import type { Filters } from "@/lib/types";

type Sheet = "location" | "type" | "age" | "search" | null;

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
};

function metroLabel(id: Filters["metroId"]) {
  if (id === "all") return "All";
  return METROS.find((m) => m.id === id)?.shortLabel || "Location";
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function MobileFilterNav({ filters, onChange }: Props) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [searchDraft, setSearchDraft] = useState(filters.businessName);

  useEffect(() => {
    setSearchDraft(filters.businessName);
  }, [filters.businessName]);

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  const typeLabel =
    filters.eventType === "all" ? "Type" : filters.eventType;
  const ageLabel =
    filters.ageLabel === "All ages" ? "Age" : filters.ageLabel;
  const searchActive = Boolean(filters.businessName.trim());

  return (
    <>
      <nav
        aria-label="Filters"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="pointer-events-auto flex w-full max-w-md items-stretch gap-1 rounded-[28px] border border-white/50 bg-white/55 p-1.5 shadow-[0_12px_40px_rgba(26,26,26,0.14)] ring-1 ring-black/5 backdrop-blur-xl">
          {(
            [
              {
                id: "location" as const,
                label: "Location",
                value: metroLabel(filters.metroId),
                active: filters.metroId !== "all",
              },
              {
                id: "type" as const,
                label: "Type",
                value: typeLabel,
                active: filters.eventType !== "all",
              },
              {
                id: "age" as const,
                label: "Age",
                value: ageLabel,
                active: filters.ageLabel !== "All ages",
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              onClick={() => setSheet(item.id)}
              className={`min-w-0 flex-1 rounded-[22px] px-2 py-2.5 transition ${
                sheet === item.id
                  ? "bg-white/90 text-black shadow-sm"
                  : item.active
                    ? "text-black"
                    : "text-black/55"
              }`}
            >
              <span className="block truncate text-center text-[11px] font-extrabold capitalize leading-tight">
                {item.value}
              </span>
            </button>
          ))}

          <button
            type="button"
            aria-label="Search"
            onClick={() => setSheet("search")}
            className={`flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full transition ${
              sheet === "search" || searchActive
                ? "bg-[var(--recess-coral)] text-white shadow-sm"
                : "bg-white/70 text-black/70"
            }`}
          >
            <SearchIcon className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {sheet === "search" ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center md:hidden">
          <button
            type="button"
            aria-label="Close search"
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={() => setSheet(null)}
          />
          <div className="animate-pop relative z-10 w-full border-b border-white/60 bg-white/95 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="brand text-xl font-bold">Search</h3>
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="rounded-full px-3 py-1.5 text-sm font-bold text-black/50"
              >
                Close
              </button>
            </div>
            <input
              autoFocus
              className="mt-3 w-full rounded-2xl border-2 border-black/10 bg-white px-4 py-3.5 text-base font-semibold outline-none focus:border-[var(--recess-sky)]"
              placeholder="Search hosts, venues…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onFocus={(e) => {
                // Keep the field above the soft keyboard on iOS/Android.
                window.setTimeout(() => {
                  e.target.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  });
                }, 300);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onChange({
                    ...filters,
                    businessName: searchDraft.trim(),
                  });
                  setSheet(null);
                }
              }}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  onChange({ ...filters, businessName: "" });
                  setSheet(null);
                }}
                className="rounded-full px-4 py-2.5 text-sm font-bold text-black/55"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    ...filters,
                    businessName: searchDraft.trim(),
                  });
                  setSheet(null);
                }}
                className="ml-auto rounded-full bg-[var(--recess-coral)] px-5 py-2.5 text-sm font-extrabold text-white"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sheet && sheet !== "search" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={() => setSheet(null)}
          />
          <div className="animate-slide-up relative z-10 max-h-[75vh] w-full overflow-y-auto rounded-t-[28px] border border-white/60 bg-white/92 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-black/10" />

            {sheet === "location" ? (
              <>
                <h3 className="brand text-2xl font-bold">Location</h3>
                <p className="mt-1 text-sm font-semibold text-black/55">
                  Choose a metro area
                </p>
                <div className="mt-4 space-y-2">
                  {(
                    [
                      { id: "all" as const, label: "All locations" },
                      ...METROS.map((m) => ({ id: m.id, label: m.label })),
                    ] as const
                  ).map((m) => {
                    const on = filters.metroId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onChange({ ...filters, metroId: m.id });
                          setSheet(null);
                        }}
                        className={`w-full rounded-2xl border-2 px-4 py-3 text-left font-extrabold ${
                          on
                            ? "border-[var(--recess-coral)] bg-[var(--recess-coral)]/10"
                            : "border-black/10 bg-white/70"
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {sheet === "type" ? (
              <>
                <h3 className="brand text-2xl font-bold">Type</h3>
                <p className="mt-1 text-sm font-semibold text-black/55">
                  What kind of fun?
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    { value: "all", label: "All types" },
                    ...EVENT_TYPES.map((t) => ({ value: t, label: t })),
                  ].map((opt) => {
                    const on = filters.eventType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChange({ ...filters, eventType: opt.value });
                          setSheet(null);
                        }}
                        className={`w-full rounded-2xl border-2 px-4 py-3 text-left font-extrabold capitalize ${
                          on
                            ? "border-[var(--recess-coral)] bg-[var(--recess-coral)]/10"
                            : "border-black/10 bg-white/70"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {sheet === "age" ? (
              <>
                <h3 className="brand text-2xl font-bold">Age</h3>
                <p className="mt-1 text-sm font-semibold text-black/55">
                  Filter by age group
                </p>
                <div className="mt-4 space-y-2">
                  {AGE_GROUP_PRESETS.map((a) => {
                    const on = filters.ageLabel === a.label;
                    return (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => {
                          onChange({ ...filters, ageLabel: a.label });
                          setSheet(null);
                        }}
                        className={`w-full rounded-2xl border-2 px-4 py-3 text-left font-extrabold ${
                          on
                            ? "border-[var(--recess-coral)] bg-[var(--recess-coral)]/10"
                            : "border-black/10 bg-white/70"
                        }`}
                      >
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
