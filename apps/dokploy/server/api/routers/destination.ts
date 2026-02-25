import {
	createDestintation,
	execAsync,
	execAsyncRemote,
	findDestinationById,
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

const shEscapeForDoubleQuotes = (value: string) => {
	return value.replace(/[\\"$`]/g, "\\$&");
};

const shDoubleQuote = (value: string) => {
	return `"${shEscapeForDoubleQuotes(value)}"`;
};

const parseHostPort = (endpoint: string) => {
	if (endpoint.startsWith("[")) {
		const closing = endpoint.indexOf("]");
		if (closing !== -1) {
			const host = endpoint.slice(1, closing);
			const rest = endpoint.slice(closing + 1);
			if (rest.startsWith(":")) {
				return { host, port: rest.slice(1) };
			}
			return { host };
		}
	}

	const lastColon = endpoint.lastIndexOf(":");
	if (lastColon > 0 && endpoint.indexOf(":") === lastColon) {
		return { host: endpoint.slice(0, lastColon), port: endpoint.slice(lastColon + 1) };
	}

	return { host: endpoint };
};

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
			const { secretAccessKey, bucket, region, endpoint, accessKey, provider } =
				input;
			try {
				const timeoutFlags = [
					"--retries 1",
					"--low-level-retries 1",
					"--timeout 10s",
					"--contimeout 5s",
				];

				let rcloneFlags: string[] = [];
				let rcloneDestination = "";

				if (provider === "FTP") {
					rcloneFlags = [
						`--ftp-host=${shDoubleQuote(endpoint)}`,
						`--ftp-user=${shDoubleQuote(accessKey)}`,
						`--ftp-pass=${shDoubleQuote(secretAccessKey)}`,
						...timeoutFlags,
					];
					rcloneDestination = `:ftp:${shEscapeForDoubleQuotes(bucket)}`;
				} else if (provider === "SFTP") {
					const { host, port } = parseHostPort(endpoint);
					rcloneFlags = [
						`--sftp-host=${shDoubleQuote(host)}`,
						`--sftp-user=${shDoubleQuote(accessKey)}`,
						`--sftp-pass=${shDoubleQuote(secretAccessKey)}`,
						...timeoutFlags,
					];
					if (port) {
						rcloneFlags.push(`--sftp-port=${shDoubleQuote(port)}`);
					}
					rcloneDestination = `:sftp:${shEscapeForDoubleQuotes(bucket)}`;
				} else {
					rcloneFlags = [
						`--s3-access-key-id=${shDoubleQuote(accessKey)}`,
						`--s3-secret-access-key=${shDoubleQuote(secretAccessKey)}`,
						`--s3-region=${shDoubleQuote(region)}`,
						`--s3-endpoint=${shDoubleQuote(endpoint)}`,
						"--s3-no-check-bucket",
						"--s3-force-path-style",
						...timeoutFlags,
					];
					if (provider) {
						rcloneFlags.unshift(`--s3-provider=${shDoubleQuote(provider)}`);
					}
					rcloneDestination = `:s3:${shEscapeForDoubleQuotes(bucket)}`;
				}
				const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} ${shDoubleQuote(rcloneDestination)}`;

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
