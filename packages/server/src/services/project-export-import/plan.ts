import { IS_CLOUD, paths } from "@dokploy/server/constants";
import { APP_NAME_REGEX } from "@dokploy/server/db/schema/utils";
import { testDestinationConnection } from "@dokploy/server/services/destination";
import { testRegistryConnection } from "@dokploy/server/services/registry";
import { testVaultProviderConnection } from "@dokploy/server/services/vault-provider";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { finalDomainHost, regenerateAppName } from "./appname";
import {
	CONFLICT_OPTIONS,
	conflictResolutionsOf,
	resolveConflicts,
} from "./conflicts";
import { DUMPABLE_DB_TYPES } from "./dumps";
import type { TransferDb } from "./queries";
import { escapeShellArg, safeErrorMessage } from "./remote-fs";
import {
	buildServerIpMap,
	buildServiceServerMap,
	LOCAL_SERVER_CANDIDATE_ID,
	proposeResolutions,
	requirementKey,
} from "./resolve";
import { SERVICE_ID_FIELD, SERVICE_TYPE_ENV_KEY } from "./service-kinds";
import type {
	Conflict,
	ConflictResolution,
	DomainStrategy,
	PendingService,
	Plan,
	PlanValidationCheck,
	ProposedResolution,
	Requirement,
	Resolution,
	ServiceType,
	Snapshot,
	Target,
	UsedBy,
	Warning,
} from "./types";
import { planSchema } from "./types";
import type { RunVersionProbe } from "./versions";
import { compareDockerVersions, probeDockerVersion } from "./versions";

export type CheckAppNameAvailable = (
	appName: string,
	serverId: string | null,
) => Promise<boolean>;

export const checkAppNameAvailable: CheckAppNameAvailable = async (
	appName,
	serverId,
) => {
	const run = (command: string) =>
		serverId ? execAsyncRemote(serverId, command) : execAsync(command);

	try {
		const { stdout } = await run(
			`docker service ls --filter name=${escapeShellArg(appName)} --format '{{.Name}}'`,
		);
		if (stdout.split("\n").some((line) => line.trim() === appName)) {
			return false;
		}
	} catch {}

	const p = paths(!!serverId);
	for (const dir of [p.APPLICATIONS_PATH, p.COMPOSE_PATH]) {
		try {
			await run(`test -d ${escapeShellArg(`${dir}/${appName}`)}`);
			return false;
		} catch {}
	}

	return true;
};

const requirementLabel = (requirement: Requirement): string => {
	switch (requirement.kind) {
		case "vault":
			return `vault "${requirement.providerName}"`;
		case "gitProvider":
			return `${requirement.providerType} git provider`;
		case "destination":
			return `destination "${requirement.bucket}"`;
		case "registry":
			return `registry "${requirement.registryUrl}"`;
		case "sshKey":
			return "SSH key";
		case "network":
			return `network "${requirement.name}"`;
		case "certificate":
			return "custom certificate";
		case "server":
			return "server";
	}
};

const defaultResolutionFor = (
	key: string,
	proposed: ProposedResolution | undefined,
): Resolution => {
	if (!proposed) {
		return { requirementKey: key, action: "skip" };
	}
	switch (proposed.status) {
		case "resolved":
			return {
				requirementKey: key,
				action: "reuse",
				targetId: proposed.targetId,
			};
		case "createable":
			return { requirementKey: key, action: "create" };
		case "mappable":
		case "missing":
			return { requirementKey: key, action: "skip" };
	}
};

type DomainContext = {
	appNameMap: Record<string, string>;
	serverMap: Record<string, string | null>;
	serverIpMap: Record<string, string>;
	domainStrategy: DomainStrategy;
};

