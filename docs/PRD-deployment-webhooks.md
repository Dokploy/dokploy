# Product Requirements Document: Deployment Status Webhooks

## Executive Summary
This document outlines the requirements for implementing deployment status webhooks in Dokploy, enabling external systems to receive real-time notifications about deployment lifecycle events.

## Problem Statement
Currently, Dokploy lacks the ability to notify external systems about deployment events (start, success, failure, cancellation). Users need this functionality to:
- Integrate with external monitoring and alerting systems
- Trigger automated workflows based on deployment status
- Maintain audit logs in external systems
- Build custom dashboards and reporting

## Goals & Objectives
- Provide webhook notifications for all deployment lifecycle events
- Support multiple webhook templates (Slack, n8n, generic JSON)
- Ensure reliable delivery with retry mechanisms
- Enable per-application webhook configuration
- Maintain security through signature validation
- Full internationalization (i18n) support for UI components
- Comprehensive unit test coverage (>80%)
- Extensive documentation with real-world examples
- Integration with Context7 MCP server for enhanced documentation

## Scope

### In Scope
- Webhook notifications for deployment events (start, success, error, cancel)
- Support for applications and compose projects
- Webhook templates for Slack and n8n
- Custom webhook URL configuration
- Webhook secret for signature validation
- Retry mechanism with exponential backoff
- UI for webhook management with full i18n support
- Webhook testing functionality
- Comprehensive unit tests for all services
- User and developer documentation
- Context7 MCP server integration for real-time documentation

### Out of Scope
- Webhook notifications for non-deployment events
- Built-in integrations beyond webhooks
- Webhook analytics and metrics (initially)
- Rate limiting for webhook calls

## User Stories

### As a DevOps Engineer
- I want to receive Slack notifications when deployments start/complete
- I want to trigger n8n workflows based on deployment status
- I want to integrate deployment events with my monitoring system

### As a System Administrator
- I want to configure different webhooks for different applications
- I want to test webhook configurations before enabling them
- I want to see webhook delivery logs for troubleshooting

## Technical Requirements

### Database Schema

#### New Table: `application_webhooks`
```sql
CREATE TABLE application_webhooks (
  webhookId TEXT PRIMARY KEY,
  applicationId TEXT REFERENCES applications(applicationId),
  composeId TEXT REFERENCES compose(composeId),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  templateType TEXT DEFAULT 'generic', -- 'slack', 'n8n', 'generic'
  customTemplate TEXT, -- For custom JSON templates
  events TEXT[], -- ['deploy_started', 'deploy_success', 'deploy_failed', 'deploy_cancelled']
  headers JSON, -- Custom headers
  enabled BOOLEAN DEFAULT true,
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);
```

### Webhook Events

#### 1. `deployment.started`
Triggered when a deployment begins
- Timing: After `createDeployment()` in deployment service
- Payload: Basic deployment info, application details, trigger source

#### 2. `deployment.success`
Triggered when deployment completes successfully
- Timing: When `updateDeploymentStatus()` sets status to "done"
- Payload: Full deployment details, duration, URLs, domains

#### 3. `deployment.failed`
Triggered when deployment fails
- Timing: When `updateDeploymentStatus()` sets status to "error"
- Payload: Error details, logs snippet, failure stage

#### 4. `deployment.cancelled`
Triggered when deployment is manually cancelled
- Timing: On manual cancellation action
- Payload: Cancellation reason, partial progress

### Webhook Payload Structure

#### Generic JSON Format
```json
{
  "event": "deployment.started|success|failed|cancelled",
  "timestamp": "ISO-8601",
  "deployment": {
    "id": "deploymentId",
    "status": "running|done|error",
    "startedAt": "ISO-8601",
    "finishedAt": "ISO-8601",
    "duration": "seconds"
  },
  "application": {
    "id": "applicationId",
    "name": "app-name",
    "type": "application|compose",
    "url": "https://app.example.com",
    "domains": []
  },
  "project": {
    "id": "projectId",
    "name": "project-name"
  },
  "source": {
    "type": "github|gitlab|docker|git",
    "branch": "main",
    "commit": "abc123",
    "repository": "owner/repo"
  },
  "trigger": {
    "type": "webhook|manual|schedule",
    "triggeredBy": "user|system"
  },
  "error": {
    "message": "error message",
    "stage": "build|deploy",
    "logs": "last 50 lines"
  }
}
```

