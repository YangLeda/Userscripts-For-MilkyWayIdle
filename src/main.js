// Keep rescue controls available before any game or storage module is evaluated.
import { startupDiagnostics } from "./core/startup-diagnostics.js";
import { cleanupRetiredGuildStorage } from "./core/retired-guild-storage.js";

startupDiagnostics.boot(async () => {
  // Start cleanup immediately, but let startup install the socket hook while
  // deletion batches yield so the game's initial messages are not missed.
  const cleanup = cleanupRetiredGuildStorage();
  const app = await import("./app.js");
  await app.startApp();
  await cleanup;
});
