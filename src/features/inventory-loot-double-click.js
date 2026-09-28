import { runtime } from "../core/runtime.js";
import { resolveEntityFromElement } from "../core/game-localization.js";

export function nativeLootItem(element, itemHrid) {
  for (let node = element; node; node = node.parentElement) {
    const key = Reflect.ownKeys(node).find((name) =>
      /^__react(Fiber|InternalInstance)/.test(String(name)),
    );
    let fiber = key && node[key];
    for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return) {
      const instance = fiber.stateNode;
      const props = instance?.props ?? fiber.memoizedProps;
      if (
        props?.itemHrid &&
        (!itemHrid || props.itemHrid === itemHrid) &&
        typeof props.openLootHandler === "function"
      )
        return { props, instance };
    }
  }
  return null;
}
export function lootOpenCount(props, detail, items) {
  const owned = items.find(
    (item) =>
      item.itemHrid === props.itemHrid &&
      item.itemLocationHrid === "/item_locations/inventory" &&
      Number(item.enhancementLevel || 0) ===
        Number(props.enhancementLevel || 0),
  );
  let count = Math.min(Number(owned?.count ?? 0), Number(props.count ?? 0));
  if (detail.openKeyItemHrid) {
    const keys = items
      .filter(
        (item) =>
          item.itemHrid === detail.openKeyItemHrid &&
          item.itemLocationHrid === "/item_locations/inventory",
      )
      .reduce((sum, item) => sum + Number(item.count || 0), 0);
    count = Math.min(count, keys, Number(props.openLootKeyCount ?? 0));
  }
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}
runtime.features.register({
  // Keep the persisted setting ID so existing users retain their choice.
  id: "inventoryLootDoubleClick",
  setting: "inventoryLootDoubleClick",
  scope: "character",
  initialize({ scope, characterId }) {
    let pending = null;
    let timeout = null;
    const stop = () => {
      pending = null;
      clearTimeout(timeout);
    };
    const currentStock = (itemHrid, enhancementLevel = 0) =>
      (runtime.state.initData_characterItems ?? [])
        .filter(
          (entry) =>
            entry.itemHrid === itemHrid &&
            entry.itemLocationHrid === "/item_locations/inventory" &&
            Number(entry.enhancementLevel || 0) === enhancementLevel,
        )
        .reduce((sum, entry) => sum + Number(entry.count || 0), 0);
    const submit = () => {
      if (
        !pending ||
        !runtime.settings.get("inventoryLootDoubleClick") ||
        String(runtime.state.currentCharacterId) !== String(characterId)
      )
        return stop();
      if (!pending.element.isConnected) {
        pending.element = [
          ...document.querySelectorAll(
            '[class*="Inventory_items"] [class*="Item_itemContainer"]',
          ),
        ].find((element) => {
          const candidate = nativeLootItem(element, pending.itemHrid);
          return candidate?.props.hash === pending.hash;
        });
      }
      const native = nativeLootItem(pending.element, pending.itemHrid);
      if (!native || native.instance?.canOpen?.() === false) return stop();
      const count = Math.min(
        pending.remaining,
        lootOpenCount(
          native.props,
          pending.detail,
          runtime.state.initData_characterItems ?? [],
        ),
      );
      if (!count) return stop();
      pending.count = count;
      pending.beforeStock = currentStock(
        pending.itemHrid,
        pending.enhancementLevel,
      );
      pending.acknowledged = false;
      clearTimeout(timeout);
      timeout = setTimeout(stop, 15000);
      try {
        native.props.openLootHandler(native.props.hash, count);
      } catch {
        stop();
      }
    };
    const continueAfterReceipt = () => {
      if (
        !pending?.acknowledged ||
        currentStock(pending.itemHrid, pending.enhancementLevel) >
          pending.beforeStock - pending.count
      )
        return;
      pending.remaining -= pending.count;
      if (pending.remaining <= 0) return stop();
      submit();
    };
    scope.add(stop);
    scope.add(
      runtime.onMessage("loot_opened", (payload) => {
        if (!pending || payload?.openedItem?.itemHrid !== pending.itemHrid)
          return;
        if (Number(payload.openedItem.count) !== pending.count) return stop();
        pending.acknowledged = true;
        continueAfterReceipt();
      }),
    );
    scope.add(runtime.onMessage("items_updated", continueAfterReceipt));
    scope.add(runtime.onMessage("error", stop));
    scope.event(
      document,
      "contextmenu",
      (event) => {
        if (
          !runtime.settings.get("inventoryLootDoubleClick") ||
          event.button !== 2
        )
          return;
        const item = event.target?.closest?.('[class*="Item_itemContainer"]');
        if (!item?.closest('[class*="Inventory_items"]')) return;
        if (event.target.closest('[class*="Item_actionMenu"]')) return;
        const native = nativeLootItem(item);
        const itemHrid =
          native?.props.itemHrid || resolveEntityFromElement("item", item);
        const detail = runtime.state.initData_itemDetailMap?.[itemHrid];
        if (detail?.categoryHrid !== "/item_categories/loot") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (pending) return;
        if (!native || native.instance?.canOpen?.() === false) return;
        const count = lootOpenCount(
          native.props,
          detail,
          runtime.state.initData_characterItems ?? [],
        );
        if (!count) return;
        const availableProps = {
          ...native.props,
          count: currentStock(
            itemHrid,
            Number(native.props.enhancementLevel || 0),
          ),
        };
        const remaining = lootOpenCount(
          availableProps,
          detail,
          runtime.state.initData_characterItems ?? [],
        );
        pending = {
          itemHrid,
          detail,
          element: item,
          remaining,
          hash: native.props.hash,
          enhancementLevel: Number(native.props.enhancementLevel || 0),
        };
        submit();
      },
      true,
    );
  },
});