const collectDomainHosts = (
	snapshot: Snapshot,
	ctx: DomainContext,
): Map<string, UsedBy[]> => {
	const hosts = new Map<string, UsedBy[]>();
	const serviceServerMap = buildServiceServerMap(snapshot);
	for (const service of snapshot.resources.services) {
		const kind = service.kind as ServiceType;
		if (kind !== "application" && kind !== "compose") continue;
		const domains =
			(service.domains as Record<string, unknown>[] | undefined) ?? [];
		const serviceId = service[SERVICE_ID_FIELD[kind]] as string;
		const environmentId = service.environmentId as string;
		const serviceName =
			(service.name as string | undefined) ?? (service.appName as string) ?? "";
		const originalServerId = serviceServerMap.get(serviceId) ?? null;
		const destServerId = ctx.serverMap[originalServerId ?? "null"] ?? null;
		const destinationIp = ctx.serverIpMap[destServerId ?? "local"] ?? null;
		for (const domain of domains) {
			const sourceHost = domain.host as string | undefined;
			if (!sourceHost) continue;
			const { host } = finalDomainHost(
				sourceHost,
				ctx.appNameMap,
				destinationIp,
				ctx.domainStrategy,
			);
			const list = hosts.get(host) ?? [];
			list.push({
				serviceId,
				serviceType: kind,
				serviceName,
				environmentId,
				field: `domain:${domain.domainId as string}`,
			});
			hosts.set(host, list);
		}
	}
	return hosts;
};

const collectPortUsage = (
	snapshot: Snapshot,
	serverMap: Record<string, string | null>,
): Map<
	string,
	{ publishedPort: number; destServerId: string | null; usedBy: UsedBy[] }
> => {
	const byKey = new Map<
		string,
		{ publishedPort: number; destServerId: string | null; usedBy: UsedBy[] }
	>();
	const serviceServerMap = buildServiceServerMap(snapshot);
	for (const service of snapshot.resources.services) {
		const kind = service.kind as ServiceType;
		const publishedPorts =
			kind === "application"
				? ((service.ports as Record<string, unknown>[] | undefined) ?? []).map(
						(port) => port.publishedPort as number,
					)
				: typeof service.externalPort === "number"
					? [service.externalPort]
					: [];
		if (publishedPorts.length === 0) continue;
		const serviceId = service[SERVICE_ID_FIELD[kind]] as string;
		const originalServerId = serviceServerMap.get(serviceId) ?? null;
		const destServerId = serverMap[originalServerId ?? "null"] ?? null;
		const environmentId = service.environmentId as string;
		const serviceName =
			(service.name as string | undefined) ?? (service.appName as string) ?? "";
		for (const publishedPort of publishedPorts) {
			const key = `${destServerId ?? "local"}:${publishedPort}`;
			const entry = byKey.get(key) ?? {
				publishedPort,
				destServerId,
				usedBy: [],
			};
			entry.usedBy.push({
				serviceId,
				serviceType: kind,
				serviceName,
				environmentId,
			});
			byKey.set(key, entry);
		}
	}
	return byKey;
};

const networkDestServerId = (
	requirement: Requirement,
	serviceServerMap: Map<string, string | null>,
	serverMap: Record<string, string | null>,
): string | null => {
	const serviceId = requirement.usedBy[0]?.serviceId;
	const originalServerId = serviceId
		? (serviceServerMap.get(serviceId) ?? null)
		: null;
	return serverMap[originalServerId ?? "null"] ?? null;
};

const findUsedPorts = async (
	db: TransferDb,
	publishedPorts: number[],
): Promise<{ existingId: string; port: number; serverId: string | null }[]> => {
	const existingPorts = await db.query.ports.findMany({
		where: (fields, { inArray }) =>
			inArray(fields.publishedPort, publishedPorts),
		with: { application: { columns: { serverId: true } } },
	});
	const usedPorts = existingPorts.map((row) => ({
		existingId: row.portId,
		port: row.publishedPort,
		serverId: row.application?.serverId ?? null,
	}));
	const dbRows = await Promise.all([
		db.query.postgres
			.findMany({
				where: (fields, { inArray }) =>
					inArray(fields.externalPort, publishedPorts),
			})
			.then((rows) => rows.map((row) => [row.postgresId, row] as const)),
		db.query.mysql
			.findMany({
				where: (fields, { inArray }) =>
					inArray(fields.externalPort, publishedPorts),
			})
			.then((rows) => rows.map((row) => [row.mysqlId, row] as const)),
		db.query.mariadb
			.findMany({
				where: (fields, { inArray }) =>
					inArray(fields.externalPort, publishedPorts),
			})
			.then((rows) => rows.map((row) => [row.mariadbId, row] as const)),
		db.query.mongo
			.findMany({
				where: (fields, { inArray }) =>
					inArray(fields.externalPort, publishedPorts),
			})
			.then((rows) => rows.map((row) => [row.mongoId, row] as const)),
		db.query.redis
			.findMany({
				where: (fields, { inArray }) =>
					inArray(fields.externalPort, publishedPorts),
			})
			.then((rows) => rows.map((row) => [row.redisId, row] as const)),
		db.query.libsql
			.findMany({
				where: (fields, { inArray }) =>
					inArray(fields.externalPort, publishedPorts),
			})
			.then((rows) => rows.map((row) => [row.libsqlId, row] as const)),
	]);
	for (const [existingId, row] of dbRows.flat()) {
		if (row.externalPort === null) continue;
		usedPorts.push({
			existingId,
			port: row.externalPort,
			serverId: row.serverId ?? null,
		});
	}
	return usedPorts;
};

