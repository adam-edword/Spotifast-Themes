import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gate, type GateInput } from "../gate.ts";
import { checkedOptions, parseIssueForm, stripCodeFences } from "../issue-form.ts";
import { FORM, PROMISES, buildSubmission } from "../issue-to-theme.ts";
import { REASONS, REPORT_FORM, handleRemoveCommand, handleReportOpened, type ReportContext } from "../reports.ts";
import { handleSubmission, sanitize, type IssueEvent, type SubmissionContext } from "../submission.ts";
import { FakeRepo, submissionBody } from "./fake-repo.ts";

const root = join(import.meta.dirname, "..", "..");
const themesDir = join(root, "themes");
const NOW = new Date("2026-10-20T12:00:00Z");

describe("issue forms", () => {
  it("parses sections, checkboxes and code fences", () => {
    const form = parseIssueForm(submissionBody({ tags: ["retro", "warm"] }));
    expect(form.get("Theme name")).toBe("Harbor Lights");
    expect(checkedOptions(form.get("Tags")!)).toEqual(["retro", "warm"]);
    expect(JSON.parse(stripCodeFences(form.get("theme.json")!)).base).toBe("dark");
  });

  it("treats _No response_ as empty and handles CRLF", () => {
    const form = parseIssueForm("### Theme name\r\n\r\n_No response_\r\n\r\n### Tags\r\n\r\n- [x] cool");
    expect(form.get("Theme name")).toBe("");
    expect(checkedOptions(form.get("Tags")!)).toEqual(["cool"]);
  });

  it("peels off a fence the submitter pasted inside GitHub's fence", () => {
    expect(stripCodeFences('```json\n```json\n{"a":1}\n```\n```')).toBe('{"a":1}');
  });

  it("matches the labels in the issue form templates", () => {
    const submit = readFileSync(join(root, ".github/ISSUE_TEMPLATE/submit-theme.yml"), "utf8");
    for (const label of Object.values(FORM)) expect(submit).toContain(`label: ${label}`);
    for (const promise of PROMISES) expect(submit).toContain(`label: ${promise}`);
    const report = readFileSync(join(root, ".github/ISSUE_TEMPLATE/report-theme.yml"), "utf8");
    for (const label of Object.values(REPORT_FORM)) expect(report).toContain(`label: ${label}`);
    for (const reason of REASONS) expect(report).toContain(`- ${reason}`);
  });
});

