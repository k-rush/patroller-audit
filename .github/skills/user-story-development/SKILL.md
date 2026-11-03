---
name: user-story-development
description: Collaboratively discovers Patroller Audit ski-patrol persona journeys, acceptance criteria, and data-model/API impact; implementation and evidence capture require separate authorization.
---

# User story development

Start with one persona and one bounded end-to-end task. The current app is a
feature-free foundation, not a specification for patrol operations.
Potential patroller, dispatcher, supervisor, or resort-administrator personas
must be confirmed with the user; they are not implemented roles.
A story request defaults to documentation-only and does not authorize features,
schemas, deployment, commit, push, or PR publication.

## 1. Establish scope and evidence

- Use `git-worktree-workflow` for authorized repository changes, preserving
  unrelated work and running stacks.
- Read `README.md`, `docs\OPERATIONS.md`, and any existing relevant stories.
  Discover future data-model/API/status guides rather than assuming they exist.
  There are currently no domain collections or product endpoints to reuse.
- Treat conversation decisions as requirements evidence. Code, screenshots,
  buttons, and documentation show current behavior, not automatic user approval.
- Confirm persona, resort/area and permission context, trigger, starting state,
  goal, stopping point, and neighboring journeys. A resort tenancy model is a
  design question, not an existing invariant.
- Agree a journey inventory and first bounded story for a multi-persona request.
  Use `ask_user` when documentation versus implementation scope is ambiguous.

## 2. Discover expectations interactively

Use `ask_user` for small focused groups of questions, following the journey in
order. Do not repeat settled decisions or dump an exhaustive questionnaire.
Explain alternatives and consequences without treating suggestions as requirements.

| Topic | Decisions to settle |
|---|---|
| Entry/selection | Authentication, dispatch/deep-link/search entry, resource identity, immediate response |
| Configuration | Who assigns work, explicit versus inferred assignment, missing/disabled configuration |
| Permissions | View, start, record, correct, submit, reopen, and cross-area access |
| Evidence | Required fields, units, defaults, validation, notes, warnings versus rejection |
| Time/order | Occurrence versus entry time, timezone, backfill, future/out-of-order timestamps |
| Lifecycle | Draft, recorded, completed, unsuccessful, cancelled, closed, reopened; state versus outcome |
| Collaboration | Private/shared work, multiple devices, conflict scope, retained input, reconciliation |
| Recovery | Autosave, visible failures, lost responses, retries, navigation, explicit offline boundaries |
| Handoff | Review/submission, next actor, corrections, historical attribution and audit trail |

Do not invent medical protocols, incident severity thresholds, response-time
targets, resort rules, regulatory obligations, or supervisor disposition.
Keep software attestation separate from physical verification, rescue, or medical
assessment. Use fictional test data only; never include real victim, injury,
location-history, contact, or sensitive incident data.

Maintain confirmed expectations, provisional rules, open questions, excluded
scope, and dependencies. Record changed decisions as superseding prior decisions,
then reconcile affected criteria and documentation. Do not impose leases, ETags,
offline operation, or fixed process steps without approval.
One active work item per resource is distinct from one concurrent editor.

## 3. Assess model and contract impact, even for documentation-only stories

Perform a data-model impact assessment for every story. In this scaffold, record
that the domain model does not yet exist; propose required representation without
editing production schemas or code unless separately authorized.
Record "no change" only with an evidence-based reason.

Trace each criterion:

`user action -> command/query -> domain invariant -> persisted state -> read model/UI`

Assess:

- Entities, stable IDs, relationships/cardinality, assignments, and authoritative
  versus derived values. Do not hide a new business concept in an unrelated field.
- Lifecycle state versus outcome, completion versus success, handoffs, and any
  reservation or restriction semantics.
- Performer versus recorder; occurrence/completion time versus entry time.
  Preserve historical attribution, versions, definition snapshots, and audit history.
- Private versus shared records, resort/area ownership, tenancy, and server-side
  authorization. Client-supplied identities/timestamps are not trusted server facts.
- Aggregate boundaries, ETag scope, idempotency, partition keys, indexes, atomic
  writes, pagination, and conflict recovery. Analyze autosave and private saves
  racing with shared evidence writes, even for a single patroller.
