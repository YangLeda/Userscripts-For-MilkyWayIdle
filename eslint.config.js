import js from "@eslint/js";

const userscriptGlobals = Object.fromEntries(
  [
    "Blob",
    "CustomEvent",
    "EventTarget",
    "GM",
    "GM_addStyle",
    "GM_getValue",
    "GM_notification",
    "GM_setValue",
    "GM_xmlhttpRequest",
    "localStorageUtil",
    "math",
    "Option",
    "getComputedStyle",
    "performance",
  ].map((name) => [name, "readonly"]),
);

export default [
  {
    ignores: [
      "MWITools.js",
      "MWITools addon for Steam version.js",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "test/**/*.js", "test-support/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...userscriptGlobals,
        console: "readonly",
        document: "readonly",
        Element: "readonly",
        Event: "readonly",
        localStorage: "readonly",
        location: "readonly",
        MessageEvent: "readonly",
        MutationObserver: "readonly",
        navigator: "readonly",
        Notification: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
        window: "readonly",
      },
    },
    rules: {
      "no-prototype-builtins": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      globals: { process: "readonly" },
    },
  },
];
