# Prometheus Integration Guide

This guide explains how to integrate Dokploy Monitoring with Prometheus and external monitoring systems like Grafana Cloud.

## Overview

Dokploy Monitoring can expose all collected metrics in Prometheus format, allowing external systems to scrape and centralize monitoring data. This is particularly useful for:

- Centralizing metrics from multiple Dokploy instances
- Using Grafana Cloud for visualization and alerting
- Integrating with existing Prometheus infrastructure
- Long-term metric storage and analysis
- Multi-cloud or hybrid monitoring setups

## Quick Start

### 1. Enable Prometheus Metrics

Update your `METRICS_CONFIG` to include the Prometheus configuration:

```json
{
  "server": {
    ...
    "prometheus": {
      "enabled": true
    }
  },
  ...
}
```

### 2. Verify the Endpoint

Start your monitoring service and verify the endpoint is accessible:

```bash
curl http://localhost:3001/metrics/prometheus
```

You should see metrics in Prometheus format:

```
# HELP dokploy_server_cpu_usage_percent Current CPU usage percentage
# TYPE dokploy_server_cpu_usage_percent gauge
dokploy_server_cpu_usage_percent{arch="amd64",os="ubuntu",server_type="Dokploy"} 45.2

# HELP dokploy_server_memory_used_percent Current memory usage percentage
# TYPE dokploy_server_memory_used_percent gauge
dokploy_server_memory_used_percent{arch="amd64",os="ubuntu",server_type="Dokploy"} 62.8
...
```

## Integration Examples

### Standalone Prometheus

Add this scrape configuration to your `prometheus.yml`:

```yaml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'dokploy-monitoring'
    scrape_interval: 30s
    static_configs:
      - targets: 
          - 'monitoring.example.com:3001'
          - 'monitoring-2.example.com:3001'
        labels:
          environment: 'production'
          
    metrics_path: '/metrics/prometheus'
    
    # Optional: Add basic auth if using a reverse proxy
    # basic_auth:
    #   username: 'prometheus'
    #   password: 'secret'
```

Restart Prometheus and verify the targets are up:
```bash
curl http://localhost:9090/api/v1/targets
```

### Grafana Cloud

#### Method 1: Prometheus Remote Write (Recommended)

1. Get your Grafana Cloud credentials:
   - Go to Grafana Cloud → Connections → Prometheus
   - Note your remote write endpoint and credentials

2. Configure Prometheus to remote write to Grafana Cloud:

```yaml
remote_write:
  - url: https://prometheus-prod-XX-prod-XX-XX.grafana.net/api/prom/push
    basic_auth:
      username: 'YOUR_GRAFANA_CLOUD_INSTANCE_ID'
      password: 'YOUR_GRAFANA_CLOUD_API_KEY'
```

3. Configure scraping as shown in the Standalone Prometheus section

#### Method 2: Grafana Agent (Alternative)

1. Install Grafana Agent on your system

2. Configure the agent:

```yaml
metrics:
  wal_directory: /tmp/grafana-agent-wal
  global:
    scrape_interval: 30s
    remote_write:
      - url: https://prometheus-prod-XX-prod-XX-XX.grafana.net/api/prom/push
        basic_auth:
          username: 'YOUR_GRAFANA_CLOUD_INSTANCE_ID'
          password: 'YOUR_GRAFANA_CLOUD_API_KEY'
  configs:
    - name: dokploy
      scrape_configs:
        - job_name: 'dokploy-monitoring'
          static_configs:
            - targets: ['localhost:3001']
          metrics_path: '/metrics/prometheus'
```

