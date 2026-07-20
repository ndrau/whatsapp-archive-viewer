import { getMediaKind } from "@/lib/media-types";
import { extractEditedMarker } from "@/lib/message-meta";
import type { ChatMessage, ParsedAttachment } from "@/types/whatsapp";

const INVISIBLE_CHARS = /[\u200e\u200f\ufeff\u202a-\u202e]/g;
const LEADING_INVISIBLE = /^[\u200e\u200f\ufeff\u202a-\u202e]+/;

const MESSAGE_LINE =
  /^(?:\[(\d{1,2}[./]\d{1,2}[./]\d{2,4}),?\s(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APMapm]{2})?)\]|(\d{1,2}[./]\d{1,2}[./]\d{2,4}),?\s(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APMapm]{2})?)\s-)\s([^:]+):\s*([\s\S]*)$/;

const ATTACHMENT_PATTERNS: Array<{ regex: RegExp; omitted?: boolean }> = [
  { regex: /^<?Anhang:\s*(.+?)>?$/i },
  { regex: /^<?attached:\s*(.+?)>?$/i },
  { regex: /^<?Adjunto:\s*(.+?)>?$/i },
  { regex: /^(.+\.(?:jpg|jpeg|png|gif|webp|heic|mp4|mov|3gp|opus|ogg|m4a|aac|mp3|amr|pdf|vcf|webp))\s*\(file attached\)$/i },
  { regex: /^(?:‎)?Bild weggelassen$/i, omitted: true },
  { regex: /^(?:‎)?image omitted$/i, omitted: true },
  { regex: /^(?:‎)?Video weggelassen$/i, omitted: true },
  { regex: /^(?:‎)?video omitted$/i, omitted: true },
  { regex: /^(?:‎)?Audiodatei weggelassen$/i, omitted: true },
  { regex: /^(?:‎)?Sprachnachricht weggelassen$/i, omitted: true },
  { regex: /^(?:‎)?audio omitted$/i, omitted: true },
  { regex: /^(?:‎)?Sticker weggelassen$/i, omitted: true },
  { regex: /^(?:‎)?sticker omitted$/i, omitted: true },
  { regex: /^<?Mediendatei ausgeschlossen>?$/i, omitted: true },
  { regex: /^<?media omitted>?$/i, omitted: true },
  { regex: /^\(file attached\)$/i, omitted: true },
];

const MEDIA_FILENAME =
  /^.+\.(jpg|jpeg|png|gif|webp|heic|mp4|mov|3gp|opus|ogg|m4a|aac|mp3|amr|pdf|vcf)$/i;

const OMITTED_TEXT_SUFFIX =
  /\s*(?:‎)?(?:Bild weggelassen|image omitted|Video weggelassen|video omitted|Audiodatei weggelassen|Sprachnachricht weggelassen|audio omitted|Sticker weggelassen|sticker omitted|Mediendatei ausgeschlossen|media omitted|\(file attached\))\s*$/i;

const MERGE_WINDOW_MS = 2_000;
const DUPLICATE_CAPTION_WINDOW_MS = 3_000;
/** Consecutive image/video lines that belong to one album send. */
const ALBUM_RUN_WINDOW_MS = 30_000;
/**
 * WhatsApp (esp. iOS) often exports the same album twice: first as ~1600px
 * previews, then again as full-resolution files — sometimes a few seconds later,
 * sometimes up to ~2 minutes — with the same caption repeated.
 */
const DUPLICATE_ALBUM_WINDOW_MS = 120_000;

export type MediaBytesLookup = (filename: string) => number | undefined;

export interface ParseWhatsAppOptions {
  /** Optional file sizes from the export folder — used to keep HD over preview copies. */
  getMediaBytes?: MediaBytesLookup;
}

function cleanText(value: string): string {
  return value.replace(INVISIBLE_CHARS, "").trim();
}

