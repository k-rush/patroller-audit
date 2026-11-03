# Bounded telemetry playbook

These are read-only query templates, not evidence that telemetry was queried.
Verify the workspace, table schemas, UTC window, and actual AppRoleName first.
The expected test role is `patroller-audit-test`, not the Container App name.
Pass a bounded CLI `--timespan` encompassing both incident and baseline windows.
Use verified operation names, never URLs with record IDs, query strings, or tokens.
Counts below describe observed telemetry; account for sampling before interpreting
them as total requests. Missing tables or rows do not establish health.

## Table and schema discovery

Run only against the verified workspace. `isfuzzy=true` permits missing tables
when at least one source resolves; it does not suppress authentication failures.
If no table resolves, report the instrumentation/access gap.

```kusto
union isfuzzy=true withsource=Table AppRequests, AppExceptions, AppDependencies,
    AppTraces, ContainerAppConsoleLogs_CL, ContainerAppSystemLogs_CL
| where TimeGenerated >= ago(24h)
| summarize Rows=count(), FirstSeen=min(TimeGenerated), LastSeen=max(TimeGenerated) by Table
```

Inspect each observed table with `AppRequests | getschema` (substitute the
verified table). Legacy tables use different names and columns; do not simply
reuse these workspace-based queries. Do not dump raw messages during discovery.

## Request impact and latency

```kusto
let start = datetime(2026-10-31T17:50:00Z);
let end = datetime(2026-10-31T18:20:00Z);
let role = "patroller-audit-test";
AppRequests
| where TimeGenerated between (start .. end)
| where AppRoleName == role
| summarize Requests=count(), Failures=countif(Success == false),
    P95Ms=percentile(DurationMs, 95) by OperationName, ResultCode, bin(TimeGenerated, 5m)
| extend FailureRate=100.0 * Failures / Requests
| order by TimeGenerated asc, Failures desc
```

## Equal preceding baseline

```kusto
let start = datetime(2026-10-31T17:50:00Z);
let end = datetime(2026-10-31T18:20:00Z);
let baselineStart = start - (end - start);
let role = "patroller-audit-test";
AppRequests
| where TimeGenerated >= baselineStart and TimeGenerated <= end
| where AppRoleName == role
| extend Window=iff(TimeGenerated < start, "baseline", "incident")
| summarize Requests=count(), Failures=countif(Success == false),
    P95Ms=percentile(DurationMs, 95) by Window, OperationName
| extend FailureRate=100.0 * Failures / Requests
| order by OperationName asc, Window asc
```

## Exception types, without raw messages

```kusto
AppExceptions
| where TimeGenerated between (datetime(2026-10-31T17:50:00Z) .. datetime(2026-10-31T18:20:00Z))
| where AppRoleName == "patroller-audit-test"
| summarize Exceptions=count(), FirstSeen=min(TimeGenerated), LastSeen=max(TimeGenerated)
    by ExceptionType, OperationName
| top 20 by Exceptions desc
```

Do not project `Message`, `OuterMessage`, `InnermostMessage`, or exception details.
Use exception type and result code in redacted reports.

## Dependency failures and Cosmos latency/throttling

```kusto
AppDependencies
| where TimeGenerated between (datetime(2026-10-31T17:50:00Z) .. datetime(2026-10-31T18:20:00Z))
| where AppRoleName == "patroller-audit-test"
| summarize Calls=count(), Failures=countif(Success == false),
    Throttled=countif(ResultCode == "429"), P95Ms=percentile(DurationMs, 95)
    by DependencyType, ResultCode, bin(TimeGenerated, 5m)
| order by TimeGenerated asc
```

Identify the actual Cosmos dependency type from observed schema/metadata before
adding a filter. Do not assume every 429 is Cosmos. Compare Cosmos metrics and
configured throughput with request latency and release timing before proposing
a capacity change. Never retrieve database keys or incident documents for triage.

## Narrow OperationId correlation

Substitute a locally verified correlation ID; redact it in published reports.
This deliberately omits request URLs, dependency data, and trace messages.

```kusto
let operationId = "<verified-operation-id>";
union isfuzzy=true withsource=Table AppRequests, AppExceptions, AppDependencies, AppTraces
| where TimeGenerated between (datetime(2026-10-31T17:50:00Z) .. datetime(2026-10-31T18:20:00Z))
| where AppRoleName == "patroller-audit-test" and OperationId == operationId
| project TimeGenerated, Table, OperationName,
    ResultCode=column_ifexists("ResultCode", ""),
    ExceptionType=column_ifexists("ExceptionType", ""),
    DurationMs=column_ifexists("DurationMs", real(null)),
    SeverityLevel=column_ifexists("SeverityLevel", int(null))
| order by TimeGenerated asc
| take 100
```

## Trace severity

```kusto
AppTraces
| where TimeGenerated between (datetime(2026-10-31T17:50:00Z) .. datetime(2026-10-31T18:20:00Z))
| where AppRoleName == "patroller-audit-test"
| summarize Traces=count() by SeverityLevel, bin(TimeGenerated, 5m)
| order by TimeGenerated asc
```

If message inspection becomes necessary, first justify it and sanitize a narrow
sample locally. Never paste raw trace contents or custom property bags into issues.

## Container startup and system-event counts

Verify these column names using `getschema`; exporter schemas may differ.
Console rows count activity, not errors or successful readiness.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-10-31T17:50:00Z) .. datetime(2026-10-31T18:20:00Z))
| where ContainerAppName_s == "patrolapp-test"
| summarize Rows=count() by RevisionName_s, bin(TimeGenerated, 5m)
| order by TimeGenerated asc
```

```kusto
ContainerAppSystemLogs_CL
| where TimeGenerated between (datetime(2026-10-31T17:50:00Z) .. datetime(2026-10-31T18:20:00Z))
| where ContainerAppName_s == "patrolapp-test"
| summarize Events=count() by RevisionName_s, Type_s, bin(TimeGenerated, 5m)
| order by TimeGenerated asc
```

Discover the configured Container App name rather than inheriting these example
values for another ring/prefix. Correlate revisions with deployment-state artifacts,
workflow timestamps, and verified serving traffic; a latest revision may be unready.

## Availability results: optional, only if actually provisioned

`Monitor test` runs GitHub HTTP checks and does not publish AppAvailabilityResults.
There is no authored availability web test or authenticated journey synthetic.
Do not interpret an absent availability table as a passing or failing monitor.
If separately provisioned telemetry exists, verify its resource and test name:

```kusto
AppAvailabilityResults
| where TimeGenerated between (datetime(2026-10-31T17:50:00Z) .. datetime(2026-10-31T18:20:00Z))
| where Name == "<verified-test-name>"
| summarize Runs=count(), Failures=countif(Success == false),
    P95Ms=percentile(DurationMs, 95) by Location, bin(TimeGenerated, 5m)
| order by TimeGenerated asc
```

Do not assume an availability exporter uses the application's AppRoleName.
Use the actual GitHub monitor run/logs for current foundation checks.
