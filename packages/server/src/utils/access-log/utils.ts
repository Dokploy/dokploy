import _ from "lodash";
import type { CaddyRawAccessLogEntry, LogEntry } from "./types";

interface HourlyData {
	hour: string;
	count: number;
}

const emptyServiceURL = {
	Scheme: "",
	Opaque: "",
	User: null,
	Host: "",
	Path: "",
	RawPath: "",
	ForceQuery: false,
	RawQuery: "",
	Fragment: "",
	RawFragment: "",
};

const isTraefikLogEntry = (value: unknown): value is LogEntry => {
	const entry = value as Partial<LogEntry>;
	return (
		typeof entry.StartUTC === "string" &&
		typeof entry.RequestHost === "string" &&
		typeof entry.DownstreamStatus === "number"
	);
};

const isCaddyLogEntry = (value: unknown): value is CaddyRawAccessLogEntry => {
	const entry = value as CaddyRawAccessLogEntry;
	return (
		typeof entry.ts === "number" &&
		typeof entry.status === "number" &&
		typeof entry.request === "object" &&
		entry.request !== null
	);
};

const getRequestPath = (uri = "") => {
	return uri;
};

const getHostPort = (host = "", tls?: unknown) => {
	const match = host.match(/:(\d+)$/);
	if (match?.[1]) return match[1];
	return tls ? "443" : "80";
};

const getHeaderValue = (
	headers: Record<string, string[]> | undefined,
	name: string,
) => {
	if (!headers) return "";
	const match = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
	);
	return match?.[1]?.[0] ?? "";
};

const normalizeCaddyLogEntry = (
	entry: CaddyRawAccessLogEntry,
): LogEntry | null => {
	if (!isCaddyLogEntry(entry)) return null;
	const ts = entry.ts;
	if (typeof ts !== "number") return null;
	const timestamp = new Date(ts * 1000);
	if (Number.isNaN(timestamp.getTime())) return null;

	const request = entry.request ?? {};
	const startUTC = timestamp.toISOString();
	const remoteIp = request.remote_ip ?? "";
	const remotePort = request.remote_port ?? "";
	const clientHost = request.client_ip ?? remoteIp;
	const clientAddr =
		remoteIp && remotePort ? `${remoteIp}:${remotePort}` : remoteIp;
	const serviceName = entry.server_name ?? entry.logger ?? "caddy";

	return {
		Provider: "caddy",
		ClientAddr: clientAddr,
		ClientHost: clientHost,
		ClientPort: remotePort,
		ClientUsername: "-",
		DownstreamContentSize: entry.size ?? 0,
		DownstreamStatus: entry.status ?? 0,
		Duration: Math.round((entry.duration ?? 0) * 1_000_000_000),
		OriginContentSize: entry.size ?? 0,
		OriginDuration: Math.round((entry.duration ?? 0) * 1_000_000_000),
		OriginStatus: entry.status ?? 0,
		Overhead: 0,
		RequestAddr: request.host ?? "",
		RequestContentSize: entry.bytes_read ?? 0,
		RequestCount: 0,
		RequestHost: request.host ?? "",
		RequestMethod: request.method ?? "",
		RequestPath: getRequestPath(request.uri),
		RequestPort: getHostPort(request.host, request.tls),
		RequestProtocol: request.proto ?? "",
		RequestScheme: request.tls ? "https" : "http",
		RetryAttempts: 0,
		RouterName: serviceName,
		ServiceAddr: "",
		ServiceName: serviceName,
		ServiceURL: emptyServiceURL,
		StartLocal: startUTC,
		StartUTC: startUTC,
		downstream_Content_Type: "",
		entryPointName: request.tls ? "https" : "http",
		level: entry.level ?? "info",
		msg: entry.msg ?? "",
		origin_Content_Type: "",
		request_Content_Type: "",
		request_User_Agent: getHeaderValue(request.headers, "User-Agent"),
		time: startUTC,
	};
};

export const parseAccessLogLine = (line: string): LogEntry | null => {
	const trimmed = line.trim();
	if (!trimmed || !trimmed.startsWith("{") || !trimmed.endsWith("}")) {
		return null;
	}

	try {
		const parsed = JSON.parse(trimmed);
		if (isTraefikLogEntry(parsed)) {
			return { ...parsed, Provider: parsed.Provider ?? "traefik" };
		}
		return normalizeCaddyLogEntry(parsed);
	} catch (error) {
		console.error("Error parsing log line:", error);
		return null;
	}
};

export function processLogs(
	logString: string,
	dateRange?: { start?: string; end?: string },
): HourlyData[] {
	if (_.isEmpty(logString)) {
		return [];
	}

	const hourlyData = _(logString)
		.split("\n")
		.map((entry) => {
			try {
				const log = parseAccessLogLine(entry);
				if (!log) return null;
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
				console.error("Error processing log entry:", error);
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

		let parsedLogs = _(rawConfig)
			.split("\n")
			.map(parseAccessLogLine)
			.compact()
			.value();

		// Filter out Dokploy dashboard requests
		parsedLogs = parsedLogs.filter(
			(log) => log.ServiceName !== "dokploy-service-app@file",
		);

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
				log.RequestHost.toLowerCase().includes(search.toLowerCase()),
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
