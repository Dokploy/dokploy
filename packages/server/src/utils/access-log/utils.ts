import _ from "lodash";
import type { LogEntry } from "./types";

interface HourlyData {
	hour: string;
	count: number;
}

export function processLogs(
	logString: string,
	dateRange?: { start?: string; end?: string },
): HourlyData[] {
	if (_.isEmpty(logString)) {
		return [];
	}

	const hourlyData = _(logString)
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			// Check if the line starts with { and ends with } to ensure it's a potential JSON object
			return trimmed !== "" && trimmed.startsWith("{") && trimmed.endsWith("}");
		})
		.map((entry) => {
			try {
				const log: LogEntry = JSON.parse(entry);
				if (log.ServiceName === "dokploy-service-app@file") {
					return null;
				}
				const date = new Date(log.StartUTC);

				if (dateRange?.start || dateRange?.end) {
					const logDate = date.getTime();
					const start = dateRange?.start
						? new Date(dateRange.start).getTime()
						: 0;
					const end = dateRange?.end
						? new Date(dateRange.end).getTime()
						: Number.POSITIVE_INFINITY;
					if (logDate < start || logDate > end) {
						return null;
					}
				}

				return `${date.toISOString().slice(0, 13)}:00:00Z`;
			} catch (error) {
				console.error("Error parsing log entry:", error);
				return null;
			}
		})
		.compact()
		.countBy()
		.map((count, hour) => ({ hour, count }))
		.value();

	return _.sortBy(hourlyData, (entry) => new Date(entry.hour).getTime());
}

interface PageInfo {
	pageIndex: number;
	pageSize: number;
}

interface SortInfo {
	id: string;
	desc: boolean;
}

export function parseRawConfig(
	rawConfig: string,
	page?: PageInfo,
	sort?: SortInfo,
	search?: string,
	status?: string[],
	dateRange?: { start?: string; end?: string },
): { data: LogEntry[]; totalCount: number } {
	try {
		if (_.isEmpty(rawConfig)) {
			return { data: [], totalCount: 0 };
		}

		// Split logs into chunks to avoid memory issues
		let parsedLogs = _(rawConfig)
			.split("\n")
			.filter((line) => {
				const trimmed = line.trim();
				return (
					trimmed !== "" && trimmed.startsWith("{") && trimmed.endsWith("}")
				);
			})
			.map((line) => {
				try {
					return JSON.parse(line) as LogEntry;
				} catch (error) {
					console.error("Error parsing log line:", error);
					return null;
				}
			})
			.compact()
			.value();

		// Apply date range filter if provided
		if (dateRange?.start || dateRange?.end) {
			parsedLogs = parsedLogs.filter((log) => {
				const logDate = new Date(log.StartUTC).getTime();
				const start = dateRange?.start
					? new Date(dateRange.start).getTime()
					: 0;
				const end = dateRange?.end
					? new Date(dateRange.end).getTime()
					: Number.POSITIVE_INFINITY;
				return logDate >= start && logDate <= end;
			});
		}

		if (search) {
			parsedLogs = parsedLogs.filter((log) =>
				log.RequestPath.toLowerCase().includes(search.toLowerCase()),
			);
		}

		if (status && status.length > 0) {
			parsedLogs = parsedLogs.filter((log) =>
				status.some((range) => isStatusInRange(log.DownstreamStatus, range)),
			);
		}

		const totalCount = parsedLogs.length;

		if (sort) {
			parsedLogs = _.orderBy(
				parsedLogs,
				[sort.id],
				[sort.desc ? "desc" : "asc"],
			);
		} else {
			parsedLogs = _.orderBy(parsedLogs, ["time"], ["desc"]);
		}

		if (page) {
			const startIndex = page.pageIndex * page.pageSize;
			parsedLogs = parsedLogs.slice(startIndex, startIndex + page.pageSize);
		}

		return { data: parsedLogs, totalCount };
	} catch (error) {
		console.error("Error parsing rawConfig:", error);
		throw new Error("Failed to parse rawConfig");
	}
}

const isStatusInRange = (status: number, range: string) => {
	switch (range) {
		case "info":
			return status >= 100 && status <= 199;
		case "success":
			return status >= 200 && status <= 299;
		case "redirect":
			return status >= 300 && status <= 399;
		case "client":
			return status >= 400 && status <= 499;
		case "server":
			return status >= 500 && status <= 599;
		default:
			return false;
	}
};
