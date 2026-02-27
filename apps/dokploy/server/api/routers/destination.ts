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
import {
	buildRcloneLsCommand,
	getRcloneConfigSetupCommand,
	getRcloneFlags,
	getRcloneRemotePath,
	getS3Credentials,
} from "@dokploy/server/utils/backups/utils";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
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
				if (destType === "s3") {
					// S3 uses inline flags
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
					const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

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
				} else {
					// Non-S3 destinations: write a config file and test with rclone ls
					const fakeDestination = {
						...input,
						destinationId: "test-connection",
						organizationId: "",
						createdAt: new Date(),
					} as any;

					const configSetup =
						getRcloneConfigSetupCommand(fakeDestination);
					const remotePath = getRcloneRemotePath(
						fakeDestination,
						"",
					);

					const testFlags = getRcloneFlags(fakeDestination);
					const testCommand = `rclone ls ${testFlags.join(" ")} --retries 1 --low-level-retries 1 --timeout 10s --contimeout 5s "${remotePath}" 2>&1 | head -n 5`;

					const fullCommand = configSetup
						? `${configSetup} && ${testCommand}`
						: testCommand;

					if (IS_CLOUD && !input.serverId) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Server not found",
						});
					}

					if (IS_CLOUD) {
						await execAsyncRemote(input.serverId || "", fullCommand);
					} else {
						await execAsync(fullCommand);
					}
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
