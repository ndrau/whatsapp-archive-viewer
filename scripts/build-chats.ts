import { buildAllChats } from "../src/lib/build-chats";

async function main() {
  const manifest = await buildAllChats();

  if (manifest.chats.length === 0) {
    console.log("Keine Chats in chats/ gefunden.");
    return;
  }

  console.log(`Chat-Build fertig: ${manifest.chats.length} Chat(s)`);

  for (const chat of manifest.chats) {
    console.log(
      `  - ${chat.slug}: ${chat.messageCount.toLocaleString("de-DE")} Nachrichten, ${chat.mediaCount.toLocaleString("de-DE")} Medien`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
