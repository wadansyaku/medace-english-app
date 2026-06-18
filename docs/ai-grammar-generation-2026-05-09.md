# AI Grammar Generation Research and Implementation

Date: 2026-05-09

## Decision

Use Cloudflare Workers AI as the first provider for AI-generated grammar practice questions, backed by a D1 reusable problem cache. Keep `gemini-3-flash-preview` as the quality fallback when Cloudflare is unavailable or the generated draft fails validation.

Reasons:

- Cloudflare Workers AI can be invoked through the `env.AI` binding without a provider API key in the request path, which lets the app use Cloudflare's included/free usage before paying for external providers. As of 2026-06-18, Cloudflare documents a free allocation of 10,000 Neurons per day.
- Grammar questions already pass through strict normalization, D1 caching, and review-oriented quality gates. That makes this action a good first target for a lower-cost provider.
- Gemini remains the fallback because grammar questions need strict control over scope, distractors, Japanese translation quality, and unique word-order answers.
- Cloudflare output is accepted only after the same validation as Gemini output. If only part of a request passes validation, Gemini is called only for the remaining words.

The implementation keeps `AI_GRAMMAR_PROVIDER` as an environment switch (`AUTO`, `CLOUDFLARE`, or `GEMINI`). It also keeps `AI_GRAMMAR_MODEL` for Gemini fallback and adds `CLOUDFLARE_AI_GRAMMAR_MODEL` for the Workers AI model.

## Model Comparison

| Model | Current fit | Pricing note | Recommendation |
| --- | --- | --- | --- |
| `gemini-3-flash-preview` | Better quality headroom while still cheap | $0.50 input / $3.00 output per 1M tokens | Default for grammar generation |
| `gemini-2.5-flash` | Cheapest stable fallback in current stack | $0.30 input / $2.50 output per 1M tokens | Fallback via `AI_GRAMMAR_MODEL` if preview stability is a problem |
| `gemini-2.5-flash-lite` | Very cheap high-volume candidate | $0.10 input / $0.40 output per 1M tokens | Do not use until a quality rubric proves it can make valid grammar items |
| `gpt-5.4-mini` | Strong alternate for structured text | $0.375 input / $2.25 output per 1M tokens | Consider after adding a second-provider adapter and live A/B quality gate |
| Claude Haiku 4.5 | Fast, capable, but costlier output | $1 input / $5 output per 1M tokens | Not first choice for this app |
| Claude Sonnet 4.6 | Better intelligence, much higher cost | $3 input / $15 output per 1M tokens | Reserve for offline content QA, not per-session quiz generation |
| `@cf/meta/llama-3.1-8b-instruct` | Lower-cost first pass through Workers AI binding | Included/free tier first, then Workers AI usage | Default first-pass provider with Gemini fallback |

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
- If Cloudflare AI is unavailable or returns invalid output, the app attempts Gemini for the missing words before falling back to the existing deterministic generator.
- AI output is normalized into the same `GeneratedWorksheetQuestion` shape as existing questions.
- Invalid drafts are dropped instead of trusted:
  - Cloze questions must include `____`.
  - Ordering questions must have reasonable token counts.
  - Ordering tokens are normalized so capitalization and final punctuation do not reveal the answer.
  - Ordering drafts with duplicate visible tokens are rejected to keep the answer uniquely determined.
  - The returned mode and word id must match the requested mode and source words.
  - The answer must be present in cloze options.
- Usage is metered under `generateGrammarPracticeQuestions`.
- D1 cache hits do not consume AI budget. Cloudflare-generated misses are logged with zero estimated app cost while using the included/free tier assumption; Gemini fallback misses consume the existing monthly AI budget estimate.

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
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare Workers AI bindings: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- Cloudflare Workers AI JSON Mode: https://developers.cloudflare.com/workers-ai/features/json-mode/
- Cloudflare AI Gateway Worker binding methods: https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods/
