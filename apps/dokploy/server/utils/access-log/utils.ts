interface LogEntry {
	StartUTC: string;
}

interface HourlyData {
	hour: string;
	count: number;
}

export function processLogs(logString: string): HourlyData[] {
	const hourlyData: Record<string, number> = {};

	if (!logString || logString?.length === 0) {
		return [];
	}

	const logEntries = logString.trim().split("\n");

	for (const entry of logEntries) {
		try {
			const log: LogEntry = JSON.parse(entry);
			const date = new Date(log.StartUTC);
			const hourKey = `${date.toISOString().slice(0, 13)}:00:00Z`; // Agrupa por hora

			hourlyData[hourKey] = (hourlyData[hourKey] || 0) + 1;
		} catch (error) {
			console.error("Error parsing log entry:", error);
		}
	}

	return Object.entries(hourlyData)
		.map(([hour, count]) => ({ hour, count }))
		.sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
}

export function parseRawConfig(rawConfig: string): LogEntry[] {
	try {
		if (!rawConfig || rawConfig?.length === 0) {
			return [];
		}
		const jsonLines = rawConfig
			.split("\n")
			.filter((line) => line.trim() !== "");

		const parsedConfig = jsonLines.map((line) => JSON.parse(line) as LogEntry);

		return parsedConfig;
	} catch (error) {
		console.error("Error parsing rawConfig:", error);
		throw new Error("Failed to parse rawConfig");
	}
}
