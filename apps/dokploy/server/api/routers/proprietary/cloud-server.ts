import { createServer, haveActiveServices, IS_CLOUD } from "@dokploy/server";
import {
	apiCloudServerPowerAction,
	apiCreateCloudServer,
	apiDeleteCloudServer,
	apiFindCloudServerAction,
	apiFindOneCloudServer,
	apiUpdateCloudServerFirewall,
	apiUpgradeCloudServer,
} from "@dokploy/server/db/schema/cloud-server";
import {
	createCloudServer,
	deletePendingCloudServer,
	disableCloudServerFirewall,
	findCloudServerById,
	findCloudServersByOrg,
	getCloudServerFirewall,
	getCloudServerPowerAction,
	getCloudServerVmInfo,
	runCloudServerPowerAction,
	terminateCloudServer,
	updateCloudServer,
	updateCloudServerFirewall,
} from "@dokploy/server/services/cloud-server";
import {
	DOKPLOY_PLANS,
	getDigitalOceanRegions,
	getRegionInfo,
} from "@dokploy/server/utils/digitalocean";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	cancelCloudServerSubscription,
	createCloudServerCheckout,
	expireCloudServerCheckout,
	getUpgradeOptions,
	previewCloudServerUpgrade,
	upgradeCloudServer,
} from "@/server/utils/cloud-server-billing";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const cloudServerRouter = createTRPCRouter({
	getPlans: adminProcedure.query(async () => {
		if (!IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Cloud servers are only available in Dokploy Cloud",
			});
		}
		return DOKPLOY_PLANS;
	}),

	getDataCenters: adminProcedure.query(async () => {
		if (!IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Cloud servers are only available in Dokploy Cloud",
			});
		}
		return getDigitalOceanRegions();
	}),

	list: adminProcedure.query(async ({ ctx }) => {
		if (!IS_CLOUD) return [];
		const servers = await findCloudServersByOrg(
			ctx.session.activeOrganizationId,
		);
		return servers.map((s) => {
			const region = getRegionInfo(s.zone);
			return {
				...s,
				countryCode: region?.countryCode ?? null,
				regionName: region?.name ?? s.zone,
			};
		});
	}),

	one: adminProcedure
		.input(apiFindOneCloudServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return record;
		}),

	purchase: adminProcedure
		.input(apiCreateCloudServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cloud servers are only available in Dokploy Cloud",
				});
			}

			const plan = DOKPLOY_PLANS.find((p) => p.id === input.plan);
			if (!plan) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan" });
			}

			const regions = await getDigitalOceanRegions();
			const region = regions.find((r) => r.id === input.zone);
			if (!region?.plans.includes(plan.id)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This plan is not available in the selected location",
				});
			}

			const hostname =
				`dokploy-${ctx.session.activeOrganizationId.slice(0, 8)}-${nanoid(6)}`
					.toLowerCase()
					.replace(/[^a-z0-9-]/g, "x");

			const managedRecord = await createCloudServer({
				organizationId: ctx.session.activeOrganizationId,
				plan: input.plan,
				zone: input.zone,
				hostname,
				status: "pending",
			});

			try {
				const session = await createCloudServerCheckout({
					ownerId: ctx.user.ownerId,
					cloudServerId: managedRecord.cloudServerId,
					plan,
					regionName: region.description,
				});
				await updateCloudServer(managedRecord.cloudServerId, {
					stripeCheckoutSessionId: session.id,
				});
				if (!session.url) throw new Error("Stripe did not return a URL");
				return { url: session.url };
			} catch (err) {
				await deletePendingCloudServer(managedRecord.cloudServerId);
				throw err;
			}
		}),

	delete: adminProcedure
		.input(apiDeleteCloudServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}

			if (record.status === "pending") {
				if (record.stripeCheckoutSessionId) {
					await expireCloudServerCheckout(record.stripeCheckoutSessionId);
				}
				await deletePendingCloudServer(input.cloudServerId);
				return { cancelledOrder: true };
			}

			if (record.serverId && (await haveActiveServices(record.serverId))) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This server has active services. Delete them or move them to another server first.",
				});
			}

			await updateCloudServer(input.cloudServerId, {
				status: "terminating",
			});

			if (record.stripeSubscriptionId) {
				try {
					await cancelCloudServerSubscription(record.stripeSubscriptionId);
				} catch (err) {
					await updateCloudServer(input.cloudServerId, {
						status: record.status,
					});
					throw err;
				}
			}

			terminateCloudServer(input.cloudServerId, {
				removeLinkedServer: true,
			}).catch(async (err) => {
				console.error("[cloud-server] termination failed:", err);
				await updateCloudServer(input.cloudServerId, {
					status: "error",
					errorMessage: `Termination failed: ${err?.message ?? "Unknown error"}`,
				});
			});

			return { cancelledOrder: false };
		}),

	reconnect: adminProcedure
		.input(apiFindOneCloudServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			if (record.serverId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Server is already linked",
				});
			}
			if (!record.ipAddress) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No IP address available to reconnect",
				});
			}

			if (!record.sshKeyId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No SSH key found for this cloud server",
				});
			}

			const name = record.hostname ?? record.cloudServerId;

			const serverRecord = await createServer(
				{
					name: `Cloud • ${name}`,
					description: "Cloud server provisioned by Dokploy Cloud",
					ipAddress: record.ipAddress,
					port: 22,
					username: "root",
					serverType: "deploy",
					enableDockerCleanup: true,
					sshKeyId: record.sshKeyId,
				},
				ctx.session.activeOrganizationId,
			);

			await updateCloudServer(input.cloudServerId, {
				serverId: serverRecord.serverId,
				status: "ready",
			});

			return findCloudServerById(input.cloudServerId);
		}),

	vmInfo: adminProcedure
		.input(apiFindOneCloudServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getCloudServerVmInfo(record);
		}),

	powerAction: adminProcedure
		.input(apiCloudServerPowerAction)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return runCloudServerPowerAction(record, input.action);
		}),

	powerActionStatus: adminProcedure
		.input(apiFindCloudServerAction)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getCloudServerPowerAction(record, input.actionId);
		}),

	upgradeOptions: adminProcedure
		.input(apiFindOneCloudServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getUpgradeOptions(record);
		}),

	upgradePreview: adminProcedure
		.input(apiUpgradeCloudServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return previewCloudServerUpgrade(record, input.plan);
		}),

	upgrade: adminProcedure
		.input(apiUpgradeCloudServer.extend({ prorationDate: z.number().int() }))
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			await upgradeCloudServer(record, input.plan, input.prorationDate);
			return { ok: true };
		}),

	firewall: adminProcedure
		.input(apiFindOneCloudServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getCloudServerFirewall(record);
		}),

	updateFirewall: adminProcedure
		.input(apiUpdateCloudServerFirewall)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return updateCloudServerFirewall(record, input.rules);
		}),

	disableFirewall: adminProcedure
		.input(apiFindOneCloudServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findCloudServerById(input.cloudServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return disableCloudServerFirewall(record);
		}),
});