function normalizeLineForParsing(line: string): string {
  return line.replace(LEADING_INVISIBLE, "");
}

function parseDate(datePart: string, timePart: string): Date {
  const normalizedDate = datePart.includes("/")
    ? parseSlashDate(datePart)
    : parseDotDate(datePart);

  const timeMatch = timePart.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?(AM|PM|am|pm))?$/,
  );

  if (!timeMatch) {
    return normalizedDate;
  }

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = Number(timeMatch[3] ?? 0);
  const meridiem = timeMatch[4]?.toUpperCase();

  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  normalizedDate.setHours(hours, minutes, seconds, 0);
  return normalizedDate;
}

function parseDotDate(value: string): Date {
  const [day, month, yearPart] = value.split(".");
  const year = normalizeYear(Number(yearPart));
  return new Date(year, Number(month) - 1, Number(day));
}

function parseSlashDate(value: string): Date {
  const [firstPart, secondPart, yearPart] = value.split("/");
  const first = Number(firstPart);
  const second = Number(secondPart);
  const year = normalizeYear(Number(yearPart));

  // Disambiguate MM/DD vs DD/MM. Prefer day-first (EU) when both ≤ 12.
  let day: number;
  let month: number;
  if (first > 12) {
    day = first;
    month = second;
  } else if (second > 12) {
    month = first;
    day = second;
  } else {
    day = first;
    month = second;
  }

  return new Date(year, month - 1, day);
}

function normalizeYear(year: number): number {
  if (year < 100) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }
  return year;
}

function parseAttachment(content: string): ParsedAttachment | undefined {
  const trimmed = cleanText(content);

  for (const pattern of ATTACHMENT_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (!match) continue;

    if (pattern.omitted) {
      const kind = trimmed.toLowerCase().includes("video")
        ? "video"
        : trimmed.toLowerCase().includes("sticker")
          ? "sticker"
          : trimmed.toLowerCase().includes("audio") ||
              trimmed.toLowerCase().includes("sprach")
            ? "audio"
            : "image";

      return {
        kind,
        filename: "",
        omitted: true,
      };
    }

    const filename = cleanText(match[1]);
    return {
      kind: getMediaKind(filename),
      filename,
      omitted: false,
    };
  }

  if (MEDIA_FILENAME.test(trimmed)) {
    return {
      kind: getMediaKind(trimmed),
      filename: trimmed,
      omitted: false,
    };
  }

  return undefined;
}

const INLINE_ATTACHMENT_PATTERNS = [
  /<Anhang:\s*(.+?)>/i,
  /<attached:\s*(.+?)>/i,
  /<Adjunto:\s*(.+?)>/i,
  /(.+\.(?:jpg|jpeg|png|gif|webp|heic|mp4|mov|3gp|opus|ogg|m4a|aac|mp3|amr|pdf|vcf|webp))\s*\(file attached\)/i,
];

function splitMessageContent(content: string): { text: string; attachment?: ParsedAttachment } {
  const trimmed = cleanText(content);
  const wholeAttachment = parseAttachment(trimmed);

  if (wholeAttachment) {
    return { text: "", attachment: wholeAttachment };
  }

  for (const pattern of INLINE_ATTACHMENT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const filename = cleanText(match[1]);
    const text = cleanText(trimmed.replace(match[0], ""));

    return {
      text,
      attachment: {
        kind: getMediaKind(filename),
        filename,
        omitted: false,
      },
    };
  }

  return { text: trimmed, attachment: undefined };
}

function createMessage(
  index: number,
  datePart: string,
  timePart: string,
  sender: string,
  content: string,
  participants: Set<string>,
): ChatMessage {
  participants.add(sender);

  const { text, attachment } = splitMessageContent(content);
  const editedMeta = extractEditedMarker(text);

  return {
    id: `msg-${index}`,
    date: parseDate(datePart, timePart),
    sender,
    text: editedMeta.text,
    edited: editedMeta.edited || undefined,
    attachment,
  };
}

