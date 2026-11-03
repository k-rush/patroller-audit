targetScope = 'resourceGroup'

@description('Stable lowercase alphanumeric application prefix beginning with a letter. Use a dedicated resource group.')
@minLength(3)
@maxLength(10)
param namePrefix string = 'patrolapp'

param location string = resourceGroup().location

@description('Provision test first; explicitly add later rings when approved.')
@allowed([
  ['test']
  ['test', 'staging']
  ['test', 'staging', 'production']
])
param rings array = ['test']

@description('Object ID of the federated GitHub build principal. No registry passwords are provisioned.')
param buildPrincipalId string

var tags = { application: 'PatrollerAudit' }

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${namePrefix}${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource pushRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, buildPrincipalId, 'AcrPush')
  scope: registry
  properties: {
    principalId: buildPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
  }
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}

module ringFoundation 'modules/ring-foundation.bicep' = [for ring in rings: {
  name: 'foundation-${ring}'
  params: {
    namePrefix: namePrefix
    ring: ring
    location: location
    registryName: registry.name
    workspaceName: workspace.name
  }
}]

output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output provisionedRings array = rings
