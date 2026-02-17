import {
	createDestintation,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	getRcloneConfigSetup,
	getRcloneFlags,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
	destinations,
} from "@/server/db/schema";

export const destinationRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createDestintation(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the destination",
					cause: error,
				});
			}
		}),
	testConnection: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			const destType = input.destinationType || "s3";

			try {
				let rcloneCommand: string;

				if (destType === "s3") {
					const {
						secretAccessKey,
						bucket,
						region,
						endpoint,
						accessKey,
						provider,
					} = input;
					const rcloneFlags = [
						`--s3-access-key-id="${accessKey}"`,
						`--s3-secret-access-key="${secretAccessKey}"`,
						`--s3-region="${region}"`,
						`--s3-endpoint="${endpoint}"`,
						"--s3-no-check-bucket",
						"--s3-force-path-style",
						"--retries 1",
						"--low-level-retries 1",
						"--timeout 10s",
						"--contimeout 5s",
					];
					if (provider) {
						rcloneFlags.unshift(`--s3-provider="${provider}"`);
					}
					const rcloneDestination = `:s3:${bucket}`;
					rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
				} else if (destType === "sftp") {
					const { sftpHost, sftpPort, sftpUsername, sftpPassword, sftpKeyPath, sftpRemotePath } = input;
					const rcloneFlags = [
						`--sftp-host="${sftpHost || ""}"`,
						`--sftp-user="${sftpUsername || ""}"`,
						"--retries 1",
						"--low-level-retries 1",
						"--timeout 10s",
						"--contimeout 5s",
					];
					if (sftpPort) {
						rcloneFlags.push(`--sftp-port="${sftpPort}"`);
					}
					if (sftpPassword) {
						rcloneFlags.push(`--sftp-pass="$(rclone obscure '${sftpPassword}')"`);
					}
					if (sftpKeyPath) {
						rcloneFlags.push(`--sftp-key-file="${sftpKeyPath}"`);
					}
					const remotePath = (sftpRemotePath || "/").replace(/\/+$/, "");
					rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} ":sftp:${remotePath}"`;
				} else if (destType === "rclone") {
					const { rcloneConfig, rcloneRemoteName, rcloneRemotePath } = input;
					const configSetup = rcloneConfig
						? `RCLONE_CONFIG_FILE=$(mktemp /tmp/rclone-config-XXXXXX.conf) && cat > "$RCLONE_CONFIG_FILE" << 'RCLONE_EOF'\n${rcloneConfig}\nRCLONE_EOF\nexport RCLONE_CONFIG="$RCLONE_CONFIG_FILE" && `
						: "";
					const remoteName = rcloneRemoteName || "remote";
					const remotePath = (rcloneRemotePath || "").replace(/\/+$/, "");
					rcloneCommand = `${configSetup}rclone ls --retries 1 --low-level-retries 1 --timeout 10s --contimeout 5s "${remoteName}:${remotePath}"`;
				} else {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Unknown destination type: ${destType}`,
					});
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
	one: protectedProcedure
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
	all: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.destinations.findMany({
			where: eq(destinations.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(destinations.createdAt)],
		});
	}),
	remove: adminProcedure
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
				return await removeDestinationById(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw error;
			}
		}),
	update: adminProcedure
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
				return await updateDestinationById(input.destinationId, {
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
});
