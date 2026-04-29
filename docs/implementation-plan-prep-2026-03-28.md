# Implementation Plan Prep (2026-03-28)

## Why This Prep Exists

The production baseline shows that the current problem is not scale. The main problem is uneven pathway activation.

- Student learning flow is lightly active.
- AI example generation is lightly active.
- Business operations, missions, writing, commercial requests, and instructor follow-up are not active in production.

That changes how implementation should be planned.

## Planning Principle

Implementation should be ordered by uncertainty reduction, not by feature surface area.

The next plan should answer these questions first:

1. Which production paths are truly used today?
2. Which paths are only schema-complete but not operationally validated?
3. Which metrics are missing, making prioritization unreliable?
4. Which data-model changes should wait until real workflow usage appears?

## Recommended Planning Tracks

### Track 1: Production Measurement Hardening

Goal:

- Make future prioritization evidence-based.

Needed work:

- Add a small daily snapshot job for:
  - DAU/WAU/MAU
  - study starts
  - quiz starts
  - spelling check starts
  - example cache hits
  - example generations
  - image cache hits
  - image generations
  - mission creation and assignment
  - instructor notifications
  - commercial request submissions
  - writing assignment / submission / review counts
- Add plan-level and organization-level cache hit ratios for AI hint assets.
- Add explicit feature funnel events for student, instructor, and group admin entry points.

Why first:

- Without this, later optimization work will still be guesswork.

### Track 2: B2B Workflow Activation

Goal:

- Turn dormant business features into exercised production paths.

Needed work:

- Internal dogfood checklist for one active demo organization:
  - assign students
  - create one cohort
  - create and assign one weekly mission
  - send one instructor notification
  - create one writing assignment and one submission path
- Seed or guided demo data for the group-admin view so KPI screens are not structurally empty.
- Add "next required admin action" prompts when business tables are still empty.

Why second:

- Current production data cannot validate the main business thesis yet.

### Track 3: AI Cost Accounting Hardening

Goal:

- Move from estimated budgeting toward decision-grade cost visibility.

Needed work:

- Store provider-side response metadata where available.
- Split costs into:
  - estimated policy cost
  - provider-reported cost or token count
  - cache-hit avoided cost
  - audit cost
- Report monthly AI usage by:
  - action
  - plan
  - organization
  - cache hit vs generation

Why third:

- Live AI traffic is still tiny, so this is the right moment to instrument before scale arrives.

### Track 4: Data Model Hardening

Goal:

- Reduce future migration pain only where production evidence justifies it.

Needed work:

- Normalize the hot paths first:
  - learning plan to books
  - mission assignment to tracked words if mission adoption starts
  - residual `organization_name` dependencies in writing and admin analytics
- Keep cold paths denormalized until production use justifies migration cost.

Why fourth:

- Integrity is currently clean, so this is not the first fire.

## Baseline Metrics To Carry Into The Next Plan

- Total users: 21
- Active users, 30d by interaction events: 1
- Learners with history rows: 5
- Books touched by learners: 4
- Learning plans: 3
- AI usage events: 3
- Commercial requests: 0
- Weekly missions: 0
- Instructor notifications: 0
- Writing assignments: 0
- Word hint examples cached: 3
- Word hint images cached: 0

## Unknowns That Still Need Instrumentation

- Real cache hit ratio for example and image hints
- How often students tap hint generation but abandon before consumption
- Whether group admins open business screens and immediately leave
- Whether instructors ever reach notification or writing workflows
- Whether commercial-intent traffic exists but drops before submission
- Whether KPI snapshots are absent because jobs never ran or because preconditions were never met

## Planning Inputs To Gather Before Final Implementation Sequencing

- Browser session replay or lightweight clickstream for:
  - student dashboard to study start
  - study screen to hint generation
  - public info page to commercial request form
  - business admin overview to first operational action
- One manual end-to-end dogfood pass for:
  - student only
  - instructor
  - group admin
- One month of AI usage events after improved instrumentation

## Suggested Decision Gates

Use these gates before committing to large implementation tracks:

- If business workflow counts are still zero after guided dogfood:
  - prioritize activation UX before schema refactors
- If image generation remains near zero:
  - do not optimize image generation infrastructure yet
- If example generation grows but cache hit ratio stays low:
  - prioritize cache visibility and retrieval UX
- If learning plans grow but missions remain zero:
  - prioritize student-only plan execution before org mission tooling

## Immediate Next-Step Candidates

1. Add production analytics snapshots and event counters.
2. Add guided dogfood tasks for one demo organization.
3. Add AI cost telemetry fields and dashboard summaries.
4. Re-run the baseline after one week of instrumented traffic.

## 2026-04-26 Implementation Batch

### Critical Re-read

The product has enough B2B surface area to operate a demo organization, but the weak point is still activation, not feature count.

- Business admin already has cohort, assignment, mission, notification, writing, and KPI surfaces.
- Student writing already supports assignment, upload, feedback, and print flows.
- The remaining operational gap is that these surfaces do not yet behave like one continuous loop: admins need a clearer "next operational action", and students should notice newly issued or returned writing work without a manual reload.

### Chosen Scope

This batch should improve the existing loop instead of starting a new CRM/schema-heavy track:

1. Add a derived activation checklist/progress model for Business Admin so the overview can show the current setup step, progress percentage, and direct action targets.
2. Make student writing assignments revalidate on focus / visibility / short polling, with a manual refresh affordance.
3. Add client-side writing submission validation before upload so PDF/image mix, count, type, size, and empty selection failures are visible before the server request.

### Explicitly Deferred

- Commercial lead CRM fields, lead owner/SLA, and anonymous provisioning flow are valid next work, but they require migrations and admin workflow decisions.
- Atomic official catalog import and product event retention are correctness/ops tracks. They should not be mixed into this activation UX batch.
- Organization read-model projection remains important for scale, but current production usage does not justify changing mutation paths in this batch.

## Supporting Assets Added

- Baseline analysis memo: [`./analysis/production-baseline-2026-03-28.md`](./analysis/production-baseline-2026-03-28.md)
- Re-run query pack: [`../scripts/analysis/production-baseline.sql`](../scripts/analysis/production-baseline.sql)
- JSON report generator: [`../scripts/analysis/run-production-baseline.mjs`](../scripts/analysis/run-production-baseline.mjs)
