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
      messages: ChatMessage[];
      items: MediaGalleryItem[];
    };

const GROUP_WINDOW_MS = 2 * 60 * 1000;

function isGridMedia(message: ChatMessage): boolean {
  const attachment = message.attachment;
  if (!attachment || attachment.omitted || !attachment.filename) return false;

  return (
    (attachment.kind === "image" || attachment.kind === "video") &&
    message.text.trim().length === 0
  );
}

function canJoinMediaGroup(previous: ChatMessage, next: ChatMessage): boolean {
  if (previous.sender !== next.sender) return false;
  if (!isGridMedia(next)) return false;

  const delta = Math.abs(new Date(next.date).getTime() - new Date(previous.date).getTime());
  return delta <= GROUP_WINDOW_MS;
}

export function buildDisplayItems(messages: ChatMessage[]): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = [];
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];

    if (isGridMedia(message)) {
      const groupMessages = [message];
      let cursor = index + 1;

      while (cursor < messages.length && canJoinMediaGroup(groupMessages.at(-1)!, messages[cursor])) {
        groupMessages.push(messages[cursor]);
        cursor += 1;
      }

      if (groupMessages.length > 1) {
        items.push({
          kind: "media-group",
          id: groupMessages.map((entry) => entry.id).join("-"),
          sender: message.sender,
          date: groupMessages.at(-1)!.date,
          messages: groupMessages,
          items: groupMessages
            .filter((entry) => entry.attachment && !entry.attachment.omitted && entry.attachment.filename)
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
