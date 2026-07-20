"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { normalizeSlugInput } from "@/lib/slug-name";

type UploadJobStatus = "uploading" | "extracting" | "building" | "done" | "error";

type UploadJob = {
  id: string;
  status: UploadJobStatus;
  slug: string;
  title?: string;
  message: string;
  error?: string;
  messageCount?: number;
  mediaCount?: number;
};

interface ChatUploadFormProps {
  existingSlugs?: string[];
  onCompleted: () => void | Promise<void>;
  onError: (message: string) => void;
}

const POLL_TIMEOUT_MS = 45 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;

function statusLabel(status: UploadJob["status"]): string {
  switch (status) {
    case "uploading":
      return "Upload…";
    case "extracting":
      return "Wird entpackt…";
    case "building":
      return "Wird vorbereitet…";
    case "done":
      return "Fertig";
    case "error":
      return "Fehler";
    default:
      return status;
  }
}

export function ChatUploadForm({
  existingSlugs = [],
  onCompleted,
  onError,
}: ChatUploadFormProps) {
  const [slugInput, setSlugInput] = useState("");
  const [title, setTitle] = useState("");
  const [defaultMyName, setDefaultMyName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [job, setJob] = useState<UploadJob | null>(null);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  const slugPreview = useMemo(() => normalizeSlugInput(slugInput), [slugInput]);
  const willOverwrite = Boolean(slugPreview && existingSlugs.includes(slugPreview));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function pollJob(jobId: string): Promise<UploadJob> {
    const started = Date.now();

    for (;;) {
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        throw new Error("Die Verarbeitung dauert zu lange. Bitte später den Status prüfen.");
      }

      const response = await fetch(`/api/chats/upload/${jobId}`);
      const data = (await response.json()) as UploadJob & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Status konnte nicht geladen werden.");
      }

      if (mountedRef.current) setJob(data);

      if (data.status === "done" || data.status === "error") {
        return data;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  function uploadWithProgress(formData: FormData): Promise<{ jobId: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/chats/upload");
      xhr.timeout = POLL_TIMEOUT_MS;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !mountedRef.current) return;
        setUploadPercent(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText) as { jobId?: string; error?: string };
          if (xhr.status >= 200 && xhr.status < 300 && data.jobId) {
            resolve({ jobId: data.jobId });
            return;
          }
          reject(new Error(data.error || "Upload fehlgeschlagen."));
        } catch {
          reject(new Error("Upload fehlgeschlagen."));
        }
      };

      xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload."));
      xhr.ontimeout = () => reject(new Error("Upload-Timeout. Bitte erneut versuchen."));
      xhr.send(formData);
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    onError("");

    if (!file) {
      onError("Bitte eine WhatsApp-ZIP-Datei auswählen.");
      return;
    }
    if (!slugPreview) {
      onError("Bitte einen Chat-Namen angeben.");
      return;
    }

    if (willOverwrite) {
      const ok = window.confirm(
        `Chat „${slugPreview}“ existiert bereits und wird komplett ersetzt. Fortfahren?`,
      );
      if (!ok) return;
    }

    setBusy(true);
    setJob(null);
    setUploadPercent(0);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("slug", slugPreview);
      if (title.trim()) formData.set("title", title.trim());
      if (defaultMyName.trim()) formData.set("defaultMyName", defaultMyName.trim());

      const { jobId } = await uploadWithProgress(formData);
      if (mountedRef.current) setUploadPercent(100);

      const result = await pollJob(jobId);
      if (result.status === "error") {
        onError(result.error || result.message || "Verarbeitung fehlgeschlagen.");
        return;
      }

      setSlugInput("");
      setTitle("");
      setDefaultMyName("");
      setFile(null);
      setFileInputKey((key) => key + 1);
      await onCompleted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-black/10 bg-white/80 p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--wa-accent)]">
          Neu hinzufügen
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--wa-text)]">
          WhatsApp-Export hochladen
        </h2>
        <p className="mt-1 text-sm text-[var(--wa-muted)]">
          Lade den Chat als ZIP von WhatsApp hoch. Die App richtet ihn hier ein — vorhandene Chats
          mit demselben Namen werden nach Bestätigung ersetzt.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-5 grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--wa-text)]">
            Chat-Name (kurz, z. B. andy)
          </span>
          <input
            value={slugInput}
            onChange={(event) => setSlugInput(event.target.value)}
            placeholder="andy"
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={busy}
            required
          />
          {slugPreview && (
            <span className="mt-1 block text-xs text-[var(--wa-muted)]">
              Wird gespeichert als: <code>{slugPreview}</code>
              {willOverwrite ? " — ersetzt einen vorhandenen Chat" : ""}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--wa-text)]">
            Anzeigename (optional)
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Andy"
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={busy}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--wa-text)]">
            Wer bist du in diesem Chat? (optional)
          </span>
          <input
            value={defaultMyName}
            onChange={(event) => setDefaultMyName(event.target.value)}
            placeholder="Denise Rau"
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={busy}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--wa-text)]">
            WhatsApp-ZIP
          </span>
          <input
            key={fileInputKey}
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[var(--wa-accent-soft)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--wa-accent-dark)]"
            disabled={busy}
            required
          />
        </label>

        <button
          type="submit"
          disabled={busy || !file || !slugPreview}
          className="mt-1 rounded-full bg-[var(--wa-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Wird verarbeitet…" : "Hochladen und einrichten"}
        </button>
      </form>

      {(uploadPercent !== null || job) && (
        <div className="mt-4 rounded-2xl bg-black/[0.03] px-4 py-3 text-sm text-[var(--wa-text)]">
          {uploadPercent !== null && uploadPercent < 100 && (
            <p>Upload: {uploadPercent} %</p>
          )}
          {job && (
            <p className="mt-1">
              <span className="font-medium">{statusLabel(job.status)}</span>
              {job.message ? ` — ${job.message}` : ""}
              {job.status === "done" && typeof job.messageCount === "number"
                ? ` (${job.messageCount.toLocaleString("de-DE")} Nachrichten)`
                : ""}
            </p>
          )}
          {uploadPercent === 100 && job && job.status !== "done" && job.status !== "error" && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--wa-accent)]" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
