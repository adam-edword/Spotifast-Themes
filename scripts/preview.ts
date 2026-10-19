import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHex } from "./contrast.ts";
import { resolveTheme, type Palette } from "./resolve.ts";
import { metaSchema, themeSchema } from "./schema.ts";

const W = 1200;
const H = 750;
const SIDEBAR = 280;
const PLAYER = 88;
const FONT = `system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

// SVG fill/stroke for a #RRGGBB or #RRGGBBAA color, split into color + opacity
// so it renders the same in every browser and image tool.
function paint(hex: string, attr: "fill" | "stroke" = "fill"): string {
  const { alpha } = parseHex(hex);
  const rgb = hex.slice(0, 7);
  if (alpha >= 1) return `${attr}="${rgb}"`;
  return `${attr}="${rgb}" ${attr}-opacity="${round(alpha)}"`;
}

function round(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function rect(x: number, y: number, w: number, h: number, color: string, r = 0): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${r ? ` rx="${r}"` : ""} ${paint(color)}/>`;
}

function text(
  x: number,
  y: number,
  content: string,
  color: string,
  size: number,
  opts: { weight?: number; anchor?: "start" | "middle" | "end" } = {},
): string {
  const weight = opts.weight ? ` font-weight="${opts.weight}"` : "";
  const anchor = opts.anchor && opts.anchor !== "start" ? ` text-anchor="${opts.anchor}"` : "";
  return `<text x="${x}" y="${y}" font-size="${size}"${weight}${anchor} ${paint(color)}>${escapeXml(content)}</text>`;
}

function line(x1: number, y1: number, x2: number, y2: number, color: string): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${paint(color, "stroke")} stroke-width="1"/>`;
}

function circle(cx: number, cy: number, r: number, color: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" ${paint(color)}/>`;
}

// Right-pointing play triangle centered on (cx, cy).
function playIcon(cx: number, cy: number, size: number, color: string): string {
  const h = size;
  const w = size * 0.87;
  const x = cx - w / 3;
  return `<path d="M${round(x)} ${round(cy - h / 2)}L${round(x + w)} ${cy}L${round(x)} ${round(cy + h / 2)}Z" ${paint(color)}/>`;
}

const PLAYLISTS = [
  ["Liked Songs", "Playlist · 248 songs"],
  ["Daily Mix 1", "Playlist · Made for you"],
  ["Late Night Drive", "Playlist · You"],
  ["Coffee Shop", "Playlist · You"],
  ["Workout Mix", "Playlist · You"],
  ["Road Trip", "Playlist · You"],
] as const;

const TRACKS = [
  ["Neon Avenue", "The Night Shift", "City Lights", "3:41"],
  ["Slow Motion", "Paper Planes", "Weekend", "4:02"],
  ["Golden Hour", "Marlowe", "Sunsets", "3:15"],
  ["Static Hearts", "Blue Arcade", "Static", "2:58"],
  ["Low Tide", "Harbor Kids", "Coastline", "3:33"],
  ["After Midnight", "The Night Shift", "City Lights", "4:20"],
] as const;

const NOW_PLAYING = 1;
const HOVERED = 2;
const SELECTED_PLAYLIST = 2;

