import { findDestinationById } from "@dokploy/server/services/destination";
import { findServerById } from "@dokploy/server/services/server";
import {
	getS3Credentials,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";
import type { z } from "zod";
import type { backupFileQuery, RcloneFile } from "./backup-file-pagination";

export const listBackupFiles = async (
	input: z.infer<typeof backupFileQuery>,
	organizationId: string,
): Promise<RcloneFile[]> => {
	const destination = await findDestinationById(input.destinationId);
	if (destination.organizationId !== organizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this destination.",
		});
	}
	if (input.serverId) {
		const server = await findServerById(input.serverId);
		if (server.organizationId !== organizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this server.",
			});
		}
	}
	const slash = input.search.lastIndexOf("/");
	const baseDir =
		slash === -1 ? "" : normalizeS3Path(input.search.slice(0, slash + 1));
	const searchTerm = input.search.slice(slash + 1).toLowerCase();
	const bucketPath = `:s3:${destination.bucket}`;
	const searchPath = baseDir ? `${bucketPath}/${baseDir}` : bucketPath;
	const command = `rclone lsjson ${getS3Credentials(destination).join(" ")} ${quote([searchPath])} --no-mimetype --no-modtime 2>/dev/null`;
	let stdout: string;
	try {
		({ stdout } = input.serverId
			? await execAsyncRemote(input.serverId, command)
			: await execAsync(command));
	} catch {
		// Execution errors can contain the command and destination credentials.
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Unable to list backup files. Please retry.",
		});
	}
	let files: RcloneFile[];
	try {
		files = JSON.parse(stdout);
		if (
			!Array.isArray(files) ||
			files.some(
				(file) =>
					!file ||
					typeof file.Path !== "string" ||
					typeof file.Name !== "string" ||
					typeof file.Size !== "number" ||
					typeof file.IsDir !== "boolean",
			)
		) {
			throw new Error("Invalid listing");
		}
	} catch {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to parse backup files list",
		});
	}
	return files
		.map((file) =>
			baseDir ? { ...file, Path: `${baseDir}${file.Path}` } : file,
		)
		.filter((file) => file.Path.toLowerCase().includes(searchTerm));
};
