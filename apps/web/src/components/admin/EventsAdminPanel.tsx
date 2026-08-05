"use client";

import { FormEvent, Fragment, useMemo, useState } from "react";
import {
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { AGE_GROUP_PRESETS, EVENT_TYPES, METROS } from "@recess/shared";
import { getClientDb } from "@/lib/firebase/client";

export type AdminEventRow = {
  id: string;
  title: string;
  organization: string;
  eventType: string;
  ageGroup?: { min: number; max: number; label: string };
  description?: string;
  links?: { primary?: string; tickets?: string; source?: string };
  phone?: string | null;
  startsAt?: Date;
  endsAt?: Date | null;
  timezone?: string;
  location?: {
    name?: string;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  source?: {
    platform?: string;
    externalId?: string;
    sourceUrl?: string;
  };
  metroIds?: string[];
  status?: string;
  adminLocked?: boolean;
  metrics?: {
    clickCount?: number;
    rsvpCount?: number;
    ratingAverage?: number;
    ratingCount?: number;
  };
};

type Props = {
  events: AdminEventRow[];
  onRefresh: () => Promise<void> | void;
};

function toLocalInput(d?: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusBadge(status?: string) {
  const s = status || "active";
  if (s === "hidden") return "bg-black/10 text-black/70";
  if (s === "ended") return "bg-[var(--recess-sun)]/40 text-black";
  return "bg-[var(--recess-grass)]/35 text-black";
}

export function EventsAdminPanel({ events, onRefresh }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminEventRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((e) => {
      if (statusFilter !== "all" && (e.status || "active") !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      const hay = [
        e.title,
        e.organization,
        e.eventType,
        e.source?.platform,
        e.location?.city,
        e.location?.name,
        e.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [events, query, statusFilter]);

  async function setStatus(event: AdminEventRow, status: string) {
    setBusyId(event.id);
    setMenuId(null);
    try {
      await updateDoc(doc(getClientDb(), "events", event.id), {
        status,
        adminLocked: true,
        updatedAt: serverTimestamp(),
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleLock(event: AdminEventRow) {
    setBusyId(event.id);
    setMenuId(null);
    try {
      await updateDoc(doc(getClientDb(), "events", event.id), {
        adminLocked: !event.adminLocked,
        updatedAt: serverTimestamp(),
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  }

  async function removeEvent(event: AdminEventRow) {
    const ok = window.confirm(
      `Delete “${event.title}”?\n\nIngested events may reappear on the next scrape unless you hide them instead.`
    );
    if (!ok) return;
    setBusyId(event.id);
    setMenuId(null);
    try {
      await deleteDoc(doc(getClientDb(), "events", event.id));
      if (expandedId === event.id) setExpandedId(null);
      if (editing?.id === event.id) setEditing(null);
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[28px] bg-white p-5 shadow-[var(--recess-shadow)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Events ({filtered.length})</h2>
          <p className="text-sm font-semibold text-black/60">
            Expand a row for analytics, then edit, hide, or delete.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events…"
            className="rounded-2xl border-2 border-black/10 px-3 py-2 text-sm font-semibold"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border-2 border-black/10 px-3 py-2 text-sm font-semibold"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
            <option value="ended">Ended</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-black/8">
        <div className="hidden grid-cols-[40px_1fr_120px_100px_90px_70px_70px_70px_40px] gap-2 bg-[var(--recess-cream)] px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-black/50 md:grid">
          <span />
          <span>Event</span>
          <span>When</span>
          <span>Source</span>
          <span>Status</span>
          <span>Clicks</span>
          <span>RSVPs</span>
          <span>Rating</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-black/50">
            No events match these filters.
          </p>
        ) : (
          filtered.map((event) => {
            const open = expandedId === event.id;
            const busy = busyId === event.id;
            return (
              <Fragment key={event.id}>
                <div
                  className={`border-t border-black/5 ${
                    open ? "bg-[var(--recess-cream)]/50" : "bg-white"
                  }`}
                >
                  <div className="flex items-stretch gap-2 px-2 py-2 md:grid md:grid-cols-[40px_1fr_120px_100px_90px_70px_70px_70px_40px] md:items-center md:gap-2 md:px-4">
                    <button
                      type="button"
                      aria-label={open ? "Collapse event" : "Expand event"}
                      onClick={() =>
                        setExpandedId(open ? null : event.id)
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center self-center text-black hover:text-black/70"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden
                        className={`h-9 w-9 transition-transform duration-200 ${
                          open ? "rotate-90" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(open ? null : event.id)
                      }
                      className="flex min-w-0 flex-1 items-start gap-2 px-1 py-1 text-left md:contents"
                    >
                      <span className="min-w-0 md:contents">
                        <span className="block min-w-0">
                          <span className="block truncate font-bold">
                            {event.title}
                          </span>
                          <span className="block truncate text-xs font-semibold text-black/50">
                            {event.organization || "—"} · {event.eventType}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm font-semibold md:mt-0">
                          {event.startsAt?.toLocaleString?.() || "—"}
                        </span>
                        <span className="mt-1 block text-sm font-semibold capitalize md:mt-0">
                          {(event.source?.platform || "—").replace(/_/g, " ")}
                        </span>
                        <span className="mt-1 md:mt-0">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-extrabold uppercase ${statusBadge(
                              event.status
                            )}`}
                          >
                            {event.status || "active"}
                          </span>
                        </span>
                        <span className="mt-1 hidden text-sm font-bold md:mt-0 md:block">
                          {event.metrics?.clickCount ?? 0}
                        </span>
                        <span className="mt-1 hidden text-sm font-bold md:mt-0 md:block">
                          {event.metrics?.rsvpCount ?? 0}
                        </span>
                        <span className="mt-1 hidden text-sm font-bold md:mt-0 md:block">
                          {(event.metrics?.ratingAverage ?? 0).toFixed(1)}
                        </span>
                      </span>
                    </button>

                    <div className="relative flex items-center pr-1">
                      <button
                        type="button"
                        aria-label="Event actions"
                        disabled={busy}
                        onClick={() =>
                          setMenuId(menuId === event.id ? null : event.id)
                        }
                        className="rounded-full px-2 py-1 text-lg font-extrabold leading-none text-black/60 hover:bg-black/5"
                      >
                        ⋯
                      </button>
                      {menuId === event.id ? (
                        <div className="absolute right-0 top-9 z-30 w-44 rounded-2xl border border-black/10 bg-white p-1 shadow-xl">
                          <button
                            type="button"
                            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-black/5"
                            onClick={() => {
                              setMenuId(null);
                              setExpandedId(event.id);
                              setEditing(event);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-black/5"
                            onClick={() =>
                              void setStatus(
                                event,
                                event.status === "hidden" ? "active" : "hidden"
                              )
                            }
                          >
                            {event.status === "hidden" ? "Unhide" : "Hide"}
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-black/5"
                            onClick={() => void toggleLock(event)}
                          >
                            {event.adminLocked
                              ? "Unlock scrape"
                              : "Lock from scrape"}
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--recess-coral)] hover:bg-black/5"
                            onClick={() => void removeEvent(event)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {open ? (
                    <div className="space-y-4 border-t border-black/5 px-4 pb-4 pt-3 md:px-6">
                      <div className="grid gap-3 sm:grid-cols-4">
                        {[
                          {
                            label: "Clicks",
                            value: event.metrics?.clickCount ?? 0,
                          },
                          {
                            label: "RSVPs",
                            value: event.metrics?.rsvpCount ?? 0,
                          },
                          {
                            label: "Avg rating",
                            value: (event.metrics?.ratingAverage ?? 0).toFixed(
                              1
                            ),
                          },
                          {
                            label: "Ratings",
                            value: event.metrics?.ratingCount ?? 0,
                          },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                          >
                            <p className="text-xs font-extrabold uppercase tracking-wide text-black/45">
                              {stat.label}
                            </p>
                            <p className="mt-1 text-2xl font-extrabold">
                              {stat.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 text-sm font-semibold">
                          <p>
                            <span className="text-black/45">Age · </span>
                            {event.ageGroup?.label || "—"}
                          </p>
                          <p>
                            <span className="text-black/45">Venue · </span>
                            {event.location?.name || "—"}
                          </p>
                          <p>
                            <span className="text-black/45">Address · </span>
                            {[
                              event.location?.address,
                              event.location?.city,
                              event.location?.region,
                            ]
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </p>
                          <p>
                            <span className="text-black/45">Metros · </span>
                            {(event.metroIds || []).join(", ") || "—"}
                          </p>
                          <p>
                            <span className="text-black/45">Phone · </span>
                            {event.phone || "—"}
                          </p>
                          {event.adminLocked ? (
                            <p className="text-[var(--recess-coral)]">
                              Locked — scrapers won’t overwrite this event
                            </p>
                          ) : null}
                        </div>
                        <div className="space-y-2 text-sm font-semibold">
                          <p className="line-clamp-5 text-black/70">
                            {event.description || "No description."}
                          </p>
                          {event.links?.primary ? (
                            <a
                              href={event.links.primary}
                              target="_blank"
                              rel="noreferrer"
                              className="block font-extrabold text-[var(--recess-coral)]"
                            >
                              Open primary link →
                            </a>
                          ) : null}
                          {event.source?.sourceUrl ? (
                            <a
                              href={event.source.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-black/50"
                            >
                              Source page →
                            </a>
                          ) : null}
                          <p className="text-xs text-black/40">ID: {event.id}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditing(event)}
                          className="rounded-full bg-black px-4 py-2 text-sm font-extrabold text-white"
                        >
                          Edit event
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void setStatus(
                              event,
                              event.status === "hidden" ? "active" : "hidden"
                            )
                          }
                          className="rounded-full border-2 border-black/10 px-4 py-2 text-sm font-extrabold"
                        >
                          {event.status === "hidden"
                            ? "Unhide from feed"
                            : "Hide from feed"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeEvent(event)}
                          className="rounded-full border-2 border-[var(--recess-coral)]/30 px-4 py-2 text-sm font-extrabold text-[var(--recess-coral)]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Fragment>
            );
          })
        )}
      </div>

      {menuId ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => setMenuId(null)}
        />
      ) : null}

      {editing ? (
        <EventEditModal
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onRefresh();
          }}
        />
      ) : null}
    </section>
  );
}

function EventEditModal({
  event,
  onClose,
  onSaved,
}: {
  event: AdminEventRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(event.title);
  const [organization, setOrganization] = useState(event.organization || "");
  const [eventType, setEventType] = useState(event.eventType || "other");
  const [ageLabel, setAgeLabel] = useState(
    event.ageGroup?.label || AGE_GROUP_PRESETS[0].label
  );
  const [description, setDescription] = useState(event.description || "");
  const [primaryLink, setPrimaryLink] = useState(event.links?.primary || "");
  const [ticketsLink, setTicketsLink] = useState(event.links?.tickets || "");
  const [phone, setPhone] = useState(event.phone || "");
  const [startsAt, setStartsAt] = useState(toLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(event.endsAt));
  const [venue, setVenue] = useState(event.location?.name || "");
  const [address, setAddress] = useState(event.location?.address || "");
  const [city, setCity] = useState(event.location?.city || "");
  const [region, setRegion] = useState(event.location?.region || "NY");
  const [status, setStatus] = useState(event.status || "active");
  const [metroIds, setMetroIds] = useState<string[]>(event.metroIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleMetro(id: string) {
    setMetroIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const start = fromLocalInput(startsAt);
    if (!title.trim()) {
      setError("Title is required");
      setBusy(false);
      return;
    }
    if (!start) {
      setError("Start date/time is required");
      setBusy(false);
      return;
    }
    if (!primaryLink.trim()) {
      setError("Primary link is required");
      setBusy(false);
      return;
    }

    const age =
      AGE_GROUP_PRESETS.find((a) => a.label === ageLabel) ||
      AGE_GROUP_PRESETS[0];

    try {
      await updateDoc(doc(getClientDb(), "events", event.id), {
        title: title.trim(),
        organization: organization.trim(),
        eventType,
        ageGroup: { min: age.min, max: age.max, label: age.label },
        description: description.trim(),
        links: {
          primary: primaryLink.trim(),
          ...(ticketsLink.trim() ? { tickets: ticketsLink.trim() } : {}),
          ...(event.links?.source ? { source: event.links.source } : {}),
        },
        phone: phone.trim() || null,
        startsAt: start,
        endsAt: fromLocalInput(endsAt),
        location: {
          name: venue.trim(),
          address: address.trim(),
          city: city.trim(),
          region: region.trim() || "NY",
          country: event.location?.country || "US",
          lat: event.location?.lat ?? 0,
          lng: event.location?.lng ?? 0,
        },
        metroIds,
        status,
        adminLocked: true,
        updatedAt: serverTimestamp(),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <form
        onSubmit={handleSave}
        className="animate-slide-up max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl"
      >
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--recess-coral)]">
          Edit event
        </p>
        <h3 className="mt-2 text-2xl font-bold leading-tight">{event.title}</h3>
        <p className="mt-1 text-sm font-semibold text-black/50">
          Saving locks this event so scrapers won’t overwrite your changes.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Title
            </span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Organization
            </span>
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Type
            </span>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Age group
            </span>
            <select
              value={ageLabel}
              onChange={(e) => setAgeLabel(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            >
              {AGE_GROUP_PRESETS.map((a) => (
                <option key={a.label} value={a.label}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            >
              <option value="active">active</option>
              <option value="hidden">hidden</option>
              <option value="ended">ended</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Starts
            </span>
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Ends
            </span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Primary link
            </span>
            <input
              required
              value={primaryLink}
              onChange={(e) => setPrimaryLink(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Tickets link
            </span>
            <input
              value={ticketsLink}
              onChange={(e) => setTicketsLink(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Venue
            </span>
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Phone
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Address
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              City
            </span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/45">
              Region
            </span>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-4 py-2.5 font-semibold"
            />
          </label>
          <div className="sm:col-span-2">
            <p className="text-xs font-extrabold uppercase text-black/45">
              Metros
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {METROS.map((m) => {
                const on = metroIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMetro(m.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
                      on
                        ? "bg-black text-white"
                        : "bg-[var(--recess-cream)] text-black/70"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-sm font-bold text-[var(--recess-coral)]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-2 border-black/10 px-5 py-2.5 font-extrabold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-black px-5 py-2.5 font-extrabold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
