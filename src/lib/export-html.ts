import JSZip from "jszip";

import { linkifyPlainTextToHtml } from "@/lib/linkify-text";

import { findMediaBlob, findMediaInIndex, getMediaKind, isVoiceMessage } from "@/lib/media-types";
import type { ChatMessage, WhatsAppExport } from "@/types/whatsapp";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatGermanDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderMessageHtml(message: ChatMessage, myName: string, index: number): string {
  const outgoing = message.sender === myName;
  const attachment = message.attachment;

  let body = "";

  if (attachment && !attachment.omitted && attachment.filename) {
    const mediaPath = `media/${index}-${attachment.filename.replace(/[/\\]/g, "_")}`;
    const kind = attachment.kind;

    if (kind === "image" || kind === "sticker") {
      body += `<img src="${mediaPath}" alt="${escapeHtml(attachment.filename)}" loading="lazy" />`;
    } else if (kind === "video") {
      body += `<video controls preload="metadata" src="${mediaPath}"></video>`;
    } else if (kind === "audio") {
      const label = isVoiceMessage(attachment.filename) ? "Sprachnachricht" : "Audio";
      body += `<p class="label">${label}</p><audio controls preload="metadata" src="${mediaPath}"></audio>`;
    } else {
      body += `<a href="${mediaPath}" download>${escapeHtml(attachment.filename)}</a>`;
    }
  } else if (attachment?.omitted) {
    body += `<p class="omitted">Medien beim Export nicht enthalten</p>`;
  }

  if (message.text) {
    body += `<p class="text">${linkifyPlainTextToHtml(message.text, escapeHtml).replaceAll("\n", "<br />")}</p>`;
  }

  const editedLabel = message.edited ? `<span class="edited">bearbeitet</span>` : "";

  return `
    <article class="message ${outgoing ? "outgoing" : "incoming"}">
      <div class="bubble">
        <header>
          <strong>${escapeHtml(message.sender)}</strong>
          <span class="meta">${editedLabel}<time datetime="${message.date.toISOString()}">${formatGermanDate(message.date)}</time></span>
        </header>
        ${body}
      </div>
    </article>
  `;
}

function buildHtmlDocument(exportData: WhatsAppExport, myName: string): string {
  const messagesHtml = exportData.messages
    .map((message, index) => renderMessageHtml(message, myName, index))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(exportData.chatTitle)} – WhatsApp Archiv</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #efeae2;
        --panel: #ffffff;
        --incoming: #ffffff;
        --outgoing: #d9fdd3;
        --text: #111b21;
        --muted: #667781;
        --accent: #008069;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: linear-gradient(180deg, #008069 0%, #008069 180px, var(--bg) 180px);
        color: var(--text);
      }
      .shell {
        max-width: 920px;
        margin: 0 auto;
        min-height: 100vh;
        padding: 24px 16px 48px;
      }
      .hero, .chat {
        background: rgba(255, 255, 255, 0.96);
        border-radius: 18px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.12);
      }
      .hero {
        padding: 24px;
        margin-bottom: 18px;
      }
      .hero h1 {
        margin: 0 0 8px;
        font-size: 1.6rem;
      }
      .hero p {
        margin: 0;
        color: var(--muted);
      }
      .chat {
        padding: 18px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .message {
        display: flex;
      }
      .message.incoming { justify-content: flex-start; }
      .message.outgoing { justify-content: flex-end; }
      .bubble {
        max-width: min(100%, 640px);
        padding: 10px 12px 8px;
        border-radius: 12px;
        background: var(--incoming);
        box-shadow: 0 1px 1px rgba(11, 20, 26, 0.08);
      }
      .outgoing .bubble { background: var(--outgoing); }
      header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
        font-size: 0.78rem;
        color: var(--muted);
      }
      header strong { color: var(--accent); }
      .meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .edited {
        font-size: 0.72rem;
        color: var(--muted);
      }
      .text {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.45;
      }
      .label, .omitted {
        margin: 0 0 6px;
        font-size: 0.85rem;
        color: var(--muted);
      }
      img, video {
        display: block;
        max-width: 100%;
        border-radius: 10px;
        margin-bottom: 6px;
      }
      audio { width: min(100%, 320px); }
      a { color: #027eb5; text-decoration: underline; word-break: break-all; }
      a:hover { color: #026aa2; }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <h1>${escapeHtml(exportData.chatTitle)}</h1>
        <p>${exportData.messages.length.toLocaleString("de-DE")} Nachrichten · exportiert mit WhatsApp Archive Viewer</p>
      </section>
      <section class="chat">
        ${messagesHtml}
      </section>
    </div>
  </body>
</html>`;
}

async function resolveMediaBlob(
  exportData: WhatsAppExport,
  filename: string,
): Promise<Blob | undefined> {
  const blob = findMediaBlob(filename, exportData.mediaFiles);
  if (blob) return blob;

  if (!exportData.mediaBaseUrl) return undefined;

  const response = await fetch(
    `${exportData.mediaBaseUrl}/${encodeURIComponent(filename)}`,
  );

  if (!response.ok) return undefined;
  return response.blob();
}

export async function downloadHtmlArchive(
  exportData: WhatsAppExport,
  myName: string,
): Promise<void> {
  const zip = new JSZip();
  const mediaFolder = zip.folder("media");

  if (!mediaFolder) {
    throw new Error("ZIP konnte nicht erstellt werden.");
  }

  for (const [index, message] of exportData.messages.entries()) {
    const attachment = message.attachment;
    if (!attachment || attachment.omitted || !attachment.filename) continue;

    const blob = await resolveMediaBlob(exportData, attachment.filename);
    if (!blob) continue;

    const safeName = `${index}-${attachment.filename.replace(/[/\\]/g, "_")}`;
    mediaFolder.file(safeName, blob);
  }

  zip.file("index.html", buildHtmlDocument(exportData, myName));

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${exportData.chatTitle.replace(/[^\w\-]+/g, "-")}-archiv.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function countMediaStats(exportData: WhatsAppExport) {
  const stats = {
    images: 0,
    videos: 0,
    audio: 0,
    voice: 0,
    documents: 0,
    missing: 0,
    omitted: 0,
  };

  for (const message of exportData.messages) {
    const attachment = message.attachment;
    if (!attachment) continue;

    if (attachment.omitted) {
      stats.omitted += 1;
      continue;
    }

    const hasMedia =
      findMediaBlob(attachment.filename, exportData.mediaFiles) ||
      findMediaInIndex(attachment.filename, exportData.mediaIndex);

    if (!hasMedia) {
      stats.missing += 1;
      continue;
    }

    const kind = getMediaKind(attachment.filename);
    if (kind === "image" || kind === "sticker") stats.images += 1;
    else if (kind === "video") stats.videos += 1;
    else if (kind === "audio") {
      stats.audio += 1;
      if (isVoiceMessage(attachment.filename)) stats.voice += 1;
    } else stats.documents += 1;
  }

  return stats;
}
