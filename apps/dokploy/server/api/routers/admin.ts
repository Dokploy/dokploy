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
});
