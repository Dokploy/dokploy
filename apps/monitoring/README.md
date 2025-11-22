# Dokploy Monitoring (Go Version)

Application that powers Dokploy's monitoring service.

You can use it for monitoring any external service.

## Requirements

- Go 1.21

## Configuration

Create a `.env` file in the root of the project with the following content:

```shell
METRICS_CONFIG='{
  "server": {
    "refreshRate": 25,
    "port": 3001,
    "type": "Remote | Dokploy",
    "token": "metrics",
    "urlCallback": "http://localhost:3000/api/trpc/notification.receiveNotification",
    "retentionDays": 7,
    "cronJob": "0 0 * * *",
    "thresholds": {
      "cpu": 0,
      "memory": 0
    },
    "prometheus": {
      "enabled": true
    }
  },
  "containers": {
    "refreshRate": 25,
    "services": {
      "include": ["testing-elasticsearch-14649e"],
      "exclude": []
    }
  }
}'
```

### Prometheus Configuration

The `prometheus` section in the server configuration enables the Prometheus metrics endpoint:

- `enabled`: Set to `true` to enable the `/metrics/prometheus` endpoint for external scraping by Prometheus, Grafana Cloud, or other monitoring systems
- When enabled, metrics are exposed in Prometheus format at the `/metrics/prometheus` endpoint
- This endpoint does not require authentication to allow Prometheus scrapers to access it
- All server and container metrics are automatically exposed in Prometheus-compatible format

## Installation

```bash
go mod download
```

## Execution

```bash
go run main.go
```

## Endpoints

- `GET /health` - Check service health status (no authentication required)
- `GET /metrics?limit=<number|all>` - Get server metrics in JSON format (default limit: 50, requires authentication)
- `GET /metrics/containers?limit=<number|all>&appName=<name>` - Get container metrics for a specific application in JSON format (default limit: 50, requires authentication)
- `GET /metrics/prometheus` - Get all metrics in Prometheus format for external scraping (no authentication required, only available when Prometheus is enabled)

## Features

### Server

- CPU Usage (%)
- Memory Usage (%)
- Disk
- Network
- CPU Model
- Operating System
- Kernel
- Architecture
- Threads

Example response:

| Field              | Value                       |
| ------------------ | --------------------------- |
| timestamp          | 2025-01-19T21:44:54.232164Z |
| cpu                | 24.57%                      |
| cpu_model          | Apple M1 Pro                |
| cpu_cores          | 8                           |
| cpu_physical_cores | 1                           |
| cpu_speed          | 3228.0 MHz                  |
| os                 | darwin                      |
| distro             | darwin                      |
| kernel             | 23.4.0                      |
| arch               | arm64                       |
| mem_used           | 81.91%                      |
| mem_used_gb        | 13.11 GB                    |
| mem_total          | 16.0 GB                     |
| uptime             | 752232s                     |
| disk_used          | 89.34%                      |
| total_disk         | 460.43 GB                   |
| network_in         | 54.78 MB                    |
| network_out        | 31.72 MB                    |

### Containers

Compatible with all Docker container types (standalone containers, Docker Compose, and Docker Swarm stacks). Note: When monitoring Docker Compose or Swarm stacks, use the `--p` flag to properly identify all services within the stack.

Example response:

| Field          | Value                                 |
| -------------- | ------------------------------------- |
| id             | 1                                     |
| timestamp      | 2025-01-19T22:16:30.796129Z           |
| container_id   | 7428f5a49039                          |
| container_name | testing-elasticsearch-14649e-kibana-1 |

Metrics JSON:

```json
{
  "timestamp": "2025-01-19T22:16:30.796129Z",
  "CPU": 83.76,
  "Memory": {
    "percentage": 0.03,
    "used": 2.262,
    "total": 7.654,
    "usedUnit": "MB",
    "totalUnit": "GB"
  },
  "Network": {
    "input": 306,
    "output": 0,
    "inputUnit": "B",
    "outputUnit": "B"
  },
  "BlockIO": {
    "read": 28.7,
    "write": 0,
    "readUnit": "kB",
    "writeUnit": "B"
  },
  "Container": "7428f5a49039",
  "ID": "7428f5a49039",
  "Name": "testing-elasticsearch-14649e-kibana-1"
}
```

