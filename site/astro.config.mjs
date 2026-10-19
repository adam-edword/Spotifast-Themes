import { defineConfig } from "astro/config";

// Defaults to GitHub Pages at https://<owner>.github.io/<repo>/.
// For a custom domain later, set SITE_URL=https://example.com and BASE_PATH=/
// The deploy workflow passes both from GitHub Pages; BASE_PATH is "" on a custom domain.
const base = process.env.BASE_PATH === undefined ? "/Spotifast-Themes" : process.env.BASE_PATH || "/";

export default defineConfig({
  site: process.env.SITE_URL || "https://adam-edword.github.io",
  base,
  trailingSlash: "always",
  output: "static",
});
