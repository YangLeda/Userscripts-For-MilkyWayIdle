# MWITools

Tools for the game [Milky Way Idle](https://www.milkywayidle.com/). The userscript UI is primarily Chinese.

MWITools displays action duration, market prices, quick action inputs, skill progress, net worth, combat summaries, map indexes, item levels, ability book requirements, marketplace filters, and integrations with third-party calculators.

## Install

The installable userscript is the single file [`MWITools.js`](./MWITools.js). GreasyFork should continue syncing that root-level file; files under `src/` are development sources and are not loaded at runtime.

The independently installable test build is [`MWITools-test.user.js`](./MWITools-test.user.js). It is named `MWITools 测试版`, only matches `test.milkywayidle.com`, and updates from <https://fishingidle.com/mwitools-test.user.js>. Disable the production script on the test site before enabling it to avoid running both copies together.

Steam client users also need [`MWITools addon for Steam version.js`](./MWITools%20addon%20for%20Steam%20version.js).

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run build
npm run build:test
```

Source code is organized by responsibility:

- `src/core/`: runtime context, settings-facing state, websocket interception, message reducer and dispatcher, plus normalized server market values and orderbook data.
- `src/data/`: translations and the bundled fallback market snapshot.
- `src/features/`: inventory, actions, tooltips, marketplace, combat, settings and external-tool integrations.
- `src/main.js`: page routing and startup order.

`npm run build` bundles the modules as a readable UTF-8 IIFE, prepends `src/userscript-banner.txt`, and replaces the root `MWITools.js`. It does not minify or emit a source map.

`npm run build:test` uses the same source and build settings to generate `MWITools-test.user.js` with isolated metadata and its deployment URL. Increment the test version in `scripts/userscript-build.mjs` before publishing a new test update.

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

The build preserves the existing userscript matches, grants, external `@require` libraries, storage keys and DOM selectors.

Marketplace values come from two sources: the environment-specific `marketplace.json` endpoint supplies executable ask/bid prices, while the game's `market_item_values_updated` websocket message supplies the server-tracked fair value. Test uses the `test.milkywayidle.com` endpoint and a 10-minute cache; production uses `www.milkywayidle.com` and a six-hour cache.

Inventory asset totals use the server-tracked fair value first. Non-tradable currencies are valued from current game conversion and loot-table data: shop tokens use their best redemption, guild credits use their cheapest material conversion, guild tokens use their best credit route, and cowbells use one tenth of a cowbell bag. Cowbells and guild currencies are reported under fixed assets rather than inventory value.

## Mooneycalc Importer

MWITools can import player information into:

- <https://mooneycalc.vercel.app/>
- <https://mwisim.github.io/>
- <https://cowculator.info/>
