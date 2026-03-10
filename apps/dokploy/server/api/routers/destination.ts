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
	// Non-S3 providers that use rclone native protocols
	const NON_S3_PROVIDERS = [
		"ftp", "sftp", "drive", "onedrive", "dropbox", "webdav",
		"b2", "mega", "pcloud", "box", "hubic", "yandex"
	];

	testConnection: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			const { secretAccessKey, bucket, region, endpoint, accessKey, provider } =
				input;
			
			// Check if it's a non-S3 provider
			const isNonS3 = provider && NON_S3_PROVIDERS.includes(provider);
			
			try {
				let rcloneCommand: string;
				
				if (isNonS3) {
					// Non-S3 providers use rclone native protocols
					const providerConfig: Record<string, string> = {
						ftp: `:ftp:${bucket || ""}`,
						sftp: `:sftp:${bucket || ""}`,
						drive: `:drive:${bucket || ""}`,
						onedrive: `:onedrive:${bucket || ""}`,
						dropbox: `:dropbox:${bucket || ""}`,
						webdav: `:webdav:${bucket || ""}`,
						b2: `:b2:${bucket || ""}`,
						mega: `:mega:${bucket || ""}`,
						pcloud: `:pcloud:${bucket || ""}`,
						box: `:box:${bucket || ""}`,
						hubic: `:hubic:${bucket || ""}`,
						yandex: `:yandex:${bucket || ""}`,
					};
					
					const rcloneFlags = [
						"--retries 1",
						"--low-level-retries 1",
						"--timeout 10s",
						"--contimeout 5s",
					];
					
					// Add authentication if provided
					if (accessKey) rcloneFlags.push(`--${provider}-user="${accessKey}"`);
					if (secretAccessKey) rcloneFlags.push(`--${provider}-pass="${secretAccessKey}"`);
					if (endpoint) rcloneFlags.push(`--${provider}-url="${endpoint}"`);
					
					rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${providerConfig[provider]}"`;
				} else {
					// S3 compatible providers
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
							: "Error connecting to bucket",
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
