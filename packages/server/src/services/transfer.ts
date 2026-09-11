import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiTransferService,
	deployments,
	network,
	type ServiceType,
} from "@dokploy/server/db/schema";
import { removeService } from "@dokploy/server/utils/docker/utils";
import {
	removeDirectoryCode,
	removeMonitoringDirectory,
} from "@dokploy/server/utils/filesystem/directory";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { pipeBetweenServers } from "@dokploy/server/utils/process/remoteStream";
import {
	readConfig,
	readRemoteConfig,
	removeTraefikConfig,
	writeConfig,
	writeConfigRemote,
} from "@dokploy/server/utils/traefik/application";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { removeForwardAuthMiddleware } from "@dokploy/server/utils/traefik/forward-auth";
import {
	deleteAllMiddlewares,
	removePathMiddlewares,
} from "@dokploy/server/utils/traefik/middleware";
import { createRedirectMiddleware } from "@dokploy/server/utils/traefik/redirect";
import { createSecurityMiddleware } from "@dokploy/server/utils/traefik/security";
import { TRPCError } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import {
	deployApplication,
	findApplicationById,
	updateApplication,
	updateApplicationStatus,
} from "./application";
import {
	deployCompose,
	findComposeById,
	removeCompose,
	startCompose,
	stopCompose,
	updateCompose,
} from "./compose";
import { deployLibsql, findLibsqlById, updateLibsqlById } from "./libsql";
import { deployMariadb, findMariadbById, updateMariadbById } from "./mariadb";
import { deployMongo, findMongoById, updateMongoById } from "./mongo";
import { createFileMount } from "./mount";
import { deployMySql, findMySqlById, updateMySqlById } from "./mysql";
import {
	deployPostgres,
	findPostgresById,
	updatePostgresById,
} from "./postgres";
import { deployRedis, findRedisById, updateRedisById } from "./redis";
import { findServerById } from "./server";

export type TransferServiceInput = z.infer<typeof apiTransferService> & {
	organizationId: string;
};

type Logger = (line: string) => void;
type ServiceStatus = "idle" | "running" | "done" | "error";

const findService = async (serviceType: ServiceType, serviceId: string) => {
	switch (serviceType) {
		case "application":
			return await findApplicationById(serviceId);
		case "compose":
			return await findComposeById(serviceId);
		case "postgres":
			return await findPostgresById(serviceId);
		case "mysql":
			return await findMySqlById(serviceId);
		case "mariadb":
			return await findMariadbById(serviceId);
		case "mongo":
			return await findMongoById(serviceId);
		case "redis":
			return await findRedisById(serviceId);
		case "libsql":
			return await findLibsqlById(serviceId);
	}
};

type TransferableService = Awaited<ReturnType<typeof findService>>;
type ApplicationService = Awaited<ReturnType<typeof findApplicationById>>;
type ComposeService = Awaited<ReturnType<typeof findComposeById>>;

const isApplication = (
	service: TransferableService,
): service is ApplicationService => "applicationId" in service;

const isCompose = (service: TransferableService): service is ComposeService =>
	"composeId" in service;

const updateServer = async (
	serviceType: ServiceType,
	serviceId: string,
	data: { serverId: string | null; networkIds?: string[] | null },
) => {
	switch (serviceType) {
		case "application":
			return await updateApplication(serviceId, data);
		case "compose":
			return await updateCompose(serviceId, { serverId: data.serverId });
		case "postgres":
			return await updatePostgresById(serviceId, data);
		case "mysql":
			return await updateMySqlById(serviceId, data);
		case "mariadb":
			return await updateMariadbById(serviceId, data);
		case "mongo":
			return await updateMongoById(serviceId, data);
		case "redis":
			return await updateRedisById(serviceId, data);
		case "libsql":
			return await updateLibsqlById(serviceId, data);
	}
};

const updateStatus = async (
	serviceType: ServiceType,
	serviceId: string,
	status: ServiceStatus,
) => {
	switch (serviceType) {
		case "application":
			return await updateApplicationStatus(serviceId, status);
		case "compose":
			return await updateCompose(serviceId, { composeStatus: status });
		case "postgres":
			return await updatePostgresById(serviceId, {
				applicationStatus: status,
			});
		case "mysql":
			return await updateMySqlById(serviceId, { applicationStatus: status });
		case "mariadb":
			return await updateMariadbById(serviceId, { applicationStatus: status });
		case "mongo":
			return await updateMongoById(serviceId, { applicationStatus: status });
		case "redis":
			return await updateRedisById(serviceId, { applicationStatus: status });
		case "libsql":
			return await updateLibsqlById(serviceId, { applicationStatus: status });
	}
};

