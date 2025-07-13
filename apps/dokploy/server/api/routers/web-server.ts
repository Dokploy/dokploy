import {
	apiAssignDomain,
	apiSaveSSHKey,
	apiUpdateDockerCleanup,
	updateWebServerSchema,
} from "@/server/db/schema";
import { removeJob, schedule } from "@/server/utils/backup";
import {
	IS_CLOUD,
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	findServerById,
	findWebServer,
	sendDockerCleanupNotifications,
	updateLetsEncryptEmail,
	updateServerById,
	updateServerTraefik,
	updateWebServer,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const webServerRouter = createTRPCRouter({
	get: adminProcedure.query(async () => {
		if (IS_CLOUD) {
			return null;
		}
		return await findWebServer();
	}),
	update: adminProcedure
		.input(updateWebServerSchema)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return null;
			}
			return await updateWebServer(input);
		}),
	saveSSHPrivateKey: adminProcedure
		.input(apiSaveSSHKey)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return null;
			}
			await updateWebServer({
				sshPrivateKey: input.sshPrivateKey,
			});

			return true;
		}),
	assignDomainServer: adminProcedure
		.input(apiAssignDomain)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			const webServer = await updateWebServer({
				host: input.host,
				...(input.letsEncryptEmail && {
					letsEncryptEmail: input.letsEncryptEmail,
				}),
				certificateType: input.certificateType,
				https: input.https,
			});

			if (!webServer) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			updateServerTraefik(webServer, input.host);
			if (input.letsEncryptEmail) {
				updateLetsEncryptEmail(input.letsEncryptEmail);
			}

			return webServer;
		}),
	cleanSSHPrivateKey: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		await updateWebServer({
			sshPrivateKey: null,
		});
		return true;
	}),
	updateDockerCleanup: adminProcedure
		.input(apiUpdateDockerCleanup)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				await updateServerById(input.serverId, {
					enableDockerCleanup: input.enableDockerCleanup,
				});

				const server = await findServerById(input.serverId);

				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}

				if (server.enableDockerCleanup) {
					const server = await findServerById(input.serverId);
					if (server.serverStatus === "inactive") {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Server is inactive",
						});
					}
					if (IS_CLOUD) {
						await schedule({
							cronSchedule: "0 0 * * *",
							serverId: input.serverId,
							type: "server",
						});
					} else {
						scheduleJob(server.serverId, "0 0 * * *", async () => {
							console.log(
								`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
							);
							await cleanUpUnusedImages(server.serverId);
							await cleanUpDockerBuilder(server.serverId);
							await cleanUpSystemPrune(server.serverId);
							await sendDockerCleanupNotifications(server.organizationId);
						});
					}
				} else {
					if (IS_CLOUD) {
						await removeJob({
							cronSchedule: "0 0 * * *",
							serverId: input.serverId,
							type: "server",
						});
					} else {
						const currentJob = scheduledJobs[server.serverId];
						currentJob?.cancel();
					}
				}
			} else if (!IS_CLOUD) {
				const userUpdated = await updateWebServer({
					enableDockerCleanup: input.enableDockerCleanup,
				});

				if (userUpdated?.enableDockerCleanup) {
					scheduleJob("docker-cleanup", "0 0 * * *", async () => {
						console.log(
							`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
						);
						await cleanUpUnusedImages();
						await cleanUpDockerBuilder();
						await cleanUpSystemPrune();
						await sendDockerCleanupNotifications(
							ctx.session.activeOrganizationId,
						);
					});
				} else {
					const currentJob = scheduledJobs["docker-cleanup"];
					currentJob?.cancel();
				}
			}

			return true;
		}),
});