export function renderPreview(p: Palette, name: string): string {
  const out: string[] = [];
  const mainX = SIDEBAR;
  const mainW = W - SIDEBAR;
  const playerY = H - PLAYER;

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">`,
  );

  // Header fade from tint, only when the theme sets a visible one.
  const tintAlpha = parseHex(p.tint).alpha;
  if (tintAlpha > 0) {
    out.push(
      `<defs><linearGradient id="tint" x1="0" y1="0" x2="0" y2="1">`,
      `<stop offset="0" stop-color="${p.tint.slice(0, 7)}" stop-opacity="${round(tintAlpha)}"/>`,
      `<stop offset="1" stop-color="${p.tint.slice(0, 7)}" stop-opacity="0"/>`,
      `</linearGradient></defs>`,
    );
  }

  // Main area
  out.push(rect(0, 0, W, H, p.window));
  if (tintAlpha > 0) out.push(`<rect x="${mainX}" y="0" width="${mainW}" height="340" fill="url(#tint)"/>`);

  // Sidebar
  out.push(rect(0, 0, SIDEBAR, playerY, p.panel), line(SIDEBAR - 0.5, 0, SIDEBAR - 0.5, playerY, p.outline));
  out.push(houseIcon(28, 40, p.text), text(60, 47, "Home", p.text, 15, { weight: 700 }));
  out.push(searchIcon(28, 82, p.secondary), text(60, 89, "Search", p.secondary, 15, { weight: 700 }));
  out.push(line(16, 120.5, SIDEBAR - 16, 120.5, p.outline));
  out.push(libraryIcon(28, 150, p.secondary), text(52, 156, "Your Library", p.secondary, 14, { weight: 700 }));

  PLAYLISTS.forEach(([title, sub], i) => {
    const y = 176 + i * 62;
    if (i === SELECTED_PLAYLIST) out.push(rect(12, y, SIDEBAR - 24, 56, p.surface_active, 4));
    out.push(rect(20, y + 6, 44, 44, i === 0 ? p.accent : p.surface, 4));
    if (i === 0) out.push(heartIcon(42, 28 + y, 10, p.on_accent));
    else out.push(noteIcon(42, y + 28, i === SELECTED_PLAYLIST ? p.secondary : p.dim));
    out.push(text(76, y + 25, title, i === SELECTED_PLAYLIST ? p.accent : p.text, 14, { weight: 500 }));
    out.push(text(76, y + 43, sub, p.secondary, 12));
  });

  // Notification bell with a danger dot
  out.push(bellIcon(W - 44, 34, p.secondary), circle(W - 36, 26, 4.5, p.danger));

  // Playlist header
  const coverX = mainX + 32;
  out.push(rect(coverX + 4, 58, 192, 192, p.shadow, 8));
  out.push(rect(coverX, 50, 192, 192, p.surface, 8));
  out.push(rect(coverX + 24, 74, 68, 68, p.surface_hover, 6), rect(coverX + 100, 74, 68, 68, p.accent, 6));
  out.push(rect(coverX + 24, 150, 68, 68, p.surface_active, 6), rect(coverX + 100, 150, 68, 68, p.surface_hover, 6));
  out.push(noteIcon(coverX + 134, 108, p.on_accent, 1.6));

  const titleX = coverX + 216;
  const titleMax = W - titleX - 32;
  const titleSize = Math.min(64, Math.floor(titleMax / (name.length * 0.58)));
  out.push(text(titleX, 112, "Playlist", p.secondary, 14, { weight: 600 }));
  out.push(rect(titleX + 64, 98, 44, 20, p.warning, 10));
  out.push(text(titleX + 86, 112, "NEW", p.window, 11, { weight: 800, anchor: "middle" }));
  out.push(text(titleX - 3, 112 + 20 + titleSize * 0.8, name, p.text, titleSize, { weight: 800 }));
  out.push(text(titleX, 232, "You · 24 songs, 1 hr 32 min", p.secondary, 14));

  // Action row: big play button, heart, more
  const actionY = 300;
  out.push(circle(coverX + 28, actionY, 28, p.accent), playIcon(coverX + 28, actionY, 22, p.on_accent));
  out.push(heartOutline(coverX + 92, actionY, p.secondary));
  out.push(circle(coverX + 140, actionY, 2.5, p.dim), circle(coverX + 150, actionY, 2.5, p.dim), circle(coverX + 160, actionY, 2.5, p.dim));

  // Track list
  const colNum = mainX + 48;
  const colTitle = mainX + 80;
  const colAlbum = mainX + 520;
  const colTime = W - 48;
  const headY = 362;
  out.push(text(colNum, headY, "#", p.dim, 13, { anchor: "middle" }));
  out.push(text(colTitle, headY, "Title", p.dim, 13), text(colAlbum, headY, "Album", p.dim, 13));
  out.push(clockIcon(colTime - 6, headY - 5, p.dim));
  out.push(line(mainX + 32, 376.5, W - 32, 376.5, p.outline));

  TRACKS.forEach(([title, artist, album, time], i) => {
    const y = 384 + i * 46;
    const playing = i === NOW_PLAYING;
    if (i === HOVERED) out.push(rect(mainX + 32, y, mainW - 64, 44, p.surface_hover, 4));
    if (playing) out.push(equalizer(colNum, y + 22, p.accent));
    else if (i === HOVERED) out.push(playIcon(colNum, y + 22, 12, p.text));
    else out.push(text(colNum, y + 27, String(i + 1), p.dim, 14, { anchor: "middle" }));
    out.push(rect(colTitle, y + 4, 36, 36, p.surface, 4));
    out.push(text(colTitle + 48, y + 19, title, playing ? p.accent : p.text, 14, { weight: 500 }));
    out.push(text(colTitle + 48, y + 36, artist, p.secondary, 12));
    out.push(text(colAlbum, y + 27, album, p.secondary, 13));
    out.push(text(colTime, y + 27, time, p.secondary, 13, { anchor: "end" }));
  });

  // Player bar
  out.push(rect(0, playerY, W, PLAYER, p.panel), line(0, playerY + 0.5, W, playerY + 0.5, p.outline));
  out.push(rect(16, playerY + 16, 56, 56, p.surface, 4), noteIcon(44, playerY + 44, p.dim));
  out.push(text(86, playerY + 40, "Slow Motion", p.text, 14, { weight: 500 }));
  out.push(text(86, playerY + 59, "Paper Planes", p.secondary, 12));
  out.push(heartIcon(236, playerY + 44, 8, p.accent));

  const cx = W / 2;
  const cy = playerY + 32;
  out.push(shuffleIcon(cx - 96, cy, p.secondary));
  out.push(skipIcon(cx - 48, cy, p.text, -1));
  out.push(circle(cx, cy, 17, p.text), playIcon(cx, cy, 13, p.panel));
  out.push(skipIcon(cx + 48, cy, p.text, 1));
  out.push(repeatIcon(cx + 96, cy, p.accent), circle(cx + 96, cy + 13, 2, p.accent));

  const barY = playerY + 64;
  const barX = cx - 200;
  out.push(text(barX - 12, barY + 4, "1:42", p.dim, 11, { anchor: "end" }));
  out.push(rect(barX, barY - 2, 400, 4, p.outline, 2), rect(barX, barY - 2, 168, 4, p.accent, 2));
  out.push(circle(barX + 168, barY, 6, p.text));
  out.push(text(barX + 412, barY + 4, "4:02", p.dim, 11));

  const volX = W - 136;
  out.push(speakerIcon(volX - 24, cy + 12, p.secondary));
  out.push(rect(volX, cy + 10, 104, 4, p.outline, 2), rect(volX, cy + 10, 64, 4, p.secondary, 2));

  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

