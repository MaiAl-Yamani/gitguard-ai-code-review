import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseReview, type Review } from "./review-schema";

export type { Review };

const PROMPT = `You are GitGuard, a careful senior code reviewer. Review the unified git diff below.
Respond ONLY with one JSON object (no markdown, no prose) with exactly this shape:
{
  "summary": string,            // 1-3 sentences describing what the change does
  "risk": "critical"|"high"|"medium"|"low"|"none",   // overall risk of merging
  "issues": [{
    "title": string,
    "severity": "critical"|"high"|"medium"|"low",
    "file": string|null,        // file path from the diff headers, or null if unknown
    "line": number|null,        // new-file line number from the @@ hunk headers, or null if you cannot determine it exactly
    "explanation": string,
    "fix": string|null
  }],
  "tests": string[]             // concrete recommended tests
}
Rules: Only report real problems visible in the diff. Do not invent issues; if there are none, return "issues": [].
Never guess file names or line numbers: use null when not certain.

DIFF:
`;

export const analyzeDiff = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ diff: z.string().min(10).max(100_000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env['GEMINI_API_KEY'];
    if (!key) return { error: "GEMINI_API_KEY is not configured on the server." } as const;
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: PROMPT + data.diff }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const e = body?.error ?? {};
      const reason = (e.details ?? []).map((d: { reason?: string }) => d.reason).filter(Boolean).join(", ");
      console.error("Gemini API error", res.status, e.status, reason, e.message);
      return { error: `Gemini API error (${res.status}${e.status ? " " + e.status : ""}${reason ? ", " + reason : ""}): ${e.message ?? "unknown error"}` } as const;
    }
    const cand = body?.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    const text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) return { error: `The model returned an empty response${cand?.finishReason ? ` (${cand.finishReason})` : ""}.` } as const;
    try {
      return { review: parseReview(text) } as const;
    } catch {
      console.error("Unparseable model output", text.slice(0, 500));
      return { error: "The model's response wasn't valid structured JSON. Please try again." } as const;
    }
  });
