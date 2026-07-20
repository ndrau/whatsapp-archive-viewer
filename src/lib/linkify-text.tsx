import type { ReactNode } from "react";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

function splitTrailingPunctuation(value: string): { url: string; trail: string } {
  let url = value;
  let trail = "";

  while (url.length > 0) {
    const last = url.at(-1);
    if (!last || !/[),.;:!?\]]/.test(last)) break;
    trail = last + trail;
    url = url.slice(0, -1);
  }

  return { url, trail };
}

export function normalizeLinkHref(url: string): string {
  if (url.startsWith("www.")) {
    return `https://${url}`;
  }

  return url;
}

export function linkifyTextToNodes(text: string, keyPrefix = "link"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let linkIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawMatch = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    const { url, trail } = splitTrailingPunctuation(rawMatch);

    if (url) {
      nodes.push(
        <a
          key={`${keyPrefix}-${matchIndex}-${linkIndex++}`}
          href={normalizeLinkHref(url)}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link break-all"
        >
          {url}
        </a>,
      );
    } else {
      nodes.push(rawMatch);
    }

    if (trail) {
      nodes.push(trail);
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function linkifyPlainTextToHtml(text: string, escapeHtml: (value: string) => string): string {
  let result = "";
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawMatch = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, matchIndex));
    }

    const { url, trail } = splitTrailingPunctuation(rawMatch);

    if (url) {
      const href = escapeHtml(normalizeLinkHref(url));
      const label = escapeHtml(url);
      result += `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>${escapeHtml(trail)}`;
    } else {
      result += escapeHtml(rawMatch);
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  return result;
}

export function linkifyTextToHtml(text: string): string {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  return linkifyPlainTextToHtml(text, escape);
}
