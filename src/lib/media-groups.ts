import type { ChatMessage, ParsedAttachment } from "@/types/whatsapp";

export interface MediaGalleryItem {
  messageId: string;
  attachment: ParsedAttachment;
}

export type ChatDisplayItem =
  | { kind: "message"; message: ChatMessage }
  | {
      kind: "media-group";
      id: string;
      sender: string;
      date: Date;
      caption?: string;
      messages: ChatMessage[];
      items: MediaGalleryItem[];
    };

const ALBUM_WINDOW_MS = 30_000;

function hasGroupableMedia(message: ChatMessage): boolean {
  const attachment = message.attachment;
  if (!attachment || attachment.omitted || !attachment.filename) return false;

  return attachment.kind === "image" || attachment.kind === "video";
}

function canJoinAlbumGroup(previous: ChatMessage, next: ChatMessage): boolean {
  if (previous.sender !== next.sender) return false;
  if (!hasGroupableMedia(next)) return false;

  const delta = Math.abs(new Date(next.date).getTime() - new Date(previous.date).getTime());
  return delta <= ALBUM_WINDOW_MS;
}

function collectAlbumCaption(groupMessages: ChatMessage[]): string | undefined {
  for (const message of groupMessages) {
    const text = message.text.trim();
    if (text) return text;
  }

  return undefined;
}

export function buildDisplayItems(messages: ChatMessage[]): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = [];
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];

    if (hasGroupableMedia(message)) {
      const groupMessages = [message];
      let cursor = index + 1;

      while (cursor < messages.length && canJoinAlbumGroup(groupMessages.at(-1)!, messages[cursor]!)) {
        groupMessages.push(messages[cursor]!);
        cursor += 1;
      }

      if (groupMessages.length > 1) {
        items.push({
          kind: "media-group",
          id: groupMessages.map((entry) => entry.id).join("-"),
          sender: message.sender,
          date: groupMessages.at(-1)!.date,
          caption: collectAlbumCaption(groupMessages),
          messages: groupMessages,
          items: groupMessages
            .filter(
              (entry) =>
                entry.attachment && !entry.attachment.omitted && entry.attachment.filename,
            )
            .map((entry) => ({
              messageId: entry.id,
              attachment: entry.attachment!,
            })),
        });
        index = cursor;
        continue;
      }
    }

    items.push({ kind: "message", message });
    index += 1;
  }

  return items;
}

export function getPreviewItems(items: MediaGalleryItem[], maxVisible = 4): {
  visible: MediaGalleryItem[];
  hiddenCount: number;
} {
  if (items.length <= maxVisible) {
    return { visible: items, hiddenCount: 0 };
  }

  return {
    visible: items.slice(0, maxVisible),
    hiddenCount: items.length - maxVisible,
  };
}
