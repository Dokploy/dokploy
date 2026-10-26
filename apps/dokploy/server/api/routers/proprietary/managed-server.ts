import { createServer, haveActiveServices, IS_CLOUD } from "@dokploy/server";
import {
	apiCreateManagedServer,
	apiDeleteManagedServer,
	apiFindManagedServerAction,
	apiFindOneManagedServer,
	apiManagedServerPowerAction,
	apiUpdateManagedServerFirewall,
	apiUpgradeManagedServer,
} from "@dokploy/server/db/schema/managed-server";
import {
	createManagedServer,
	deletePendingManagedServer,
	disableManagedServerFirewall,
	findManagedServerById,
	findManagedServersByOrg,
	getManagedServerFirewall,
	getManagedServerPowerAction,
	getManagedServerVmInfo,
	runManagedServerPowerAction,
	terminateManagedServer,
	updateManagedServer,
	updateManagedServerFirewall,
} from "@dokploy/server/services/managed-server";
import {
	DOKPLOY_PLANS,
	getDigitalOceanRegions,
	getRegionInfo,
} from "@dokploy/server/utils/digitalocean";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	cancelManagedServerSubscription,
	createManagedServerCheckout,
	expireManagedServerCheckout,
	getUpgradeOptions,
	previewManagedServerUpgrade,
	upgradeManagedServer,
} from "@/server/utils/managed-server-billing";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const managedServerRouter = createTRPCRouter({
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
		const servers = await findManagedServersByOrg(
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
		.input(apiFindOneManagedServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return record;
		}),

	purchase: adminProcedure
		.input(apiCreateManagedServer)
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

			const managedRecord = await createManagedServer({
				organizationId: ctx.session.activeOrganizationId,
				plan: input.plan,
				zone: input.zone,
				hostname,
				status: "pending",
			});

			try {
				const session = await createManagedServerCheckout({
					ownerId: ctx.user.ownerId,
					managedServerId: managedRecord.managedServerId,
					plan,
					regionName: region.description,
				});
				await updateManagedServer(managedRecord.managedServerId, {
					stripeCheckoutSessionId: session.id,
				});
				if (!session.url) throw new Error("Stripe did not return a URL");
				return { url: session.url };
			} catch (err) {
				await deletePendingManagedServer(managedRecord.managedServerId);
				throw err;
			}
		}),

	delete: adminProcedure
		.input(apiDeleteManagedServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}

			if (record.status === "pending") {
				if (record.stripeCheckoutSessionId) {
					await expireManagedServerCheckout(record.stripeCheckoutSessionId);
				}
				await deletePendingManagedServer(input.managedServerId);
				return { cancelledOrder: true };
			}

			if (record.serverId && (await haveActiveServices(record.serverId))) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This server has active services. Delete them or move them to another server first.",
				});
			}

			await updateManagedServer(input.managedServerId, {
				status: "terminating",
			});

			if (record.stripeSubscriptionId) {
				try {
					await cancelManagedServerSubscription(record.stripeSubscriptionId);
				} catch (err) {
					await updateManagedServer(input.managedServerId, {
						status: record.status,
					});
					throw err;
				}
			}

			terminateManagedServer(input.managedServerId, {
				removeLinkedServer: true,
			}).catch(async (err) => {
				console.error("[managed-server] termination failed:", err);
				await updateManagedServer(input.managedServerId, {
					status: "error",
					errorMessage: `Termination failed: ${err?.message ?? "Unknown error"}`,
				});
			});

			return { cancelledOrder: false };
		}),

	reconnect: adminProcedure
		.input(apiFindOneManagedServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
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

			const name = record.hostname ?? record.managedServerId;

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

			await updateManagedServer(input.managedServerId, {
				serverId: serverRecord.serverId,
				status: "ready",
			});

			return findManagedServerById(input.managedServerId);
		}),

	vmInfo: adminProcedure
		.input(apiFindOneManagedServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getManagedServerVmInfo(record);
		}),

	powerAction: adminProcedure
		.input(apiManagedServerPowerAction)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return runManagedServerPowerAction(record, input.action);
		}),

	powerActionStatus: adminProcedure
		.input(apiFindManagedServerAction)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getManagedServerPowerAction(record, input.actionId);
		}),

	upgradeOptions: adminProcedure
		.input(apiFindOneManagedServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getUpgradeOptions(record);
		}),

	upgradePreview: adminProcedure
		.input(apiUpgradeManagedServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return previewManagedServerUpgrade(record, input.plan);
		}),

	upgrade: adminProcedure
		.input(apiUpgradeManagedServer.extend({ prorationDate: z.number().int() }))
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			await upgradeManagedServer(record, input.plan, input.prorationDate);
			return { ok: true };
		}),

	firewall: adminProcedure
		.input(apiFindOneManagedServer)
		.query(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return getManagedServerFirewall(record);
		}),

	updateFirewall: adminProcedure
		.input(apiUpdateManagedServerFirewall)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return updateManagedServerFirewall(record, input.rules);
		}),

	disableFirewall: adminProcedure
		.input(apiFindOneManagedServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return disableManagedServerFirewall(record);
		}),
});
