"use client";

import { AGE_GROUP_PRESETS, EVENT_TYPES, METROS } from "@recess/shared";
import type { Filters } from "@/lib/types";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
};

export function FilterBar({ filters, onChange }: Props) {
  return (
    <div className="animate-pop mt-6 hidden gap-3 rounded-[28px] bg-white/80 p-4 shadow-[var(--recess-shadow)] backdrop-blur md:grid md:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1 text-sm font-bold">
        Location
        <select
          className="rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2.5 font-semibold outline-none focus:border-[var(--recess-sky)]"
          value={filters.metroId}
          onChange={(e) =>
            onChange({ ...filters, metroId: e.target.value as Filters["metroId"] })
          }
        >
          <option value="all">All locations</option>
          {METROS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Type
        <select
          className="rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2.5 font-semibold outline-none focus:border-[var(--recess-sky)]"
          value={filters.eventType}
          onChange={(e) => onChange({ ...filters, eventType: e.target.value })}
        >
          <option value="all">All types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Age
        <select
          className="rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2.5 font-semibold outline-none focus:border-[var(--recess-sky)]"
          value={filters.ageLabel}
          onChange={(e) => onChange({ ...filters, ageLabel: e.target.value })}
        >
          {AGE_GROUP_PRESETS.map((a) => (
            <option key={a.label} value={a.label}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Search
        <input
          className="rounded-2xl border-2 border-black/10 bg-[var(--recess-cream)] px-3 py-2.5 font-semibold outline-none focus:border-[var(--recess-sky)]"
          placeholder="Search hosts, venues…"
          value={filters.businessName}
          onChange={(e) =>
            onChange({ ...filters, businessName: e.target.value })
          }
        />
      </label>
    </div>
  );
}
