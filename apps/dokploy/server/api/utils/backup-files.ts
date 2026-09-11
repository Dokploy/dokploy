import { ExecError, findBackupById } from "@dokploy/server";
import type { Destination } from "@dokploy/server/services/destination";
import { findDestinationById } from "@dokploy/server/services/destination";
import type { PermissionCtx } from "@dokploy/server/services/permission";
import {
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import {
	getBackupFolder,
	getS3Credentials,
} from "@dokploy/server/utils/backups/utils";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";

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

export const resolveBackupAccess = async (
	ctx: PermissionCtx,
	backupId: string,
) => {
	const backup = await findBackupById(backupId);

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
		// Web server backups hold the whole instance, so they stay admin-only.
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

	const destination = await findDestinationById(backup.destinationId);
	if (destination.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this destination.",
		});
	}

	return { destination, folder: getBackupFolder(backup) };
};

export const listRcloneFiles = async (
	destination: Destination,
	key: string,
): Promise<RcloneFile[]> => {
	const path = `:s3:${destination.bucket}/${key}`;
	const command = `rclone lsjson ${getS3Credentials(destination).join(" ")} --files-only --no-mimetype ${quote([path])}`;

	try {
		// A folder without retention outgrows exec's 1 MiB default in a few thousand backups.
		const { stdout } = await execAsync(command, {
			maxBuffer: 32 * 1024 * 1024,
		});

		const files = JSON.parse(stdout) as RcloneFile[];
		return files.sort((a, b) => b.Name.localeCompare(a.Name));
	} catch (error) {
		// Only stderr: the exec message carries the command, and redaction upstream
		// does not cover the unquoted values shell-quote produces.
		const detail =
			error instanceof ExecError ? (error.stderr ?? "") : String(error);

		// A destination without backups yet is a normal state, not an error.
		if (/directory not found|object not found/i.test(detail)) {
			return [];
		}

		console.error(redactRcloneCredentials(detail));
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error listing backup files",
		});
	}
};
