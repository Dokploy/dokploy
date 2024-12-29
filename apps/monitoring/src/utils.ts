import { createReadStream, statSync } from "node:fs";
import fs from "node:fs/promises";

const metricsCache = new Map<string, any[]>();
let lastCacheUpdate = 0;
const CACHE_TTL = 5000; // 5 segundos

export function parseLog(logContent: string) {
	if (!logContent.trim()) return [];
	
	const lines = logContent.trim().split("\n");
	return lines.map((line) => {
		try {
			return JSON.parse(line);
		} catch {
			return { raw: line };
		}
	});
}

export function filterByTimestamp(
	metrics: any[],
	start?: string,
	end?: string,
) {
	// Si no hay filtros, devolver todo
	if (!start && !end) {
		return metrics.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
	}

	// Convertir a timestamp (si existen)
	const startTime = start ? new Date(start).getTime() : null;
	const endTime = end ? new Date(end).getTime() : null;

	return metrics
		.filter((metric) => {
			const metricTime = new Date(metric.timestamp).getTime();

			if (startTime && endTime) {
				return metricTime >= startTime && metricTime <= endTime;
			}
			if (startTime) {
				return metricTime >= startTime;
			}
			if (endTime) {
				return metricTime <= endTime;
			}
			return true;
		})
		.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
}

async function readLastNLines(filePath: string, limit: number) {
    const { size } = statSync(filePath);
    const chunkSize = Math.min(size, limit * 200); // Estimamos 200 bytes por línea
    const buffer = Buffer.alloc(chunkSize);
    
    const fd = await fs.open(filePath, 'r');
    try {
        await fd.read(buffer, 0, chunkSize, size - chunkSize);
        const content = buffer.toString('utf8');
        const lines = content.split('\n').filter(line => line.trim());
        const lastLines = lines.slice(-limit);
        
        return lastLines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return { raw: line };
            }
        });
    } finally {
        await fd.close();
    }
}

export async function processMetricsFromFile(filePath: string, options: { 
	start?: string; 
	end?: string; 
	limit?: number; 
}) {
	const { start, end, limit } = options;

	// Si solo necesitamos las últimas N líneas y no hay filtros de fecha
	if (limit && limit > 0 && !start && !end) {
		return readLastNLines(filePath, limit);
	}

	// Si necesitamos todo o hay filtros de fecha, usar caché
	const now = Date.now();
	if (metricsCache.has(filePath) && now - lastCacheUpdate < CACHE_TTL) {
		const metrics = metricsCache.get(filePath)!;
		return processMetrics(metrics, options);
	}

	const content = await fs.readFile(filePath, 'utf8');
	const metrics = parseLog(content);
	metricsCache.set(filePath, metrics);
	lastCacheUpdate = now;

	return processMetrics(metrics, options);
}

export function processMetrics(metrics: any[], options: { 
	start?: string; 
	end?: string; 
	limit?: number; 
}) {
	const { start, end, limit } = options;

	// Primero filtramos por timestamp
	const filteredMetrics = filterByTimestamp(metrics, start, end);

	// Si el límite es 0, devolver array vacío
	if (limit === 0) return [];
	
	// Si hay límite y es mayor que 0, aplicarlo
	return limit && limit > 0 ? filteredMetrics.slice(-limit) : filteredMetrics;
}