function inferChatTitle(filename: string): string {
  const base = filename.replace(/\.txt$/i, "");
  const match = base.match(/WhatsApp Chat - (.+)/i);
  return match?.[1]?.trim() || "WhatsApp Chat";
}

function stripOmittedTextSuffix(text: string): string {
  return cleanText(text.replace(OMITTED_TEXT_SUFFIX, ""));
}

function isEmptyMessage(message: ChatMessage): boolean {
  return !message.text.trim() && !message.attachment;
}

function isAttachmentOnly(message: ChatMessage): boolean {
  return Boolean(message.attachment) && !message.text.trim();
}

function isTextOnly(message: ChatMessage): boolean {
  return Boolean(message.text.trim()) && !message.attachment;
}

function timeDeltaMs(previous: ChatMessage, next: ChatMessage): number {
  return Math.abs(next.date.getTime() - previous.date.getTime());
}

function mergeSplitMessages(into: ChatMessage, from: ChatMessage): ChatMessage {
  const text = stripOmittedTextSuffix(into.text.trim() || from.text.trim());

  return {
    ...into,
    date: into.date,
    text,
    attachment: into.attachment ?? from.attachment,
    edited: into.edited || from.edited,
  };
}

function consolidateSplitMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const message of messages) {
    const previous = result.at(-1);

    if (
      previous &&
      previous.sender === message.sender &&
      timeDeltaMs(previous, message) <= MERGE_WINDOW_MS
    ) {
      if (isTextOnly(previous) && isAttachmentOnly(message)) {
        result[result.length - 1] = mergeSplitMessages(previous, message);
        continue;
      }

      if (isAttachmentOnly(previous) && isTextOnly(message)) {
        result[result.length - 1] = mergeSplitMessages(message, previous);
        continue;
      }
    }

    result.push(message);
  }

  return result;
}

function stripDuplicateCaptions(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => {
    if (!message.text.trim() || !message.attachment) {
      return message;
    }

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = messages[cursor];
      if (previous.sender !== message.sender) break;
      if (timeDeltaMs(previous, message) > DUPLICATE_CAPTION_WINDOW_MS) break;

      // Only strip when the previous line is also media (album caption repeat),
      // not when the same short text was sent as a real standalone message.
      if (
        previous.attachment &&
        !previous.attachment.omitted &&
        previous.text.trim() === message.text.trim()
      ) {
        return { ...message, text: "" };
      }
    }

    return message;
  });
}

function isGroupableMediaMessage(message: ChatMessage): boolean {
  const attachment = message.attachment;
  if (!attachment || attachment.omitted || !attachment.filename) return false;
  return attachment.kind === "image" || attachment.kind === "video";
}

function albumCaption(messages: ChatMessage[]): string {
  for (const message of messages) {
    const text = message.text.trim();
    if (text) return text;
  }
  return "";
}

function mediaRunBytes(messages: ChatMessage[], getMediaBytes?: MediaBytesLookup): number {
  if (!getMediaBytes) return 0;
  return messages.reduce((total, message) => {
    const filename = message.attachment?.filename;
    if (!filename) return total;
    return total + (getMediaBytes(filename) ?? 0);
  }, 0);
}

function collectMediaRun(messages: ChatMessage[], start: number): ChatMessage[] {
  const first = messages[start];
  if (!first || !isGroupableMediaMessage(first)) return [];

  const run = [first];
  for (let index = start + 1; index < messages.length; index += 1) {
    const message = messages[index];
    const previous = run.at(-1)!;
    if (message.sender !== first.sender) break;
    if (!isGroupableMediaMessage(message)) break;
    if (timeDeltaMs(previous, message) > ALBUM_RUN_WINDOW_MS) break;
    run.push(message);
  }
  return run;
}

