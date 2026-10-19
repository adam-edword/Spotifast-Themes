import { describe, expect, it } from "vitest";
import { metaSchema, slugify, themeSchema } from "../schema.ts";
import { resolveTheme, DARK_DEFAULTS, LIGHT_DEFAULTS } from "../resolve.ts";

const meta = { name: "Stock Green", github: "adam-edword", tags: ["dark"], added: "2026-10-19", issue: 12 };

describe("themeSchema", () => {
  it("accepts Spotifast's documented example and an empty theme", () => {
    expect(themeSchema.safeParse({ base: "dark", colors: { window: "#121212", accent: "#1ed760" } }).success).toBe(true);
    expect(themeSchema.safeParse({}).success).toBe(true);
    expect(themeSchema.safeParse({ base: "light", colors: { shadow: "#00000080" } }).success).toBe(true);
  });

  it.each([
    { base: "dim" },
    { colors: { window: "121212" } },
    { colors: { window: "#12121" } },
    { colors: { window: "#1212121" } },
    { colors: { window: "#gggggg" } },
    { colors: { window: "red" } },
    { colors: { sidebar: "#000000" } },
    { name: "extra" },
  ])("rejects %j", (theme) => {
    expect(themeSchema.safeParse(theme).success).toBe(false);
  });
});

describe("metaSchema", () => {
  it("accepts a normal entry and an owner seed with no issue", () => {
    expect(metaSchema.safeParse(meta).success).toBe(true);
    expect(metaSchema.safeParse({ ...meta, issue: null }).success).toBe(true);
  });

  it.each([
    { name: "ab" },
    { name: "a".repeat(31) },
    { name: "Two  Spaces" },
    { name: " Leading" },
    { name: "Emoji 🎵" },
    { name: "Dash-Name" },
    { github: "-bad" },
    { github: "a".repeat(40) },
    { tags: ["dark", "light", "warm", "cool", "retro"] },
    { tags: ["dark", "dark"] },
    { tags: ["spooky"] },
    { added: "2026-13-01" },
    { added: "19-10-2026" },
    { issue: 0 },
    { description: "free text is not allowed" },
  ])("rejects %j", (change) => {
    expect(metaSchema.safeParse({ ...meta, ...change }).success).toBe(false);
  });

  it("slugifies names", () => {
    expect(slugify("Midnight Vinyl 2")).toBe("midnight-vinyl-2");
  });
});

describe("resolveTheme", () => {
  it("fills omitted colors from the matching base", () => {
    expect(resolveTheme({})).toEqual(DARK_DEFAULTS);
    expect(resolveTheme({ base: "light" })).toEqual(LIGHT_DEFAULTS);
    const resolved = resolveTheme({ base: "light", colors: { accent: "#ABCDEF" } });
    expect(resolved.accent).toBe("#abcdef");
    expect(resolved.window).toBe(LIGHT_DEFAULTS.window);
  });
});
