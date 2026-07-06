// Central keybind registry — the single source of truth for global shortcuts.
//
// Before this, the actual handlers lived as an inline `keydown` switch in
// AppLayout while the Settings > Keybinds pane rendered a separate hand-written
// list — the two drifted (the pane omitted Search and Bookmarks). Now both read
// from here: AppLayout dispatches via `handleGlobalKeydown`, and the settings
// pane renders `GLOBAL_KEYBINDS` + `DOC_KEYBINDS`, so the cheat sheet can never
// lie about what the app actually does.
//
// (User-rebindable shortcuts — the reference's full KeybindManager with custom
// overrides — are a later slice; this is the accurate, centralized baseline.)

import { ui } from "./stores";

export interface Keybind {
  id: string;
  label: string;
  /** Human-readable combo shown in the settings cheat sheet. */
  keys: string;
  /** True when this event should trigger the bind. */
  match: (e: KeyboardEvent) => boolean;
  run: () => void;
}

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

// Global shortcuts — active app-wide via the AppLayout keydown listener.
export const GLOBAL_KEYBINDS: Keybind[] = [
  {
    id: "quick-switcher",
    label: "Quick Switcher",
    keys: "Ctrl/Cmd+K",
    match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "k",
    run: () => ui.toggleQuickSwitcher(),
  },
  {
    id: "search",
    label: "Search Messages",
    keys: "Ctrl/Cmd+Shift+F",
    match: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === "f",
    run: () => ui.openSearch(),
  },
  {
    id: "bookmarks",
    label: "Toggle Bookmarks",
    keys: "Ctrl/Cmd+I",
    match: (e) => mod(e) && e.key.toLowerCase() === "i",
    run: () => ui.toggleBookmarks(),
  },
];

// Documentation-only binds — handled locally where they matter (composer,
// message row), not through the global listener. Listed so the cheat sheet is
// complete.
export const DOC_KEYBINDS: { label: string; keys: string }[] = [
  { label: "Send Message", keys: "Enter" },
  { label: "Newline in Message", keys: "Shift+Enter" },
  { label: "Cancel Reply / Edit", keys: "Escape" },
  { label: "Emoji / Mention Autocomplete", keys: "Tab" },
];

// Dispatch a keydown against the global registry. Returns true if a bind fired
// (and was preventDefault-ed), so callers can early-out.
export function handleGlobalKeydown(e: KeyboardEvent): boolean {
  for (const kb of GLOBAL_KEYBINDS) {
    if (kb.match(e)) {
      e.preventDefault();
      kb.run();
      return true;
    }
  }
  return false;
}
