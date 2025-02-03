import { db } from "@/server/db";
import {
	apiAssignPermissions,
	apiCreateUserInvitation,
	apiFindOneToken,
	apiRemoveUser,
	apiUpdateAdmin,
	apiUpdateWebServerMonitoring,
	users,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createInvitation,
	findAdminById,
	findUserByAuthId,
	findUserById,
	getUserByToken,
	removeUserByAuthId,
	setupWebMonitoring,
	updateAdmin,
	updateAdminById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../trpc";

export const adminRouter = createTRPCRouter({
	one: adminProcedure.query(async ({ ctx }) => {
		const { sshPrivateKey, ...rest } = await findAdminById(ctx.user.adminId);
		return {
			haveSSH: !!sshPrivateKey,
			...rest,
		};
	}),
	update: adminProcedure
		.input(apiUpdateAdmin)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this admin",
				});
			}
			const { authId } = await findAdminById(ctx.user.adminId);
			// @ts-ignore
			return updateAdmin(authId, input);
		}),
	createUserInvitation: adminProcedure
		.input(apiCreateUserInvitation)
		.mutation(async ({ input, ctx }) => {
			try {
				await createInvitation(input, ctx.user.adminId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Error creating this user\ncheck if the email is not registered",
					cause: error,
				});
			}
		}),
	removeUser: adminProcedure
		.input(apiRemoveUser)
		.mutation(async ({ input, ctx }) => {
			try {
				const user = await findUserByAuthId(input.authId);

				if (user.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this user",
					});
				}
				return await removeUserByAuthId(input.authId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting this user",
					cause: error,
				});
			}
		}),
	getUserByToken: publicProcedure
		.input(apiFindOneToken)
		.query(async ({ input }) => {
			return await getUserByToken(input.token);
		}),
	assignPermissions: adminProcedure
		.input(apiAssignPermissions)
		.mutation(async ({ input, ctx }) => {
			try {
				const user = await findUserById(input.userId);

				if (user.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to assign permissions",
					});
				}
				await db
					.update(users)
					.set({
						...input,
					})
					.where(eq(users.userId, input.userId));
			} catch (error) {
				throw error;
			}
		}),

	setupMonitoring: adminProcedure
		.input(apiUpdateWebServerMonitoring)
		.mutation(async ({ input, ctx }) => {
			try {
				if (IS_CLOUD) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Feature disabled on cloud",
					});
				}
				const admin = await findAdminById(ctx.user.adminId);
				if (admin.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to setup this server",
					});
				}

				await updateAdminById(admin.adminId, {
					metricsConfig: {
						server: {
							type: "Dokploy",
							refreshRate: input.metricsConfig.server.refreshRate,
							port: input.metricsConfig.server.port,
							token: input.metricsConfig.server.token,
							cronJob: input.metricsConfig.server.cronJob,
							urlCallback: input.metricsConfig.server.urlCallback,
							retentionDays: input.metricsConfig.server.retentionDays,
							thresholds: {
								cpu: input.metricsConfig.server.thresholds.cpu,
								memory: input.metricsConfig.server.thresholds.memory,
							},
						},
						containers: {
							refreshRate: input.metricsConfig.containers.refreshRate,
							services: {
								include: input.metricsConfig.containers.services.include || [],
								exclude: input.metricsConfig.containers.services.exclude || [],
							},
						},
					},
				});
				const currentServer = await setupWebMonitoring(admin.adminId);
				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	getMetricsToken: protectedProcedure.query(async ({ ctx }) => {
		const admin = await findAdminById(ctx.user.adminId);
		return {
			serverIp: admin.serverIp,
			enabledFeatures: admin.enablePaidFeatures,
			metricsConfig: admin?.metricsConfig,
		};
	}),

	getServerMetrics: protectedProcedure
		.input(
			z.object({
				url: z.string(),
				token: z.string(),
				dataPoints: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const url = new URL(input.url);
				url.searchParams.append("limit", input.dataPoints);
				const response = await fetch(url.toString(), {
					headers: {
						Authorization: `Bearer ${input.token}`,
					},
				});
				if (!response.ok) {
					throw new Error(
						`Error ${response.status}: ${response.statusText}. Ensure the container is running and this service is included in the monitoring configuration.`,
					);
				}

				const data = await response.json();
				if (!Array.isArray(data) || data.length === 0) {
					throw new Error(
						[
							"No monitoring data available. This could be because:",
							"",
							"1. You don't have setup the monitoring service, you can do in web server section.",
							"2. If you already have setup the monitoring service, wait a few minutes and refresh the page.",
						].join("\n"),
					);
				}
				return data as {
					cpu: string;
					cpuModel: string;
					cpuCores: number;
					cpuPhysicalCores: number;
					cpuSpeed: number;
					os: string;
					distro: string;
					kernel: string;
					arch: string;
					memUsed: string;
					memUsedGB: string;
					memTotal: string;
					uptime: number;
					diskUsed: string;
					totalDisk: string;
					networkIn: string;
					networkOut: string;
					timestamp: string;
				}[];
			} catch (error) {
				throw error;
			}
		}),
	getContainerMetrics: protectedProcedure
		.input(
			z.object({
				url: z.string(),
				token: z.string(),
				appName: z.string(),
				dataPoints: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				if (!input.appName) {
					throw new Error(
						[
							"No Application Selected:",
							"",
							"Make Sure to select an application to monitor.",
						].join("\n"),
					);
				}
				const url = new URL(`${input.url}/metrics/containers`);
				url.searchParams.append("limit", input.dataPoints);
				url.searchParams.append("appName", input.appName);
				const response = await fetch(url.toString(), {
					headers: {
						Authorization: `Bearer ${input.token}`,
					},
				});
				if (!response.ok) {
					throw new Error(
						`Error ${response.status}: ${response.statusText}. Please verify that the application "${input.appName}" is running and this service is included in the monitoring configuration.`,
					);
				}

				const data = await response.json();
				if (!Array.isArray(data) || data.length === 0) {
					throw new Error(
						[
							`No monitoring data available for "${input.appName}". This could be because:`,
							"",
							"1. The container was recently started - wait a few minutes for data to be collected",
							"2. The container is not running - verify its status",
							"3. The service is not included in your monitoring configuration",
						].join("\n"),
					);
				}
				return data as {
					containerId: string;
					containerName: string;
					containerImage: string;
					containerLabels: string;
					containerCommand: string;
					containerCreated: string;
				}[];
			} catch (error) {
				throw error;
			}
		}),
});
