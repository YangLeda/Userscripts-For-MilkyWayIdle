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
        props?.itemHrid === itemHrid &&
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
  id: "inventoryLootDoubleClick",
  setting: "inventoryLootDoubleClick",
  scope: "character",
  initialize({ scope }) {
    let pending = null;
    let timeout = null;
    const stop = () => {
      pending = null;
      clearTimeout(timeout);
    };
    const currentStock = (itemHrid) =>
      (runtime.state.initData_characterItems ?? [])
        .filter(
          (entry) =>
            entry.itemHrid === itemHrid &&
            entry.itemLocationHrid === "/item_locations/inventory",
        )
        .reduce((sum, entry) => sum + Number(entry.count || 0), 0);
    const submit = () => {
      if (!pending || !runtime.settings.get("inventoryLootDoubleClick"))
        return stop();
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
      pending.beforeStock = currentStock(pending.itemHrid);
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
        currentStock(pending.itemHrid) > pending.beforeStock - pending.count
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
      "dblclick",
      (event) => {
        if (
          !runtime.settings.get("inventoryLootDoubleClick") ||
          event.button > 0
        )
          return;
        const item = event.target?.closest?.('[class*="Item_itemContainer"]');
        if (!item?.closest('[class*="Inventory_items"]')) return;
        const itemHrid = resolveEntityFromElement("item", item);
        const detail = runtime.state.initData_itemDetailMap?.[itemHrid];
        if (detail?.categoryHrid !== "/item_categories/loot") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (pending) return;
        const native = nativeLootItem(item, itemHrid);
        if (!native || native.instance?.canOpen?.() === false) return;
        const count = lootOpenCount(
          native.props,
          detail,
          runtime.state.initData_characterItems ?? [],
        );
        if (!count) return;
        const availableProps = {
          ...native.props,
          count: currentStock(itemHrid),
        };
        const remaining = lootOpenCount(
          availableProps,
          detail,
          runtime.state.initData_characterItems ?? [],
        );
        pending = { itemHrid, detail, element: item, remaining };
        submit();
      },
      true,
    );
  },
});
