import { isIP } from "node:net";
import * as path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { applications, compose } from "@dokploy/server/db/schema";
import { assertCertificatePathAvailableForServer } from "@dokploy/server/services/certificate";
import { getCaddyCompileSettings } from "@dokploy/server/services/web-server-settings";
import { createCaddyComposeRouteFragment } from "@dokploy/server/utils/caddy/compose";
import {
	compileCaddyConfig,
	parseCaddyUpstream,
	readCaddyRouteFragments,
} from "@dokploy/server/utils/caddy/config";
import {
	createCaddyApplicationRouteFragment,
	getUnsupportedCaddyDomainFieldMessages,
} from "@dokploy/server/utils/caddy/domain";
import type { CaddyRouteFragment } from "@dokploy/server/utils/caddy/types";
import {
	DOKPLOY_CADDY_NETWORK,
	getCaddyComposeNetworkAlias,
	getCaddyComposeRuntimeTarget,
} from "@dokploy/server/utils/caddy/upstream-targets";
import {
	loadDockerCompose,
	loadDockerComposeRemote,
} from "@dokploy/server/utils/docker/domain";
import type {
	ComposeSpecification,
	ListOrDict,
} from "@dokploy/server/utils/docker/types";
import { getComposeContainer } from "@dokploy/server/utils/docker/utils";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import type {
	FileConfig,
	HttpMiddleware,
} from "@dokploy/server/utils/traefik/file-types";
import { eq, isNull } from "drizzle-orm";
import { parse } from "yaml";
import { translateTraefikComposeLabelsToCaddyFragment } from "./compose-label-translator";
import { translateTraefikDynamicConfigToCaddyFragment } from "./dynamic-file-translator";
import {
	createCaddyMigrationId,
	ensureMigrationDirectory,
	getCaddyMigrationArtifactPaths,
	listMigrationFiles,
	readMigrationTextFileIfExists,
	writeCaddyMigrationReport,
	writeMigrationTextFile,
} from "./files";
import type { CaddyMigrationReport, CaddyMigrationWarning } from "./types";

const CADDY_FRAGMENT_VERSION = 1;

const warning = (
	message: string,
	options: Partial<CaddyMigrationWarning> = {},
): CaddyMigrationWarning => ({
	code: options.code ?? "missing-input",
	message,
	blocking: options.blocking ?? false,
	source: options.source,
	routerName: options.routerName,
	serviceName: options.serviceName,
	middlewareName: options.middlewareName,
	label: options.label,
});

const safeFragmentIdPart = (value: string) =>
	value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "source";

const addFragment = (
	fragments: CaddyRouteFragment[],
	fragment: CaddyRouteFragment,
) => {
	if (!fragment.routes.length) return;
	const existing = new Set(fragments.map((item) => item.id));
	let nextFragment = fragment;
	let index = 2;
	while (existing.has(nextFragment.id)) {
		nextFragment = { ...fragment, id: `${fragment.id}.${index}` };
		index++;
	}
	fragments.push(nextFragment);
};

const labelsToStrings = (labels: ListOrDict | undefined) => {
	if (!labels) return [];
	if (Array.isArray(labels)) return labels.map(String);
	return Object.entries(labels).map(([key, value]) =>
		value === null ? key : `${key}=${value}`,
	);
};

const labelsHaveTraefikHttp = (labels: ListOrDict | undefined) =>
	labelsToStrings(labels).some((label) => label.startsWith("traefik.http."));

const isSecurityMiddlewareWarning = (item: CaddyMigrationWarning) =>
	item.code === "unsupported-security-middleware";

const hasTraefikHttpLabelMap = (labels: Record<string, string> | undefined) =>
	labels
		? Object.keys(labels).some((label) => label.startsWith("traefik.http."))
		: false;

const getTraefikNetworkLabel = (labels: Record<string, string> | undefined) =>
	labels?.["traefik.swarm.network"] ??
	labels?.["traefik.docker.network"] ??
	DOKPLOY_CADDY_NETWORK;

const splitDialHost = (dial: string) => {
	const index = dial.lastIndexOf(":");
	return index === -1 ? dial : dial.slice(0, index);
};

