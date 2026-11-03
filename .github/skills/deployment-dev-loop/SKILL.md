---
name: deployment-dev-loop
description: Runs the Patroller Audit local edit/verify loop and guides verified test delivery, immutable staging/production promotion, status checks, and retained-revision recovery.
---

# Deployment dev loop

Use local Docker iteration before cloud changes. It is far faster and needs no
Azure access. Read `README.md`, `docs\OPERATIONS.md`, `compose.yaml`, and the
relevant workflows before choosing commands. Discover names, environment
variables, and deployment outputs rather than inventing resource values.
The app has no patrol features, business records, login screen, or seeded users.

## 1. Fast local iteration

With Docker Desktop's Linux engine and PowerShell 7:

```powershell
docker info
.\scripts\Start-Local.ps1
.\scripts\Test-Local.ps1
```

The stack runs `app`, `cosmos-emulator`, `cosmos-certificate`, and
`firebase-auth-emulator`. Default origin is `http://127.0.0.1:18080`.
`Start-Local.ps1` waits for Cosmos-backed API readiness; `Test-Local.ps1` checks
the packaged SPA/assets, health endpoints, API 404 behavior, and rejected Firebase
sign-in without creating an account. Only an empty local database is bootstrapped.
No authenticated CRUD fixtures, identity ledger, or browser acceptance suite exist yet.

For an owned stack, rebuild changed images without deleting data:

```powershell
.\scripts\Start-Local.ps1
```

Stop only the selected owned project when necessary with `docker compose down`;
keep named data volumes and never add `-v`. Do not stop another worktree's stack
or reset shared Docker state. The launcher has only `-Port`; do not invent
`-NoBuild`, `-ProjectName`, or a `dev-web` Compose profile.

For frontend hot reload against the already-running API, use Node 26 (or >=24.12):

```powershell
Set-Location frontend
$env:API_PROXY_TARGET = 'http://127.0.0.1:18080'
npm run dev
```

Use the Vite origin reported by that command. Install dependencies only when
required/missing. The packaged SPA does not hot-reload; rebuild it to verify the
actual shipped image. Preserve the proxy target in the same command/session.

For a second isolated worktree stack, set `COMPOSE_PROJECT_NAME` and all five
published port variables to unused values, then pass the matching `-Port`.
Carry those settings into every startup, test, log, and cleanup invocation.
Changing only the API port does not isolate emulator ports or data volumes.
See `git-worktree-workflow` for a complete example.

Diagnose with `docker compose ps` and
`docker compose logs --tail 100 app cosmos-emulator firebase-auth-emulator`.
Never bypass readiness or replace real emulator acceptance with an in-memory store.
Run the smallest relevant local checks and `pre-commit-review` before an authorized
commit/push. Do not push to main just to test a small change.

## 2. Verified three-ring delivery

Read `.github\workflows\verify.yml`, `build-image.yml`, `deploy-test.yml`,
`publish-image.yml`, `promote.yml`, `deploy.yml`, and `rollback.yml`, plus
`.github\actions\deploy-ring\action.yml` and `scripts\deployment.mjs`.

- **test:** `Deploy test` automatically publishes/deploys a successful main push
  when `ENABLE_TEST_DEPLOYMENT=true`. Failed CI, PRs, and forks do not publish.
  Manual `Deploy test` resolves the already-published current-main image.
- **staging:** `staging-vX.Y.Z` must point to a commit already merged into main.
  `scripts\release-policy.mjs` validates the tag; test must currently serve the
  same healthy immutable image.
- **production:** `production-vX.Y.Z` must point to the same commit as the matching
  staging version tag. Staging must be verified serving that image.

Only provisioned/approved rings may be targeted; the topology does not mean
staging or production exist. Tags, pushes, deployments, provisioning, and
incurring cloud charges require user authorization.

```powershell
git fetch origin main --tags
$release = '<verified-main-commit-sha>'
git merge-base --is-ancestor $release origin/main
git tag staging-v1.4.0 $release
git push origin staging-v1.4.0
# Only after staging gates pass and production promotion is authorized:
git tag production-v1.4.0 $release
git push origin production-v1.4.0
```

Never retag releases or rebuild an image between rings. The shared image workflow
locks commit tags; promotions resolve the same digest.
`Deploy ring` is a protected manual redeployment path checking main ancestry,
commit/digest mapping, and preceding-ring health. It is not an unverified shortcut.

## 3. Read-only status and health

```powershell
gh run list --repo k-rush/patroller-audit --workflow deploy-test.yml --limit 5
gh run view $RunId --repo k-rush/patroller-audit
$env:BASE_URL = '<verified-https-root-url>'
node scripts\smoke.mjs
```

List/inspect `Verify`, `Deploy test`, `Promote release`, and `Monitor test` runs.
Read failing job logs before any rerun. Discover Azure resource values from the
correct environment and foundation outputs. With authorized Azure access,
inspect Container App ingress traffic and its revision metadata. Require one
active, healthy revision at 100% traffic and compare its image with the locked
commit digest. When traffic uses `latestRevision`, resolve latestReadyRevisionName;
latestRevisionName can refer to an unready deployment.

`smoke.mjs` is read-only: liveness, Cosmos readiness, packaged SPA/JavaScript,
and unknown-API 404 behavior. It does not validate Firebase sign-in or patrol
workflows. `Monitor test` is opt-in via `ENABLE_TEST_MONITORING` and `test-monitor`
`BASE_URL`; it does not provision Azure alert rules or authenticated synthetics.

## 4. Investigate and recover

1. Read the failing job's logs first. Reproduce application failures against the
   local Docker stack before touching any cloud ring. Do not rerun blind.
2. Use `azure-observability-investigator` for evidence-backed telemetry correlation.
   Investigate a fired alert as a potential promotion blocker; do not silence it.
   No operational-alert gate is currently implemented, so do not claim one ran.
3. Locate the exact run/ring artifact `artifacts\deployment-state.json`.
   `scripts\deployment.mjs` snapshots the previous serving revision before apply.
   Failed deployment gates restore/check that revision and deactivate the
   candidate; a failed first deployment has no previous revision to restore.
4. For an authorized manual recovery, run the protected `Rollback ring` workflow
   with the retained known-good revision and an operator reason. It checks app/
   registry ownership and health, and bypasses the normal predecessor promotion
   requirement only as an explicitly approved recovery action.
5. Recheck `smoke.mjs` and actual serving traffic. A workflow conclusion alone
   does not establish that rollback restored the expected image.

Never delete or restore Cosmos data during revision rollback. Do not guess a
snapshot or revision. Azure configuration, managed-identity access, and exact
immutable GitHub OIDC subjects are documented in `docs\OPERATIONS.md`.
Do not deploy directly from a laptop to bypass CI, staging gates, or reviewers.
Resource mutation and rollback require authorization even when read-only status
inspection is permitted.

## Evaluations

```powershell
node .github\skills\deployment-dev-loop\evals\run.mjs
```

Use `--case=<id>` for one scenario. Default checks are deterministic instruction
coverage. `--live` is opt-in AI-credit use with no tools or live-service access.
