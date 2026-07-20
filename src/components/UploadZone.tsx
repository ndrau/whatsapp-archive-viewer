"use client";

import { useRef, useState } from "react";

import {
  loadWhatsAppFolder,
  loadWhatsAppTextWithMedia,
  loadWhatsAppZip,
} from "@/lib/load-export";
import type { WhatsAppExport } from "@/types/whatsapp";

interface UploadZoneProps {
  onExportLoaded: (exportData: WhatsAppExport, sourceLabel: string) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function UploadZone({
  onExportLoaded,
  onError,
  onLoadingChange,
}: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const pendingTextFile = useRef<File | null>(null);

  async function handleZip(file: File) {
    onLoadingChange(true);
    onError("");

    try {
      const exportData = await loadWhatsAppZip(file);
      onExportLoaded(exportData, file.name);
    } catch (error) {
      onError(error instanceof Error ? error.message : "ZIP konnte nicht gelesen werden.");
    } finally {
      onLoadingChange(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div
        className={`rounded-3xl border-2 border-dashed p-8 transition ${
          dragActive
            ? "border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]"
            : "border-black/10 bg-white/80"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={async (event) => {
          event.preventDefault();
          setDragActive(false);
          const file = event.dataTransfer.files[0];
          if (file?.name.toLowerCase().endsWith(".zip")) {
            await handleZip(file);
          } else {
            onError("Bitte eine WhatsApp ZIP-Datei ablegen.");
          }
        }}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--wa-accent)]">
          Empfohlen
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--wa-text)]">WhatsApp ZIP hochladen</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--wa-muted)]">
          Exportiere den Chat auf dem iPhone mit „Medien anhängen“ und speichere die ZIP-Datei
          hier oder per Drag & Drop.
        </p>
        <button
          type="button"
          className="mt-6 rounded-full bg-[var(--wa-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--wa-accent-dark)]"
          onClick={() => zipInputRef.current?.click()}
        >
          ZIP auswählen
        </button>
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) await handleZip(file);
            event.target.value = "";
          }}
        />
      </div>

      <div className="rounded-3xl border border-black/10 bg-white/80 p-8">
        <h2 className="text-2xl font-semibold text-[var(--wa-text)]">Entpackten Ordner laden</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--wa-muted)]">
          Wenn du die ZIP schon entpackt hast: Ordner mit <code>_chat.txt</code> und Medien
          auswählen.
        </p>
        <button
          type="button"
          className="mt-6 rounded-full border border-[var(--wa-accent)] px-5 py-3 text-sm font-semibold text-[var(--wa-accent)] transition hover:bg-[var(--wa-accent-soft)]"
          onClick={() => folderInputRef.current?.click()}
        >
          Ordner auswählen
        </button>
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          multiple
          // @ts-expect-error webkitdirectory is supported in Chromium browsers
          webkitdirectory=""
          onChange={async (event) => {
            const files = event.target.files;
            if (!files?.length) return;

            onLoadingChange(true);
            onError("");

            try {
              const exportData = await loadWhatsAppFolder(files);
              onExportLoaded(exportData, "Ordner-Import");
            } catch (error) {
              onError(
                error instanceof Error ? error.message : "Ordner konnte nicht gelesen werden.",
              );
            } finally {
              onLoadingChange(false);
              event.target.value = "";
            }
          }}
        />

        <div className="my-6 h-px bg-black/10" />

        <h3 className="text-lg font-semibold text-[var(--wa-text)]">Oder Text + Medien getrennt</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium"
            onClick={() => textInputRef.current?.click()}
          >
            _chat.txt wählen
          </button>
          <button
            type="button"
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium"
            onClick={() => mediaInputRef.current?.click()}
          >
            Medien wählen
          </button>
        </div>
        <input
          ref={textInputRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(event) => {
            pendingTextFile.current = event.target.files?.[0] ?? null;
            event.target.value = "";
          }}
        />
        <input
          ref={mediaInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={async (event) => {
            const mediaFiles = event.target.files;
            const textFile = pendingTextFile.current;

            if (!textFile) {
              onError("Bitte zuerst _chat.txt auswählen.");
              event.target.value = "";
              return;
            }

            if (!mediaFiles?.length) return;

            onLoadingChange(true);
            onError("");

            try {
              const exportData = await loadWhatsAppTextWithMedia(textFile, mediaFiles);
              onExportLoaded(exportData, textFile.name);
            } catch (error) {
              onError(
                error instanceof Error ? error.message : "Import fehlgeschlagen.",
              );
            } finally {
              onLoadingChange(false);
              event.target.value = "";
            }
          }}
        />
      </div>
    </div>
  );
}