### Webhook Service Implementation

#### Location: `packages/server/src/services/webhook.ts`

```typescript
interface WebhookService {
  // CRUD operations
  createWebhook(data: WebhookData): Promise<Webhook>
  updateWebhook(id: string, data: Partial<WebhookData>): Promise<Webhook>
  deleteWebhook(id: string): Promise<void>
  findWebhooksByApplication(applicationId: string): Promise<Webhook[]>
  
  // Webhook execution
  triggerWebhooks(event: WebhookEvent, payload: WebhookPayload): Promise<void>
  sendWebhook(webhook: Webhook, payload: WebhookPayload): Promise<WebhookResult>
  
  // Testing
  testWebhook(webhookId: string): Promise<TestResult>
  
  // Retry logic
  retryWebhook(webhookId: string, payload: WebhookPayload, attempt: number): Promise<void>
}
```

### Integration Points

#### 1. Deployment Creation
- Hook location: `packages/server/src/services/deployment.ts`
- Function: `createDeployment()`, `createDeploymentCompose()`
- Action: Trigger `deployment.started` webhook

#### 2. Status Updates
- Hook location: `packages/server/src/services/deployment.ts`
- Function: `updateDeploymentStatus()`
- Action: Trigger appropriate webhook based on new status

#### 3. Queue Worker
- Location: Queue worker processing deployment jobs
- Action: Handle webhook calls asynchronously to avoid blocking deployments

### Webhook Templates

#### Slack Template
See Slack webhook template in plan section above

#### n8n Template
See n8n webhook template in plan section above

### Security Considerations

1. **HMAC Signature Validation**
   - Generate signature using webhook secret
   - Include signature in `X-Dokploy-Signature` header
   - Validate on receiver side

2. **Secret Storage**
   - Store webhook secrets encrypted in database
   - Never expose secrets in API responses

3. **URL Validation**
   - Validate webhook URLs are valid HTTPS endpoints
   - Prevent SSRF attacks by blocking internal IPs

4. **Rate Limiting**
   - Implement per-application webhook rate limits
   - Maximum 100 webhook calls per minute per application

### UI Components

#### Internationalization (i18n) Requirements
All UI components MUST support full internationalization using the existing Dokploy i18n system:
- Use `next-i18next` with `useTranslation` hook
- Translation keys follow existing pattern: `webhook.management.title`, `webhook.form.name`, etc.
- Support all existing languages in `@/lib/languages`
- Fallback to English for missing translations
- Date/time formatting respects locale settings

#### Webhook Management Page
Location: Application Settings → Webhooks

Features:
- List configured webhooks (i18n: `webhook.list.title`)
- Add/Edit/Delete webhooks (i18n: `webhook.actions.*`)
- Enable/Disable toggle (i18n: `webhook.status.*`)
- Test webhook button (i18n: `webhook.test.button`)
- View recent webhook deliveries (i18n: `webhook.deliveries.title`)

#### Webhook Configuration Form
Fields (all with i18n labels and placeholders):
- Name (required) - i18n: `webhook.form.name`
- URL (required, HTTPS only) - i18n: `webhook.form.url`
- Secret (optional, auto-generated) - i18n: `webhook.form.secret`
- Template (Slack/n8n/Custom) - i18n: `webhook.form.template`
- Events (multi-select checkboxes) - i18n: `webhook.form.events.*`
- Custom Headers (key-value pairs) - i18n: `webhook.form.headers`
- Custom Template Editor (if template = custom) - i18n: `webhook.form.customTemplate`

