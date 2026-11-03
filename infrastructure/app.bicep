targetScope = 'resourceGroup'

@minLength(3)
@maxLength(10)
param namePrefix string = 'patrolapp'
@allowed(['test', 'staging', 'production'])
param ring string
param location string = resourceGroup().location

@description('Immutable sha256 digest. The deploy workflow validates its exact format.')
param imageDigest string
@description('Real, dedicated Firebase project for this ring. Never demo-prefixed.')
@minLength(6)
param firebaseProjectId string
@maxLength(24)
param revisionSuffix string

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: '${namePrefix}${uniqueString(resourceGroup().id)}'
}
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: '${namePrefix}-${ring}-${uniqueString(resourceGroup().id, ring)}'
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: '${namePrefix}-${ring}-identity'
}
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: '${namePrefix}-${ring}-environment'
}
resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: '${namePrefix}-${ring}-insights'
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-${ring}'
  location: location
  tags: { application: 'PatrollerAudit', ring: ring }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      maxInactiveRevisions: 10
      ingress: {
        external: true
        targetPort: 8080
        allowInsecure: false
        transport: 'auto'
        traffic: [{ latestRevision: true, weight: 100 }]
      }
      registries: [{ server: registry.properties.loginServer, identity: identity.id }]
      secrets: [{ name: 'applicationinsights', value: insights.properties.ConnectionString }]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [{
        name: 'patroller-audit'
        image: '${registry.properties.loginServer}/patroller-audit@${imageDigest}'
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
          { name: 'ASPNETCORE_HTTP_PORTS', value: '8080' }
          { name: 'Auth__ProjectId', value: firebaseProjectId }
          { name: 'Auth__EmulatorEnabled', value: 'false' }
          { name: 'Emulator__Enabled', value: 'false' }
          { name: 'CosmosDb__AccountEndpoint', value: cosmos.properties.documentEndpoint }
          { name: 'CosmosDb__DatabaseName', value: '${namePrefix}-${ring}' }
          { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'applicationinsights' }
          { name: 'OTEL_SERVICE_NAME', value: 'patroller-audit-${ring}' }
        ]
        probes: [
          { type: 'Startup', httpGet: { path: '/health', port: 8080 }, periodSeconds: 5, failureThreshold: 30 }
          { type: 'Liveness', httpGet: { path: '/health', port: 8080 }, periodSeconds: 30 }
          { type: 'Readiness', httpGet: { path: '/api/health', port: 8080 }, periodSeconds: 15, timeoutSeconds: 10 }
        ]
      }]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '30' } } }]
      }
    }
  }
}

output baseUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output appName string = app.name
