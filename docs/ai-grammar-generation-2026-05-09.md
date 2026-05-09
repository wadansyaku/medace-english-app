# AI Grammar Generation Research and Implementation

Date: 2026-05-09

## Decision

Use `gemini-2.5-flash` as the default model for AI-generated grammar practice questions.

Reasons:

- The app already uses `@google/genai`, `GEMINI_API_KEY`, structured JSON output, and AI usage metering for Gemini-backed actions.
- Gemini 2.5 Flash has a strong price/performance fit for short structured educational generation: Google lists it as a hybrid reasoning model with a 1M token context window and thinking budgets.
- Current paid pricing is low enough for learner-facing quiz generation: $0.30 per 1M text input tokens and $2.50 per 1M output tokens.
- It avoids adding a second live provider path, extra secrets, provider-specific error handling, and a new privacy/compliance surface.

The implementation keeps `AI_GRAMMAR_MODEL` as an optional environment override. This allows future A/B testing with cheaper or stronger models without changing application code.

## Model Comparison

| Model | Current fit | Pricing note | Recommendation |
| --- | --- | --- | --- |
| `gemini-2.5-flash` | Best current balance for this app | $0.30 input / $2.50 output per 1M tokens | Default |
| `gemini-2.5-flash-lite` | Very cheap high-volume candidate | $0.10 input / $0.40 output per 1M tokens | A/B test after quality rubric exists |
| `gemini-3.1-flash-lite` | Newer cost-efficient Gemini candidate | $0.25 input / $1.50 output per 1M tokens | Candidate once production stability is proven |
| `gpt-5.4-mini` | Strong alternate for structured text | $0.75 input / $4.50 output per 1M tokens | Consider only if grammar quality beats Gemini materially |
| Claude Haiku 4.5 | Fast, near-frontier, but costlier output | $1 input / $5 output per 1M tokens | Not first choice for this app |
| Claude Sonnet 4.6 | Better intelligence, much higher cost | $3 input / $15 output per 1M tokens | Reserve for offline content QA, not per-session quiz generation |

## Product Guardrails

- AI is attempted only for the three grammar modes: `GRAMMAR_CLOZE`, `EN_WORD_ORDER`, and `JA_TRANSLATION_ORDER`.
- If AI is unavailable, budget-limited, access-denied, or returns invalid output, the app falls back to the existing deterministic generator.
- AI output is normalized into the same `GeneratedWorksheetQuestion` shape as existing questions.
- Invalid drafts are dropped instead of trusted:
  - Cloze questions must include `____`.
  - Ordering questions must have reasonable token counts.
  - The returned mode and word id must match the requested mode and source words.
  - The answer must be present in cloze options.
- Usage is metered under `generateGrammarPracticeQuestions`.

## Sources Checked

- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini model overview: https://ai.google.dev/gemini-api/docs/models
- Claude model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Claude pricing: https://platform.claude.com/docs/en/about-claude/pricing

