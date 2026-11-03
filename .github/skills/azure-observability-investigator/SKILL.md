---
name: azure-observability-investigator
description: Investigates Patroller Audit errors, alerts, latency, deployment failures, and GitHub issues using read-only Azure telemetry and deployment evidence.
---

# Azure observability investigator

Produce an evidence-based, read-only triage report. Start from an Azure Common
Alert Schema payload, alert ID/rule, GitHub issue, failed workflow, or recent-error
request. Do not change resources, alerts, traffic, revisions, data, or issues
without explicit user authorization.

Never print connection strings, tokens, authorization headers, user IDs, resort
identifiers, incident notes, medical information, or sensitive record contents.
Aggregate first; retrieve bounded sanitized samples only when necessary.
The current application is a feature-free foundation, not an operational patrol
system. Do not assume domain endpoints, customer records, or production exist.

## 1. Establish the investigation

- **Alert-driven:** Parse rule, fired/resolved condition, severity, signal,
  affected resource IDs, dimensions, UTC fired time, and search interval.
  Query at least 15 minutes before and after the alert window.
- **Issue-driven:** Read the specified issue. Otherwise list open issues in
  `k-rush/patroller-audit`, prioritizing `bug`, `incident`, `reliability`, and
  `performance` labels and recently updated failure reports. Translate each
  hypothesis into testable telemetry questions; an issue is not proof of cause.
- **Exploratory:** Compare the last 24 hours with the preceding 24 hours.
  Quantify new/increasing failures; ask for a ring only if configuration and
  the prompt do not identify it.

Prefer authenticated `gh issue view`, `gh issue list`, and `gh run view` over
HTML scraping. Do not create, close, label, or comment on issues without explicit
permission. Do not claim to have read live issues when no query was performed.

## 2. Discover resources, rather than guessing

Read these existing configuration sources:

- `.github\workflows\provision-infrastructure.yml`, `deploy-test.yml`,
  `promote.yml`, `monitor-test.yml`, and `.github\actions\deploy-ring\action.yml`.
- `infrastructure\main.bicep`, `infrastructure\app.bicep`,
  `infrastructure\modules\ring-foundation.bicep`, and `docs\OPERATIONS.md`.
- `backend\PatrollerAudit.Api\Program.cs` for telemetry registration and
  `scripts\deployment.mjs` for serving-revision and rollback checks.

Workflow variable names are not their values. Discover values from the correct
GitHub environment, then verify live deployment outputs and tagged resources:

```powershell
gh variable list --repo k-rush/patroller-audit --env test
az account show --query '{id:id,tenantId:tenantId}' --output json
az deployment group show --resource-group $ResourceGroup `
  --name "$NamePrefix-foundation" --query properties.outputs --output json
az resource list --resource-group $ResourceGroup `
  --query '[].{name:name,type:type,id:id,tags:tags}' --output json
```

If the deployment name is unknown, list deployments narrowly in the configured
resource group. Do not select the first workspace or an unrelated partial-name
match. The templates currently define:

| Resource | Naming rule to verify |
|---|---|
| Log Analytics workspace | `<namePrefix>-logs` |
| Ring Application Insights | `<namePrefix>-<ring>-insights` |
| Container App | `<namePrefix>-<ring>` |
| OTEL service / expected AppRoleName | `patroller-audit-<ring>`; verify actual telemetry |
| Cosmos account | `<namePrefix>-<ring>-<unique suffix>` |
| Database | `<namePrefix>-<ring>` |

The Container App name is not necessarily its AppRoleName. Cosmos accounts are
isolated per ring, not shared across rings. Verify which rings are provisioned;
test -> staging -> production is a rollout topology, not a live-resource claim.

There is no maintained monitoring Bicep module, authored availability web test,
authenticated journey synthetic, or operational-alert gate in this foundation.
`Monitor test` performs read-only GitHub checks and does not publish
AppAvailabilityResults. Inspect actual Azure alert rules before assuming any exist,
including service-created rules.

## 3. Query bounded evidence

Resolve the workspace customer ID, not its ARM resource ID:

```powershell
$WorkspaceId = az monitor log-analytics workspace show `
  --resource-group $ResourceGroup --workspace-name $WorkspaceName `
  --query customerId --output tsv
az monitor log-analytics query --workspace $WorkspaceId `
  --analytics-query $Query --timespan $Timespan --output json
```

Use the [KQL playbook](references/kql.md). First verify table presence and column
schemas; adapt to legacy `requests`, `exceptions`, `dependencies`, `traces`, or
`availabilityResults` only when observed. Keep the CLI timespan and query windows
bounded, including the equal preceding baseline. Missing tables, sampling,
instrumentation, retention, and wrong-ring selection are evidence gaps.

Investigate in order:

1. Quantify impact by ring, operation, result code, exception type, and time bucket.
2. Compare with an equal baseline and identify the first significant deviation.
3. Correlate AppRequests, AppExceptions, AppDependencies, AppTraces, and container
   logs with OperationId or the narrowest available trace/span field.
4. Check Cosmos 429s, dependency failures, and p95 duration before blaming code.
5. Compare releases, actual serving revisions, workflow failures, commits, and
   issue timestamps. Do not equate latestRevisionName with the serving revision.
6. Inspect the failing code path only after telemetry narrows the operation.

For an alert ID, retrieve its bounded details first:

```powershell
az rest --method get --url "https://management.azure.com${AlertId}?api-version=2019-03-01"
az monitor metrics alert list --resource-group $ResourceGroup --output json
az monitor scheduled-query list --resource-group $ResourceGroup --output json
```

Follow alert pagination only on HTTPS `management.azure.com`, capped at five
pages. Fired/resolved state alone does not establish current health.

## 4. Report the evidence

Lead with assessment and confidence, separating evidence from hypotheses.

| Field | Required content |
|---|---|
| Scope | Ring/app role, verified resource group, UTC interval, alert/issue |
| Impact | Failure count/rate, operations, duration, current occurrence |
| Pattern | First deviation, dominant failure, equal-baseline comparison |
| Correlation | Serving revision, workflow, release, and GitHub issue relationships |
| Likely cause | Causal evidence versus unproven hypothesis |
| Next action | Smallest safe investigation or proposed mitigation |
| Evidence gaps | Missing authentication, permissions, configuration, or telemetry |

Classify issue correlations as confirmed, supported, not supported, or unknown.
Include exact KQL with sensitive values and correlation identifiers redacted.
Say "no matching telemetry in the queried interval," not "the bug did not occur."
If authentication or resource-group configuration is missing, report the gap and
repository-derived hypotheses; do not claim live health or a definite root cause.

## Evaluations

```powershell
node .github\skills\azure-observability-investigator\evals\run.mjs
```

`--case=<id>` selects a scenario. Default evals check instruction coverage only.
`--live` requires explicit authorization for AI-credit use; it supplies the skill
text to a tool-disabled CLI session and evaluates proposed behavior, not live health.
