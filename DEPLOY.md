# Deployment (TrueNAS / Portainer)

## Konzept

| Was | Wo |
|---|---|
| **Docker-Image** | Nur App-Code (`ghcr.io/ndrau/whatsapp-archive-viewer`) |
| **Chat-Dateien** | Volume auf dem NAS → `/app/chats` |
| **Geparste Daten** | Volume auf dem NAS → `/app/.built` |

Portainer braucht **kein** Git-Checkout auf dem NAS — nur die `docker-compose.yml` und ein erreichbares Image.

## Einmalig: Image veröffentlichen

Bei Push auf `main` baut GitHub Actions das Image und pusht nach:

```text
ghcr.io/ndrau/whatsapp-archive-viewer:latest
```

Danach auf GitHub → Repo → **Packages** → Package öffnen → **Package settings** → Visibility **Public**  
(sonst muss Portainer mit einem GitHub-Token bei GHCR eingeloggt sein).

## Chat-Daten auf dem NAS

```text
/mnt/tank/apps/whatsapp-archive/chats/   ← schreibbar (Upload in der UI oder manuell)
/mnt/tank/apps/whatsapp-archive/built/  ← leer ok, App schreibt Jobs + JSON
```

**Empfohlen:** WhatsApp-ZIP in der Web-UI hochladen (nach Login). Die App entpackt nach `chats/<name>/`, baut den Chat und zeigt ihn in der Liste.

Manuell geht weiterhin: Ordner `chats/andy/` mit `_chat.txt` + Medien + optional `meta.json` kopieren und Container neu starten.

In der Compose die linken Volume-Pfade auf deine echten Dataset-Pfade setzen.  
`chats` muss **schreibbar** sein (kein `:ro`), sonst schlägt der Upload fehl.

## Portainer

1. **Stacks** → Add stack  
2. Inhalt von `docker-compose.yml` einfügen  
3. Passwort + Secret setzen, Volume-Pfade prüfen  
4. Deploy  
5. `http://<NAS-IP>:3080` → Login  

## Updates

- **App:** neues Image (`latest`) → Stack neu pullen/redeployen  
- **Chats:** ZIP in der UI hochladen, oder Dateien nach `chats/` kopieren + Container neu starten (`BUILD_CHATS_ON_START=1`)
