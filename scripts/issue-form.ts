// Reads the markdown GitHub writes for an issue form: one "### Label" heading per field.

const NO_RESPONSE = "_No response_";

export function parseIssueForm(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const normalized = body.replace(/\r\n?/g, "\n");
  const parts = normalized.split(/^### (.+)$/m);
  // parts = [before, label1, value1, label2, value2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i].trim();
    const value = (parts[i + 1] ?? "").trim();
    if (!sections.has(label)) sections.set(label, value === NO_RESPONSE ? "" : value);
  }
  return sections;
}

// "- [X] option" lines, returning the checked options' text.
export function checkedOptions(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.match(/^\s*-\s*\[([xX ])\]\s*(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => Boolean(m) && m![1].toLowerCase() === "x")
    .map((m) => m[2]);
}

// The textarea uses `render: json`, so GitHub wraps it in a ```json fence. People
// sometimes paste their own fence too, so peel off as many as there are.
export function stripCodeFences(value: string): string {
  let text = value.trim();
  for (;;) {
    const m = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (!m) return text;
    text = m[1].trim();
  }
}