const isDockerLocalHost = (host: string) => !isIP(host) && !host.includes(".");

const getRunningTaskCounts = (tasks: any[]) => {
	const counts = new Map<string, number>();
	for (const task of tasks) {
		const serviceId = task.ServiceID;
		if (
			typeof serviceId !== "string" ||
			task.DesiredState !== "running" ||
			task.Status?.State !== "running"
		) {
			continue;
		}
		counts.set(serviceId, (counts.get(serviceId) ?? 0) + 1);
	}
	return counts;
};

const getRunningServiceTasks = (
	service: any,
	runningTaskCounts?: Map<string, number>,
) => {
	if (runningTaskCounts && typeof service.ID === "string") {
		return runningTaskCounts.get(service.ID) ?? 0;
	}
	const runningTasks = service.ServiceStatus?.RunningTasks;
	if (typeof runningTasks === "number") return runningTasks;
	const replicas = service.Spec?.Mode?.Replicated?.Replicas;
	return typeof replicas === "number" ? replicas : 1;
};

const getPrimaryContainerName = (container: any) => {
	const names = Array.isArray(container.Names) ? container.Names : [];
	return names[0]?.replace(/^\//, "") ?? container.Names?.[0] ?? null;
};

const addContainerNetworkAliases = (hosts: Set<string>, container: any) => {
	const networks = container.NetworkSettings?.Networks ?? {};
	for (const network of Object.values(networks) as any[]) {
		for (const alias of network?.Aliases ?? []) {
			if (
				typeof alias === "string" &&
				alias &&
				!/^[a-f0-9]{12,64}$/.test(alias)
			) {
				hosts.add(alias);
			}
		}
	}
};

const inspectContainer = async (docker: any, container: any) => {
	const containerId = container.Id ?? container.ID;
	if (typeof containerId !== "string" || !containerId) return null;
	if (typeof docker.getContainer !== "function") return null;
	try {
		return await docker.getContainer(containerId).inspect();
	} catch {
		return null;
	}
};

const getLiveDockerTraefikFragments = async (
	serverId: string | undefined,
	fileMiddlewares: Record<string, HttpMiddleware>,
) => {
	const docker = await getRemoteDocker(serverId);
	const hosts = new Set<string>();
	const fragments: CaddyRouteFragment[] = [];
	const warnings: CaddyMigrationWarning[] = [];

	const [services, containers, tasks] = await Promise.all([
		docker.listServices().catch(() => []),
		docker.listContainers().catch(() => []),
		typeof docker.listTasks === "function"
			? docker.listTasks().catch(() => null)
			: Promise.resolve(null),
	]);
	const runningTaskCounts = Array.isArray(tasks)
		? getRunningTaskCounts(tasks)
		: undefined;

	for (const service of services as any[]) {
		const serviceName = service.Spec?.Name;
		if (typeof serviceName !== "string" || !serviceName) continue;
		if (getRunningServiceTasks(service, runningTaskCounts) <= 0) continue;
		hosts.add(serviceName);
		hosts.add(`tasks.${serviceName}`);
		const labels = service.Spec?.Labels as Record<string, string> | undefined;
		if (!hasTraefikHttpLabelMap(labels)) continue;
		const translated = translateTraefikComposeLabelsToCaddyFragment(labels, {
			sourceFile: `docker-service/${serviceName}`,
			appName: serviceName,
			serviceName,
			upstreamServiceName: serviceName,
			upstreamNetwork: getTraefikNetworkLabel(labels),
			composeType: "stack",
			fileMiddlewares,
		});
		warnings.push(...translated.warnings.filter(isSecurityMiddlewareWarning));
		addFragment(fragments, {
			...translated.fragment,
			id: `migration.traefik-docker-label.service.${safeFragmentIdPart(
				serviceName,
			)}`,
		});
	}

	for (const container of containers as any[]) {
		const containerName = getPrimaryContainerName(container);
		if (!containerName) continue;
		hosts.add(containerName);
		for (const name of container.Names ?? []) {
			if (typeof name === "string") hosts.add(name.replace(/^\//, ""));
		}
		addContainerNetworkAliases(hosts, container);
		const inspectedContainer = await inspectContainer(docker, container);
		if (inspectedContainer) {
			addContainerNetworkAliases(hosts, inspectedContainer);
		}
		const labels = container.Labels as Record<string, string> | undefined;
		if (
			!hasTraefikHttpLabelMap(labels) ||
			labels?.["com.docker.swarm.service.name"]
		) {
			continue;
		}
		const translated = translateTraefikComposeLabelsToCaddyFragment(labels, {
			sourceFile: `docker-container/${containerName}`,
			appName: containerName,
			serviceName: containerName,
			upstreamServiceName: containerName,
			upstreamNetwork: getTraefikNetworkLabel(labels),
			fileMiddlewares,
		});
		warnings.push(...translated.warnings.filter(isSecurityMiddlewareWarning));
		addFragment(fragments, {
			...translated.fragment,
			id: `migration.traefik-docker-label.container.${safeFragmentIdPart(
				containerName,
			)}`,
		});
	}

	return {
		fragments,
		warnings,
		hosts,
		canPrune:
			hosts.has("dokploy") ||
			hosts.has("dokploy-traefik") ||
			fragments.length > 0,
	};
};

const getLocalOrRemoteComposeSpec = async (
	composeEntity: typeof compose.$inferSelect,
) => {
	const loaded = composeEntity.serverId
		? await loadDockerComposeRemote(composeEntity)
		: await loadDockerCompose(composeEntity);
	if (loaded) return loaded;
	if (composeEntity.composeFile?.trim()) {
		return parse(composeEntity.composeFile, {
			maxAliasCount: 10000,
		}) as ComposeSpecification;
	}
	return null;
};

const resolveFinalComposeServiceName = (
	composeEntity: typeof compose.$inferSelect,
	composeSpec: ComposeSpecification | null,
	serviceName: string,
) => {
	if (!composeSpec?.services) {
		return composeEntity.randomize || composeEntity.isolatedDeployment
			? null
			: serviceName;
	}
	if (composeSpec.services[serviceName]) {
		return serviceName;
	}
	const suffix = composeEntity.randomize
		? composeEntity.suffix
		: composeEntity.isolatedDeployment
			? composeEntity.suffix || composeEntity.appName
			: null;
	if (suffix && composeSpec.services[`${serviceName}-${suffix}`]) {
		return `${serviceName}-${suffix}`;
	}
	return null;
};

const getServiceNetworkAliases = (
	composeSpec: ComposeSpecification | null,
	serviceName: string,
	network: string,
) => {
	const networks = composeSpec?.services?.[serviceName]?.networks;
	if (!networks || Array.isArray(networks)) return [];
	const attachment = networks[network];
	return attachment?.aliases ?? [];
};

const getComposeServiceContainerName = async (
	composeEntity: typeof compose.$inferSelect,
	finalServiceName: string,
) => {
	try {
		const container = await getComposeContainer(
			composeEntity as never,
			finalServiceName,
		);
		return container?.Names?.[0]?.replace(/^\//, "") ?? null;
	} catch {
		return null;
	}
};

const resolveMigrationComposeUpstreamTarget = async (
	composeEntity: typeof compose.$inferSelect,
	composeSpec: ComposeSpecification | null,
	finalServiceName: string,
) => {
	const runtimeTarget = getCaddyComposeRuntimeTarget(
		composeEntity,
		finalServiceName,
	);

	if (
		composeEntity.composeType === "stack" ||
		composeEntity.isolatedDeployment
	) {
		return runtimeTarget;
	}

	const expectedAlias = getCaddyComposeNetworkAlias(
		composeEntity.appName,
		finalServiceName,
	);
	if (
		getServiceNetworkAliases(
			composeSpec,
			finalServiceName,
			DOKPLOY_CADDY_NETWORK,
		).includes(expectedAlias)
	) {
		return runtimeTarget;
	}

	const containerName =
		composeSpec?.services?.[finalServiceName]?.container_name;
	if (typeof containerName === "string" && containerName.trim()) {
		return {
			host: containerName.trim(),
			network: DOKPLOY_CADDY_NETWORK,
		};
	}

	const runningContainerName = await getComposeServiceContainerName(
		composeEntity,
		finalServiceName,
	);
	if (runningContainerName) {
		return {
			host: runningContainerName,
			network: DOKPLOY_CADDY_NETWORK,
		};
	}

	return runtimeTarget;
};

const routeCoverageKey = (route: CaddyRouteFragment["routes"][number]) =>
	route.hosts
		.map((host) =>
			[
				host,
				route.pathPrefix ?? "",
				route.pathExact ?? "",
				route.https ? "https" : "http",
			].join("\0"),
		)
		.sort();

type MigrationRoute = CaddyRouteFragment["routes"][number];

const pathMatchesOverlap = (
	left: Pick<MigrationRoute, "pathExact" | "pathPrefix">,
	right: Pick<MigrationRoute, "pathExact" | "pathPrefix">,
) => {
	const leftExact = left.pathExact ?? null;
	const rightExact = right.pathExact ?? null;
	const leftPrefix = left.pathPrefix ?? null;
	const rightPrefix = right.pathPrefix ?? null;

	if (!leftExact && !leftPrefix) return true;
	if (!rightExact && !rightPrefix) return true;
	if (leftExact && rightExact) return leftExact === rightExact;
	if (leftExact && rightPrefix) return leftExact.startsWith(rightPrefix);
	if (leftPrefix && rightExact) return rightExact.startsWith(leftPrefix);
	if (leftPrefix && rightPrefix) {
		return (
			leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix)
		);
	}
	return false;
};

const routesOverlap = (left: MigrationRoute, right: MigrationRoute) => {
	if (left.https !== right.https) return false;
	if (!left.hosts.some((host) => right.hosts.includes(host))) return false;
	return pathMatchesOverlap(left, right);
};

const warnOnManualFragmentConflicts = (
	fragments: CaddyRouteFragment[],
	warnings: CaddyMigrationWarning[],
) => {
	const manualFragments = fragments.filter(
		(fragment) => fragment.source === "manual",
	);
	const generatedFragments = fragments.filter(
		(fragment) => fragment.source !== "manual",
	);
	const seen = new Set<string>();

	for (const manualFragment of manualFragments) {
		for (const manualRoute of manualFragment.routes) {
			for (const generatedFragment of generatedFragments) {
				for (const generatedRoute of generatedFragment.routes) {
					if (!routesOverlap(manualRoute, generatedRoute)) continue;
					const key = [
						manualFragment.id,
						manualRoute.id,
						generatedFragment.id,
						generatedRoute.id,
					].join("\0");
					if (seen.has(key)) continue;
					seen.add(key);
					warnings.push(
						warning(
							`Manual Caddy route "${manualRoute.id}" overlaps generated migration route "${generatedRoute.id}" for at least one host/path`,
							{
								code: "conflicting-manual-fragment",
								source: manualFragment.id,
								blocking: true,
							},
						),
					);
				}
			}
		}
	}
};

const hasAvailableUploadedCertificate = async (
	certificatePath: string,
	serverId: string | null | undefined,
	organizationId?: string | null,
) => {
	try {
		await assertCertificatePathAvailableForServer(
			certificatePath,
			serverId,
			organizationId,
		);
		return true;
	} catch {
		return false;
	}
};

const warnIfCustomCertificateMissing = async (
	domain: {
		host: string;
		https: boolean;
		certificateType: string;
		customCertResolver?: string | null;
	},
	source: string,
	serverId: string | null | undefined,
	warnings: CaddyMigrationWarning[],
	serviceName?: string | null,
	organizationId?: string | null,
) => {
	if (
		!domain.https ||
		domain.certificateType !== "custom" ||
		!domain.customCertResolver
	) {
		return false;
	}
	if (
		await hasAvailableUploadedCertificate(
			domain.customCertResolver,
			serverId,
			organizationId,
		)
	) {
		return false;
	}

	warnings.push(
		warning(
			`Domain "${domain.host}" references custom certificate "${domain.customCertResolver}" that is not an uploaded certificate with readable files for this server and organization`,
			{
				blocking: true,
				code: "missing-certificate",
				source,
				serviceName: serviceName ?? undefined,
			},
		),
	);
	return true;
};

const reconcileDbFallbackRoutes = (
	fragments: CaddyRouteFragment[],
	warnings: CaddyMigrationWarning[],
) => {
	const migratedCoverage = new Set<string>();
	for (const fragment of fragments) {
		if (
			fragment.source !== "traefik-compose-label" &&
			fragment.source !== "traefik-dynamic-file"
		) {
			continue;
		}
		for (const route of fragment.routes) {
			if (route.redirectScheme || !route.upstreams.length) continue;
			for (const key of routeCoverageKey(route)) {
				migratedCoverage.add(key);
			}
		}
	}

	const reconciled: CaddyRouteFragment[] = [];
	for (const fragment of fragments) {
		if (
			fragment.source !== "dokploy-compose" &&
			fragment.source !== "dokploy-application"
		) {
			reconciled.push(fragment);
			continue;
		}

		const nextRoutes = fragment.routes.filter((route) => {
			const shadowed = routeCoverageKey(route).some((key) =>
				migratedCoverage.has(key),
			);
			if (shadowed) {
				warnings.push(
					warning(
						`Dropped DB fallback route "${route.id}" because a migrated Traefik route covers the same host/path`,
						{
							code: "shadowed-route",
							source: fragment.id,
							blocking: false,
						},
					),
				);
			}
			return !shadowed;
		});

		if (nextRoutes.length) {
			reconciled.push({ ...fragment, routes: nextRoutes });
		}
	}

	return reconciled;
};

const pruneUnreachableDockerUpstreams = (
	fragments: CaddyRouteFragment[],
	warnings: CaddyMigrationWarning[],
	reachableDockerHosts: Set<string>,
) => {
	const reconciled: CaddyRouteFragment[] = [];
	for (const fragment of fragments) {
		const nextRoutes: CaddyRouteFragment["routes"] = [];
		for (const route of fragment.routes) {
			if (route.redirectScheme || !route.upstreams.length) {
				nextRoutes.push(route);
				continue;
			}
			const upstreams = route.upstreams.filter((upstream) => {
				let host = "";
				try {
					host = splitDialHost(parseCaddyUpstream(upstream).dial);
				} catch {
					return true;
				}
				if (!isDockerLocalHost(host) || reachableDockerHosts.has(host)) {
					return true;
				}
				warnings.push(
					warning(
						`Route "${route.id}" upstream "${upstream}" did not match a running Docker service, container, or network alias for "${host}"`,
						{
							code: "unreachable-upstream",
							source: fragment.id,
							blocking: true,
						},
					),
				);
				return true;
			});
			if (upstreams.length) {
				nextRoutes.push({ ...route, upstreams });
			}
		}
		if (nextRoutes.length) {
			reconciled.push({ ...fragment, routes: nextRoutes });
		}
	}
	return reconciled;
};

const readTraefikStaticConfig = async (serverId?: string) => {
	const configPath = path.posix.join(
		paths(!!serverId).MAIN_TRAEFIK_PATH,
		"traefik.yml",
	);
	const content = await readMigrationTextFileIfExists(configPath, serverId);
	return { path: configPath, content };
};

const renderReportMarkdown = (report: CaddyMigrationReport) => {
	const blocking = report.warnings.filter((item) => item.blocking);
	return [
		`# Caddy Migration ${report.migrationId}`,
		"",
		`Status: **${report.status}**`,
		`Server: ${report.serverId ?? "local"}`,
		`Created: ${report.createdAt}`,
		"",
		"## Summary",
		`- Fragments: ${report.summary.fragments}`,
		`- Routes: ${report.summary.routes}`,
		`- Warnings: ${report.summary.warnings}`,
		`- Blocking warnings: ${report.summary.blockingWarnings}`,
		`- Validation: ${report.validation.status}${report.validation.message ? ` (${report.validation.message})` : ""}`,
		"",
		"## Inputs",
		`- Traefik static config: ${report.inputs.traefikStaticConfigFound ? report.inputs.traefikStaticConfigPath : "not found"}`,
		`- Dynamic files: ${report.inputs.dynamicFiles.length}`,
		`- DB application domains: ${report.inputs.dbApplicationDomains}`,
		`- DB compose domains: ${report.inputs.dbComposeDomains}`,
		`- Compose files scanned: ${report.inputs.composeFilesScanned.length}`,
		`- Compose files skipped: ${report.inputs.composeFilesSkipped.length}`,
		"",
		"## Blocking warnings",
		blocking.length
			? blocking
					.map(
						(item) =>
							`- [${item.code}] ${item.message}${item.source ? ` (${item.source})` : ""}`,
					)
					.join("\n")
			: "None",
		"",
		"## All warnings",
		report.warnings.length
			? report.warnings
					.map(
						(item) =>
							`- ${item.blocking ? "BLOCKING" : "info"} [${item.code}] ${item.message}${item.source ? ` (${item.source})` : ""}`,
					)
					.join("\n")
			: "None",
		"",
	].join("\n");
};

export const prepareCaddyMigration = async (
	input: { serverId?: string } = {},
) => {
	const serverId = input.serverId;
	const migrationId = createCaddyMigrationId();
	const artifactPaths = getCaddyMigrationArtifactPaths(migrationId, serverId);
	await ensureMigrationDirectory(artifactPaths.fragmentsDir, serverId);
	await ensureMigrationDirectory(artifactPaths.backupsDir, serverId);

	const createdAt = new Date().toISOString();
	let fragments: CaddyRouteFragment[] = [];
	const warnings: CaddyMigrationWarning[] = [];
	const composeFilesScanned: string[] = [];
	const composeFilesSkipped: Array<{ path: string; reason: string }> = [];
	const fileMiddlewares: Record<string, HttpMiddleware> = {};
	let reachableDockerHosts = new Set<string>();
	let canPruneUnreachableDockerUpstreams = false;

	try {
		const existingManualFragments = (
			await readCaddyRouteFragments({ serverId })
		).filter((fragment) => fragment.source === "manual");
		for (const fragment of existingManualFragments) {
			addFragment(fragments, fragment);
		}
	} catch (error) {
		warnings.push(
			warning(
				`Unable to read existing manual Caddy fragments: ${
					error instanceof Error ? error.message : "unknown error"
				}`,
				{
					code: "missing-input",
					blocking: false,
				},
			),
		);
	}

	const staticConfig = await readTraefikStaticConfig(serverId);
	const dynamicFileContents: Array<{
		file: string;
		content: string;
		config?: FileConfig;
	}> = [];
	if (!staticConfig.content) {
		warnings.push(
			warning("Traefik static config was not found", {
				source: staticConfig.path,
			}),
		);
	}

	const dynamicFiles = await listMigrationFiles(
		paths(!!serverId).DYNAMIC_TRAEFIK_PATH,
		serverId,
		[".yml", ".yaml"],
	);
	for (const dynamicFile of dynamicFiles) {
		const content = await readMigrationTextFileIfExists(dynamicFile, serverId);
		if (!content) continue;
		try {
			const config = parse(content) as FileConfig;
			Object.assign(fileMiddlewares, config.http?.middlewares ?? {});
			dynamicFileContents.push({ file: dynamicFile, content, config });
		} catch {
			dynamicFileContents.push({ file: dynamicFile, content });
		}
	}
	for (const dynamicFile of dynamicFileContents) {
		const translated = translateTraefikDynamicConfigToCaddyFragment(
			dynamicFile.config ?? dynamicFile.content,
			{
				sourceFile: path.posix.basename(dynamicFile.file),
				fileMiddlewares,
			},
		);
		warnings.push(...translated.warnings);
		addFragment(fragments, translated.fragment);
	}
	try {
		const liveDockerLabels = await getLiveDockerTraefikFragments(
			serverId,
			fileMiddlewares,
		);
		reachableDockerHosts = liveDockerLabels.hosts;
		canPruneUnreachableDockerUpstreams = liveDockerLabels.canPrune;
		warnings.push(...liveDockerLabels.warnings);
		for (const fragment of liveDockerLabels.fragments) {
			addFragment(fragments, fragment);
		}
	} catch (error) {
		warnings.push(
			warning(
				`Unable to inspect live Docker Traefik labels: ${
					error instanceof Error ? error.message : "unknown error"
				}`,
				{
					code: "missing-input",
					blocking: false,
				},
			),
		);
	}

	const appWhere = serverId
		? eq(applications.serverId, serverId)
		: isNull(applications.serverId);
	const applicationRows = await db.query.applications.findMany({
		where: appWhere,
		with: { domains: true, environment: { with: { project: true } } },
	});
	let applicationDomainCount = 0;
	for (const app of applicationRows) {
		for (const domain of app.domains ?? []) {
			applicationDomainCount++;
			const unsupportedFields = getUnsupportedCaddyDomainFieldMessages(domain);
			if (unsupportedFields.length) {
				warnings.push(
					warning(
						`Application domain "${domain.host}" uses unsupported Caddy fields: ${unsupportedFields.join("; ")}`,
						{
							blocking: true,
							code: "unsupported-domain-field",
							source: app.appName,
						},
					),
				);
				continue;
			}
			if (
				await warnIfCustomCertificateMissing(
					domain,
					app.appName,
					app.serverId,
					warnings,
					undefined,
					app.environment?.project?.organizationId,
				)
			) {
				continue;
			}
			addFragment(
				fragments,
				createCaddyApplicationRouteFragment(app as never, domain),
			);
		}
	}

	const composeWhere = serverId
		? eq(compose.serverId, serverId)
		: isNull(compose.serverId);
	const composeRows = await db.query.compose.findMany({
		where: composeWhere,
		with: { domains: true, environment: { with: { project: true } } },
	});
	let composeDomainCount = 0;
	for (const composeEntity of composeRows) {
		let composeSpec: ComposeSpecification | null = null;
		try {
			composeSpec = await getLocalOrRemoteComposeSpec(composeEntity);
		} catch (error) {
			composeFilesSkipped.push({
				path: composeEntity.appName,
				reason:
					error instanceof Error
						? error.message
						: "Unable to read compose file",
			});
		}

		for (const domain of composeEntity.domains ?? []) {
			composeDomainCount++;
			const unsupportedFields = getUnsupportedCaddyDomainFieldMessages(domain);
			if (unsupportedFields.length) {
				warnings.push(
					warning(
						`Compose domain "${domain.host}" uses unsupported Caddy fields: ${unsupportedFields.join("; ")}`,
						{
							blocking: true,
							code: "unsupported-domain-field",
							source: composeEntity.appName,
							serviceName: domain.serviceName ?? undefined,
						},
					),
				);
				continue;
			}
			if (
				await warnIfCustomCertificateMissing(
					domain,
					composeEntity.appName,
					composeEntity.serverId,
					warnings,
					domain.serviceName,
					composeEntity.environment?.project?.organizationId,
				)
			) {
				continue;
			}
			if (!domain.serviceName) {
				warnings.push(
					warning(`Compose domain "${domain.host}" is missing a service name`, {
						blocking: true,
						source: composeEntity.appName,
						serviceName: domain.serviceName ?? undefined,
					}),
				);
				continue;
			}
			const finalServiceName = resolveFinalComposeServiceName(
				composeEntity,
				composeSpec,
				domain.serviceName,
			);
			if (!finalServiceName) {
				warnings.push(
					warning(
						`Compose domain "${domain.host}" references service "${domain.serviceName}" that could not be verified in the compose file`,
						{
							blocking: true,
							source: composeEntity.appName,
							serviceName: domain.serviceName,
						},
					),
				);
				continue;
			}
			const upstreamTarget = await resolveMigrationComposeUpstreamTarget(
				composeEntity,
				composeSpec,
				finalServiceName,
			);
			addFragment(
				fragments,
				createCaddyComposeRouteFragment(
					composeEntity,
					domain,
					finalServiceName,
					{
						upstreamServiceName: upstreamTarget.host,
						upstreamNetwork: upstreamTarget.network,
					},
				),
			);
		}

		if (!composeSpec?.services) {
			composeFilesSkipped.push({
				path: composeEntity.appName,
				reason: "Compose file not found or has no services",
			});
			continue;
		}

		composeFilesScanned.push(composeEntity.appName);
		for (const [serviceName, service] of Object.entries(composeSpec.services)) {
			const labelSources: Array<{
				labels: ListOrDict | undefined;
				suffix: string;
			}> = [
				{ labels: service.labels, suffix: "labels" },
				{ labels: service.deploy?.labels, suffix: "deploy.labels" },
			].filter((labelSource) => labelsHaveTraefikHttp(labelSource.labels));
			if (!labelSources.length) continue;

			const labelFinalServiceName =
				resolveFinalComposeServiceName(
					composeEntity,
					composeSpec,
					serviceName,
				) ?? serviceName;
			const upstreamTarget = await resolveMigrationComposeUpstreamTarget(
				composeEntity,
				composeSpec,
				labelFinalServiceName,
			);
			for (const labelSource of labelSources) {
				const translated = translateTraefikComposeLabelsToCaddyFragment(
					labelSource.labels,
					{
						sourceFile: `${composeEntity.appName}/${serviceName}/${labelSource.suffix}`,
						appName: composeEntity.appName,
						domains: composeEntity.domains ?? [],
						serviceName,
						upstreamServiceName: upstreamTarget.host,
						upstreamNetwork: upstreamTarget.network,
						composeType: composeEntity.composeType,
						fileMiddlewares,
					},
				);
				warnings.push(
					...translated.warnings.filter(
						(item) =>
							!translated.classifications.every(
								(classification) => classification.dokployGenerated,
							) || isSecurityMiddlewareWarning(item),
					),
				);
				addFragment(fragments, {
					...translated.fragment,
					id: `migration.traefik-compose-label.${safeFragmentIdPart(
						`${composeEntity.appName}.${serviceName}.${labelSource.suffix}`,
					)}`,
				});
			}
		}
	}

	fragments = reconcileDbFallbackRoutes(fragments, warnings);
	if (canPruneUnreachableDockerUpstreams && reachableDockerHosts.size) {
		fragments = pruneUnreachableDockerUpstreams(
			fragments,
			warnings,
			reachableDockerHosts,
		);
	}
	warnOnManualFragmentConflicts(fragments, warnings);

	const compileSettings = await getCaddyCompileSettings(serverId);
	let config: ReturnType<typeof compileCaddyConfig>;
	let validation: CaddyMigrationReport["validation"];
	try {
		config = compileCaddyConfig({
			fragments,
			...compileSettings,
		});
		validation = {
			status: "passed",
			message:
				"Draft config compiled successfully; container validation runs during apply",
		};
	} catch (error) {
		config = compileCaddyConfig();
		const message =
			error instanceof Error ? error.message : "Draft Caddy config is invalid";
		warnings.push(
			warning(message, {
				code: "validation-failed",
				blocking: true,
			}),
		);
		validation = { status: "failed", message };
	}

	for (const fragment of fragments) {
		await writeMigrationTextFile(
			path.posix.join(artifactPaths.fragmentsDir, `${fragment.id}.json`),
			`${JSON.stringify(fragment, null, 2)}\n`,
			serverId,
		);
	}
	await writeMigrationTextFile(
		artifactPaths.caddyJson,
		`${JSON.stringify(config, null, 2)}\n`,
		serverId,
	);

	const report: CaddyMigrationReport = {
		migrationId,
		serverId: serverId ?? null,
		createdAt,
		updatedAt: createdAt,
		status: "prepared",
		sourceProvider: "traefik",
		targetProvider: "caddy",
		artifactPaths,
		inputs: {
			traefikStaticConfigPath: staticConfig.path,
			traefikStaticConfigFound: Boolean(staticConfig.content),
			dynamicFiles,
			dbApplicationDomains: applicationDomainCount,
			dbComposeDomains: composeDomainCount,
			composeFilesScanned,
			composeFilesSkipped,
		},
		summary: {
			fragments: fragments.length,
			routes: fragments.reduce(
				(total, fragment) => total + fragment.routes.length,
				0,
			),
			warnings: warnings.length,
			blockingWarnings: warnings.filter((item) => item.blocking).length,
		},
		validation,
		compileSettings,
		warnings,
		events: [
			{
				at: createdAt,
				type: "prepared",
				message: "Dry-run Caddy migration artifacts generated",
			},
		],
	};
	await writeCaddyMigrationReport(report, serverId);
	await writeMigrationTextFile(
		artifactPaths.reportMd,
		renderReportMarkdown(report),
		serverId,
	);
	return report;
};
