import { composite, themeContrast, toHex } from "../../../scripts/contrast.ts";
import type { Palette } from "../../../scripts/resolve.ts";

// Maps a theme's palette onto the site's own CSS variables, so "Try it on" can
// dress the whole site in that theme. Transparent colors are flattened first.
export function tryOnVars(p: Palette, base: "dark" | "light"): Record<string, string> {
  const window = toHex(composite(p.window, base === "dark" ? "#000000" : "#ffffff"));
  const flat = (hex: string) => toHex(composite(hex, window));
  // Links sit on the page background, so only use the accent if it's readable there.
  const accentText = themeContrast(p.accent, p.window, p.window) >= 4.5 ? flat(p.accent) : flat(p.text);
  return {
    "--bg": flat(p.panel),
    "--panel": window,
    "--card": flat(p.surface),
    "--card-hover": flat(p.surface_hover),
    "--raised": flat(p.surface),
    "--chip": flat(p.surface),
    "--chip-hover": flat(p.surface_hover),
    "--outline": flat(p.outline),
    "--text": flat(p.text),
    "--text-2": flat(p.secondary),
    "--text-3": flat(p.dim),
    "--accent": flat(p.accent),
    "--accent-hover": flat(p.accent_hover),
    "--accent-text": accentText,
    "--on-accent": flat(p.on_accent),
    "--fade": `color-mix(in srgb, ${flat(p.accent)} 40%, ${window})`,
    "--focus": flat(p.text),
    "color-scheme": base,
  };
}
