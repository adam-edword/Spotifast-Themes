export type Rgb = [number, number, number];

export interface Rgba {
  rgb: Rgb;
  alpha: number;
}

export function parseHex(hex: string): Rgba {
  const h = hex.replace(/^#/, "");
  const channel = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return {
    rgb: [channel(0), channel(2), channel(4)],
    alpha: h.length === 8 ? channel(6) / 255 : 1,
  };
}

// Blends a possibly transparent color over an opaque backdrop.
export function composite(color: string, backdrop: string): Rgb {
  const { rgb, alpha } = parseHex(color);
  const under = parseHex(backdrop).rgb;
  return rgb.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha))) as Rgb;
}

// WCAG 2.1 relative luminance.
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Contrast of foreground on background, both composited over the theme's window first.
export function themeContrast(fg: string, bg: string, window: string): number {
  const opaqueWindow = composite(window, "#000000");
  const windowHex = toHex(opaqueWindow);
  const back = composite(bg, windowHex);
  const front = composite(fg, toHex(back));
  return contrastRatio(front, back);
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
