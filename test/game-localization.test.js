import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;

localStorage.setItem("i18nextLng", "en");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/game-data.js");
await import("../src/core/state.js");
const {
  SUPPORTED_GAME_LOCALES,
  extractGameLocaleResources,
  extractReactGameLocaleResources,
  getGameLocale,
  getGameLocaleResources,
  getGameTranslation,
  getLocalizedEntityName,
  matchesGameTranslation,
  matchesGameTranslations,
  normalizeGameLocale,
  registerGameLocaleResources,
  resetGameLocalizationCache,
  resolveEntityFromElement,
  resolveLocalizedEntity,
} = await import("../src/core/game-localization.js");

const localeSamples = {
  es: ["Moneda", "Vaca", "Rata", "Golpe"],
  fr: ["Pièce", "Vache", "Rat", "Frappe"],
  pt: ["Moeda", "Vaca", "Rato", "Golpe"],
  zh: ["金币", "奶牛", "老鼠", "猛击"],
  "zh-TW": ["金幣", "奶牛", "老鼠", "猛擊"],
  ja: ["コイン", "乳牛", "ネズミ", "強打"],
  ko: ["코인", "소", "쥐", "강타"],
  ru: ["Монета", "Корова", "Крыса", "Удар"],
};

function contextFactory() {
  return {
    "./es/index.js": [601, 3],
    "./fr/index.js": [602, 4],
    "./ja/index.js": [603, 5],
    "./ko/index.js": [604, 6],
    "./pt/index.js": [605, 7],
    "./ru/index.js": [606, 8],
    "./zh-TW/index.js": [607, 9],
    "./zh/index.js": [608, 10],
  };
}

function localeFactory(locale) {
  const [coin, cow, rat, strike] = localeSamples[locale];
  return function officialLocaleModule(module, exports, webpackRequire) {
    webpackRequire.r(exports);
    const resources = {
      global: { gameName: `MWI ${locale}` },
      marketplacePanel: { buy: `buy-${locale}`, sell: `sell-${locale}` },
      characterManagement: { inventory: `inventory-${locale}` },
      randomTask: {
        go: `go-${locale}`,
        reroll: `reroll-${locale}`,
        claimReward: `claim-${locale}`,
      },
      questModal: { go: `go-${locale}`, claimReward: `claim-${locale}` },
      skillActionDetail: {
        buttons: {
          start: `start-${locale}`,
          startNow: `start-now-${locale}`,
          addToQueue: `queue-${locale} #{{count}}`,
        },
      },
      navigationBar: { tasks: `tasks-${locale}` },
      battlePanel: {
        combatDuration: `duration-${locale}: {{duration}}`,
        battles: `battles-${locale}: {{battleId}}`,
        deaths: `deaths-${locale}: {{deathCount}}`,
      },
      itemNames: { "/items/coin": coin },
      actionNames: { "/actions/milking/cow": cow },
      monsterNames: { "/monsters/rat": rat },
      abilityNames: { "/abilities/strike": strike },
    };
    exports.default = resources;
  };
}

const modules = { 400: contextFactory };
for (const [locale, [moduleId, chunkId]] of Object.entries(
  contextFactory(),
).map(([path, ids]) => [path.split("/")[1], ids])) {
  modules[moduleId] = localeFactory(locale);
  modules[moduleId].chunkId = chunkId;
}

const webpackWindow = {
  webpackJsonprpg_web: [
    [[0], { 400: modules[400] }],
    ...Object.entries(modules)
      .filter(([moduleId]) => moduleId !== "400")
      .map(([moduleId, factory]) => [
        [factory.chunkId],
        { [moduleId]: factory },
      ]),
  ],
};
globalThis.unsafeWindow = webpackWindow;

runtime.state.initData_itemDetailMap = {
  "/items/coin": { name: "Coin", isTradable: true },
};
runtime.state.initData_actionDetailMap = {
  "/actions/milking/cow": { name: "Cow" },
  "/actions/combat/rat": { name: "Rat" },
};
runtime.state.initData_abilityDetailMap = {
  "/abilities/strike": { name: "Strike" },
};
runtime.state.initData_monsterDetailMap = {
  "/monsters/rat": { name: "Rat" },
};
runtime.state.clientData = {
  versionTimestamp: "fixture-v1",
  itemDetailMap: runtime.state.initData_itemDetailMap,
  actionDetailMap: runtime.state.initData_actionDetailMap,
  abilityDetailMap: runtime.state.initData_abilityDetailMap,
  combatMonsterDetailMap: runtime.state.initData_monsterDetailMap,
};