Example i18n implementation:
```tsx
import { useTranslation } from 'next-i18next';

export const WebhookForm = () => {
  const { t } = useTranslation('webhook');
  
  return (
    <Form>
      <FormField
        label={t('form.name')}
        placeholder={t('form.namePlaceholder')}
        error={t('form.nameError')}
      />
    </Form>
  );
}

### API Endpoints

```typescript
// TRPC Router: webhook.ts
{
  create: protectedProcedure.input(createWebhookSchema).mutation(),
  update: protectedProcedure.input(updateWebhookSchema).mutation(),
  delete: protectedProcedure.input(deleteWebhookSchema).mutation(),
  findByApplication: protectedProcedure.input(findSchema).query(),
  test: protectedProcedure.input(testSchema).mutation(),
  getDeliveries: protectedProcedure.input(deliveriesSchema).query()
}
```

### Retry Strategy

1. **Initial Attempt**: Immediate
2. **First Retry**: After 30 seconds
3. **Second Retry**: After 2 minutes  
4. **Third Retry**: After 5 minutes
5. **Failure**: Log error and mark webhook delivery as failed

Retry conditions:
- Network errors
- 5xx status codes
- Timeout (10 seconds)

Don't retry on:
- 4xx status codes (except 429)
- Invalid URL
- DNS resolution failures

### Monitoring & Logging

#### Webhook Delivery Log
Store last 100 deliveries per webhook:
- Timestamp
- Event type
- HTTP status code
- Response time
- Error message (if failed)
- Retry attempts

#### Metrics to Track
- Total webhooks configured
- Successful deliveries
- Failed deliveries
- Average response time
- Retry rate

## Success Criteria

1. Webhooks fire reliably for all deployment events
2. Less than 1% webhook delivery failure rate
3. Average webhook delivery time < 2 seconds
4. UI allows easy webhook management
5. Support for at least 10 webhooks per application

## Migration Plan

1. Create database migration for new webhook table
2. No breaking changes to existing functionality
3. Feature flag for gradual rollout
4. Documentation and examples for webhook integration

## Timeline

### Phase 1: Core Implementation (Week 1-2)
- Database schema and migrations
- Webhook service implementation
- Integration with deployment flow
- Basic retry mechanism

### Phase 2: Templates & UI (Week 3)
- Slack and n8n templates
- Template variable substitution
- UI components for webhook management
- Test webhook functionality

### Phase 3: Testing & Documentation (Week 4)
- Comprehensive unit testing
- Integration testing
- User documentation
- Developer documentation with Context7
- Example integrations
- Performance optimization

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Webhook calls slow down deployments | Execute webhooks asynchronously via queue |
| Webhook endpoints become unavailable | Implement retry with exponential backoff |
| Security vulnerabilities (SSRF) | Validate URLs, block internal IPs |
| High volume of webhook calls | Implement rate limiting |
| Webhook secrets exposed | Encrypt secrets, never return in API |

## Open Questions

1. Should we support webhook batching for high-frequency events?
2. Should we implement webhook signature verification for incoming webhooks?
3. Should we support GraphQL subscriptions as an alternative to webhooks?
4. Should webhook history be retained indefinitely or have a retention policy?

## Unit Testing Strategy

### Test Coverage Requirements
- Minimum 80% code coverage for new code
- 100% coverage for critical paths (webhook delivery, retry logic)
- Test framework: Jest/Vitest (following existing Dokploy patterns)

### Test Categories

#### 1. Service Tests (`webhook.service.test.ts`)
```typescript
describe('WebhookService', () => {
  describe('CRUD Operations', () => {
    test('should create webhook with valid data');
    test('should reject webhook with invalid URL');
    test('should update webhook configuration');
    test('should delete webhook and cascade deliveries');
  });
  
  describe('Webhook Execution', () => {
    test('should send webhook with correct payload');
    test('should include HMAC signature in headers');
    test('should handle network errors with retry');
    test('should respect retry limits');
    test('should handle timeout correctly');
  });
  
  describe('Template Processing', () => {
    test('should process Slack template correctly');
    test('should process n8n template correctly');
    test('should substitute variables in custom template');
    test('should handle missing variables gracefully');
  });
});
```

#### 2. Integration Tests
- Test webhook triggering from deployment flow
- Test async queue processing
- Test database transactions
- Test i18n in UI components

#### 3. UI Component Tests
```typescript
describe('WebhookForm', () => {
  test('should render with correct i18n translations');
  test('should validate required fields');
  test('should generate secret automatically');
  test('should show/hide custom template editor');
  test('should handle form submission');
});
```

## Documentation Strategy

### User Documentation

#### Location: `/docs/webhooks/`

1. **Getting Started Guide** (`getting-started.md`)
   - What are deployment webhooks?
   - Quick setup guide
   - Common use cases

2. **Configuration Guide** (`configuration.md`)
   - Detailed field explanations
   - Template selection guide
   - Security best practices

3. **Integration Examples** (`examples/`)
   - Slack integration walkthrough
   - n8n workflow examples
   - Custom integrations (Datadog, PagerDuty, etc.)

4. **Troubleshooting** (`troubleshooting.md`)
   - Common issues and solutions
   - Webhook delivery debugging
   - Log interpretation

### Developer Documentation

#### Enhanced with Context7 MCP Server

When developers write prompts including "use context7", the system will:
- Fetch latest Dokploy webhook API documentation
- Provide version-specific code examples
- Include real-time updates from the official docs

#### API Reference (`api-reference.md`)
```typescript
// use context7
// Automatically includes latest webhook API documentation
// with current schema definitions and examples
```

#### Code Examples
```typescript
// Example: Custom webhook integration
// use context7 - fetches latest webhook service interfaces

