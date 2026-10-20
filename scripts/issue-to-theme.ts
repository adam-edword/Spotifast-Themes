import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkedOptions, parseIssueForm, stripCodeFences } from "./issue-form.ts";
import { NAME_PATTERN, TAGS, metaSchema, slugify, type Meta, type Tag } from "./schema.ts";
import { validateThemes } from "./validate.ts";

// These must match the labels in .github/ISSUE_TEMPLATE/submit-theme.yml (a test checks).
export const FORM = {
  name: "Theme name",
  tags: "Tags",
  theme: "theme.json",
  promises: "Before you share",
} as const;

export const PROMISES = [
  "I made this theme myself",
  "I'm releasing it under CC0, so anyone can use it",
  "I tried it in Spotifast",
] as const;

export const MAX_EXTRA_TAGS = 3;
const MAX_PASTE_BYTES = 16 * 1024;

export type Submission =
  | { ok: true; slug: string; name: string; meta: Meta; files: Record<string, string> }
  | { ok: false; name?: string; errors: string[] };

export interface SubmissionInput {
  body: string;
  login: string;
  issue: number;
  today: string;
  themesDir: string;
}

export function buildSubmission({ body, login, issue, today, themesDir }: SubmissionInput): Submission {
  const form = parseIssueForm(body);
  const errors: string[] = [];

  const name = (form.get(FORM.name) ?? "").trim();
  if (!name) {
    errors.push("Give your theme a name.");
  } else if (name.length < 3 || name.length > 30 || !NAME_PATTERN.test(name)) {
    errors.push(`The name "${name}" needs to be 3 to 30 characters, using only letters, numbers and single spaces.`);
  }

  const checked = checkedOptions(form.get(FORM.promises) ?? "");
  if (!PROMISES.every((p) => checked.includes(p))) {
    errors.push(`Tick all three boxes under "${FORM.promises}".`);
  }

  const raw = stripCodeFences(form.get(FORM.theme) ?? "");
  // Parsed but not yet checked; the validator below explains anything wrong with it.
  let theme: unknown;
  if (!raw) {
    errors.push("Paste your theme file into the theme.json box.");
  } else if (Buffer.byteLength(raw) > MAX_PASTE_BYTES) {
    errors.push("The theme file is way too big. A full theme is usually around 700 bytes.");
  } else {
    try {
      theme = JSON.parse(raw);
    } catch (e) {
      errors.push(`The theme file isn't valid JSON. ${(e as Error).message}.`);
    }
  }

  const extraTags = checkedOptions(form.get(FORM.tags) ?? "").filter(
    (t): t is Tag => (TAGS as readonly string[]).includes(t) && t !== "dark" && t !== "light",
  );
  if (extraTags.length > MAX_EXTRA_TAGS) {
    errors.push(`Pick up to ${MAX_EXTRA_TAGS} tags. You picked ${extraTags.length}.`);
  }

  // Never touch the filesystem with a name we haven't checked: it becomes a folder name.
  if (errors.length || theme === undefined) return { ok: false, name: name || undefined, errors };

  const slug = slugify(name);
  if (existsSync(join(themesDir, slug))) {
    return { ok: false, name, errors: [`There's already a theme called "${name}". Pick a different name.`] };
  }

  const base =
    typeof theme === "object" && theme !== null && (theme as { base?: unknown }).base === "light" ? "light" : "dark";
  const meta: Meta = { name, github: login, tags: [base, ...extraTags], added: today, issue };
  const metaCheck = metaSchema.safeParse(meta);
  if (!metaCheck.success) {
    return { ok: false, name, errors: metaCheck.error.issues.map((i) => `${i.path.join(".")} ${i.message}`) };
  }

  const files = {
    [`themes/${slug}/theme.json`]: `${JSON.stringify(theme, null, 2)}\n`,
    [`themes/${slug}/meta.json`]: `${JSON.stringify(meta, null, 2)}\n`,
  };

  // Check it alongside every existing theme, so name clashes and copies are caught too.
  const scratch = mkdtempSync(join(tmpdir(), "submission-"));
  try {
    cpSync(themesDir, scratch, { recursive: true });
    mkdirSync(join(scratch, slug));
    writeFileSync(join(scratch, slug, "theme.json"), files[`themes/${slug}/theme.json`]);
    writeFileSync(join(scratch, slug, "meta.json"), files[`themes/${slug}/meta.json`]);
    const report = validateThemes(scratch, { candidate: slug }).find((r) => r.slug === slug);
    if (report?.errors.length) return { ok: false, name, errors: report.errors };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  return { ok: true, slug, name, meta, files };
}
