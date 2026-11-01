using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using PatrollerAudit.Api.Infrastructure;

namespace PatrollerAudit.Api.Tests;

public sealed class FoundationTests
{
    [Theory]
    [InlineData("/health", HttpStatusCode.OK)]
    [InlineData("/api/health", HttpStatusCode.ServiceUnavailable)]
    [InlineData("/api/not-a-feature", HttpStatusCode.NotFound)]
    public async Task UnconfiguredDevelopmentHasLivenessButNotReadiness(string path, HttpStatusCode expected)
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Auth:ProjectId"] = "",
                    ["CosmosDb:AccountEndpoint"] = "",
                    ["FIREBASE_AUTH_EMULATOR_HOST"] = ""
                }));
        });
        using var client = factory.CreateClient();
        var response = await client.GetAsync(path);
        Assert.Equal(expected, response.StatusCode);
    }

    [Theory]
    [InlineData("Emulator:Enabled", "true")]
    [InlineData("Auth:EmulatorEnabled", "true")]
    [InlineData("Auth:ProjectId", "demo-cloud-is-not-allowed")]
    [InlineData("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")]
    [InlineData("CosmosDb:ConnectionString", "AccountEndpoint=https://localhost:8081/;AccountKey=local;")]
    [InlineData("CosmosDb:AccountEndpoint", "http://account.documents.azure.com/")]
    public void ProductionRejectsUnsafeSettings(string key, string value)
    {
        var values = new Dictionary<string, string?>
        {
            ["Auth:ProjectId"] = "patroller-audit-test",
            ["CosmosDb:AccountEndpoint"] = "https://patroller-audit.documents.azure.com/",
            ["CosmosDb:DatabaseName"] = "patroller-audit-test",
            ["FIREBASE_AUTH_EMULATOR_HOST"] = ""
        };
        values[key] = value;
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        Assert.Throws<InvalidOperationException>(() =>
            new RuntimeSettings(configuration, new TestEnvironment("Production")));
    }

    [Fact]
    public void ProductionRequiresCloudConfiguration()
    {
        var configuration = new ConfigurationBuilder().Build();
        Assert.Throws<InvalidOperationException>(() =>
            new RuntimeSettings(configuration, new TestEnvironment("Production")));
    }

    private sealed class TestEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "PatrollerAudit.Api.Tests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