// Small icons, drawn with plain shapes so the output stays deterministic.

function houseIcon(cx: number, cy: number, c: string): string {
  return `<path d="M${cx - 10} ${cy}L${cx} ${cy - 9}L${cx + 10} ${cy}V${cy + 10}H${cx + 3}V${cy + 3}H${cx - 3}V${cy + 10}H${cx - 10}Z" ${paint(c)}/>`;
}

function searchIcon(cx: number, cy: number, c: string): string {
  return `<g fill="none" ${paint(c, "stroke")} stroke-width="2.5" stroke-linecap="round"><circle cx="${cx - 2}" cy="${cy - 2}" r="7"/><path d="M${cx + 3} ${cy + 3}L${cx + 9} ${cy + 9}"/></g>`;
}

function libraryIcon(cx: number, cy: number, c: string): string {
  return `<g ${paint(c)}><rect x="${cx - 9}" y="${cy - 9}" width="3" height="18" rx="1"/><rect x="${cx - 3}" y="${cy - 9}" width="3" height="18" rx="1"/><rect x="${cx + 2}" y="${cy - 8}" width="3" height="18" rx="1" transform="rotate(-20 ${cx + 3.5} ${cy + 1})"/></g>`;
}

function noteIcon(cx: number, cy: number, c: string, scale = 1): string {
  return `<g transform="translate(${cx} ${cy}) scale(${scale})" ${paint(c)}><circle cx="-4" cy="5" r="4"/><rect x="-1" y="-9" width="2.2" height="14"/><path d="M1 -9L8 -6V-2L1 -5Z"/></g>`;
}

function heartIcon(cx: number, cy: number, s: number, c: string): string {
  const k = s / 10;
  return `<path transform="translate(${cx} ${cy}) scale(${round(k)})" d="M0 9C-6 4-10 1-10-3.5C-10-7-7.5-9.5-4.5-9.5C-2.5-9.5-1-8.5 0-7C1-8.5 2.5-9.5 4.5-9.5C7.5-9.5 10-7 10-3.5C10 1 6 4 0 9Z" ${paint(c)}/>`;
}

