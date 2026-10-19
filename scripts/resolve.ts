import { COLOR_KEYS, type ColorKey, type Theme } from "./schema.ts";

export type Palette = Record<ColorKey, string>;

// Copied from Palette::dark() and Palette::light() in src/theme.rs of
// crmne/spotifast v0.13.3. Spotifast fills any color a theme leaves out from these.
export const DARK_DEFAULTS: Palette = {
  window: "#0f1114",
  panel: "#15181c",
  surface: "#1d2127",
  surface_hover: "#262b33",
  surface_active: "#2f353f",
  outline: "#2a3038",
  text: "#f2f4f6",
  secondary: "#a9b1bc",
  dim: "#6e7784",
  accent: "#1ed760",
  accent_hover: "#3ce87a",
  on_accent: "#0a140e",
  danger: "#f5717f",
  warning: "#f2b85c",
  overlay: "#22272e",
  shadow: "#0000008c",
  tint: "#00000000",
};

export const LIGHT_DEFAULTS: Palette = {
  window: "#f8f9fb",
  panel: "#ffffff",
  surface: "#eef0f3",
  surface_hover: "#e3e6eb",
  surface_active: "#d7dbe1",
  outline: "#dde1e6",
  text: "#14171a",
  secondary: "#535b66",
  dim: "#8b939e",
  accent: "#15a64a",
  accent_hover: "#128f40",
  on_accent: "#ffffff",
  danger: "#d63b4c",
  warning: "#b87a14",
  overlay: "#ffffff",
  shadow: "#00000032",
  tint: "#00000000",
};

export function resolveTheme(theme: Theme): Palette {
  const defaults = theme.base === "light" ? LIGHT_DEFAULTS : DARK_DEFAULTS;
  const resolved = { ...defaults };
  for (const key of COLOR_KEYS) {
    const value = theme.colors?.[key];
    if (value) resolved[key] = value.toLowerCase();
  }
  return resolved;
}
