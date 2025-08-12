# Webhooks Implementation Documentation

This document provides a comprehensive overview of the deployment webhook feature implemented in Dokploy.

## Overview

The webhook feature enables real-time notifications for deployment events. Users can configure webhooks to receive HTTP POST requests when specific deployment events occur (start, success, failure, cancellation).

## Features

- **Event Types**: Support for deployment lifecycle events
  - `deployment.started` - When deployment begins
  - `deployment.success` - When deployment completes successfully
  - `deployment.failed` - When deployment fails
  - `deployment.cancelled` - When deployment is cancelled

- **Template Support**: Multiple payload formats
  - Generic JSON - Standard webhook payload
  - Slack - Formatted for Slack incoming webhooks
  - n8n - Optimized for n8n workflow automation

- **Security**: HMAC-SHA256 signature validation using optional secrets
- **Customization**: Custom headers and template overrides
- **Reliability**: Retry mechanism with exponential backoff
- **Management**: Full CRUD operations via UI and API

## Database Schema

### Webhooks Table
```sql
CREATE TABLE webhook (
  webhookId TEXT PRIMARY KEY,
  applicationId TEXT REFERENCES application(applicationId),
  composeId TEXT REFERENCES compose(composeId), 
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  templateType TEXT NOT NULL DEFAULT 'generic',
  events JSON NOT NULL DEFAULT '[]',
  headers JSON DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP NOT NULL DEFAULT now()
);
```

### Webhook Deliveries Table  
```sql
CREATE TABLE webhook_deliveries (
  deliveryId TEXT PRIMARY KEY,
  webhookId TEXT NOT NULL REFERENCES webhook(webhookId),
  eventType TEXT NOT NULL,
  status TEXT NOT NULL,
  httpStatus INTEGER,
  request TEXT,
  response TEXT,
  error TEXT,
  deliveredAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT now()
);
```

## API Endpoints

### TRPC Router: `/api/trpc/webhook`

- `create` - Create new webhook
- `update` - Update existing webhook  
- `delete` - Delete webhook
- `findById` - Get webhook by ID
- `findByApplication` - Get webhooks for application
- `findByCompose` - Get webhooks for compose service
- `test` - Send test webhook
- `toggle` - Enable/disable webhook
- `getStats` - Get webhook statistics
- `getDeliveries` - Get delivery history

### Example API Usage

#### Create Webhook
```typescript
const webhook = await api.webhook.create.mutate({
  applicationId: "app-123",
  name: "Slack Notifications",
  url: "https://hooks.slack.com/services/...",
  secret: "my-secret-key",
  templateType: "slack",
  events: ["deployment.success", "deployment.failed"],
  headers: {
    "Content-Type": "application/json"
  }
});
```

#### Test Webhook
```typescript
await api.webhook.test.mutate({
  webhookId: "webhook-123"
});
```

## Payload Templates

### Generic Template
```json
{
  "event": "deployment.success",
  "timestamp": "2024-08-12T10:00:00.000Z",
  "deployment": {
    "id": "deploy-123",
    "applicationId": "app-456",
    "applicationName": "My Application", 
    "status": "success",
    "createdAt": "2024-08-12T09:58:00.000Z",
    "logPath": "/var/logs/deploy-123.log"
  },
  "webhook": {
    "id": "webhook-789",
    "name": "My Webhook"
  }
}
```

### Slack Template
```json
{
  "text": "Deployment Successful ✅",
  "attachments": [{
    "color": "#36a64f",
    "fields": [
      {
        "title": "Application",
        "value": "My Application",
        "short": true
      },
      {
        "title": "Status", 
        "value": "✅ Success",
        "short": true
      }
    ],
    "footer": "Dokploy",
    "ts": 1691832000
  }]
}
```

### n8n Template
```json
{
  "event": "deployment.success",
  "data": {
    "deployment": {
      "id": "deploy-123",
      "applicationId": "app-456",
      "applicationName": "My Application",
      "status": "success",
      "createdAt": "2024-08-12T09:58:00.000Z"
    },
    "timestamp": "2024-08-12T10:00:00.000Z"
  }
}
```