const detectConflicts = async (
	db: TransferDb,
	snapshot: Snapshot,
	organizationId: string,
	target: Target,
	resolutions: Record<string, Resolution>,
	domainContext: DomainContext,
): Promise<Conflict[]> => {
	const { serverMap } = domainContext;
	const conflicts: Conflict[] = [];

	if (target.kind === "newProject") {
		const existingProject = await db.query.projects.findFirst({
			where: (fields, { and, eq }) =>
				and(
					eq(fields.organizationId, organizationId),
					eq(fields.name, target.name),
				),
		});
		if (existingProject) {
			conflicts.push({
				kind: "projectName",
				value: target.name,
				existingId: existingProject.projectId,
				usedBy: [],
				options: CONFLICT_OPTIONS.projectName,
			});
		}
	}

	const domainHosts = collectDomainHosts(snapshot, domainContext);
	if (domainHosts.size > 0) {
		const existingDomains = await db.query.domains.findMany({
			where: (fields, { inArray }) =>
				inArray(fields.host, [...domainHosts.keys()]),
		});
		const seen = new Set<string>();
		for (const row of existingDomains) {
			if (seen.has(row.host)) continue;
			seen.add(row.host);
			conflicts.push({
				kind: "domain",
				value: row.host,
				existingId: row.domainId,
				usedBy: domainHosts.get(row.host) ?? [],
				options: CONFLICT_OPTIONS.domain,
			});
		}
	}

	const portUsage = collectPortUsage(snapshot, serverMap);
	if (portUsage.size > 0) {
		const publishedPorts = [
			...new Set([...portUsage.values()].map((v) => v.publishedPort)),
		];
		const usedPorts = await findUsedPorts(db, publishedPorts);
		const seen = new Set<string>();
		for (const { existingId, port, serverId } of usedPorts) {
			const key = `${serverId ?? "local"}:${port}`;
			const entry = portUsage.get(key);
			if (!entry || seen.has(key)) continue;
			seen.add(key);
			conflicts.push({
				kind: "port",
				value: String(port),
				existingId,
				usedBy: entry.usedBy,
				options: CONFLICT_OPTIONS.port,
			});
		}
	}

	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "network") continue;
		const key = requirementKey(requirement);
		if (resolutions[key]?.action !== "create") continue;
		const destServerId = networkDestServerId(
			requirement,
			buildServiceServerMap(snapshot),
			serverMap,
		);
		const existingNetwork = await db.query.network.findFirst({
			where: (fields, { and, eq, isNull }) =>
				and(
					eq(fields.organizationId, organizationId),
					eq(fields.name, requirement.name),
					destServerId
						? eq(fields.serverId, destServerId)
						: isNull(fields.serverId),
				),
		});
		if (existingNetwork) {
			conflicts.push({
				kind: "network",
				value: requirement.name,
				existingId: existingNetwork.networkId,
				usedBy: requirement.usedBy,
				options: CONFLICT_OPTIONS.network,
			});
		}
	}

	return conflicts;
};

export type BuildPlanUserChoices = {
	resolutions?: Record<string, Resolution>;
	keepAppNames?: boolean;
	domainStrategy?: DomainStrategy;
	portsStrategy?: "keep" | "disable";
	checkAppNameAvailable?: CheckAppNameAvailable;
	rotateDatabaseCredentials?: boolean;
	conflictResolutions?: Record<string, ConflictResolution>;
	deployAfterImport?: boolean;
};

