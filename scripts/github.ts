// The small slice of the GitHub API the bot uses. Workflows get the real client;
// tests use an in-memory fake with the same shape.

export interface PullRequest {
  number: number;
  nodeId: string;
  author: string;
  headRef: string;
}

export interface IssueSummary {
  number: number;
  author: string;
  body: string;
}

export interface Comment {
  id: number;
  author: string;
  body: string;
}

export interface Repo {
  owner: string;
  name: string;
  getUserCreatedAt(login: string): Promise<Date>;
  listComments(issue: number): Promise<Comment[]>;
  createComment(issue: number, body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
  addLabels(issue: number, labels: string[]): Promise<void>;
  removeLabel(issue: number, label: string): Promise<void>;
  addAssignees(issue: number, logins: string[]): Promise<void>;
  closeIssue(issue: number, reason: "completed" | "not_planned"): Promise<void>;
  listOpenIssues(label: string): Promise<IssueSummary[]>;
  // Makes one commit on top of master that writes (string) or deletes (null) the
  // given files, and points `branch` at it, creating or force-moving the branch.
  commitToBranch(branch: string, message: string, files: Record<string, string | null>): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  findOpenPr(branch: string): Promise<PullRequest | undefined>;
  createPr(branch: string, title: string, body: string): Promise<PullRequest>;
  updatePr(number: number, title: string, body: string): Promise<void>;
  closePr(number: number): Promise<void>;
  listPrFiles(number: number): Promise<{ filename: string; status: string }[]>;
  // Turns on squash auto-merge, or merges right away if checks already passed.
  enableAutoMerge(pr: PullRequest): Promise<void>;
}

const API = "https://api.github.com";
const BASE_BRANCH = "master";

export class GitHubRepo implements Repo {
  constructor(
    readonly owner: string,
    readonly name: string,
    private readonly token: string,
  ) {}

