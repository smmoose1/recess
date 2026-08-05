"use client";

import type { EventDoc } from "@/lib/types";

const SOURCE_COLORS: Record<string, string> = {
  mommy_poppins: "bg-[var(--recess-coral)]",
  eventbrite: "bg-[var(--recess-sun)] text-black",
  luma: "bg-[var(--recess-sky)]",
  partiful: "bg-[var(--recess-grass)] text-black",
  manual: "bg-black text-white",
};

type Props = {
  event: EventDoc;
  index: number;
  onOpen: (event: EventDoc) => void;
  onRsvp: (event: EventDoc) => void;
};

export function EventCard({ event, index, onOpen, onRsvp }: Props) {
  const when = event.startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article
      className="animate-pop rounded-[28px] border-2 border-black/5 bg-white p-5 shadow-[var(--recess-shadow)] transition hover:-translate-y-1 hover:shadow-lg"
      style={{ animationDelay: `${Math.min(index, 9) * 40}ms` }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white ${SOURCE_COLORS[event.source?.platform] || "bg-black"}`}
        >
          {event.source?.platform?.replace("_", " ") || "event"}
        </span>
        <span className="rounded-full bg-[var(--recess-cream)] px-3 py-1 text-xs font-bold capitalize">
          {event.eventType}
        </span>
        <span className="rounded-full bg-[var(--recess-sky)]/20 px-3 py-1 text-xs font-bold">
          {event.ageGroup.label}
        </span>
      </div>

      <h2 className="text-2xl font-bold leading-tight">{event.title}</h2>
      <p className="mt-1 text-sm font-semibold text-black/60">
        {event.organization}
      </p>
      <p className="mt-3 text-sm font-bold">{when}</p>
      <p className="text-sm text-black/70">
        {event.location.name}
        {event.location.city ? ` · ${event.location.city}` : ""}
      </p>
      {event.description ? (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-black/75">
          {event.description}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpen(event)}
          className="rounded-full bg-[var(--recess-ink)] px-4 py-2 text-sm font-extrabold text-white"
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => onRsvp(event)}
          className="rounded-full bg-[var(--recess-sun)] px-4 py-2 text-sm font-extrabold text-black"
        >
          I&apos;m interested
        </button>
        <a
          href={event.links.primary}
          target="_blank"
          rel="noreferrer"
          onClick={() => onOpen(event)}
          className="rounded-full border-2 border-black/10 px-4 py-2 text-sm font-extrabold"
        >
          Open source
        </a>
      </div>
    </article>
  );
}
