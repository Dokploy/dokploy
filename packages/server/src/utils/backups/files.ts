import { IS_CLOUD } from "@dokploy/server/constants";
import {
	type BackupSchedule,
	findBackupById,
} from "@dokploy/server/services/backup";
import { findDestinationById } from "@dokploy/server/services/destination";
import {
	checkServicePermissionAndAccess,
	findMemberByUserId,
	type PermissionCtx,
} from "@dokploy/server/services/permission";
import { findServerById } from "@dokploy/server/services/server";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";
import { ExecError, execAsync, execAsyncRemote } from "../process/execAsync";
import { redactRcloneCredentials } from "./redact";
import { getBackupFolder, getS3Credentials } from "./utils";

export interface RcloneFile {
	Path: string;
	Name: string;
	Size: number;
	IsDir: boolean;
	ModTime?: string;
	Tier?: string;
	Hashes?: {
		MD5?: string;
		SHA1?: string;
	};
}

const BACKUP_FILE_NAME = /^[^/.][^/]*\.(sql\.gz|bson\.gz|zip)$/;

export const getBackupServerId = (backup: BackupSchedule) =>
	backup.postgres?.serverId ??
	backup.mysql?.serverId ??
	backup.mariadb?.serverId ??
	backup.mongo?.serverId ??
	backup.libsql?.serverId ??
	backup.compose?.serverId ??
	null;

export const resolveBackupAccess = async (
	ctx: PermissionCtx,
	backupId: string,
) => {
	const backup = await findBackupById(backupId);
	const destination = await findDestinationById(backup.destinationId);
	if (destination.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this destination.",
		});
	}

	const serviceId =
		backup.postgresId ||
		backup.mysqlId ||
		backup.mariadbId ||
		backup.mongoId ||
		backup.libsqlId ||
		backup.composeId;

	if (serviceId) {
		await checkServicePermissionAndAccess(ctx, serviceId, { backup: ["read"] });
	} else {
		const member = await findMemberByUserId(
			ctx.user.id,
			ctx.session.activeOrganizationId,
		);
		if (member.role !== "owner" && member.role !== "admin") {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this backup.",
			});
		}
	}

	const serverId = getBackupServerId(backup);
	if (serverId) {
		const server = await findServerById(serverId);
		if (server.organizationId !== ctx.session.activeOrganizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this server.",
			});
		}
	} else if (IS_CLOUD) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
	}

	return {
		backup,
		destination,
		serverId,
		path: `:s3:${destination.bucket}/${getBackupFolder(backup)}`,
	};
};

const runRclone = (command: string, serverId: string | null) =>
	serverId
		? execAsyncRemote(serverId, command)
		: execAsync(command, { maxBuffer: 32 * 1024 * 1024 });

const getErrorDetail = (error: unknown) =>
	error instanceof ExecError
		? error.stderr || (error.serverId ? error.message : "")
		: String(error);

const modTime = (file: RcloneFile) => Date.parse(file.ModTime ?? "") || 0;

export const listBackupFilesByBackupId = async (
	ctx: PermissionCtx,
	backupId: string,
): Promise<RcloneFile[]> => {
	const { backup, destination, serverId, path } = await resolveBackupAccess(
		ctx,
		backupId,
	);
	const include =
		backup.databaseType === "web-server" ? "*.zip" : "*.{sql.gz,bson.gz}";
	const command = `rclone lsjson ${getS3Credentials(destination).join(" ")} --files-only --no-mimetype --use-server-modtime --include ${quote([include])} ${quote([path])}`;

	try {
		const { stdout } = await runRclone(command, serverId);
		const files = JSON.parse(stdout) as RcloneFile[];
		return files.sort((a, b) => modTime(b) - modTime(a));
	} catch (error) {
		const detail = getErrorDetail(error);
		if (/directory not found|object not found/i.test(detail)) {
			return [];
		}
		console.error("rclone lsjson failed:", redactRcloneCredentials(detail));
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error listing backup files",
		});
	}
};

export const getBackupDownloadUrl = async (
	ctx: PermissionCtx,
	backupId: string,
	fileName: string,
) => {
	if (!BACKUP_FILE_NAME.test(fileName)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid backup file name",
		});
	}
	const { destination, serverId, path } = await resolveBackupAccess(
		ctx,
		backupId,
	);
	const command = `rclone link --expire 15m ${getS3Credentials(destination).join(" ")} ${quote([`${path}${fileName}`])}`;

	try {
		const { stdout } = await runRclone(command, serverId);
		const url = stdout.trim().split("\n").pop();
		if (!url) {
			throw new Error("rclone link returned no URL");
		}
		return { url };
	} catch (error) {
		const detail = getErrorDetail(error);
		if (/object not found/i.test(detail)) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Backup file not found",
			});
		}
		console.error("rclone link failed:", redactRcloneCredentials(detail));
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Could not generate the download link",
		});
	}
};
