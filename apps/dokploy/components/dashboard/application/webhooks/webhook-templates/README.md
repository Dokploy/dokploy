# Webhook Templates System

This directory contains the enhanced webhook template system for n8n and Slack integrations in Dokploy.

## Overview

The webhook templates provide optimized payload structures and rich formatting for popular platforms:
- **n8n**: Flattened data structure optimized for workflow automation
- **Slack**: Block Kit formatted messages with rich interactive components
- **Generic**: Customizable template with variable substitution

## Features

### n8n Template
- Flattened payload structure for easy n8n workflow processing
- Workflow recommendations based on event type
- Dynamic priority and retryability detection
- Comprehensive tagging system
- Branch and severity filtering
- Custom transformation scripts support

### Slack Template
- Block Kit structure with rich formatting
- Event-specific templates (success/failure/started/cancelled)
- Mention support (@users, @groups, @channel)
- Thread support with configurable strategies
- Interactive action buttons
- Error suggestions and solutions
- Commit history and metrics display

## Usage

### Integration with Existing Webhook Service

```typescript
import { 
  formatWebhookPayload, 
  shouldTriggerWebhook,
  getWebhookHeaders,
  getRetryConfig 
} from './webhook-templates';

// Format payload using the new template system
const payload = formatWebhookPayload(webhook, event, platformConfig);

// Check if webhook should be triggered based on configuration
if (shouldTriggerWebhook(webhook, event, platformConfig)) {
  // Get platform-specific headers
  const headers = getWebhookHeaders(webhook, payload, signature);
  
  // Send webhook with platform-specific retry config
  const retryConfig = getRetryConfig(webhook.templateType);
  // ... send webhook
}
```

### Using Configuration Forms

```tsx
import { N8nConfigForm, SlackConfigForm } from './webhook-templates';

// For n8n webhooks
<N8nConfigForm 
  config={existingConfig}
  onSubmit={(config) => {
    // Save configuration
  }}
/>

// For Slack webhooks
<SlackConfigForm
  config={existingConfig}
  onSubmit={(config) => {
    // Save configuration
  }}
/>
```

### Template Preview

```tsx
import { TemplatePreview } from './webhook-templates';

<TemplatePreview
  templateType="slack"
  platformConfig={config}
  context={sampleContext}
/>
```

## Configuration Storage

Since the webhook schema doesn't have a `platformConfig` field, platform-specific configurations should be stored separately or in a related table. The enhanced service functions accept platformConfig as a parameter to maintain flexibility.

### Option 1: Store in Custom Template Field
For simple configurations, you can serialize the platform config as JSON in the `customTemplate` field:

```typescript
const webhook = {
  templateType: 'n8n',
  customTemplate: JSON.stringify({
    platformConfig: n8nConfig
  })
};
```

### Option 2: Create Platform Config Table
For more complex needs, create a separate table:

```sql
CREATE TABLE webhook_platform_config (
  configId TEXT PRIMARY KEY,
  webhookId TEXT REFERENCES webhook(webhookId),
  platformType TEXT NOT NULL,
  config JSON NOT NULL
);
```

## Testing

Run tests with:
```bash
npm test webhook-templates
```

## File Structure

- `types.ts` - TypeScript type definitions
- `schemas.ts` - Zod validation schemas
- `n8n-template.ts` - n8n payload generator
- `slack-template.ts` - Slack Block Kit generator
- `payload-generator.ts` - Main payload generation logic
- `template-factory.ts` - Template registration and management
- `enhanced-webhook-service.ts` - Service layer integration
- `template-config-form.tsx` - React configuration forms
- `template-preview.tsx` - Visual preview component
- `templates.test.ts` - Comprehensive test suite

## Migration Guide

To migrate existing webhooks to use the new templates:

1. Identify webhook platform from URL pattern
2. Set appropriate `templateType` ('n8n', 'slack', or 'generic')
3. Configure platform-specific settings
4. Test with preview component
5. Save configuration

## Examples

### n8n Webhook Configuration
```typescript
{
  url: "https://n8n.example.com/webhook/abc123",
  secret: "optional-hmac-secret",
  includeMetrics: true,
  includeLogs: true,
  logLines: 50,
  minimumSeverity: "warning",
  branches: ["main", "production"]
}
```

### Slack Webhook Configuration
```typescript
{
  url: "https://hooks.slack.com/services/xxx",
  mentionOn: {
    failure: true,
    success: false,
    users: ["U123456"],
    groups: ["S789012"]
  },
  threadingEnabled: true,
  threadingStrategy: "per-app",
  includeMetrics: true,
  enableActions: true
}
```

## Future Enhancements

- Discord webhook templates
- Microsoft Teams templates
- Email notification templates
- Webhook marketplace for sharing templates
- AI-powered error diagnostics
- Visual template builder UI