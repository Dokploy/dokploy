# Cloud Provisioning Troubleshooting Guide

## Common Issues and Solutions

### 1. "Module not found: Can't resolve 'fs'" Error

**Error Message:**
```
Module not found: Can't resolve 'fs'
Import trace:
  @mapbox/node-pre-gyp/lib/clean.js
  bcrypt/bcrypt.js
  @dokploy/server/src/index.ts
```

**Cause:**
Importing server-side modules (like `@dokploy/server`) directly in frontend components causes Next.js to try to bundle server-only code (bcrypt, fs, etc.) for the browser.

**Solution:**
Use the types-only import instead:

```typescript
// ❌ Wrong - imports server code
import { CloudProvider } from "@dokploy/server";

// ✅ Correct - imports only types
import { CloudProvider } from "@dokploy/server/types";
```

**Files Affected:**
- `components/dashboard/settings/cloud-providers/hetzner/add-hetzner-provider.tsx`
- `components/dashboard/settings/servers/provision-server-wizard.tsx`

---

### 2. "providerClient.createSSHKey is not a function"

**Error Message:**
```
TypeError: providerClient.createSSHKey is not a function
  at provisionServer (packages/server/src/services/cloud-provider.ts:333:46)
```

**Cause:**
The `HetznerProvider` class was missing the `createSSHKey` method that implements the `ICloudProvider` interface.

**Solution:**
Already fixed in `packages/server/src/providers/hetzner/provider.ts`:
- Added `createSSHKey` method
- Refactored `ensureSSHKey` to use `createSSHKey`

---

### 3. TypeScript Errors: "Type 'string' is not assignable to type 'CloudProvider'"

**Error Message:**
```
Type '"hetzner"' is not assignable to type 'CloudProvider'
```

**Cause:**
Using string literals instead of the `CloudProvider` enum values.

**Solution:**
```typescript
// ❌ Wrong
provider: "hetzner"

// ✅ Correct
import { CloudProvider } from "@dokploy/server/types";
provider: CloudProvider.HETZNER
```

---

### 4. "PROVIDER_ENCRYPTION_KEY not set"

**Error Message:**
```
Error: Encryption key not configured
```

**Cause:**
Missing environment variable for encrypting cloud provider API tokens.

**Solution:**
1. Generate a secure key:
   ```bash
   openssl rand -hex 32
   ```

2. Add to `.env`:
   ```bash
   PROVIDER_ENCRYPTION_KEY="your-generated-32-byte-hex-key-here"
   ```

---

### 5. Database Migration Errors

**Error Message:**
```
relation "cloud_provider_credentials" does not exist
```

**Cause:**
Database migrations haven't been run.

**Solution:**
```bash
cd apps/dokploy
pnpm migration:generate
pnpm migration:run
```

---

### 6. "Invalid API token" when adding Hetzner credentials

**Cause:**
- API token is incorrect
- Token doesn't have proper permissions
- Network connectivity issues

**Solution:**
1. Verify token in Hetzner Cloud Console
2. Ensure token has **Read & Write** permissions
3. Generate a new token if needed
4. Check network connectivity to api.hetzner.cloud

---

### 7. Provisioning stuck at "Creating Server"

**Possible Causes:**
- Hetzner API rate limiting
- Selected location/type unavailable
- Network issues

**Solutions:**
1. Check Hetzner Cloud Console for server status
2. Try a different location or server type
3. Wait a few minutes and check job status
4. Check error message in provisioning job card

**Manual Cleanup:**
If server was created but job failed:
1. Delete server from Hetzner Console
2. Delete SSH key from Hetzner Console (if created)
3. Cancel job in Dokploy

---

### 8. "No cloud provider credentials configured"

**Cause:**
Haven't added provider credentials yet.

**Solution:**
1. Navigate to **Settings → Cloud Providers**
2. Click **Hetzner** button
3. Enter your API token
4. Click **Add Provider**
5. Wait for validation (green "Active" badge)

---

### 9. Server created but not appearing in Dokploy

**Possible Causes:**
- Provisioning job failed during Dokploy configuration
- SSH connectivity issues
- Database update failed

**Solutions:**
1. Check provisioning job for error message
2. Verify server is accessible via SSH
3. Check server firewall settings
4. Look at server logs for connection errors

**Manual Fix:**
1. Go to Settings → Servers
2. Click "Create Server" (manual)
3. Enter server IP from Hetzner Console
4. Select the auto-generated SSH key
5. Complete setup manually

---

## Development Issues

### Type Checking Fails

**Solution:**
```bash
# Backend
cd packages/server
pnpm typecheck

# Frontend
cd apps/dokploy
pnpm typecheck
```

### Hot Reload Not Working

**Solution:**
Restart development server after adding new files or modifying exports:
```bash
pnpm dokploy:dev
```

---

## Getting Help

If you encounter an issue not listed here:

1. **Check Logs:**
   - Browser console for frontend errors
   - Terminal output for backend errors
   - Provisioning job error messages

2. **Check Status:**
   - Hetzner Cloud Console
   - Provisioning Jobs in Dokploy
   - Server status in Settings → Servers

3. **Report Issue:**
   - Include error message
   - Include steps to reproduce
   - Include relevant logs
   - Check existing issues first

---

## Best Practices

### Security
- ✅ Rotate API tokens regularly
- ✅ Use separate tokens per environment
- ✅ Set proper token permissions (Read & Write only)
- ✅ Keep `PROVIDER_ENCRYPTION_KEY` secure
- ❌ Don't commit API tokens to git
- ❌ Don't share encryption keys

### Performance
- ✅ Monitor provisioning job status
- ✅ Clean up failed jobs periodically
- ✅ Delete unused servers promptly
- ✅ Use appropriate server sizes
- ❌ Don't provision during peak hours
- ❌ Don't create too many servers concurrently

### Cost Management
- ✅ Review pricing before provisioning
- ✅ Delete servers when not needed
- ✅ Use smaller instances for testing
- ✅ Monitor monthly costs
- ❌ Don't leave test servers running
- ❌ Don't over-provision resources

---

## Quick Reference

### Required Environment Variables
```bash
PROVIDER_ENCRYPTION_KEY=<32-byte-hex-key>
```

### Important File Locations
```
Backend:
├── packages/server/src/
│   ├── providers/
│   │   ├── types.ts              # Provider interfaces
│   │   ├── types-client.ts       # Browser-safe types
│   │   ├── factory.ts            # Provider factory
│   │   ├── encryption.ts         # Token encryption
│   │   └── hetzner/              # Hetzner implementation
│   ├── services/cloud-provider.ts # Orchestration
│   └── db/schema/cloud-provider.ts # Database schema

Frontend:
├── apps/dokploy/
│   ├── components/dashboard/settings/
│   │   ├── cloud-providers/      # Credentials management
│   │   └── servers/              # Provisioning wizard
│   ├── server/api/routers/
│   │   └── cloud-provider.ts     # tRPC API
│   └── pages/dashboard/settings/
│       └── cloud-providers.tsx   # Settings page
```

### Common Commands
```bash
# Generate migration
cd apps/dokploy
pnpm migration:generate

# Run migration
pnpm migration:run

# Type check
pnpm typecheck

# Development
pnpm dokploy:dev

# Generate encryption key
openssl rand -hex 32
```
