import { createHash } from "node:crypto";
import type { RcloneFile } from "@dokploy/server/utils/backups/files";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export type { RcloneFile } from "@dokploy/server/utils/backups/files";

export const backupFileQuery = z.object({
	destinationId: z.string(),
	search: z.string(),
	serverId: z.string().optional(),
});

export const backupFilePageQuery = backupFileQuery.extend({
	destinationId: z.string().min(1).max(256),
	search: z.string().max(4096),
	serverId: z.string().max(256).optional(),
	limit: z.number().int().min(1).max(100).default(50),
	cursor: z.string().min(1).max(512).optional(),
});

const timestampPattern = "(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z)";
const nativeNames = [
	new RegExp(`^(?:.+-)?${timestampPattern}\\.(?:sql|bson)\\.gz$`),
	new RegExp(`^webserver-backup-(?:.+-)?${timestampPattern}\\.zip$`),
	new RegExp(`^.+-${timestampPattern}\\.tar$`),
];

export const backupFileTimestamp = (file: RcloneFile): number | null => {
	if (file.IsDir) return null;
	const name = file.Path.slice(file.Path.lastIndexOf("/") + 1);
	const stamp = nativeNames
		.map((pattern) => pattern.exec(name)?.[1])
		.find(Boolean);
	if (!stamp) return null;
	const iso = `${stamp.slice(0, 13)}:${stamp.slice(14, 16)}:${stamp.slice(17, 19)}.${stamp.slice(20)}`;
	const time = Date.parse(iso);
	return Number.isFinite(time) && new Date(time).toISOString() === iso
		? time
		: null;
};

const descendingPath = (a: string, b: string) => {
	const left = Array.from(a, (character) => character.codePointAt(0)!);
	const right = Array.from(b, (character) => character.codePointAt(0)!);
	for (let i = 0; i < Math.min(left.length, right.length); i++) {
		if (left[i] !== right[i]) return right[i]! - left[i]!;
	}
	return right.length - left.length;
};

export const sortBackupFiles = (files: RcloneFile[]) =>
	files
		.map((file) => ({ file, timestamp: backupFileTimestamp(file) }))
		.sort((a, b) => {
			if (a.file.IsDir !== b.file.IsDir) return a.file.IsDir ? -1 : 1;
			if (
				a.timestamp !== null &&
				b.timestamp !== null &&
				a.timestamp !== b.timestamp
			) {
				return b.timestamp - a.timestamp;
			}
			if ((a.timestamp === null) !== (b.timestamp === null))
				return a.timestamp === null ? 1 : -1;
			return descendingPath(a.file.Path, b.file.Path);
		})
		.map(({ file }) => file);

const digest = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cursorSchema = z
	.object({
		v: z.literal(1),
		scope: z.string().regex(/^[a-f0-9]{64}$/),
		snapshot: z.string().regex(/^[a-f0-9]{64}$/),
		offset: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	})
	.strict();

export const paginateBackupFiles = (
	files: RcloneFile[],
	input: z.infer<typeof backupFilePageQuery>,
	organizationId: string,
) => {
	const sorted = sortBackupFiles(files).map((file) => ({
		Path: file.Path,
		Name: file.Name,
		IsDir: file.IsDir,
		Size: file.Size,
		Tier: file.Tier,
		Hashes: file.Hashes
			? { MD5: file.Hashes.MD5, SHA1: file.Hashes.SHA1 }
			: undefined,
	}));
	const scope = digest([
		organizationId,
		input.destinationId,
		input.serverId || "",
		input.search,
		input.limit,
	]);
	// Only fields available without object metadata participate. Identical-size
	// overwrites cannot be detected when the provider supplies no hash.
	const snapshot = digest(
		sorted.map((file) => [
			file.Path,
			file.Name,
			file.IsDir,
			file.Size,
			file.Tier,
			file.Hashes?.MD5,
			file.Hashes?.SHA1,
		]),
	);
	let offset = 0;
	if (input.cursor) {
		let cursor: z.infer<typeof cursorSchema>;
		try {
			if (!/^[A-Za-z0-9_-]+$/.test(input.cursor) || input.cursor.length > 512)
				throw new Error("Invalid encoding");
			cursor = cursorSchema.parse(
				JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
			);
		} catch {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid backup listing cursor. Refresh the list.",
			});
		}
		if (cursor.scope !== scope) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					"Backup listing cursor does not match this query. Refresh the list.",
			});
		}
		if (cursor.snapshot !== snapshot) {
			throw new TRPCError({
				code: "CONFLICT",
				message:
					"Backup files changed. Refresh to start from the newest files.",
			});
		}
		if (cursor.offset >= sorted.length || cursor.offset % input.limit !== 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid backup listing offset. Refresh the list.",
			});
		}
		offset = cursor.offset;
	}
	const items = sorted.slice(offset, offset + input.limit);
	const nextOffset = offset + items.length;
	return {
		items,
		nextCursor:
			nextOffset < sorted.length
				? Buffer.from(
						JSON.stringify({ v: 1, scope, snapshot, offset: nextOffset }),
					).toString("base64url")
				: null,
	};
};
