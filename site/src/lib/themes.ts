import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTheme, type Palette } from "../../../scripts/resolve.ts";
import { metaSchema, themeSchema, type Meta, type Theme } from "../../../scripts/schema.ts";

export interface GalleryTheme {
  slug: string;
  meta: Meta;
  theme: Theme;
  palette: Palette;
  base: "dark" | "light";
  // The exact file contents, as users download them
  json: string;
  downloadName: string;
}

const THEMES_DIR = join(process.cwd(), "..", "themes");

let cache: GalleryTheme[] | undefined;

// Every theme in the repo, newest first.
export function loadThemes(): GalleryTheme[] {
  if (cache) return cache;
  cache = readdirSync(THEMES_DIR)
    .filter((slug) => !slug.startsWith("."))
    .map((slug) => {
      const json = readFileSync(join(THEMES_DIR, slug, "theme.json"), "utf8");
      const theme = themeSchema.parse(JSON.parse(json));
      const meta = metaSchema.parse(JSON.parse(readFileSync(join(THEMES_DIR, slug, "meta.json"), "utf8")));
      return {
        slug,
        meta,
        theme,
        palette: resolveTheme(theme),
        base: theme.base ?? "dark",
        json,
        downloadName: `${meta.name}.json`,
      };
    })
    .sort((a, b) => b.meta.added.localeCompare(a.meta.added) || a.meta.name.localeCompare(b.meta.name));
  return cache;
}

export const REPO_URL = process.env.REPO_URL ?? "https://github.com/adam-edword/Spotifast-Themes";

export function reportUrl(slug: string): string {
  return `${REPO_URL}/issues/new?template=report-theme.yml&slug=${encodeURIComponent(slug)}`;
}

export const SUBMIT_URL = `${REPO_URL}/issues/new?template=submit-theme.yml`;

// Joins a path onto the site's base, e.g. url("themes/x/") → "/Spotifast-Themes/themes/x/".
export function url(path = ""): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/${path.replace(/^\//, "")}`;
}

export const SWATCH_KEYS = ["window", "panel", "surface", "text", "accent", "secondary"] as const;
