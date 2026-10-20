# Spotifast Themes

A free gallery of color themes for [Spotifast](https://github.com/crmne/spotifast), made by the people who use it.

**Browse the themes:** https://adam-edword.github.io/Spotifast-Themes/

There's no server and nobody has to babysit it. People share themes through a short form, a bot checks them, and the good ones show up on the site on their own.

## Using a theme

1. Find one you like on the site and hit the green download button.
2. In Spotifast, go to **Settings**, then **Appearance**, and click **Open themes folder** next to Theme.
3. Drag the file you downloaded into that folder.
4. On Mac or Windows, run `spotifast reload-themes`, or just restart Spotifast. Linux picks it up on its own.
5. Pick the theme from the Theme list.

## Sharing a theme

Use the [Share a theme](https://adam-edword.github.io/Spotifast-Themes/submit/) page. You fill in one form on GitHub, and if everything checks out your theme is live a few minutes later. See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules.

Themes are released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/), so anyone can use them for anything. The code in this repo is [MIT](LICENSE).

This is a fan project. It isn't made by Spotify or by the Spotifast team.

## Working on it

You need Node 22 and pnpm 10.

```sh
pnpm install
pnpm test        # unit tests
pnpm validate    # checks every theme in themes/
pnpm dev         # site at http://localhost:4321/Spotifast-Themes/
pnpm build       # static site in site/dist
```

| Folder | What's in it |
| --- | --- |
| `themes/<slug>/` | `theme.json` (exactly what Spotifast reads) and `meta.json` (name, author, tags) |
| `scripts/` | Schema, validator, contrast math, name rules, preview generator |
| `site/` | The Astro site |
| `.github/workflows/` | CI and deploy |

## One-time setup for the owner

Do these once. After that, the repo runs itself.

### 1. Turn on GitHub Pages

**Settings → Pages → Build and deployment → Source:** pick **GitHub Actions**.

The first deploy run fails until this is on. After you switch it on, re-run it from **Actions → deploy → Run workflow**.

### 2. Merge settings

**Settings → General → Pull Requests:**

- Turn on **Allow squash merging**, and turn off merge commits and rebase merging.
- Turn on **Allow auto-merge**.
- Turn on **Automatically delete head branches**.

### 3. Protect `master`

**Settings → Rules → Rulesets → New ruleset → New branch ruleset**

- Name: `protect master`
- Enforcement status: **Active**
- Bypass list: add **Repository admin** (that's you, so you can still push starter themes straight to `master`)
- Target branches: **Include default branch**
- Turn on **Restrict deletions** and **Block force pushes**
- Turn on **Require a pull request before merging**, with required approvals set to **0**
- Turn on **Require status checks to pass**, and add the check called **validate**

Don't add the GitHub App to the bypass list. It has to pass `validate` like everyone else.

### 4. Create the bot (a GitHub App)

The bot needs to be a GitHub App, not the built-in Actions token. Anything done with the built-in token doesn't trigger other workflows, so the bot's pull requests would never get checked or deployed.

1. Go to **your profile → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Name it something like `spotifast-themes-bot`. The homepage URL can be this repo.
3. Under **Webhook**, uncheck **Active**. The bot doesn't need one.
4. Under **Repository permissions**, set:
   - **Contents:** Read and write
   - **Issues:** Read and write
   - **Pull requests:** Read and write
5. Under **Where can this GitHub App be installed?**, pick **Only on this account**.
6. Click **Create GitHub App**. Write down the **App ID** at the top of the page.
7. Scroll down to **Private keys** and click **Generate a private key**. A `.pem` file downloads.
8. Click **Install App** on the left, install it on your account, and pick **Only select repositories → Spotifast-Themes**.
9. In this repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `BOT_APP_ID`: the App ID from step 6
   - `BOT_PRIVATE_KEY`: the whole contents of the `.pem` file
10. Delete the `.pem` file from your computer.

### 5. Labels

The bot and the issue forms need a few labels (`theme-submission`, `theme-report`, `needs-fixes`, `manual-review`, `needs-owner`). The **labels** workflow creates them on its own. If they're ever missing, run it again from **Actions → labels → Run workflow**.

### 6. Quiet the notifications

Click **Watch** at the top of the repo and pick **Ignore** (or **Custom** and only keep what you care about). Otherwise every bot comment ends up in your inbox.

### How the bot works

- **Someone shares a theme.** The bot reads the form, checks the theme, and opens a pull request that adds it. If it passes, auto-merge is turned on and it goes live once `validate` passes. If not, the bot comments with what to fix, and it checks again whenever the issue is edited.
- **Brand new accounts** (under 30 days), people with 3 themes merged in the last day, and anyone in `BLOCKED_USERS` (in `scripts/gate.ts`) or with 2 removed themes get the `manual-review` label instead. Their pull request waits for you to merge or close it. That's the only thing that ever needs you.
- **Someone reports a theme.** Nothing happens until 3 different people (with accounts at least 30 days old, not counting the theme's author) report the same one. Then the bot opens a pull request that removes it, labels it `needs-owner` and assigns you. It never merges that on its own.

### Who can remove a theme

Only you. Nobody else has write access, and the bot never merges anything except pull requests that add a brand new theme. To take a theme down, merge its removal pull request, or comment exactly `/remove` on any report for it. The bot removes it and closes the reports.

### Once a year

Every action in the workflows is pinned to an exact version, and nothing updates on its own. GitHub slowly retires the Node versions that actions run on, so expect to bump the action versions in `.github/workflows/` about once a year when GitHub starts warning about it.
