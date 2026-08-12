# MWITools

Tools for the game [Milky Way Idle](https://www.milkywayidle.com/). The userscript UI is primarily Chinese.

MWITools displays action duration, market prices, quick action inputs, skill progress, net worth, combat summaries, map indexes, item levels, ability book requirements, marketplace filters, and integrations with third-party calculators.

## Install

The installable userscript is the single file [`MWITools.js`](./MWITools.js). GreasyFork should continue syncing that root-level file; files under `src/` are development sources and are not loaded at runtime.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run build:dev
```

Source code is organized by responsibility:

- `src/core/`: runtime context, settings-facing state, websocket interception, message reducer and dispatcher, plus normalized server market values and orderbook data.
- `src/data/`: translations and the bundled fallback market snapshot.
- `src/features/`: inventory, actions, tooltips, marketplace, combat, settings and external-tool integrations.
- `src/main.js`: page routing and startup order.

`npm run build:dev` bundles the modules as a readable UTF-8 IIFE and writes the ignored local file `MWITools.dev.user.js`. Its userscript name and namespace are separate from production so both builds cannot be confused in Tampermonkey.

`npm run build` creates the canonical release file `MWITools.js`. The release build is minified without a source map, while keeping function and class names for useful production stack traces. It does not mangle object properties or remove runtime logs. Both builds prepend metadata derived from `src/userscript-banner.txt` and otherwise use the same bundling settings.

Before committing a change, run:

```bash
npm run check
```

This checks formatting and lint rules, runs the state/settings/userscript smoke tests, rebuilds to a temporary directory, and verifies that the committed `MWITools.js` is current.

## Release

1. Update `@version` in `src/userscript-banner.txt` and the package version together.
2. Run `npm run build`.
3. Run `npm run check`.
4. Commit both the modular source and generated `MWITools.js`.
5. Confirm the GreasyFork sync URL still points to the root `MWITools.js` before syncing.

Important-update banners are controlled by [`release-manifest.json`](./release-manifest.json). Leave `importantVersion` unchanged for small releases. For an important release, set it to the new production version and update the bilingual message before merging to `main`; installed production scripts will then show a dismissible banner linking to the official Greasy Fork page. The independently hosted test userscript does not run this update check.

The build preserves the supported userscript matches, grants, storage keys and DOM selectors. External chart libraries are pinned to fixed versions with SHA-256 integrity hashes.

Marketplace values come from two sources: the environment-specific `marketplace.json` endpoint supplies executable ask/bid prices, while the game's `market_item_values_updated` websocket message supplies the server-tracked fair value. Test uses the `test.milkywayidle.com` endpoint and a 10-minute cache; production uses `www.milkywayidle.com` and a six-hour cache.

Inventory asset totals use the server-tracked fair value first. Non-tradable currencies are valued from current game conversion and loot-table data: shop tokens use their best redemption, guild credits use their cheapest material conversion, guild tokens use their best credit route, and cowbells use one tenth of a cowbell bag. Cowbells and guild currencies are reported under fixed assets rather than inventory value.

## Mooneycalc Importer

MWITools can import player information into:

- <https://mooneycalc.netlify.app/>
- <https://mooneycalc.vercel.app/>