test("normalizes every built-in game locale without collapsing Traditional Chinese", () => {
  assert.deepEqual(SUPPORTED_GAME_LOCALES, [
    "en",
    "es",
    "fr",
    "pt",
    "zh",
    "zh-TW",
    "ja",
    "ko",
    "ru",
  ]);
  assert.equal(normalizeGameLocale("zh-CN"), "zh");
  assert.equal(normalizeGameLocale("zh-Hant"), "zh-TW");
  assert.equal(normalizeGameLocale("zh_HK"), "zh-TW");
  assert.equal(normalizeGameLocale("es-MX"), "es");
  assert.equal(normalizeGameLocale("de"), "en");
});

test("extracts and validates the official lazy locale modules", () => {
  for (const [locale, [coin]] of Object.entries(localeSamples)) {
    const resources = extractGameLocaleResources(
      locale,
      globalThis.unsafeWindow,
    );
    assert.equal(resources.itemNames["/items/coin"], coin, locale);
  }
});

test("React i18n resources take priority for the currently loaded locale", () => {
  const resources = {
    itemNames: { "/items/coin": "React コイン" },
    actionNames: { "/actions/milking/cow": "React 乳牛" },
    monsterNames: { "/monsters/rat": "React ネズミ" },
    abilityNames: { "/abilities/strike": "React 強打" },
  };
  const root = document.createElement("div");
  root.id = "root";
  root.__reactFiber$test = {
    memoizedProps: {
      i18n: { options: { resources: { ja: { translation: resources } } } },
    },
  };
  document.body.append(root);
  assert.equal(extractReactGameLocaleResources("ja"), resources);
  localStorage.setItem("i18nextLng", "ja");
  resetGameLocalizationCache();
  assert.equal(getGameLocaleResources("ja"), resources);
  root.remove();
});

test("resolves items, actions, monsters, and abilities in all nine languages", () => {
  for (const locale of SUPPORTED_GAME_LOCALES) {
    localStorage.setItem("i18nextLng", locale);
    resetGameLocalizationCache();
    const [coin, cow, rat, strike] =
      locale === "en"
        ? ["Coin", "Cow", "Rat", "Strike"]
        : localeSamples[locale];
    assert.equal(getGameLocale(), locale);
    assert.equal(resolveLocalizedEntity("item", coin), "/items/coin", locale);
    assert.equal(
      resolveLocalizedEntity("action", cow),
      "/actions/milking/cow",
      locale,
    );
    assert.equal(
      resolveLocalizedEntity("monster", rat),
      "/monsters/rat",
      locale,
    );
    assert.equal(
      resolveLocalizedEntity("ability", strike),
      "/abilities/strike",
      locale,
    );
    assert.equal(getLocalizedEntityName("item", "/items/coin"), coin);
  }
});

test("English fallback resources are reused until the game data source changes", () => {
  localStorage.setItem("i18nextLng", "en");
  resetGameLocalizationCache();
  const first = getGameLocaleResources("en");
  assert.strictEqual(getGameLocaleResources("en"), first);

  const previousClientData = runtime.state.clientData;
  runtime.state.clientData = {
    ...previousClientData,
    versionTimestamp: "fixture-v2",
    itemDetailMap: {
      ...previousClientData.itemDetailMap,
      "/items/cache_probe": { name: "Cache Probe" },
    },
  };
  const refreshed = getGameLocaleResources("en");
  assert.notStrictEqual(refreshed, first);
  assert.equal(refreshed.itemNames["/items/cache_probe"], "Cache Probe");

  runtime.state.clientData = previousClientData;
  resetGameLocalizationCache();
});

test("direct English labels see in-place game data additions without rebuilding the cache", () => {
  localStorage.setItem("i18nextLng", "en");
  resetGameLocalizationCache();
  const resources = getGameLocaleResources("en");
  runtime.state.clientData.itemDetailMap["/items/live_cache_probe"] = {
    name: "Live Cache Probe",
  };

  assert.equal(
    getLocalizedEntityName("item", "/items/live_cache_probe"),
    "Live Cache Probe",
  );
  assert.strictEqual(getGameLocaleResources("en"), resources);

  delete runtime.state.clientData.itemDetailMap["/items/live_cache_probe"];
  resetGameLocalizationCache();
});

