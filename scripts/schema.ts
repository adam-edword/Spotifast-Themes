import { z } from "zod";

// The 17 colors Spotifast reads from a theme file. Order matches Spotifast's docs.
export const COLOR_KEYS = [
  "window",
  "panel",
  "surface",
  "surface_hover",
  "surface_active",
  "outline",
  "text",
  "secondary",
  "dim",
  "accent",
  "accent_hover",
  "on_accent",
  "danger",
  "warning",
  "overlay",
  "shadow",
  "tint",
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export const TAGS = [
  "dark",
  "light",
  "minimal",
  "vibrant",
  "pastel",
  "high-contrast",
  "retro",
  "warm",
  "cool",
  "monochrome",
] as const;

export type Tag = (typeof TAGS)[number];

export const THEME_MAX_BYTES = 4 * 1024;
export const META_MAX_BYTES = 1024;

export const NAME_PATTERN = /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/;
// GitHub logins: letters, digits and single hyphens, no leading or trailing hyphen, max 39.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "must be #RRGGBB or #RRGGBBAA");

const colorsShape = Object.fromEntries(
  COLOR_KEYS.map((key) => [key, hexColor.optional()]),
) as Record<ColorKey, z.ZodOptional<typeof hexColor>>;

export const themeSchema = z
  .object({
    base: z.enum(["dark", "light"]).optional(),
    colors: z.object(colorsShape).strict().optional(),
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "is not a real date");

export const metaSchema = z
  .object({
    name: z
      .string()
      .min(3, "must be at least 3 characters")
      .max(30, "must be at most 30 characters")
      .regex(NAME_PATTERN, "can only use letters, numbers and single spaces"),
    github: z.string().regex(GITHUB_LOGIN, "is not a valid GitHub username"),
    tags: z
      .array(z.enum(TAGS))
      .max(4, "can have at most 4 tags")
      .refine((tags) => new Set(tags).size === tags.length, "can't repeat a tag"),
    added: isoDate,
    // null for themes the owner committed directly, without a submission issue
    issue: z.number().int().positive("must be a positive issue number").nullable(),
  })
  .strict();

export type Meta = z.infer<typeof metaSchema>;

export function slugify(name: string): string {
  return name.toLowerCase().replace(/ /g, "-");
}

// removed.json: themes the owner took down. Two strikes and a submitter's new themes wait for a person.
export const removedSchema = z.array(
  z
    .object({
      slug: z.string(),
      name: z.string(),
      github: z.string(),
      date: isoDate,
      reasons: z.record(z.string(), z.number().int().nonnegative()),
    })
    .strict(),
);

export type RemovedEntry = z.infer<typeof removedSchema>[number];
