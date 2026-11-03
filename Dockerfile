# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
COPY backend/ backend/
RUN dotnet restore backend/PatrollerAudit.Api/PatrollerAudit.Api.csproj --locked-mode
RUN dotnet publish backend/PatrollerAudit.Api/PatrollerAudit.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false
COPY --from=frontend /src/frontend/dist/ /app/publish/wwwroot/

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=backend /app/publish/ ./
ENV ASPNETCORE_HTTP_PORTS=8080
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "PatrollerAudit.Api.dll"]
