import { db } from "@dokploy/server/db";
import { server } from "@dokploy/server/db/schema";
import {
	cloudServer,
	type FirewallRule,
} from "@dokploy/server/db/schema/cloud-server";
import { removeDeploymentsByServerId } from "@dokploy/server/services/deployment";
import {
	createServer,
	deleteServer,
	findServerById,
} from "@dokploy/server/services/server";
import {
	createSshKey,
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
	getCloudServerTag,
	getDigitalOceanDroplet,
	getDigitalOceanDropletAction,
	getDigitalOceanDropletCount,
	getDigitalOceanDropletOutboundBytes,
	getDigitalOceanFirewall,
	getDigitalOceanVpcRange,
	getPrivateIPv4,
	getPublicIPv4,
	resizeDigitalOceanDroplet,
	runDigitalOceanDropletAction,
	updateDigitalOceanFirewall,
} from "@dokploy/server/utils/digitalocean";
import { generateSSHKey } from "@dokploy/server/utils/filesystem/ssh";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import {
	and,
	eq,
	isNotNull,
	isNull,
	lt,
	ne,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import { customAlphabet } from "nanoid";

export type CloudServer = typeof cloudServer.$inferSelect;

// Stripe can deliver the same webhook more than once; only the call that inserts the row gets to provision.
export const createCloudServer = async (
	input: typeof cloudServer.$inferInsert,
) => {
	return db
		.insert(cloudServer)
		.values(input)
		.onConflictDoNothing()
		.returning()
		.then((r) => r[0]);
};

export const assertCloudServerCapacity = async () => {
	const limit = Number(process.env.DIGITALOCEAN_DROPLET_LIMIT);
	if (!limit) return;
	if ((await getDigitalOceanDropletCount()) >= limit) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cloud servers are at capacity right now. Please try again later.",
		});
	}
};

export const findCloudServerById = async (cloudServerId: string) => {
	const record = await db.query.cloudServer.findFirst({
		where: eq(cloudServer.cloudServerId, cloudServerId),
		with: { server: true },
	});
	if (!record)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Cloud server not found",
		});
	return record;
};

export const findCloudServersByOrg = async (organizationId: string) => {
	return db.query.cloudServer.findMany({
		where: eq(cloudServer.organizationId, organizationId),
		with: { server: true },
		orderBy: (t, { desc }) => [desc(t.createdAt)],
	});
};

export const updateCloudServer = async (
	cloudServerId: string,
	data: Partial<typeof cloudServer.$inferInsert>,
) => {
	return db
		.update(cloudServer)
		.set({ ...data, updatedAt: new Date().toISOString() })
		.where(eq(cloudServer.cloudServerId, cloudServerId))
		.returning()
		.then((r) => r[0]);
};

export const deleteCloudServer = async (cloudServerId: string) => {
	return db
		.delete(cloudServer)
		.where(eq(cloudServer.cloudServerId, cloudServerId));
};

// Cloud servers are billed on their own subscription, so they never count against the plan's server quota.
export const isNotCloudServer = () =>
	notInArray(
		server.serverId,
		db
			.select({ serverId: cloudServer.serverId })
			.from(cloudServer)
			.where(isNotNull(cloudServer.serverId)),
	);

export const hasActiveCloudServers = async (organizationId: string) => {
	const record = await db.query.cloudServer.findFirst({
		where: and(
			eq(cloudServer.organizationId, organizationId),
			eq(cloudServer.status, "ready"),
		),
	});
	return !!record;
};

export const findCloudServerByServerId = async (serverId: string) => {
	return db.query.cloudServer.findFirst({
		where: eq(cloudServer.serverId, serverId),
	});
};

export const findCloudServerIds = async (organizationId: string) => {
	const rows = await db
		.select({ serverId: cloudServer.serverId })
		.from(cloudServer)
		.where(
			and(
				eq(cloudServer.organizationId, organizationId),
				isNotNull(cloudServer.serverId),
			),
		);
	return new Set(rows.map((r) => r.serverId));
};

export const findCloudServerBySubscriptionId = async (
	stripeSubscriptionId: string,
) => {
	return db.query.cloudServer.findFirst({
		where: eq(cloudServer.stripeSubscriptionId, stripeSubscriptionId),
	});
};

export const claimCloudServerForUpgrade = async (cloudServerId: string) => {
	return db
		.update(cloudServer)
		.set({
			status: "upgrading",
			errorMessage: null,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(cloudServer.cloudServerId, cloudServerId),
				eq(cloudServer.status, "ready"),
			),
		)
		.returning()
		.then((r) => r[0]);
};

export const findSuspendedCloudServersBefore = async (cutoff: Date) => {
	return db.query.cloudServer.findMany({
		where: and(
			eq(cloudServer.status, "suspended"),
			lt(cloudServer.suspendedAt, cutoff.toISOString()),
		),
	});
};

