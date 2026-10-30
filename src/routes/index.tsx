import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeDiff } from "@/lib/review.functions";
import { reviewToMarkdown, type Review, type Severity } from "@/lib/review-schema";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GitGuard — AI Git diff reviewer" },
      { name: "description", content: "Paste a unified Git diff and get an AI review: summary, risk level, issues by severity, fixes and tests." },
      { property: "og:title", content: "GitGuard — AI Git diff reviewer" },
      { property: "og:description", content: "AI-powered code review for your Git diffs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const SEV_STYLE: Record<Severity | "none", { badge: string; bar: string; dot: string }> = {
  critical: { badge: "bg-sev-critical/15 text-sev-critical border-sev-critical/40", bar: "border-l-sev-critical", dot: "bg-sev-critical" },
  high: { badge: "bg-sev-high/15 text-sev-high border-sev-high/40", bar: "border-l-sev-high", dot: "bg-sev-high" },
  medium: { badge: "bg-sev-medium/15 text-sev-medium border-sev-medium/40", bar: "border-l-sev-medium", dot: "bg-sev-medium" },
  low: { badge: "bg-sev-low/15 text-sev-low border-sev-low/40", bar: "border-l-sev-low", dot: "bg-sev-low" },
  none: { badge: "bg-primary/15 text-primary border-primary/40", bar: "border-l-primary", dot: "bg-primary" },
};

function SevBadge({ s }: { s: Severity | "none" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${SEV_STYLE[s].badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${SEV_STYLE[s].dot}`} />
      {s}
    </span>
  );
}

function Index() {
  const analyze = useServerFn(analyzeDiff);
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setError(null);
    const t = diff.trim();
    if (!t) return setError("Paste a diff first.");
    if (!/^(diff --git|---|\+\+\+|@@)/m.test(t)) return setError("That doesn't look like a unified Git diff (expected lines like 'diff --git' or '@@').");
    setLoading(true);
    setReview(null);
    try {
      const r = await analyze({ data: { diff: t } });
      if ("error" in r) setError(r.error);
      else setReview(r.review);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!review) return;
    try {
      await navigator.clipboard.writeText(reviewToMarkdown(review));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't access the clipboard.");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="h-3 w-3 rounded-full bg-primary shadow-glow" />
        <h1 className="text-lg font-bold tracking-tight">GitGuard</h1>
        <span className="text-xs text-muted-foreground">// AI diff reviewer</span>
      </header>
      <main className="mx-auto max-w-6xl p-6 grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Unified diff</label>
          <textarea
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            spellCheck={false}
            placeholder={"diff --git a/app.js b/app.js\n@@ -1,3 +1,4 @@\n- const x = 1\n+ const x = null"}
            className="min-h-[420px] w-full rounded-lg border border-border bg-card p-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={run}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze Code"}
          </button>
          {error && <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </section>

        <section className="flex flex-col gap-4">
          {loading && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground animate-pulse">
              Reviewing your changes with Gemma…
            </div>
          )}
          {!loading && !review && (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Results will appear here.
            </div>
          )}
          {review && (
            <>
              <div className={`rounded-lg border border-border border-l-4 ${SEV_STYLE[review.risk].bar} bg-card p-4`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Overall risk</span>
                    <SevBadge s={review.risk} />
                  </div>
                  <button onClick={copy} className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition hover:border-primary hover:text-primary">
                    {copied ? "Copied ✓" : "Copy Review"}
                  </button>
                </div>
                <h2 className="mb-1 text-xs uppercase tracking-widest text-primary">Summary</h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{review.summary || <span className="text-muted-foreground">No summary provided.</span>}</p>
              </div>

              {review.warnings.length > 0 && (
                <div className="rounded-lg border border-sev-medium/40 bg-sev-medium/10 p-3 text-xs text-sev-medium">
                  {review.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              <div>
                <h2 className="mb-3 text-xs uppercase tracking-widest text-primary">Issues ({review.issues.length})</h2>
                {review.issues.length === 0 ? (
                  <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No issues identified.</div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {review.issues.map((b, i) => (
                      <li key={i} className={`rounded-lg border border-border border-l-4 ${SEV_STYLE[b.severity].bar} bg-card p-4`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <SevBadge s={b.severity} />
                          <span className="font-semibold text-sm">{b.title}</span>
                        </div>
                        <div className="mt-2 text-xs">
                          {b.file ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-primary">{b.file}{b.line ? `:${b.line}` : ""}</code>
                          ) : (
                            <span className="text-muted-foreground italic">Location not identified</span>
                          )}
                          {b.file && !b.line && <span className="ml-2 text-muted-foreground italic">line not identified</span>}
                        </div>
                        {b.explanation && <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{b.explanation}</p>}
                        {b.fix && (
                          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                            <div className="mb-1 text-xs uppercase tracking-widest text-primary">Suggested fix</div>
                            <p className="text-sm whitespace-pre-wrap">{b.fix}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-3 text-xs uppercase tracking-widest text-primary">Recommended tests</h2>
                {review.tests.length ? (
                  <ul className="space-y-2 text-sm">
                    {review.tests.map((t, i) => (
                      <li key={i} className="flex gap-2"><span className="text-primary">▸</span><span className="whitespace-pre-wrap">{t}</span></li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">None suggested.</p>}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
