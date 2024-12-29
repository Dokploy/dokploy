import fs from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import readline from "node:readline";
import { parseLog, processMetrics } from "../src/utils.js";

// Impl1
export async function currentImplementation(filePath: string, limit?: number) {
	const content = await fs.readFile(filePath, "utf8");
	const metrics = parseLog(content);
	return processMetrics(metrics, { limit });
}

// Implementación usando readline - lee línea por línea
export async function readlineImplementation(filePath: string, limit?: number) {
	const fileStream = createReadStream(filePath);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	const metrics = [];
	for await (const line of rl) {
		try {
			metrics.push(JSON.parse(line));
		} catch {
			metrics.push({ raw: line });
		}
	}

	return processMetrics(metrics, { limit });
}

// Implementación optimizada - lee solo las últimas N líneas
export async function tailImplementation(
	filePath: string,
	limit?: number | null,
) {
	if (!limit) {
		return currentImplementation(filePath);
	}

	// Obtener el tamaño del archivo
	const { size } = statSync(filePath);

	// Buffer para almacenar los últimos bytes leídos
	const chunkSize = Math.min(size, limit * 200); // Estimamos 200 bytes por línea
	const buffer = Buffer.alloc(chunkSize);

	// Abrir el archivo para lectura
	const fd = await fs.open(filePath, "r");

	try {
		// Leer los últimos bytes del archivo
		await fd.read(buffer, 0, chunkSize, size - chunkSize);

		// Convertir a string y dividir en líneas
		const content = buffer.toString("utf8");
		const lines = content.split("\n").filter((line) => line.trim());

		// Tomar solo las últimas 'limit' líneas
		const lastLines = lines.slice(-limit);

		return lastLines.map((line) => {
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

// Implementación con caché en memoria
const metricsCache = new Map<string, any[]>();
let lastCacheUpdate = 0;
const CACHE_TTL = 5000; // 5 segundos

export async function cachedImplementation(filePath: string, limit?: number) {
	const now = Date.now();

	// Si tenemos caché válida, usarla
	if (metricsCache.has(filePath) && now - lastCacheUpdate < CACHE_TTL) {
		const metrics = metricsCache.get(filePath)!;
		return processMetrics(metrics, { limit });
	}

	// Si no hay caché o expiró, leer el archivo
	const content = await fs.readFile(filePath, "utf8");
	const metrics = parseLog(content);

	// Actualizar caché
	metricsCache.set(filePath, metrics);
	lastCacheUpdate = now;

	return processMetrics(metrics, { limit });
}
