import path from "node:path";
import schedule from "node-schedule";
import sqlite3 from "sqlite3";
import si from "systeminformation";

export interface ServerMetric {
	timestamp: string;
	cpu: string;
	cpuModel: string;
	cpuCores: number;
	cpuPhysicalCores: number;
	cpuSpeed: number;
	os: string;
	distro: string;
	kernel: string;
	arch: string;
	memUsed: string;
	memUsedGB: string;
	memTotal: string;
	uptime: number;
	diskUsed: string;
	totalDisk: string;
	networkIn: string;
	networkOut: string;
}

const dbPath = path.join(process.cwd(), "monitoring.db");
const db = new sqlite3.Database(dbPath);

// Create metrics table
db.serialize(() => {
	db.run(`CREATE TABLE IF NOT EXISTS server_metrics (
    timestamp TEXT,
    cpu TEXT,
    cpuModel TEXT,
    cpuCores INTEGER,
    cpuPhysicalCores INTEGER,
    cpuSpeed REAL,
    os TEXT,
    distro TEXT,
    kernel TEXT,
    arch TEXT,
    memUsed TEXT,
    memUsedGB TEXT,
    memTotal TEXT,
    uptime INTEGER,
    diskUsed TEXT,
    totalDisk TEXT,
    networkIn TEXT,
    networkOut TEXT
  )`);
});

const getServerMetrics = async (): Promise<ServerMetric> => {
	const [cpu, mem, load, fsSize, network, osInfo] = await Promise.all([
		si.cpu(),
		si.mem(),
		si.currentLoad(),
		si.fsSize(),
		si.networkStats(),
		si.osInfo(),
	]);

	// Calcular memoria usada en GB

	const memTotalGB = mem.total / 1024 / 1024 / 1024;
	const memUsedGB = (mem.total - mem.available) / 1024 / 1024 / 1024;
	// const memUsedGB = (mem.total - mem.free - mem.buffcache) / 1024 / 1024 / 1024;
	// const memUsedGB = (mem.total - mem.free) / 1024 / 1024 / 1024;

	const memUsedPercent = (memUsedGB / memTotalGB) * 100;

	return {
		// CPU info
		cpu: load.currentLoad.toFixed(2),
		cpuModel: `${cpu.manufacturer} ${cpu.brand}`,
		cpuCores: cpu.cores,
		cpuPhysicalCores: cpu.physicalCores,
		cpuSpeed: cpu.speed,
		// System info
		os: osInfo.platform,
		distro: osInfo.distro,
		kernel: osInfo.kernel,
		arch: osInfo.arch,
		// Memory
		memUsed: memUsedPercent.toFixed(2),
		memUsedGB: memUsedGB.toFixed(2),
		memTotal: memTotalGB.toFixed(2),
		// Other metrics
		uptime: si.time().uptime,
		diskUsed: fsSize[0].use.toFixed(2),
		totalDisk: (fsSize[0].size / 1024 / 1024 / 1024).toFixed(2),
		networkIn: (network[0].rx_bytes / 1024 / 1024).toFixed(2),
		networkOut: (network[0].tx_bytes / 1024 / 1024).toFixed(2),
		timestamp: new Date().toISOString(),
	};
};

const REFRESH_RATE_SERVER = Number(process.env.REFRESH_RATE_SERVER || 10000);

export const logServerMetrics = () => {
	const rule = new schedule.RecurrenceRule();
	rule.second = new schedule.Range(
		0,
		59,
		Math.floor(REFRESH_RATE_SERVER / 1000),
	);
	console.log("Server metrics refresh rate:", REFRESH_RATE_SERVER, "ms");

	const job = schedule.scheduleJob(rule, async () => {
		const metrics = await getServerMetrics();

		// Insert metrics into SQLite
		const stmt = db.prepare(`
      INSERT INTO server_metrics (
        timestamp, cpu, cpuModel, cpuCores, cpuPhysicalCores, cpuSpeed,
        os, distro, kernel, arch, memUsed, memUsedGB, memTotal,
        uptime, diskUsed, totalDisk, networkIn, networkOut
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

		stmt.run(
			metrics.timestamp,
			metrics.cpu,
			metrics.cpuModel,
			metrics.cpuCores,
			metrics.cpuPhysicalCores,
			metrics.cpuSpeed,
			metrics.os,
			metrics.distro,
			metrics.kernel,
			metrics.arch,
			metrics.memUsed,
			metrics.memUsedGB,
			metrics.memTotal,
			metrics.uptime,
			metrics.diskUsed,
			metrics.totalDisk,
			metrics.networkIn,
			metrics.networkOut,
		);

		stmt.finalize();
	});

	// Cleanup function
	return () => {
		if (job) {
			job.cancel();
		}
		db.close();
	};
};

export const getLatestMetrics = (): Promise<ServerMetric | undefined> => {
	return new Promise((resolve, reject) => {
		db.get(
			"SELECT * FROM server_metrics ORDER BY timestamp DESC LIMIT 1",
			(err, row) => {
				if (err) reject(err);
				// @ts-ignore
				resolve(row);
			},
		);
	});
};

export const getLastNMetrics = (limit: number): Promise<ServerMetric[]> => {
	return new Promise((resolve, reject) => {
		// Subconsulta para obtener los últimos N registros en orden ascendente
		db.all(
			`WITH last_n AS (
				SELECT * FROM server_metrics 
				ORDER BY timestamp DESC 
				LIMIT ?
			)
			SELECT * FROM last_n 
			ORDER BY timestamp ASC`,
			[limit],
			(err, rows) => {
				if (err) reject(err);
				// @ts-ignore
				resolve(rows);
			},
		);
	});
};

export const getMetricsInRange = (
	startTime: string,
	endTime: string,
): Promise<ServerMetric[]> => {
	return new Promise((resolve, reject) => {
		db.all(
			`SELECT * FROM server_metrics 
       WHERE timestamp BETWEEN ? AND ?
       ORDER BY timestamp ASC`,
			[startTime, endTime],
			(err, rows) => {
				if (err) reject(err);
				// @ts-ignore
				resolve(rows);
			},
		);
	});
};

// Function to clean old metrics (keep last 7 days by default)
export const cleanOldMetrics = (daysToKeep = 7) => {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

	db.run(
		"DELETE FROM server_metrics WHERE timestamp < ?",
		[cutoffDate.toISOString()],
		(err) => {
			if (err) console.error("Error cleaning old metrics:", err);
		},
	);
};
