"use client";

import { FormEvent, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ADAPTER_KINDS, METROS, detectAdapterFromUrl } from "@recess/shared";
import { getClientDb, getClientFunctions } from "@/lib/firebase/client";

export type IngestSourceRow = {
  id: string;
  name: string;
  url: string;
  adapter: string;
  enabled: boolean;
  metroIds?: string[];
  days?: number;
  maxDetails?: number;
  notes?: string;
  lastRunStatus?: string;
  lastStats?: {
    fetched?: number;
    created?: number;
    updated?: number;
    durationMs?: number;
  };
};

type Props = {
  sources: IngestSourceRow[];
  busy: boolean;
  status: string;
  onRefresh: () => Promise<void>;
  onStatus: (msg: string) => void;
  onBusy: (busy: boolean) => void;
};

const CHIP_COLORS = [
  "bg-black text-white",
  "bg-[var(--recess-coral)] text-white",
  "bg-[var(--recess-sun)] text-black",
  "bg-[var(--recess-sky)] text-black",
  "bg-[var(--recess-grass)] text-black",
];

const CSV_COLUMNS = [
  "name",
  "url",
  "adapter",
  "days",
  "maxDetails",
  "notes",
  "enabled",
  "metroIds",
] as const;

const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  [
    "Mommy Poppins NYC",
    "https://mommypoppins.com/events/118/new-york-city/all/tag/all/age/all/all/all/type/0/deals/0/near/all",
    "auto",
    "30",
    "120",
    "Example row — replace or delete",
    "true",
    "nyc",
  ]
    .map(csvEscape)
    .join(","),
].join("\n");

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Minimal RFC4180-ish CSV parser (supports quoted commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, "");
}

const HEADER_ALIASES: Record<string, (typeof CSV_COLUMNS)[number]> = {
  name: "name",
  url: "url",
  adapter: "adapter",
  days: "days",
  daysahead: "days",
  maxdetails: "maxDetails",
  maxdetailpages: "maxDetails",
  notes: "notes",
  enabled: "enabled",
  metroids: "metroIds",
  metros: "metroIds",
};

type CsvSourceRow = {
  name: string;
  url: string;
  adapter: string;
  days: number;
  maxDetails: number;
  notes: string;
  enabled: boolean;
  metroIds: string[];
};

function rowsFromCsv(text: string): { rows: CsvSourceRow[]; errors: string[] } {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one data row."] };
  }

  const headers = table[0].map(normalizeHeader);
  const index: Partial<Record<(typeof CSV_COLUMNS)[number], number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key) index[key] = i;
  });

  if (index.name == null || index.url == null) {
    return {
      rows: [],
      errors: ["CSV must include name and url columns."],
    };
  }

  const adapterSet = new Set<string>(ADAPTER_KINDS);
  const rows: CsvSourceRow[] = [];
  const errors: string[] = [];

  table.slice(1).forEach((cells, rowIdx) => {
    const line = rowIdx + 2;
    const get = (key: (typeof CSV_COLUMNS)[number]) => {
      const i = index[key];
      return i == null ? "" : (cells[i] ?? "").trim();
    };

    const name = get("name");
    const url = get("url");
    if (!name && !url) return;
    if (!name || !url) {
      errors.push(`Row ${line}: name and url are required.`);
      return;
    }
    try {
      // Validate URL shape early.
      new URL(url);
    } catch {
      errors.push(`Row ${line}: invalid url “${url}”.`);
      return;
    }

    const adapter = (get("adapter") || "auto").toLowerCase();
    if (!adapterSet.has(adapter)) {
      errors.push(
        `Row ${line}: unknown adapter “${adapter}” (use ${ADAPTER_KINDS.join(", ")}).`
      );
      return;
    }

    const daysRaw = get("days");
    const days = daysRaw ? Number(daysRaw) : 30;
    if (!Number.isFinite(days) || days < 1 || days > 60) {
      errors.push(`Row ${line}: days must be 1–60.`);
      return;
    }

    const maxRaw = get("maxDetails");
    const maxDetails = maxRaw ? Number(maxRaw) : 120;
    if (!Number.isFinite(maxDetails) || maxDetails < 0 || maxDetails > 500) {
      errors.push(`Row ${line}: maxDetails must be 0–500.`);
      return;
    }

    const enabledRaw = (get("enabled") || "true").toLowerCase();
    const enabled = !["false", "0", "no", "off"].includes(enabledRaw);

    const metroIds = get("metroIds")
      .split(/[|;]/)
      .map((m) => m.trim())
      .filter(Boolean);

    rows.push({
      name,
      url,
      adapter,
      days,
      maxDetails,
      notes: get("notes"),
      enabled,
      metroIds,
    });
  });

  return { rows, errors };
}

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE + "\n"], {
    type: "text/csv;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "recess-ingest-sources-template.csv";
  a.click();
  URL.revokeObjectURL(href);
}