function splitRunByCaptionAnchors(run: ChatMessage[]): ChatMessage[][] {
  const bursts: ChatMessage[][] = [];
  let current: ChatMessage[] = [];

  for (const message of run) {
    if (message.text.trim() && current.length > 0) {
      bursts.push(current);
      current = [];
    }
    current.push(message);
  }

  if (current.length > 0) bursts.push(current);
  return bursts;
}

/**
 * Same album exported twice in one run, caption repeated on the second half:
 *   caption+img, img, caption+img, img  → keep the later half (usually HD).
 */
function dedupeRepeatedCaptionMediaRuns(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  let index = 0;

  while (index < messages.length) {
    const run = collectMediaRun(messages, index);
    if (run.length < 2) {
      result.push(messages[index]!);
      index += 1;
      continue;
    }

    const bursts = splitRunByCaptionAnchors(run);
    if (bursts.length >= 2) {
      const kept: ChatMessage[] = [];
      let burstIndex = 0;

      while (burstIndex < bursts.length) {
        const current = bursts[burstIndex]!;
        const next = bursts[burstIndex + 1];
        const currentCaption = current[0]?.text.trim() ?? "";
        const nextCaption = next?.[0]?.text.trim() ?? "";

        if (
          next &&
          currentCaption &&
          currentCaption === nextCaption &&
          current.length === next.length
        ) {
          kept.push(...next);
          burstIndex += 2;
          continue;
        }

        kept.push(...current);
        burstIndex += 1;
      }

      result.push(...kept);
      index += run.length;
      continue;
    }

    result.push(...run);
    index += run.length;
  }

  return result;
}

/**
 * Preview batch (~1600px) then HD batch in the same run without a second caption.
 * Prefer the heavier half when every preview file is smaller than every HD file.
 */
function dedupePreviewHdHalvesInRuns(
  messages: ChatMessage[],
  getMediaBytes?: MediaBytesLookup,
): ChatMessage[] {
  if (!getMediaBytes) return messages;

  const result: ChatMessage[] = [];
  let index = 0;

  while (index < messages.length) {
    const run = collectMediaRun(messages, index);
    if (run.length < 2 || run.length % 2 !== 0) {
      if (run.length === 0) {
        result.push(messages[index]!);
        index += 1;
      } else {
        result.push(...run);
        index += run.length;
      }
      continue;
    }

    const half = run.length / 2;
    const first = run.slice(0, half);
    const second = run.slice(half);
    const firstBytes = first.map((message) => getMediaBytes(message.attachment!.filename) ?? 0);
    const secondBytes = second.map((message) => getMediaBytes(message.attachment!.filename) ?? 0);

    const complete =
      firstBytes.every((value) => value > 0) && secondBytes.every((value) => value > 0);
    const firstTotal = firstBytes.reduce((sum, value) => sum + value, 0);
    const secondTotal = secondBytes.reduce((sum, value) => sum + value, 0);
    const maxFirst = Math.max(...firstBytes);
    const minSecond = Math.min(...secondBytes);
    const maxSecond = Math.max(...secondBytes);
    const minFirst = Math.min(...firstBytes);

    if (complete && maxFirst < minSecond && firstTotal * 2 < secondTotal) {
      result.push(...second);
    } else if (complete && maxSecond < minFirst && secondTotal * 2 < firstTotal) {
      result.push(...first);
    } else {
      result.push(...run);
    }

    index += run.length;
  }

  return result;
}

/**
 * Two separate album sends with the same caption/count a short time apart
 * (preview album, then HD album). Keep the heavier / later one.
 */
