import { dayKeyFromDate, formatDayLabel } from "@/lib/chat-day";
import { buildDisplayItems, type ChatDisplayItem } from "@/lib/media-groups";
import type { ChatMessage } from "@/types/whatsapp";

export type VirtualChatRow =
  | {
      kind: "day-header";
      id: string;
      dayKey: string;
      label: string;
    }
  | {
      kind: "display-item";
      id: string;
      dayKey: string;
      item: ChatDisplayItem;
    }
  | {
      kind: "search-result";
      id: string;
      messageId: string;
      dayKey: string;
      sender: string;
      text: string;
      date: Date;
      attachment?: string;
    };

export function buildVirtualRows(messages: ChatMessage[]): VirtualChatRow[] {
  const rows: VirtualChatRow[] = [];
  const displayItems = buildDisplayItems(messages);
  let currentDayKey: string | undefined;

  for (const item of displayItems) {
    const date = item.kind === "message" ? item.message.date : item.date;
    const dayKey = dayKeyFromDate(date);

    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      rows.push({
        kind: "day-header",
        id: `day-${dayKey}`,
        dayKey,
        label: formatDayLabel(date),
      });
    }

    rows.push({
      kind: "display-item",
      id: item.kind === "message" ? item.message.id : item.id,
      dayKey,
      item,
    });
  }

  return rows;
}

export function findRowIndexForDay(rows: VirtualChatRow[], dayKey: string): number {
  return rows.findIndex((row) => row.kind === "day-header" && row.dayKey === dayKey);
}

export function findRowIndexForMessage(rows: VirtualChatRow[], messageId: string): number {
  return rows.findIndex(
    (row) =>
      (row.kind === "display-item" &&
        (row.item.kind === "message"
          ? row.item.message.id === messageId
          : row.item.items.some((entry) => entry.messageId === messageId))) ||
      (row.kind === "search-result" && row.messageId === messageId),
  );
}