export const findReadyCloudServers = async () => {
	return db.query.cloudServer.findMany({
		where: and(
			eq(cloudServer.status, "ready"),
			isNotNull(cloudServer.stripeSubscriptionId),
		),
	});
};

// Every instance runs the reminders cron: only the one that moves the date past dueAt sends the email.
export const claimCloudServerPaymentReminder = async (
	cloudServerId: string,
	dueAt: Date,
) => {
	const claimed = await db
		.update(cloudServer)
		.set({ paymentReminderAt: new Date().toISOString() })
		.where(
			and(
				eq(cloudServer.cloudServerId, cloudServerId),
				or(
					isNull(cloudServer.paymentReminderAt),
					lt(cloudServer.paymentReminderAt, dueAt.toISOString()),
				),
			),
		)
		.returning();
	return claimed.length > 0;
};

export const recordCloudServersBandwidth = async () => {
	const servers = await db.query.cloudServer.findMany({
		where: isNotNull(cloudServer.providerVmId),
	});

	const measured: { previous: CloudServer; current: CloudServer }[] = [];

	for (const record of servers) {
		const until = new Date();
		try {
			const bytes = await getDigitalOceanDropletOutboundBytes(
				record.providerVmId!,
				new Date(record.bandwidthMeasuredAt ?? record.createdAt),
				until,
			);
			// Every instance runs this cron: matching the value we read keeps a second one from adding the same traffic again.
			const [current] = await db
				.update(cloudServer)
				.set({
					bandwidthBytes: record.bandwidthBytes + bytes,
					bandwidthMeasuredAt: until.toISOString(),
				})
				.where(
					and(
						eq(cloudServer.cloudServerId, record.cloudServerId),
						eq(cloudServer.bandwidthBytes, record.bandwidthBytes),
					),
				)
				.returning();
			if (current) measured.push({ previous: record, current });
		} catch (err) {
			console.error(
				`[cloud-server] failed to record bandwidth of ${record.cloudServerId}:`,
				err,
			);
		}
	}

	return measured;
};

