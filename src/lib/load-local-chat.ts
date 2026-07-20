import type { BuiltDayIndex } from "@/types/built-chat";
import type { ChatMessage, WhatsAppExport } from "@/types/whatsapp";

export interface ChatIndexResponse {
  slug: string;
  chatTitle: string;
  participants: string[];
  mediaFiles: string[];
  mediaBaseUrl: string;
  defaultMyName?: string;
  builtAt?: string;
  messageCount: number;
  days: BuiltDayIndex[];
}

export interface ChatMessagesResponse {
  centerDay?: string;
  dayKeys: string[];
  messages: Array<Omit<ChatMessage, "date"> & { date: string }>;
}

export interface ChatSearchResponse {
  results: Array<{
    id: string;
    date: string;
    sender: string;
    text: string;
    attachment?: string;
  }>;
}

export async function fetchLocalChatList() {
  const response = await fetch("/api/chats");

  if (!response.ok) {
    throw new Error("Lokale Chats konnten nicht geladen werden.");
  }

  const data = (await response.json()) as {
    chats: Array<{
      slug: string;
      title: string;
      messageCount: number;
      participants: string[];
      mediaCount: number;
      builtAt?: string;
      defaultMyName?: string;
    }>;
  };

  return data.chats;
}

export async function fetchAppConfig(): Promise<{ allowChatUpload: boolean }> {
  const response = await fetch("/api/config");
  if (!response.ok) {
    return { allowChatUpload: false };
  }
  const data = (await response.json()) as { allowChatUpload?: boolean };
  return { allowChatUpload: Boolean(data.allowChatUpload) };
}

export async function deleteLocalChat(slug: string): Promise<void> {
  const response = await fetch(`/api/chats/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Chat konnte nicht gelöscht werden.");
  }
}

export async function loadChatIndex(slug: string): Promise<ChatIndexResponse> {
  const response = await fetch(`/api/chats/${slug}`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Chat konnte nicht geladen werden.");
  }

  return (await response.json()) as ChatIndexResponse;
}

export async function loadChatMessages(
  slug: string,
  centerDay?: string,
  radius = 7,
): Promise<ChatMessagesResponse> {
  const params = new URLSearchParams({ radius: String(radius) });
  if (centerDay) params.set("centerDay", centerDay);

  const response = await fetch(`/api/chats/${slug}/messages?${params.toString()}`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Nachrichten konnten nicht geladen werden.");
  }

  return (await response.json()) as ChatMessagesResponse;
}

export async function searchChatMessages(slug: string, query: string): Promise<ChatSearchResponse> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`/api/chats/${slug}/search?${params.toString()}`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Suche fehlgeschlagen.");
  }

  return (await response.json()) as ChatSearchResponse;
}

export function toWhatsAppExport(index: ChatIndexResponse, messages: ChatMessage[]): WhatsAppExport {
  return {
    chatTitle: index.chatTitle,
    participants: index.participants,
    mediaFiles: new Map(),
    mediaBaseUrl: index.mediaBaseUrl,
    mediaIndex: index.mediaFiles,
    localSlug: index.slug,
    defaultMyName: index.defaultMyName,
    messages,
  };
}

export async function loadChatMessageRange(
  slug: string,
  fromDay: string,
  toDay: string,
): Promise<ChatMessagesResponse> {
  const params = new URLSearchParams({ fromDay, toDay });
  const response = await fetch(`/api/chats/${slug}/messages?${params.toString()}`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Nachrichten konnten nicht geladen werden.");
  }

  return (await response.json()) as ChatMessagesResponse;
}
