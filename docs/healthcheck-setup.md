# Healthcheck Setup Guide

This guide explains how to set up healthchecks for your applications in Dokploy. Healthchecks are essential for ensuring your applications are running correctly and for enabling automatic restarts when they fail.

## What is a Healthcheck?

A healthcheck is a way to verify that your application is running correctly. It typically involves:

1. **Checking if the application is responding** (e.g., HTTP endpoint)
2. **Verifying the application is healthy** (e.g., database connection)
3. **Monitoring resource usage** (e.g., memory, CPU)

## Why Use Healthchecks?

- **Automatic Recovery**: Automatically restart failed applications
- **Load Balancing**: Only route traffic to healthy instances
- **Monitoring**: Get notified when applications are unhealthy
- **Zero Downtime**: Enable rolling updates without service interruption

## Healthcheck Configuration in Dokploy

### Understanding the UI

The Dokploy UI has two main fields for healthcheck configuration:

1. **Command**: The command to run for the healthcheck
2. **Arguments**: Additional arguments for the command

### Common Healthcheck Commands

#### 1. HTTP Healthcheck

Check if your application is responding to HTTP requests:

```bash
curl -f http://localhost:3000/health
```

**Configuration:**
- **Command**: `curl`
- **Arguments**: `-f http://localhost:3000/health`

#### 2. TCP Port Check

Check if a port is open:

```bash
nc -z localhost 3000
```

**Configuration:**
- **Command**: `nc`
- **Arguments**: `-z localhost 3000`

#### 3. Process Check

Check if a process is running:

```bash
pgrep -f "node server.js"
```

**Configuration:**
- **Command**: `pgrep`
- **Arguments**: `-f "node server.js"`

#### 4. Database Connection Check

Check if a database is accessible:

```bash
pg_isready -h localhost -p 5432
```

**Configuration:**
- **Command**: `pg_isready`
- **Arguments**: `-h localhost -p 5432`

## Step-by-Step Setup

### Step 1: Navigate to Your Application

1. Go to your Dokploy dashboard
2. Select the application you want to configure
3. Go to the "Advanced" or "Settings" section

### Step 2: Find Healthcheck Configuration

Look for the "Healthcheck" section in the UI. You'll see:

- **Enable Healthcheck**: Toggle to enable/disable
- **Command**: The main command to run
- **Arguments**: Additional arguments

### Step 3: Configure the Healthcheck

#### Example 1: HTTP Healthcheck for a Web Application

1. **Enable Healthcheck**: Toggle on
2. **Command**: `curl`
3. **Arguments**: `-f http://localhost:3000/health`

#### Example 2: TCP Port Check for a Database

1. **Enable Healthcheck**: Toggle on
2. **Command**: `nc`
3. **Arguments**: `-z localhost 5432`

#### Example 3: Process Check for a Node.js Application

1. **Enable Healthcheck**: Toggle on
2. **Command**: `pgrep`
3. **Arguments**: `-f "node server.js"`

### Step 4: Set Healthcheck Options

Configure additional options:

- **Interval**: How often to run the healthcheck (e.g., 30 seconds)
- **Timeout**: How long to wait for a response (e.g., 10 seconds)
- **Retries**: How many failures before marking as unhealthy (e.g., 3)
- **Start Period**: How long to wait before starting healthchecks (e.g., 30 seconds)

## Common Issues and Solutions

### Issue 1: Healthcheck Not Working

**Symptoms**: Application shows as unhealthy even though it's running

**Solutions**:

1. **Check the command**: Make sure the command is correct
2. **Check the arguments**: Verify the arguments are formatted correctly
3. **Check the port**: Ensure the port is correct and accessible
4. **Check the path**: Verify the health endpoint exists

### Issue 2: Healthcheck Timing Out

**Symptoms**: Healthcheck takes too long to respond

**Solutions**:

1. **Increase timeout**: Set a longer timeout value
2. **Optimize the healthcheck**: Use a simpler healthcheck command
3. **Check network**: Ensure there are no network issues

### Issue 3: Healthcheck Too Frequent

**Symptoms**: Application is under heavy load from healthchecks

**Solutions**:

1. **Increase interval**: Set a longer interval between healthchecks
2. **Use caching**: Cache healthcheck responses
3. **Optimize the healthcheck**: Use a lightweight healthcheck

## Best Practices

### 1. Use Appropriate Healthchecks

- **Web Applications**: Use HTTP healthchecks
- **Databases**: Use connection healthchecks
- **Background Services**: Use process healthchecks

### 2. Set Reasonable Timeouts

- **Fast Applications**: 5-10 seconds timeout
- **Slow Applications**: 30-60 seconds timeout
- **Database Connections**: 10-30 seconds timeout

### 3. Configure Retries Appropriately

- **Critical Applications**: 3-5 retries
- **Non-Critical Applications**: 1-3 retries
- **Development Environments**: 1 retry

### 4. Use Start Periods

- **Applications with Startup Time**: 30-60 seconds start period
- **Quick Starting Applications**: 5-10 seconds start period
- **Database Applications**: 60-120 seconds start period

## Examples

