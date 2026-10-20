import type { PullRequest } from "./github.ts";
import type { RemovedEntry } from "./schema.ts";

// GitHub logins whose submissions always wait for a person. Add more here.
export const BLOCKED_USERS: string[] = [];

export const MIN_ACCOUNT_AGE_DAYS = 30;
export const MAX_SUBMISSIONS_PER_DAY = 3;
export const REMOVALS_BEFORE_BLOCK = 2;

export interface GateInput {
  pr: PullRequest;
  botLogin: string;
  branch: string;
  slug: string;
  files: { filename: string; status: string }[];
  login: string;
  accountCreatedAt: Date;
  now: Date;
  // Themes this person got merged in the last 24 hours
  recentSubmissions: number;
  removed: RemovedEntry[];
}

export type GateReason = "not-bot" | "diff" | "new-account" | "rate-limit" | "blocked";

export type GateResult = { autoMerge: true } | { autoMerge: false; reason: GateReason; detail: string };

// Decides whether a submission PR can merge on its own. Anything that fails waits for the owner.
export function gate(input: GateInput): GateResult {
  const { pr, botLogin, branch, slug, files, login } = input;

  if (pr.author !== botLogin || pr.headRef !== branch) {
    return { autoMerge: false, reason: "not-bot", detail: `PR #${pr.number} wasn't opened by the bot from ${branch}` };
  }

  const expected = [`themes/${slug}/meta.json`, `themes/${slug}/theme.json`];
  const actual = files.map((f) => f.filename).sort();
  const onlyAdds = files.every((f) => f.status === "added");
  if (!onlyAdds || actual.length !== expected.length || actual.some((f, i) => f !== expected[i])) {
    return {
      autoMerge: false,
      reason: "diff",
      detail: `PR should only add ${expected.join(" and ")}, but it touches ${files.map((f) => `${f.filename} (${f.status})`).join(", ")}`,
    };
  }

  const who = login.toLowerCase();
  const removals = input.removed.filter((r) => r.github.toLowerCase() === who).length;
  if (BLOCKED_USERS.some((u) => u.toLowerCase() === who) || removals >= REMOVALS_BEFORE_BLOCK) {
    return { autoMerge: false, reason: "blocked", detail: `${login} is blocked (${removals} removed themes)` };
  }

  const ageDays = (input.now.getTime() - input.accountCreatedAt.getTime()) / 86_400_000;
  if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
    return { autoMerge: false, reason: "new-account", detail: `${login}'s account is ${Math.floor(ageDays)} days old` };
  }

  if (input.recentSubmissions >= MAX_SUBMISSIONS_PER_DAY) {
    return {
      autoMerge: false,
      reason: "rate-limit",
      detail: `${login} already has ${input.recentSubmissions} themes merged in the last 24 hours`,
    };
  }

  return { autoMerge: true };
}
