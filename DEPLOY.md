# Deployment (TrueNAS / Portainer)

## Klare Trennung: Image vs. Datasets

| Schicht | TrueNAS-Dataset | Im Container | Bei App-Update |
|---|---|---|---|
| **App-Image** | GHCR-Pull | Programmcode | wird ersetzt |
| **Dataset `data`** | `…/whatsapp-archive/data` | `/app/chats` | **bleibt unberührt** |
| **Dataset `built`** | `…/whatsapp-archive/built` | `/app/.built` | bleibt, oder leer → App baut neu |

```text
┌─────────────────────────┐
│  Docker Image (Code)    │  ← Updates nur hier
└───────────┬─────────────┘
            │
    ┌───────┴────────┐
    ▼                ▼
┌─────────┐    ┌──────────┐
│  data   │    │  built   │
│ Uploads │───▶│ Indexe   │
│ ZIPs    │baut│ (cache)  │
└─────────┘    └──────────┘
   persistent     neu baubar
```

- **Uploads** landen nur in **`data`**.
- Die App **liest** `data` und **schreibt** nach **`built`**.
- Image-Update = neuer Container, gleiches `data`-Volume → Chats bleiben.
- Wenn `built` leer ist oder `BUILD_CHATS_ON_START=1`: Artefakte werden aus `data` neu gebaut.

Portainer braucht **kein** Git auf dem NAS — nur Compose + Image-URL.

## Datasets anlegen

```text
…/whatsapp-archive/data/    ← schreibbar, darf leer starten
…/whatsapp-archive/built/   ← schreibbar, darf leer starten
```

In der Compose die linken Pfade auf deine echten Dataset-Pfade setzen.

### Rechte (wichtig)

Ohne Schreibrechte: `EACCES: permission denied, mkdir '/app/.built/chats'`.

**Einfach (Default in Compose):** `user: "0:0"` — Container läuft als root und darf in die Datasets schreiben.

**Strenger:** Compose-`user`-Zeile entfernen und auf dem NAS:

```bash
chown -R 1001:1001 /mnt/…/whatsapp-archive/data /mnt/…/whatsapp-archive/built
```

(UID 1001 = User `nextjs` im Image.)

## Image

```text
ghcr.io/ndrau/whatsapp-archive-viewer:latest
```

Package auf GitHub ggf. **Public** stellen.

## Portainer

1. **Stacks** → Add stack  
2. `docker-compose.yml` einfügen  
3. `ARCHIVE_PASSWORD` + `AUTH_SECRET` setzen  
4. Optional: `ALLOW_CHAT_UPLOAD=false` wenn keine neuen Uploads mehr erlaubt sein sollen  
5. Volumes: `data` → `/app/chats`, `built` → `/app/.built`  
6. Deploy → `http://<NAS-IP>:9180` → Login  

## Chats hinzufügen

In der UI „WhatsApp-Export hochladen“ (ZIP) → landet in `data/<chat-name>/`.

## Updates

| Was? | Aktion |
|---|---|
| **App** | Stack Pull/Redeploy. `data` unberührt. |
| **Nur Chats** | ZIP in der UI |
| **`built` leeren** | Dataset leeren, Container neu starten → Rebuild aus `data` |
