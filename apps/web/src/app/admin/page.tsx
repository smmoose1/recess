"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getClientAuth,
  getClientDb,
} from "@/lib/firebase/client";
import Link from "next/link";
import {
  ScraperHistory,
  type IngestRunRow,
} from "@/components/admin/ScraperHistory";
import {
  IngestSourcesPanel,
  type IngestSourceRow,
} from "@/components/admin/IngestSourcesPanel";
import {
  SurveyAnalytics,
  type SurveyResponseRow,
} from "@/components/admin/SurveyAnalytics";
import {
  EventsAdminPanel,
  type AdminEventRow,
} from "@/components/admin/EventsAdminPanel";

type QuestionRow = {
  id: string;
  prompt: string;
  type: string;
  active: boolean;
  sortOrder: number;
};

const ADMIN_SECTIONS = [
  { id: "ingestion-sources", label: "Ingestion sources" },
  { id: "scraper-history", label: "Scraper history" },
  { id: "survey-analytics", label: "Survey analytics" },
  { id: "survey-questions", label: "Survey questions" },
  { id: "events", label: "Events" },
] as const;

type SectionId = (typeof ADMIN_SECTIONS)[number]["id"];

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [runs, setRuns] = useState<IngestRunRow[]>([]);
  const [sources, setSources] = useState<IngestSourceRow[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseRow[]>(
    []
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newType, setNewType] = useState("single_choice");
  const [newOptions, setNewOptions] = useState("Weekends,After school,Camps");
  const [activeSection, setActiveSection] =
    useState<SectionId>("ingestion-sources");

  useEffect(() => {
    return onAuthStateChanged(getClientAuth(), async (next) => {
      setUser(next);
      if (!next) {
        setIsAdmin(false);
        return;
      }
      const adminSnap = await getDoc(doc(getClientDb(), "admins", next.uid));
      setIsAdmin(adminSnap.exists());
      if (adminSnap.exists()) void loadData();
    });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const nodes = ADMIN_SECTIONS.map(({ id }) =>
      document.getElementById(id)
    ).filter((el): el is HTMLElement => Boolean(el));
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              (a.target as HTMLElement).offsetTop -
              (b.target as HTMLElement).offsetTop
          );
        if (visible[0]?.target.id) {
          setActiveSection(visible[0].target.id as SectionId);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 1],
      }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [isAdmin]);

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function loadData() {
    const db = getClientDb();
    const eventSnap = await getDocs(
      query(collection(db, "events"), orderBy("startsAt", "asc"), limit(100))
    );
    setEvents(
      eventSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          organization: data.organization,
          eventType: data.eventType || "other",
          ageGroup: data.ageGroup,
          description: data.description,
          links: data.links,
          phone: data.phone,
          startsAt: data.startsAt?.toDate?.() || undefined,
          endsAt: data.endsAt?.toDate?.() || null,
          timezone: data.timezone,
          location: data.location,
          source: data.source,
          metroIds: data.metroIds,
          status: data.status,
          adminLocked: data.adminLocked === true,
          metrics: data.metrics,
        };
      })
    );

    const qSnap = await getDocs(collection(db, "surveyQuestions"));
    setQuestions(
      qSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          prompt: data.prompt,
          type: data.type,
          active: data.active,
          sortOrder: data.sortOrder ?? 0,
        };
      })
    );

    const rSnap = await getDocs(
      query(
        collection(db, "surveyResponses"),
        orderBy("createdAt", "desc"),
        limit(500)
      )
    );
    setSurveyResponses(
      rSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          questionId: data.questionId,
          questionPrompt: data.questionPrompt,
          questionType: data.questionType,
          answer: data.answer,
          answerSummary: data.answerSummary,
          userId: data.userId,
          metroId: data.metroId,
          unlockedPage: data.unlockedPage,
          filtersSnapshot: data.filtersSnapshot,
          meta: data.meta,
          geoCity: data.geoCity,
          geoRegion: data.geoRegion,
          geoCountry: data.geoCountry,
          geoPostal: data.geoPostal,
          createdAt: data.createdAt?.toDate?.() || undefined,
        };
      })
    );

    const runSnap = await getDocs(
      query(collection(db, "ingestRuns"), orderBy("startedAt", "desc"), limit(25))
    );
    setRuns(
      runSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          platform: data.platform,
          trigger: data.trigger,
          status: data.status,
          startedAt: data.startedAt?.toDate?.() || undefined,
          finishedAt: data.finishedAt?.toDate?.() || undefined,
          durationMs: data.durationMs,
          stats: data.stats,
          sources: data.sources,
          logs: data.logs,
          errorSummary: data.errorSummary,
          warningSummary: data.warningSummary,
        };
      })
    );

    const sourceSnap = await getDocs(collection(db, "ingestSources"));
    setSources(
      sourceSnap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || d.id,
            url: data.url || "",
            adapter: data.adapter || "auto",
            enabled: data.enabled !== false,
            metroIds: data.metroIds,
            days: data.days,
            maxDetails: data.maxDetails,
            notes: data.notes,
            lastRunStatus: data.lastRunStatus,
            lastStats: data.lastStats,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    try {
      await signInWithEmailAndPassword(getClientAuth(), email, password);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function createQuestion(e: FormEvent) {
    e.preventDefault();
    const options =
      newType === "single_choice" || newType === "multi_choice"
        ? newOptions.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    await addDoc(collection(getClientDb(), "surveyQuestions"), {
      prompt: newPrompt,
      type: newType,
      options,
      active: true,
      weight: 1,
      sortOrder: questions.length + 1,
      createdAt: serverTimestamp(),
      createdBy: user?.uid || null,
    });
    setNewPrompt("");
    await loadData();
  }

  async function toggleQuestion(id: string, active: boolean) {
    await updateDoc(doc(getClientDb(), "surveyQuestions", id), { active });
    await loadData();
  }

  if (!user || !isAdmin) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <Link href="/" className="mb-6 font-extrabold text-[var(--recess-coral)]">
          ← RECESS
        </Link>
        <h1 className="brand text-5xl font-bold">Admin</h1>
        <p className="mt-2 font-semibold text-black/60">
          Sign in with an admin email.
        </p>
        <form
          onSubmit={handleLogin}
          className="mt-6 space-y-3 rounded-[28px] bg-white p-6 shadow-[var(--recess-shadow)]"
        >
          <input
            className="w-full rounded-2xl border-2 border-black/10 px-4 py-3 font-semibold"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-2xl border-2 border-black/10 px-4 py-3 font-semibold"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            className="w-full rounded-full bg-black py-3 font-extrabold text-white"
          >
            Sign in
          </button>
          {status ? (
            <p className="text-sm font-bold text-[var(--recess-coral)]">
              {status}
            </p>
          ) : null}
          {user && !isAdmin ? (
            <p className="text-sm font-bold text-[var(--recess-coral)]">
              Signed in, but not an admin.
            </p>
          ) : null}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 lg:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <aside className="lg:sticky lg:top-6 lg:w-56 lg:shrink-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 lg:mb-6 lg:block">
            <div>
              <Link
                href="/"
                className="font-extrabold text-[var(--recess-coral)]"
              >
                ← RECESS
              </Link>
              <h1 className="brand mt-2 text-4xl font-bold lg:text-5xl">
                Admin
              </h1>
              <p className="font-semibold text-black/60">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut(getClientAuth())}
              className="rounded-full border-2 border-black/10 bg-white/70 px-4 py-2 font-bold lg:mt-4"
            >
              Sign out
            </button>
          </div>

          <nav
            aria-label="Admin sections"
            className="sticky top-0 z-20 -mx-4 flex gap-2 overflow-x-auto bg-[var(--recess-cream)]/90 px-4 py-2 backdrop-blur-md lg:static lg:mx-0 lg:flex-col lg:overflow-visible lg:rounded-[24px] lg:bg-white lg:p-3 lg:shadow-[var(--recess-shadow)] lg:backdrop-blur-none"
          >
            {ADMIN_SECTIONS.map((section) => {
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-2.5 text-left text-sm font-extrabold transition lg:rounded-2xl ${
                    active
                      ? "bg-black text-white"
                      : "bg-white text-black/70 shadow-sm hover:bg-black/5 lg:bg-transparent lg:shadow-none"
                  }`}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <div id="ingestion-sources" className="scroll-mt-20 lg:scroll-mt-6">
            <IngestSourcesPanel
              sources={sources}
              busy={busy}
              status={status}
              onRefresh={loadData}
              onStatus={setStatus}
              onBusy={setBusy}
            />
          </div>

          <div id="scraper-history" className="scroll-mt-20 lg:scroll-mt-6">
            <ScraperHistory runs={runs} onRefresh={() => void loadData()} />
          </div>

          <div id="survey-analytics" className="scroll-mt-20 lg:scroll-mt-6">
            <SurveyAnalytics
              questions={questions.map((q) => ({
                id: q.id,
                prompt: q.prompt,
                type: q.type,
                active: q.active,
              }))}
              responses={surveyResponses}
              onRefresh={() => void loadData()}
            />
          </div>

          <section
            id="survey-questions"
            className="mb-8 scroll-mt-20 rounded-[28px] bg-white p-5 shadow-[var(--recess-shadow)] lg:scroll-mt-6"
          >
            <h2 className="text-2xl font-bold">Survey questions</h2>
            <p className="text-sm font-semibold text-black/60">
              {surveyResponses.length} recent responses loaded · manage
              questions below
            </p>
            <ul className="mt-4 space-y-2">
              {questions
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((q) => (
                  <li
                    key={q.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--recess-cream)] px-4 py-3"
                  >
                    <div>
                      <p className="font-bold">{q.prompt}</p>
                      <p className="text-xs font-semibold uppercase text-black/50">
                        {q.type} · {q.active ? "active" : "off"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleQuestion(q.id, !q.active)}
                      className="rounded-full bg-white px-3 py-1 text-sm font-bold"
                    >
                      {q.active ? "Disable" : "Enable"}
                    </button>
                  </li>
                ))}
            </ul>

            <form
              onSubmit={createQuestion}
              className="mt-5 space-y-2 border-t pt-4"
            >
              <p className="font-bold">Create question</p>
              <input
                required
                className="w-full rounded-2xl border-2 border-black/10 px-4 py-2 font-semibold"
                placeholder="Prompt"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
              />
              <select
                className="w-full rounded-2xl border-2 border-black/10 px-4 py-2 font-semibold"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                <option value="lead_capture">
                  Lead capture (name/email/zip)
                </option>
                <option value="single_choice">Single choice</option>
                <option value="text">Text</option>
                <option value="scale">Scale</option>
              </select>
              {(newType === "single_choice" || newType === "multi_choice") && (
                <input
                  className="w-full rounded-2xl border-2 border-black/10 px-4 py-2 font-semibold"
                  placeholder="Options (comma-separated)"
                  value={newOptions}
                  onChange={(e) => setNewOptions(e.target.value)}
                />
              )}
              <button
                type="submit"
                className="rounded-full bg-black px-4 py-2 font-extrabold text-white"
              >
                Add question
              </button>
            </form>
          </section>

          <div id="events" className="scroll-mt-20 lg:scroll-mt-6">
            <EventsAdminPanel
              events={events}
              onRefresh={() => void loadData()}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
