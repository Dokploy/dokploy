import type {
	DuplicateTargetServer,
	ServiceType,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { IS_CLOUD } from "../constants";
import { createApplication, findApplicationById } from "./application";
import { createBackup } from "./backup";
import { createCompose, findComposeById } from "./compose";
import { createDomain } from "./domain";
import { createLibsql, findLibsqlById } from "./libsql";
import { createMariadb, findMariadbById } from "./mariadb";
import { createMongo, findMongoById } from "./mongo";
import { createMount } from "./mount";
import { createMysql, findMySqlById } from "./mysql";
import { resolveNetworkIds } from "./network";
import { createPort } from "./port";
import { createPostgres, findPostgresById } from "./postgres";
import { createPreviewDeployment } from "./preview-deployment";
import { createRedirect } from "./redirect";
import { createRedis, findRedisById } from "./redis";
import { createSecurity } from "./security";
import { findServerById, getAccessibleServerIds } from "./server";
import { getWebServerSettings } from "./web-server-settings";

export interface DuplicateServiceInput {
	id: string;
	type: ServiceType;
	environmentId: string;
	targetServer: DuplicateTargetServer;
	renameAsCopy: boolean;
}

type ServiceNetwork = {
	serviceName: string;
	networkIds: string[];
	detachDokployNetwork: boolean;
};

const duplicatePayload = async <
	T extends {
		name: string;
		serverId?: string | null;
		networkIds?: string[] | null;
		serviceNetworks?: ServiceNetwork[] | null;
	},
>(
	source: T,
	appName: string,
	input: DuplicateServiceInput,
) => ({
	...source,
	...(await duplicateServerOverride(input.targetServer, source)),
	appName: appName.substring(0, appName.lastIndexOf("-")),
	name: input.renameAsCopy ? `${source.name} (copy)` : source.name,
	environmentId: input.environmentId,
});

export const assertDuplicateTargetServer = async (
	session: { userId: string; activeOrganizationId: string },
	target: DuplicateTargetServer,
): Promise<void> => {
	if (target.kind === "keep") {
		return;
	}

	if (target.kind === "dokploy") {
		if (IS_CLOUD || (await getWebServerSettings())?.remoteServersOnly) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "The Dokploy server is not available as a target",
			});
		}
		return;
	}

	const accessibleIds = await getAccessibleServerIds(session);
	if (!accessibleIds.has(target.serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}

	const server = await findServerById(target.serverId);
	if (server.serverStatus !== "active" || server.serverType !== "deploy") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The target server is not available for deployments",
		});
	}
};

export const duplicateServerOverride = async (
	target: DuplicateTargetServer,
	source: {
		serverId?: string | null;
		networkIds?: string[] | null;
		serviceNetworks?: ServiceNetwork[] | null;
	},
): Promise<{
	serverId?: string | null;
	networkIds?: string[];
	serviceNetworks?: ServiceNetwork[];
}> => {
	if (target.kind === "keep") {
		return {};
	}

	const serverId = target.kind === "dokploy" ? null : target.serverId;
	if (serverId === (source.serverId ?? null)) {
		return { serverId };
	}
	const serviceNetworks = source.serviceNetworks ?? [];
	const allNetworkIds = [
		...new Set([
			...(source.networkIds ?? []),
			...serviceNetworks.flatMap((entry) => entry.networkIds),
		]),
	];
	if (allNetworkIds.length === 0) {
		return { serverId };
	}

	const kept = new Set((await resolveNetworkIds(allNetworkIds, serverId)).kept);
	return {
		serverId,
		...(source.networkIds && {
			networkIds: source.networkIds.filter((networkId) => kept.has(networkId)),
		}),
		...(source.serviceNetworks && {
			serviceNetworks: serviceNetworks.map((entry) => ({
				...entry,
				networkIds: entry.networkIds.filter((networkId) => kept.has(networkId)),
			})),
		}),
	};
};

