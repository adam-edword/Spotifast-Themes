import { describe, expect, it } from "vitest";
import { renderPreview } from "../preview.ts";
import { DARK_DEFAULTS, LIGHT_DEFAULTS, resolveTheme } from "../resolve.ts";

describe("renderPreview", () => {
  it("is byte-identical for the same input", () => {
    expect(renderPreview(DARK_DEFAULTS, "Same Name")).toBe(renderPreview({ ...DARK_DEFAULTS }, "Same Name"));
  });

  it("uses the palette's colors", () => {
    const svg = renderPreview(resolveTheme({ colors: { accent: "#ff00aa", warning: "#123456", danger: "#654321" } }), "Pink");
    for (const color of ["#ff00aa", "#123456", "#654321", DARK_DEFAULTS.window, DARK_DEFAULTS.panel]) {
      expect(svg).toContain(color);
    }
  });

  it("splits alpha colors into fill and opacity", () => {
    const svg = renderPreview(LIGHT_DEFAULTS, "Light");
    expect(svg).toContain(`fill="#000000" fill-opacity="0.196"`);
    expect(svg).not.toMatch(/fill="#[0-9a-f]{8}"/);
  });

  it("adds the header fade only when tint is visible", () => {
    expect(renderPreview(DARK_DEFAULTS, "Plain")).not.toContain("linearGradient");
    expect(renderPreview({ ...DARK_DEFAULTS, tint: "#ff000033" }, "Tinted")).toContain("linearGradient");
  });

  it("shrinks long names so they fit", () => {
    const size = (svg: string) => Number(svg.match(/font-size="(\d+)" font-weight="800" fill="[^"]+">Long/)?.[1]);
    expect(size(renderPreview(DARK_DEFAULTS, "Long " + "x".repeat(25)))).toBeLessThan(40);
    expect(size(renderPreview(DARK_DEFAULTS, "Long"))).toBe(64);
  });
});
