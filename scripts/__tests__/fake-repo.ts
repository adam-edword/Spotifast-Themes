import type { Comment, IssueSummary, PullRequest, Repo } from "../github.ts";

// An in-memory stand-in for GitHub, recording what the bot did.
export class FakeRepo implements Repo {
  owner = "owner";
  name = "Spotifast-Themes";
  users = new Map<string, Date>();
  comments = new Map<number, Comment[]>();
  labels = new Map<number, Set<string>>();
  assignees = new Map<number, string[]>();
  closedIssues: { issue: number; reason: string }[] = [];
  openIssues: (IssueSummary & { label: string })[] = [];
  branches = new Map<string, Record<string, string | null>>();
  prs: (PullRequest & { title: string; body: string; open: boolean; files: Record<string, string | null> })[] = [];
  autoMerged: number[] = [];
  private nextId = 1000;

  constructor(readonly botLogin = "theme-bot[bot]") {}

  async getUserCreatedAt(login: string) {
    return this.users.get(login) ?? new Date("2020-01-01T00:00:00Z");
  }
  async listComments(issue: number) {
    return this.comments.get(issue) ?? [];
  }
  async createComment(issue: number, body: string) {
    this.comments.set(issue, [...(this.comments.get(issue) ?? []), { id: this.nextId++, author: this.botLogin, body }]);
  }
  async updateComment(id: number, body: string) {
    for (const list of this.comments.values()) for (const c of list) if (c.id === id) c.body = body;
  }
  async addLabels(issue: number, labels: string[]) {
    const set = this.labels.get(issue) ?? new Set();
    labels.forEach((l) => set.add(l));
    this.labels.set(issue, set);
  }
  async removeLabel(issue: number, label: string) {
    this.labels.get(issue)?.delete(label);
  }
  async addAssignees(issue: number, logins: string[]) {
    this.assignees.set(issue, logins);
  }
  async closeIssue(issue: number, reason: "completed" | "not_planned") {
    this.closedIssues.push({ issue, reason });
  }
  async listOpenIssues(label: string) {
    return this.openIssues.filter((i) => i.label === label);
  }
  async commitToBranch(branch: string, _message: string, files: Record<string, string | null>) {
    this.branches.set(branch, files);
    for (const pr of this.prs) if (pr.headRef === branch && pr.open) pr.files = files;
  }
  async deleteBranch(branch: string) {
    this.branches.delete(branch);
  }
  async findOpenPr(branch: string) {
    return this.prs.find((p) => p.headRef === branch && p.open);
  }
  async createPr(branch: string, title: string, body: string) {
    const n = this.nextId++;
    const pr = { number: n, nodeId: `PR_${n}`, author: this.botLogin, headRef: branch, title, body, open: true, files: this.branches.get(branch) ?? {} };
    this.prs.push(pr);
    return pr;
  }
  async updatePr(number: number, title: string, body: string) {
    const pr = this.prs.find((p) => p.number === number)!;
    pr.title = title;
    pr.body = body;
  }
  async closePr(number: number) {
    this.prs.find((p) => p.number === number)!.open = false;
  }
  async listPrFiles(number: number) {
    const pr = this.prs.find((p) => p.number === number)!;
    return Object.entries(pr.files).map(([filename, content]) => ({ filename, status: content === null ? "removed" : "added" }));
  }
  async enableAutoMerge(pr: PullRequest) {
    this.autoMerged.push(pr.number);
  }
}

// Builds an issue body the way GitHub renders the submission form.
export function submissionBody(opts: { name?: string; tags?: string[]; theme?: string; promises?: boolean[] } = {}) {
  const tags = ["minimal", "vibrant", "pastel", "high-contrast", "retro", "warm", "cool", "monochrome"];
  const promises = ["I made this theme myself", "I'm releasing it under CC0, so anyone can use it", "I tried it in Spotifast"];
  const box = (on: boolean, label: string) => `- [${on ? "X" : " "}] ${label}`;
  const theme =
    opts.theme ??
    JSON.stringify({ base: "dark", colors: { window: "#0b1d2a", accent: "#ffd166", on_accent: "#1a1300", text: "#f0f4f8" } }, null, 2);
  return [
    "### Theme name",
    "",
    opts.name === undefined ? "Harbor Lights" : opts.name || "_No response_",
    "",
    "### Tags",
    "",
    ...tags.map((t) => box((opts.tags ?? ["cool"]).includes(t), t)),
    "",
    "### theme.json",
    "",
    "```json",
    theme,
    "```",
    "",
    "### Before you share",
    "",
    ...promises.map((p, i) => box(opts.promises?.[i] ?? true, p)),
  ].join("\n");
}
