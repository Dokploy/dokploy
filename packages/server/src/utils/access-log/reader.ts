import fs from "node:fs";

/** Size of each backwards read. */
const CHUNK_SIZE = 64 * 1024;
/** Entries returned when the caller does not specify a limit. */
export const DEFAULT_ENTRY_LIMIT = 500;
/**
 * Safety ceiling for date-range queries. The walk normally stops at the start of the
 * requested range; this only caps how much a very wide range can pull into memory.
 */
export const DATE_RANGE_ENTRY_LIMIT = 50_000;
/** Requests to the Dokploy dashboard itself are never shown on the Requests page. */
const DOKPLOY_DASHBOARD_SERVICE = "dokploy-service-app@file";
const NEWLINE = 0x0a;

export interface ReadLastLogEntriesOptions {
	/** Maximum number of entries to return. Defaults to {@link DEFAULT_ENTRY_LIMIT}. */
	limit?: number;
	/** Stop reading as soon as an entry older than this timestamp is reached. */
	notBefore?: Date;
}

interface PartialLogEntry {
	ServiceName?: string;
	StartUTC?: string;
	time?: string;
}

export interface AccessLogLine {
	/** The raw, trimmed JSON line. */
	line: string;
	entry: PartialLogEntry;
}

/**
 * Walks a Traefik access log from the end of the file towards the start, yielding
 * valid (non-dashboard) JSON entries newest-first. The walk stops as soon as an entry
 * logged before `notBefore` is reached, or when the consumer stops iterating.
 *
 * `access.log` is append-only and ordered by the `time` each request finished, so
 * reading backwards visits entries newest-first and the first entry logged before
 * `notBefore` guarantees every remaining entry is out of range too: the rest of the
 * file never has to be touched.
 *
 * The file is read in fixed-size chunks, so memory is bounded by the chunk size plus
 * the longest line, and the event loop is never blocked.
 */
export async function* iterateLogEntriesBackwards(
	filePath: string,
	notBefore?: Date,
): AsyncGenerator<AccessLogLine, void, undefined> {
	const handle = await fs.promises.open(filePath, "r");

	try {
		const { size } = await handle.stat();

		let position = size;
		let pending = Buffer.alloc(0);
		let reachedCutoff = false;

		// Returns the parsed line when it should be yielded, null when it should be
		// skipped. Sets `reachedCutoff` when the line proves we walked past `notBefore`.
		const classify = (raw: Buffer): AccessLogLine | null => {
			const line = raw.toString("utf8").trim();
			// Same guard as the rest of the access-log helpers: only keep lines that
			// look like a complete JSON object.
			if (!line.startsWith("{") || !line.endsWith("}")) {
				return null;
			}

			let entry: PartialLogEntry;
			try {
				entry = JSON.parse(line);
			} catch {
				return null;
			}

			if (entry.ServiceName === DOKPLOY_DASHBOARD_SERVICE) {
				return null;
			}

			if (notBefore) {
				// Traefik appends an entry when the request *completes*, so the file is
				// ordered by `time`, not by `StartUTC`: a slow request can be logged
				// after faster ones that started later. Cutting off on `time` is still
				// sound because `time >= StartUTC`, so an entry logged before the cutoff
				// also started before it — and so did everything earlier in the file.
				// Cutting off on `StartUTC` instead would drop entries that are still in
				// range but were logged after a slower, older request.
				const loggedAt = new Date(entry.time ?? entry.StartUTC ?? "").getTime();
				// An entry without a usable timestamp cannot prove we walked past the
				// cutoff, so skip it instead of treating it as the boundary.
				if (Number.isNaN(loggedAt)) {
					return null;
				}
				if (loggedAt < notBefore.getTime()) {
					reachedCutoff = true;
					return null;
				}
			}

			return { line, entry };
		};

		while (position > 0 && !reachedCutoff) {
			const readSize = Math.min(CHUNK_SIZE, position);
			position -= readSize;

			const buffer = Buffer.alloc(readSize);
			const { bytesRead } = await handle.read(buffer, 0, readSize, position);
			if (bytesRead === 0) {
				break;
			}

			const chunk = buffer.subarray(0, bytesRead);
			const combined = pending.length ? Buffer.concat([chunk, pending]) : chunk;

			// 0x0a never appears inside a multi-byte UTF-8 sequence, so slicing the
			// buffer on newlines cannot cut a character in half. Scanning from the end
			// yields the lines newest-first.
			const lines: Buffer[] = [];
			let end = combined.length;
			for (let i = combined.length - 1; i >= 0; i--) {
				if (combined[i] === NEWLINE) {
					lines.push(combined.subarray(i + 1, end));
					end = i;
				}
			}
			// Whatever precedes the earliest newline belongs to a line that continues
			// into the previous chunk, so carry it over instead of parsing it now.
			pending = combined.subarray(0, end);

			for (const raw of lines) {
				const parsed = classify(raw);
				if (parsed) {
					yield parsed;
				}
				if (reachedCutoff) {
					break;
				}
			}
		}

		// The very first line of the file has no newline before it.
		if (pending.length > 0 && !reachedCutoff) {
			const parsed = classify(pending);
			if (parsed) {
				yield parsed;
			}
		}
	} finally {
		await handle.close();
	}
}

