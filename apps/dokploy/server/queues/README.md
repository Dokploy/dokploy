# Queue System Migration - BullMQ to p-limit

This directory contains the new queue system that replaces BullMQ with [p-limit](https://github.com/sindresorhus/p-limit) for deployment queues.

## Why the Migration?

- **Resource Issues**: Users experienced freezing during builds due to resource constraints
- **Cancellation Problems**: BullMQ workers couldn't be properly canceled when Docker processes restart
- **Retry Loops**: Unwanted automatic retries when processes are killed

## New Architecture

### Key Features

1. **Per-Server Queues**: Deployments are grouped by server (local "dokploy-server" or remote servers)
2. **Ordered Processing**: Within each server, deployments are processed based on server concurrency settings
3. **Global User Concurrency**: User's `serverConcurrency` controls total deployments across all servers
4. **Proper Cancellation**: Jobs can be canceled using AbortController
5. **No Redis Dependency**: In-memory queues eliminate Redis dependency issues

### Files

- `service-queue.ts` - New p-limit based queue implementation
- `queueSetup.ts` - Compatibility layer for existing code
- `deployments-queue.ts` - Legacy compatibility exports
- `queue-types.ts` - Shared type definitions

## Usage Examples

```typescript
import { addJobWithUserContext, cancelDeploymentJobs, getDeploymentQueueStatus } from './queueSetup';

// Add a deployment job with user context (recommended for API routes)
const result = await addJobWithUserContext({
  applicationType: 'application',
  applicationId: '123',
  type: 'deploy',
  titleLog: 'Deploying app',
  descriptionLog: 'Starting deployment',
  serverId: 'server-456' // Optional - for remote deployments
}, 'user-id-789'); // User ID for concurrency settings

// Cancel jobs for a service
const cancelled = cancelDeploymentJobs('app-123');

// Get queue status
const status = getDeploymentQueueStatus('app-123');
```

### Database-Driven Concurrency

The system now automatically reads concurrency settings from the database:

1. **Global User Concurrency**: From `users_temp.serverConcurrency` field 
   - Controls the **TOTAL** number of deployments that can run simultaneously for a user
   - Example: If `serverConcurrency = 1`, only 1 deployment across ALL services at a time
   - Example: If `serverConcurrency = 3`, maximum 3 deployments can run simultaneously across all services

2. **Server Concurrency**: From `server.concurrency` field
   - Controls how many deployments can run simultaneously **on a specific server**
   - Only applies when deploying to remote servers (`serverId` is present)
   - Example: Server A can handle 2 concurrent deployments, Server B can handle 1

### Concurrency Hierarchy

```
User Global Limit (users_temp.serverConcurrency)
├── dokploy-server (local deployments)
│   ├── App A deployment
│   ├── App B deployment  
│   └── Compose C deployment
├── remote-server-1 (server.concurrency = 2)
│   ├── App D deployment
│   └── App E deployment
└── remote-server-2 (server.concurrency = 1)
    └── App F deployment
```

**Example Scenarios:**

- **User has `serverConcurrency = 1`**: Only 1 deployment total across ALL servers
- **User has `serverConcurrency = 3`**: Maximum 3 deployments simultaneously across all servers
- **Local server**: All local apps/compose share the "dokploy-server" queue
- **Remote server with `concurrency = 2`**: That server can handle up to 2 concurrent deployments
- **Queue grouping**: `app-123` and `app-456` on same server share the same queue

## Configuration

- **Global Concurrency**: Set how many services can deploy simultaneously
- **Service Concurrency**: Each service processes 1 deployment at a time (FIFO)

```typescript
import { setGlobalConcurrency } from './service-queue';

// Allow 5 services to deploy simultaneously
setGlobalConcurrency(5);
```

## Migration Notes

- The schedules app still uses BullMQ for cron/repeatable jobs (different use case)
- All existing API endpoints work unchanged due to compatibility layer
- No breaking changes to existing functionality
- Improved resource usage and cancellation capabilities
