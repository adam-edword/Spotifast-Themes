import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GitHubRepo, type PullRequest, type Repo } from "./github.ts";
import { parseIssueForm } from "./issue-form.ts";
import { metaSchema, slugify, type Meta, type RemovedEntry } from "./schema.ts";
import { readRemoved, sanitize, upsertComment, type IssueEvent } from "./submission.ts";

export const REPORT_LABEL = "theme-report";
export const NEEDS_OWNER = "needs-owner";
export const REPORTS_TO_FLAG = 3;
export const MIN_REPORTER_AGE_DAYS = 30;
const MARKER = "<!-- spotifast-themes:report -->";

// These must match the labels in .github/ISSUE_TEMPLATE/report-theme.yml (a test checks).
export const REPORT_FORM = {
  slug: "Theme",
  reason: "What's wrong",
} as const;

export const REASONS = ["Rude or offensive name", "Copied from someone else", "Spam", "Something else"] as const;

export interface ReportContext {
  repo: Repo;
  botLogin: string;
  themesDir: string;
  removed: RemovedEntry[];
  now: Date;
}

interface Report {
  number: number;
  author: string;
  slug: string;
  reason: string;
}

export function parseReport(issue: { number: number; author: string; body: string }): Report {
  const form = parseIssueForm(issue.body);
  // The site fills in the slug, but people sometimes type the theme's name instead.
  const slug = slugify((form.get(REPORT_FORM.slug) ?? "").trim().toLowerCase().replace(/\s+/g, " "));
  const reason = form.get(REPORT_FORM.reason) ?? "";
  return { number: issue.number, author: issue.author, slug, reason: (REASONS as readonly string[]).includes(reason) ? reason : "Something else" };
}

