import { cleanupRetiredGuildStorage } from "./core/retired-guild-storage.js";

async function start() {
  const cleanup = cleanupRetiredGuildStorage();
  const app = await import("./app.js");
  await app.startApp();
  await cleanup;
}
void start().catch((error) =>
  console.error("[MWITools] Startup failed", error),
);
