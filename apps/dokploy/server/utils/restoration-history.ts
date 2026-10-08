import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { open, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { type Restoration, restorations } from "@dokploy/server/db/schema";
import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
import { z } from "zod";

// The dot directory survives the existing whole-instance restore's BASE_PATH/* replacement.
export const restorationHistoryDirectory = () =>
	path.join(paths().BASE_PATH, ".restorations");
const runtime = globalThis as unknown as {
	dokployActiveRestorations?: Set<string>;
};
const activeRestorations = (runtime.dokployActiveRestorations ??=
	new Set<string>());
const historySchema = z.object({
	restorationId: z.string().regex(/^[\w-]+$/),
	organizationId: z.string().nullable(),
	kind: z.enum(["database", "volume", "dokploy"]),
	serviceId: z.string(),
	serviceType: z.string(),
	serviceName: z.string(),
	serviceHref: z
		.string()
		.nullable()
		.refine((href) => href === null || href.startsWith("/dashboard/")),
	targetName: z.string(),
	backupFile: z.string(),
	destinationName: z.string(),
	status: z.enum(["running", "done", "error", "cancelled"]),
	createdAt: z.string(),
	finishedAt: z.string().nullable(),
	errorMessage: z.string().nullable(),
});

export const redactRestorationLog = (text: string, secrets: string[] = []) => {
	let safe = redactRcloneCredentials(text);
	for (const secret of secrets
		.filter(Boolean)
		.sort((a, b) => b.length - a.length)) {
		for (const value of new Set([secret, quote([secret])]))
			safe = safe.split(value).join("[REDACTED]");
	}
	return safe;
};

export const collectRestorationSecrets = (value: unknown): string[] => {
	if (!value || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, item]) =>
		typeof item === "string" && /password|secret|accesskey|token/i.test(key)
			? [item]
			: collectRestorationSecrets(item),
	);
};

function journal(row: Restoration) {
	const directory = restorationHistoryDirectory();
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const temporary = path.join(directory, `${row.restorationId}.json.tmp`);
	writeFileSync(temporary, JSON.stringify(row), { mode: 0o600 });
	renameSync(temporary, path.join(directory, `${row.restorationId}.json`));
}

export const restorationLogPath = (id: string) => {
	if (!/^[\w-]+$/.test(id)) throw new Error("Invalid restoration ID");
	return path.join(restorationHistoryDirectory(), `${id}.log`);
};

export async function startTrackedRestoration(
	metadata: Omit<
		Restoration,
		"restorationId" | "status" | "createdAt" | "finishedAt" | "errorMessage"
	>,
	run: (append: (chunk: string) => void) => Promise<void>,
	secrets: string[] = [],
	afterRestore?: () => Promise<void>,
) {
	const row: Restoration = {
		...metadata,
		restorationId: nanoid(),
		status: "running",
		createdAt: new Date().toISOString(),
		finishedAt: null,
		errorMessage: null,
	};
	await db.insert(restorations).values(row);
	try {
		journal(row);
		writeFileSync(restorationLogPath(row.restorationId), "", { mode: 0o600 });
	} catch (error) {
		await db
			.delete(restorations)
			.where(eq(restorations.restorationId, row.restorationId));
		throw error;
	}
	// This task is independent of the HTTP request and of any log-viewer subscription.
	activeRestorations.add(row.restorationId);
	void executeTrackedRestoration(row, run, secrets, afterRestore)
		.finally(() => activeRestorations.delete(row.restorationId))
		.catch(() => {
			console.error("Unable to save restoration state", row.restorationId);
		});
	return { restorationId: row.restorationId };
}

export async function executeTrackedRestoration(
	row: Restoration,
	run: (append: (chunk: string) => void) => Promise<void>,
	secrets: string[] = [],
	afterRestore?: () => Promise<void>,
) {
	const file = restorationLogPath(row.restorationId);
	let pending = "";
	let logError: unknown;
	let recoveryAttempted = false;
	const save = (line: string) =>
		appendFileSync(file, redactRestorationLog(line, secrets));
	const append = (chunk: string) => {
		if (logError) return;
		try {
			pending += chunk;
			const end = pending.lastIndexOf("\n");
			if (end >= 0) {
				save(pending.slice(0, end + 1));
				pending = pending.slice(end + 1);
			}
		} catch (error) {
			logError = error;
		}
	};
	try {
		append("Starting restoration...\n");
		await run(append);
		if (logError) throw new Error("Unable to persist restoration logs");
		if (afterRestore) {
			recoveryAttempted = true;
			await afterRestore();
		}
		append("Restore completed successfully!\n");
		row.status = "done";
	} catch (error) {
		row.status = "error";
		row.errorMessage = redactRestorationLog(
			error instanceof Error ? error.message : "Restoration failed",
			secrets,
		);
		append(`Error: ${row.errorMessage}\n`);
		if (afterRestore && !recoveryAttempted) {
			try {
				await afterRestore();
			} catch {
				append(
					"Unable to reattach the history to the restored database. The result remains in the history journal.\n",
				);
			}
		}
	} finally {
		if (pending && !logError) save(`${pending}\n`);
		row.finishedAt = new Date().toISOString();
		journal(row);
		await db
			.insert(restorations)
			.values(row)
			.onConflictDoUpdate({
				target: restorations.restorationId,
				set: {
					status: row.status,
					finishedAt: row.finishedAt,
					errorMessage: row.errorMessage,
				},
			});
	}
}

export async function readRestorationLog(id: string) {
	const file = await open(restorationLogPath(id), "r");
	try {
		const { size } = await file.stat();
		const start = Math.max(0, size - 128 * 1024);
		const buffer = Buffer.alloc(size - start);
		await file.read(buffer, 0, buffer.length, start);
		return { text: buffer.toString("utf8"), truncated: start > 0 };
	} finally {
		await file.close();
	}
}

export async function recoverRestorationHistory(interrupted = false) {
	let files: string[];
	try {
		files = await readdir(restorationHistoryDirectory());
	} catch {
		return;
	}
	for (const file of files
		.filter((name) => name.endsWith(".json"))
		.sort(
			(a, b) =>
				Number(activeRestorations.has(a.slice(0, -5))) -
				Number(activeRestorations.has(b.slice(0, -5))),
		)) {
		let value: unknown;
		try {
			value = JSON.parse(
				await readFile(path.join(restorationHistoryDirectory(), file), "utf8"),
			);
		} catch {
			continue;
		}
		const parsed = historySchema.safeParse(value);
		if (!parsed.success) continue;
		const row = parsed.data;
		if (file !== `${row.restorationId}.json`) continue;
		if (
			row.organizationId &&
			!(await db.query.organization.findFirst({
				where: (table, { eq }) => eq(table.id, row.organizationId!),
			}))
		)
			continue;
		if (
			(interrupted || !activeRestorations.has(row.restorationId)) &&
			row.status === "running"
		) {
			row.status = "error";
			row.finishedAt = new Date().toISOString();
			row.errorMessage = interrupted
				? "Dokploy restarted before completion. Verify the restored data before retrying."
				: "This restoration has no active task after restoring Dokploy. Verify the restored data before retrying.";
			appendFileSync(
				restorationLogPath(row.restorationId),
				`${row.errorMessage}\n`,
			);
			journal(row);
		}
		await db
			.insert(restorations)
			.values(row)
			.onConflictDoUpdate({
				target: restorations.restorationId,
				set: {
					status: row.status,
					finishedAt: row.finishedAt,
					errorMessage: row.errorMessage,
				},
			});
	}
}