describe("buildSubmission", () => {
  const build = (body: string, login = "someone") => buildSubmission({ body, login, issue: 7, today: "2026-10-20", themesDir });

  it("turns a good form into the two theme files", () => {
    const result = build(submissionBody({ tags: ["cool", "minimal"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slug).toBe("harbor-lights");
    expect(Object.keys(result.files)).toEqual(["themes/harbor-lights/theme.json", "themes/harbor-lights/meta.json"]);
    expect(JSON.parse(result.files["themes/harbor-lights/meta.json"])).toEqual({
      name: "Harbor Lights",
      github: "someone",
      tags: ["dark", "minimal", "cool"],
      added: "2026-10-20",
      issue: 7,
    });
  });

  it("adds the light tag for light themes", () => {
    const theme = JSON.stringify({ base: "light", colors: { accent: "#7a3cff", on_accent: "#ffffff" } });
    const result = build(submissionBody({ theme }));
    expect(result.ok && result.meta.tags[0]).toBe("light");
  });

  it.each([
    [{ name: "" }, "Give your theme a name"],
    [{ name: "../../etc" }, "only letters, numbers and single spaces"],
    [{ name: "Stock Green" }, `already a theme called "Stock Green"`],
    [{ name: "STOCK GREEN" }, "already a theme called"],
    [{ promises: [true, false, true] }, "Tick all three boxes"],
    [{ theme: "" }, "Paste your theme file"],
    [{ theme: "{ nope" }, "isn't valid JSON"],
    [{ theme: "null" }, "file"],
    [{ theme: '{"base":"dark","colors":{"sidebar":"#000000"}}' }, `"sidebar"`],
    [{ theme: '{"colors":{"text":"#111111","window":"#000000"}}' }, "too hard to read"],
    [{ tags: ["cool", "warm", "retro", "pastel"] }, "Pick up to 3 tags"],
    [{ name: "Spotify Night" }, `can't include "spotify"`],
  ])("rejects %j", (opts, message) => {
    const result = build(submissionBody(opts));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain(message);
  });

  it("rejects a copy of an existing theme even with a new name", () => {
    const stock = readFileSync(join(themesDir, "stock-green", "theme.json"), "utf8");
    const result = build(submissionBody({ name: "Totally New", theme: stock }));
    expect(!result.ok && result.errors.join()).toContain(`almost identical to the existing theme "Stock Green"`);
  });
});

describe("gate", () => {
  const base: GateInput = {
    pr: { number: 9, nodeId: "PR_9", author: "theme-bot[bot]", headRef: "submission/7" },
    botLogin: "theme-bot[bot]",
    branch: "submission/7",
    slug: "harbor-lights",
    files: [
      { filename: "themes/harbor-lights/theme.json", status: "added" },
      { filename: "themes/harbor-lights/meta.json", status: "added" },
    ],
    login: "someone",
    accountCreatedAt: new Date("2024-01-01"),
    now: NOW,
    recentSubmissions: 0,
    removed: [],
  };

  it("lets a normal submission merge", () => {
    expect(gate(base)).toEqual({ autoMerge: true });
  });

  it.each<[string, Partial<GateInput>, string]>([
    ["someone else's PR", { pr: { ...base.pr, author: "mallory" } }, "not-bot"],
    ["a PR from another branch", { pr: { ...base.pr, headRef: "patch-1" } }, "not-bot"],
    ["a modified file", { files: [{ ...base.files[0], status: "modified" }, base.files[1]] }, "diff"],
    ["a deleted file", { files: [...base.files, { filename: "themes/stock-green/meta.json", status: "removed" }] }, "diff"],
    ["an extra file", { files: [...base.files, { filename: ".github/workflows/x.yml", status: "added" }] }, "diff"],
    ["files for another slug", { slug: "other" }, "diff"],
    ["a 29 day old account", { accountCreatedAt: new Date(NOW.getTime() - 29 * 86_400_000) }, "new-account"],
    ["a 3rd theme today", { recentSubmissions: 3 }, "rate-limit"],
    [
      "someone with 2 removed themes",
      { removed: [1, 2].map((i) => ({ slug: `x${i}`, name: `X${i}`, github: "SomeOne", date: "2026-01-01", reasons: {} })) },
      "blocked",
    ],
  ])("holds back %s", (_label, change, reason) => {
    const result = gate({ ...base, ...change });
    expect(result.autoMerge).toBe(false);
    expect(!result.autoMerge && result.reason).toBe(reason);
  });

  it("allows a 2nd theme today and 1 past removal", () => {
    const removed = [{ slug: "x", name: "X", github: "someone", date: "2026-01-01", reasons: {} }];
    expect(gate({ ...base, recentSubmissions: 2, removed }).autoMerge).toBe(true);
  });
});

function submissionIssue(body: string, extra: Partial<IssueEvent> = {}): IssueEvent {
  return { number: 7, body, state: "open", user: { login: "someone" }, labels: [{ name: "theme-submission" }], ...extra };
}

function submissionCtx(repo: FakeRepo, issue: IssueEvent, extra: Partial<SubmissionContext> = {}): SubmissionContext {
  return {
    repo,
    issue,
    botLogin: repo.botLogin,
    siteUrl: "https://example.github.io/Spotifast-Themes",
    themesDir,
    now: NOW,
    removed: [],
    recentSubmissions: () => 0,
    ...extra,
  };
}

describe("handleSubmission", () => {
  it("opens a PR, turns on auto-merge and says so", async () => {
    const repo = new FakeRepo();
    expect(await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody())))).toBe("auto-merge");
    const pr = repo.prs[0];
    expect(pr.headRef).toBe("submission/7");
    expect(pr.title).toBe("Add theme: Harbor Lights");
    expect(pr.body).toContain("Closes #7");
    expect(repo.autoMerged).toEqual([pr.number]);
    const comment = repo.comments.get(7)!;
    expect(comment).toHaveLength(1);
    expect(comment[0].body).toContain("https://example.github.io/Spotifast-Themes/themes/harbor-lights/");
  });

  it("explains problems, labels the issue, and opens nothing", async () => {
    const repo = new FakeRepo();
    expect(await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody({ theme: "{ nope" }))))).toBe("needs-fixes");
    expect(repo.prs).toHaveLength(0);
    expect(repo.labels.get(7)).toContain("needs-fixes");
    expect(repo.comments.get(7)![0].body).toContain("Edit this issue to fix them");
  });

  it("updates the same comment and PR when the issue is edited", async () => {
    const repo = new FakeRepo();
    await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody({ theme: "{ nope" }))));
    await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody())));
    await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody({ name: "Harbor Glow" }))));
    expect(repo.comments.get(7)).toHaveLength(1);
    expect(repo.prs.filter((p) => p.open)).toHaveLength(1);
    expect(repo.prs[0].title).toBe("Add theme: Harbor Glow");
    expect(Object.keys(repo.branches.get("submission/7")!)).toContain("themes/harbor-glow/theme.json");
    expect(repo.labels.get(7)).not.toContain("needs-fixes");
  });

  it("closes the PR if an edit breaks a submission that was fine", async () => {
    const repo = new FakeRepo();
    await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody())));
    await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody({ theme: "{ nope" }))));
    expect(repo.prs[0].open).toBe(false);
    expect(repo.branches.has("submission/7")).toBe(false);
  });

  it("waits for a person when the account is new", async () => {
    const repo = new FakeRepo();
    repo.users.set("someone", new Date("2026-10-15T00:00:00Z"));
    expect(await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody())))).toBe("manual-review");
    expect(repo.autoMerged).toEqual([]);
    expect(repo.labels.get(7)).toContain("manual-review");
    expect(repo.comments.get(7)![0].body).toContain("less than 30 days old");
  });

  it("waits for a person when someone shares too many in a day", async () => {
    const repo = new FakeRepo();
    const ctx = submissionCtx(repo, submissionIssue(submissionBody()), { recentSubmissions: () => 3 });
    expect(await handleSubmission(ctx)).toBe("manual-review");
  });

  it("ignores closed issues and issues without the label", async () => {
    const repo = new FakeRepo();
    expect(await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody(), { state: "closed" })))).toBe("skipped");
    expect(await handleSubmission(submissionCtx(repo, submissionIssue(submissionBody(), { labels: [] })))).toBe("skipped");
    expect(repo.prs).toHaveLength(0);
  });

  it("doesn't let quoted input ping people or add links", () => {
    const safe = sanitize('field "@everyone [x](https://evil.example)"');
    expect(safe).not.toMatch(/@everyone|https:\/\//);
    expect(safe).not.toMatch(/(?<!\\)\]\(/);
  });
});

