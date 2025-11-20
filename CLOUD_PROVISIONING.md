# Cloud Server Provisioning Feature

## Overview

This feature enables one-click server provisioning from cloud providers directly within Dokploy. Currently supports Hetzner Cloud with an extensible architecture for adding more providers.

## Architecture

### Backend Components

#### 1. Provider System (`packages/server/src/providers/`)

**Core Types** (`types.ts`)
- `CloudProvider` enum - Supported providers
- `ProvisioningStatus` enum - Job status tracking
- `ICloudProvider` interface - Contract for all providers
- Base interfaces for Location, ServerType, Image, SSHKey, etc.

**Factory Pattern** (`factory.ts`)
- `ProviderFactory` class - Creates provider instances
- `createCloudProvider()` helper function

**Security** (`encryption.ts`)
- AES-256-GCM encryption for API tokens
- Uses `PROVIDER_ENCRYPTION_KEY` environment variable
- `encryptToken()` and `decryptToken()` functions

**Hetzner Implementation** (`hetzner/`)
- `client.ts` - API client using native fetch
- `provider.ts` - Implements ICloudProvider interface
- `types.ts` - Hetzner-specific API types

#### 2. Database Schema (`packages/server/src/db/schema/cloud-provider.ts`)

**Tables:**
- `cloud_provider_credentials` - Encrypted API tokens and validation status
- `server_provisioning_job` - Multi-step provisioning job tracking
- `server` table extensions - Cloud provider metadata fields

**Fields:**
- `cloudProvider` - Provider name (e.g., "hetzner")
- `providerServerId` - Provider's server ID for cleanup
- `providerMetadata` - Location, type, image information

#### 3. Service Layer (`packages/server/src/services/cloud-provider.ts`)

**Credential Management:**
- `upsertProviderCredentials()` - Add/update credentials with validation
- `getProviderCredentials()` - Retrieve credentials
- `deleteProviderCredentials()` - Remove credentials
- `listProviderCredentials()` - List all credentials

**Provisioning Orchestration:**
- `createProvisioningJob()` - Initialize provisioning job
- `provisionServer()` - Complete orchestration flow:
  1. Generate SSH key pair (4096-bit RSA)
  2. Store SSH key in database
  3. Upload SSH key to provider
  4. Create server at provider
  5. Wait for server to be running
  6. Create Dokploy server record
  7. Update with cloud metadata
  8. Wait for SSH to be available (with retries)
  9. Run server setup (install Docker, Traefik, etc.)
- `updateProvisioningJobStatus()` - Track progress
- `deleteCloudServer()` - Delete server from provider and database

**Job Management:**
- `getProvisioningJob()` - Get job status
- `listProvisioningJobs()` - List all jobs

#### 4. tRPC API (`apps/dokploy/server/api/routers/cloud-provider.ts`)

**Endpoints:**

```typescript
// Credentials
cloudProvider.credentials.upsert - Add/update provider credentials
cloudProvider.credentials.get - Get specific credentials
cloudProvider.credentials.delete - Remove credentials
cloudProvider.credentials.list - List all credentials

// Provider Information
cloudProvider.provider.listLocations - Get available datacenter locations
cloudProvider.provider.listServerTypes - Get available server sizes/types
cloudProvider.provider.listImages - Get available OS images

// Server Provisioning
cloudProvider.server.provision - Start server provisioning
cloudProvider.server.delete - Delete cloud-provisioned server

// Job Tracking
cloudProvider.job.status - Get job status
cloudProvider.job.list - List all provisioning jobs
cloudProvider.job.cancel - Cancel running job
```

### Frontend Components

#### 1. Cloud Provider Management

**Location:** `apps/dokploy/components/dashboard/settings/cloud-providers/`

**Components:**
- `show-cloud-providers.tsx` - Main provider management UI
- `hetzner/add-hetzner-provider.tsx` - Add Hetzner credentials dialog

**Features:**
- Add/remove cloud provider credentials
- Validate API tokens
- View credential status and last validation time

#### 2. Server Provisioning Wizard

**Location:** `apps/dokploy/components/dashboard/settings/servers/`

**Components:**
- `provision-server-wizard.tsx` - Multi-step provisioning wizard
  - Step 1: Provider selection
  - Step 2: Server configuration (location, type, OS)
- `show-provisioning-jobs.tsx` - Real-time job status display

**Features:**
- Provider selection (checks for valid credentials)
- Location selection (datacenter/region)
- Server type selection (CPU, RAM, disk, pricing)
- OS image selection
- Real-time provisioning progress
- Auto-refresh during active provisioning

#### 3. Server List Integration

**Modified:** `apps/dokploy/components/dashboard/settings/servers/show-servers.tsx`

**Changes:**
- Added "Provision Server" button alongside "Create Server"
- Integrated `<ShowProvisioningJobs />` component above servers table
- Added cloud provider badge to server names
- Shows recent provisioning jobs (last 24 hours)