export const isVpcUsedByOthers = async (
	providerVpcId: string,
	cloudServerId: string,
) => {
	const record = await db.query.cloudServer.findFirst({
		where: and(
			eq(cloudServer.providerVpcId, providerVpcId),
			ne(cloudServer.cloudServerId, cloudServerId),
		),
	});
	return !!record;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const randomSuffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

// DO only accepts letters, digits, dashes and periods in droplet, firewall and VPC names.
const organizationNamePrefix = (organizationId: string) =>
	`dokploy-${organizationId.replace(/[^a-zA-Z0-9-]/g, "-")}`;

export const buildCloudServerHostname = (organizationId: string) =>
	`${organizationNamePrefix(organizationId)}-${randomSuffix()}`;

const createOrgVpc = async (organizationId: string, zone: string) => {
	await ensureDigitalOceanDefaultVpc(zone);
	return createDigitalOceanVpc({
		name: `${organizationNamePrefix(organizationId)}-${zone}-${randomSuffix(4)}`,
		region: zone,
	});
};

// Purchases take turns here: DO gives VPCs created at the same moment the same range and
// rejects all but one, and two servers of one organization would each create their own VPC.
const assignOrgVpc = (
	cloudServerId: string,
	organizationId: string,
	zone: string,
) =>
	db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext('cloud-server-vpc'))`,
		);
		const sibling = await tx.query.cloudServer.findFirst({
			where: and(
				eq(cloudServer.organizationId, organizationId),
				eq(cloudServer.zone, zone),
				isNotNull(cloudServer.providerVpcId),
			),
		});
		const vpcId =
			sibling?.providerVpcId ?? (await createOrgVpc(organizationId, zone));
		await tx
			.update(cloudServer)
			.set({ providerVpcId: vpcId, updatedAt: new Date().toISOString() })
			.where(eq(cloudServer.cloudServerId, cloudServerId));
		return vpcId;
	});

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

// Fresh droplets accept SSH before cloud-init finishes, and cloud-init/unattended-upgrades hold the apt lock the setup script needs.
const waitForBootComplete = async (serverId: string, maxAttempts = 30) => {
	let lastError: unknown;
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await execAsyncRemote(
				serverId,
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
const ensureSwap = (serverId: string, swapGb: number) =>
	execAsyncRemote(
		serverId,
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

// DO answers 404 for a key that a droplet request has just used, and only deletes it some seconds later.
const deleteSshKeyWhenFree = async (sshKeyId: number, maxAttempts = 12) => {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await deleteDigitalOceanSshKey(sshKeyId);
			return;
		} catch {
			await sleep(10_000);
		}
	}
	console.error(`[cloud-server] could not delete DO ssh key ${sshKeyId}`);
};

export const provisionCloudServer = async (params: {
	cloudServerId: string;
	organizationId: string;
	doSize: string;
	swapGb: number;
	zone: string;
	hostname: string;
}) => {
	const { cloudServerId, organizationId, doSize, swapGb, zone, hostname } =
		params;
	const { publicKey, privateKey } = await generateSSHKey("rsa");

	const vpcId = await assignOrgVpc(cloudServerId, organizationId, zone);

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
			cloudServerId,
		});

		await updateCloudServer(cloudServerId, {
			providerVmId: String(droplet.id),
			hostname: droplet.name,
		});

		ipAddress = await waitForDropletActive(String(droplet.id));
	} finally {
		// The key is only read when the droplet is created, keeping it would just pile up keys in the DO account.
		void deleteSshKeyWhenFree(providerSshKeyId);
	}

	await updateCloudServer(cloudServerId, {
		ipAddress,
		status: "configuring",
	});

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

	await updateCloudServer(cloudServerId, {
		serverId: serverRecord.serverId,
		sshKeyId: sshKey.sshKeyId,
	});

	await waitForBootComplete(serverRecord.serverId);
	await ensureSwap(serverRecord.serverId, swapGb);
	await serverSetup(serverRecord.serverId);
	await updateCloudServer(cloudServerId, { status: "ready" });
};

const deleteVpcWhenFree = async (vpcId: string, maxAttempts = 12) => {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await deleteDigitalOceanVpc(vpcId);
			return;
		} catch (err) {
			const status = (err as { response?: { status: number } }).response
				?.status;
			if (status === 404) return;
			await sleep(10_000);
		}
	}
	console.error(`[cloud-server] could not delete VPC ${vpcId}`);
};

const setLinkedServerStatus = async (
	record: CloudServer,
	serverStatus: "active" | "inactive",
) => {
	if (!record.serverId) return;
	await db
		.update(server)
		.set({ serverStatus })
		.where(eq(server.serverId, record.serverId));
};

export const releaseProviderResources = async (record: CloudServer) => {
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
	await deleteDigitalOceanDropletsByTag(
		getCloudServerTag(record.cloudServerId),
	);

	const vpcId = record.providerVpcId;
	if (vpcId && !(await isVpcUsedByOthers(vpcId, record.cloudServerId))) {
		await deleteVpcWhenFree(vpcId);
	}
};

const removeLinkedServer = async (record: CloudServer) => {
	if (!record.serverId) return;
	const linkedServer = await findServerById(record.serverId);
	await removeDeploymentsByServerId(linkedServer);
	await deleteServer(record.serverId);
	if (record.sshKeyId) await removeSSHKeyById(record.sshKeyId);
};

export const terminateCloudServer = async (
	cloudServerId: string,
	options: { removeLinkedServer?: boolean } = {},
) => {
	const record = await findCloudServerById(cloudServerId);
	await deleteCloudServer(cloudServerId);
	if (options.removeLinkedServer) {
		await removeLinkedServer(record);
	} else {
		await setLinkedServerStatus(record, "inactive");
	}
	await releaseProviderResources(record);
};

export const suspendCloudServer = async (record: CloudServer) => {
	if (record.status !== "ready") return;
	if (record.providerVmId) {
		await runDigitalOceanDropletAction(record.providerVmId, "power_off");
	}
	await setLinkedServerStatus(record, "inactive");
	await updateCloudServer(record.cloudServerId, {
		status: "suspended",
		suspendedAt: new Date().toISOString(),
	});
};

export const resumeCloudServer = async (record: CloudServer) => {
	if (record.status !== "suspended") return;
	if (record.providerVmId) {
		await runDigitalOceanDropletAction(record.providerVmId, "power_on");
	}
	await setLinkedServerStatus(record, "active");
	await updateCloudServer(record.cloudServerId, {
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

export const powerOnCloudServerVm = async (record: CloudServer) => {
	if (!record.providerVmId) return;
	const droplet = await getDigitalOceanDroplet(record.providerVmId);
	if (droplet.status === "active") return;
	const powerOn = await runDigitalOceanDropletAction(
		record.providerVmId,
		"power_on",
	);
	await waitForDropletAction(record.providerVmId, powerOn.id);
};

export const resizeCloudServerVm = async (
	record: CloudServer,
	doSize: string,
	swapGb: number,
) => {
	if (!record.providerVmId) throw new Error("Server has no VM to resize");

	await powerOffDroplet(record.providerVmId);
	const resize = await resizeDigitalOceanDroplet(record.providerVmId, doSize);
	await waitForDropletAction(record.providerVmId, resize.id);
	await powerOnCloudServerVm(record);

	if (!record.serverId) return;
	try {
		await waitForBootComplete(record.serverId);
		await ensureSwap(record.serverId, swapGb);
	} catch (err) {
		console.error("[cloud-server] failed to resize swap after upgrade:", err);
	}
};

const ANYWHERE = ["0.0.0.0/0", "::/0"];
const ALL_PORTS = "1-65535";
const DEFAULT_MONITORING_PORT = 4500;

const getSystemFirewallRules = (
	monitoringPort: number,
	vpcRange: string | null,
): FirewallRule[] => [
	{ protocol: "tcp", ports: "22", sources: ANYWHERE },
	{ protocol: "tcp", ports: String(monitoringPort), sources: ANYWHERE },
	...(vpcRange
		? ([
				{ protocol: "tcp", ports: ALL_PORTS, sources: [vpcRange] },
				{ protocol: "udp", ports: ALL_PORTS, sources: [vpcRange] },
			] satisfies FirewallRule[])
		: []),
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
		ports: rule.protocol === "icmp" ? "0" : rule.ports,
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
							? ALL_PORTS
							: rule.ports,
					sources: rule.sources.addresses ?? [],
				},
	);

const isSameRule = (a: FirewallRule, b: FirewallRule) =>
	a.protocol === b.protocol &&
	(a.protocol === "icmp" || b.protocol === "icmp" || a.ports === b.ports) &&
	a.sources.length === b.sources.length &&
	a.sources.every((source) => b.sources.includes(source));

const getMonitoringPort = async (record: CloudServer) => {
	if (!record.serverId) return DEFAULT_MONITORING_PORT;
	const linkedServer = await findServerById(record.serverId);
	return linkedServer.metricsConfig?.server?.port ?? DEFAULT_MONITORING_PORT;
};

const getSystemRules = async (record: CloudServer) => {
	const [monitoringPort, vpcRange] = await Promise.all([
		getMonitoringPort(record),
		record.providerVpcId ? getDigitalOceanVpcRange(record.providerVpcId) : null,
	]);
	return getSystemFirewallRules(monitoringPort, vpcRange);
};

const toFirewallParams = (record: CloudServer, rules: FirewallRule[]) => ({
	name: record.hostname ?? record.cloudServerId,
	tag: getCloudServerTag(record.cloudServerId),
	inboundRules: toDigitalOceanRules(rules),
});

const withoutSystemRules = (
	rules: FirewallRule[],
	systemRules: FirewallRule[],
) =>
	rules.filter(
		(rule) => !systemRules.some((system) => isSameRule(rule, system)),
	);

export const getCloudServerFirewall = async (record: CloudServer) => {
	getProvisionedVmId(record);
	const systemRules = await getSystemRules(record);

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
			fromDigitalOceanRules(firewall.inbound_rules ?? []),
			systemRules,
		),
	};
};

export const updateCloudServerFirewall = async (
	record: CloudServer,
	rules: FirewallRule[],
) => {
	getProvisionedVmId(record);
	const systemRules = await getSystemRules(record);
	const params = toFirewallParams(record, [
		...systemRules,
		...withoutSystemRules(rules, systemRules),
	]);

	if (record.providerFirewallId) {
		await updateDigitalOceanFirewall(record.providerFirewallId, params);
	} else {
		const firewallId = await createDigitalOceanFirewall(params);
		await updateCloudServer(record.cloudServerId, {
			providerFirewallId: firewallId,
		});
	}

	return getCloudServerFirewall(
		await findCloudServerById(record.cloudServerId),
	);
};

export const disableCloudServerFirewall = async (record: CloudServer) => {
	getProvisionedVmId(record);
	if (record.providerFirewallId) {
		await deleteDigitalOceanFirewall(record.providerFirewallId).catch((err) => {
			if (err?.response?.status !== 404) throw err;
		});
		await updateCloudServer(record.cloudServerId, {
			providerFirewallId: null,
		});
	}
	return getCloudServerFirewall(
		await findCloudServerById(record.cloudServerId),
	);
};

const getProvisionedVmId = (record: CloudServer) => {
	if (record.status !== "ready" || !record.providerVmId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is not ready",
		});
	}
	return record.providerVmId;
};

export const getCloudServerVmInfo = async (record: CloudServer) => {
	const droplet = await getDigitalOceanDroplet(getProvisionedVmId(record));
	return {
		status: droplet.status,
		privateIp: getPrivateIPv4(droplet) ?? null,
		os: `${droplet.image.distribution} ${droplet.image.name}`,
		regionName: droplet.region.name,
		createdAt: droplet.created_at,
	};
};

export const runCloudServerPowerAction = async (
	record: CloudServer,
	action: DropletPowerAction,
) => runDigitalOceanDropletAction(getProvisionedVmId(record), action);

export const getCloudServerPowerAction = async (
	record: CloudServer,
	actionId: number,
) => getDigitalOceanDropletAction(getProvisionedVmId(record), actionId);
