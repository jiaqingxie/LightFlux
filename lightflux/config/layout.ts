// The routed desktop shell needs room for its 78px navigation rail, an 8px
// divider, and two panes that remain usable at roughly 360px each.
export const DESKTOP_LAYOUT_BREAKPOINT = 820;

// Mobile browsers can lose a meaningful part of their usable height to browser
// chrome even on physically tall phones. Keep the navigation compact when the
// current viewport, rather than the device model, is short.
export const COMPACT_MOBILE_HEIGHT_BREAKPOINT = 700;

// Task/list columns grow with the window instead of staying a narrow centered
// strip, but stay capped so ultra-wide monitors do not stretch rows into lines
// that are hard to scan. Keeps 20px of gutter on each side.
export const LIST_MAX_WIDTH = 1100;
export const listContentMaxWidth = (width: number): number =>
  Math.min(LIST_MAX_WIDTH, Math.max(720, width - 40));