  static fromEnv(): GitHubRepo {
    const [owner, name] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
    const token = process.env.GH_TOKEN;
    if (!owner || !name || !token) throw new Error("GITHUB_REPOSITORY and GH_TOKEN must be set");
    return new GitHubRepo(owner, name, token);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "spotifast-themes-bot",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 && method === "GET") return undefined as T;
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private async paginate<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const batch = (await this.request<T[]>("GET", `${path}${sep}per_page=100&page=${page}`)) ?? [];
      all.push(...batch);
      if (batch.length < 100) return all;
    }
  }

  private get repoPath() {
    return `/repos/${this.owner}/${this.name}`;
  }

  async getUserCreatedAt(login: string): Promise<Date> {
    const user = await this.request<{ created_at: string }>("GET", `/users/${encodeURIComponent(login)}`);
    if (!user) throw new Error(`user ${login} not found`);
    return new Date(user.created_at);
  }

  async listComments(issue: number): Promise<Comment[]> {
    const comments = await this.paginate<{ id: number; body: string; user: { login: string } }>(
      `${this.repoPath}/issues/${issue}/comments`,
    );
    return comments.map((c) => ({ id: c.id, body: c.body ?? "", author: c.user.login }));
  }

  async createComment(issue: number, body: string) {
    await this.request("POST", `${this.repoPath}/issues/${issue}/comments`, { body });
  }

  async updateComment(id: number, body: string) {
    await this.request("PATCH", `${this.repoPath}/issues/comments/${id}`, { body });
  }

  async addLabels(issue: number, labels: string[]) {
    await this.request("POST", `${this.repoPath}/issues/${issue}/labels`, { labels });
  }

  async removeLabel(issue: number, label: string) {
    const res = await fetch(`${API}${this.repoPath}/issues/${issue}/labels/${encodeURIComponent(label)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "User-Agent": "spotifast-themes-bot" },
    });
    // 404 just means the label wasn't on the issue
    if (!res.ok && res.status !== 404) throw new Error(`removing label ${label} failed: ${res.status}`);
  }

  async addAssignees(issue: number, logins: string[]) {
    await this.request("POST", `${this.repoPath}/issues/${issue}/assignees`, { assignees: logins });
  }

  async closeIssue(issue: number, reason: "completed" | "not_planned") {
    await this.request("PATCH", `${this.repoPath}/issues/${issue}`, { state: "closed", state_reason: reason });
  }

  async listOpenIssues(label: string): Promise<IssueSummary[]> {
    const issues = await this.paginate<{ number: number; body: string | null; user: { login: string }; pull_request?: unknown }>(
      `${this.repoPath}/issues?state=open&labels=${encodeURIComponent(label)}`,
    );
    return issues
      .filter((i) => !i.pull_request)
      .map((i) => ({ number: i.number, author: i.user.login, body: i.body ?? "" }));
  }

  async commitToBranch(branch: string, message: string, files: Record<string, string | null>) {
    const base = await this.request<{ object: { sha: string } }>("GET", `${this.repoPath}/git/ref/heads/${BASE_BRANCH}`);
    const baseCommit = await this.request<{ tree: { sha: string } }>("GET", `${this.repoPath}/git/commits/${base.object.sha}`);
    const tree = await this.request<{ sha: string }>("POST", `${this.repoPath}/git/trees`, {
      base_tree: baseCommit.tree.sha,
      tree: Object.entries(files).map(([path, content]) =>
        content === null
          ? { path, mode: "100644", type: "blob", sha: null }
          : { path, mode: "100644", type: "blob", content },
      ),
    });
    const commit = await this.request<{ sha: string }>("POST", `${this.repoPath}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [base.object.sha],
    });
    const existing = await this.request("GET", `${this.repoPath}/git/ref/heads/${branch}`);
    if (existing) {
      await this.request("PATCH", `${this.repoPath}/git/refs/heads/${branch}`, { sha: commit.sha, force: true });
    } else {
      await this.request("POST", `${this.repoPath}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
    }
  }

  async deleteBranch(branch: string) {
    const existing = await this.request("GET", `${this.repoPath}/git/ref/heads/${branch}`);
    if (existing) await this.request("DELETE", `${this.repoPath}/git/refs/heads/${branch}`);
  }

  private toPr(p: { number: number; node_id: string; user: { login: string }; head: { ref: string } }): PullRequest {
    return { number: p.number, nodeId: p.node_id, author: p.user.login, headRef: p.head.ref };
  }

  async findOpenPr(branch: string): Promise<PullRequest | undefined> {
    const prs = await this.request<Parameters<GitHubRepo["toPr"]>[0][]>(
      "GET",
      `${this.repoPath}/pulls?state=open&head=${encodeURIComponent(`${this.owner}:${branch}`)}`,
    );
    return prs?.[0] ? this.toPr(prs[0]) : undefined;
  }

  async createPr(branch: string, title: string, body: string): Promise<PullRequest> {
    const pr = await this.request<Parameters<GitHubRepo["toPr"]>[0]>("POST", `${this.repoPath}/pulls`, {
      head: branch,
      base: BASE_BRANCH,
      title,
      body,
    });
    return this.toPr(pr);
  }

  async updatePr(number: number, title: string, body: string) {
    await this.request("PATCH", `${this.repoPath}/pulls/${number}`, { title, body });
  }

  async closePr(number: number) {
    await this.request("PATCH", `${this.repoPath}/pulls/${number}`, { state: "closed" });
  }

  async listPrFiles(number: number) {
    // GitHub works out a new PR's diff in the background, so it can briefly come back empty.
    for (let attempt = 0; ; attempt++) {
      const files = await this.paginate<{ filename: string; status: string }>(`${this.repoPath}/pulls/${number}/files`);
      if (files.length || attempt >= 5) return files.map((f) => ({ filename: f.filename, status: f.status }));
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async enableAutoMerge(pr: PullRequest) {
    const res = await fetch(`${API}/graphql`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", "User-Agent": "spotifast-themes-bot" },
      body: JSON.stringify({
        query: `mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }`,
        variables: { id: pr.nodeId },
      }),
    });
    const json = (await res.json()) as { errors?: { message: string }[] };
    if (!json.errors?.length) return;
    const message = json.errors.map((e) => e.message).join("; ");
    // GitHub refuses auto-merge when every required check has already passed. Merge directly then.
    if (/clean status/i.test(message)) {
      await this.request("PUT", `${this.repoPath}/pulls/${pr.number}/merge`, { merge_method: "squash" });
      return;
    }
    throw new Error(`enabling auto-merge on #${pr.number} failed: ${message}`);
  }
}
