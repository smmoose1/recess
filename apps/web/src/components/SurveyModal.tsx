"use client";

import { useEffect, useRef, useState } from "react";
import type { SurveyQuestionDoc } from "@/lib/types";

export type SurveyPurpose = "load_more" | "interested";

type Props = {
  questions: SurveyQuestionDoc[];
  purpose: SurveyPurpose;
  onClose: () => void;
  /** Called as soon as each answer is ready — do not wait for a final submit. */
  onAnswer: (question: SurveyQuestionDoc, answer: unknown) => Promise<void>;
  /** Called after the last question has been saved. */
  onComplete: () => Promise<void> | void;
};

function isLeadValid(name: string, email: string, zip: string) {
  return (
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    zip.trim().length >= 5
  );
}

export function SurveyModal({
  questions,
  purpose,
  onClose,
  onAnswer,
  onComplete,
}: Props) {
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [text, setText] = useState("");
  const [choice, setChoice] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [scale, setScale] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const lastSavedRef = useRef<string>("");

  const question = questions[index];
  const total = questions.length;
  const isLast = index >= total - 1;

  useEffect(() => {
    setName("");
    setEmail("");
    setZip("");
    setText("");
    setChoice("");
    setMulti([]);
    setScale(null);
    setError("");
    setSavedFlash(false);
    lastSavedRef.current = "";
  }, [question?.id]);

  async function persist(answer: unknown, fingerprint: string) {
    if (!question || savingRef.current) return;
    if (lastSavedRef.current === fingerprint) return;
    savingRef.current = true;
    setBusy(true);
    setError("");
    try {
      await onAnswer(question, answer);
      lastSavedRef.current = fingerprint;
      setSavedFlash(true);
      if (isLast) {
        await onComplete();
      } else {
        setIndex((i) => i + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer");
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  // Auto-save lead capture once all fields are valid.
  useEffect(() => {
    if (!question || question.type !== "lead_capture") return;
    if (!isLeadValid(name, email, zip)) return;
    const answer = {
      name: name.trim(),
      email: email.trim(),
      zip: zip.trim(),
    };
    const fingerprint = JSON.stringify(answer);
    const t = window.setTimeout(() => {
      void persist(answer, fingerprint);
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email, zip, question?.id]);

  // Auto-save free text after the user pauses typing.
  useEffect(() => {
    if (!question || question.type !== "text") return;
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    const fingerprint = trimmed;
    const t = window.setTimeout(() => {
      void persist(trimmed, fingerprint);
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, question?.id]);

  // Auto-save multi-choice after a short pause with at least one selection.
  useEffect(() => {
    if (!question || question.type !== "multi_choice") return;
    if (multi.length === 0) return;
    const fingerprint = multi.slice().sort().join("|");
    const t = window.setTimeout(() => {
      void persist(multi, fingerprint);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, question?.id]);

  if (!question) return null;

  const subtitle =
    purpose === "interested"
      ? "A few quick questions while you’re interested — answers save as you go."
      : "Answer to unlock more events — each response saves as you answer.";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="animate-slide-up w-full max-w-lg rounded-[32px] bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--recess-coral)]">
            {purpose === "interested" ? "You’re interested" : "Quick questions"}
          </p>
          <p className="text-xs font-extrabold text-black/45">
            {index + 1} / {total}
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5">
          <div
            className="h-full rounded-full bg-[var(--recess-coral)] transition-all duration-300"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>

        <h3 className="mt-4 text-2xl font-bold leading-tight">
          {question.prompt}
        </h3>
        <p className="mt-2 text-sm text-black/60">{subtitle}</p>

        <div className="mt-5 space-y-3">
          {question.type === "lead_capture" ? (
            <>
              <input
                autoFocus
                placeholder="Your name"
                className="w-full rounded-2xl border-2 border-black/10 px-4 py-3 font-semibold"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
              <input
                type="email"
                placeholder="Email"
                className="w-full rounded-2xl border-2 border-black/10 px-4 py-3 font-semibold"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
              <input
                placeholder="Zip code"
                className="w-full rounded-2xl border-2 border-black/10 px-4 py-3 font-semibold"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                disabled={busy}
              />
              <p className="text-xs font-semibold text-black/45">
                Continues automatically when name, email, and zip look complete.
              </p>
            </>
          ) : null}

          {question.type === "single_choice" ? (
            <div className="flex flex-col gap-2">
              {(question.options || []).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setChoice(opt);
                    void persist(opt, opt);
                  }}
                  className={`rounded-2xl border-2 px-4 py-3 text-left font-semibold transition disabled:opacity-60 ${
                    choice === opt
                      ? "border-[var(--recess-coral)] bg-[var(--recess-coral)]/10"
                      : "border-black/10 hover:border-black/25"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : null}

          {question.type === "multi_choice" ? (
            <div className="flex flex-col gap-2">
              {(question.options || []).map((opt) => {
                const on = multi.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setMulti((prev) =>
                        on ? prev.filter((x) => x !== opt) : [...prev, opt]
                      );
                    }}
                    className={`rounded-2xl border-2 px-4 py-3 text-left font-semibold transition disabled:opacity-60 ${
                      on
                        ? "border-[var(--recess-coral)] bg-[var(--recess-coral)]/10"
                        : "border-black/10 hover:border-black/25"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
              <p className="text-xs font-semibold text-black/45">
                Pick one or more — saves automatically after you choose.
              </p>
            </div>
          ) : null}

          {question.type === "text" ? (
            <>
              <textarea
                autoFocus
                rows={3}
                className="w-full rounded-2xl border-2 border-black/10 px-4 py-3 font-semibold"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                placeholder="Type your answer…"
              />
              <p className="text-xs font-semibold text-black/45">
                Saves automatically when you pause typing.
              </p>
            </>
          ) : null}

          {question.type === "scale" ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setScale(n);
                    void persist(n, String(n));
                  }}
                  className={`h-12 w-12 rounded-2xl border-2 text-lg font-extrabold transition disabled:opacity-60 ${
                    scale === n
                      ? "border-[var(--recess-coral)] bg-[var(--recess-coral)] text-white"
                      : "border-black/10 hover:border-black/25"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {busy || savedFlash ? (
          <p className="mt-3 text-sm font-bold text-black/55">
            {busy ? "Saving…" : "Saved"}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm font-bold text-[var(--recess-coral)]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-3 text-sm font-bold text-black/60 disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
