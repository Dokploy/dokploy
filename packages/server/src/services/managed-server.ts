import { db } from "@dokploy/server/db";
import { server } from "@dokploy/server/db/schema";
import {
	type FirewallRule,
	managedServer,
} from "@dokploy/server/db/schema/managed-server";
import { removeDeploymentsByServerId } from "@dokploy/server/services/deployment";
import {
	createServer,
	deleteServer,
	findServerById,
} from "@dokploy/server/services/server";
import {
	createSshKey,
	findSSHKeyById,
	removeSSHKeyById,
} from "@dokploy/server/services/ssh-key";
import { serverSetup } from "@dokploy/server/setup/server-setup";
import {
	createDigitalOceanDroplet,
	createDigitalOceanFirewall,
	createDigitalOceanSshKey,
	createDigitalOceanVpc,
	type DigitalOceanInboundRule,
	type DropletPowerAction,
	deleteDigitalOceanDroplet,
	deleteDigitalOceanDropletsByTag,
	deleteDigitalOceanFirewall,
	deleteDigitalOceanSshKey,
	deleteDigitalOceanVpc,
	ensureDigitalOceanDefaultVpc,
	getDigitalOceanDroplet,
	getDigitalOceanDropletAction,
	getDigitalOceanFirewall,
	getManagedServerTag,
	getPrivateIPv4,
	getPublicIPv4,
	resizeDigitalOceanDroplet,
	runDigitalOceanDropletAction,
	updateDigitalOceanFirewall,
} from "@dokploy/server/utils/digitalocean";
import { generateSSHKey } from "@dokploy/server/utils/filesystem/ssh";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, lt, ne, notInArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { Client } from "ssh2";

export type ManagedServer = typeof managedServer.$inferSelect;

export const createManagedServer = async (
	input: typeof managedServer.$inferInsert,
) => {
	const record = await db
		.insert(managedServer)
		.values(input)
		.returning()
		.then((r) => r[0]);
	if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return record;
};

export const findManagedServerById = async (managedServerId: string) => {
	const record = await db.query.managedServer.findFirst({
		where: eq(managedServer.managedServerId, managedServerId),
		with: { server: true },
	});
	if (!record)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Cloud server not found",
		});
	return record;
};

export const findManagedServersByOrg = async (organizationId: string) => {
	return db.query.managedServer.findMany({
		where: eq(managedServer.organizationId, organizationId),
		with: { server: true },
		orderBy: (t, { desc }) => [desc(t.createdAt)],
	});
};

export const updateManagedServer = async (
	managedServerId: string,
	data: Partial<typeof managedServer.$inferInsert>,
) => {
	return db
		.update(managedServer)
		.set({ ...data, updatedAt: new Date().toISOString() })
		.where(eq(managedServer.managedServerId, managedServerId))
		.returning()
		.then((r) => r[0]);
};

export const deleteManagedServer = async (managedServerId: string) => {
	return db
		.delete(managedServer)
		.where(eq(managedServer.managedServerId, managedServerId));
};

// Managed servers are billed on their own subscription, so they never count against the plan's server quota.
export const isNotManagedServer = () =>
	notInArray(
		server.serverId,
		db
			.select({ serverId: managedServer.serverId })
			.from(managedServer)
			.where(isNotNull(managedServer.serverId)),
	);

export const hasActiveManagedServers = async (organizationId: string) => {
	const record = await db.query.managedServer.findFirst({
		where: and(
			eq(managedServer.organizationId, organizationId),
			eq(managedServer.status, "ready"),
		),
	});
	return !!record;
};

export const findManagedServerByServerId = async (serverId: string) => {
	return db.query.managedServer.findFirst({
		where: eq(managedServer.serverId, serverId),
	});
};

export const findCloudServerIds = async (organizationId: string) => {
	const rows = await db
		.select({ serverId: managedServer.serverId })
		.from(managedServer)
		.where(
			and(
				eq(managedServer.organizationId, organizationId),
				isNotNull(managedServer.serverId),
			),
		);
	return new Set(rows.map((r) => r.serverId));
};

export const findManagedServerBySubscriptionId = async (
	stripeSubscriptionId: string,
) => {
	return db.query.managedServer.findFirst({
		where: eq(managedServer.stripeSubscriptionId, stripeSubscriptionId),
	});
};

// Stripe can deliver the same webhook more than once; only the call that flips "pending" gets to provision.
export const claimManagedServerForProvisioning = async (
	managedServerId: string,
	stripeSubscriptionId: string,
) => {
	return db
		.update(managedServer)
		.set({
			status: "provisioning",
			stripeSubscriptionId,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(managedServer.managedServerId, managedServerId),
				eq(managedServer.status, "pending"),
			),
		)
		.returning()
		.then((r) => r[0]);
};

