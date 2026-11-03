---
name: pre-commit-review
description: Reviews Patroller Audit diffs before authorized commits or PRs using the actual Verify jobs, focused tests, deployment safeguards, and documentation.
---

# Pre-commit review

Review the complete change before a requested commit/push or PR. Passing tests
does not establish scope or deployment safety. Do not publish without user
authorization. Report unresolved concerns and missing validation honestly;
include detailed command results when requested or needed to explain a blocker.

## 1. Establish the diff

```powershell
git status --short
git --no-pager diff
git --no-pager diff --staged
```

Read every changed file's diff, including new files. Compare the branch against
the intended merge base when reviewing committed branch changes. Flag unrelated
modified/untracked files; do not fold them into the commit.

Maintain documentation appropriate to product/API, architecture, infrastructure,
deployment, and operator changes. Current maintained guides are `README.md` and
`docs\OPERATIONS.md`. Discover any future story/contract/model guides before
referencing them. No docs-impact script, API-contract guide, or coverage regression
gate currently exists; do not invent paths or claim those checks passed.

## 2. Match the actual Verify workflow

`.github\workflows\verify.yml` has four jobs: backend, frontend, infrastructure,
and packaged-app. Use the smallest relevant command covering the change.

| Area | Existing checks |
|---|---|
| Backend | `dotnet restore backend\PatrollerAudit.slnx --locked-mode`; `dotnet format backend\PatrollerAudit.slnx --verify-no-changes --no-restore`; `dotnet test backend\PatrollerAudit.slnx -c Release --no-restore` |
| Frontend | In `frontend`: `npm run lint`, `npm run build`, `npm test` with targeted test selectors when appropriate |
| Scripts | `$tests = (Get-ChildItem scripts\tests\*.test.mjs).FullName`; `node --test $tests` |
| Bicep | `az bicep build --file infrastructure\main.bicep --stdout` and the same for `app.bicep` |
| Workflows/actions | The actionlint container command pinned in Verify; inspect reusable-workflow permissions and expressions |
| Local stack/launchers/Docker | `.\scripts\Start-Local.ps1` and `.\scripts\Test-Local.ps1` on an owned/isolated stack |
| Skills | Relevant `.github\skills\<skill>\evals\run.mjs` and `scripts\tests\skill-evals.test.mjs` |

Install/restore dependencies only when manifests changed or required dependencies
are missing. Expand testing only when new changes, failures, or unresolved concerns
justify it. Windows Node commands need expanded file lists rather than literal
wildcards. Use Node 26 (or >=24.12) for the frontend.

There is no hosted browser suite, authenticated CRUD fixture launcher, measured
coverage baseline, or mandatory numeric coverage threshold in this scaffold.
Do not import another application's thresholds or fabricate a coverage delta.
Follow any future coverage gates only after they actually exist.

## 3. Review correctness and boundaries

- **Correctness/scope:** Does every change satisfy the requested behavior without
  unrelated edits, debug leftovers, or hidden incomplete work?
- **Conventions:** Stateful acceptance must use real Cosmos DB and Firebase Auth
  emulators; never replace it with in-memory storage or direct database seeding.
  Pure unit tests and injected Azure/HTTP command adapters are valid for bounded
  policy/transport behavior, but are not proof of cloud persistence or authorization.
- **Feature boundary:** The app is feature-free. Do not introduce patrol workflows,
  roles, domain collections, seeded accounts, or operational claims without approval.
- **Sensitive data:** No credentials, tokens, private keys, real injury/incident
  data, or personal information. Microsoft's documented public emulator key is not
  a cloud credential; do not replace managed identity with real account keys.
- **Configuration:** Production must reject emulator settings and cloud startup
  must require valid Firebase/Cosmos configuration.
- **Documentation:** Update README/operations when behavior or commands change;
  use an existing future story/model/API guide only after discovering it.
- **Workflows/IaC:** Read line-by-line for ring-gating, permission, concurrency,
  immutable commit/digest mapping, protected-tag ancestry, exact OIDC subjects,
  preceding-ring serving checks, and rollback safety. Review production deployment
  safety even when only test is provisioned.

Review the actual active/healthy 100%-traffic revision, not just the latest template.
Do not skip CI/reviewer gates, weaken tests, or mutate live resources to make a
review pass. If a required check cannot run, state what is missing and get a
decision before an otherwise unsafe publication.

## 4. Stage only reviewed work

```powershell
git add <specific-reviewed-paths>
git diff --cached --check
git commit -m "<summary>"
```

Never use `git add .` or `git add -A` when unrelated files are present.
Include the required repository/session commit trailers supplied by the current
assistant environment; do not copy another session's identifiers.
A pre-commit review does not itself authorize commit, push, PR publication, or deployment.

## Evaluations

```powershell
node .github\skills\pre-commit-review\evals\run.mjs
```

Use `--case=<id>` for a scenario. `--live` requires explicit AI-credit authorization.
Default evals check the instruction contract, not application correctness or coverage.