### Example 1: Next.js Application

```yaml
# Healthcheck for Next.js application
Command: curl
Arguments: -f http://localhost:3000/api/health
Interval: 30s
Timeout: 10s
Retries: 3
Start Period: 30s
```

### Example 2: PostgreSQL Database

```yaml
# Healthcheck for PostgreSQL
Command: pg_isready
Arguments: -h localhost -p 5432 -U postgres
Interval: 30s
Timeout: 10s
Retries: 3
Start Period: 60s
```

### Example 3: Redis Cache

```yaml
# Healthcheck for Redis
Command: redis-cli
Arguments: ping
Interval: 30s
Timeout: 10s
Retries: 3
Start Period: 10s
```

### Example 4: Node.js API Server

```yaml
# Healthcheck for Node.js API
Command: curl
Arguments: -f http://localhost:8080/health
Interval: 30s
Timeout: 10s
Retries: 3
Start Period: 30s
```

## Troubleshooting

### Problem: Healthcheck Command Not Found

**Error**: `command not found: curl`

**Solution**:
1. Check if the command is installed in your container
2. Use a different healthcheck method
3. Install the required command in your Dockerfile

### Problem: Permission Denied

**Error**: `Permission denied`

**Solution**:
1. Check file permissions
2. Run the command as the correct user
3. Use `sudo` if necessary

### Problem: Connection Refused

**Error**: `Connection refused`

**Solution**:
1. Check if the application is running
2. Verify the port is correct
3. Check firewall settings

### Problem: Healthcheck Always Fails

**Symptoms**: Healthcheck never passes

**Solution**:
1. Test the healthcheck command manually
2. Check application logs
3. Verify the health endpoint exists

## Advanced Configuration

### Custom Healthcheck Scripts

For complex healthchecks, you can create custom scripts:

```bash
#!/bin/bash
# healthcheck.sh

# Check if application is responding
if ! curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "Application is not responding"
    exit 1
fi

# Check database connection
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "Database is not responding"
    exit 1
fi

echo "All healthchecks passed"
exit 0
```

**Configuration:**
- **Command**: `/path/to/healthcheck.sh`
- **Arguments**: (leave empty)

### Multiple Healthchecks

You can configure multiple healthchecks by using a script that checks multiple services:

```bash
#!/bin/bash
# multi-healthcheck.sh

# Check web server
curl -f http://localhost:3000/health || exit 1

# Check database
pg_isready -h localhost -p 5432 || exit 1

# Check cache
redis-cli ping || exit 1

echo "All services are healthy"
exit 0
```

## Docker Healthcheck

If you're using Docker directly, you can add healthchecks to your Dockerfile:

```dockerfile
# In your Dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1
```

## Docker Compose Healthcheck

For Docker Compose, you can add healthchecks to your `docker-compose.yml`:

```yaml
version: '3.8'
services:
  web:
    image: your-app
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

## Monitoring Healthchecks

### Viewing Healthcheck Status

1. Go to your Dokploy dashboard
2. Select your application
3. Look for the health status indicator

### Healthcheck Logs

View healthcheck logs to diagnose issues:

1. Go to your application logs
2. Look for healthcheck-related entries
3. Check for error messages

### Alerts and Notifications

Configure alerts for healthcheck failures:

1. Set up notifications in Dokploy
2. Configure email or Slack alerts
3. Set up escalation policies

## Conclusion

Healthchecks are essential for maintaining reliable applications. By following this guide, you can:

- Set up healthchecks for your applications
- Configure appropriate timeouts and retries
- Troubleshoot common healthcheck issues
- Monitor application health effectively

Remember to test your healthchecks thoroughly before deploying to production.

## Related Documentation

- [Docker Healthcheck Documentation](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [Docker Compose Healthcheck](https://docs.docker.com/compose/compose-file/compose-file-v3/#healthcheck)
- [Kubernetes Liveness Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

## FAQ

### Q: What's the difference between Command and Arguments?

**A**: 
- **Command**: The main executable to run (e.g., `curl`, `nc`, `pgrep`)
- **Arguments**: Additional parameters for the command (e.g., `-f http://localhost:3000/health`)

### Q: How do I know which healthcheck to use?

**A**:
- **Web Applications**: Use HTTP healthchecks (`curl`)
- **Databases**: Use connection healthchecks (`pg_isready`, `redis-cli`)
- **Background Services**: Use process healthchecks (`pgrep`)

### Q: What if my application doesn't have a health endpoint?

**A**:
- Create a simple health endpoint in your application
- Use a TCP port check instead
- Use a process check

### Q: How often should I run healthchecks?

**A**:
- **Production**: Every 30-60 seconds
- **Staging**: Every 60-120 seconds
- **Development**: Every 120-300 seconds

### Q: What should I do if healthchecks are failing?

**A**:
1. Check application logs
2. Test the healthcheck command manually
3. Verify network connectivity
4. Check resource usage (CPU, memory)

## Additional Resources

- [Dokploy Documentation](https://dokploy.com)
- [Docker Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Application Health Monitoring](https://microservices.io/patterns/observability/health-check-api.html)
