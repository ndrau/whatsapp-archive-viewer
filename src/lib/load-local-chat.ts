import type { ChatMessage, WhatsAppExport } from "@/types/whatsapp";

export interface RemoteChatResponse {
  slug: string;
  chatTitle: string;
  participants: string[];
  mediaFiles: string[];
  mediaBaseUrl: string;
  defaultMyName?: string;
  builtAt?: string;
  messages: Array<Omit<ChatMessage, "date"> & { date: string }>;
}

export async function loadLocalChat(slug: string): Promise<WhatsAppExport> {
  const response = await fetch(`/api/chats/${slug}`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Chat konnte nicht geladen werden.");
  }

  const data = (await response.json()) as RemoteChatResponse;

  return {
    chatTitle: data.chatTitle,
    participants: data.participants,
    mediaFiles: new Map(),
    mediaBaseUrl: data.mediaBaseUrl,
    mediaIndex: data.mediaFiles,
    localSlug: data.slug,
    defaultMyName: data.defaultMyName,
    messages: data.messages.map((message) => ({
      ...message,
      date: new Date(message.date),
    })),
  };
}

export interface LocalChatSummary {
  slug: string;
  title: string;
  messageCount: number;
  participants: string[];
  mediaCount: number;
  builtAt?: string;
  defaultMyName?: string;
}

export async function fetchLocalChatList(): Promise<LocalChatSummary[]> {
  const response = await fetch("/api/chats");

  if (!response.ok) {
    throw new Error("Lokale Chats konnten nicht geladen werden.");
  }

  const data = (await response.json()) as { chats: LocalChatSummary[] };
  return data.chats;
}
