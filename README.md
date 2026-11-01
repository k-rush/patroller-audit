# Patroller Audit

Feature-free ski patrol application foundation using ASP.NET Core 10 and
React/TypeScript, with dedicated Firebase projects, Cosmos accounts, and Azure
Container Apps resources.

The only UI is a placeholder page. The only API routes are operational health
checks. No patrol workflows, incident forms, roles, domain collections, business
records, demo accounts, or login screens have been implemented.

## Local development

Use Docker Desktop's Linux engine and PowerShell 7:

```powershell
.\scripts\Start-Local.ps1
.\scripts\Test-Local.ps1
```

Open **http://127.0.0.1:18080**. Local Cosmos DB and Firebase Auth use real
emulators, isolated Compose resources, and persistent named volumes. Ports are
chosen to avoid common development defaults. Override ports in an untracked `.env` file
or use `Start-Local.ps1 -Port 18090`. No identities or business data are seeded.
The local readiness check creates only an empty database.

Stop this stack without deleting data:

```powershell
docker compose down
```

For faster UI iteration, use Node 22 and .NET SDK 10:

```powershell
dotnet run --project backend\PatrollerAudit.Api
# In a second terminal:
Set-Location frontend
npm ci
npm run dev
```

Vite proxies API requests to port 8080. Without cloud/emulator configuration,
development `/health` returns 200 and `/api/health` returns 503; there is no
in-memory storage fallback. The Docker image packages the SPA into the API
container. Firebase client initialization is available as a foundation helper;
it is deliberately not invoked by the placeholder UI.

## Checks

```powershell
dotnet restore backend\PatrollerAudit.slnx --locked-mode
dotnet format backend\PatrollerAudit.slnx --verify-no-changes --no-restore
dotnet test backend\PatrollerAudit.slnx -c Release --no-restore
Set-Location frontend
npm ci
npm run lint
npm run build
npm test
```

The Verify workflow runs these checks, compiles Bicep, and boots the packaged app
against the real local emulators. Dependency lockfiles are committed inputs.

## Delivery and configuration

See [operations](docs/OPERATIONS.md) for Azure OIDC/GitHub environment setup,
infrastructure previews, immutable image publication, promotion, and rollback.
Cloud deployment is **manual and approval-gated**, not triggered by checkout or
a push. Configure GitHub environment protections before enabling workflows.

`infrastructure\main.bicep` defines the registry, telemetry, and isolated ring
foundations. `infrastructure\app.bicep` deploys an immutable image with managed
identity and startup/liveness/readiness probes. The initial cloud ring is test;
later approved rings are exactly **test -> staging -> production**.

This scaffold is not an operational patrol system and must not be used to
record real incidents or sensitive information.
