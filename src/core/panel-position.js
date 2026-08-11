// Shared placement for anchored floating panels (production profit, enhancement
// cost, ...). Given an anchor and a panel already in the DOM, it picks the first
// side with room — right, then left, then below/above — and clamps the panel
// inside the viewport. Returns the chosen coordinates and placement so callers
// can apply them and expose the placement for styling.

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function computeAnchoredPanelPosition(
  anchorRect,
  panelRect,
  options = {},
) {
  const gap = Number(options.gap) || 0;
  const margin = Number(options.margin) || 0;
  const viewportWidth =
    Number(options.viewportWidth) ||
    globalThis.innerWidth ||
    globalThis.document?.documentElement?.clientWidth ||
    0;
  const viewportHeight =
    Number(options.viewportHeight) ||
    globalThis.innerHeight ||
    globalThis.document?.documentElement?.clientHeight ||
    0;

  const roomRight = viewportWidth - anchorRect.right - margin;
  const roomLeft = anchorRect.left - margin;
  const maxTop = viewportHeight - panelRect.height - margin;

  let placement = "right";
  let left;
  let top;

  if (roomRight >= panelRect.width + gap) {
    left = anchorRect.right + gap;
    top = clamp(anchorRect.top, margin, maxTop);
  } else if (roomLeft >= panelRect.width + gap) {
    placement = "left";
    left = anchorRect.left - panelRect.width - gap;
    top = clamp(anchorRect.top, margin, maxTop);
  } else {
    const roomBelow = viewportHeight - anchorRect.bottom - margin;
    placement = roomBelow >= panelRect.height + gap ? "bottom" : "top";
    left = clamp(
      anchorRect.left,
      margin,
      viewportWidth - panelRect.width - margin,
    );
    top =
      placement === "bottom"
        ? anchorRect.bottom + gap
        : anchorRect.top - panelRect.height - gap;
    top = clamp(top, margin, maxTop);
  }

  return { left: Math.round(left), top: Math.round(top), placement };
}

// Position a live panel next to its anchor and record the chosen side on the
// element's dataset. Returns false if either element has left the DOM.
export function positionAnchoredPanel(anchor, panel, options = {}) {
  if (!anchor?.isConnected || !panel?.isConnected) return false;
  const { left, top, placement } = computeAnchoredPanelPosition(
    anchor.getBoundingClientRect(),
    panel.getBoundingClientRect(),
    options,
  );
  panel.dataset.placement = placement;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  return true;
}