## Security

### HMAC Signature Validation
When a secret is configured, webhooks include an HMAC-SHA256 signature header:

```
X-Dokploy-Signature-256: sha256=<hmac-sha256-hash>
```

### Verification Example (Node.js)
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  const expectedSignature = `sha256=${computedSignature}`;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

## Implementation Details

### Service Integration
Webhooks are triggered from the deployment service at key lifecycle points:

```typescript
// In deployment service
export const createDeployment = async (data: DeploymentData) => {
  const deployment = await db.insert(deployments).values(data);
  
  // Trigger webhook
  await triggerWebhooks('deployment.started', deployment);
  
  return deployment;
};

export const updateDeploymentStatus = async (id: string, status: string) => {
  const deployment = await db.update(deployments)
    .set({ status })
    .where(eq(deployments.deploymentId, id));
    
  // Trigger appropriate webhook based on status
  const eventType = status === 'success' ? 'deployment.success' 
                  : status === 'error' ? 'deployment.failed'
                  : status === 'cancelled' ? 'deployment.cancelled'
                  : null;
                  
  if (eventType) {
    await triggerWebhooks(eventType, deployment);
  }
  
  return deployment;
};
```

### Error Handling & Retries
The webhook service includes robust error handling:

- HTTP timeouts (30 seconds)
- Retry mechanism with exponential backoff
- Delivery status tracking
- Error logging and monitoring

### UI Components

#### Webhook Management (`show-webhooks.tsx`)
- List all configured webhooks
- Enable/disable toggles
- Test webhook functionality
- Delete confirmations
- Delivery history access

#### Webhook Form (`handle-webhook.tsx`)
- Create/edit webhook configuration
- Template type selection
- Event type checkboxes
- Custom headers management
- Secret configuration

#### Delivery History (`show-webhook-deliveries.tsx`)
- View delivery attempts
- HTTP status codes
- Request/response details
- Error messages
- Retry information

## Testing

### Unit Tests
Located in `__test__/webhook/webhook-basic.test.ts`:

- URL validation (HTTPS requirement)
- Event type validation
- Template type validation
- Webhook name validation
- Payload structure validation

### Running Tests
```bash
npm test webhook
```

### Manual Testing
1. Create webhook with test endpoint (e.g., webhook.site)
2. Configure events and template
3. Use "Send Test" button to verify payload
4. Deploy application to test real events
5. Check delivery history for results

## Configuration

### Environment Variables
No additional environment variables required. Webhooks use the existing database and HTTP client.

### Performance Considerations
- Webhooks are processed asynchronously to avoid blocking deployments
- Failed webhooks are retried with exponential backoff
- Delivery history is automatically cleaned up (configurable retention)

## Troubleshooting

### Common Issues

1. **Webhook not firing**
   - Check webhook is enabled
   - Verify event types are configured
   - Check application/compose service association

2. **Payload not reaching endpoint**
   - Verify URL is HTTPS and accessible
   - Check firewall/network restrictions
   - Review delivery history for HTTP errors

3. **Signature validation failing**
   - Ensure secret matches on both ends
   - Verify HMAC calculation implementation
   - Check for encoding/charset issues

### Debugging
- Use webhook test functionality for quick validation
- Check delivery history for detailed error messages
- Monitor application logs during deployment
- Use webhook.site or similar tools for payload inspection

## Future Enhancements

### Planned Features
- Additional template types (Discord, Microsoft Teams)
- Webhook endpoint health monitoring
- Advanced filtering and routing
- Bulk webhook management
- Webhook analytics and metrics

### Integration Possibilities
- CI/CD pipeline notifications
- Monitoring system alerts
- Chat platform integrations
- Custom workflow automation

## Contributing

When extending webhook functionality:

1. Add unit tests for new features
2. Update this documentation
3. Consider backward compatibility
4. Test with all template types
5. Validate security implications

## Support

For webhook-related issues:
1. Check delivery history in the UI
2. Review application logs
3. Test webhook endpoint independently
4. Verify configuration matches documentation