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
import { createSshKey } from "@dokploy/server/services/ssh-key";
import { generateSSHKey } from "@dokploy/server/utils/filesystem/ssh";
import {
	DOKPLOY_PLANS,
	createUpCloudServer,
	deleteUpCloudServer,
	getPublicIPv4,
	getUpCloudServer,
	getUpCloudZones,
	stopUpCloudServer,
} from "@dokploy/server/utils/upcloud";
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
		return DOKPLOY_PLANS;
	}),

	getDataCenters: adminProcedure.query(async () => {
		if (!IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Managed servers are only available in Dokploy Cloud",
			});
		}
		return getUpCloudZones();
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

			const plan = DOKPLOY_PLANS.find((p) => p.id === input.plan);
			if (!plan) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan" });
			}

			const hostname =
				`dokploy-${ctx.session.activeOrganizationId.slice(0, 8)}-${nanoid(6)}`.toLowerCase();

			const managedRecord = await createManagedServer({
				organizationId: ctx.session.activeOrganizationId,
				plan: input.plan,
				zone: input.zone,
				status: "provisioning",
			});

			provisionManagedServer(
				managedRecord.managedServerId,
				plan.upcloudPlan,
				input.zone,
				hostname,
				ctx.session.activeOrganizationId,
			).catch(async (err) => {
				const responseBody = err?.response?.data;
				const detail =
					responseBody?.message ??
					responseBody?.error ??
					(typeof responseBody === "string" ? responseBody : null);
				const errorMessage = detail
					? `${err?.message}: ${typeof detail === "object" ? JSON.stringify(detail) : detail}`
					: (err?.message ?? "Unknown error during provisioning");
				console.error("[managed-server] provisioning failed:", errorMessage, responseBody);
				await updateManagedServer(managedRecord.managedServerId, {
					status: "error",
					errorMessage,
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

			const upcloudUuid = record.providerVmId;
			terminateManagedServer(input.managedServerId, upcloudUuid ?? null).catch(
				(err) => console.error("[managed-server] termination failed:", err),
			);

			return { ok: true };
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
					message: "No SSH key found for this managed server",
				});
			}

			const name = record.hostname ?? record.managedServerId;

			const serverRecord = await createServer(
				{
					name: `Managed • ${name}`,
					description: "Managed server provisioned by Dokploy Cloud",
					ipAddress: record.ipAddress,
					port: 22,
					username: "root",
					serverType: "deploy",
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

			const upcloudUuid = record.providerVmId;
			if (!upcloudUuid) return record;

			const vm = await getUpCloudServer(upcloudUuid);
			const ipAddress = getPublicIPv4(vm) ?? record.ipAddress ?? undefined;

			await updateManagedServer(input.managedServerId, {
				ipAddress,
				hostname: vm.hostname ?? undefined,
				status:
					vm.state === "started"
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
	upcloudPlan: string,
	zone: string,
	hostname: string,
	organizationId: string,
) {
	const { publicKey, privateKey } = await generateSSHKey("rsa");

	const vm = await createUpCloudServer({
		hostname,
		upcloudPlan,
		zone,
		sshKey: publicKey,
	});

	await updateManagedServer(managedServerId, {
		providerVmId: vm.uuid,
		hostname: vm.hostname,
		status: "configuring",
	});

	await waitForServerStarted(vm.uuid, managedServerId);

	const finalVm = await getUpCloudServer(vm.uuid);
	const finalIp = getPublicIPv4(finalVm);

	if (!finalIp) {
		throw new Error("VM is started but has no public IPv4 address");
	}

	const sshKey = await createSshKey({
		name: hostname,
		publicKey,
		privateKey,
		organizationId,
	});

	if (!sshKey) throw new Error("Failed to create SSH key");

	const serverRecord = await createServer(
		{
			name: `Managed • ${hostname}`,
			description: "Managed server provisioned by Dokploy Cloud",
			ipAddress: finalIp,
			port: 22,
			username: "root",
			serverType: "deploy",
			sshKeyId: sshKey.sshKeyId,
		},
		organizationId,
	);

	await updateManagedServer(managedServerId, {
		serverId: serverRecord.serverId,
		sshKeyId: sshKey.sshKeyId,
		ipAddress: finalIp,
	});

	await serverSetup(serverRecord.serverId);
	await updateManagedServer(managedServerId, { status: "ready" });
}

async function waitForServerStarted(
	uuid: string,
	_managedServerId: string,
	maxAttempts = 30,
	intervalMs = 10_000,
) {
	for (let i = 0; i < maxAttempts; i++) {
		await new Promise((r) => setTimeout(r, intervalMs));
		const vm = await getUpCloudServer(uuid);
		if (vm.state === "started") return;
		if (vm.state === "error") throw new Error("VM entered error state");
	}
	throw new Error("Timed out waiting for VM to start");
}

async function waitForServerStopped(
	uuid: string,
	maxAttempts = 18,
	intervalMs = 10_000,
) {
	for (let i = 0; i < maxAttempts; i++) {
		await new Promise((r) => setTimeout(r, intervalMs));
		const vm = await getUpCloudServer(uuid);
		if (vm.state === "stopped") return;
	}
}

async function terminateManagedServer(
	managedServerId: string,
	upcloudUuid: string | null,
) {
	if (upcloudUuid) {
		await stopUpCloudServer(upcloudUuid);
		await waitForServerStopped(upcloudUuid);
		await deleteUpCloudServer(upcloudUuid);
	}
	await deleteManagedServer(managedServerId);
}