/**
 * Reads the most recent entries of a Traefik access log.
 *
 * The file is walked backwards (see {@link iterateLogEntriesBackwards}) and the walk
 * stops as soon as `limit` entries have been collected or an entry logged before
 * `notBefore` is reached. Memory is bounded by the entries actually returned rather
 * than by the size of the file.
 *
 * @returns the matching entries as newline-separated raw JSON lines, in file order
 * (oldest first), or an empty string when nothing matches.
 */
export const readLastLogEntries = async (
	filePath: string,
	{ limit = DEFAULT_ENTRY_LIMIT, notBefore }: ReadLastLogEntriesOptions = {},
): Promise<string> => {
	if (limit <= 0) {
		return "";
	}

	const collected: string[] = [];
	for await (const { line } of iterateLogEntriesBackwards(
		filePath,
		notBefore,
	)) {
		collected.push(line);
		if (collected.length >= limit) {
			break;
		}
	}

	return collected.reverse().join("\n");
};

export interface HourlyRequestCount {
	hour: string;
	count: number;
}

/**
 * Counts requests per hour inside `dateRange`, streaming the log backwards so that no
 * more than one chunk of the file is ever held in memory. Unlike
 * {@link readLastLogEntries} there is no entry cap: the result only grows with the
 * number of distinct hours, so a very wide range over a very large log stays cheap
 * and is never silently truncated.
 *
 * Produces the same output as `processLogs` applied to the whole file: entries are
 * bucketed by `StartUTC`, the range is inclusive on both ends, and the result is
 * sorted by hour ascending.
 */
export const aggregateHourlyRequests = async (
	filePath: string,
	dateRange?: { start?: string; end?: string },
): Promise<HourlyRequestCount[]> => {
	const start = dateRange?.start ? new Date(dateRange.start).getTime() : 0;
	const end = dateRange?.end
		? new Date(dateRange.end).getTime()
		: Number.POSITIVE_INFINITY;
	const hasRange = !!(dateRange?.start || dateRange?.end);
	const notBefore = dateRange?.start ? new Date(dateRange.start) : undefined;

	const counts = new Map<string, number>();

	for await (const { entry } of iterateLogEntriesBackwards(
		filePath,
		// An unparsable start date cannot be used as a cutoff; fall back to a full walk.
		notBefore && !Number.isNaN(notBefore.getTime()) ? notBefore : undefined,
	)) {
		const date = new Date(entry.StartUTC as string);
		const time = date.getTime();
		if (Number.isNaN(time)) {
			continue;
		}
		if (hasRange && (time < start || time > end)) {
			continue;
		}
		const hour = `${date.toISOString().slice(0, 13)}:00:00Z`;
		counts.set(hour, (counts.get(hour) ?? 0) + 1);
	}

	return [...counts.entries()]
		.map(([hour, count]) => ({ hour, count }))
		.sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
};
