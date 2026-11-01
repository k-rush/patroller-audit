namespace PatrollerAudit.Api.Infrastructure;

public sealed class RuntimeSettings
{
    public string ProjectId { get; }
    public string CosmosEndpoint { get; }
    public string DatabaseName { get; }
    public string ConnectionString { get; }
    public string CertificatePath { get; }
    public bool EmulatorEnabled { get; }
    public bool StorageConfigured => EmulatorEnabled || CosmosEndpoint.Length > 0;
    public string Issuer => $"https://securetoken.google.com/{ProjectId}";

    public RuntimeSettings(IConfiguration configuration, IHostEnvironment environment)
    {
        ProjectId = configuration["Auth:ProjectId"] ?? "";
        CosmosEndpoint = configuration["CosmosDb:AccountEndpoint"] ?? "";
        DatabaseName = configuration["CosmosDb:DatabaseName"] ?? "";
        ConnectionString = configuration["CosmosDb:ConnectionString"] ?? "";
        CertificatePath = configuration["Emulator:CertificatePath"] ?? "";
        EmulatorEnabled = configuration.GetValue<bool>("Emulator:Enabled");
        var authEmulator = configuration.GetValue<bool>("Auth:EmulatorEnabled");
        var emulatorHost = configuration["FIREBASE_AUTH_EMULATOR_HOST"];

        if (EmulatorEnabled != authEmulator)
            throw new InvalidOperationException("Cosmos and Firebase emulator settings must agree.");

        if (EmulatorEnabled)
        {
            if (!environment.IsDevelopment() || !ProjectId.StartsWith("demo-", StringComparison.Ordinal) ||
                !IsLocalAuthHost(emulatorHost) || string.IsNullOrWhiteSpace(CertificatePath) ||
                !File.Exists(CertificatePath) || string.IsNullOrWhiteSpace(ConnectionString))
                throw new InvalidOperationException("Emulators require Development, a demo project, a local auth host, and a pinned Cosmos certificate.");

            var parts = new System.Data.Common.DbConnectionStringBuilder { ConnectionString = ConnectionString };
            if (!parts.TryGetValue("AccountEndpoint", out var endpoint) ||
                !Uri.TryCreate(endpoint.ToString(), UriKind.Absolute, out var uri) ||
                uri.Scheme != "https" || !IsLocalHost(uri.Host) || uri.AbsolutePath != "/" ||
                uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0)
                throw new InvalidOperationException("Cosmos emulator endpoint must be local HTTPS.");
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(emulatorHost) || ConnectionString.Length > 0 ||
                CertificatePath.Length > 0 || ProjectId.StartsWith("demo-", StringComparison.Ordinal))
                throw new InvalidOperationException("Cloud mode rejects emulator settings and Cosmos account keys.");

            if (CosmosEndpoint.Length > 0 &&
                (!Uri.TryCreate(CosmosEndpoint, UriKind.Absolute, out var uri) ||
                 uri.Scheme != "https" || !uri.Host.EndsWith(".documents.azure.com", StringComparison.Ordinal) ||
                 uri.UserInfo.Length > 0 || uri.AbsolutePath != "/" || uri.Query.Length > 0 || uri.Fragment.Length > 0))
                throw new InvalidOperationException("Cloud Cosmos requires an Azure HTTPS account endpoint.");
        }

        if (StorageConfigured && string.IsNullOrWhiteSpace(DatabaseName))
            throw new InvalidOperationException("A Cosmos database name is required.");

        if (!environment.IsDevelopment() && (!StorageConfigured || string.IsNullOrWhiteSpace(ProjectId)))
            throw new InvalidOperationException("Cloud startup requires Cosmos and Firebase configuration.");
    }

    private static bool IsLocalHost(string host) => host is "localhost" or "127.0.0.1" or "[::1]" or "cosmos-emulator";

    private static bool IsLocalAuthHost(string? host) =>
        Uri.TryCreate($"http://{host}", UriKind.Absolute, out var uri) &&
        (uri.Host is "localhost" or "127.0.0.1" or "[::1]" or "firebase-auth-emulator") &&
        uri.Port is > 0 and <= 65535 && uri.AbsolutePath == "/" &&
        uri.UserInfo.Length == 0 && uri.Query.Length == 0 && uri.Fragment.Length == 0;
}
