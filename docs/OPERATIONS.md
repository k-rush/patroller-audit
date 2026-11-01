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
3. Create GitHub environments `infrastructure`, `build`, `test`, `staging`, and
   `production`. Restrict them to `main`; require reviewers for infrastructure
   changes and staging/production, disable self-approval where supported.
   Workflow `environment:` declarations alone do **not** configure these rules.
4. Configure Azure service principals with GitHub OIDC federation using subjects
   `repo:k-rush/patroller-audit:environment:<environment>`. Grant the infrastructure
   principal only the resource-group rights needed to provision resources and
   assign roles. Grant the build principal AcrPush through the foundation. Grant
   deploy principals resource-group deployment/Container Apps rights and registry
   read access needed by deployment checks. Avoid subscription-wide ownership.
5. Set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` for each
   environment. Set `AZURE_RESOURCE_GROUP` and stable lowercase alphanumeric
   `NAME_PREFIX` (3-10 characters, example `patrolapp`) for infrastructure and
   ring environments. Set `BUILD_PRINCIPAL_ID` to the build principal's **object**
   ID in infrastructure. Set `ACR_NAME` and `ACR_LOGIN_SERVER` from foundation
   outputs for build, and `ACR_NAME` for each ring. Set a distinct
   `FIREBASE_PROJECT_ID` for each ring.
6. Protect `main` using a branch ruleset requiring pull requests and the Verify
   jobs. Enable Dependabot alerts and secret scanning where available.

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

Run **Publish image** on `main`. It first calls Verify, then builds and publishes
`patroller-audit:<commit-sha>` with SBOM/provenance. Copy the resulting immutable
`sha256:...` digest from the workflow summary.

Run **Deploy ring** with that digest, starting at test. It validates registry
existence and checks health after deployment. Staging and production additionally
require that the exact digest is currently deployed and healthy in the preceding
ring. Environment reviewers must confirm the digest comes from a successful
Publish image run; registry existence alone is not provenance verification.
Promotion does not rebuild the image.

## Rollback and diagnostics

Redeploy a prior known-good digest with Deploy ring. For staging/production, the
preceding ring must first be restored to the same digest. This is an explicit
operator rollback, not automatic recovery; single-revision mode switches traffic
once Azure considers the new revision ready. No data migrations exist yet.

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
