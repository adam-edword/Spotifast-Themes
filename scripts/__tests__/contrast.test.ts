import { describe, expect, it } from "vitest";
import { composite, contrastRatio, luminance, parseHex, themeContrast } from "../contrast.ts";
import { deltaE2000, isNearDuplicate, rgbToLab } from "../color.ts";
import { DARK_DEFAULTS, LIGHT_DEFAULTS } from "../resolve.ts";

describe("contrast", () => {
  it("parses 6 and 8 digit hex", () => {
    expect(parseHex("#1ed760")).toEqual({ rgb: [30, 215, 96], alpha: 1 });
    expect(parseHex("#00000080").alpha).toBeCloseTo(128 / 255);
  });

  it("matches known WCAG values", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
    expect(luminance([0, 0, 0])).toBe(0);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1);
    // #777777 on white is the classic just-under-4.5 example
    expect(contrastRatio([0x77, 0x77, 0x77], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it("composites alpha over the backdrop", () => {
    expect(composite("#ffffff80", "#000000")).toEqual([128, 128, 128]);
    expect(composite("#ff0000", "#000000")).toEqual([255, 0, 0]);
  });

  it("measures transparent colors as they appear over the window", () => {
    const opaque = themeContrast("#ffffff", "#000000", "#000000");
    const faded = themeContrast("#ffffff40", "#000000", "#000000");
    expect(faded).toBeLessThan(opaque);
  });

  it("finds Spotifast's own light accent pair below 4.5 but above 3", () => {
    const ratio = themeContrast(LIGHT_DEFAULTS.on_accent, LIGHT_DEFAULTS.accent, LIGHT_DEFAULTS.window);
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe("CIEDE2000", () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), table 1.
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
  ] as const)("%j vs %j = %d", (a, b, expected) => {
    expect(deltaE2000([...a], [...b])).toBeCloseTo(expected, 3);
  });

  it("converts white and black to Lab", () => {
    const [l] = rgbToLab([255, 255, 255]);
    expect(l).toBeCloseTo(100, 2);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 5);
  });

  it("treats a palette as a near-duplicate of itself but not of the other base", () => {
    expect(isNearDuplicate(DARK_DEFAULTS, { ...DARK_DEFAULTS })).toBe(true);
    expect(isNearDuplicate(DARK_DEFAULTS, LIGHT_DEFAULTS)).toBe(false);
    expect(isNearDuplicate(DARK_DEFAULTS, { ...DARK_DEFAULTS, accent: "#ff0000" })).toBe(false);
  });
});
