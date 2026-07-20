"use client";

import { useMemo, useState } from "react";

import { ChatViewer } from "@/components/ChatViewer";
import { LocalChatList } from "@/components/LocalChatList";
import { UploadZone } from "@/components/UploadZone";
import { countMediaStats, downloadHtmlArchive } from "@/lib/export-html";
import type { WhatsAppExport } from "@/types/whatsapp";

export function ArchiveApp() {
  const [exportData, setExportData] = useState<WhatsAppExport | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [myName, setMyName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const stats = useMemo(
    () => (exportData ? countMediaStats(exportData) : null),
    [exportData],
  );

  function handleExportLoaded(data: WhatsAppExport, label: string) {
    setExportData(data);
    setSourceLabel(label);
    setSearchQuery("");
    setError("");
    setMyName((current) => current || data.defaultMyName || data.participants[0] || "");
  }

  return (
    <div className="min-h-screen bg-[var(--wa-page-bg)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6">
        <header className="mb-8 rounded-[28px] bg-[var(--wa-accent)] px-6 py-8 text-white shadow-xl">
          <p className="text-sm uppercase tracking-[0.24em] text-white/70">WhatsApp Archive Viewer</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
            Chats schön lesen und als HTML archivieren
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85 sm:text-base">
            Lädt deinen WhatsApp-Export mit <strong>_chat.txt</strong> und Medien, zeigt Bilder,
            Videos und Sprachnachrichten an und erzeugt optional ein offline lesbares HTML-Archiv.
            Alles passiert lokal im Browser.
          </p>
        </header>

        {!exportData ? (
          <>
            <LocalChatList
              onExportLoaded={handleExportLoaded}
              onError={setError}
              onLoadingChange={setLoading}
            />

            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-black/10" />
              <span className="text-sm text-[var(--wa-muted)]">oder neu importieren</span>
              <div className="h-px flex-1 bg-black/10" />
            </div>

            <UploadZone
              onExportLoaded={handleExportLoaded}
              onError={setError}
              onLoadingChange={setLoading}
            />

            <section className="mt-6 rounded-3xl border border-black/10 bg-white/80 p-6">
              <h2 className="text-lg font-semibold text-[var(--wa-text)]">
                Sind Sprachnachrichten im Export dabei?
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--wa-muted)]">
                Ja, wenn du beim Export <strong>„Medien anhängen“</strong> wählst. Sprachnachrichten
                landen meist als <code>.opus</code> oder <code>.m4a</code> Dateien (oft mit{" "}
                <code>PTT</code> im Dateinamen) und lassen sich hier direkt abspielen.
              </p>
            </section>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <section className="rounded-3xl bg-white/90 p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm text-[var(--wa-muted)]">Geladen: {sourceLabel}</p>
                  <h2 className="text-2xl font-semibold text-[var(--wa-text)]">
                    {exportData.chatTitle}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--wa-muted)]">
                    {exportData.messages.length.toLocaleString("de-DE")} Nachrichten ·{" "}
                    {exportData.participants.length} Teilnehmer
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium"
                    onClick={() => {
                      setExportData(null);
                      setSourceLabel("");
                      setError("");
                    }}
                  >
                    Anderen Export laden
                  </button>
                  <button
                    type="button"
                    disabled={exporting || !myName}
                    className="rounded-full bg-[var(--wa-accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      if (!exportData || !myName) return;
                      setExporting(true);
                      try {
                        await downloadHtmlArchive(exportData, myName);
                      } finally {
                        setExporting(false);
                      }
                    }}
                  >
                    {exporting ? "Export läuft…" : "HTML-Archiv herunterladen"}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--wa-text)]">
                    Dein Name im Export
                  </span>
                  <select
                    value={myName}
                    onChange={(event) => setMyName(event.target.value)}
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                  >
                    {exportData.participants.map((participant) => (
                      <option key={participant} value={participant}>
                        {participant}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-[var(--wa-text)]">
                    Suche
                  </span>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Nach Text, Namen oder Dateinamen suchen…"
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                  />
                </label>
              </div>

              {stats && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <StatBadge label="Bilder" value={stats.images} />
                  <StatBadge label="Videos" value={stats.videos} />
                  <StatBadge label="Audio" value={stats.audio} />
                  <StatBadge label="Sprachnachrichten" value={stats.voice} />
                  <StatBadge label="Dokumente" value={stats.documents} />
                  {stats.omitted > 0 && (
                    <StatBadge label="Medien nicht im Export" value={stats.omitted} muted />
                  )}
                  {stats.missing > 0 && (
                    <StatBadge label="Dateien fehlen" value={stats.missing} muted />
                  )}
                </div>
              )}
            </section>

            <ChatViewer
              exportData={exportData}
              options={{ myName, searchQuery }}
            />
          </div>
        )}

        {(loading || error) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4">
            <div className="rounded-full bg-[#111b21] px-5 py-3 text-sm text-white shadow-lg">
              {loading ? "Export wird gelesen…" : error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        muted ? "bg-black/5 text-[var(--wa-muted)]" : "bg-[var(--wa-accent-soft)] text-[var(--wa-accent-dark)]"
      }`}
    >
      {label}: {value.toLocaleString("de-DE")}
    </span>
  );
}
