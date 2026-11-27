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
	assertCloudServerCapacity,
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
import { z } from "zod";
import {
	cancelCloudServerSubscription,
	createCloudServerCheckout,
	getCloudServerCreditCents,
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

	creditBalance: adminProcedure.query(async ({ ctx }) => {
		if (!IS_CLOUD) return 0;
		return getCloudServerCreditCents(ctx.user.ownerId);
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

			await assertCloudServerCapacity();

			const session = await createCloudServerCheckout({
				ownerId: ctx.user.ownerId,
				organizationId: ctx.session.activeOrganizationId,
				plan,
				zone: input.zone,
				regionName: region.description,
			});
			if (!session.url) throw new Error("Stripe did not return a URL");
			return { url: session.url };
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

			// The setup or upgrade in flight would recreate the droplet this removes and leave it running unpaid.
			if (!["ready", "suspended", "error"].includes(record.status)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Wait until the server finishes what it is doing",
				});
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
					await cancelCloudServerSubscription(record.stripeSubscriptionId, {
						creditUnusedTime: true,
					});
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
			// A suspended server must stay disconnected until it is paid.
			if (record.status !== "ready") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Server is not ready",
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
