# Sharing a theme

Thanks for wanting to share one. The easiest way is the form:
**https://github.com/adam-edword/Spotifast-Themes/issues/new?template=submit-theme.yml**

You paste in your theme file, give it a name, and pick some tags. A bot checks it, and if it all looks good it's live on the site a few minutes later. If something's off, the bot leaves a comment saying what to fix, and you can just edit the form.

## The theme file

It's the same file Spotifast reads:

```json
{
  "base": "dark",
  "colors": {
    "window": "#121212",
    "accent": "#1ed760"
  }
}
```

- `base` is `dark` or `light`. Any color you leave out comes from Spotifast's own theme for that base.
- The colors you can set are `window`, `panel`, `surface`, `surface_hover`, `surface_active`, `outline`, `text`, `secondary`, `dim`, `accent`, `accent_hover`, `on_accent`, `danger`, `warning`, `overlay`, `shadow` and `tint`.
- Write colors as `#RRGGBB`, or `#RRGGBBAA` if you want some see-through.
- Nothing else goes in the file, and it has to stay under 4 KB.

## Names

- 3 to 30 characters: letters, numbers and single spaces.
- No two themes can share a name.
- Swear words, links, and names that sound official (like "Spotify", "Spotifast", "Official" or "Admin") get turned away.

## Readability

Every theme has to pass these contrast checks:

| What | Minimum |
| --- | --- |
| `text` on `window` | 4.5 to 1 |
| `secondary` on `window` | 3 to 1 |
| `on_accent` on `accent` | 3 to 1 |

A theme whose colors are nearly identical to one that's already here gets turned away too.

## What happens automatically

- Your theme is added and the site updates, with nobody needing to approve it.
- Brand new GitHub accounts (under 30 days old), and anyone sharing more than a few themes in one day, wait for a person to look. That can take a while.

## The fine print

Only share themes you made. Everything in `themes/` is released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/), so anyone can use, change and share it.

Pull requests made by hand are welcome for code changes, but they're reviewed by a person, so they can sit for a long time.
