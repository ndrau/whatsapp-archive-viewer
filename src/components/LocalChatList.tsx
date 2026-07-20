"use client";

import { useEffect, useState } from "react";

import { fetchLocalChatList, loadLocalChat, type LocalChatSummary } from "@/lib/load-local-chat";
import type { WhatsAppExport } from "@/types/whatsapp";

interface LocalChatListProps {
  onExportLoaded: (exportData: WhatsAppExport, sourceLabel: string) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function LocalChatList({
  onExportLoaded,
  onError,
  onLoadingChange,
}: LocalChatListProps) {
  const [chats, setChats] = useState<LocalChatSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildHint, setBuildHint] = useState<string | null>(null);

  async function loadList() {
    setLoadingList(true);
    try {
      const nextChats = await fetchLocalChatList();
      setChats(nextChats);
      setBuildHint(
        nextChats.length === 0
          ? "Noch kein Chat-Build vorhanden. Einmal npm run build:chats ausführen."
          : null,
      );
    } catch {
      setChats([]);
      setBuildHint("Chat-Build fehlt. Bitte npm run build:chats ausführen.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  async function rebuildChats() {
    setBuilding(true);
    onError("");

    try {
      const response = await fetch("/api/chats", { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Chat-Build fehlgeschlagen.");
      }

      await loadList();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Chat-Build fehlgeschlagen.");
    } finally {
      setBuilding(false);
    }
  }

  if (loadingList) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white/80 p-6">
        <p className="text-sm text-[var(--wa-muted)]">Gespeicherte Chats werden geladen…</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-black/10 bg-white/80 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--wa-accent)]">
            Gespeicherte Chats
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--wa-text)]">Aus dem Ordner chats/</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--wa-muted)]">
            Rohdaten liegen unverändert in <code>chats/&lt;name&gt;/</code>. Der Build schreibt
            nur nach <code>.built/chats/</code> – deine Export-Dateien bleiben unangetastet.
          </p>
        </div>

        <button
          type="button"
          disabled={building}
          onClick={() => void rebuildChats()}
          className="rounded-full border border-[var(--wa-accent)] px-4 py-2 text-sm font-semibold text-[var(--wa-accent)] disabled:opacity-50"
        >
          {building ? "Baue Chats…" : "Chats neu bauen"}
        </button>
      </div>

      {buildHint && (
        <p className="mt-4 rounded-2xl bg-[var(--wa-accent-soft)] px-4 py-3 text-sm text-[var(--wa-accent-dark)]">
          {buildHint}
        </p>
      )}

      {chats.length > 0 && (
        <div className="mt-5 grid gap-3">
          {chats.map((chat) => (
            <button
              key={chat.slug}
              type="button"
              className="flex w-full items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-4 text-left transition hover:border-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)]/40"
              onClick={async () => {
                onLoadingChange(true);
                onError("");

                try {
                  const exportData = await loadLocalChat(chat.slug);
                  onExportLoaded(exportData, `chats/${chat.slug}`);
                } catch (error) {
                  onError(
                    error instanceof Error ? error.message : "Chat konnte nicht geladen werden.",
                  );
                } finally {
                  onLoadingChange(false);
                }
              }}
            >
              <div>
                <p className="font-semibold text-[var(--wa-text)]">{chat.title}</p>
                <p className="mt-1 text-sm text-[var(--wa-muted)]">
                  {chat.messageCount.toLocaleString("de-DE")} Nachrichten ·{" "}
                  {chat.mediaCount.toLocaleString("de-DE")} Medien
                </p>
              </div>
              <span className="rounded-full bg-[var(--wa-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--wa-accent-dark)]">
                {chat.slug}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
