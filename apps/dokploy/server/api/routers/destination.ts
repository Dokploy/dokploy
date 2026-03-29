import {
	createDestintation,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
	destinations,
} from "@/server/db/schema";

export const destinationRouter = createTRPCRouter({
	create: withPermission("destination", "create")
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createDestintation(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "destination",
					resourceId: result.destinationId,
					resourceName: input.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the destination",
					cause: error,
				});
			}
		}),
	testConnection: withPermission("destination", "create")
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			try {
				const retryFlags =
					"--retries 1 --low-level-retries 1 --timeout 10s --contimeout 5s";

				let rcloneCommand: string;

				if (input.destinationType === "sftp") {
					const cfg = input.providerConfig;
					const port = cfg.port ?? "22";
					const rcloneDestination = `:sftp:${cfg.remotePath ?? "/"}`;
					rcloneCommand = `SFTP_PASS=$(rclone obscure "${cfg.password}"); rclone ls --sftp-host="${cfg.host}" --sftp-user="${cfg.user}" --sftp-pass="$SFTP_PASS" --sftp-port="${port}" ${retryFlags} "${rcloneDestination}"`;
				} else if (input.destinationType === "ftp") {
					const cfg = input.providerConfig;
					const port = cfg.port ?? "21";
					const ftpFlags = cfg.explicitTls ? "--ftp-explicit-tls" : "";
					const rcloneDestination = `:ftp:${cfg.remotePath ?? "/"}`;
					rcloneCommand = `FTP_PASS=$(rclone obscure "${cfg.password}"); rclone ls --ftp-host="${cfg.host}" --ftp-user="${cfg.user}" --ftp-pass="$FTP_PASS" --ftp-port="${port}" ${ftpFlags} ${retryFlags} "${rcloneDestination}"`;
				} else if (input.destinationType === "gdrive") {
					const cfg = input.providerConfig;
					const rootFolder = cfg.rootFolderId ?? "";
					const rcloneDestination = rootFolder
						? `:drive,root_folder_id=${rootFolder}:`
						: ":drive:";
					rcloneCommand = `rclone ls --drive-service-account-credentials="${cfg.serviceAccountKey.replace(/"/g, '\\"')}" ${retryFlags} "${rcloneDestination}"`;
				} else {
					// S3 / S3-compatible
					const { secretAccessKey, bucket, region, endpoint, accessKey, provider } = input as Extract<typeof input, { destinationType: "s3" }>;
					const rcloneFlags = [
						`--s3-access-key-id="${accessKey}"`,
						`--s3-secret-access-key="${secretAccessKey}"`,
						`--s3-region="${region}"`,
						`--s3-endpoint="${endpoint}"`,
						"--s3-no-check-bucket",
						"--s3-force-path-style",
						retryFlags,
					];
					if (provider) {
						rcloneFlags.unshift(`--s3-provider="${provider}"`);
					}
					rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} ":s3:${bucket}"`;
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Server not found",
					});
				}

				if (IS_CLOUD) {
					await execAsyncRemote(input.serverId || "", rcloneCommand);
				} else {
					await execAsync(rcloneCommand);
				}
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error?.message
							: "Error connecting to destination",
					cause: error,
				});
			}
		}),
	one: withPermission("destination", "read")
		.input(apiFindOneDestination)
		.query(async ({ input, ctx }) => {
			const destination = await findDestinationById(input.destinationId);
			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}
			return destination;
		}),
	all: withPermission("destination", "read").query(async ({ ctx }) => {
		return await db.query.destinations.findMany({
			where: eq(destinations.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(destinations.createdAt)],
		});
	}),
	remove: withPermission("destination", "delete")
		.input(apiRemoveDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);

				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this destination",
					});
				}
				const result = await removeDestinationById(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "delete",
					resourceType: "destination",
					resourceId: input.destinationId,
					resourceName: destination.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	update: withPermission("destination", "create")
		.input(apiUpdateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);
				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this destination",
					});
				}
				const result = await updateDestinationById(input.destinationId, {
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "destination",
					resourceId: input.destinationId,
					resourceName: input.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
});
