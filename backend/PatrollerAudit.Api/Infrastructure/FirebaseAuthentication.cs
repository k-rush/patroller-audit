using System.Security.Claims;
using System.Text.Encodings.Web;
using FirebaseAdmin;
using FirebaseAdmin.Auth;
using Google.Apis.Auth.OAuth2;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace PatrollerAudit.Api.Infrastructure;

public static class FirebaseAuthentication
{
    public static void AddFirebaseAuthentication(this IServiceCollection services, RuntimeSettings settings)
    {
        if (settings.EmulatorEnabled)
        {
            services.AddSingleton<EmulatorTokenVerifier>();
            services.AddAuthentication("Firebase")
                .AddScheme<AuthenticationSchemeOptions, EmulatorAuthenticationHandler>("Firebase", _ => { });
        }
        else
        {
            services.AddAuthentication("Firebase").AddJwtBearer("Firebase", options =>
            {
                options.MapInboundClaims = false;
                options.IncludeErrorDetails = false;
                options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
                    new FirebaseKeyRetriever(settings.Issuer),
                    new HttpDocumentRetriever { RequireHttps = true });
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = settings.Issuer,
                    ValidateAudience = true,
                    ValidAudience = settings.ProjectId,
                    ValidateIssuerSigningKey = true,
                    RequireSignedTokens = true,
                    RequireExpirationTime = true,
                    ValidateLifetime = true,
                    ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "sub"
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = context =>
                    {
                        var subject = context.Principal?.FindFirstValue("sub");
                        if (string.IsNullOrWhiteSpace(subject) || subject.Length > 128)
                            context.Fail("A valid Firebase subject is required.");
                        return Task.CompletedTask;
                    }
                };
            });
        }

        services.AddAuthorization(options =>
        {
            options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser().Build();
        });
    }
}

internal sealed class FirebaseKeyRetriever(string issuer) : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address, IDocumentRetriever retriever, CancellationToken cancel)
    {
        var keys = new JsonWebKeySet(await retriever.GetDocumentAsync(address, cancel));
        var configuration = new OpenIdConnectConfiguration { Issuer = issuer };
        foreach (var key in keys.GetSigningKeys())
            configuration.SigningKeys.Add(key);
        if (configuration.SigningKeys.Count == 0)
            throw new InvalidOperationException("Firebase signing keys are unavailable.");
        return configuration;
    }
}

internal sealed class EmulatorTokenVerifier : IDisposable
{
    private readonly FirebaseApp app;

    public EmulatorTokenVerifier(RuntimeSettings settings)
    {
        app = FirebaseApp.Create(new AppOptions
        {
            ProjectId = settings.ProjectId,
            Credential = GoogleCredential.FromAccessToken("owner")
        }, $"patroller-audit-emulator-{Guid.NewGuid():N}");
    }

    public async Task<ClaimsPrincipal> VerifyAsync(string token, CancellationToken cancellationToken)
    {
        var verified = await FirebaseAuth.GetAuth(app).VerifyIdTokenAsync(token, cancellationToken);
        return new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim("sub", verified.Uid), new Claim("iss", verified.Issuer)], "Firebase"));
    }

    public void Dispose() => app.Delete();
}

internal sealed class EmulatorAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
    UrlEncoder encoder, EmulatorTokenVerifier verifier)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();
        if (header.Length > 32_000)
            return AuthenticateResult.Fail("Invalid token.");
        try
        {
            var principal = await verifier.VerifyAsync(header[7..], Context.RequestAborted);
            return AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name));
        }
        catch (Exception exception) when (exception is FirebaseAuthException or ArgumentException)
        {
            return AuthenticateResult.Fail("Invalid Firebase token.");
        }
    }
}
