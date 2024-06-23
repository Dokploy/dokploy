import { docker, MAIN_TRAEFIK_PATH, MONITORING_PATH } from "@/server/constants";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
import {
	cleanStoppedContainers,
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	cleanUpUnusedVolumes,
	startService,
	stopService,
} from "@/server/utils/docker/utils";
import {
	apiAssignDomain,
	apiModifyTraefikConfig,
	apiReadTraefikConfig,
	apiSaveSSHKey,
	apiTraefikConfig,
	apiUpdateDockerCleanup,
} from "@/server/db/schema";
import { scheduledJobs, scheduleJob } from "node-schedule";
import {
	readMainConfig,
	updateLetsEncryptEmail,
	updateServerTraefik,
	writeMainConfig,
} from "@/server/utils/traefik/web-server";
import {
	readConfig,
	readConfigInPath,
	writeConfig,
	writeTraefikConfigInPath,
} from "@/server/utils/traefik/application";
import { spawnAsync } from "@/server/utils/process/spawnAsync";
import { findAdmin, updateAdmin } from "../services/admin";
import { TRPCError } from "@trpc/server";
import {
	getDokployVersion,
	getDokployImage,
	pullLatestRelease,
	readDirectory,
} from "../services/settings";
import { canAccessToTraefikFiles } from "../services/user";
import { recreateDirectory } from "@/server/utils/filesystem/directory";
import { doc } from "../root";

export const settingsRouter = createTRPCRouter({
	reloadServer: adminProcedure.mutation(async () => {
		await spawnAsync("docker", [
			"service",
			"update",
			"--force",
			"--image",
			getDokployImage(),
			"dokploy",
		]);
		return true;
	}),
	reloadTraefik: adminProcedure.mutation(async () => {
		await stopService("dokploy-traefik");
		await startService("dokploy-traefik");
		return true;
	}),
	cleanUnusedImages: adminProcedure.mutation(async () => {
		await cleanUpUnusedImages();
		return true;
	}),
	cleanUnusedVolumes: adminProcedure.mutation(async () => {
		await cleanUpUnusedVolumes();
		return true;
	}),
	cleanStoppedContainers: adminProcedure.mutation(async () => {
		await cleanStoppedContainers();
		return true;
	}),
	cleanDockerBuilder: adminProcedure.mutation(async () => {
		await cleanUpDockerBuilder();
	}),
	cleanDockerPrune: adminProcedure.mutation(async () => {
		await cleanUpSystemPrune();
		await cleanUpDockerBuilder();

		return true;
	}),
	cleanAll: adminProcedure.mutation(async () => {
		await cleanUpUnusedImages();
		await cleanUpDockerBuilder();
		await cleanUpSystemPrune();
		return true;
	}),
	cleanMonitoring: adminProcedure.mutation(async () => {
		await recreateDirectory(MONITORING_PATH);
		return true;
	}),
	saveSSHPrivateKey: adminProcedure
		.input(apiSaveSSHKey)
		.mutation(async ({ input, ctx }) => {
			await updateAdmin(ctx.user.authId, {
				sshPrivateKey: input.sshPrivateKey,
			});

			return true;
		}),
	assignDomainServer: adminProcedure
		.input(apiAssignDomain)
		.mutation(async ({ ctx, input }) => {
			const admin = await updateAdmin(ctx.user.authId, {
				host: input.host,
				letsEncryptEmail: input.letsEncryptEmail,
				certificateType: input.certificateType,
			});

			if (!admin) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Admin not found",
				});
			}

			updateServerTraefik(admin, input.host);
			updateLetsEncryptEmail(admin.letsEncryptEmail);
			return admin;
		}),
	cleanSSHPrivateKey: adminProcedure.mutation(async ({ ctx }) => {
		await updateAdmin(ctx.user.authId, {
			sshPrivateKey: null,
		});
		return true;
	}),
	updateDockerCleanup: adminProcedure
		.input(apiUpdateDockerCleanup)
		.mutation(async ({ input, ctx }) => {
			await updateAdmin(ctx.user.authId, {
				enableDockerCleanup: input.enableDockerCleanup,
			});

			const admin = await findAdmin();

			if (admin.enableDockerCleanup) {
				scheduleJob("docker-cleanup", "0 0 * * *", async () => {
					console.log(
						`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
					);
					await cleanUpUnusedImages();
					await cleanUpDockerBuilder();
					await cleanUpSystemPrune();
				});
			} else {
				const currentJob = scheduledJobs["docker-cleanup"];
				currentJob?.cancel();
			}

			return true;
		}),

	readTraefikConfig: adminProcedure.query(() => {
		const traefikConfig = readMainConfig();
		return traefikConfig;
	}),

	updateTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			writeMainConfig(input.traefikConfig);
			return true;
		}),

	readWebServerTraefikConfig: adminProcedure.query(() => {
		const traefikConfig = readConfig("dokploy");
		return traefikConfig;
	}),
	updateWebServerTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			writeConfig("dokploy", input.traefikConfig);
			return true;
		}),

	readMiddlewareTraefikConfig: adminProcedure.query(() => {
		const traefikConfig = readConfig("middlewares");
		return traefikConfig;
	}),

	updateMiddlewareTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			writeConfig("middlewares", input.traefikConfig);
			return true;
		}),

	checkAndUpdateImage: adminProcedure.mutation(async () => {
		return await pullLatestRelease();
	}),
	updateServer: adminProcedure.mutation(async () => {
		await spawnAsync("docker", [
			"service",
			"update",
			"--force",
			"--image",
			getDokployImage(),
			"dokploy",
		]);
		return true;
	}),

	getDokployVersion: adminProcedure.query(() => {
		return getDokployVersion();
	}),
	readDirectories: protectedProcedure.query(async ({ ctx }) => {
		if (ctx.user.rol === "user") {
			const canAccess = await canAccessToTraefikFiles(ctx.user.authId);

			if (!canAccess) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
		}
		const result = readDirectory(MAIN_TRAEFIK_PATH);
		return result || [];
	}),

	updateTraefikFile: protectedProcedure
		.input(apiModifyTraefikConfig)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				const canAccess = await canAccessToTraefikFiles(ctx.user.authId);

				if (!canAccess) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			writeTraefikConfigInPath(input.path, input.traefikConfig);
			return true;
		}),

	readTraefikFile: protectedProcedure
		.input(apiReadTraefikConfig)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				const canAccess = await canAccessToTraefikFiles(ctx.user.authId);

				if (!canAccess) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return readConfigInPath(input.path);
		}),

	getOpenApiDocument: protectedProcedure.query((): unknown => {
		doc.components = {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
		};
		doc.info = {
			title: "Dokploy API",
			description: "Endpoints for dokploy",
			version: getDokployVersion(),
		};
		return doc;
	}),
});
