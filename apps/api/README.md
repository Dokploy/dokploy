```
npm install
npm run dev
```

```
open http://localhost:3000
```

## Environment Variables

The API server requires the following environment variables for configuration:

### Inngest Configuration

Required for the GET /jobs endpoint to list deployment jobs:

- **INNGEST_BASE_URL** - The base URL for the Inngest instance
  - Self-hosted: `http://localhost:8288`
  - Production: `https://dev-inngest.dokploy.com`
  
- **INNGEST_SIGNING_KEY** - The signing key for authenticating with Inngest

Optional configuration for filtering and pagination:

- **INNGEST_EVENTS_RECEIVED_AFTER** (optional) - An RFC3339 timestamp to filter events received after a specific date (e.g., `2024-01-01T00:00:00Z`). If unset, no date filter is applied.

- **INNGEST_JOBS_MAX_EVENTS** (optional) - Maximum number of events to fetch when listing jobs. Default is 100, maximum is 10000. Used for pagination with cursor.

### Lemon Squeezy Integration

- **LEMON_SQUEEZY_API_KEY** - API key for Lemon Squeezy integration
- **LEMON_SQUEEZY_STORE_ID** - Store ID for Lemon Squeezy integration

### Docker Configuration

Optional configuration for customizing Docker daemon connections:

- **DOCKER_API_VERSION** (optional) - Specifies which Docker API version to use when connecting to the Docker daemon. If not set, the Docker client uses the default API version.

- **DOCKER_HOST** (optional) - Specifies the Docker daemon host to connect to. If not set, uses the default Docker socket connection.

- **DOCKER_PORT** (optional) - Specifies the port for connecting to the Docker daemon. If not set, uses the default port.

These variables allow advanced users to customize how the Dokploy API server connects to Docker, which can be useful for connecting to remote Docker daemons or using specific API versions.

## API Endpoints

### GET /jobs

Lists deployment jobs (Inngest runs) for a specified server.

**Query Parameters:**
- `serverId` (required) - The ID of the server to list deployment jobs for

**Response:**
Returns an array of deployment job objects with the same shape as BullMQ queue jobs:
```json
[
  {
    "id": "string",
    "name": "string",
    "data": {},
    "timestamp": 0,
    "processedOn": 0,
    "finishedOn": 0,
    "failedReason": "string",
    "state": "string"
  }
]
```

**Error Responses:**
- `400` - serverId is not provided
- `503` - INNGEST_BASE_URL is not configured
- `200` - Empty array on other errors

This endpoint is used by the UI to display deployment queue information in the dashboard.

## Search Endpoints

The following search endpoints provide flexible querying capabilities with pagination support. All search endpoints respect member permissions, returning only resources the user has access to.

### application.search

Search applications across name, appName, description, repository, owner, and dockerImage fields.

**Query Parameters:**
- `q` (optional string) - General search term that searches across name, appName, description, repository, owner, and dockerImage
- `name` (optional string) - Filter by application name
- `appName` (optional string) - Filter by app name
- `description` (optional string) - Filter by description
- `repository` (optional string) - Filter by repository
- `owner` (optional string) - Filter by owner
- `dockerImage` (optional string) - Filter by Docker image
- `projectId` (optional string) - Filter by project ID
- `environmentId` (optional string) - Filter by environment ID
- `limit` (number, default 20, min 1, max 100) - Maximum number of results
- `offset` (number, default 0, min 0) - Pagination offset

**Response:**
```json
{
  "items": [
    {
      "applicationId": "string",
      "name": "string",
      "appName": "string",
      "description": "string",
      "environmentId": "string",
      "applicationStatus": "string",
      "sourceType": "string",
      "createdAt": "string"
    }
  ],
  "total": 0
}
```

### compose.search

Search compose services with filtering by name, appName, and description.

**Query Parameters:**
- `q` (optional string) - General search term across name, appName, description
- `name` (optional string) - Filter by name
- `appName` (optional string) - Filter by app name
- `description` (optional string) - Filter by description
- `projectId` (optional string) - Filter by project ID
- `environmentId` (optional string) - Filter by environment ID
- `limit` (number, default 20, min 1, max 100) - Maximum results
- `offset` (number, default 0, min 0) - Pagination offset

**Response:**
```json
{
  "items": [
    {
      "composeId": "string",
      "name": "string",
      "appName": "string",
      "description": "string",
      "environmentId": "string",
      "composeStatus": "string",
      "sourceType": "string",
      "createdAt": "string"
    }
  ],
  "total": 0
}
```

### environment.search

Search environments by name and description.