export const duplicateService = async (input: DuplicateServiceInput) => {
	switch (input.type) {
		case "application": {
			const {
				applicationId,
				domains,
				security,
				ports,
				registry,
				redirects,
				previewDeployments,
				mounts,
				appName,
				refreshToken,
				...application
			} = await findApplicationById(input.id);

			const newApplication = await createApplication(
				await duplicatePayload(application, appName, input),
			);

			for (const domain of domains) {
				const { domainId, ...rest } = domain;
				await createDomain({
					...rest,
					applicationId: newApplication.applicationId,
					domainType: "application",
				});
			}

			for (const port of ports) {
				const { portId, ...rest } = port;
				await createPort({
					...rest,
					applicationId: newApplication.applicationId,
				});
			}

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newApplication.applicationId,
					serviceType: "application",
				});
			}

			for (const redirect of redirects) {
				const { redirectId, ...rest } = redirect;
				await createRedirect({
					...rest,
					applicationId: newApplication.applicationId,
				});
			}

			for (const secure of security) {
				const { securityId, ...rest } = secure;
				await createSecurity({
					...rest,
					applicationId: newApplication.applicationId,
				});
			}

			for (const previewDeployment of previewDeployments) {
				const { previewDeploymentId, ...rest } = previewDeployment;
				await createPreviewDeployment({
					...rest,
					applicationId: newApplication.applicationId,
					domainId: undefined,
				});
			}

			break;
		}
		case "compose": {
			const { composeId, mounts, domains, appName, refreshToken, ...compose } =
				await findComposeById(input.id);

			const newCompose = await createCompose(
				await duplicatePayload(compose, appName, input),
			);

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newCompose.composeId,
					serviceType: "compose",
				});
			}

			for (const domain of domains) {
				const { domainId, ...rest } = domain;
				await createDomain({
					...rest,
					composeId: newCompose.composeId,
					domainType: "compose",
				});
			}

			break;
		}
		case "libsql": {
			const { libsqlId, mounts, appName, ...libsql } = await findLibsqlById(
				input.id,
			);

			const newLibsql = await createLibsql(
				await duplicatePayload(libsql, appName, input),
			);

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newLibsql.libsqlId,
					serviceType: "libsql",
				});
			}

			break;
		}
		case "mariadb": {
			const { mariadbId, mounts, backups, appName, ...mariadb } =
				await findMariadbById(input.id);

			const newMariadb = await createMariadb(
				await duplicatePayload(mariadb, appName, input),
			);

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newMariadb.mariadbId,
					serviceType: "mariadb",
				});
			}

			for (const backup of backups) {
				const { backupId, appName: _appName, ...rest } = backup;
				await createBackup({
					...rest,
					mariadbId: newMariadb.mariadbId,
				});
			}
			break;
		}
		case "mongo": {
			const { mongoId, mounts, backups, appName, ...mongo } =
				await findMongoById(input.id);

			const newMongo = await createMongo(
				await duplicatePayload(mongo, appName, input),
			);

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newMongo.mongoId,
					serviceType: "mongo",
				});
			}

			for (const backup of backups) {
				const { backupId, appName: _appName, ...rest } = backup;
				await createBackup({
					...rest,
					mongoId: newMongo.mongoId,
				});
			}
			break;
		}
		case "mysql": {
			const { mysqlId, mounts, backups, appName, ...mysql } =
				await findMySqlById(input.id);

			const newMysql = await createMysql(
				await duplicatePayload(mysql, appName, input),
			);

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newMysql.mysqlId,
					serviceType: "mysql",
				});
			}

			for (const backup of backups) {
				const { backupId, appName: _appName, ...rest } = backup;
				await createBackup({
					...rest,
					mysqlId: newMysql.mysqlId,
				});
			}
			break;
		}
		case "postgres": {
			const { postgresId, mounts, backups, appName, ...postgres } =
				await findPostgresById(input.id);

			const newPostgres = await createPostgres(
				await duplicatePayload(postgres, appName, input),
			);

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newPostgres.postgresId,
					serviceType: "postgres",
				});
			}

			for (const backup of backups) {
				const { backupId, ...rest } = backup;
				await createBackup({
					...rest,
					postgresId: newPostgres.postgresId,
				});
			}
			break;
		}
		case "redis": {
			const { redisId, mounts, appName, ...redis } = await findRedisById(
				input.id,
			);

			const newRedis = await createRedis(
				await duplicatePayload(redis, appName, input),
			);

			for (const mount of mounts) {
				const { mountId, ...rest } = mount;
				await createMount({
					...rest,
					serviceId: newRedis.redisId,
					serviceType: "redis",
				});
			}

			break;
		}
	}
};