const MAX_APP_NAME_RETRIES = 5;

const ensureUniqueAppName = async (
	db: TransferDb,
	serviceType: ServiceType,
	oldAppName: string,
	candidate: string,
	appNameMap: Record<string, string>,
): Promise<string> => {
	const queryTables = db.query as unknown as Record<
		string,
		{ findFirst: (args: unknown) => Promise<unknown> }
	>;
	const table = queryTables[SERVICE_TYPE_ENV_KEY[serviceType]];

	let attempt = candidate;
	for (let i = 0; i < MAX_APP_NAME_RETRIES; i++) {
		const takenInBatch = Object.values(appNameMap).includes(attempt);
		const takenInDb = takenInBatch
			? false
			: await table?.findFirst({
					where: (
						fields: Record<string, unknown>,
						{ eq }: { eq: (a: unknown, b: unknown) => unknown },
					) => eq(fields.appName, attempt),
				});
		if (!takenInBatch && !takenInDb) {
			return attempt;
		}
		attempt = regenerateAppName(serviceType, oldAppName);
	}
	throw new Error(
		`Could not generate a unique appName for ${serviceType} service after ${MAX_APP_NAME_RETRIES} attempts`,
	);
};

export const buildPlan = async (
	db: TransferDb,
	snapshot: Snapshot,
	organizationId: string,
	target: Target,
	userChoices: BuildPlanUserChoices = {},
): Promise<Plan> => {
	const checkAppName =
		userChoices.checkAppNameAvailable ?? checkAppNameAvailable;

	const proposals = await proposeResolutions(db, snapshot, organizationId);
	const resolutions: Record<string, Resolution> = {};
	for (const requirement of snapshot.requirements) {
		const key = requirementKey(requirement);
		resolutions[key] =
			userChoices.resolutions?.[key] ??
			defaultResolutionFor(key, proposals[key]);
	}

	const serverMap: Record<string, string | null> = {};
	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "server") continue;
		const key = requirementKey(requirement);
		const resolution = resolutions[key];
		const chosen =
			resolution?.action === "reuse" ? (resolution.targetId ?? null) : null;
		const originalKey = requirement.originalId ?? "null";
		serverMap[originalKey] =
			chosen === LOCAL_SERVER_CANDIDATE_ID ? null : chosen;
	}
	for (const serverId of new Set(Object.values(serverMap))) {
		if (!serverId) {
			if (IS_CLOUD) {
				throw new Error(
					"Services must be assigned to a remote server on Dokploy Cloud",
				);
			}
			continue;
		}
		const server = await db.query.server.findFirst({
			where: (fields, { eq }) => eq(fields.serverId, serverId),
			columns: { organizationId: true },
		});
		if (!server || server.organizationId !== organizationId) {
			throw new Error(`Server "${serverId}" not found in this organization`);
		}
	}

	const serviceServerMapForAppNames = buildServiceServerMap(snapshot);
	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "network") continue;
		const key = requirementKey(requirement);
		const resolution = resolutions[key];
		if (
			userChoices.resolutions?.[key] ||
			resolution?.action !== "reuse" ||
			!resolution.targetId
		) {
			continue;
		}
		const targetId = resolution.targetId;
		const existing = await db.query.network.findFirst({
			where: (fields, { eq }) => eq(fields.networkId, targetId),
			columns: { serverId: true },
		});
		if (
			(existing?.serverId ?? null) !==
			networkDestServerId(requirement, serviceServerMapForAppNames, serverMap)
		) {
			resolutions[key] = {
				requirementKey: key,
				action: requirement.configIncluded ? "create" : "skip",
			};
		}
	}

	const appNameMap: Record<string, string> = {};
	for (const service of snapshot.resources.services) {
		const serviceType = service.kind as ServiceType;
		const oldAppName = service.appName as string | undefined;
		if (!oldAppName) continue;
		const originalServerId =
			serviceServerMapForAppNames.get(
				service[SERVICE_ID_FIELD[serviceType]] as string,
			) ?? null;
		const destServerId = serverMap[originalServerId ?? "null"] ?? null;
		let newAppName = regenerateAppName(serviceType, oldAppName);
		if (
			userChoices.keepAppNames &&
			APP_NAME_REGEX.test(oldAppName) &&
			(await checkAppName(oldAppName, destServerId))
		) {
			newAppName = oldAppName;
		} else {
			newAppName = await ensureUniqueAppName(
				db,
				serviceType,
				oldAppName,
				newAppName,
				appNameMap,
			);
		}
		appNameMap[oldAppName] = newAppName;
	}

	const domainStrategy: DomainStrategy = userChoices.domainStrategy ?? {
		custom: "keep",
	};
	const portsStrategy = userChoices.portsStrategy ?? "keep";
	const domainContext: DomainContext = {
		appNameMap,
		serverMap,
		serverIpMap: await buildServerIpMap(db, serverMap, organizationId),
		domainStrategy,
	};
	const domainHosts = collectDomainHosts(snapshot, domainContext);

	const conflicts = await detectConflicts(
		db,
		snapshot,
		organizationId,
		target,
		resolutions,
		domainContext,
	);
	const conflictResolutions = resolveConflicts(
		conflicts,
		userChoices.conflictResolutions,
	);

	const pendingByService = new Map<string, PendingService>();
	const importWarnings: Warning[] = [];
	for (const requirement of snapshot.requirements) {
		const key = requirementKey(requirement);
		if (resolutions[key]?.action !== "skip") continue;

		importWarnings.push({
			code: "MISSING_REQUIREMENT_BLOCKING",
			severity: "blocking",
			message: `${requirementLabel(requirement)} was not resolved; services depending on it will not deploy until this is fixed.`,
			affected: requirement.usedBy,
		});

		for (const used of requirement.usedBy) {
			if (
				used.serviceType === "project" ||
				used.serviceType === "environment"
			) {
				continue;
			}
			const reason = `Missing ${requirementLabel(requirement)}`;
			const existing = pendingByService.get(used.serviceId);
			pendingByService.set(used.serviceId, {
				serviceId: used.serviceId,
				serviceType: used.serviceType,
				reason: existing ? `${existing.reason}; ${reason}` : reason,
			});
		}
	}

	const dumps =
		snapshot.manifest.scope.dumps.mode === "none"
			? 0
			: snapshot.resources.services.filter((service) =>
					DUMPABLE_DB_TYPES.includes(service.kind as ServiceType),
				).length;

	return planSchema.parse({
		target,
		resolutions,
		serverMap,
		appNameMap,
		domainStrategy,
		portsStrategy,
		rotateDatabaseCredentials: userChoices.rotateDatabaseCredentials ?? false,
		deployAfterImport: userChoices.deployAfterImport ?? true,
		conflicts,
		conflictResolutions,
		pendingServices: [...pendingByService.values()],
		warnings: importWarnings,
		validation: [],
		summary: {
			counts: snapshot.manifest.counts,
			domains: domainHosts.size,
			dumps,
		},
	});
};

