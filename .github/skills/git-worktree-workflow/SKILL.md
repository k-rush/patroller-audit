---
name: git-worktree-workflow
description: Creates and cleans up isolated Patroller Audit branches/worktrees while preserving unrelated edits, build output, and running local stacks.
---

# Git worktree workflow

Use a separate branch/worktree for a new unit of work unless the user explicitly
chooses the current clean checkout. Avoid direct edits on main by default.
Never commit, stash, or discard unrelated uncommitted changes on the user's behalf.

## Inspect and create

```powershell
git worktree list
git status --short
git fetch origin main --quiet
$branch = 'fix/example-change'
$worktree = '..\patroller-audit-fix-example-change'
git worktree add $worktree -b $branch origin/main
```

Choose `feat/`, `fix/`, or `chore/` followed by a kebab-case summary; these are
recommendations, not a claim about existing branch history. Use an unused sibling
directory outside the primary clone, named `patroller-audit-<branch-with-hyphens>`.
Never nest the new worktree inside the primary clone.
For an existing branch, omit `-b` and use the intended branch instead of origin/main.
Do not reuse an existing worktree/path without checking its owner, branch, and state.

Each checkout has its own frontend node_modules, backend obj/bin, and test output.
Use `npm ci` in frontend and `dotnet restore backend\PatrollerAudit.slnx` when
dependencies are required/missing. NuGet's global package cache may be shared;
per-worktree build/restore artifacts must not be shared or overwritten.

## Preserve running stacks

Compose project names, host ports, and named volumes are machine-wide, not
worktree-local. The default project is `patroller-audit-local` and API port 18080.
Do not run both local stacks at the same time with the same project/ports.
Do not stop a primary or unrelated stack simply to start a new worktree.

Either reuse the existing owned service for read-only checks, obtain permission
to stop it, or choose a fully isolated project and unused published ports:

```powershell
$env:COMPOSE_PROJECT_NAME = 'patroller-audit-fix-example-change'
$env:API_PORT = '28080'
$env:COSMOS_PORT = '28081'
$env:COSMOS_HEALTH_PORT = '28082'
$env:FIREBASE_AUTH_PORT = '29099'
$env:FIREBASE_UI_PORT = '24000'
.\scripts\Start-Local.ps1 -Port 28080
.\scripts\Test-Local.ps1 -Port 28080
```

Verify ports are unused first. Preserve all settings in every command/tool call;
fresh tool processes do not retain a previous process's environment variables.
`Start-Local.ps1` has no `-ProjectName` flag. COMPOSE_PROJECT_NAME separates
containers and volumes; a different API port alone is insufficient.
Cleanup uses only the exact owned Compose project:

```powershell
docker compose -p patroller-audit-fix-example-change down
```

Keep volumes; never use `down -v`, global pruning, or broad process termination.

## Work and publish

Keep one logical change per branch. Leave unrelated work untouched; ask before
expanding scope. Commit only reviewed paths, and use `pre-commit-review` before
an authorized commit, push, or PR. Never force-push or reset another branch.
Worktree creation is not permission to commit, publish, or deploy.

## Cleanup after merge

Check clean status, retained/unpushed commits, branch ownership, and that the
change merged (or the user confirms it may be discarded). Squash merges may
require checking the PR rather than relying only on ancestry. Then:

```powershell
git worktree remove $worktree
git branch -d $branch
git worktree prune
```

Stop only the associated owned stack when authorized. Never force delete without
checking for unpushed work. If normal branch deletion refuses after a squash merge,
ask before forced deletion. `git worktree remove --force` also requires explicit
confirmation that no work should be retained. Do not recursively delete the
repository/worktree directory as a substitute for Git's cleanup commands.

## Evaluations

```powershell
node .github\skills\git-worktree-workflow\evals\run.mjs
```

`--case=<id>` selects a scenario. `--live` is opt-in and requires authorization
for AI-credit use; default checks do not create worktrees or touch services.