const q = (value: string) => quote([value]);

const runOn = (serverId: string | null, command: string) =>
	serverId ? execAsyncRemote(serverId, command) : execAsync(command);

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const directoryExists = async (serverId: string | null, directory: string) => {
	const { stdout } = await runOn(
		serverId,
		`[ -d ${q(directory)} ] && echo yes || echo no`,
	);
	return stdout.trim() === "yes";
};

const formatBytes = (bytes: number) => {
	const mib = bytes / (1024 * 1024);
	if (mib < 1) return `${(bytes / 1024).toFixed(1)} KiB`;
	if (mib < 1024) return `${mib.toFixed(1)} MiB`;
	return `${(mib / 1024).toFixed(2)} GiB`;
};

export const volumeExportCommand = (volume: string) =>
	`docker run --rm -v ${q(volume)}:/data:ro alpine tar -czf - --numeric-owner -C /data .`;

export const volumeImportCommand = (volume: string) =>
	`docker volume create ${q(volume)} >/dev/null && docker run --rm -i -v ${q(volume)}:/data alpine tar -xzf - --numeric-owner -C /data`;

export const directoryExportCommand = (directory: string) =>
	`COPYFILE_DISABLE=1 tar -czf - --numeric-owner -C ${q(directory)} .`;

export const directoryImportCommand = (directory: string) =>
	`mkdir -p ${q(directory)} && tar -xzf - --numeric-owner -C ${q(directory)}`;

const PROGRESS_STEP = 64 * 1024 * 1024;

const copyStream = async (
	label: string,
	source: { serverId: string | null; command: string },
	target: { serverId: string | null; command: string },
	log: Logger,
) => {
	let reported = 0;
	const bytes = await pipeBetweenServers({
		source,
		target,
		onProgress: (transferred) => {
			if (transferred - reported >= PROGRESS_STEP) {
				reported = transferred;
				log(`  ${label}: ${formatBytes(transferred)} transferred`);
			}
		},
	});
	log(`  ${label}: done (${formatBytes(bytes)})`);
};

const listVolumes = async (service: TransferableService) => {
	const names = new Set<string>();
	for (const mount of service.mounts) {
		if (mount.type === "volume" && mount.volumeName) {
			names.add(mount.volumeName);
		}
	}
	if (isCompose(service)) {
		const project = q(service.appName);
		const { stdout } = await runOn(
			service.serverId ?? null,
			`docker volume ls -q --filter label=com.docker.compose.project=${project}; docker volume ls -q --filter label=com.docker.stack.namespace=${project}`,
		);
		for (const line of stdout.split("\n")) {
			const name = line.trim();
			if (name) names.add(name);
		}
	}
	return [...names];
};

const listBindMounts = (service: TransferableService) => [
	...new Set(
		service.mounts
			.filter((mount) => mount.type === "bind" && mount.hostPath)
			.map((mount) => mount.hostPath as string),
	),
];

const stopOnSource = async (service: TransferableService, log: Logger) => {
	if (isCompose(service)) {
		try {
			await stopCompose(service.composeId);
		} catch (error) {
			log(`  Could not stop compose: ${errorMessage(error)}`);
		}
		return;
	}
	await runOn(
		service.serverId ?? null,
		`docker service scale ${q(service.appName)}=0 >/dev/null 2>&1 || true`,
	);
};

const startOnSource = async (service: TransferableService, log: Logger) => {
	if (isCompose(service)) {
		if (service.composeType === "stack") {
			log(
				"  Stack was removed on the source server, run Deploy to bring it back",
			);
			return;
		}
		try {
			await startCompose(service.composeId);
		} catch (error) {
			log(`  Could not start compose: ${errorMessage(error)}`);
		}
		return;
	}
	const replicas = isApplication(service) ? service.replicas : 1;
	await runOn(
		service.serverId ?? null,
		`docker service scale ${q(service.appName)}=${replicas} >/dev/null 2>&1 || true`,
	);
};

const resolveNetworkIds = async (
	networkIds: string[] | null | undefined,
	targetServerId: string | null,
) => {
	if (!networkIds || networkIds.length === 0) {
		return { kept: [] as string[], dropped: [] as string[] };
	}
	const rows = await db.query.network.findMany({
		where: inArray(network.networkId, networkIds),
		columns: { networkId: true, name: true, serverId: true },
	});
	return {
		kept: rows
			.filter((row) => (row.serverId ?? null) === targetServerId)
			.map((row) => row.networkId),
		dropped: rows
			.filter((row) => (row.serverId ?? null) !== targetServerId)
			.map((row) => row.name),
	};
};