### Docker Deployment with Prometheus

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  dokploy-monitoring:
    image: dokploy/monitoring:latest
    ports:
      - "3001:3001"
    environment:
      METRICS_CONFIG: |
        {
          "server": {
            "refreshRate": 30,
            "port": 3001,
            "type": "Dokploy",
            "token": "secure-token",
            "urlCallback": "http://dokploy:3000/api/trpc/notification.receiveNotification",
            "retentionDays": 7,
            "cronJob": "0 0 * * *",
            "thresholds": {
              "cpu": 80,
              "memory": 85
            },
            "prometheus": {
              "enabled": true
            }
          },
          "containers": {
            "refreshRate": 30,
            "services": {
              "include": [],
              "exclude": []
            }
          }
        }
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
```

### Datadog Integration

1. Install the Datadog Agent

2. Enable OpenMetrics collection in `/etc/datadog-agent/conf.d/openmetrics.d/conf.yaml`:

```yaml
instances:
  - prometheus_url: http://localhost:3001/metrics/prometheus
    namespace: "dokploy"
    metrics:
      - "dokploy_*"
    tags:
      - "environment:production"
```

3. Restart the Datadog Agent:
```bash
sudo systemctl restart datadog-agent
```

### New Relic

Use the Prometheus Remote Write integration:

```yaml
# In your prometheus.yml
remote_write:
  - url: https://metric-api.newrelic.com/prometheus/v1/write?prometheus_server=dokploy
    bearer_token: 'YOUR_NEW_RELIC_LICENSE_KEY'
```

## Available Metrics

### Server Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `dokploy_server_cpu_usage_percent` | gauge | server_type, os, arch | Current CPU usage |
| `dokploy_server_memory_used_percent` | gauge | server_type, os, arch | Memory usage percentage |
| `dokploy_server_memory_used_gb` | gauge | server_type, os, arch | Memory used in GB |
| `dokploy_server_memory_total_gb` | gauge | server_type, os, arch | Total memory in GB |
| `dokploy_server_disk_used_percent` | gauge | server_type, os, arch | Disk usage percentage |
| `dokploy_server_disk_total_gb` | gauge | server_type, os, arch | Total disk space in GB |
| `dokploy_server_network_in_mb` | gauge | server_type, os, arch | Network traffic received |
| `dokploy_server_network_out_mb` | gauge | server_type, os, arch | Network traffic sent |
| `dokploy_server_uptime_seconds` | gauge | server_type, os, arch | System uptime |
| `dokploy_server_cpu_cores` | gauge | server_type, os, arch, cpu_model | Number of CPU cores |
| `dokploy_server_cpu_speed_mhz` | gauge | server_type, os, arch, cpu_model | CPU speed in MHz |

### Container Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `dokploy_container_cpu_usage_percent` | gauge | container_name, container_id | Container CPU usage |
| `dokploy_container_memory_used_mb` | gauge | container_name, container_id | Container memory used |
| `dokploy_container_network_bytes` | gauge | container_name, container_id, direction | Network I/O (direction: in/out) |
| `dokploy_container_blockio_bytes` | gauge | container_name, container_id, operation | Block I/O (operation: read/write) |

## Example PromQL Queries

### Server Metrics

```promql
# Average CPU usage across all servers
avg(dokploy_server_cpu_usage_percent)

# Servers with high memory usage
dokploy_server_memory_used_percent > 80

# Total network traffic
sum(rate(dokploy_server_network_in_mb[5m])) + sum(rate(dokploy_server_network_out_mb[5m]))

# Disk usage by server
dokploy_server_disk_used_percent{server_type="Dokploy"}
```

### Container Metrics

```promql
# Top 5 containers by CPU usage
topk(5, dokploy_container_cpu_usage_percent)

# Container memory usage over time
dokploy_container_memory_used_mb{container_name=~"app.*"}

# Network traffic rate for a container
rate(dokploy_container_network_bytes{container_name="my-app", direction="in"}[5m])

