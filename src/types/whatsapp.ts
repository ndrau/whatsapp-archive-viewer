export type MediaKind = "image" | "video" | "audio" | "document" | "contact" | "sticker";

export interface ParsedAttachment {
  kind: MediaKind;
  filename: string;
  omitted: boolean;
}

export interface ChatMessage {
  id: string;
  date: Date;
  sender: string;
  text: string;
  edited?: boolean;
  attachment?: ParsedAttachment;
}

export interface WhatsAppExport {
  chatTitle: string;
  messages: ChatMessage[];
  mediaFiles: Map<string, Blob>;
  participants: string[];
  mediaBaseUrl?: string;
  mediaIndex?: string[];
  localSlug?: string;
  defaultMyName?: string;
}

export interface ChatViewOptions {
  myName: string;
  searchQuery: string;
}
