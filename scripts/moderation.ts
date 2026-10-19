import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

// Names that pretend to be official or impersonate the projects. Add more here.
export const BLOCKED_TERMS: string[] = ["spotify", "spotifast", "official", "admin", "moderator"];

// Innocent words the profanity filter flags by mistake. Add more here.
export const ALLOWED_WORDS: string[] = ["shiitake"];

const URL_WORDS =new Set(["www", "http", "https", "com", "net", "org", "io", "gg"]);
const MAX_DIGITS = 6;

const profanity = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Returns the reasons a theme name is rejected, or an empty list if it's fine.
export function moderateName(name: string): string[] {
  const reasons: string[] = [];
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);

  if (isProfane(words)) {
    reasons.push("contains a word that isn't allowed");
  }

  const term = findBlockedTerm(words.map(unleet));
  if (term) {
    reasons.push(`can't include "${term}"`);
  }

  if (words.some((w) => URL_WORDS.has(w))) {
    reasons.push("looks like a link or web address");
  }

  if ((name.match(/\d/g) ?? []).length > MAX_DIGITS) {
    reasons.push(`can't have more than ${MAX_DIGITS} digits`);
  }

  return reasons;
}

// Checks the name as written, and again with runs of single letters joined up so
// spaced-out words ("f u c k") are caught too.
function isProfane(words: string[]): boolean {
  const kept = words.filter((w) => !ALLOWED_WORDS.includes(w));
  const joinedLetters = kept.join(" ").replace(/\b(\w) (?=\w\b)/g, "$1");
  return profanity.hasMatch(kept.join(" ")) || profanity.hasMatch(joinedLetters);
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };

function unleet(word: string): string {
  return word.replace(/[013457]/g, (d) => LEET[d]);
}

// A single word is blocked if it starts or ends with a blocked term ("Spotifydark",
// "Unofficial"). A run of several words is blocked only if, joined together, it spells
// a blocked term exactly ("Spot Ify", "S P O T I F Y"). Matching inside joined words
// would reject innocent names like "Bad Minton".
function findBlockedTerm(words: string[]): string | undefined {
  for (const term of BLOCKED_TERMS) {
    if (words.some((w) => w.startsWith(term) || w.endsWith(term))) return term;
    for (let start = 0; start < words.length; start++) {
      let joined = "";
      for (let end = start; end < words.length && joined.length < term.length; end++) {
        joined += words[end];
        if (end > start && joined === term) return term;
      }
    }
  }
  return undefined;
}