export const claimManagedServerForUpgrade = async (managedServerId: string) => {
	return db
		.update(managedServer)
		.set({
			status: "upgrading",
			errorMessage: null,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(managedServer.managedServerId, managedServerId),
				eq(managedServer.status, "ready"),
			),
		)
		.returning()
		.then((r) => r[0]);
};

export const deletePendingManagedServer = async (managedServerId: string) => {
	return db
		.delete(managedServer)
		.where(
			and(
				eq(managedServer.managedServerId, managedServerId),
				eq(managedServer.status, "pending"),
			),
		);
};

export const findSuspendedManagedServersBefore = async (cutoff: Date) => {
	return db.query.managedServer.findMany({
		where: and(
			eq(managedServer.status, "suspended"),
			lt(managedServer.suspendedAt, cutoff.toISOString()),
		),
	});
};

export const findOrgNetworkInZone = async (
	organizationId: string,
	zone: string,
) => {
	const record = await db.query.managedServer.findFirst({
		where: and(
			eq(managedServer.organizationId, organizationId),
			eq(managedServer.zone, zone),
			isNotNull(managedServer.providerNetworkId),
		),
	});
	return record?.providerNetworkId ?? null;
};

export const isNetworkUsedByOthers = async (
	providerNetworkId: string,
	managedServerId: string,
) => {
	const record = await db.query.managedServer.findFirst({
		where: and(
			eq(managedServer.providerNetworkId, providerNetworkId),
			ne(managedServer.managedServerId, managedServerId),
		),
	});
	return !!record;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const getOrCreateOrgNetwork = async (organizationId: string, zone: string) => {
	const existing = await findOrgNetworkInZone(organizationId, zone);
	if (existing) return existing;
	await ensureDigitalOceanDefaultVpc(zone);
	const safeOrgId = organizationId.toLowerCase().replace(/[^a-z0-9-]/g, "");
	return createDigitalOceanVpc({
		name: `dokploy-${safeOrgId.slice(0, 20)}-${zone}-${nanoid(4)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "x")}`,
		region: zone,
	});
};

const waitForDropletActive = async (
	dropletId: string,
	maxAttempts = 36,
	intervalMs = 5_000,
) => {
	for (let i = 0; i < maxAttempts; i++) {
		await sleep(intervalMs);
		const droplet = await getDigitalOceanDroplet(dropletId);
		const ip = getPublicIPv4(droplet);
		if (droplet.status === "active" && ip) return ip;
	}
	throw new Error("Timed out waiting for droplet to become active");
};

const runSshCommand = (host: string, privateKey: string, command: string) =>
	new Promise<void>((resolve, reject) => {
		const client = new Client();
		client
			.once("ready", () => {
				client.exec(command, (err, stream) => {
					if (err) {
						client.end();
						reject(err);
						return;
					}
					stream.on("close", () => {
						client.end();
						resolve();
					});
					stream.resume();
					stream.stderr.resume();
				});
			})
			.on("error", (err) => {
				client.end();
				reject(err);
			})
			.connect({
				host,
				port: 22,
				username: "root",
				privateKey,
				readyTimeout: 20_000,
			});
	});

// Fresh droplets accept SSH before cloud-init finishes, and cloud-init/unattended-upgrades hold the apt lock the setup script needs.
const waitForBootComplete = async (
	host: string,
	privateKey: string,
	maxAttempts = 30,
) => {
	let lastError: unknown;
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await runSshCommand(
				host,
				privateKey,
				"cloud-init status --wait >/dev/null 2>&1; while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do sleep 3; done",
			);
			return;
		} catch (err) {
			lastError = err;
			await sleep(10_000);
		}
	}
	throw new Error(
		`Server did not become reachable over SSH: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
	);
};

// Builds spike RAM for short periods; swap lets them finish slower instead of being OOM-killed.
// Recreates the swapfile when its size differs, so the same command works after an upgrade.
const ensureSwap = (host: string, privateKey: string, swapGb: number) =>
	runSshCommand(
		host,
		privateKey,
		[
			`want=$((${swapGb}*1024*1024*1024)); cur=$(stat -c %s /swapfile 2>/dev/null || echo 0);`,
			'if [ "$cur" != "$want" ]; then',
			`swapoff /swapfile 2>/dev/null; rm -f /swapfile; fallocate -l ${swapGb}G /swapfile && chmod 600 /swapfile && mkswap /swapfile;`,
			"fi;",
			"swapon --show | grep -q /swapfile || swapon /swapfile;",
			"grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab;",
			"echo 'vm.swappiness=10' > /etc/sysctl.d/99-dokploy-swap.conf && sysctl -p /etc/sysctl.d/99-dokploy-swap.conf",
		].join(" "),
	);

export const provisionManagedServer = async (params: {
	managedServerId: string;
	organizationId: string;
	doSize: string;
	swapGb: number;
	zone: string;
	hostname: string;
}) => {
	const { managedServerId, organizationId, doSize, swapGb, zone, hostname } =
		params;
	const { publicKey, privateKey } = await generateSSHKey("rsa");

	const vpcId = await getOrCreateOrgNetwork(organizationId, zone);
	await updateManagedServer(managedServerId, { providerNetworkId: vpcId });

	const providerSshKeyId = await createDigitalOceanSshKey({
		name: hostname,
		publicKey,
	});

	let ipAddress: string;
	try {
		const droplet = await createDigitalOceanDroplet({
			name: hostname,
			size: doSize,
			region: zone,
			vpcId,
			sshKeyId: providerSshKeyId,
			organizationId,
			managedServerId,
		});

		await updateManagedServer(managedServerId, {
			providerVmId: String(droplet.id),
			hostname: droplet.name,
		});

		ipAddress = await waitForDropletActive(String(droplet.id));
	} finally {
		// The key is only read when the droplet is created, keeping it would just pile up keys in the DO account.
		await deleteDigitalOceanSshKey(providerSshKeyId).catch((err) =>
			console.error("[managed-server] failed to delete DO ssh key:", err),
		);
	}

	await updateManagedServer(managedServerId, {
		ipAddress,
		status: "configuring",
	});

	await waitForBootComplete(ipAddress, privateKey);
	await ensureSwap(ipAddress, privateKey, swapGb);

	const sshKey = await createSshKey({
		name: hostname,
		publicKey,
		privateKey,
		organizationId,
	});
	if (!sshKey) throw new Error("Failed to create SSH key");

	const serverRecord = await createServer(
		{
			name: `Cloud • ${hostname}`,
			description: "Cloud server provisioned by Dokploy Cloud",
			ipAddress,
			port: 22,
			username: "root",
			serverType: "deploy",
			enableDockerCleanup: true,
			sshKeyId: sshKey.sshKeyId,
		},
		organizationId,
	);

	await updateManagedServer(managedServerId, {
		serverId: serverRecord.serverId,
		sshKeyId: sshKey.sshKeyId,
	});

	await serverSetup(serverRecord.serverId);
	await updateManagedServer(managedServerId, { status: "ready" });
};

const deleteNetworkWhenFree = async (vpcId: string, maxAttempts = 12) => {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await deleteDigitalOceanVpc(vpcId);
			return;
		} catch (err) {
			const status = (err as { response?: { status: number } }).response
				?.status;
			if (status === 404) return;
			// DO rejects the delete with 403/409 until the destroyed droplet has fully left the VPC.
			await sleep(10_000);
		}
	}
	console.error(`[managed-server] could not delete VPC ${vpcId}`);
};

const setLinkedServerStatus = async (
	record: ManagedServer,
	serverStatus: "active" | "inactive",
) => {
	if (!record.serverId) return;
	await db
		.update(server)
		.set({ serverStatus })
		.where(eq(server.serverId, record.serverId));
};

export const releaseProviderResources = async (record: ManagedServer) => {
	if (record.providerFirewallId) {
		await deleteDigitalOceanFirewall(record.providerFirewallId).catch((err) => {
			if (err?.response?.status !== 404) throw err;
		});
	}
	if (record.providerVmId) {
		await deleteDigitalOceanDroplet(record.providerVmId).catch((err) => {
			if (err?.response?.status !== 404) throw err;
		});
	}
	// Covers a droplet that was created but whose id never got saved.
	await deleteDigitalOceanDropletsByTag(
		getManagedServerTag(record.managedServerId),
	);

	const vpcId = record.providerNetworkId;
	if (vpcId && !(await isNetworkUsedByOthers(vpcId, record.managedServerId))) {
		await deleteNetworkWhenFree(vpcId);
	}
};

const removeLinkedServer = async (record: ManagedServer) => {
	if (!record.serverId) return;
	const linkedServer = await findServerById(record.serverId);
	await removeDeploymentsByServerId(linkedServer);
	await deleteServer(record.serverId);
	// The key was generated for this server only, nothing else can use it.
	if (record.sshKeyId) await removeSSHKeyById(record.sshKeyId);
};

// Only terminations the customer confirmed on a server without services remove it from Dokploy;
// automatic ones (non-payment, Stripe cancellation) keep it inactive so its services can still be moved.
export const terminateManagedServer = async (
	managedServerId: string,
	options: { removeLinkedServer?: boolean } = {},
) => {
	const record = await findManagedServerById(managedServerId);
	await deleteManagedServer(managedServerId);
	if (options.removeLinkedServer) {
		await removeLinkedServer(record);
	} else {
		await setLinkedServerStatus(record, "inactive");
	}
	await releaseProviderResources(record);
};

export const suspendManagedServer = async (record: ManagedServer) => {
	if (record.status !== "ready") return;
	if (record.providerVmId) {
		await runDigitalOceanDropletAction(record.providerVmId, "power_off");
	}
	await setLinkedServerStatus(record, "inactive");
	await updateManagedServer(record.managedServerId, {
		status: "suspended",
		suspendedAt: new Date().toISOString(),
	});
};

export const resumeManagedServer = async (record: ManagedServer) => {
	if (record.status !== "suspended") return;
	if (record.providerVmId) {
		await runDigitalOceanDropletAction(record.providerVmId, "power_on");
	}
	await setLinkedServerStatus(record, "active");
	await updateManagedServer(record.managedServerId, {
		status: "ready",
		suspendedAt: null,
	});
};

const waitForDropletAction = async (
	dropletId: string,
	actionId: number,
	timeoutMs = 30 * 60_000,
) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await sleep(5_000);
		const action = await getDigitalOceanDropletAction(dropletId, actionId);
		if (action.status === "completed") return;
		if (action.status === "errored") {
			throw new Error(`DigitalOcean ${action.type} action failed`);
		}
	}
	throw new Error(`Timed out waiting for DigitalOcean action ${actionId}`);
};

const powerOffDroplet = async (dropletId: string) => {
	const droplet = await getDigitalOceanDroplet(dropletId);
	if (droplet.status === "off") return;
	try {
		const shutdown = await runDigitalOceanDropletAction(dropletId, "shutdown");
		await waitForDropletAction(dropletId, shutdown.id, 3 * 60_000);
	} catch {
		// The OS didn't shut down cleanly in time, fall back to cutting power.
		const powerOff = await runDigitalOceanDropletAction(dropletId, "power_off");
		await waitForDropletAction(dropletId, powerOff.id);
	}
};

export const powerOnManagedServerVm = async (record: ManagedServer) => {
	if (!record.providerVmId) return;
	const droplet = await getDigitalOceanDroplet(record.providerVmId);
	if (droplet.status === "active") return;
	const powerOn = await runDigitalOceanDropletAction(
		record.providerVmId,
		"power_on",
	);
	await waitForDropletAction(record.providerVmId, powerOn.id);
};

export const resizeManagedServerVm = async (
	record: ManagedServer,
	doSize: string,
	swapGb: number,
) => {
	if (!record.providerVmId) throw new Error("Server has no VM to resize");

	await powerOffDroplet(record.providerVmId);
	const resize = await resizeDigitalOceanDroplet(record.providerVmId, doSize);
	await waitForDropletAction(record.providerVmId, resize.id);
	await powerOnManagedServerVm(record);

	if (!record.ipAddress || !record.sshKeyId) return;
	// The resize already succeeded at this point; a swap hiccup must not roll the upgrade back.
	try {
		const sshKey = await findSSHKeyById(record.sshKeyId);
		await waitForBootComplete(record.ipAddress, sshKey.privateKey);
		await ensureSwap(record.ipAddress, sshKey.privateKey, swapGb);
	} catch (err) {
		console.error("[managed-server] failed to resize swap after upgrade:", err);
	}
};

const ANYWHERE = ["0.0.0.0/0", "::/0"];
const DEFAULT_MONITORING_PORT = 4500;

// Dokploy manages the server over SSH and reads its metrics on the monitoring port, so these can't be closed.
const getSystemFirewallRules = (monitoringPort: number): FirewallRule[] => [
	{ protocol: "tcp", ports: "22", sources: ANYWHERE },
	{ protocol: "tcp", ports: String(monitoringPort), sources: ANYWHERE },
];

const DEFAULT_FIREWALL_RULES: FirewallRule[] = [
	{ protocol: "tcp", ports: "80", sources: ANYWHERE },
	{ protocol: "tcp", ports: "443", sources: ANYWHERE },
	{ protocol: "icmp", sources: ANYWHERE },
];

const toDigitalOceanRules = (
	rules: FirewallRule[],
): DigitalOceanInboundRule[] =>
	rules.map((rule) => ({
		protocol: rule.protocol,
		...(rule.protocol === "icmp" ? {} : { ports: rule.ports }),
		sources: { addresses: rule.sources },
	}));

const fromDigitalOceanRules = (
	rules: DigitalOceanInboundRule[],
): FirewallRule[] =>
	rules.map((rule) =>
		rule.protocol === "icmp"
			? { protocol: "icmp", sources: rule.sources.addresses ?? [] }
			: {
					protocol: rule.protocol,
					ports:
						rule.ports === "all" || rule.ports === "0" || !rule.ports
							? "1-65535"
							: rule.ports,
					sources: rule.sources.addresses ?? [],
				},
	);

const isSameRule = (a: FirewallRule, b: FirewallRule) =>
	a.protocol === b.protocol &&
	(a.protocol === "icmp" || b.protocol === "icmp" || a.ports === b.ports);

const getMonitoringPort = async (record: ManagedServer) => {
	if (!record.serverId) return DEFAULT_MONITORING_PORT;
	const linkedServer = await findServerById(record.serverId);
	return linkedServer.metricsConfig?.server?.port ?? DEFAULT_MONITORING_PORT;
};

const toFirewallParams = (record: ManagedServer, rules: FirewallRule[]) => ({
	name: record.hostname ?? record.managedServerId,
	tag: getManagedServerTag(record.managedServerId),
	inboundRules: toDigitalOceanRules(rules),
});

const withoutSystemRules = (
	rules: FirewallRule[],
	systemRules: FirewallRule[],
) =>
	rules.filter(
		(rule) => !systemRules.some((system) => isSameRule(rule, system)),
	);

// The firewall is opt-in: without one the droplet behaves like a regular VPS with every port open.
export const getManagedServerFirewall = async (record: ManagedServer) => {
	getProvisionedVmId(record);
	const systemRules = getSystemFirewallRules(await getMonitoringPort(record));

	if (!record.providerFirewallId) {
		return {
			enabled: false,
			status: null,
			systemRules,
			rules: DEFAULT_FIREWALL_RULES,
		};
	}

	const firewall = await getDigitalOceanFirewall(record.providerFirewallId);
	return {
		enabled: true,
		status: firewall.status,
		systemRules,
		rules: withoutSystemRules(
			fromDigitalOceanRules(firewall.inbound_rules),
			systemRules,
		),
	};
};

export const updateManagedServerFirewall = async (
	record: ManagedServer,
	rules: FirewallRule[],
) => {
	getProvisionedVmId(record);
	const systemRules = getSystemFirewallRules(await getMonitoringPort(record));
	const params = toFirewallParams(record, [
		...systemRules,
		...withoutSystemRules(rules, systemRules),
	]);

	if (record.providerFirewallId) {
		await updateDigitalOceanFirewall(record.providerFirewallId, params);
	} else {
		const firewallId = await createDigitalOceanFirewall(params);
		await updateManagedServer(record.managedServerId, {
			providerFirewallId: firewallId,
		});
	}

	return getManagedServerFirewall(
		await findManagedServerById(record.managedServerId),
	);
};

export const disableManagedServerFirewall = async (record: ManagedServer) => {
	getProvisionedVmId(record);
	if (record.providerFirewallId) {
		await deleteDigitalOceanFirewall(record.providerFirewallId).catch((err) => {
			if (err?.response?.status !== 404) throw err;
		});
		await updateManagedServer(record.managedServerId, {
			providerFirewallId: null,
		});
	}
	return getManagedServerFirewall(
		await findManagedServerById(record.managedServerId),
	);
};

const getProvisionedVmId = (record: ManagedServer) => {
	if (record.status !== "ready" || !record.providerVmId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is not ready",
		});
	}
	return record.providerVmId;
};

export const getManagedServerVmInfo = async (record: ManagedServer) => {
	const droplet = await getDigitalOceanDroplet(getProvisionedVmId(record));
	return {
		status: droplet.status,
		privateIp: getPrivateIPv4(droplet) ?? null,
		os: `${droplet.image.distribution} ${droplet.image.name}`,
		regionName: droplet.region.name,
		createdAt: droplet.created_at,
	};
};

export const runManagedServerPowerAction = async (
	record: ManagedServer,
	action: DropletPowerAction,
) => runDigitalOceanDropletAction(getProvisionedVmId(record), action);

export const getManagedServerPowerAction = async (
	record: ManagedServer,
	actionId: number,
) => getDigitalOceanDropletAction(getProvisionedVmId(record), actionId);
