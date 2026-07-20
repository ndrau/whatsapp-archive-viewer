"use client";

import { useCallback, useEffect, useState } from "react";

import { ChatUploadForm } from "@/components/ChatUploadForm";
import {
  deleteLocalChat,
  fetchAppConfig,
  fetchLocalChatList,
} from "@/lib/load-local-chat";

interface LocalChatListProps {
  onChatSelected: (slug: string, label: string) => void | Promise<void>;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function LocalChatList({
  onChatSelected,
  onError,
  onLoadingChange,
}: LocalChatListProps) {
  const [chats, setChats] = useState<
    Array<{
      slug: string;
      title: string;
      messageCount: number;
      mediaCount: number;
    }>
  >([]);
  const [loadingList, setLoadingList] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [allowChatUpload, setAllowChatUpload] = useState(false);
  const [listError, setListError] = useState("");
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError("");
    try {
      const [nextChats, config] = await Promise.all([fetchLocalChatList(), fetchAppConfig()]);
      setChats(nextChats);
      setAllowChatUpload(config.allowChatUpload);
    } catch (error) {
      setChats([]);
      setAllowChatUpload(false);
      const message =
        error instanceof Error ? error.message : "Chat-Liste konnte nicht geladen werden.";
      setListError(message);
      onError(message);
    } finally {
      setLoadingList(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function handleDeleteChat(chat: { slug: string; title: string }) {
    const confirmed = window.confirm(
      `„${chat.title}“ wirklich unwiderruflich löschen?\n\n` +
        "Es werden der Export (Quelle) und die vorbereiteten Dateien gelöscht. Das lässt sich nicht rückgängig machen.",
    );
    if (!confirmed) return;

    setDeletingSlug(chat.slug);
    onError("");
    setSuccessMessage("");
    try {
      await deleteLocalChat(chat.slug);
      setSuccessMessage(`„${chat.title}“ wurde gelöscht.`);
      await loadList();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat konnte nicht gelöscht werden.";
      onError(message);
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <div className="grid gap-4">
      {allowChatUpload && (
        <ChatUploadForm
          existingSlugs={chats.map((chat) => chat.slug)}
          onError={onError}
          onCompleted={async () => {
            setSuccessMessage("Chat ist bereit und erscheint in der Liste.");
            onError("");
            await loadList();
          }}
        />
      )}

      <section className="rounded-3xl border border-black/10 bg-white/80 p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--wa-accent)]">
            Deine Chats
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--wa-text)]">Zum Öffnen antippen</h2>
          <p className="mt-1 text-sm text-[var(--wa-muted)]">
            Wähle einen Chat aus, um die Nachrichten chronologisch anzusehen.
          </p>
        </div>

        {successMessage && (
          <p className="mt-4 rounded-xl bg-[var(--wa-accent-soft)] px-3 py-2 text-sm text-[var(--wa-accent-dark)]">
            {successMessage}
          </p>
        )}

        {listError && (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {listError}
          </p>
        )}

        {loadingList ? (
          <p className="mt-5 text-sm text-[var(--wa-muted)]">Chats werden geladen…</p>
        ) : chats.length === 0 ? (
          <p className="mt-5 text-sm text-[var(--wa-muted)]">
            {listError
              ? "Liste konnte nicht geladen werden."
              : allowChatUpload
                ? "Noch keine Chats vorhanden. Lade oben einen WhatsApp-Export als ZIP hoch."
                : "Noch keine Chats vorhanden."}
          </p>
        ) : (
          <div className="mt-5 grid gap-3">
            {chats.map((chat) => (
              <div
                key={chat.slug}
                className="flex w-full items-stretch gap-2 rounded-2xl border border-black/10 bg-white p-2 transition hover:border-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)]/40"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between rounded-xl px-3 py-3 text-left"
                  disabled={deletingSlug === chat.slug}
                  onClick={() => {
                    onLoadingChange(true);
                    onError("");
                    setSuccessMessage("");
                    void Promise.resolve(onChatSelected(chat.slug, chat.title)).finally(() =>
                      onLoadingChange(false),
                    );
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--wa-text)]">{chat.title}</p>
                    <p className="mt-1 text-sm text-[var(--wa-muted)]">
                      {chat.messageCount.toLocaleString("de-DE")} Nachrichten
                      {chat.mediaCount > 0
                        ? ` · ${chat.mediaCount.toLocaleString("de-DE")} Fotos & Videos`
                        : ""}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-full bg-[var(--wa-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--wa-accent-dark)]">
                    Öffnen
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 self-center rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  disabled={deletingSlug !== null}
                  aria-label={`„${chat.title}“ löschen`}
                  onClick={() => void handleDeleteChat(chat)}
                >
                  {deletingSlug === chat.slug ? "Lösche…" : "Löschen"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
