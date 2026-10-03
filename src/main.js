// Keep rescue controls available before any game or storage module is evaluated.
import { startupDiagnostics } from "./core/startup-diagnostics.js";

startupDiagnostics.boot(() => import("./app.js").then((app) => app.startApp()));