function dedupeNearDuplicateAlbums(
  messages: ChatMessage[],
  getMediaBytes?: MediaBytesLookup,
): ChatMessage[] {
  type Run = { start: number; end: number; messages: ChatMessage[]; caption: string };

  const runs: Run[] = [];
  let index = 0;
  while (index < messages.length) {
    const run = collectMediaRun(messages, index);
    if (run.length >= 2) {
      runs.push({
        start: index,
        end: index + run.length,
        messages: run,
        caption: albumCaption(run),
      });
      index += run.length;
      continue;
    }
    index += 1;
  }

  if (runs.length < 2) return messages;

  const drop = new Set<number>();

  for (let runIndex = 0; runIndex < runs.length - 1; runIndex += 1) {
    const current = runs[runIndex]!;
    const next = runs[runIndex + 1]!;
    if (current.messages[0]!.sender !== next.messages[0]!.sender) continue;
    if (!current.caption || current.caption !== next.caption) continue;
    if (current.messages.length !== next.messages.length) continue;
    if (timeDeltaMs(current.messages[0]!, next.messages[0]!) > DUPLICATE_ALBUM_WINDOW_MS) {
      continue;
    }

    // Require clear byte evidence (preview ≪ HD). Never drop without sizes —
    // identical captions alone are too common for false positives.
    if (!getMediaBytes) continue;
    const currentBytes = mediaRunBytes(current.messages, getMediaBytes);
    const nextBytes = mediaRunBytes(next.messages, getMediaBytes);
    if (currentBytes <= 0 || nextBytes <= 0) continue;
    const heavier = Math.max(currentBytes, nextBytes);
    const lighter = Math.min(currentBytes, nextBytes);
    if (heavier < lighter * 2) continue;

    const doomed = nextBytes > currentBytes ? current : next;
    for (let messageIndex = doomed.start; messageIndex < doomed.end; messageIndex += 1) {
      drop.add(messageIndex);
    }
  }

  if (drop.size === 0) return messages;
  return messages.filter((_, messageIndex) => !drop.has(messageIndex));
}

function reindexMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => ({
    ...message,
    id: `msg-${index}`,
  }));
}

export function consolidateMessages(
  messages: ChatMessage[],
  options: ParseWhatsAppOptions = {},
): ChatMessage[] {
  const withoutEmpty = messages.filter((message) => !isEmptyMessage(message));
  const merged = consolidateSplitMessages(withoutEmpty);
  const withoutRepeatedCaptions = dedupeRepeatedCaptionMediaRuns(merged);
  const withoutPreviewHalves = dedupePreviewHdHalvesInRuns(
    withoutRepeatedCaptions,
    options.getMediaBytes,
  );
  const withoutDuplicateAlbums = dedupeNearDuplicateAlbums(
    withoutPreviewHalves,
    options.getMediaBytes,
  );
  const normalized = stripDuplicateCaptions(withoutDuplicateAlbums);
  return reindexMessages(normalized);
}

export function parseWhatsAppChat(
  text: string,
  sourceName = "_chat.txt",
  options: ParseWhatsAppOptions = {},
) {
  const normalizedText = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");
  const messages: ChatMessage[] = [];
  const participants = new Set<string>();

  let current: ChatMessage | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const normalized = normalizeLineForParsing(line);
    const match = normalized.match(MESSAGE_LINE);

    if (match) {
      const datePart = match[1] ?? match[3];
      const timePart = match[2] ?? match[4];
      const sender = cleanText(match[5]);
      const content = cleanText(match[6]);

      current = createMessage(messages.length, datePart, timePart, sender, content, participants);
      messages.push(current);
      continue;
    }

    if (current) {
      const extra = cleanText(line);
      if (extra) {
        current.text = current.text ? `${current.text}\n${extra}` : extra;

        const resplit = splitMessageContent(current.text);
        const editedMeta = extractEditedMarker(resplit.text);
        current.text = editedMeta.text;
        if (editedMeta.edited) current.edited = true;
        if (resplit.attachment && !current.attachment) {
          current.attachment = resplit.attachment;
        }
      }
    }
  }

  return {
    chatTitle: inferChatTitle(sourceName),
    messages: consolidateMessages(messages, options),
    participants: [...participants].sort((a, b) => a.localeCompare(b, "de")),
  };
}