function reportBody(slug: string, reason = "Spam") {
  return `### Theme\n\n${slug}\n\n### What's wrong\n\n${reason}`;
}

function reportCtx(repo: FakeRepo): ReportContext {
  return { repo, botLogin: repo.botLogin, themesDir, removed: [], now: NOW };
}

function addReport(repo: FakeRepo, number: number, author: string, slug = "midnight-vinyl", reason = "Spam") {
  repo.openIssues.push({ number, author, body: reportBody(slug, reason), label: "theme-report" });
  const issue: IssueEvent = { number, body: reportBody(slug, reason), state: "open", user: { login: author }, labels: [{ name: "theme-report" }] };
  return issue;
}

describe("reports", () => {
  it("does nothing until 3 different people report a theme", async () => {
    const repo = new FakeRepo();
    expect(await handleReportOpened(reportCtx(repo), addReport(repo, 1, "a"))).toBe("noted");
    expect(await handleReportOpened(reportCtx(repo), addReport(repo, 2, "a"))).toBe("noted");
    expect(await handleReportOpened(reportCtx(repo), addReport(repo, 3, "b"))).toBe("noted");
    expect(repo.prs).toHaveLength(0);
  });

  it("opens a removal PR for the owner at 3 reports, but never merges it", async () => {
    const repo = new FakeRepo();
    addReport(repo, 1, "a", "midnight-vinyl", "Rude or offensive name");
    addReport(repo, 2, "b", "midnight-vinyl", "Rude or offensive name");
    expect(await handleReportOpened(reportCtx(repo), addReport(repo, 3, "c"))).toBe("flagged");
    const pr = repo.prs[0];
    expect(pr.headRef).toBe("removal/midnight-vinyl");
    expect(pr.files["themes/midnight-vinyl/theme.json"]).toBeNull();
    expect(pr.files["themes/midnight-vinyl/meta.json"]).toBeNull();
    const removed = JSON.parse(pr.files["removed.json"]!);
    expect(removed[0]).toMatchObject({ slug: "midnight-vinyl", github: "adam-edword", reasons: { "Rude or offensive name": 2, Spam: 1 } });
    expect(pr.body).toContain("Closes #1");
    expect(pr.body).toContain("Closes #3");
    expect(repo.labels.get(pr.number)).toContain("needs-owner");
    expect(repo.assignees.get(pr.number)).toEqual(["owner"]);
    expect(repo.autoMerged).toEqual([]);
  });

  it("doesn't count new accounts or the theme's own author", async () => {
    const repo = new FakeRepo();
    repo.users.set("fresh", new Date("2026-10-10T00:00:00Z"));
    addReport(repo, 1, "a");
    addReport(repo, 2, "fresh");
    expect(await handleReportOpened(reportCtx(repo), addReport(repo, 3, "adam-edword"))).toBe("noted");
  });

  it("closes reports for themes that don't exist", async () => {
    const repo = new FakeRepo();
    expect(await handleReportOpened(reportCtx(repo), addReport(repo, 1, "a", "no-such-theme"))).toBe("not-found");
    expect(repo.closedIssues).toEqual([{ issue: 1, reason: "not_planned" }]);
  });

  it("won't read a path outside the themes folder", async () => {
    const repo = new FakeRepo();
    expect(await handleReportOpened(reportCtx(repo), addReport(repo, 1, "a", "../package"))).toBe("not-found");
  });

  it("removes a theme right away when the owner comments /remove", async () => {
    const repo = new FakeRepo();
    const issue = addReport(repo, 1, "a");
    const result = await handleRemoveCommand(reportCtx(repo), issue, { body: " /remove ", user: { login: "owner" }, author_association: "OWNER" });
    expect(result).toBe("removing");
    expect(repo.autoMerged).toEqual([repo.prs[0].number]);
    expect(repo.prs[0].body).toContain("Closes #1");
  });

  it.each([
    [{ body: "/remove", user: { login: "mallory" }, author_association: "OWNER" }],
    [{ body: "/remove", user: { login: "owner" }, author_association: "CONTRIBUTOR" }],
    [{ body: "please /remove", user: { login: "owner" }, author_association: "OWNER" }],
  ])("ignores /remove from anyone else: %j", async (comment) => {
    const repo = new FakeRepo();
    expect(await handleRemoveCommand(reportCtx(repo), addReport(repo, 1, "a"), comment)).toBe("ignored");
    expect(repo.prs).toHaveLength(0);
  });
});
