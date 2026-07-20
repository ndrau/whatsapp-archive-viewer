"use client";

import { useEffect, useMemo, useState } from "react";

import { ChatViewer } from "@/components/ChatViewer";
import { LocalChatList } from "@/components/LocalChatList";
import { LogoutButton } from "@/components/LogoutButton";
import { getMediaKind, isVoiceMessage } from "@/lib/media-types";
import {
  loadChatIndex,
  toWhatsAppExport,
  type ChatIndexResponse,
} from "@/lib/load-local-chat";
import type { WhatsAppExport } from "@/types/whatsapp";

export function ArchiveApp() {
  const [chatIndex, setChatIndex] = useState<ChatIndexResponse | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [myName, setMyName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const exportData = useMemo<WhatsAppExport | null>(() => {
    if (!chatIndex) return null;

    return toWhatsAppExport(chatIndex, []);
  }, [chatIndex]);

  const stats = useMemo(() => {
    if (!chatIndex) return null;

    const next = { images: 0, videos: 0, audio: 0, voice: 0 };

    for (const filename of chatIndex.mediaFiles) {
      const kind = getMediaKind(filename);
      if (kind === "image" || kind === "sticker") next.images += 1;
      else if (kind === "video") next.videos += 1;
      else if (kind === "audio") {
        next.audio += 1;
        if (isVoiceMessage(filename)) next.voice += 1;
      }
    }

    return next;
  }, [chatIndex]);

  useEffect(() => {
    document.body.dataset.chatOpen = chatIndex ? "true" : "false";
    return () => {
      delete document.body.dataset.chatOpen;
    };
  }, [chatIndex]);

  async function handleChatSelected(slug: string, label: string) {
    setLoading(true);
    setError("");

    try {
      const index = await loadChatIndex(slug);
      setChatIndex(index);
      setSourceLabel(label);
      setSearchQuery("");
      setMyName(index.defaultMyName || index.participants[0] || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chat konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  if (!chatIndex || !exportData) {
    return (
      <div className="min-h-screen bg-[var(--wa-page-bg)]">
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8 sm:px-6">
          <header className="mb-8 rounded-[28px] bg-[var(--wa-accent)] px-6 py-8 text-white shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm uppercase tracking-[0.24em] text-white/70">WhatsApp Archiv</p>
                <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Deine Chats wieder lesen</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">
                  Hier kannst du gespeicherte WhatsApp-Chats ganz einfach durchscrollen — mit Fotos,
                  Videos und Sprachnachrichten, so wie damals.
                </p>
              </div>
              <LogoutButton variant="light" />
            </div>
          </header>

          <LocalChatList
            onChatSelected={handleChatSelected}
            onError={setError}
            onLoadingChange={setLoading}
          />

          {(loading || error) && <StatusToast loading={loading} error={error} />}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-shell flex flex-col bg-[var(--wa-page-bg)]">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-3 py-3 sm:px-4">
        <header className="mb-3 shrink-0 rounded-2xl bg-[var(--wa-accent)] px-4 py-3 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs uppercase tracking-[0.2em] text-white/70">{sourceLabel}</p>
              <h1 className="truncate text-xl font-semibold">{chatIndex.chatTitle}</h1>
              <p className="text-xs text-white/80">
                {chatIndex.messageCount.toLocaleString("de-DE")} Nachrichten
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-white/25 px-3 py-1.5 text-sm font-medium"
                onClick={() => {
                  setChatIndex(null);
                  setSourceLabel("");
                  setError("");
                }}
              >
                Zurück
              </button>
              <LogoutButton variant="light" />
            </div>
          </div>
        </header>

        <section className="mb-3 shrink-0 rounded-2xl bg-white/90 p-3 shadow-sm sm:p-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--wa-text)]">
                Wer bist du in diesem Chat?
              </span>
              <select
                value={myName}
                onChange={(event) => setMyName(event.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              >
                {chatIndex.participants.map((participant) => (
                  <option key={participant} value={participant}>
                    {participant}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--wa-text)]">Suche</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Nachricht oder Name suchen…"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          {stats && (
            <div className="mt-3 flex flex-wrap gap-2">
              <StatBadge label="Bilder" value={stats.images} />
              <StatBadge label="Videos" value={stats.videos} />
              <StatBadge label="Audio" value={stats.audio} />
              <StatBadge label="Sprachnachrichten" value={stats.voice} />
            </div>
          )}
        </section>

        <ChatViewer
          chatIndex={chatIndex}
          exportData={exportData}
          myName={myName}
          searchQuery={searchQuery}
        />

        {(loading || error) && <StatusToast loading={loading} error={error} />}
      </div>
    </div>
  );
}

function StatusToast({ loading, error }: { loading: boolean; error: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="rounded-full bg-[#111b21] px-5 py-3 text-sm text-white shadow-lg">
        {loading ? "Chat wird geladen…" : error}
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