## Prometheus Integration

Dokploy Monitoring can expose metrics in Prometheus format for external monitoring systems like Grafana Cloud, standalone Prometheus servers, or other observability platforms.

### Enabling Prometheus Metrics

Set `"prometheus": { "enabled": true }` in your server configuration to enable the `/metrics/prometheus` endpoint.

### Available Prometheus Metrics

**Server Metrics:**
- `dokploy_server_cpu_usage_percent` - CPU usage percentage with labels: `server_type`, `os`, `arch`
- `dokploy_server_memory_used_percent` - Memory usage percentage with labels: `server_type`, `os`, `arch`
- `dokploy_server_memory_used_gb` - Memory used in GB with labels: `server_type`, `os`, `arch`
- `dokploy_server_memory_total_gb` - Total memory in GB with labels: `server_type`, `os`, `arch`
- `dokploy_server_disk_used_percent` - Disk usage percentage with labels: `server_type`, `os`, `arch`
- `dokploy_server_disk_total_gb` - Total disk space in GB with labels: `server_type`, `os`, `arch`
- `dokploy_server_network_in_mb` - Network traffic received in MB with labels: `server_type`, `os`, `arch`
- `dokploy_server_network_out_mb` - Network traffic sent in MB with labels: `server_type`, `os`, `arch`
- `dokploy_server_uptime_seconds` - System uptime in seconds with labels: `server_type`, `os`, `arch`
- `dokploy_server_cpu_cores` - Number of CPU cores with labels: `server_type`, `os`, `arch`, `cpu_model`
- `dokploy_server_cpu_speed_mhz` - CPU speed in MHz with labels: `server_type`, `os`, `arch`, `cpu_model`

**Container Metrics:**
- `dokploy_container_cpu_usage_percent` - Container CPU usage with labels: `container_name`, `container_id`
- `dokploy_container_memory_used_mb` - Container memory used in MB with labels: `container_name`, `container_id`
- `dokploy_container_network_bytes` - Container network traffic with labels: `container_name`, `container_id`, `direction` (in/out)
- `dokploy_container_blockio_bytes` - Container block I/O with labels: `container_name`, `container_id`, `operation` (read/write)

### Scraping Configuration

#### Standalone Prometheus

Add this to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'dokploy-monitoring'
    scrape_interval: 30s
    static_configs:
      - targets: ['<your-monitoring-host>:3001']
    metrics_path: '/metrics/prometheus'
```

#### Grafana Cloud

1. Go to your Grafana Cloud instance
2. Navigate to "Connections" → "Add new connection" → "Prometheus"
3. Use the Prometheus remote write endpoint or add a scrape job
4. Configure the target as `<your-monitoring-host>:3001/metrics/prometheus`

#### External Monitoring Systems

Any monitoring system that supports Prometheus format can scrape the `/metrics/prometheus` endpoint:
- **Datadog**: Use the Prometheus integration
- **New Relic**: Use Prometheus remote write
- **AWS CloudWatch**: Use AWS Distro for OpenTelemetry
- **Azure Monitor**: Use Azure Monitor managed service for Prometheus

### Security Note

The `/metrics/prometheus` endpoint is **intentionally unauthenticated** to allow Prometheus scrapers to access it. If you need to secure this endpoint:

1. Use network-level security (firewall rules, VPN, security groups)
2. Deploy behind a reverse proxy with authentication
3. Use mTLS for secure communication

## Notifications

Dokploy uses a callback URL to send notifications when metrics exceed configured thresholds. Notifications are sent via POST request in the following format:

Note: Setting a threshold to 0 disables notifications for that metric.

```typescript
interface Notification {
  Type: "Memory" | "CPU";
  Value: number;
  Threshold: number;
  Message: string;
  Timestamp: string;
  Token: string;
}
```
