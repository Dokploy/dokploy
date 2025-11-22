# Prometheus Monitoring Integration

This document describes the Prometheus-based monitoring system for Dokploy as implemented in issue #2376.

## Overview

Dokploy now supports Prometheus as a monitoring solution alongside the existing custom Go-based monitoring system. This provides a more scalable, extensible, and industry-standard approach to metrics collection and storage.

## Architecture

The Prometheus monitoring stack consists of three main components:

1. **Prometheus Server** - Central metrics storage and query engine
2. **Node Exporter** - System-level metrics (CPU, memory, disk, network)
3. **cAdvisor** - Container-level metrics

### Component Ports

- Prometheus: `9090` (Web UI and API)
- Node Exporter: `9100` (Metrics endpoint)
- cAdvisor: `8080` (Web UI and metrics)

## Features

### 1. System Metrics

The Prometheus integration collects comprehensive system metrics:

- **CPU Usage**: Overall and per-core CPU utilization
- **Memory**: Total, used, available memory
- **Disk**: Usage, I/O statistics
- **Network**: Receive/transmit rates

### 2. Container Metrics

cAdvisor provides detailed container-level metrics:

- CPU usage per container
- Memory consumption per container
- Network I/O per container
- Disk I/O per container

### 3. Historical Data

Unlike the previous file-based system, Prometheus provides:

- Configurable retention periods
- Time-series data storage
- Efficient querying across time ranges
- Automated cleanup and compaction

## API Functions

### Setup Functions

```typescript
// Setup complete Prometheus stack
await setupPrometheusStack(serverId?: string);

// Setup individual components
await setupPrometheus(serverId?: string);
await setupNodeExporter(serverId?: string);
await setupCAdvisor(serverId?: string);

// Stop the stack
await stopPrometheusStack(serverId?: string);
```

### Query Functions

```typescript
// Get system metrics
const metrics = await getSystemMetrics(serverId?: string);

// Get container metrics
const containerMetrics = await getContainerMetrics(
  containerName: string,
  serverId?: string
);

// Health check
const isHealthy = await checkPrometheusHealth(serverId?: string);

// Custom queries
const result = await queryPrometheus(
  query: string,
  serverId?: string
);

const rangeData = await queryPrometheusRange(
  query: string,
  start: string,
  end: string,
  step: string,
  serverId?: string
);
```

## Usage

### Local Deployment

```typescript
import { setupPrometheusStack } from "@dokploy/server/setup/prometheus-setup";

// Setup on local server
await setupPrometheusStack();
```

### Remote Server Deployment

```typescript
import { setupPrometheusStack } from "@dokploy/server/setup/prometheus-setup";

// Setup on remote server
await setupPrometheusStack("server-id-123");
```

### Querying Metrics

```typescript
import { 
  getCPUMetrics,
  getMemoryMetrics,
  getDiskMetrics,
  getNetworkMetrics 
} from "@dokploy/server/monitoring/prometheus-utils";

// Get current CPU usage
const cpu = await getCPUMetrics();

// Get memory usage
const memory = await getMemoryMetrics();

// Get all system metrics at once
const allMetrics = await getSystemMetrics();
```

## Configuration

The Prometheus configuration is automatically generated with sensible defaults:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['localhost:8080']
```

Configuration files are stored in `/etc/dokploy/prometheus/`.

## Testing

### Unit Tests

Run the Prometheus utility tests:

```bash
pnpm test -- prometheus-utils.test.ts
pnpm test -- prometheus-setup.test.ts
```

All tests are passing:
- 12 tests in prometheus-utils.test.ts
- 5 tests in prometheus-setup.test.ts

## PromQL Examples

### CPU Usage (last 5 minutes)
```promql
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

### Memory Usage Percentage
```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

### Disk Usage Percentage
```promql
100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"})
```

### Container CPU Usage
```promql
rate(container_cpu_usage_seconds_total{name="container-name"}[5m]) * 100
```

### Container Memory Usage
```promql
container_memory_usage_bytes{name="container-name"}
```

## Benefits Over Previous System

1. **Industry Standard**: Prometheus is widely adopted and has extensive documentation
2. **Scalability**: Handles large-scale deployments efficiently
3. **Extensibility**: Easy to add new metrics and exporters
4. **Historical Data**: Built-in time-series database
5. **Query Language**: Powerful PromQL for complex queries
6. **Ecosystem**: Compatible with Grafana, AlertManager, and other tools
7. **Reduced Maintenance**: No custom code for metrics storage and collection

## Migration Notes

- The new Prometheus system can run alongside the existing Go monitoring system
- No database schema changes are required
- Deployment is containerized and isolated from existing monitoring
- Configuration is stored separately in `/etc/dokploy/prometheus/`

## Future Enhancements

- Grafana integration for advanced dashboards
- AlertManager for threshold-based alerts
- Push Gateway for batch job metrics
- Long-term storage with Mimir/Thanos
- Custom application metrics via Prometheus client libraries

## Troubleshooting

### Prometheus not starting

Check Docker logs:
```bash
docker logs dokploy-prometheus
```

### No metrics being collected

Verify exporters are running:
```bash
docker ps | grep -E "prometheus|node-exporter|cadvisor"
```

### Health check failing

Wait a few seconds after deployment for services to start, then check:
```bash
curl http://localhost:9090/-/healthy
```

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Node Exporter](https://github.com/prometheus/node_exporter)
- [cAdvisor](https://github.com/google/cadvisor)
- [PromQL Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