**Query Parameters:**
- `q` (optional string) - General search term across name and description
- `name` (optional string) - Filter by name
- `description` (optional string) - Filter by description
- `projectId` (optional string) - Filter by project ID
- `limit` (number, default 20, min 1, max 100) - Maximum results
- `offset` (number, default 0, min 0) - Pagination offset

**Response:**
```json
{
  "items": [
    {
      "environmentId": "string",
      "name": "string",
      "description": "string",
      "createdAt": "string",
      "env": "string",
      "projectId": "string",
      "isDefault": true
    }
  ],
  "total": 0
}
```

### project.search

Search projects by name and description.

**Query Parameters:**
- `q` (optional string) - General search term across name and description
- `name` (optional string) - Filter by name
- `description` (optional string) - Filter by description
- `limit` (number, default 20, min 1, max 100) - Maximum results
- `offset` (number, default 0, min 0) - Pagination offset

**Response:**
```json
{
  "items": [
    {
      "projectId": "string",
      "name": "string",
      "description": "string",
      "createdAt": "string",
      "organizationId": "string",
      "env": "string"
    }
  ],
  "total": 0
}
```

### Database Service Search Endpoints

The following database services all share the same search interface:
- **postgres.search**
- **mysql.search**
- **mariadb.search**
- **mongo.search**
- **redis.search**

**Query Parameters:**
- `q` (optional string) - General search term across name, appName, description
- `name` (optional string) - Filter by name
- `appName` (optional string) - Filter by app name
- `description` (optional string) - Filter by description
- `projectId` (optional string) - Filter by project ID
- `environmentId` (optional string) - Filter by environment ID
- `limit` (number, default 20, min 1, max 100) - Maximum results
- `offset` (number, default 0, min 0) - Pagination offset

**Response:**
```json
{
  "items": [
    {
      "postgresId": "string",
      "name": "string",
      "appName": "string",
      "description": "string",
      "environmentId": "string",
      "applicationStatus": "string",
      "createdAt": "string"
    }
  ],
  "total": 0
}
```

*Note: The response shape is similar across all database services, with the ID field varying (e.g., `mysqlId`, `mariadbId`, `mongoId`, `redisId`).*

**Search Behavior:**
- All searches use case-insensitive pattern matching with wildcards
- Results are ordered by creation date (descending)
- Members only see services they have access to
- Returns total count for pagination UI

## Whitelabeling Endpoints

The whitelabeling endpoints allow enterprise/self-hosted Dokploy instances to customize branding, logos, colors, and UI appearance. These endpoints are only available in self-hosted mode (not cloud).

### whitelabeling.get

Get the current whitelabeling configuration.

**Requirements:**
- Enterprise license required
- Only available for self-hosted (not cloud)

**Response:**
Returns the whitelabeling configuration object or null if not configured.

```json
{
  "appName": "string | null",
  "appDescription": "string | null",
  "logoUrl": "string | null",
  "faviconUrl": "string | null",
  "primaryColor": "string | null",
  "customCss": "string | null",
  "loginLogoUrl": "string | null",
  "supportUrl": "string | null",
  "docsUrl": "string | null",
  "errorPageTitle": "string | null",
  "errorPageDescription": "string | null",
  "metaTitle": "string | null",
  "footerText": "string | null"
}
```

### whitelabeling.update

Update the whitelabeling configuration.

**Requirements:**
- Enterprise license required
- Owner role required
- Only available for self-hosted (not cloud)

**Input:**
```json
{
  "whitelabelingConfig": {
    "appName": "string | null",
    "appDescription": "string | null",
    "logoUrl": "string | null",
    "faviconUrl": "string | null",
    "primaryColor": "string | null",
    "customCss": "string | null",
    "loginLogoUrl": "string | null",
    "supportUrl": "string | null",
    "docsUrl": "string | null",
    "errorPageTitle": "string | null",
    "errorPageDescription": "string | null",
    "metaTitle": "string | null",
    "footerText": "string | null"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

### whitelabeling.reset

Reset whitelabeling configuration to default values (all fields set to null).

**Requirements:**
- Enterprise license required
- Owner role required
- Only available for self-hosted (not cloud)

**Response:**
```json
{
  "success": true
}
```

### whitelabeling.getPublic

Public endpoint to fetch whitelabeling configuration. This endpoint can be accessed without authentication, allowing the whitelabeling settings to be applied globally (including on the login page before auth).

**Requirements:**
- No authentication required
- Only available for self-hosted (not cloud)

**Response:**
Returns the whitelabeling configuration object or null if not configured. Response shape is identical to `whitelabeling.get`.