function loadMeta(themesDir: string, slug: string): Meta | undefined {
  // Slugs come from the issue, so only accept ones that look like our own folder names.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return undefined;
  const path = join(themesDir, slug, "meta.json");
  if (!existsSync(path)) return undefined;
  return metaSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

// Open reports for this theme that count: one per person, from accounts at least
// 30 days old, never from the theme's own author.
export async function countedReports(ctx: ReportContext, slug: string, author: string): Promise<Report[]> {
  const reports = (await ctx.repo.listOpenIssues(REPORT_LABEL)).map(parseReport).filter((r) => r.slug === slug);
  const counted: Report[] = [];
  const seen = new Set<string>();
  for (const report of reports.sort((a, b) => a.number - b.number)) {
    const who = report.author.toLowerCase();
    if (seen.has(who) || who === author.toLowerCase()) continue;
    seen.add(who);
    const age = (ctx.now.getTime() - (await ctx.repo.getUserCreatedAt(report.author)).getTime()) / 86_400_000;
    if (age >= MIN_REPORTER_AGE_DAYS) counted.push(report);
  }
  return counted;
}

export async function handleReportOpened(
  ctx: ReportContext,
  issue: IssueEvent,
): Promise<"ignored" | "not-found" | "noted" | "flagged"> {
  if (issue.state !== "open" || !issue.labels.some((l) => l.name === REPORT_LABEL)) return "ignored";
  const report = parseReport({ number: issue.number, author: issue.user.login, body: issue.body ?? "" });
  const meta = loadMeta(ctx.themesDir, report.slug);
  if (!meta) {
    await upsertComment(
      ctx.repo,
      issue.number,
      ctx.botLogin,
      `Thanks for letting us know. I couldn't find a theme called "${sanitize(report.slug)}", though. It may already be gone. If it's still on the site, use the "Let us know" link at the bottom of its page, which fills this in for you.`,
      MARKER,
    );
    await ctx.repo.closeIssue(issue.number, "not_planned");
    return "not-found";
  }

  const reports = await countedReports(ctx, report.slug, meta.github);
  if (reports.length < REPORTS_TO_FLAG) return "noted";

  await openRemovalPr(ctx, report.slug, meta, reports);
  return "flagged";
}

export async function handleRemoveCommand(
  ctx: ReportContext,
  issue: IssueEvent,
  comment: { body: string; user: { login: string }; author_association: string },
): Promise<"ignored" | "not-found" | "removing"> {
  const isOwner = comment.user.login === ctx.repo.owner && comment.author_association === "OWNER";
  if (!isOwner || comment.body.trim() !== "/remove") return "ignored";
  if (issue.state !== "open" || !issue.labels.some((l) => l.name === REPORT_LABEL)) return "ignored";

  const report = parseReport({ number: issue.number, author: issue.user.login, body: issue.body ?? "" });
  const meta = loadMeta(ctx.themesDir, report.slug);
  if (!meta) {
    await upsertComment(ctx.repo, issue.number, ctx.botLogin, "That theme is already gone.", MARKER);
    return "not-found";
  }

  const reports = await countedReports(ctx, report.slug, meta.github);
  // Always close the report the owner acted on, even if it didn't count toward the total.
  if (!reports.some((r) => r.number === report.number)) reports.push(report);
  const pr = await openRemovalPr(ctx, report.slug, meta, reports);
  await ctx.repo.enableAutoMerge(pr);
  await upsertComment(
    ctx.repo,
    issue.number,
    ctx.botLogin,
    `Taking **${meta.name}** down. It'll be off the site in a few minutes.`,
    MARKER,
  );
  return "removing";
}

// Opens (or refreshes) a PR that deletes the theme and logs it in removed.json.
// It never merges on its own: the owner merges it, or comments /remove.
export async function openRemovalPr(ctx: ReportContext, slug: string, meta: Meta, reports: Report[]): Promise<PullRequest> {
  const reasons: Record<string, number> = {};
  for (const r of reports) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;

  const entry: RemovedEntry = { slug, name: meta.name, github: meta.github, date: ctx.now.toISOString().slice(0, 10), reasons };
  const removed = [...ctx.removed.filter((r) => r.slug !== slug), entry];
  const branch = `removal/${slug}`;
  await ctx.repo.commitToBranch(branch, `Remove ${meta.name} theme\n\nReported in ${reports.map((r) => `#${r.number}`).join(", ")}.`, {
    [`themes/${slug}/theme.json`]: null,
    [`themes/${slug}/meta.json`]: null,
    "removed.json": `${JSON.stringify(removed, null, 2)}\n`,
  });

  const people = reports.length === 1 ? "1 person" : `${reports.length} people`;
  const title = `Remove theme: ${meta.name}`;
  const body = [
    `Takes down **${meta.name}** by @${meta.github}. ${people} reported it:`,
    "",
    ...Object.entries(reasons).map(([reason, n]) => `- ${reason}: ${n}`),
    "",
    "Merge this to take it off the site, or close it to keep the theme.",
    "",
    ...reports.map((r) => `Closes #${r.number}`),
  ].join("\n");

  let pr = await ctx.repo.findOpenPr(branch);
  if (pr) await ctx.repo.updatePr(pr.number, title, body);
  else pr = await ctx.repo.createPr(branch, title, body);
  await ctx.repo.addLabels(pr.number, [NEEDS_OWNER]);
  await ctx.repo.addAssignees(pr.number, [ctx.repo.owner]);
  return pr;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(".");
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8"));
  const ctx: ReportContext = {
    repo: GitHubRepo.fromEnv(),
    botLogin: process.env.BOT_LOGIN!,
    themesDir: join(root, "themes"),
    removed: readRemoved(root),
    now: new Date(),
  };
  const result =
    process.env.GITHUB_EVENT_NAME === "issue_comment"
      ? await handleRemoveCommand(ctx, event.issue, event.comment)
      : await handleReportOpened(ctx, event.issue);
  console.log(`Report #${event.issue.number}: ${result}`);
}
