import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { isNearDuplicate } from "./color.ts";
import { themeContrast } from "./contrast.ts";
import { moderateName } from "./moderation.ts";
import { resolveTheme, type Palette } from "./resolve.ts";
import {
  META_MAX_BYTES,
  THEME_MAX_BYTES,
  metaSchema,
  removedSchema,
  slugify,
  themeSchema,
  type Meta,
  type Theme,
} from "./schema.ts";

export interface ThemeReport {
  slug: string;
  errors: string[];
}

// Minimum contrast ratios checked on every resolved palette: [foreground, background, minimum].
export const CONTRAST_RULES = [
  ["text", "window", 4.5],
  ["on_accent", "accent", 3.0],
  ["secondary", "window", 3.0],
] as const;

interface LoadedTheme {
  slug: string;
  meta?: Meta;
  palette?: Palette;
  errors: string[];
}

export interface ValidateOptions {
  // Palettes a new theme must not copy, besides the ones already in the folder.
  reference?: { name: string; palette: Palette }[];
  // A theme being submitted right now: always treated as the newest one.
  candidate?: string;
}

export function validateThemes(themesDir: string, options: ValidateOptions = {}): ThemeReport[] {
  const slugs = readdirSync(themesDir).filter((entry) => !entry.startsWith(".")).sort();
  const loaded = slugs.map((slug) => loadTheme(themesDir, slug));

  checkUniqueNames(loaded);
  checkNearDuplicates(loaded, options.reference ?? [], options.candidate);

  return loaded.map(({ slug, errors }) => ({ slug, errors }));
}

function loadTheme(themesDir: string, slug: string): LoadedTheme {
  const dir = join(themesDir, slug);
  const result: LoadedTheme = { slug, errors: [] };
  const errors = result.errors;

  if (!statSync(dir).isDirectory()) {
    errors.push("should be a folder, not a file");
    return result;
  }

  const files = readdirSync(dir).sort();
  const expected = ["meta.json", "theme.json"];
  const extra = files.filter((f) => !expected.includes(f));
  const missing = expected.filter((f) => !files.includes(f));
  if (missing.length) errors.push(`is missing ${missing.join(" and ")}`);
  if (extra.length) errors.push(`has extra files it shouldn't: ${extra.join(", ")}`);
  if (missing.length) return result;

  const theme = readJson(join(dir, "theme.json"), "theme.json", THEME_MAX_BYTES, themeSchema, errors);
  const meta = readJson(join(dir, "meta.json"), "meta.json", META_MAX_BYTES, metaSchema, errors);

  if (meta) {
    result.meta = meta;
    for (const reason of moderateName(meta.name)) errors.push(`name "${meta.name}" ${reason}`);
    if (slugify(meta.name) !== slug) {
      errors.push(`folder should be named "${slugify(meta.name)}" to match the theme name`);
    }
  }

  if (theme) {
    const palette = resolveTheme(theme);
    result.palette = palette;
    for (const [fg, bg, min] of CONTRAST_RULES) {
      const ratio = themeContrast(palette[fg], palette[bg], palette.window);
      if (ratio < min) {
        errors.push(
          `${fg} on ${bg} is too hard to read: contrast is ${ratio.toFixed(2)} to 1, needs at least ${min} to 1`,
        );
      }
    }
  }

  if (theme && meta) checkBaseTags(theme, meta, errors);
  return result;
}