function heartOutline(cx: number, cy: number, c: string): string {
  return `<path transform="translate(${cx} ${cy}) scale(1.4)" d="M0 9C-6 4-10 1-10-3.5C-10-7-7.5-9.5-4.5-9.5C-2.5-9.5-1-8.5 0-7C1-8.5 2.5-9.5 4.5-9.5C7.5-9.5 10-7 10-3.5C10 1 6 4 0 9Z" fill="none" ${paint(c, "stroke")} stroke-width="1.6"/>`;
}

function bellIcon(cx: number, cy: number, c: string): string {
  return `<g ${paint(c)}><path d="M${cx - 8} ${cy + 6}C${cx - 6} ${cy + 3} ${cx - 6} ${cy} ${cx - 6} ${cy - 3}C${cx - 6} ${cy - 7} ${cx - 3} ${cy - 10} ${cx} ${cy - 10}C${cx + 3} ${cy - 10} ${cx + 6} ${cy - 7} ${cx + 6} ${cy - 3}C${cx + 6} ${cy} ${cx + 6} ${cy + 3} ${cx + 8} ${cy + 6}Z"/><circle cx="${cx}" cy="${cy + 9}" r="2.5"/></g>`;
}

function clockIcon(cx: number, cy: number, c: string): string {
  return `<g fill="none" ${paint(c, "stroke")} stroke-width="1.5" stroke-linecap="round"><circle cx="${cx}" cy="${cy}" r="7"/><path d="M${cx} ${cy - 4}V${cy}L${cx + 3} ${cy + 2}"/></g>`;
}

function equalizer(cx: number, cy: number, c: string): string {
  const bars = [10, 16, 7, 13];
  return bars.map((h, i) => rect(cx - 9 + i * 5, cy + 7 - h, 3, h, c, 1)).join("");
}

function skipIcon(cx: number, cy: number, c: string, dir: 1 | -1): string {
  const tip = cx + 6 * dir;
  const back = cx - 6 * dir;
  const barX = dir === 1 ? cx + 6 : cx - 8;
  return `<g ${paint(c)}><path d="M${back} ${cy - 7}L${tip} ${cy}L${back} ${cy + 7}Z"/><rect x="${barX}" y="${cy - 7}" width="2" height="14"/></g>`;
}

function shuffleIcon(cx: number, cy: number, c: string): string {
  return `<g fill="none" ${paint(c, "stroke")} stroke-width="1.8" stroke-linecap="round"><path d="M${cx - 9} ${cy - 5}H${cx - 4}L${cx + 4} ${cy + 5}H${cx + 9}"/><path d="M${cx - 9} ${cy + 5}H${cx - 4}L${cx + 4} ${cy - 5}H${cx + 9}"/></g>`;
}

function repeatIcon(cx: number, cy: number, c: string): string {
  return `<g fill="none" ${paint(c, "stroke")} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M${cx - 9} ${cy + 1}V${cy - 4}H${cx + 8}"/><path d="M${cx + 5} ${cy - 7}L${cx + 8} ${cy - 4}L${cx + 5} ${cy - 1}"/><path d="M${cx + 9} ${cy - 1}V${cy + 4}H${cx - 8}"/><path d="M${cx - 5} ${cy + 7}L${cx - 8} ${cy + 4}L${cx - 5} ${cy + 1}"/></g>`;
}

function speakerIcon(cx: number, cy: number, c: string): string {
  return `<g ${paint(c)}><path d="M${cx - 8} ${cy - 3}H${cx - 4}L${cx + 2} ${cy - 8}V${cy + 8}L${cx - 4} ${cy + 3}H${cx - 8}Z"/></g><path d="M${cx + 5} ${cy - 4}Q${cx + 9} ${cy} ${cx + 5} ${cy + 4}" fill="none" ${paint(c, "stroke")} stroke-width="1.6" stroke-linecap="round"/>`;
}

export function renderAll(themesDir: string, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const slugs = readdirSync(themesDir).filter((s) => !s.startsWith(".")).sort();
  for (const slug of slugs) {
    const theme = themeSchema.parse(JSON.parse(readFileSync(join(themesDir, slug, "theme.json"), "utf8")));
    const meta = metaSchema.parse(JSON.parse(readFileSync(join(themesDir, slug, "meta.json"), "utf8")));
    writeFileSync(join(outDir, `${slug}.svg`), renderPreview(resolveTheme(theme), meta.name));
  }
  return slugs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const slugs = renderAll(resolve("themes"), resolve("site/public/previews"));
  console.log(`Made ${slugs.length} previews in site/public/previews`);
}
