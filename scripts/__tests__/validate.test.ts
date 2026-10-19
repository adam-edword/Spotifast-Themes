import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { themeContrast } from "../contrast.ts";
import { resolveTheme } from "../resolve.ts";
import { CONTRAST_RULES, validateThemes } from "../validate.ts";

const root = join(import.meta.dirname, "..", "..");
const fixtures = join(root, "scripts", "__fixtures__");

function errorsFor(fixture: string, slug?: string): string[] {
  const reports = validateThemes(join(fixtures, fixture));
  return reports.filter((r) => !slug || r.slug === slug).flatMap((r) => r.errors);
}

describe("validateThemes", () => {
  it("passes on the seed themes", () => {
    const reports = validateThemes(join(root, "themes"));
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.filter((r) => r.errors.length)).toEqual([]);
  });

  it("fails every broken fixture", () => {
    for (const fixture of readdirSync(fixtures)) {
      expect(errorsFor(fixture), fixture).not.toEqual([]);
    }
  });

  it.each([
    ["bad-hex", "#RRGGBB or #RRGGBBAA"],
    ["unknown-key", `"sidebar"`],
    ["unknown-top-level-key", `"author"`],
    ["bom", "byte order mark"],
    ["oversized", "the limit is 4096"],
    ["invalid-json", "isn't valid JSON"],
    ["missing-meta", "is missing meta.json"],
    ["extra-file", "screenshot.png"],
    ["wrong-folder", `should be named "right-name"`],
    ["duplicate-name", "is already used by"],
    ["profane-name", "isn't allowed"],
    ["blocked-term", `can't include "spotify"`],
    ["low-contrast-text", "text on window is too hard to read"],
    ["low-contrast-accent", "on_accent on accent is too hard to read"],
    ["tag-mismatch", `tagged "light" but its base is "dark"`],
    ["bad-meta", "not a real date"],
  ])("%s explains the problem", (fixture, message) => {
    expect(errorsFor(fixture).join("\n")).toContain(message);
  });

  it("blames the newer theme for a near-duplicate", () => {
    expect(errorsFor("near-duplicate", "original")).toEqual([]);
    expect(errorsFor("near-duplicate", "knockoff").join()).toContain(`almost identical to the existing theme "Original"`);
  });

  it.each(["dark", "light"] as const)("lets Spotifast's own %s defaults pass the contrast rules", (base) => {
    const palette = resolveTheme({ base });
    for (const [fg, bg, min] of CONTRAST_RULES) {
      expect(themeContrast(palette[fg], palette[bg], palette.window), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it("rejects copies of reference palettes", () => {
    const reference = [{ name: "Original", palette: resolveTheme({ base: "dark", colors: { window: "#101820", accent: "#f2aa4c", on_accent: "#101820" } }) }];
    const reports = validateThemes(join(fixtures, "near-duplicate"), { reference });
    expect(reports.find((r) => r.slug === "original")!.errors.join()).toContain(`Spotifast's built-in "Original"`);
  });
});
