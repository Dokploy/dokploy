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

/**
 * Reads the most recent entries of a Traefik access log.
 *
 * The file is walked backwards in fixed-size chunks and the walk stops as soon as
 * `limit` entries have been collected or an entry logged before `notBefore` is reached.
 * `access.log` is append-only and ordered by the `time` each request finished, so
 * reading backwards visits entries newest-first and the first entry logged before
 * `notBefore` guarantees every remaining entry is out of range too — the rest of the
 * file never has to be touched.
 *
 * Memory is bounded by the entries actually returned rather than by the size of the
 * file, and the event loop is never blocked.
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

	const handle = await fs.promises.open(filePath, "r");

	try {
		const { size } = await handle.stat();

		const collected: string[] = [];
		let position = size;
		let pending = Buffer.alloc(0);
		let reachedCutoff = false;

		const take = (raw: Buffer) => {
			const line = raw.toString("utf8").trim();
			// Same guard as the rest of the access-log helpers: only keep lines that
			// look like a complete JSON object.
			if (!line.startsWith("{") || !line.endsWith("}")) {
				return;
			}

			let entry: PartialLogEntry;
			try {
				entry = JSON.parse(line);
			} catch {
				return;
			}

			if (entry.ServiceName === DOKPLOY_DASHBOARD_SERVICE) {
				return;
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
					return;
				}
				if (loggedAt < notBefore.getTime()) {
					reachedCutoff = true;
					return;
				}
			}

			collected.push(line);
		};

		while (position > 0 && collected.length < limit && !reachedCutoff) {
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

			for (const line of lines) {
				take(line);
				if (reachedCutoff || collected.length >= limit) {
					break;
				}
			}
		}

		// The very first line of the file has no newline before it.
		if (pending.length > 0 && collected.length < limit && !reachedCutoff) {
			take(pending);
		}

		return collected.reverse().join("\n");
	} finally {
		await handle.close();
	}
};
