// Client-safe: types, validation of model output, and Markdown export.
export type Severity = "critical" | "high" | "medium" | "low";
export type Issue = {
  title: string;
  severity: Severity;
  file: string | null;
  line: number | null;
  explanation: string;
  fix: string | null;
};
export type Review = { summary: string; risk: Severity | "none"; issues: Issue[]; tests: string[]; warnings: string[] };

const SEVS: Severity[] = ["critical", "high", "medium", "low"];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function toSeverity(v: unknown): Severity | null {
  const s = str(v).toLowerCase();
  return (SEVS as string[]).includes(s) ? (s as Severity) : null;
}

/** Parses raw model text into a Review. Throws if no usable JSON object exists. */
export function parseReview(text: string): Review {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  const p = JSON.parse(cleaned.slice(start, end + 1)) as { summary?: unknown; risk?: unknown; issues?: unknown; tests?: unknown };
  const warnings: string[] = [];

  const summary = str(p.summary);
  if (!summary) warnings.push("The model did not provide a summary.");

  const rawIssues = Array.isArray(p.issues) ? p.issues : [];
  if (!Array.isArray(p.issues)) warnings.push("The model did not return an issues list.");
  const issues: Issue[] = [];
  let dropped = 0;
  for (const r of rawIssues) {
    if (!r || typeof r !== "object") { dropped++; continue; }
    const o = r as { title?: unknown; explanation?: unknown; severity?: unknown; line?: unknown; file?: unknown; fix?: unknown };
    const title = str(o.title);
    const explanation = str(o.explanation);
    if (!title && !explanation) { dropped++; continue; }
    const sev = toSeverity(o.severity);
    if (!sev) warnings.push(`Issue "${title || "untitled"}" had no valid severity; shown as Low.`);
    const line = typeof o.line === "number" && Number.isInteger(o.line) && o.line > 0 ? o.line : null;
    issues.push({
      title: title || "Untitled issue",
      severity: sev ?? "low",
      file: str(o.file) || null,
      line,
      explanation,
      fix: str(o.fix) || null,
    });
  }
  if (dropped) warnings.push(`${dropped} incomplete issue(s) from the model were skipped.`);

  const tests = (Array.isArray(p.tests) ? p.tests : []).map(str).filter(Boolean);

  const order = (s: Severity) => SEVS.indexOf(s);
  issues.sort((a, b) => order(a.severity) - order(b.severity));
  const modelRisk = str(p.risk).toLowerCase();
  const highest = issues[0]?.severity;
  let risk: Review["risk"] = toSeverity(modelRisk) ?? (modelRisk === "none" ? "none" : highest ?? "none");
  // Never report lower risk than the worst issue found.
  if (highest && (risk === "none" || order(highest) < order(risk))) risk = highest;

  return { summary, risk, issues, tests, warnings };
}

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function reviewToMarkdown(r: Review): string {
  const out = ["# GitGuard Review", "", `**Overall risk:** ${label(r.risk)}`, "", "## Summary", "", r.summary || "_No summary._", "", `## Issues (${r.issues.length})`, ""];
  if (!r.issues.length) out.push("_No issues identified._", "");
  r.issues.forEach((i, n) => {
    const loc = i.file ? `\`${i.file}${i.line ? `:${i.line}` : ""}\`` : "Location not identified";
    out.push(`### ${n + 1}. [${label(i.severity)}] ${i.title}`, "", `**Location:** ${loc}`, "", i.explanation || "_No explanation._", "");
    if (i.fix) out.push(`**Suggested fix:** ${i.fix}`, "");
  });
  out.push("## Recommended tests", "");
  out.push(...(r.tests.length ? r.tests.map((t) => `- ${t}`) : ["_None._"]));
  return out.join("\n") + "\n";
}
