# MWITools Public API

MWITools exposes the latest calculated combat and skilling scores to other
userscripts through `unsafeWindow.MWIToolsAPI`.

## Read the latest scores

```js
const api = unsafeWindow.MWIToolsAPI;
const scores = api?.getScores(); // Same value as api?.scores

if (scores) {
  console.log(scores.battle.total);
  console.log(scores.skilling.total);
}
```

`null` means MWITools has not completed its first calculation yet. A consumer
can request one explicitly:

```js
const scores = await unsafeWindow.MWIToolsAPI?.refreshScores();
```

## Listen for updates

```js
unsafeWindow.addEventListener("mwitools:scores-updated", (event) => {
  const scores = event.detail;
  console.log(scores.battle.total, scores.skilling.total);
});
```

## Data contract

```js
{
  schemaVersion: 1,
  unit: "million_coins",
  server: "production" | "test" | "china",
  characterId: "12345",
  calculatedAt: "2026-08-10T09:00:00.000Z",
  battle: {
    total: 123.45,
    house: 10,
    abilities: 20,
    equipment: 93.45
  },
  skilling: {
    total: 67.89,
    house: 5,
    tools: 30,
    equipment: 32.89,
    available: true
  }
}
```

All score values use the same unit as the MWITools inventory display: millions
of coins. Every read returns a copy, so changes made by a consumer do not alter
MWITools state.