export type ValidatePlanOptions = {
	checkAppNameAvailable?: CheckAppNameAvailable;
	probeVersion?: RunVersionProbe;
};

const checkConflictRenames = async (
	db: TransferDb,
	snapshot: Snapshot,
	plan: Plan,
	organizationId: string,
): Promise<PlanValidationCheck[]> => {
	const renames = Object.entries(conflictResolutionsOf(plan)).flatMap(
		([key, resolution]) => {
			const [kind, ...rest] = key.split(":");
			return resolution.action === "rename" && resolution.value
				? [{ kind, original: rest.join(":"), value: resolution.value.trim() }]
				: [];
		},
	);
	const checks: PlanValidationCheck[] = [];

	const domainRenames = renames.filter((rename) => rename.kind === "domain");
	if (domainRenames.length > 0) {
		const importedHosts = collectDomainHosts(snapshot, {
			appNameMap: plan.appNameMap,
			serverMap: plan.serverMap,
			serverIpMap: await buildServerIpMap(db, plan.serverMap, organizationId),
			domainStrategy: plan.domainStrategy,
		});
		const existingHosts = new Set(
			(
				await db.query.domains.findMany({
					where: (fields, { inArray }) =>
						inArray(
							fields.host,
							domainRenames.map((rename) => rename.value),
						),
					columns: { host: true },
				})
			).map((row) => row.host),
		);
		for (const rename of domainRenames) {
			const taken =
				existingHosts.has(rename.value) ||
				importedHosts.has(rename.value) ||
				domainRenames.some(
					(other) => other !== rename && other.value === rename.value,
				);
			checks.push({
				check: `rename:domain:${rename.original}`,
				ok: !taken,
				detail: taken ? `${rename.value} is already in use` : undefined,
			});
		}
	}

	const portRenames = renames.filter((rename) => rename.kind === "port");
	if (portRenames.length > 0) {
		const portUsage = [...collectPortUsage(snapshot, plan.serverMap).values()];
		const usedPorts = await findUsedPorts(
			db,
			portRenames.map((rename) => Number(rename.value)),
		);
		for (const rename of portRenames) {
			const port = Number(rename.value);
			const servers = new Set(
				portUsage
					.filter((usage) => String(usage.publishedPort) === rename.original)
					.map((usage) => usage.destServerId),
			);
			const taken =
				usedPorts.some(
					(used) => used.port === port && servers.has(used.serverId),
				) ||
				portUsage.some(
					(usage) =>
						usage.publishedPort === port && servers.has(usage.destServerId),
				) ||
				portRenames.some(
					(other) => other !== rename && Number(other.value) === port,
				);
			checks.push({
				check: `rename:port:${rename.original}`,
				ok: !taken,
				detail: taken ? `Port ${port} is already in use` : undefined,
			});
		}
	}

	return checks;
};

