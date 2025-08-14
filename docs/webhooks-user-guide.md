# Webhook User Guide

This guide shows you how to set up and use webhooks in Dokploy to receive deployment notifications.

## What are Webhooks?

Webhooks allow you to receive real-time HTTP notifications when your deployments start, succeed, fail, or are cancelled. This enables you to:

- Get Slack notifications when deployments complete
- Trigger automated workflows in n8n or Zapier
- Integrate with monitoring systems
- Send custom notifications to your team

## Setting Up Your First Webhook

### Step 1: Access Webhook Settings

1. Navigate to your application in the Dokploy dashboard
2. Click on the **Webhooks** tab
3. Click the **Create Webhook** button

### Step 2: Configure Basic Settings

**Webhook Name**: Give your webhook a descriptive name like "Production Slack Alerts"

**Webhook URL**: Enter your endpoint URL (must be HTTPS)
- For Slack: Use your Slack webhook URL from the app configuration
- For n8n: Use your n8n webhook trigger URL
- For custom endpoints: Use your server's HTTPS endpoint

**Template Type**: Choose the format for your webhook payload:
- **Generic**: Standard JSON format for custom integrations
- **Slack**: Pre-formatted for Slack incoming webhooks  
- **n8n**: Optimized structure for n8n workflows

### Step 3: Select Events

Choose which deployment events should trigger your webhook:

- ☑️ **Deployment Started** - When deployment begins
- ☑️ **Deployment Success** - When deployment completes successfully  
- ☑️ **Deployment Failed** - When deployment fails
- ☑️ **Deployment Cancelled** - When deployment is cancelled

### Step 4: Configure Security (Optional)

**Secret Key**: Add a secret key to verify webhook authenticity
- Recommended for production environments
- Used to generate HMAC-SHA256 signatures
- Your endpoint can verify the signature to ensure requests are from Dokploy

**Custom Headers**: Add any required HTTP headers
- Authentication tokens
- Content-type overrides  
- Custom identifiers

### Step 5: Test Your Webhook

1. Click **Send Test** to verify your configuration
2. Check your endpoint receives the test payload
3. Review the delivery history for any errors

## Popular Integration Examples

### Slack Notifications

**Setup**:
1. Create a Slack app and enable incoming webhooks
2. Copy your webhook URL from Slack
3. In Dokploy, set template type to "Slack"
4. Select your desired events

**Result**: You'll receive formatted messages in your Slack channel:
```
🚀 Deployment Started
Application: My Web App
Status: ⏳ In Progress
```

### n8n Automation

**Setup**:
1. Create a webhook trigger node in n8n
2. Copy the webhook URL
3. In Dokploy, set template type to "n8n"
4. Configure your desired events

**Use Cases**:
- Send emails on deployment failures
- Update project management tools
- Trigger additional deployments
- Log events to databases

### Custom Monitoring

**Setup**:
1. Set template type to "Generic"
2. Use your monitoring system's webhook endpoint
3. Configure a secret for security
4. Select all events for comprehensive monitoring

**Payload Structure**:
```json
{
  "event": "deployment.success",
  "timestamp": "2024-08-12T10:00:00.000Z",
  "deployment": {
    "id": "deploy-123",
    "applicationName": "My App",
    "status": "success"
  }
}
```

## Managing Webhooks

### Enabling/Disabling

Use the toggle switch next to each webhook to quickly enable or disable it without deleting the configuration.

### Viewing Delivery History

1. Click on any webhook in your list
2. View the **Delivery History** tab
3. See delivery attempts, HTTP status codes, and error messages
4. Use this for troubleshooting failed deliveries

### Editing Webhooks

1. Click the **Edit** button on any webhook
2. Modify settings as needed
3. Test the updated configuration
4. Save your changes

### Testing Webhooks

Use the **Send Test** button to:
- Verify your endpoint is reachable
- Check payload format
- Test authentication/headers
- Validate your webhook processing logic

## Troubleshooting

### Webhook Not Firing

**Check**: Is the webhook enabled?
**Solution**: Toggle the webhook on in the dashboard

**Check**: Are the right events selected?  
**Solution**: Edit webhook and verify event checkboxes

**Check**: Is the application correctly associated?
**Solution**: Webhooks are per-application - ensure you're configuring the right app

### Endpoint Not Receiving Payloads

**Check**: Is your URL accessible via HTTPS?
**Solution**: Test your endpoint with tools like curl or Postman

**Check**: Are there firewall restrictions?
**Solution**: Ensure your server can receive requests from Dokploy

**Check**: Is your endpoint returning proper status codes?
**Solution**: Return 2xx status codes for successful webhook receipt

### Authentication Issues  

**Check**: Is the secret configured correctly on both ends?
**Solution**: Verify your HMAC signature validation logic

**Check**: Are custom headers being sent?
**Solution**: Review delivery history to see actual headers sent

### Payload Format Issues

**Check**: Is the template type correct for your use case?
**Solution**: Switch between Generic, Slack, and n8n templates as needed

**Check**: Are you parsing JSON correctly?
**Solution**: Verify your endpoint handles the payload format properly

## Security Best Practices

### Use HTTPS Only
- Webhook URLs must use HTTPS
- Never use HTTP for webhook endpoints
- Protects payload data in transit

### Configure Secrets
- Add secret keys to all production webhooks
- Verify HMAC signatures in your endpoint
- Rotate secrets regularly

### Validate Payloads
- Check signature headers before processing
- Validate payload structure
- Sanitize any data before using it

### Monitor Access
- Log webhook delivery attempts
- Monitor for failed authentications
- Set up alerts for suspicious activity

## Advanced Usage

### Custom Templates

For specialized integrations, you can:
1. Start with the Generic template
2. Use custom headers to modify behavior
3. Process the payload in your endpoint as needed

### Multiple Webhooks

You can configure multiple webhooks per application:
- Different endpoints for different events
- Separate webhooks for different environments  
- Backup webhooks for reliability

### Filtering Events

Configure different webhooks for different event types:
- Success-only webhook for celebrations
- Failure-only webhook for alerts
- All events for comprehensive logging

## Getting Help

If you encounter issues:

1. **Check Delivery History**: View detailed error messages and HTTP responses
2. **Test Your Endpoint**: Use the Send Test feature to verify basic connectivity
3. **Review Logs**: Check your application logs for webhook-related errors
4. **Documentation**: Refer to the technical implementation documentation
5. **Community**: Ask questions in the Dokploy community channels

## Common Use Cases

### DevOps Notifications
- Slack alerts for failed deployments
- Email notifications for production deployments
- PagerDuty integration for critical failures

### Workflow Automation  
- Trigger end-to-end tests after successful deployment
- Update deployment tracking systems
- Notify QA teams when staging is ready

### Analytics & Monitoring
- Log deployment events to analytics platforms
- Update deployment dashboards
- Track deployment frequency and success rates

### Team Collaboration
- Update project management tools (Jira, Trello)
- Send Microsoft Teams notifications
- Trigger documentation updates

## Tips for Success

1. **Start Simple**: Begin with a basic Slack integration to understand the flow
2. **Test Thoroughly**: Always use the Send Test feature before relying on webhooks
3. **Monitor Deliveries**: Regularly check delivery history for issues
4. **Use Secrets**: Implement signature verification for security
5. **Handle Failures**: Design your endpoints to handle webhook delivery retries gracefully

With webhooks configured, you'll have real-time visibility into your deployment pipeline and can automate your DevOps workflows effectively!