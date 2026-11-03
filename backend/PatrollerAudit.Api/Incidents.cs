using System.Net;
using System.Security.Claims;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Newtonsoft.Json;
using PatrollerAudit.Api.Infrastructure;

namespace PatrollerAudit.Api;

public sealed record CreateIncident(Guid Id, double Latitude, double Longitude);

public sealed record Incident(
    [property: JsonProperty("id")] string Id,
    [property: JsonProperty("resortId")] string ResortId,
    [property: JsonProperty("latitude")] double Latitude,
    [property: JsonProperty("longitude")] double Longitude,
    [property: JsonProperty("createdAt")] DateTimeOffset CreatedAt,
    [property: JsonProperty("createdBy")] string CreatedBy,
    [property: JsonProperty("schemaVersion")] int SchemaVersion = 1);

public static class Incidents
{
    public const string ResortId = "summit-west";

    public static void MapIncidents(this WebApplication app)
    {
        var group = app.MapGroup("/api/incidents").RequireAuthorization("SummitWestDispatcher");
        group.AddEndpointFilter(async (context, next) =>
        {
            var storage = context.HttpContext.RequestServices.GetRequiredService<CosmosReadiness>();
            var health = await storage.CheckHealthAsync(new HealthCheckContext(), context.HttpContext.RequestAborted);
            return health.Status == HealthStatus.Healthy
                ? await next(context)
                : Results.Problem(statusCode: 503, title: "Incident storage is unavailable.");
        });
        group.MapPost("/", async (CreateIncident input, ClaimsPrincipal user, CosmosReadiness storage,
            TimeProvider clock, CancellationToken cancellationToken) =>
        {
            if (input.Id == Guid.Empty || !double.IsFinite(input.Latitude) || !double.IsFinite(input.Longitude) ||
                input.Latitude is < -90 or > 90 || input.Longitude is < -180 or > 180)
                return Results.BadRequest(new { message = "A nonempty UUID and valid map coordinates are required." });

            var incident = new Incident(input.Id.ToString(), ResortId, input.Latitude, input.Longitude,
                clock.GetUtcNow(), user.FindFirstValue("sub")!);
            try
            {
                var saved = await storage.Incidents.CreateItemAsync(incident, new PartitionKey(ResortId),
                    cancellationToken: cancellationToken);
                return Results.Created($"/api/incidents/{incident.Id}", saved.Resource);
            }
            catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.Conflict)
            {
                var existing = (await storage.Incidents.ReadItemAsync<Incident>(incident.Id,
                    new PartitionKey(ResortId), cancellationToken: cancellationToken)).Resource;
                // A lost response can be retried without creating a second incident or changing its timestamp.
                return existing.CreatedBy == incident.CreatedBy && existing.Latitude == input.Latitude &&
                    existing.Longitude == input.Longitude
                    ? Results.Ok(existing)
                    : Results.Conflict(new { message = "This request ID is already in use." });
            }
        });
        group.MapGet("/", async (CosmosReadiness storage, string? cursor, CancellationToken cancellationToken) =>
        {
            if (cursor?.Length > 16_000)
                return Results.BadRequest();
            try
            {
                using var query = storage.Incidents.GetItemQueryIterator<Incident>(
                    new QueryDefinition("SELECT * FROM c ORDER BY c.createdAt DESC"),
                    cursor, new QueryRequestOptions { PartitionKey = new PartitionKey(ResortId), MaxItemCount = 100 });
                var page = await query.ReadNextAsync(cancellationToken);
                return Results.Ok(new { items = page.ToArray(), cursor = page.ContinuationToken });
            }
            catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.BadRequest)
            {
                return Results.BadRequest(new { message = "Invalid incident cursor." });
            }
        });
        group.MapGet("/{id:guid}", async (Guid id, CosmosReadiness storage, CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await storage.Incidents.ReadItemAsync<Incident>(id.ToString(),
                    new PartitionKey(ResortId), cancellationToken: cancellationToken);
                return Results.Ok(result.Resource);
            }
            catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
            {
                return Results.NotFound();
            }
        });
    }
}