export const validatePlan = async (
	db: TransferDb,
	snapshot: Snapshot,
	plan: Plan,
	organizationId: string,
	opts: ValidatePlanOptions = {},
): Promise<PlanValidationCheck[]> => {
	const checkAppName = opts.checkAppNameAvailable ?? checkAppNameAvailable;
	const checks: PlanValidationCheck[] = [];

	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "server") continue;
		const key = requirementKey(requirement);
		const resolution = plan.resolutions[key];
		const label = `serverResolution:${requirement.originalId ?? "local"}`;
		if (resolution && resolution.action !== "skip") {
			checks.push({
				check: label,
				ok: true,
				detail: `→ ${plan.serverMap[requirement.originalId ?? "null"] ?? "local"}`,
			});
			continue;
		}
		checks.push({
			check: label,
			ok: false,
			detail:
				"Server requirement not resolved; leaving it unresolved would deploy the affected service(s) to the local Dokploy host instead of blocking. Choose a destination server, or explicitly choose 'local'.",
		});
	}
	const distinctServerIds = [...new Set(Object.values(plan.serverMap))];
	const probeServerId = distinctServerIds.find((id) => id !== null) ?? null;
	const requirementByKey = new Map(
		snapshot.requirements.map((r) => [requirementKey(r), r]),
	);
	const serviceServerMap = buildServiceServerMap(snapshot);
	const probeServerIdForRequirement = (key: string): string | null => {
		const requirement = requirementByKey.get(key);
		const serviceId = requirement?.usedBy[0]?.serviceId;
		if (!serviceId) return probeServerId;
		const originalServerId = serviceServerMap.get(serviceId) ?? null;
		return plan.serverMap[originalServerId ?? "null"] ?? probeServerId;
	};

	const destServerIdByNewAppName = new Map<string, string | null>();
	for (const service of snapshot.resources.services) {
		const oldAppName = service.appName as string | undefined;
		if (!oldAppName) continue;
		const newAppName = plan.appNameMap[oldAppName];
		if (!newAppName) continue;
		const serviceId = service[
			SERVICE_ID_FIELD[service.kind as ServiceType]
		] as string;
		const originalServerId = serviceServerMap.get(serviceId) ?? null;
		const destServerId = plan.serverMap[originalServerId ?? "null"] ?? null;
		destServerIdByNewAppName.set(newAppName, destServerId);
	}

	for (const appName of new Set(Object.values(plan.appNameMap))) {
		try {
			const serverId = destServerIdByNewAppName.get(appName) ?? null;
			const available = await checkAppName(appName, serverId);
			checks.push({
				check: `appName:${appName}`,
				ok: available,
				detail: available ? undefined : "Already in use",
			});
		} catch (error) {
			checks.push({
				check: `appName:${appName}`,
				ok: false,
				detail: safeErrorMessage(error),
			});
		}
	}

	const sourceDockerVersions = snapshot.manifest.sourceInstance.dockerVersions;
	for (const serverId of distinctServerIds) {
		try {
			if (serverId) {
				const server = await db.query.server.findFirst({
					where: (fields, { eq }) => eq(fields.serverId, serverId),
					columns: { organizationId: true },
				});
				if (!server || server.organizationId !== organizationId) {
					throw new Error("Not found in this organization");
				}
			}
			const dockerVersion = await probeDockerVersion(
				serverId,
				opts.probeVersion,
			);
			const sourceKeys = Object.entries(plan.serverMap)
				.filter(([, dest]) => dest === serverId)
				.map(([original]) => (original === "null" ? "local" : original));
			const mismatch = sourceKeys
				.map((key) =>
					compareDockerVersions(sourceDockerVersions?.[key], dockerVersion),
				)
				.find(Boolean);
			checks.push({
				check: `server:${serverId ?? "local"}`,
				ok: true,
				detail: mismatch ?? `Docker ${dockerVersion || "unknown"}`,
			});
		} catch (error) {
			checks.push({
				check: `server:${serverId ?? "local"}`,
				ok: false,
				detail: safeErrorMessage(error),
			});
		}
	}

	for (const [key, resolution] of Object.entries(plan.resolutions)) {
		if (resolution.action !== "reuse" || !resolution.targetId) continue;
		const kind = key.split(":")[0];
		try {
			if (kind === "vault") {
				const row = await db.query.vaultProvider.findFirst({
					where: (fields, { eq }) =>
						eq(fields.vaultProviderId, resolution.targetId as string),
				});
				if (!row || row.organizationId !== organizationId) {
					throw new Error("Not found in this organization");
				}
				await testVaultProviderConnection(row.config);
			} else if (kind === "registry") {
				const row = await db.query.registry.findFirst({
					where: (fields, { eq }) =>
						eq(fields.registryId, resolution.targetId as string),
				});
				if (!row || row.organizationId !== organizationId) {
					throw new Error("Not found in this organization");
				}
				await testRegistryConnection({
					registryUrl: row.registryUrl,
					username: row.username,
					password: row.password,
					serverId: probeServerIdForRequirement(key) ?? undefined,
				});
			} else if (kind === "destination") {
				const row = await db.query.destinations.findFirst({
					where: (fields, { eq }) =>
						eq(fields.destinationId, resolution.targetId as string),
				});
				if (!row || row.organizationId !== organizationId) {
					throw new Error("Not found in this organization");
				}
				await testDestinationConnection({
					...row,
					serverId: probeServerIdForRequirement(key) ?? undefined,
				});
			} else if (kind === "network") {
				const row = await db.query.network.findFirst({
					where: (fields, { eq }) =>
						eq(fields.networkId, resolution.targetId as string),
				});
				if (!row || row.organizationId !== organizationId) {
					throw new Error("Not found in this organization");
				}
				const requirement = requirementByKey.get(key);
				if (
					requirement &&
					(row.serverId ?? null) !==
						networkDestServerId(requirement, serviceServerMap, plan.serverMap)
				) {
					throw new Error(
						`Network ${row.name} is on a different server than the services that use it`,
					);
				}
			} else {
				continue;
			}
			checks.push({ check: key, ok: true });
		} catch (error) {
			checks.push({
				check: key,
				ok: false,
				detail: safeErrorMessage(error),
			});
		}
	}

	checks.push(
		...(await checkConflictRenames(db, snapshot, plan, organizationId)),
	);

	return checks;
};

export const assertPlanChecksPass = (checks: PlanValidationCheck[]): void => {
	const failing = checks.filter((check) => !check.ok);
	if (failing.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Plan validation failed: ${failing
				.map((check) => `${check.check}: ${check.detail ?? "failed"}`)
				.join("; ")}`,
		});
	}
};
