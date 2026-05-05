import {
	createServer,
	IS_CLOUD,
	serverSetup,
} from "@dokploy/server";
import {
	apiCreateManagedServer,
	apiDeleteManagedServer,
	apiFindOneManagedServer,
} from "@dokploy/server/db/schema/managed-server";
import {
	createManagedServer,
	deleteManagedServer,
	findManagedServerById,
	findManagedServersByOrg,
	updateManagedServer,
} from "@dokploy/server/services/managed-server";
import {
	getHostingerDataCenters,
	getHostingerVm,
	getManagedServerPlans,
	purchaseHostingerVps,
	stopHostingerVm,
	UBUNTU_22_TEMPLATE_ID,
} from "@dokploy/server/utils/hostinger";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const managedServerRouter = createTRPCRouter({
	getPlans: adminProcedure.query(async () => {
		if (!IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Managed servers are only available in Dokploy Cloud",
			});
		}
		return getManagedServerPlans();
	}),

	getDataCenters: adminProcedure.query(async () => {
		if (!IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Managed servers are only available in Dokploy Cloud",
			});
		}
		return getHostingerDataCenters();
	}),

	list: adminProcedure.query(async ({ ctx }) => {
		if (!IS_CLOUD) return [];
		return findManagedServersByOrg(ctx.session.activeOrganizationId);
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
					message: "Managed servers are only available in Dokploy Cloud",
				});
			}

			const plans = await getManagedServerPlans();
			const plan = plans.find((p) => p.id === input.plan);
			if (!plan) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan" });
			}

			const hostname =
				`dokploy-${ctx.session.activeOrganizationId.slice(0, 8)}-${nanoid(6)}`.toLowerCase();

			const managedRecord = await createManagedServer({
				organizationId: ctx.session.activeOrganizationId,
				plan: input.plan,
				dataCenterId: input.dataCenterId,
				status: "provisioning",
			});

			const hostingerItemId = input.isAnnual
				? plan.hostingerItemIdAnnual
				: plan.hostingerItemIdMonthly;

			provisionManagedServer(
				managedRecord.managedServerId,
				hostingerItemId,
				input.dataCenterId,
				hostname,
				ctx.session.activeOrganizationId,
			).catch(async (err) => {
				await updateManagedServer(managedRecord.managedServerId, {
					status: "error",
					errorMessage: err?.message ?? "Unknown error during provisioning",
				});
			});

			return managedRecord;
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

			await updateManagedServer(input.managedServerId, {
				status: "terminating",
			});

			if (record.hostingerVmId) {
				try {
					await stopHostingerVm(record.hostingerVmId);
				} catch (_) {
					// Best-effort
				}
			}

			await deleteManagedServer(input.managedServerId);
			return { ok: true };
		}),

	syncStatus: adminProcedure
		.input(apiFindOneManagedServer)
		.mutation(async ({ input, ctx }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud only" });
			}
			const record = await findManagedServerById(input.managedServerId);
			if (record.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			if (!record.hostingerVmId) return record;

			const vm = await getHostingerVm(record.hostingerVmId);
			const ipAddress = vm.ipv4?.[0]?.address ?? record.ipAddress;

			await updateManagedServer(input.managedServerId, {
				ipAddress: ipAddress ?? undefined,
				hostname: vm.hostname ?? undefined,
				status:
					vm.state === "running"
						? record.serverId
							? "ready"
							: "configuring"
						: record.status,
			});

			return findManagedServerById(input.managedServerId);
		}),
});

async function provisionManagedServer(
	managedServerId: string,
	hostingerItemId: string,
	dataCenterId: number,
	hostname: string,
	organizationId: string,
) {
	const result = await purchaseHostingerVps({
		item_id: hostingerItemId,
		payment_method_id: 0,
		setup: {
			template_id: UBUNTU_22_TEMPLATE_ID,
			data_center_id: dataCenterId,
			hostname,
			enable_backups: false,
		},
		coupons: [],
	});

	const vm = result.virtual_machine;

	await updateManagedServer(managedServerId, {
		hostingerVmId: vm.id,
		hostingerSubscriptionId: vm.subscription_id ?? undefined,
		ipAddress: vm.ipv4?.[0]?.address ?? undefined,
		hostname: vm.hostname ?? undefined,
		status: "configuring",
	});

	await waitForVmRunning(vm.id!, managedServerId);

	const finalVm = await getHostingerVm(vm.id!);
	const finalIp = finalVm.ipv4?.[0]?.address;

	if (!finalIp) {
		throw new Error("VM is running but has no IPv4 address");
	}

	const serverRecord = await createServer(
		{
			name: `Managed • ${hostname}`,
			description: "Managed server provisioned by Dokploy Cloud",
			ipAddress: finalIp,
			port: 22,
			username: "root",
			serverType: "deploy",
		},
		organizationId,
	);

	await updateManagedServer(managedServerId, {
		serverId: serverRecord.serverId,
		ipAddress: finalIp,
	});

	await serverSetup(serverRecord.serverId);

	await updateManagedServer(managedServerId, { status: "ready" });
}

async function waitForVmRunning(
	vmId: number,
	_managedServerId: string,
	maxAttempts = 30,
	intervalMs = 10_000,
) {
	for (let i = 0; i < maxAttempts; i++) {
		await new Promise((r) => setTimeout(r, intervalMs));
		const vm = await getHostingerVm(vmId);
		if (vm.state === "running") return;
		if (vm.state === "error") {
			throw new Error("VM entered error state");
		}
	}
	throw new Error("Timed out waiting for VM to become running");
}
