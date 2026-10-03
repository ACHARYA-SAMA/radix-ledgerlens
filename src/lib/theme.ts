/* Repository touch marker. */
export type Theme = "dark" | "light";

const storageKey = "ledgerlens-theme";

export function readTheme(): Theme {
  try {
    return window.localStorage.getItem(storageKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // The selection still works for this visit when storage is unavailable.
  }
}
