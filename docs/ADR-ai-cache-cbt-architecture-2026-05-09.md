# ADR: AI Cache and CBT Architecture

Date: 2026-05-09

## Status

Accepted for the first implementation slice.

## Context

MedAce already generates example sentences and grammar practice questions through metered AI actions, but grammar questions were not persisted for reuse. The product also needs a CBT-style model that can continuously estimate learner ability, generated-problem difficulty, and learner-word mastery without making the first slice depend on a full adaptive-question UI.

## Decision

Add a minimal D1-backed persistence layer:

- `ai_generated_contents`: common cache envelope keyed by content kind, model, prompt version, word, grammar scope, question mode, and normalized source hash.
- `ai_generated_examples`: normalized example sentence cache linked to the common envelope.
- `ai_generated_problems`: normalized grammar/problem cache linked to the common envelope.
- `cbt_learner_profiles`: learner-level ability estimate.
- `cbt_problem_stats`: problem-level difficulty and aggregate response stats.
- `cbt_learner_word_states`: learner-word mastery estimate.

The first helper surface is intentionally server-side:

- `services/storage/ai-cache-cbt.ts` owns deterministic cache keys and CBT state transition math.
- `functions/_shared/ai-cache-cbt.ts` owns D1 read/write helpers for generated content, reusable grammar problems, and CBT updates.
- `functions/_shared/ai-actions.ts` reads reusable grammar problems before calling Gemini and writes successful normalized questions back to D1.
- Quiz questions carry `generatedProblemId` when a generated/cached problem is known, allowing answer records to update CBT stats without exposing a separate public cache API.

No public storage action is added in this slice. Cache hits are internal to the AI generation route and do not consume AI budget.

## CBT Update Rule

The initial model uses a bounded Elo-like update:

- levels are normalized from `0` to `1`;
- expected correctness is computed from learner or word level versus problem difficulty;
- correct answers raise learner/word levels more when the problem is difficult;
- incorrect answers lower levels more when the problem is easy;
- confidence rises with attempts and reduces update volatility.

This is deliberately simple enough to audit and migrate. It can later be replaced with a fuller IRT model while preserving the table contract.

## Non-goals

- No full adaptive-question selection UI yet.
- No automatic replacement of existing deterministic grammar generation when AI/cache is unavailable.
- No change to the public storage action contract.
- No direct mutation of existing `words.example_sentence` semantics.

## Follow-up Integration Points

1. Save generated examples through `recordAiGeneratedExample` when the existing example-generation path succeeds.
2. Add adaptive question selection that chooses grammar scope and problem difficulty from CBT state.
3. Add instructor/admin review tooling for rejecting weak generated problems.
