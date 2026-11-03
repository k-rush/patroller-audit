# Operations

## Configuration contract

ASP.NET configuration uses `__` in environment variable names. Base settings are
in `backend\PatrollerAudit.Api\appsettings.json`; do not commit credentials.

| Setting | Cloud | Local Compose |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` | `Development` |
| `Auth__ProjectId` | Dedicated real Firebase project for the ring | `demo-patroller-audit-local` |
| `Auth__EmulatorEnabled`, `Emulator__Enabled` | `false` | `true` |
| `FIREBASE_AUTH_EMULATOR_HOST` | Unset | `firebase-auth-emulator:9099` |
| `CosmosDb__AccountEndpoint` | Azure Cosmos HTTPS endpoint | Unset |
| `CosmosDb__DatabaseName` | Dedicated ring database | `patroller-audit-local` |
| `CosmosDb__ConnectionString` | Forbidden; managed identity only | Public emulator connection string |
| `Emulator__CertificatePath` | Unset | Captured certificate volume |
| `AZURE_CLIENT_ID` | User-assigned app identity | Unset |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Supplied by Bicep | Unset |

Non-development startup fails without Firebase/Cosmos configuration and rejects
emulator settings or Cosmos account keys. Local certificate acquisition is
trust-on-first-use only inside the Compose network. Only the configured emulator
client trusts the captured certificate; global TLS validation is not disabled.
Cloud authentication validates Firebase JWT signatures, issuer, audience,
expiry, and subject. Local authentication uses Firebase Admin's actual emulator
verification. Future endpoints require authentication by default; authorization,
tenancy, and business access rules remain unimplemented.

`/health` checks process liveness without calling dependencies. `/api/health`
checks Cosmos database access and returns 503 when unavailable/unconfigured.
It does not claim that Firebase, user login, or product workflows have been
validated. Unknown `/api/*` routes return 404 instead of the SPA.

## One-time cloud bootstrap

No cloud resources or GitHub settings are changed by creating this scaffold.
Before running delivery workflows:

1. Create a **dedicated** Azure resource group and register the Container Apps,
   Cosmos, Container Registry, monitoring, and managed identity resource providers.
   Verify regional availability, spend, and naming before applying.
2. Create separate real Firebase projects for each approved ring and enable
   Firebase Authentication. Do not reuse another application's projects. Sign-in providers,
   authorized domains, UI configuration, and customer identity policies are
   deferred until authentication features are designed.
3. Create GitHub environments `infrastructure`, `build`, `test`, `staging`,
   `production`, and `test-monitor`. Restrict infrastructure, test, and monitoring
   to `main`. Allow build on `main` and promotion tags; allow staging on `main`
   and `staging-v*`, and production on `main` and `production-v*`. The main branch
   allowances support approved manual redeployments and rollbacks. Require
   reviewers for infrastructure and staging/production; disable self-approval
   where supported.
   Workflow `environment:` declarations alone do **not** configure these rules.
4. Configure Azure service principals with GitHub OIDC federation using the exact
   subject prefix returned by
   `gh api repos/k-rush/patroller-audit/actions/oidc/customization/sub`.
   This repository uses immutable subjects:
   `repo:<owner>@<owner-id>/<repo>@<repo-id>:environment:<environment>`.
   Append `:environment:<environment>` to `sub_claim_prefix`; do not substitute
   the legacy name-only subject. Use issuer
   `https://token.actions.githubusercontent.com` and audience
   `api://AzureADTokenExchange`. Monitoring needs no Azure identity. Grant the infrastructure
   principal only the resource-group rights needed to provision resources and
   assign roles. Grant the build principal AcrPush through the foundation. Grant
   deploy principals resource-group deployment/Container Apps rights and registry
   read access needed by deployment checks, plus read-only access to the preceding
   ring's app/revision metadata. Avoid subscription-wide ownership.
5. Set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` for each
   environment. Set `AZURE_RESOURCE_GROUP` and stable lowercase alphanumeric
   `NAME_PREFIX` (3-10 lowercase alphanumeric characters, beginning with a letter;
   example `patrolapp`) for infrastructure and
   ring environments. Set `BUILD_PRINCIPAL_ID` to the build principal's **object**
   ID in infrastructure. Set `ACR_NAME` and `ACR_LOGIN_SERVER` from foundation
   outputs for build and each ring. Set a distinct
   `FIREBASE_PROJECT_ID` for each ring.
6. Protect `main` using a branch ruleset requiring pull requests and the Verify
   jobs. Protect `staging-v*` and `production-v*` tag creation/update/deletion
   with tag rulesets. Enable Dependabot alerts and secret scanning where available.

GitHub repository settings and Firebase cloud projects need this administrative
bootstrap; they are not implicitly provisioned by the Azure templates.

## Provision, publish, deploy

Run **Provision infrastructure** on `main`, initially with rings `test` and
`apply=false`. Review Azure what-if before a separate approved `apply=true` run.
Always select a cumulative ring list when adding staging or production; retain
existing rings. Incremental ARM deployments do not delete omitted resources.
The example parameter file contains an intentionally invalid placeholder
principal ID and must be customized before direct CLI deployment.

The foundation provisions a shared registry/log workspace and separate Cosmos
accounts, databases, identities, telemetry instances, and Container Apps
environments per ring. No domain containers are created. App identities receive
read-only Cosmos data-plane access; expand only alongside approved features.
Cosmos currently has a public endpoint but rejects account-key authentication.
Private networking, alerts, retention/privacy policies, and a customer launch
review are required before real patrol data is accepted. Provisioned Cosmos
throughput and minimum app replicas incur cost even with no users.

After provisioning and setting environment variables, set repository variable
`ENABLE_TEST_DEPLOYMENT=true`. **Deploy test** listens for a successful Verify
run from a main push in this repository, builds that exact verified commit, locks
its registry tag against overwrite/deletion, and deploys test by digest. PR runs,
forks, failed CI, and reusable/manual Verify calls do not trigger publication.
Automatic publication stays disabled until explicitly enabled.

**Publish image** remains available on `main` for initial/manual publication; it
calls Verify and the same reusable **Build image** workflow. Existing locked
commit images are reused, not rebuilt. SBOM/provenance are included. Optionally
set `ENABLE_GITHUB_ATTESTATIONS=true` if repository/plan support permits attestations.
Manual **Deploy test** resolves the already-published current-main image and
never builds an unverified replacement.

Promote a verified release commit using matching version tags:

```powershell
git tag staging-v0.1.0 <verified-main-commit>
git push origin staging-v0.1.0
# After staging is accepted:
git tag production-v0.1.0 <same-verified-main-commit>
git push origin production-v0.1.0
```

**Promote release** requires the tagged commit to be merged into main. Production
requires the matching staging version tag on the same commit. Both resolve the
locked commit image without rebuilding and require that the preceding ring's
active, healthy revision actually serves that exact image, not merely that the
latest app template mentions it.

**Deploy ring** remains an approval-gated manual redeployment path. Supply both
the published commit SHA and its digest (SHA defaults to current main). It checks
main ancestry, verifies the commit-to-digest mapping, and applies the same
preceding-ring and deployment gates. It cannot invent an unpublished image.

| Workflow | Purpose |
|---|---|
| Verify | Backend/frontend/script tests, workflow lint, Bicep compilation, and real local emulator checks |
| Provision infrastructure | Manual Azure what-if/apply and applied registry output summary |
| Build image | Reusable immutable publication with OIDC, SBOM/provenance, and locked commit tags |
| Publish image | Manual verified publication |
| Deploy test | Opt-in automatic post-CI test delivery; manual existing-image retry |
| Promote release | Protected staging/production version-tag promotion |
| Deploy ring | Approved manual immutable redeployment |
| Rollback ring | Restore a retained known-good revision under target-ring approval |
| Monitor test | Opt-in scheduled read-only hosted checks |

There are deliberately no business-data seeding, compliance scanning, authenticated
write synthetics, or persona/browser workflow jobs while the app has no product features.

## Rollback and diagnostics

Normal deployment snapshots the previous serving revision before applying.
Multiple-revision mode routes to the latest ready revision. Gates confirm the
candidate revision and exact digest are serving, then check liveness, Cosmos
readiness, the packaged SPA/assets, and unknown-API 404 behavior. Failed gates
restore and check the previous healthy revision, then deactivate the failed
candidate. Successful deployments deactivate the previous revision to avoid
idle replica charges while retaining up to ten inactive revisions.

For an operator rollback, run **Rollback ring** on main with a retained
known-good revision name and reason. Target-ring reviewers approve the exception
to the preceding-ring promotion requirement. The workflow validates app/registry
ownership, activates and checks the target before routing traffic, then runs
read-only gates. If rollback gates fail, it restores original traffic. Deployment
and rollback state snapshots are retained as workflow artifacts for 14 days.
A failed first deployment has no prior revision to restore; its workflow reports
that explicitly. No data migrations exist yet.

Set `BASE_URL` in `test-monitor` to the test HTTPS root URL and repository variable
`ENABLE_TEST_MONITORING=true` to enable **Monitor test** every 30 minutes. Manual
monitoring can run before enabling the schedule. This job performs no writes and
needs no Azure/Firebase credentials. Workflow failures are operator-visible;
configure workflow notifications separately. It does not provision Azure alert
rules or validate real Firebase sign-in.

Use Container Apps revision logs and ring Application Insights for diagnostics.
For local failures, run `docker compose ps` and `docker compose logs --tail 100`.
Stop only this project's Compose stack; never prune shared Docker resources.

Local validation covers the shell, configuration boundaries, and real Cosmos
readiness, plus a rejected Firebase emulator sign-in without creating an account.
It does not substitute for deploying the templates into an approved Azure account
or accepting a real Firebase sign-in journey.

The Firebase SDK's gRPC dependency is overridden to a patched compatible release.
Development toolchains still include upstream minimatch advisories; do not expose
emulator, Vite, or test-runner ports publicly. Review Dependabot alerts before
customer deployment. Development dependencies are not shipped in the final app image.