const moveTraefikConfig = async (
	source: ApplicationService,
	moved: ApplicationService,
	log: Logger,
) => {
	const config = source.serverId
		? await readRemoteConfig(source.serverId, source.appName)
		: readConfig(source.appName);
	if (config) {
		if (moved.serverId) {
			await writeConfigRemote(moved.serverId, moved.appName, config);
		} else {
			writeConfig(moved.appName, config);
		}
	}
	for (const domain of moved.domains) {
		await manageDomain(moved, domain);
	}
	for (const security of moved.security) {
		await createSecurityMiddleware(moved, security);
	}
	for (const redirect of moved.redirects) {
		await createRedirectMiddleware(moved, redirect);
	}
	log(`  Traefik configuration recreated (${moved.domains.length} domains)`);
};

const removeSourceTraefikConfig = async (source: ApplicationService) => {
	for (const domain of source.domains) {
		await removePathMiddlewares(source, domain.uniqueConfigKey);
		await removeForwardAuthMiddleware(source, domain.uniqueConfigKey);
	}
	await deleteAllMiddlewares(source);
	await removeTraefikConfig(source.appName, source.serverId);
};

const moveDeploymentLogs = async (
	service: ApplicationService | ComposeService,
	targetServerId: string | null,
	log: Logger,
) => {
	const sourceServerId = service.serverId ?? null;
	const from = path.join(paths(!!sourceServerId).LOGS_PATH, service.appName);
	const to = path.join(paths(!!targetServerId).LOGS_PATH, service.appName);
	if (!(await directoryExists(sourceServerId, from))) return;

	log("Copying deployment logs");
	await copyStream(
		"deployment logs",
		{ serverId: sourceServerId, command: directoryExportCommand(from) },
		{ serverId: targetServerId, command: directoryImportCommand(to) },
		log,
	);
	if (from !== to) {
		await db
			.update(deployments)
			.set({ logPath: sql`replace(${deployments.logPath}, ${from}, ${to})` })
			.where(
				isCompose(service)
					? eq(deployments.composeId, service.composeId)
					: eq(deployments.applicationId, service.applicationId),
			);
	}
	await runOn(sourceServerId, `rm -rf ${q(from)}`);
};

const cleanupSource = async (
	service: TransferableService,
	volumes: string[],
	removeSourceData: boolean,
	log: Logger,
) => {
	const serverId = service.serverId ?? null;
	const steps: Array<() => Promise<unknown>> = [];

	if (isApplication(service)) {
		steps.push(
			() => removeSourceTraefikConfig(service),
			() => removeService(service.appName, serverId),
			() => removeDirectoryCode(service.appName, serverId),
			() => removeMonitoringDirectory(service.appName, serverId),
		);
	} else if (isCompose(service)) {
		steps.push(() => removeCompose(service, removeSourceData));
	} else {
		steps.push(
			() => removeService(service.appName, serverId),
			() => removeDirectoryCode(service.appName, serverId),
		);
	}
	if (removeSourceData && volumes.length > 0) {
		steps.push(() =>
			runOn(
				serverId,
				`docker volume rm ${volumes.map(q).join(" ")} >/dev/null 2>&1 || true`,
			),
		);
	}

	for (const step of steps) {
		try {
			await step();
		} catch (error) {
			log(`  Warning: ${errorMessage(error)}`);
		}
	}
	if (!removeSourceData && volumes.length > 0) {
		log(`  Volumes kept on the source server: ${volumes.join(", ")}`);
	}
};

const deployOnTarget = async (
	serviceType: ServiceType,
	serviceId: string,
	targetName: string,
	log: Logger,
) => {
	log(`Deploying on ${targetName}`);
	const deployment = {
		titleLog: "Deploy after transfer",
		descriptionLog: `Transferred to ${targetName}`,
	};
	switch (serviceType) {
		case "application":
			log("Follow the Deployments tab for the build log");
			await updateStatus(serviceType, serviceId, "running");
			return await deployApplication({
				applicationId: serviceId,
				...deployment,
			});
		case "compose":
			log("Follow the Deployments tab for the build log");
			await updateStatus(serviceType, serviceId, "running");
			return await deployCompose({ composeId: serviceId, ...deployment });
		case "postgres":
			return await deployPostgres(serviceId, log);
		case "mysql":
			return await deployMySql(serviceId, log);
		case "mariadb":
			return await deployMariadb(serviceId, log);
		case "mongo":
			return await deployMongo(serviceId, log);
		case "redis":
			return await deployRedis(serviceId, log);
		case "libsql":
			return await deployLibsql(serviceId, log);
	}
};

