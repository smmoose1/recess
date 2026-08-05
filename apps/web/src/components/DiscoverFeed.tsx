"use client";

import { useCallback, useEffect, useState } from "react";
import { PAGE_SIZE } from "@recess/shared";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { FilterBar } from "./FilterBar";
import { MobileFilterNav } from "./MobileFilterNav";
import { MobileHeader } from "./MobileHeader";
import { EventCard } from "./EventCard";
import { SurveyModal, type SurveyPurpose } from "./SurveyModal";
import { useAuth } from "./AuthProvider";
import { fetchEventsPage } from "@/lib/events";
import {
  getClientDb,
  getClientFunctions,
} from "@/lib/firebase/client";
import type { EventDoc, Filters, SurveyQuestionDoc } from "@/lib/types";

function clientMeta() {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    languages: Array.from(navigator.languages || []),
    platform: navigator.platform,
    screen:
      typeof window !== "undefined"
        ? `${window.screen.width}x${window.screen.height}`
        : "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
  };
}

export function DiscoverFeed() {
  const { user, loading: authLoading } = useAuth();
  const [filters, setFilters] = useState<Filters>({
    metroId: "nyc",
    eventType: "all",
    ageLabel: "All ages",
    businessName: "",
  });
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [page, setPage] = useState(1);
  const [maxUnlocked, setMaxUnlocked] = useState(1);
  const [loading, setLoading] = useState(true);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestionDoc[]>(
    []
  );
  const [surveyPurpose, setSurveyPurpose] =
    useState<SurveyPurpose>("load_more");
  const [surveyEventId, setSurveyEventId] = useState<string | null>(null);
  const [pendingUnlockPage, setPendingUnlockPage] = useState<number | null>(
    null
  );
  const [detail, setDetail] = useState<EventDoc | null>(null);
  const [status, setStatus] = useState("");

  const loadPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      setLoading(true);
      try {
        const batch = await fetchEventsPage(filters, pageNum);
        setEvents((prev) => (replace ? batch : [...prev, ...batch]));
        setPage(pageNum);
      } catch (err) {
        console.error(err);
        setStatus("Could not load events. Try again in a moment.");
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    setEvents([]);
    setPage(1);
    void loadPage(1, true);
  }, [filters, loadPage]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const snap = await getDoc(doc(getClientDb(), "users", user.uid));
      const max = snap.data()?.maxUnlockedPage;
      if (typeof max === "number" && max > 1) setMaxUnlocked(max);
    })();
  }, [user]);

  async function openSurvey(opts: {
    purpose: SurveyPurpose;
    unlockPage?: number;
    eventId?: string;
  }) {
    if (!user) {
      setStatus("Still signing you in — try again in a second.");
      return;
    }
    const uid = user.uid;

    const q = query(
      collection(getClientDb(), "surveyQuestions"),
      where("active", "==", true),
      orderBy("sortOrder", "asc")
    );
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<SurveyQuestionDoc, "id">),
    }));

    async function unlockWithoutSurvey(pageNum: number, note: string) {
      await setDoc(
        doc(getClientDb(), "users", uid),
        {
          maxUnlockedPage: pageNum,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMaxUnlocked(pageNum);
      setStatus(note);
      await loadPage(pageNum, false);
    }

    if (!all.length) {
      if (opts.purpose === "load_more" && opts.unlockPage) {
        await unlockWithoutSurvey(
          opts.unlockPage,
          "No survey questions yet — unlock skipped for now."
        );
      }
      return;
    }

    const answered = await getDocs(
      query(
        collection(getClientDb(), "surveyResponses"),
        where("userId", "==", uid)
      )
    );
    const answeredIds = new Set(answered.docs.map((d) => d.data().questionId));
    // Walk through every active question that this user hasn't answered yet.
    const queue = all.filter((qq) => !answeredIds.has(qq.id));

    if (!queue.length) {
      if (opts.purpose === "load_more" && opts.unlockPage) {
        await unlockWithoutSurvey(opts.unlockPage, "Unlocked more events");
      }
      return;
    }

    setSurveyPurpose(opts.purpose);
    setSurveyEventId(opts.eventId || null);
    setPendingUnlockPage(opts.unlockPage ?? null);
    setSurveyQuestions(queue);
    setSurveyOpen(true);
  }

  async function handleLoadMore() {
    const nextPage = page + 1;
    if (nextPage <= maxUnlocked) {
      await loadPage(nextPage, false);
      return;
    }
    await openSurvey({
      purpose: "load_more",
      unlockPage: nextPage,
    });
  }

  async function handleSurveyAnswer(
    question: SurveyQuestionDoc,
    answer: unknown
  ) {
    if (!user) return;
    const isLast =
      surveyQuestions[surveyQuestions.length - 1]?.id === question.id;
    const unlock =
      surveyPurpose === "load_more" &&
      isLast &&
      pendingUnlockPage != null
        ? pendingUnlockPage
        : undefined;

    const fn = httpsCallable(getClientFunctions(), "submitSurveyAndUnlock");
    await fn({
      questionId: question.id,
      answer,
      unlockedPage: unlock,
      filtersSnapshot: filters,
      clientMeta: clientMeta(),
      context: surveyPurpose,
      eventId: surveyEventId,
    });
  }

  async function handleSurveyComplete() {
    const unlockPage = pendingUnlockPage;
    setSurveyOpen(false);
    setSurveyQuestions([]);
    setSurveyEventId(null);
    setPendingUnlockPage(null);

    if (surveyPurpose === "load_more" && unlockPage != null) {
      setMaxUnlocked(unlockPage);
      await loadPage(unlockPage, false);
      setStatus("Unlocked more events");
    } else if (surveyPurpose === "interested") {
      setStatus("Thanks — you’re marked interested");
    }
  }

  async function handleOpen(event: EventDoc) {
    setDetail(event);
    try {
      const fn = httpsCallable(getClientFunctions(), "recordClick");
      await fn({ eventId: event.id });
    } catch {
      // local-only ok if functions not deployed yet
    }
  }

  async function handleRsvp(event: EventDoc) {
    try {
      const fn = httpsCallable(getClientFunctions(), "rsvpEvent");
      await fn({ eventId: event.id, status: "interested" });
      setStatus(`You're interested in “${event.title}”`);
      setDetail(null);
      await openSurvey({
        purpose: "interested",
        eventId: event.id,
      });
    } catch {
      setStatus("RSVP saved locally once functions are deployed.");
    }
  }

  return (
    <>
      <MobileHeader />
      <main className="mx-auto min-h-screen max-w-5xl px-4 pb-28 pt-4 md:pb-20 md:pt-8 sm:px-6">
      <header className="animate-pop hidden md:block">
        <p className="animate-bounce-soft inline-flex rounded-full bg-[var(--recess-sun)] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] text-black">
          for kids + parents
        </p>
        <h1 className="brand mt-3 text-6xl font-bold tracking-tight text-[var(--recess-ink)] sm:text-7xl">
          RECESS
        </h1>
        <p className="mt-3 max-w-xl text-lg font-semibold text-black/70">
          What&apos;s fun near you — storytimes, camps, museums, and more.
        </p>
      </header>

      <FilterBar filters={filters} onChange={setFilters} />
      <MobileFilterNav filters={filters} onChange={setFilters} />

      <section className="mt-4 space-y-4 md:mt-8">
        {authLoading || loading ? (
          <p className="rounded-[28px] bg-white/70 p-6 font-bold">
            Finding fun…
          </p>
        ) : null}

        {!loading && events.length === 0 ? (
          <div className="rounded-[28px] bg-white p-8 shadow-[var(--recess-shadow)]">
            <h2 className="text-2xl font-bold">No events yet for these filters</h2>
            <p className="mt-2 font-semibold text-black/65">
              Try another metro, or ask an admin to run the scrapers / seed data.
            </p>
          </div>
        ) : null}

        {events.map((event, index) => (
          <EventCard
            key={`${event.id}-${index}`}
            event={event}
            index={index}
            onOpen={handleOpen}
            onRsvp={handleRsvp}
          />
        ))}
      </section>

      <div className="mt-8 flex flex-col items-center gap-3">
        {status ? (
          <p className="text-center text-sm font-bold text-black/70">{status}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleLoadMore()}
          disabled={loading || (events.length < PAGE_SIZE && page === 1)}
          className="rounded-full bg-[var(--recess-coral)] px-8 py-4 text-base font-extrabold text-white shadow-lg disabled:opacity-50"
        >
          Load more ({PAGE_SIZE} more)
        </button>
        <p className="text-xs font-semibold text-black/50">
          Page {page} · unlocks through {maxUnlocked}
        </p>
      </div>

      {surveyOpen && surveyQuestions.length ? (
        <SurveyModal
          questions={surveyQuestions}
          purpose={surveyPurpose}
          onClose={() => {
            setSurveyOpen(false);
            setSurveyQuestions([]);
            setPendingUnlockPage(null);
            setSurveyEventId(null);
          }}
          onAnswer={handleSurveyAnswer}
          onComplete={handleSurveyComplete}
        />
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="animate-slide-up max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[32px] bg-white p-6">
            <h3 className="text-3xl font-bold">{detail.title}</h3>
            <p className="mt-1 font-semibold text-black/60">
              {detail.organization}
            </p>
            <p className="mt-4 text-sm leading-relaxed">{detail.description}</p>
            <p className="mt-4 text-sm font-bold">
              {detail.startsAt.toLocaleString()}
            </p>
            <p className="text-sm">
              {detail.location.name}
              <br />
              {detail.location.address}
              {detail.location.city
                ? `, ${detail.location.city}, ${detail.location.region}`
                : ""}
            </p>
            <div className="mt-6 flex gap-2">
              <a
                href={detail.links.primary}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-black px-5 py-3 text-sm font-extrabold text-white"
              >
                Go to event
              </a>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-full px-5 py-3 text-sm font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </main>
    </>
  );
}
