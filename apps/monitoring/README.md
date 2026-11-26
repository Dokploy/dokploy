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

## Installation

```bash
go mod download
```

## Execution

```bash
go run main.go
```

Optional settings:

- `METRICS_CONFIG.tasks` turns on per-replica metrics, used by replica scaling: `{"enabled": true, "refreshRate": 15, "retentionHours": 24}`. Absent or `enabled: false` leaves collection off. Replicas are swarm task containers, stored under their service name, and containers Docker Compose started for a service (not one-off `run` containers), stored under `compose:<project>/<service>` with the container number as slot.
- `MONITORING_DB_PATH` sets the SQLite file (default `./monitoring.db`). Dokploy sets it to a named volume when it runs the agent as a global service.

## Endpoints

- `GET /health` - Check service health status (no authentication required)
- `GET /metrics?limit=<number|all>` - Get server metrics (default limit: 50)
- `GET /metrics/containers?limit=<number|all>&appName=<name>` - Get container metrics for a specific application (default limit: 50)
- `GET /metrics/tasks?service=<name>&since=<RFC 3339>&limit=<n>` - Per-replica CPU and memory samples of a swarm service, or of a Compose service as `compose:<project>/<service>`, on this node, oldest first (defaults: last hour, 5000 samples)
- `GET /metrics/tasks/cluster?service=<name>&since=<RFC 3339>&limit=<n>` - The same for every node of the swarm; answers only on a manager (409 elsewhere), which asks each node's agent and reports unreachable nodes

Both task endpoints send `X-Dokploy-Agent-Features: compose`, so Dokploy can tell this agent from one that does not sample Compose containers.

All endpoints except `/health` require `Authorization: Bearer <token>`. In a swarm, server threshold alerts are sent only by the leader's agent.

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