# Total block I/O across all containers
sum(rate(dokploy_container_blockio_bytes[1m]))
```

## Grafana Dashboard

Create a custom Grafana dashboard with these example panels:

### CPU Usage Panel
```json
{
  "targets": [{
    "expr": "dokploy_server_cpu_usage_percent",
    "legendFormat": "{{server_type}} - {{os}}"
  }],
  "title": "Server CPU Usage",
  "type": "graph"
}
```

### Memory Usage Panel
```json
{
  "targets": [{
    "expr": "dokploy_server_memory_used_percent",
    "legendFormat": "{{server_type}}"
  }],
  "title": "Memory Usage %",
  "type": "graph"
}
```

### Container Resources Panel
```json
{
  "targets": [
    {
      "expr": "topk(10, dokploy_container_cpu_usage_percent)",
      "legendFormat": "{{container_name}}"
    }
  ],
  "title": "Top 10 Containers by CPU",
  "type": "graph"
}
```

## Security Considerations

### Network Security

The `/metrics/prometheus` endpoint is **unauthenticated by design** to support standard Prometheus scrapers. Secure it using:

1. **Firewall Rules**: Allow only your Prometheus server's IP
   ```bash
   # iptables example
   iptables -A INPUT -p tcp --dport 3001 -s PROMETHEUS_IP -j ACCEPT
   iptables -A INPUT -p tcp --dport 3001 -j DROP
   ```

2. **Reverse Proxy with Auth**: Use nginx or Caddy
   ```nginx
   location /metrics/prometheus {
       auth_basic "Prometheus Metrics";
       auth_basic_user_file /etc/nginx/.htpasswd;
       proxy_pass http://localhost:3001;
   }
   ```

3. **VPN/Private Network**: Deploy on a private network accessible only to monitoring systems

4. **mTLS**: Use mutual TLS for authentication (requires custom setup)

### Cloud Security Groups

#### AWS
```bash
# Allow only from Grafana Cloud IPs
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 3001 \
  --cidr GRAFANA_CLOUD_IP/32
```

#### Azure
```bash
az network nsg rule create \
  --resource-group myResourceGroup \
  --nsg-name myNSG \
  --name AllowPrometheus \
  --priority 100 \
  --source-address-prefixes PROMETHEUS_IP \
  --destination-port-ranges 3001
```

## Troubleshooting

### Metrics Not Appearing

1. Verify Prometheus is enabled:
   ```bash
   curl http://localhost:3001/metrics/prometheus | grep dokploy
   ```

2. Check Prometheus targets:
   ```bash
   curl http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | select(.job=="dokploy-monitoring")'
   ```

3. Check for scrape errors in Prometheus logs:
   ```bash
   docker logs prometheus 2>&1 | grep dokploy
   ```

### High Cardinality Issues

If you have many containers, consider:

1. Filter metrics using relabel configs:
   ```yaml
   scrape_configs:
     - job_name: 'dokploy-monitoring'
       metric_relabel_configs:
         - source_labels: [container_name]
           regex: 'unnecessary-container-.*'
           action: drop
   ```

2. Reduce scrape frequency for container metrics

### Connection Timeouts

1. Increase scrape timeout in Prometheus:
   ```yaml
   scrape_configs:
     - job_name: 'dokploy-monitoring'
       scrape_timeout: 30s
   ```

2. Optimize metric collection by excluding unnecessary containers

## Best Practices

1. **Use Consistent Labels**: Ensure `server_type` labels are consistent across your infrastructure
2. **Set Appropriate Scrape Intervals**: 15-60 seconds for most use cases
3. **Monitor Prometheus Storage**: Plan for ~1-2KB per time series per day
4. **Use Recording Rules**: Pre-compute frequently used queries
5. **Set Up Alerts**: Configure alerting rules for critical metrics
6. **Regular Backups**: Back up Prometheus data or use remote write for persistence
7. **Dashboard Organization**: Group related metrics in Grafana folders

## Support and Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Cloud Documentation](https://grafana.com/docs/grafana-cloud/)
- [PromQL Guide](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Dokploy Monitoring GitHub](https://github.com/dokploy/monitoring)
