import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gate, type GateReason } from "./gate.ts";
import { GitHubRepo, type Repo } from "./github.ts";
import { buildSubmission } from "./issue-to-theme.ts";
import { metaSchema, removedSchema, type RemovedEntry } from "./schema.ts";

export const SUBMISSION_LABEL = "theme-submission";
export const NEEDS_FIXES = "needs-fixes";
export const MANUAL_REVIEW = "manual-review";
const MARKER = "<!-- spotifast-themes:submission -->";

export interface IssueEvent {
  number: number;
  body: string | null;
  state: string;
  user: { login: string };
  labels: { name: string }[];
}

export interface SubmissionContext {
  repo: Repo;
  issue: IssueEvent;
  botLogin: string;
  siteUrl: string;
  themesDir: string;
  now: Date;
  removed: RemovedEntry[];
  recentSubmissions: (login: string) => number;
}

export type SubmissionOutcome = "skipped" | "needs-fixes" | "auto-merge" | "manual-review";

export async function handleSubmission(ctx: SubmissionContext): Promise<SubmissionOutcome> {
  const { repo, issue, botLogin } = ctx;
  if (issue.state !== "open" || !issue.labels.some((l) => l.name === SUBMISSION_LABEL)) return "skipped";

  const login = issue.user.login;
  const branch = `submission/${issue.number}`;
  const result = buildSubmission({
    body: issue.body ?? "",
    login,
    issue: issue.number,
    today: ctx.now.toISOString().slice(0, 10),
    themesDir: ctx.themesDir,
  });

  if (!result.ok) {
    // Don't leave an older version of the submission waiting to merge.
    const stale = await repo.findOpenPr(branch);
    if (stale) await repo.closePr(stale.number);
    await repo.deleteBranch(branch);
    await repo.removeLabel(issue.number, MANUAL_REVIEW);
    await repo.addLabels(issue.number, [NEEDS_FIXES]);
    await upsertComment(repo, issue.number, botLogin, needsFixesComment(result.name, result.errors));
    return "needs-fixes";
  }

  const { slug, name } = result;
  await repo.removeLabel(issue.number, NEEDS_FIXES);
  await repo.commitToBranch(branch, `Add ${name} theme\n\nSubmitted by @${login} in #${issue.number}.`, result.files);

  const title = `Add theme: ${name}`;
  const body = [
    `Adds **${name}** by @${login}.`,
    "",
    `Closes #${issue.number}`,
    "",
    `<sub>Opened by the theme bot. To change it, edit #${issue.number}.</sub>`,
  ].join("\n");
  let pr = await repo.findOpenPr(branch);
  if (pr) await repo.updatePr(pr.number, title, body);
  else pr = await repo.createPr(branch, title, body);

  const decision = gate({
    pr,
    botLogin,
    branch,
    slug,
    files: await repo.listPrFiles(pr.number),
    login,
    accountCreatedAt: await repo.getUserCreatedAt(login),
    now: ctx.now,
    recentSubmissions: ctx.recentSubmissions(login),
    removed: ctx.removed,
  });

  const siteRoot = ctx.siteUrl.endsWith("/") ? ctx.siteUrl : `${ctx.siteUrl}/`;
  const url = new URL(`themes/${slug}/`, siteRoot).toString();
  if (decision.autoMerge) {
    await repo.removeLabel(issue.number, MANUAL_REVIEW);
    await repo.enableAutoMerge(pr);
    await upsertComment(
      repo,
      issue.number,
      botLogin,
      `Thanks @${login}, **${name}** looks great. It passed every check, and it'll be live in a few minutes here:\n\n${url}`,
    );
    return "auto-merge";
  }

  console.log(`Waiting for a person: ${decision.detail}`);
  await repo.addLabels(issue.number, [MANUAL_REVIEW]);
  await upsertComment(
    repo,
    issue.number,
    botLogin,
    `Thanks @${login}, **${name}** passed every check. ${manualReason(decision.reason)}, so a person needs to take a quick look before it goes live. That can take a while, so hang tight. You don't need to do anything else.`,
  );
  return "manual-review";
}

function manualReason(reason: GateReason): string {
  switch (reason) {
    case "new-account":
      return "Your GitHub account is less than 30 days old";
    case "rate-limit":
      return "You've shared a few themes in the last day";
    default:
      return "This one's been flagged for a closer look";
  }
}

function needsFixesComment(name: string | undefined, errors: string[]): string {
  const what = name ? `**${name}**` : "your theme";
  return [
    `Thanks for sharing! A few things need fixing before ${what} can go live:`,
    "",
    ...errors.slice(0, 20).map((e) => `- ${sanitize(e)}`),
    "",
    "Edit this issue to fix them, and I'll check it again on my own.",
  ].join("\n");
}

// Error messages can quote what the submitter typed (JSON keys, bad values), so keep
// them from pinging people, linking anywhere, or breaking the comment's formatting.
export function sanitize(text: string): string {
  return text
    .slice(0, 300)
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\`*_[\]<>|#]/g, (c) => `\\${c}`)
    .replace(/@/g, "@\u200b")
    .replace(/:\/\//g, ":/\u200b/");
}

// Keeps one bot comment per issue, edited in place, instead of a new one every run.
export async function upsertComment(repo: Repo, issue: number, botLogin: string, text: string, marker = MARKER) {
  const body = `${marker}\n${text}`;
  const existing = (await repo.listComments(issue)).find((c) => c.author === botLogin && c.body.includes(marker));
  if (existing) await repo.updateComment(existing.id, body);
  else await repo.createComment(issue, body);
}

export function readRemoved(repoRoot: string): RemovedEntry[] {
  const path = join(repoRoot, "removed.json");
  return existsSync(path) ? removedSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : [];
}

// Counts themes by this person that landed on master in the last 24 hours, from git history.
export function recentSubmissionsFromGit(repoRoot: string, login: string): number {
  const out = execFileSync(
    "git",
    ["log", "--since=24 hours ago", "--diff-filter=A", "--name-only", "--format=", "--", "themes/*/meta.json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const paths = [...new Set(out.split("\n").filter(Boolean))];
  return paths.filter((p) => {
    const file = join(repoRoot, p);
    if (!existsSync(file)) return false;
    const meta = metaSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return meta.success && meta.data.github.toLowerCase() === login.toLowerCase();
  }).length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(".");
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8")) as { issue: IssueEvent };
  const outcome = await handleSubmission({
    repo: GitHubRepo.fromEnv(),
    issue: event.issue,
    botLogin: process.env.BOT_LOGIN!,
    siteUrl: process.env.SITE_URL!,
    themesDir: join(root, "themes"),
    now: new Date(),
    removed: readRemoved(root),
    recentSubmissions: (login) => recentSubmissionsFromGit(root, login),
  });
  console.log(`Submission #${event.issue.number}: ${outcome}`);
}
