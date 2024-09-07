import _ from "lodash";
import type { LogEntry } from "./types";

interface HourlyData {
	hour: string;
	count: number;
}

export function processLogs(logString: string): HourlyData[] {
	if (_.isEmpty(logString)) {
		return [];
	}

	const hourlyData = _(logString)
		.split("\n")
		.compact()
		.map((entry) => {
			try {
				const log: LogEntry = JSON.parse(entry);
				if (log.ServiceName === "dokploy-service-app@file") {
					return null;
				}
				const date = new Date(log.StartUTC);
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
): { data: LogEntry[]; totalCount: number } {
	try {
		if (_.isEmpty(rawConfig)) {
			return { data: [], totalCount: 0 };
		}

		let parsedLogs = _(rawConfig)
			.split("\n")
			.compact()
			.map((line) => JSON.parse(line) as LogEntry)
			.value();

		parsedLogs = parsedLogs.filter(
			(log) => log.ServiceName !== "dokploy-service-app@file",
		);

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
