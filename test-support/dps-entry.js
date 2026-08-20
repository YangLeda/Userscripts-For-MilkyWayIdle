import "../src/core/game-data.js";
import "../src/core/game-assets.js";
import "../src/core/game-localization.js";

export { registerGameLocaleResources } from "../src/core/game-localization.js";

export { runtime } from "../src/core/runtime.js";
export {
  CombatIdentity,
  GameAssets,
  Settings,
  combatEventMatchesSession,
  formatDamage,
  formatRate,
  isSelectedGuildProgressTabBar,
  isSelectedTrialTabBar,
} from "../src/features/dps/00-bootstrap.js";
export {
  ClassDebug,
  ClassProbe,
  ClassSystem,
  DamageSources,
  TakenSources,
} from "../src/features/dps/10-combat-sources.js";
export { Diagnostics, Session } from "../src/features/dps/20-session.js";
export {
  HistoryStore,
  SegmentSelection,
  ViewData,
} from "../src/features/dps/30-history.js";
export {
  SocketHook,
  buildTheoreticalAccuracyProfiles,
  theoreticalHitChance,
} from "../src/features/dps/40-socket-parser.js";