export const transferService = async (
	input: TransferServiceInput,
	log: Logger,
) => {
	const { serviceType, serviceId, targetServerId, removeSourceData } = input;
	const service = await findService(serviceType, serviceId);

	if (service.environment.project.organizationId !== input.organizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to transfer this service",
		});
	}
	const sourceServerId = service.serverId ?? null;
	if (sourceServerId === targetServerId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The service is already on the selected server",
		});
	}
	const targetServer = targetServerId
		? await findServerById(targetServerId)
		: null;
	if (targetServer) {
		if (targetServer.organizationId !== input.organizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to use the target server",
			});
		}
		if (
			targetServer.serverStatus !== "active" ||
			targetServer.serverType !== "deploy"
		) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "The target server is not available for deployments",
			});
		}
	}

	const sourceName = service.server?.name ?? "Dokploy Server";
	const targetName = targetServer?.name ?? "Dokploy Server";
	const originalNetworkIds =
		"networkIds" in service ? service.networkIds : undefined;
	let switched = false;

	log(`Transferring ${service.appName} from ${sourceName} to ${targetName}`);
	try {
		log(`Stopping service on ${sourceName}`);
		await stopOnSource(service, log);
		await updateStatus(serviceType, serviceId, "running");

		const volumes = await listVolumes(service);
		const bindMounts = listBindMounts(service);
		log(
			`Found ${volumes.length} volume(s) and ${bindMounts.length} bind mount(s)`,
		);
		for (const volume of volumes) {
			log(`Copying volume ${volume}`);
			await copyStream(
				volume,
				{ serverId: sourceServerId, command: volumeExportCommand(volume) },
				{ serverId: targetServerId, command: volumeImportCommand(volume) },
				log,
			);
		}
		for (const hostPath of bindMounts) {
			if (!(await directoryExists(sourceServerId, hostPath))) {
				log(`Skipping bind mount ${hostPath}: not found on ${sourceName}`);
				continue;
			}
			log(`Copying bind mount ${hostPath}`);
			await copyStream(
				hostPath,
				{
					serverId: sourceServerId,
					command: directoryExportCommand(hostPath),
				},
				{
					serverId: targetServerId,
					command: directoryImportCommand(hostPath),
				},
				log,
			);
		}

		const networks = await resolveNetworkIds(
			originalNetworkIds,
			targetServerId,
		);
		if (networks.dropped.length > 0) {
			log(
				`Detaching networks not available on ${targetName}: ${networks.dropped.join(", ")}`,
			);
		}
		await updateServer(serviceType, serviceId, {
			serverId: targetServerId,
			networkIds: originalNetworkIds === undefined ? undefined : networks.kept,
		});
		switched = true;
		const moved = await findService(serviceType, serviceId);

		const fileMounts = moved.mounts.filter((mount) => mount.type === "file");
		if (fileMounts.length > 0) {
			log(`Recreating ${fileMounts.length} file mount(s) on ${targetName}`);
			for (const mount of fileMounts) {
				await createFileMount(mount.mountId);
			}
		}
		if (isApplication(service) && isApplication(moved)) {
			log(`Recreating Traefik configuration on ${targetName}`);
			await moveTraefikConfig(service, moved, log);
		}
		if (isApplication(service) || isCompose(service)) {
			await moveDeploymentLogs(service, targetServerId, log);
		}

		log(`Cleaning up ${sourceName}`);
		await cleanupSource(service, volumes, removeSourceData, log);
		await updateStatus(serviceType, serviceId, "idle");
	} catch (error) {
		if (switched) {
			await updateServer(serviceType, serviceId, {
				serverId: sourceServerId,
				networkIds: originalNetworkIds,
			});
		}
		log(`Data already copied to ${targetName} was left in place`);
		log(`Restoring service on ${sourceName}`);
		await startOnSource(service, log);
		await updateStatus(serviceType, serviceId, "error");
		throw error;
	}

	try {
		await deployOnTarget(serviceType, serviceId, targetName, log);
	} catch (error) {
		await updateStatus(serviceType, serviceId, "error");
		log(
			`Data was transferred but the deployment on ${targetName} failed, run Deploy to retry`,
		);
		throw error;
	}

	return {
		serviceType,
		serviceId,
		appName: service.appName,
		targetServerId,
		targetName,
	};
};
