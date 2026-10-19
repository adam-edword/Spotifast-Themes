import { defineConfig } from "astro/config";

// Defaults to GitHub Pages at https://<owner>.github.io/<repo>/.
// For a custom domain later, set SITE_URL=https://example.com and BASE_PATH=/
export default defineConfig({
  site: process.env.SITE_URL ?? "https://adam-edword.github.io",
  base: process.env.BASE_PATH ?? "/Spotifast-Themes",
  trailingSlash: "always",
  output: "static",
});
