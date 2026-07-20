# WhatsApp Archive Viewer

Kleine Next.js-App, die einen exportierten WhatsApp-Chat (`_chat.txt` + Medien) lokal im Browser als schöne Chat-Ansicht darstellt und optional als offline lesbares HTML-Archiv exportiert.

## Features

- ZIP-Import direkt aus dem iPhone-Export
- Alternativ: entpackten Ordner oder `_chat.txt` + Medien laden
- Bilder, Videos, Audio und Sprachnachrichten anzeigen
- Suche im Chat
- HTML-Archiv als ZIP herunterladen (`index.html` + `media/` Ordner)
- 100 % clientseitig – deine Chats verlassen den Rechner nicht

## Lokale Chats im Projekt

Exportierte Chats liegen als **unveränderte Rohdaten** in `chats/`:

```text
chats/
  denise/
    _chat.txt
    meta.json
    …Medien…

.built/chats/          ← nur vom Build erzeugt, Quellen bleiben unangetastet
  manifest.json
  denise/
    chat.json
```

### Chat-Build

Vor dem Start werden die Chats lokal geparst und in JSON überführt:

```bash
pnpm run build:chats
```

Das passiert automatisch bei `pnpm run dev` und `pnpm run build`. In der App kannst du die Chats auch per Button **Chats neu bauen** aktualisieren.

Optional pro Chat in `meta.json`:

```json
{
  "title": "Denise",
  "defaultMyName": "Andy Rau"
}
```

Hinweis: `chats/` (Quellen) und `.built/` (Build-Ausgabe) sind in `.gitignore`.

### Export-Normalisierung

WhatsApp schreibt Medien oft in **mehrere Zeilen** im `_chat.txt` (Caption und Bild getrennt, leere Zeilen vor Alben, wiederholte Captions bei Mehrfachfotos). Beim Chat-Build normalisiert der Parser diese Fälle:

- **Leere Nachrichten** ohne Text und ohne Anhang werden verworfen
- **Getrennte Zeilen** desselben Senders (≤ 2 s) mit nur Text bzw. nur Anhang werden zu **einer Nachricht** zusammengeführt
- **Wiederholte Captions** bei Foto-Serien werden entfernt, die Caption bleibt nur einmal
- **Foto-Alben** (Caption + Bild + weitere Bilder desselben Senders innerhalb von 30 s) werden in der UI als **ein Bubble/Grid** mit Caption oben gerendert

Nach Änderungen am Parser oder an der Gruppierungslogik Chats neu bauen:

```bash
pnpm run build:chats
```

## Start

```bash
pnpm install
pnpm run dev
```

Dann [http://localhost:3000](http://localhost:3000) öffnen.

## WhatsApp-Export auf dem iPhone

1. Chat öffnen → Kontaktname oben → **Chat exportieren**
2. **Medien anhängen** wählen
3. **In Dateien sichern** oder per AirDrop auf den Mac
4. ZIP in dieser App hochladen

## Sprachnachrichten

Ja – mit **Medien anhängen** sind Sprachnachrichten dabei, meist als `.opus` oder `.m4a` (oft mit `PTT` im Dateinamen). Die App zeigt sie mit einem Audio-Player an.

Ohne Medien erscheinen im Text nur Platzhalter wie „Audiodatei weggelassen“.

## HTML-Archiv

Der Button **HTML-Archiv herunterladen** erzeugt eine ZIP mit:

- `index.html` – lesbare Chat-Ansicht
- `media/` – alle referenzierten Dateien

ZIP entpacken und `index.html` im Browser öffnen.

## Tech

- Next.js 15
- TypeScript
- Tailwind CSS
- JSZip