test("localized hits do not eagerly build the English fallback", () => {
  const previousClientData = runtime.state.clientData;
  let englishEnumerations = 0;
  runtime.state.clientData = {
    ...previousClientData,
    versionTimestamp: "lazy-fallback-v1",
    itemDetailMap: new Proxy(previousClientData.itemDetailMap, {
      ownKeys(target) {
        englishEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    }),
  };
  registerGameLocaleResources("zh", {
    itemNames: { "/items/coin": "金币" },
    actionNames: { "/actions/milking/cow": "奶牛" },
    monsterNames: { "/monsters/rat": "老鼠" },
    abilityNames: { "/abilities/strike": "猛击" },
  });
  localStorage.setItem("i18nextLng", "zh");
  assert.equal(resolveLocalizedEntity("item", "金币"), "/items/coin");
  assert.equal(englishEnumerations, 0);

  runtime.state.clientData = previousClientData;
  localStorage.setItem("i18nextLng", "en");
  resetGameLocalizationCache();
});

test("language switching changes resources without retaining the previous locale", () => {
  localStorage.setItem("i18nextLng", "zh");
  assert.equal(resolveLocalizedEntity("item", "金币"), "/items/coin");
  localStorage.setItem("i18nextLng", "zh-TW");
  assert.equal(resolveLocalizedEntity("item", "金幣"), "/items/coin");
  assert.equal(getGameTranslation("marketplacePanel.buy"), "buy-zh-TW");
  localStorage.setItem("i18nextLng", "en");
  assert.equal(resolveLocalizedEntity("item", "Coin"), "/items/coin");
});

test("matches translated UI templates without hard-coded language text", () => {
  localStorage.setItem("i18nextLng", "zh-TW");
  const resources = extractGameLocaleResources("zh-TW");
  resources.marketplacePanel.priceBestBuyOffer =
    "價格 (最佳購買報價: <bestPrice />)";
  registerGameLocaleResources("zh-TW", resources);
  assert.equal(
    matchesGameTranslation(
      "marketplacePanel.priceBestBuyOffer",
      "價格 (最佳購買報價: 42)",
    ),
    true,
  );
});

test("matches native controls through every loaded game locale", () => {
  for (const locale of Object.keys(localeSamples)) {
    localStorage.setItem("i18nextLng", locale);
    resetGameLocalizationCache();
    assert.equal(
      matchesGameTranslations(
        "characterManagement.inventory",
        `inventory-${locale}`,
      ),
      true,
      locale,
    );
    assert.equal(
      matchesGameTranslations(
        ["randomTask.go", "questModal.go"],
        `go-${locale}`,
      ),
      true,
      locale,
    );
    assert.equal(
      matchesGameTranslations(
        "skillActionDetail.buttons.addToQueue",
        `queue-${locale} #7`,
      ),
      true,
      locale,
    );
  }

  localStorage.setItem("i18nextLng", "en");
  assert.equal(
    matchesGameTranslations("randomTask.go", "Go", {
      fallbackPatterns: [/^go$/i],
    }),
    true,
  );
});

test("resolves sprite HRIDs before localized aria labels", () => {
  localStorage.setItem("i18nextLng", "ru");
  const item = document.createElement("div");
  item.innerHTML = `<svg aria-label="unknown"><use href="/static/media/items_sprite.hash.svg#coin"></use></svg>`;
  assert.equal(resolveEntityFromElement("item", item), "/items/coin");
});

test("unknown names and missing locale modules fail safely", () => {
  assert.equal(resolveLocalizedEntity("item", "not an item"), "");
  assert.equal(extractGameLocaleResources("fr", {}), null);
});

test("locale cache is scoped to the game version and falls back safely", () => {
  const cachedResources = {
    itemNames: { "/items/coin": "Pièce en cache" },
    actionNames: { "/actions/milking/cow": "Vache en cache" },
    monsterNames: { "/monsters/rat": "Rat en cache" },
    abilityNames: { "/abilities/strike": "Frappe en cache" },
  };
  runtime.state.clientData.versionTimestamp = "cache-v1";
  registerGameLocaleResources("fr", cachedResources);
  assert.ok(
    [...Array(localStorage.length).keys()]
      .map((index) => localStorage.key(index))
      .some((key) => key.includes("cache-v1") && key.endsWith(":fr")),
  );

  resetGameLocalizationCache();
  globalThis.unsafeWindow = {};
  assert.equal(
    getLocalizedEntityName("item", "/items/coin", { locale: "fr" }),
    "Pièce en cache",
  );

  runtime.state.clientData.versionTimestamp = "cache-v2";
  resetGameLocalizationCache();
  assert.equal(
    getLocalizedEntityName("item", "/items/coin", { locale: "fr" }),
    "Coin",
  );
  globalThis.unsafeWindow = webpackWindow;
});
