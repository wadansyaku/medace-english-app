# AI Grammar Generation Research and Implementation

Date: 2026-05-09

## Decision

Use `gemini-3-flash-preview` as the default model for AI-generated grammar practice questions, backed by a D1 reusable problem cache.

Reasons:

- The app already uses `@google/genai`, `GEMINI_API_KEY`, structured JSON output, and AI usage metering for Gemini-backed actions.
- `gemini-2.5-flash` is cheap, but grammar questions need stricter control over scope, distractors, Japanese translation quality, and unique word-order answers. The default should favor quality because successful generations are now cached and reused.
- Google currently lists Gemini 3 Flash Preview at $0.50 input / $3.00 output per 1M text tokens. That is moderately above Gemini 2.5 Flash ($0.30 / $2.50), below Claude Haiku/Sonnet output pricing, and close enough to OpenAI `gpt-5.4-mini` that provider integration overhead matters more than the raw token delta for this first release.
- Staying on Gemini avoids adding a second live provider path, extra secrets, provider-specific error handling, and a new privacy/compliance surface.

The implementation keeps `AI_GRAMMAR_MODEL` as an optional environment override. This allows rapid fallback to `gemini-2.5-flash`, or an A/B test against OpenAI/Claude later, without changing application code.

## Model Comparison

| Model | Current fit | Pricing note | Recommendation |
| --- | --- | --- | --- |
| `gemini-3-flash-preview` | Better quality headroom while still cheap | $0.50 input / $3.00 output per 1M tokens | Default for grammar generation |
| `gemini-2.5-flash` | Cheapest stable fallback in current stack | $0.30 input / $2.50 output per 1M tokens | Fallback via `AI_GRAMMAR_MODEL` if preview stability is a problem |
| `gemini-2.5-flash-lite` | Very cheap high-volume candidate | $0.10 input / $0.40 output per 1M tokens | Do not use until a quality rubric proves it can make valid grammar items |
| `gpt-5.4-mini` | Strong alternate for structured text | $0.375 input / $2.25 output per 1M tokens | Consider after adding a second-provider adapter and live A/B quality gate |
| Claude Haiku 4.5 | Fast, capable, but costlier output | $1 input / $5 output per 1M tokens | Not first choice for this app |
| Claude Sonnet 4.6 | Better intelligence, much higher cost | $3 input / $15 output per 1M tokens | Reserve for offline content QA, not per-session quiz generation |

## Cost Simulation

Assumptions:

- One grammar generation request creates five questions.
- A typical request uses about 2,000 input tokens and 1,500 output tokens.
- USD/JPY is treated as 150 for rough product planning only.
- D1 stores two rows per generated problem: one cache envelope and one normalized problem row.

| Scenario | Model/API cost | D1 cost | Product read |
| --- | ---: | ---: | --- |
| 10,000 monthly quiz starts, no reuse | about 8,300 JPY/month with Gemini 3 Flash | effectively included at this scale | Too wasteful because identical word/scope/mode questions are regenerated. |
| Same traffic, 80% cache hit | about 1,660 JPY/month | effectively included | Acceptable for live generation plus reuse. |
| Pre-generate 2,400 reusable problems | about 400 JPY one-time | under 5 GB included storage | Best for common curriculum scopes and seeded wordbooks. |
| D1 50,000 problems, 3 KB payload each | no model cost after generation | about 150 MB, under included storage | Cloud storage is not the cost driver; API misses are. |

Cloudflare D1 currently includes 25B rows read/month, 50M rows written/month, and 5 GB storage on Workers Paid before overage. This makes D1 the right cache layer for text problems; R2 is unnecessary unless generated media assets are introduced.

## Product Guardrails

- AI is attempted for the four grammar practice modes: `GRAMMAR_CLOZE`, `EN_WORD_ORDER`, `JA_TRANSLATION_ORDER`, and `JA_TRANSLATION_INPUT`. If the AI route is unavailable or invalid, each mode falls back to the deterministic grammar generator.
- If AI is unavailable, budget-limited, access-denied, or returns invalid output, the app falls back to the existing deterministic generator.
- AI output is normalized into the same `GeneratedWorksheetQuestion` shape as existing questions.
- Invalid drafts are dropped instead of trusted:
  - Cloze questions must include `____`.
  - Ordering questions must have reasonable token counts.
  - Ordering tokens are normalized so capitalization and final punctuation do not reveal the answer.
  - Ordering drafts with duplicate visible tokens are rejected to keep the answer uniquely determined.
  - The returned mode and word id must match the requested mode and source words.
  - The answer must be present in cloze options.
- Usage is metered under `generateGrammarPracticeQuestions`.
- D1 cache hits do not consume AI budget. Only generated cache misses are charged to the monthly AI budget.

## CBT Direction

The first CBT slice stores learner-level ability, generated-problem difficulty, and learner-word mastery. This is intentionally separate from the UI in the first release:

- quiz results can later call `recordCbtProblemAttempt`;
- problem difficulty can be adjusted from correctness and response time;
- future selection can choose problems by grammar scope plus learner/word mastery band;
- content quality review can reject or demote weak generated problems without losing historical attempt stats.

## Sources Checked

- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini model overview: https://ai.google.dev/gemini-api/docs/models
- Claude model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Claude pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
