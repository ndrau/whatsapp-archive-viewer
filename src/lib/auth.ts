export const SESSION_COOKIE = "wa_archive_session";

const BERLIN_TZ = "Europe/Berlin";
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isAuthDisabled(): boolean {
  return envFlag("ARCHIVE_AUTH_DISABLED");
}

export function getArchivePassword(): string | null {
  const password = process.env.ARCHIVE_PASSWORD;
  if (!password) return null;
  return password.length > 0 ? password : null;
}

export function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return secret;
}

export function isAuthConfigured(): boolean {
  return Boolean(getArchivePassword() && getAuthSecret());
}

/** Milliseconds until next midnight in Europe/Berlin (wall clock). */
export function msUntilBerlinMidnight(now = Date.now()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BERLIN_TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(now))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const elapsedMs =
    ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const remaining = dayMs - elapsedMs;
  return remaining > 0 ? remaining : dayMs;
}

export function getSessionExpiryMs(now = Date.now()): number {
  const untilMidnight = msUntilBerlinMidnight(now);
  return now + Math.min(untilMidnight, MAX_SESSION_MS);
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(signature);
}

async function verifyPayload(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await hmacKey(secret);
  const sigBytes = fromBase64Url(signature);
  const signatureBuffer = sigBytes.buffer.slice(
    sigBytes.byteOffset,
    sigBytes.byteOffset + sigBytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBuffer,
    new TextEncoder().encode(payload),
  );
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<{
  token: string;
  expiresAt: number;
}> {
  const expiresAt = getSessionExpiryMs(now);
  const payload = `v1.${expiresAt}`;
  const signature = await signPayload(payload, secret);
  return { token: `${payload}.${signature}`, expiresAt };
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [version, expRaw, signature] = parts;
  if (version !== "v1") return false;

  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  const payload = `${version}.${expRaw}`;
  try {
    return await verifyPayload(payload, signature, secret);
  } catch {
    return false;
  }
}

export function passwordsMatch(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(provided);
  const right = encoder.encode(expected);
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;

  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}

export function buildSessionCookieHeader(token: string, expiresAt: number, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookieHeader(requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function hasValidSession(
  cookieHeader: string | null | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (isAuthDisabled()) return true;
  if (!isAuthConfigured()) return false;

  const secret = getAuthSecret();
  if (!secret) return false;

  const token = parseCookieValue(cookieHeader, SESSION_COOKIE);
  return verifySessionToken(token, secret, now);
}

export function parseCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return rest.join("=");
  }
  return undefined;
}
