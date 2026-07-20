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
  const [mobileFullscreen, setMobileFullscreen] = useState(false);

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

  useEffect(() => {
    if (!chatIndex) setMobileFullscreen(false);
  }, [chatIndex]);

  useEffect(() => {
    document.body.dataset.chatFullscreen = mobileFullscreen ? "true" : "false";
    return () => {
      delete document.body.dataset.chatFullscreen;
    };
  }, [mobileFullscreen]);

  // Fullscreen is mobile-only — leave it when rotating/resizing to desktop.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (media.matches) setMobileFullscreen(false);
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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
    <div
      className={`chat-shell flex flex-col bg-[var(--wa-page-bg)] ${
        mobileFullscreen ? "chat-shell--fullscreen" : ""
      }`}
    >
      <div
        className={`mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden ${
          mobileFullscreen ? "px-0 py-0" : "px-3 py-3 sm:px-4"
        }`}
      >
        <header
          className={`shrink-0 bg-[var(--wa-accent)] text-white ${
            mobileFullscreen
              ? "rounded-none px-3 py-2 shadow-none"
              : "mb-3 rounded-2xl px-4 py-3 shadow-lg"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {!mobileFullscreen && (
                <p className="truncate text-xs uppercase tracking-[0.2em] text-white/70">
                  {sourceLabel}
                </p>
              )}
              <h1
                className={`truncate font-semibold ${
                  mobileFullscreen ? "text-base" : "text-xl"
                }`}
              >
                {chatIndex.chatTitle}
              </h1>
              {!mobileFullscreen && (
                <p className="text-xs text-white/80">
                  {chatIndex.messageCount.toLocaleString("de-DE")} Nachrichten
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {mobileFullscreen ? (
                <button
                  type="button"
                  className="rounded-full border border-white/25 px-3 py-1.5 text-sm font-medium md:hidden"
                  onClick={() => setMobileFullscreen(false)}
                >
                  Beenden
                </button>
              ) : (
                <>
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
                  <button
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[var(--wa-accent)] md:hidden"
                    onClick={() => setMobileFullscreen(true)}
                  >
                    Vollbild
                  </button>
                  <LogoutButton variant="light" />
                </>
              )}
            </div>
          </div>
        </header>

        {!mobileFullscreen && (
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
        )}

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