import { WebhookService } from '@dokploy/server/services/webhook';

export const customIntegration = async (webhook: Webhook) => {
  // Context7 provides current WebhookService methods
  const service = new WebhookService();
  const result = await service.sendWebhook(webhook, payload);
  // ...
};
```

### i18n Translation Files

#### Location: `/public/locales/[locale]/webhook.json`

Example structure for each supported language:
```json
{
  "management": {
    "title": "Webhook Management",
    "description": "Configure webhooks for deployment notifications",
    "empty": "No webhooks configured"
  },
  "form": {
    "name": "Webhook Name",
    "namePlaceholder": "My Slack Webhook",
    "nameError": "Name is required",
    "url": "Webhook URL",
    "urlPlaceholder": "https://hooks.slack.com/...",
    "urlError": "Valid HTTPS URL required",
    "secret": "Webhook Secret",
    "secretHint": "Used for signature validation",
    "template": "Template Type",
    "events": {
      "title": "Trigger Events",
      "started": "Deployment Started",
      "success": "Deployment Success",
      "failed": "Deployment Failed",
      "cancelled": "Deployment Cancelled"
    }
  },
  "actions": {
    "create": "Create Webhook",
    "edit": "Edit Webhook",
    "delete": "Delete Webhook",
    "test": "Test Webhook",
    "enable": "Enable",
    "disable": "Disable"
  },
  "status": {
    "enabled": "Enabled",
    "disabled": "Disabled",
    "testing": "Testing...",
    "lastDelivery": "Last delivery: {{time}}"
  },
  "deliveries": {
    "title": "Recent Deliveries",
    "success": "Success",
    "failed": "Failed",
    "pending": "Pending",
    "retrying": "Retrying ({{attempt}}/3)"
  },
  "test": {
    "button": "Send Test Webhook",
    "success": "Test webhook sent successfully",
    "failure": "Test webhook failed: {{error}}"
  }
}
```

## Context7 MCP Server Integration

### Purpose
Context7 MCP (Model Context Protocol) server provides real-time, version-specific documentation directly into the development workflow. When implemented, it ensures developers always work with the most current API specifications and examples.

### Implementation

#### 1. MCP Server Configuration
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["@context7/mcp-server"],
      "env": {
        "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"
      }
    }
  }
}
```

#### 2. Documentation Annotations
Mark code sections that should be enhanced with Context7:
```typescript
/**
 * @context7 webhook-service
 * Webhook Service implementation
 * use context7 for latest API documentation
 */
export class WebhookService {
  // Implementation
}
```

#### 3. Benefits for Developers
- **Always Current**: Documentation updates automatically with code changes
- **Version Aware**: Get documentation specific to the Dokploy version
- **Code Examples**: Real, working examples from the current codebase
- **IDE Integration**: Works with MCP-compatible editors (Claude Desktop, Cursor, Windsurf)

#### 4. Usage in Development
```typescript
// Developer prompt: "use context7 webhook implementation"
// Returns: Current webhook service interface, recent changes, 
// migration guides, and working examples from the codebase
```

## Appendix

### Example Webhook Integrations

#### Slack Integration
```javascript
// Slack Incoming Webhook URL format
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
```

#### n8n Webhook Node
```javascript
// n8n Webhook URL format
https://n8n.example.com/webhook/deployment-status
```

### Variable Reference
All webhook templates support the following variables:
- `${applicationId}`, `${applicationName}`, `${applicationType}`
- `${projectId}`, `${projectName}`
- `${deploymentId}`, `${status}`
- `${branch}`, `${commitHash}`, `${repository}`
- `${startedAt}`, `${finishedAt}`, `${duration}`
- `${errorMessage}`, `${failedStage}`
- `${logsUrl}`, `${applicationUrl}`
- `${domains}` (JSON array)
- `${triggeredBy}` (webhook|manual|schedule)