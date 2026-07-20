# Deployment (TrueNAS / Portainer)

## Klare Trennung: Image vs. Datasets

| Schicht | TrueNAS-Dataset | Im Container | Bei App-Update |
|---|---|---|---|
| **App-Image** | GHCR-Pull | Programmcode | wird ersetzt |
| **Dataset `data`** | `…/whatsapp-archive/data` | `/app/chats` | **bleibt unberührt** |
| **Dataset `app`** | `…/whatsapp-archive/app` | `/app/.built` | bleibt, oder leer → App baut neu |

```text
┌─────────────────────────┐
│  Docker Image (Code)    │  ← Updates nur hier
└───────────┬─────────────┘
            │
    ┌───────┴────────┐
    ▼                ▼
┌─────────┐    ┌──────────┐
│  data   │    │   app    │
│ Uploads │───▶│ Indexe   │
│ ZIPs    │baut│ (cache)  │
└─────────┘    └──────────┘
   persistent     neu baubar
```

- **Uploads** landen nur in **`data`**.
- Die App **liest** `data` und **schreibt** nach **`app`** (Index, Suche, temp. Upload-Jobs).
- Image-Update = neuer Container, gleiches `data`-Volume → Chats bleiben.
- Wenn `app` leer ist oder `BUILD_CHATS_ON_START=1`: Artefakte werden aus `data` neu gebaut.

Portainer braucht **kein** Git auf dem NAS — nur Compose + Image-URL.

## Datasets anlegen

```text
…/whatsapp-archive/data/   ← schreibbar (UID 1001 oder user: "0:0")
…/whatsapp-archive/app/    ← schreibbar, darf leer starten
```

In der Compose die linken Pfade auf deine echten Dataset-Pfade setzen.

## Image

```text
ghcr.io/ndrau/whatsapp-archive-viewer:latest
```

Package auf GitHub ggf. **Public** stellen.

## Portainer

1. **Stacks** → Add stack  
2. `docker-compose.yml` einfügen  
3. `ARCHIVE_PASSWORD` + `AUTH_SECRET` setzen  
4. Volumes: `data` → `/app/chats`, `app` → `/app/.built`  
5. Deploy → `http://<NAS-IP>:3080` → Login  

## Chats hinzufügen

In der UI „WhatsApp-Export hochladen“ (ZIP) → landet in `data/<chat-name>/`.

## Updates

| Was? | Aktion |
|---|---|
| **App** | Stack Pull/Redeploy. `data` unberührt. |
| **Nur Chats** | ZIP in der UI |
| **`app` leeren** | Dataset leeren, Container neu starten → Rebuild aus `data` |
