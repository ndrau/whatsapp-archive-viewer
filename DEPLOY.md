# Deployment (TrueNAS / Portainer)

## Klare Trennung: Image vs. Daten vs. Build

| Schicht | TrueNAS (Beispiel) | Im Container | Bei App-Update |
|---|---|---|---|
| **App-Image** | GHCR-Pull | Programmcode | wird ersetzt |
| **Dataset DATA** | `…/whatsapp-archive/data` | `/app/chats` | **bleibt unberührt** |
| **Dataset BUILT** | `…/whatsapp-archive/built` | `/app/.built` | bleibt, oder leer → App baut neu |

```text
┌─────────────────────────┐
│  Docker Image (App)     │  ← Updates nur hier
└───────────┬─────────────┘
            │ liest / schreibt
    ┌───────┴────────┐
    ▼                ▼
┌─────────┐    ┌──────────┐
│  DATA   │    │  BUILT   │
│ Uploads │───▶│ Indexe   │
│ ZIPs    │baut│ (cache)  │
└─────────┘    └──────────┘
   persistent     neu baubar
```

- **Uploads** landen nur im **DATA**-Dataset.
- Die App **liest** DATA und **schreibt** BUILT (Index, Suche, temporäre Upload-Jobs).
- Image-Update = neuer Container + gleiches DATA-Volume → Chats bleiben.
- Wenn BUILT fehlt/leer oder `BUILD_CHATS_ON_START=1`: App baut Artefakte aus DATA neu.

Portainer braucht **kein** Git auf dem NAS — nur Compose + Image-URL.

## Datasets anlegen

```text
/mnt/tank/apps/whatsapp-archive/data/    ← schreibbar (UID 1001 oder user: "0:0")
/mnt/tank/apps/whatsapp-archive/built/   ← schreibbar, darf leer starten
```

In der Compose die linken Pfade auf deine echten Dataset-Pfade setzen.

## Image

Bei Push auf `main` → GitHub Actions →

```text
ghcr.io/ndrau/whatsapp-archive-viewer:latest
```

Package auf GitHub ggf. **Public** stellen.

## Portainer

1. **Stacks** → Add stack  
2. `docker-compose.yml` einfügen  
3. `ARCHIVE_PASSWORD` + `AUTH_SECRET` setzen  
4. Volume-Pfade `data` + `built` prüfen  
5. Deploy → `http://<NAS-IP>:3080` → Login  

## Chats hinzufügen

**Empfohlen:** In der UI „WhatsApp-Export hochladen“ (ZIP).  
Landet in DATA (`data/<chat-name>/`), App baut nach BUILT, Chat erscheint in der Liste.

Manuell: Dateien nach `data/andy/` (`_chat.txt` + Medien + optional `meta.json`), dann Container neu starten.

## Updates

| Was ändern? | Aktion |
|---|---|
| **App** | Stack → Pull/Redeploy neues Image. DATA unberührt. Mit `BUILD_CHATS_ON_START=1` werden BUILT-Artefakte neu erzeugt. |
| **Nur Chat-Daten** | ZIP in der UI, oder Dateien in DATA legen |
| **BUILT kaputt / Platz** | Dataset `built` leeren, Container neu starten → Rebuild aus DATA |
