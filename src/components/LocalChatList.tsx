"use client";

import { useCallback, useEffect, useState } from "react";

import { ChatUploadForm } from "@/components/ChatUploadForm";
import { fetchAppConfig, fetchLocalChatList } from "@/lib/load-local-chat";

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

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const [nextChats, config] = await Promise.all([fetchLocalChatList(), fetchAppConfig()]);
      setChats(nextChats);
      setAllowChatUpload(config.allowChatUpload);
    } catch {
      setChats([]);
      setAllowChatUpload(false);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <div className="grid gap-4">
      {allowChatUpload && (
        <ChatUploadForm
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

        {loadingList ? (
          <p className="mt-5 text-sm text-[var(--wa-muted)]">Chats werden geladen…</p>
        ) : chats.length === 0 ? (
          <p className="mt-5 text-sm text-[var(--wa-muted)]">
            Noch keine Chats vorhanden. Lade oben einen WhatsApp-Export als ZIP hoch.
          </p>
        ) : (
          <div className="mt-5 grid gap-3">
            {chats.map((chat) => (
              <button
                key={chat.slug}
                type="button"
                className="flex w-full items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-4 text-left transition hover:border-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)]/40"
                onClick={() => {
                  onLoadingChange(true);
                  onError("");
                  setSuccessMessage("");
                  void Promise.resolve(onChatSelected(chat.slug, chat.title)).finally(() =>
                    onLoadingChange(false),
                  );
                }}
              >
                <div>
                  <p className="font-semibold text-[var(--wa-text)]">{chat.title}</p>
                  <p className="mt-1 text-sm text-[var(--wa-muted)]">
                    {chat.messageCount.toLocaleString("de-DE")} Nachrichten
                    {chat.mediaCount > 0
                      ? ` · ${chat.mediaCount.toLocaleString("de-DE")} Fotos & Videos`
                      : ""}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--wa-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--wa-accent-dark)]">
                  Öffnen
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