- Existing-record compatibility if relevant: missing/null fields, approved
  defaults, schema versions, migration/backfill, and rollback compatibility.
  Never invent historical performers or outcomes to fill gaps.
- API DTOs, validation, frontend types/forms, repositories, exports, audit readers,
  and future fixtures/synthetics affected by the model.
- Required container/index provisioning and rollout order. Schema prerequisites
  must precede dependent builds; story approval is not rollout authorization.

Keep unresolved model decisions with the story. Return to the user for choices
introducing new behavior. A UI-only patch is not an end-to-end implementation.

## 4. Consolidate and obtain approval

Draft a complete journey and obtain a consolidated review before publishing it
as approved. A draft may remain local in the worktree, clearly marked **Draft**.
Use a focused `docs\<PERSONA>_<TASK>_USER_STORY.md` with:

1. Status, persona, goal, trigger, entry/exit conditions, safety boundary, scope.
2. Stable story/criterion IDs; ordered user action, system response, validation,
   persisted effect, and next state, with Given/When/Then where useful.
3. Permissions, attribution, lifecycle, concurrency, recovery, and handoffs.
4. Data-model/API impact, compatibility, migration, and rollout requirements.
5. Confirmed/superseded decisions, provisional rules, open-question IDs, related stories.
6. Current-flow comparison and separately labeled implementation evidence.

An approved baseline may contain open questions, but those parts are not
implementation-ready. Resolve blocking questions first. Do not silently expand
into supervisor, dispatcher, or onboarding work to finish a patroller journey;
agree the minimum dependent support with the user.

## 5. Implement only when authorized

Keep a traceability table:
`criterion ID | current behavior | gap | model/API/UI change | test/evidence`.
Distinguish expected, implemented, verified, provisional, and deferred behavior.
Make surgical end-to-end model, persistence, authorization, API, UI, and dependent
tooling changes; preserve approved behavior, existing records, and audit history.
Never claim unsaved input is saved or automatically overwrite conflicts.
Clarify new requirements exposed by a walkthrough instead of retroactively
inferring approval from the implementation.

Use `deployment-dev-loop` to discover owned stack names and ports. Do not restart
another worktree's service or inherit fixed ports/account/ticket values.
Future stateful acceptance requires authenticated API CRUD with real Cosmos DB
and Firebase Auth emulators, not direct database seeding or mocked acceptance
screens. Add only the necessary fixtures/endpoints as part of an approved feature.
Pure-client tests do not prove server authorization, persistence, or concurrency.

Cover relevant lifecycle transitions, collaboration conflicts, private-draft
recovery, exact retry identity, attribution, legacy records, and server validation.
Wait for actual save completion. Do not mask failures with arbitrary timeouts or
stale-write retries. No such product acceptance suite exists yet in the scaffold.

## 6. Capture evidence and hand off

When screenshots are requested, capture the actual verified implementation using
fictional API-created records and a repeatable browser scenario. Cover key
decision, failure/recovery, summary, and mobile states where applicable.
Do not use mockups as implementation evidence or expose credentials, tokens,
personal/medical data, or sensitive URLs.

Store requested images in `docs\images\<story-name>\` with descriptive names,
alt text, captions, and criterion IDs. Explain environment/capture commands,
inspect images, and verify links. Replace obsolete screenshots after approved
changes; label remaining gaps. Screenshots do not prove persistence,
authorization, concurrency safety, or physical/medical correctness.

Update the story and relevant discovered model/API/operations guides and README
links when maintained content changes. Do not create empty status/contract guides
just to satisfy a template. Run the smallest relevant tests and any existing
coverage gates; no measured coverage gate currently exists.
Use `pre-commit-review` before requested publication. Preserve a user-supplied
ticket only for its actual work; never inherit another story's ticket, process
steps, or concurrency rules. Commit, push, PR, and deployment need user authorization.

## Evaluations

```powershell
node .github\skills\user-story-development\evals\run.mjs
```

`--case=<id>` selects one scenario. Default evals test instruction coverage only.
`--live` requires explicit AI-credit authorization and never queries real services.
