# Dokploy Monitoring (Go Version)

Este es el servicio de monitoreo de Dokploy reescrito en Go. Proporciona métricas del sistema en tiempo real y almacena el historial en una base de datos SQLite.

## Requisitos

- Go 1.21 o superior
- SQLite3

## Configuración

Crea un archivo `.env` con las siguientes variables:
```
PORT=3001
```

## Instalación

```bash
go mod download
```

## Ejecución

```bash
go run main.go
```

## Endpoints

- `GET /health` - Verificar el estado del servicio
- `GET /metrics/current` - Obtener métricas actuales
- `GET /metrics/range?start=<timestamp>&end=<timestamp>` - Obtener métricas en un rango de tiempo
- `GET /metrics/last/:count` - Obtener las últimas N métricas

## Métricas disponibles

- CPU Usage (%)
- Memory Usage (%)
- Memory Total (bytes)
- CPU Model