function readJson<T>(
  path: string,
  label: string,
  maxBytes: number,
  schema: z.ZodType<T>,
  errors: string[],
): T | undefined {
  const bytes = readFileSync(path);
  if (bytes.length > maxBytes) {
    errors.push(`${label} is ${bytes.length} bytes, the limit is ${maxBytes}`);
    return undefined;
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    errors.push(`${label} starts with a byte order mark (BOM), save it as plain UTF-8`);
    return undefined;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    errors.push(`${label} isn't valid UTF-8 text`);
    return undefined;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    errors.push(`${label} isn't valid JSON: ${(e as Error).message}`);
    return undefined;
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${label}: ${describeIssue(issue)}`);
    return undefined;
  }
  return parsed.data;
}

// Rewords zod's default messages so they read well in an issue comment.
function describeIssue(issue: z.core.$ZodIssue): string {
  const where = issue.path.length ? `"${issue.path.join(".")}"` : "the file";
  switch (issue.code) {
    case "unrecognized_keys":
      return `${where} has ${issue.keys.length > 1 ? "fields" : "a field"} that aren't allowed: ${issue.keys.map((k) => `"${k}"`).join(", ")}`;
    case "invalid_value":
      return `${where} has to be one of ${issue.values.map((v) => `"${String(v)}"`).join(", ")}`;
    case "invalid_type":
      return `${where} is missing or the wrong type (expected ${issue.expected})`;
    default:
      return `${where} ${issue.message}`;
  }
}

function checkBaseTags(theme: Theme, meta: Meta, errors: string[]) {
  const base = theme.base ?? "dark";
  const opposite = base === "dark" ? "light" : "dark";
  if (meta.tags.includes(opposite)) {
    errors.push(`is tagged "${opposite}" but its base is "${base}"`);
  }
}

function checkUniqueNames(themes: LoadedTheme[]) {
  const byName = new Map<string, LoadedTheme[]>();
  for (const t of themes) {
    if (!t.meta) continue;
    const key = t.meta.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), t]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const t of group) {
      const others = group.filter((o) => o !== t).map((o) => o.slug);
      t.errors.push(`name "${t.meta!.name}" is already used by ${others.join(", ")}`);
    }
  }
}

// The newer of two near-identical themes gets the error; the older one keeps its spot.
function checkNearDuplicates(
  themes: LoadedTheme[],
  reference: { name: string; palette: Palette }[],
  candidate?: string,
) {
  const ordered = themes
    .filter((t) => t.palette && t.meta)
    .sort(
      (a, b) =>
        Number(a.slug === candidate) - Number(b.slug === candidate) ||
        a.meta!.added.localeCompare(b.meta!.added) ||
        a.slug.localeCompare(b.slug),
    );

  ordered.forEach((theme, i) => {
    const ref = reference.find((r) => isNearDuplicate(theme.palette!, r.palette));
    if (ref) {
      theme.errors.push(`colors are almost identical to Spotifast's built-in "${ref.name}" theme`);
      return;
    }
    const earlier = ordered.slice(0, i).find((o) => isNearDuplicate(theme.palette!, o.palette!));
    if (earlier) {
      theme.errors.push(`colors are almost identical to the existing theme "${earlier.meta!.name}"`);
    }
  });
}

export function formatReport(reports: ThemeReport[]): string {
  const failing = reports.filter((r) => r.errors.length);
  if (!failing.length) {
    return `All ${reports.length} themes look good.`;
  }
  const lines = failing.flatMap((r) => [`✗ ${r.slug}`, ...r.errors.map((e) => `  - ${e}`)]);
  lines.push("", `${failing.length} of ${reports.length} themes need fixes.`);
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const themesDir = resolve(process.argv[2] ?? "themes");
  // TODO: pass Spotifast's 8 bundled palettes as `reference` once we have copies of them
  // (they aren't in the crmne/spotifast repo; take them from a fresh install's themes folder).
  const reports = validateThemes(themesDir);
  console.log(formatReport(reports));
  const removedPath = join(themesDir, "..", "removed.json");
  const removed = removedSchema.safeParse(JSON.parse(readFileSync(removedPath, "utf8")));
  if (!removed.success) {
    console.log(`removed.json is broken: ${removed.error.issues.map((i) => i.message).join("; ")}`);
    process.exit(1);
  }
  process.exit(reports.some((r) => r.errors.length) ? 1 : 0);
}
