import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderAll } from "./preview.ts";
import { metaSchema } from "./schema.ts";

// Writes the generated files the site serves: one preview per theme, and each
// theme.json copied to download/<slug>/<Theme Name>.json so it saves with the right name.
const themesDir = resolve("themes");
const publicDir = resolve("site/public");

const slugs = renderAll(themesDir, join(publicDir, "previews"));

rmSync(join(publicDir, "download"), { recursive: true, force: true });
for (const slug of slugs) {
  const meta = metaSchema.parse(JSON.parse(readFileSync(join(themesDir, slug, "meta.json"), "utf8")));
  const dir = join(publicDir, "download", slug);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(themesDir, slug, "theme.json"), join(dir, `${meta.name}.json`));
}

console.log(`Prepared previews and downloads for ${slugs.length} themes`);