#### 4. Icons

**Location:** `apps/dokploy/components/icons/cloud-provider-icons.tsx`

**Components:**
- `HetznerIcon` - Hetzner Cloud logo
- `CloudProviderIcon` - Generic cloud icon

### Pages

**New Page:** `/dashboard/settings/cloud-providers`
- Dedicated page for managing cloud provider credentials
- Accessible from settings navigation

## Setup Instructions

### 1. Environment Configuration

Generate an encryption key:
```bash
openssl rand -hex 32
```

Add to `.env`:
```bash
# Cloud Provider Encryption Key (32 bytes hex for AES-256-GCM)
PROVIDER_ENCRYPTION_KEY="your-generated-32-byte-hex-key"
```

### 2. Database Migration

Generate and run migrations:
```bash
cd apps/dokploy
pnpm migration:generate
pnpm migration:run
```

### 3. Hetzner Cloud Setup

1. Create a Hetzner Cloud account at https://console.hetzner.cloud/
2. Generate an API token:
   - Go to Security → API Tokens
   - Click "Generate API Token"
   - Give it Read & Write permissions
   - Copy the token (you won't see it again!)
3. Add token in Dokploy:
   - Navigate to Settings → Cloud Providers
   - Click "Hetzner" button
   - Paste your API token
   - Click "Add Provider"

## User Flow

### Adding Cloud Provider Credentials

1. Navigate to **Settings → Cloud Providers**
2. Click **"Hetzner"** button
3. Enter API token from Hetzner console
4. Click **"Add Provider"**
5. System validates token immediately
6. Credentials stored encrypted in database

### Provisioning a Server

1. Navigate to **Settings → Servers**
2. Click **"Provision Server"** button
3. **Step 1: Select Provider**
   - Choose Hetzner Cloud (if credentials configured)
4. **Step 2: Configure Server**
   - **Server Name:** Enter unique name (e.g., `production-app`)
   - **Location:** Select datacenter (e.g., Nuremberg, Germany)
   - **Server Type:** Choose size (e.g., CX11 - 1 vCPU, 2GB RAM)
   - **Operating System:** Select OS image (e.g., Ubuntu 22.04)
5. Click **"Provision Server"**
6. System automatically:
   - Generates 4096-bit RSA SSH key pair
   - Uploads SSH key to Hetzner
   - Creates server at Hetzner
   - Waits for server to be running
   - Creates Dokploy server record
   - Waits for SSH to be available (with retries)
   - Runs server setup (Docker, Traefik, Nixpacks, etc.)
7. Monitor progress in real-time (updates every 2 seconds)
8. Server appears in servers list when complete and fully configured

### Monitoring Provisioning Jobs

Jobs are displayed above the servers table with:
- Current status badge
- Progress bar (0-100%)
- Server configuration details
- Creation timestamp
- Error messages (if failed)

**Job Statuses:**
- **Pending** - Job queued (0%)
- **Generating SSH Key** - Creating 4096-bit RSA key pair (15%)
- **Uploading SSH Key** - Uploading to provider (30%)
- **Creating Server** - Provisioning server at provider (50%)
- **Configuring Dokploy** - Creating server record (65%)
- **Running Setup** - Waiting for SSH, then installing Docker and dependencies (85%)
- **Completed** - Server ready and fully configured (100%)
- **Failed** - Error occurred (shows error message)

**Note:** The "Running Setup" stage includes:
1. Waiting for SSH to be available (server may still be booting)
2. Installing system utilities (curl, wget, git, etc.)
3. Installing Docker and Docker Compose
4. Setting up Docker Swarm
5. Configuring Traefik reverse proxy
6. Installing build tools (Nixpacks, Buildpacks, Railpack)

### Managing Cloud-Provisioned Servers

Cloud-provisioned servers have:
- Provider badge next to name (e.g., "hetzner")
- All standard server functionality
- Automatic cleanup when deleted (removes from provider too)

## API Examples

### Add Provider Credentials

```typescript
const result = await api.cloudProvider.credentials.upsert.mutate({
  provider: "hetzner",
  apiToken: "your-api-token-here",
});
```

### List Available Locations

```typescript
const locations = await api.cloudProvider.provider.listLocations.query({
  provider: "hetzner",
});
// Returns: [{ id: "nbg1", name: "Nuremberg 1", city: "Nuremberg", country: "DE", ... }]
```

### Provision Server

```typescript
const job = await api.cloudProvider.server.provision.mutate({
  provider: "hetzner",
  name: "my-app-server",
  location: "nbg1",
  serverType: "cx11",
  image: "ubuntu-22.04",
});
// Returns: { jobId: "abc123...", status: "pending" }
```

### Check Job Status

```typescript
const job = await api.cloudProvider.job.status.query({
  jobId: "abc123...",
});
// Returns: { status: "creating_server", config: {...}, error: null, ... }
```

## Extending to New Providers

### 1. Add Provider Types

**`packages/server/src/providers/types.ts`:**
```typescript
export enum CloudProvider {
  HETZNER = "hetzner",
  DIGITALOCEAN = "digitalocean", // Add new provider
}
```

### 2. Create Provider Implementation

**`packages/server/src/providers/digitalocean/`:**
```
digitalocean/
├── types.ts       # Provider-specific API types
├── client.ts      # API client
└── provider.ts    # Implement ICloudProvider interface
```

### 3. Update Factory

**`packages/server/src/providers/factory.ts`:**
```typescript
switch (provider) {
  case CloudProvider.HETZNER:
    return new HetznerProvider(credentials.apiToken);
  case CloudProvider.DIGITALOCEAN:
    return new DigitalOceanProvider(credentials.apiToken);
  // ...
}
```

### 4. Update Database Schema

**`packages/server/src/db/schema/cloud-provider.ts`:**
```typescript
export const cloudProviderEnum = pgEnum("cloudProvider", [
  "hetzner",
  "digitalocean", // Add to enum
]);
```

### 5. Create UI Component

**`apps/dokploy/components/dashboard/settings/cloud-providers/digitalocean/`:**
- `add-digitalocean-provider.tsx` - Credentials dialog
- Update `show-cloud-providers.tsx` to include new provider

## Security Considerations

### Token Encryption
- All API tokens encrypted at rest using AES-256-GCM
- Encryption key stored in environment variable
- Tokens never logged or exposed in API responses

### Token Validation
- Tokens validated immediately upon storage
- Invalid tokens rejected before saving
- Regular validation checks can be implemented

### Access Control
- Only admin/owner roles can manage cloud providers
- Organization-level isolation (multi-tenant safe)
- Each organization has separate credentials

### SSH Key Security
- Auto-generated 4096-bit RSA keys
- Private keys stored securely in database
- Public keys uploaded to provider
- Keys auto-associated with provisioned servers

## Error Handling

### Provisioning Failures

The system handles failures gracefully:

1. **Validation Errors**
   - Invalid API token → Immediate rejection
   - Missing credentials → User prompted to add
   - Invalid server config → Form validation errors

2. **Provider Errors**
   - API rate limits → Retry with backoff
   - Server creation failed → Cleanup partial resources
   - Network issues → Job marked as failed with error message

3. **Automatic Cleanup**
   - Failed jobs clean up:
     - SSH keys uploaded to provider
     - Partially created servers
     - Database records

4. **User Notification**
   - Real-time status updates
   - Error messages displayed in job card
   - Toast notifications for major events

## Performance Optimizations

### Polling Strategy
- Jobs auto-refresh every 5 seconds when active
- Stops polling when job completed/failed
- Only fetches recent jobs (last 24 hours)

### Data Fetching
- Provider info (locations, types) fetched on-demand
- Cached in React Query
- Only loads when provider selected

### Background Processing
- Provisioning runs asynchronously
- Non-blocking API calls
- Progress updates via polling

## Testing Checklist

### Backend
- [ ] Token encryption/decryption
- [ ] Provider credential validation
- [ ] Server provisioning flow
- [ ] Cleanup on failure
- [ ] Job status tracking
- [ ] Multi-organization isolation

### Frontend
- [ ] Add provider credentials
- [ ] Provider selection
- [ ] Server configuration form validation
- [ ] Real-time job status updates
- [ ] Error display
- [ ] Server list integration

### Integration
- [ ] End-to-end provisioning
- [ ] Server appears in list
- [ ] SSH connectivity
- [ ] Server deletion (from both Dokploy and provider)
- [ ] Multiple concurrent provisioning jobs

## Troubleshooting

### "No cloud provider credentials configured"
**Solution:** Navigate to Settings → Cloud Providers and add your API token

### "Invalid API token"
**Solution:** Verify token has Read & Write permissions in provider console

### Provisioning stuck at "Creating Server"
**Solution:** Check Hetzner console for server status, may need manual cleanup

### "Error: PROVIDER_ENCRYPTION_KEY not set"
**Solution:** Add encryption key to `.env` file

### Server created but not appearing in Dokploy
**Solution:** Check provisioning job error message, may be SSH connectivity issue

## Future Enhancements

- [ ] Support for DigitalOcean
- [ ] Support for AWS EC2
- [ ] Support for Vultr
- [ ] Support for Linode
- [ ] Custom startup scripts
- [ ] Automatic Dokploy installation
- [ ] Server templates/presets
- [ ] Cost estimation before provisioning
- [ ] Bulk server provisioning
- [ ] Scheduled provisioning
- [ ] Auto-scaling integration

## Resources

- [Hetzner Cloud API Documentation](https://docs.hetzner.cloud/)
- [Dokploy Documentation](https://docs.dokploy.com/)
- [AES-256-GCM Encryption](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