export function IngestSourcesPanel({
  sources,
  busy,
  status,
  onRefresh,
  onStatus,
  onBusy,
}: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adapter, setAdapter] = useState("auto");
  const [days, setDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<IngestSourceRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCsvHelp, setShowCsvHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function trigger(sourceId: string) {
    onBusy(true);
    onStatus(
      sourceId === "all"
        ? "Running all enabled sources…"
        : `Running source ${sourceId}…`
    );
    try {
      const fn = httpsCallable(getClientFunctions(), "adminTriggerIngest", {
        timeout: 540000,
      });
      const result = await fn({ sourceId });
      const data = result.data as {
        runId?: string;
        status?: string;
        stats?: { fetched?: number; created?: number; updated?: number };
      };
      onStatus(
        `Ingest ${data.status || "done"} · run ${data.runId || "?"} · fetched ${data.stats?.fetched ?? "?"} · new ${data.stats?.created ?? "?"} · updated ${data.stats?.updated ?? "?"}`
      );
      await onRefresh();
    } catch (err) {
      onStatus(err instanceof Error ? err.message : "Ingest failed");
      await onRefresh();
    } finally {
      onBusy(false);
    }
  }

  async function createSource(e: FormEvent) {
    e.preventDefault();
    const detected =
      adapter === "auto" ? detectAdapterFromUrl(url) : adapter;
    await addDoc(collection(getClientDb(), "ingestSources"), {
      name: name.trim(),
      url: url.trim(),
      adapter,
      enabled: true,
      days,
      maxDetails: 120,
      metroIds: [],
      notes: notes.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    onStatus(`Added “${name.trim()}” (adapter: ${detected})`);
    setName("");
    setUrl("");
    setNotes("");
    setAdapter("auto");
    await onRefresh();
  }

  async function toggleEnabled(source: IngestSourceRow) {
    await updateDoc(doc(getClientDb(), "ingestSources", source.id), {
      enabled: !source.enabled,
      updatedAt: serverTimestamp(),
    });
    await onRefresh();
  }

  async function removeSource(source: IngestSourceRow) {
    if (!confirm(`Delete source “${source.name}”?`)) return;
    await deleteDoc(doc(getClientDb(), "ingestSources", source.id));
    await onRefresh();
  }

  async function handleCsvUpload(file: File) {
    setUploading(true);
    onStatus(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const { rows, errors } = rowsFromCsv(text);
      if (!rows.length) {
        onStatus(
          errors[0] || "No valid rows found in CSV. Download the template and try again."
        );
        return;
      }

      const existingUrls = new Set(
        sources.map((s) => s.url.trim().toLowerCase())
      );
      let created = 0;
      let skipped = 0;
      const db = getClientDb();

      for (const row of rows) {
        const key = row.url.trim().toLowerCase();
        if (existingUrls.has(key)) {
          skipped += 1;
          continue;
        }
        await addDoc(collection(db, "ingestSources"), {
          name: row.name,
          url: row.url,
          adapter: row.adapter,
          enabled: row.enabled,
          days: row.days,
          maxDetails: row.maxDetails,
          metroIds: row.metroIds,
          notes: row.notes || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingUrls.add(key);
        created += 1;
      }

      const errNote =
        errors.length > 0
          ? ` · ${errors.length} row error${errors.length === 1 ? "" : "s"} (see console)`
          : "";
      if (errors.length) console.warn("CSV import row errors:", errors);
      onStatus(
        `CSV import: ${created} added · ${skipped} skipped (duplicate URL)${errNote}`
      );
      await onRefresh();
    } catch (err) {
      onStatus(err instanceof Error ? err.message : "CSV upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="mb-8 rounded-[28px] bg-white p-5 shadow-[var(--recess-shadow)]">
      <h2 className="text-2xl font-bold">Ingestion sources</h2>
      <p className="mt-1 text-sm font-semibold text-black/60">
        Each chip is a named pull (name + URL) stored in Firestore. One catch-all
        Cloud Function runs them — no new deploy to add a site.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || sources.filter((s) => s.enabled).length === 0}
          onClick={() => void trigger("all")}
          className="rounded-full bg-[var(--recess-coral)] px-4 py-2 font-extrabold text-white disabled:opacity-50"
        >
          Run all enabled
        </button>
        {sources.map((source, i) => (
          <button
            key={source.id}
            type="button"
            disabled={busy || !source.enabled}
            title={source.url}
            onClick={() => void trigger(source.id)}
            className={`rounded-full px-4 py-2 text-sm font-extrabold disabled:opacity-40 ${CHIP_COLORS[i % CHIP_COLORS.length]}`}
          >
            {source.name}
            {source.lastStats?.fetched != null
              ? ` · ${source.lastStats.fetched}`
              : ""}
          </button>
        ))}
      </div>

      {status ? <p className="mt-3 text-sm font-bold">{status}</p> : null}

      <ul className="mt-5 space-y-2">
        {sources.length === 0 ? (
          <li className="rounded-2xl bg-[var(--recess-cream)] px-4 py-3 text-sm font-semibold">
            No sources yet — add Mommy Poppins NYC below to get started.
          </li>
        ) : (
          sources.map((source) => {
            const resolved =
              source.adapter === "auto"
                ? detectAdapterFromUrl(source.url)
                : source.adapter;
            return (
              <li
                key={source.id}
                className="rounded-2xl bg-[var(--recess-cream)]/70 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold">{source.name}</p>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-xs font-semibold text-[var(--recess-coral)]"
                    >
                      {source.url}
                    </a>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-black/45">
                      {source.adapter} → {resolved}
                      {source.enabled ? " · enabled" : " · disabled"}
                      {source.lastRunStatus
                        ? ` · last ${source.lastRunStatus}`
                        : ""}
                      {source.lastStats?.fetched != null
                        ? ` · fetched ${source.lastStats.fetched}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(source)}
                      className="rounded-full bg-white px-3 py-1 text-xs font-bold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleEnabled(source)}
                      className="rounded-full bg-white px-3 py-1 text-xs font-bold"
                    >
                      {source.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSource(source)}
                      className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--recess-coral)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <form
        onSubmit={createSource}
        className="mt-6 space-y-2 border-t border-black/10 pt-4"
      >
        <p className="font-bold">Add a pull source</p>
        <SourceFields
          name={name}
          url={url}
          adapter={adapter}
          days={days}
          notes={notes}
          maxDetails={120}
          showMaxDetails={false}
          onName={setName}
          onUrl={setUrl}
          onAdapter={setAdapter}
          onDays={setDays}
          onNotes={setNotes}
        />
        <button
          type="submit"
          className="rounded-full bg-black px-4 py-2 font-extrabold text-white"
        >
          Save source
        </button>
      </form>

      <div className="mt-6 space-y-3 rounded-[22px] border border-black/10 bg-[var(--recess-cream)]/60 p-4">
        <div>
          <p className="font-bold">Mass upload sources</p>
          <p className="mt-1 text-sm font-semibold text-black/55">
            Download the CSV template, fill one source per row, then upload.
            Columns: {CSV_COLUMNS.join(", ")}. Duplicate URLs are skipped.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="rounded-full border-2 border-black/10 bg-white px-4 py-2 text-sm font-extrabold"
          >
            Download CSV template
          </button>
          <button
            type="button"
            aria-label="CSV column help"
            aria-expanded={showCsvHelp}
            onClick={() => setShowCsvHelp((v) => !v)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
              showCsvHelp
                ? "border-black bg-black text-white"
                : "border-black/10 bg-white text-black/70 hover:border-black/25"
            }`}
            title="What each CSV column means"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6" />
              <path d="M12 8h.01" />
            </svg>
          </button>
          <button
            type="button"
            disabled={uploading || busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-black px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCsvUpload(file);
            }}
          />
        </div>

        {showCsvHelp ? (
          <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="font-extrabold">CSV columns</p>
              <button
                type="button"
                onClick={() => setShowCsvHelp(false)}
                className="text-xs font-bold text-black/45 hover:text-black"
              >
                Close
              </button>
            </div>
            <dl className="mt-3 space-y-3 font-semibold text-black/70">
              <div>
                <dt className="font-extrabold text-black">name</dt>
                <dd>Display name on admin chips and scraper logs.</dd>
              </div>
              <div>
                <dt className="font-extrabold text-black">url</dt>
                <dd>Public listing / calendar URL to scrape (must be a valid URL).</dd>
              </div>
              <div>
                <dt className="font-extrabold text-black">adapter</dt>
                <dd>
                  Which scraper to use. Options:{" "}
                  <span className="font-bold text-black">
                    {ADAPTER_KINDS.join(", ")}
                  </span>
                  .
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    <li>
                      <span className="font-bold text-black">auto</span> —
                      detect from the URL host
                    </li>
                    <li>
                      <span className="font-bold text-black">mommy_poppins</span>{" "}
                      / <span className="font-bold text-black">eventbrite</span>{" "}
                      / <span className="font-bold text-black">luma</span> /{" "}
                      <span className="font-bold text-black">partiful</span> —
                      platform-specific
                    </li>
                    <li>
                      <span className="font-bold text-black">generic</span> —
                      JSON-LD catch-all for unknown sites
                    </li>
                  </ul>
                </dd>
              </div>
              <div>
                <dt className="font-extrabold text-black">days</dt>
                <dd>
                  How many days ahead to walk for day-based calendars (mainly
                  Mommy Poppins). Number from{" "}
                  <span className="font-bold text-black">1–60</span>. Default{" "}
                  <span className="font-bold text-black">30</span>.
                </dd>
              </div>
              <div>
                <dt className="font-extrabold text-black">maxDetails</dt>
                <dd>
                  Max detail pages to enrich per run (rest use list data).
                  Number from <span className="font-bold text-black">0–500</span>
                  . Default <span className="font-bold text-black">120</span>.
                </dd>
              </div>
              <div>
                <dt className="font-extrabold text-black">notes</dt>
                <dd>Optional free-text note for admins.</dd>
              </div>
              <div>
                <dt className="font-extrabold text-black">enabled</dt>
                <dd>
                  Whether the source runs with “Run all enabled”. Options:{" "}
                  <span className="font-bold text-black">
                    true, false, 1, 0, yes, no, on, off
                  </span>
                  . Default <span className="font-bold text-black">true</span>.
                </dd>
              </div>
              <div>
                <dt className="font-extrabold text-black">metroIds</dt>
                <dd>
                  Optional metro tags, separated by{" "}
                  <span className="font-bold text-black">;</span> or{" "}
                  <span className="font-bold text-black">|</span> or commas.
                  Known IDs:{" "}
                  <span className="font-bold text-black">
                    {METROS.map((m) => m.id).join(", ")}
                  </span>
                  .
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>

      {editing ? (
        <EditSourceModal
          source={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            onStatus(`Updated “${editing.name}”`);
            await onRefresh();
          }}
        />
      ) : null}
    </section>
  );
}

function SourceFields({
  name,
  url,
  adapter,
  days,
  notes,
  maxDetails,
  showMaxDetails = true,
  onName,
  onUrl,
  onAdapter,
  onDays,
  onNotes,
  onMaxDetails,
}: {
  name: string;
  url: string;
  adapter: string;
  days: number;
  notes: string;
  maxDetails: number;
  showMaxDetails?: boolean;
  onName: (v: string) => void;
  onUrl: (v: string) => void;
  onAdapter: (v: string) => void;
  onDays: (v: number) => void;
  onNotes: (v: string) => void;
  onMaxDetails?: (v: number) => void;
}) {
  return (
    <>
      <input
        required
        className="w-full rounded-2xl border-2 border-black/10 px-4 py-2 font-semibold"
        placeholder='Name (e.g. "Mommy Poppins NYC")'
        value={name}
        onChange={(e) => onName(e.target.value)}
      />
      <input
        required
        type="url"
        className="w-full rounded-2xl border-2 border-black/10 px-4 py-2 font-semibold"
        placeholder="https://mommypoppins.com/events/118/new-york-city/..."
        value={url}
        onChange={(e) => onUrl(e.target.value)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Adapter
          <select
            className="mt-1 w-full rounded-2xl border-2 border-black/10 px-3 py-2 font-semibold"
            value={adapter}
            onChange={(e) => onAdapter(e.target.value)}
          >
            {ADAPTER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
                {k === "auto" ? " (detect from URL)" : ""}
                {k === "generic" ? " (JSON-LD catch-all)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Days ahead (Mommy Poppins)
          <input
            type="number"
            min={1}
            max={60}
            className="mt-1 w-full rounded-2xl border-2 border-black/10 px-3 py-2 font-semibold"
            value={days}
            onChange={(e) => onDays(Number(e.target.value) || 30)}
          />
        </label>
        {showMaxDetails && onMaxDetails ? (
          <label className="text-sm font-bold sm:col-span-2">
            Max detail pages
            <input
              type="number"
              min={1}
              max={500}
              className="mt-1 w-full rounded-2xl border-2 border-black/10 px-3 py-2 font-semibold"
              value={maxDetails}
              onChange={(e) => onMaxDetails(Number(e.target.value) || 120)}
            />
          </label>
        ) : null}
      </div>
      <input
        className="w-full rounded-2xl border-2 border-black/10 px-4 py-2 font-semibold"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
      />
    </>
  );
}

function EditSourceModal({
  source,
  onClose,
  onSaved,
}: {
  source: IngestSourceRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url);
  const [adapter, setAdapter] = useState(source.adapter || "auto");
  const [days, setDays] = useState(source.days ?? 30);
  const [maxDetails, setMaxDetails] = useState(source.maxDetails ?? 120);
  const [notes, setNotes] = useState(source.notes || "");
  const [enabled, setEnabled] = useState(source.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(getClientDb(), "ingestSources", source.id), {
        name: name.trim(),
        url: url.trim(),
        adapter,
        enabled,
        days,
        maxDetails,
        notes: notes.trim() || null,
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
        className="animate-slide-up max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl"
      >
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--recess-coral)]">
          Edit source
        </p>
        <h3 className="mt-2 text-2xl font-bold leading-tight">{source.name}</h3>

        <div className="mt-5 space-y-2">
          <SourceFields
            name={name}
            url={url}
            adapter={adapter}
            days={days}
            notes={notes}
            maxDetails={maxDetails}
            onName={setName}
            onUrl={setUrl}
            onAdapter={setAdapter}
            onDays={setDays}
            onNotes={setNotes}
            onMaxDetails={setMaxDetails}
          />
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Enabled
          </label>
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
