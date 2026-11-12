import {
	applications,
	compose,
	domains,
	environments,
	libsql,
	mariadb,
	mongo,
	mounts,
	mysql,
	ports,
	postgres,
	projects,
	projectTags,
	redirects,
	redis,
	security,
	tags,
} from "@dokploy/server/db/schema";
import {
	buildAppName,
	VOLUME_NAME_REGEX,
} from "@dokploy/server/db/schema/utils";
import { findApplicationById } from "@dokploy/server/services/application";
import { createFileMount } from "@dokploy/server/services/mount";
import { isValidMountFilePath } from "@dokploy/server/utils/docker/utils";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { createRedirectMiddleware } from "@dokploy/server/utils/traefik/redirect";
import { createSecurityMiddleware } from "@dokploy/server/utils/traefik/security";
import { eq } from "drizzle-orm";
import { decryptPayload } from "./crypto";
import { stripForeignReferences } from "./export";
import {
	childKeysOf,
	SERVICE_ID_FIELD,
	SERVICE_TYPES,
	type TransferTx,
	type TransferWriteDb,
} from "./queries";
import {
	BUNDLE_FORMAT_VERSION,
	type BundlePayload,
	type BundlePreview,
	bundlePayloadSchema,
	envelopeSchema,
	type Row,
	type ServiceType,
} from "./types";

export class BundleFormatError extends Error {
	constructor(message = "This file is not a valid Dokploy project export") {
		super(message);
		this.name = "BundleFormatError";
	}
}

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		throw new BundleFormatError();
	}
};

export const readBundle = async (
	content: string,
	passphrase: string,
): Promise<{ exportedAt: string; payload: BundlePayload }> => {
	const envelope = envelopeSchema.safeParse(parseJson(content));
	if (!envelope.success) throw new BundleFormatError();
	if (envelope.data.formatVersion > BUNDLE_FORMAT_VERSION) {
		throw new BundleFormatError(
			"This bundle was created by a newer version of Dokploy. Upgrade Dokploy before importing it.",
		);
	}
	const json = await decryptPayload(envelope.data, passphrase);
	const payload = bundlePayloadSchema.safeParse(parseJson(json));
	if (!payload.success) throw new BundleFormatError();
	return { exportedAt: envelope.data.exportedAt, payload: payload.data };
};

export const previewBundle = (
	exportedAt: string,
	payload: BundlePayload,
): BundlePreview => ({
	projectName: String(payload.project.name ?? ""),
	exportedAt,
	environments: payload.environments.map((env) => ({
		name: env.name,
		services: payload.services
			.filter((service) => service.environmentId === env.environmentId)
			.map((service) => ({ name: service.name, type: service.kind })),
	})),
	warnings: payload.warnings,
});

const regenerateAppName = (type: string, oldAppName: string): string => {
	const safe = oldAppName.replace(/[^a-zA-Z0-9._-]/g, "-");
	const lastHyphen = safe.lastIndexOf("-");
	return buildAppName(
		type,
		lastHyphen === -1 ? safe : safe.slice(0, lastHyphen),
	);
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const replaceAppNames = (
	text: string,
	appNameMap: Record<string, string>,
): string => {
	const keys = Object.keys(appNameMap).sort((a, b) => b.length - a.length);
	if (!text || keys.length === 0) return text;
	// The lookbehind keeps "app-x" from matching inside "myapp-x".
	const pattern = new RegExp(
		`(?<![a-zA-Z0-9._-])(${keys.map(escapeRegExp).join("|")})`,
		"g",
	);
	return text.replace(pattern, (match) => appNameMap[match] ?? match);
};

const VARIABLE_FIELDS = [
	"env",
	"buildArgs",
	"buildSecrets",
	"previewEnv",
	"previewBuildArgs",
	"previewBuildSecrets",
];

const rewriteVariables = (row: Row, appNameMap: Record<string, string>) => {
	for (const field of VARIABLE_FIELDS) {
		if (typeof row[field] === "string") {
			row[field] = replaceAppNames(row[field], appNameMap);
		}
	}
};

const omit = (row: Row, keys: string[]): Row => {
	const result = { ...row };
	for (const key of keys) delete result[key];
	return result;
};

const SERVICE_TABLES = {
	application: applications,
	compose,
	postgres,
	mysql,
	mariadb,
	mongo,
	redis,
	libsql,
} as const;

const DB_TYPES = SERVICE_TYPES.filter(
	(type) => type !== "application" && type !== "compose",
);

const PARENT_FIELDS = Object.values(SERVICE_ID_FIELD);

const DB_PORT_FIELDS = [
	"externalPort",
	"externalGRPCPort",
	"externalAdminPort",
];

const SOURCE_IP_HOST = /-\d{1,3}(?:-\d{1,3}){3}\.(?:sslip\.io|traefik\.me)$/;

const importedProjectName = async (
	db: TransferWriteDb,
	organizationId: string,
	name: string,
): Promise<string> => {
	const existing = await db.query.projects.findFirst({
		where: (fields, { and, eq }) =>
			and(eq(fields.organizationId, organizationId), eq(fields.name, name)),
		columns: { projectId: true },
	});
	return existing ? `imported-${name}` : name;
};

const existingAppNames = async (
	db: TransferWriteDb,
	appNames: string[],
): Promise<Set<string>> => {
	if (appNames.length === 0) return new Set();
	const where = (fields: { appName: unknown }, ops: { inArray: any }) =>
		ops.inArray(fields.appName, appNames);
	const columns = { appName: true } as const;
	const rows = await Promise.all([
		db.query.applications.findMany({ where, columns }),
		db.query.compose.findMany({ where, columns }),
		db.query.postgres.findMany({ where, columns }),
		db.query.mysql.findMany({ where, columns }),
		db.query.mariadb.findMany({ where, columns }),
		db.query.mongo.findMany({ where, columns }),
		db.query.redis.findMany({ where, columns }),
		db.query.libsql.findMany({ where, columns }),
	]);
	return new Set(rows.flat().map((row) => row.appName));
};

const publishedPortsOn = async (
	db: TransferWriteDb,
	serverId: string | null,
): Promise<Set<number>> => {
	const onServer = (
		fields: { serverId: unknown },
		ops: { eq: any; isNull: any },
	) =>
		serverId ? ops.eq(fields.serverId, serverId) : ops.isNull(fields.serverId);
	const [apps, ...dbRows] = await Promise.all([
		db.query.applications.findMany({
			where: onServer,
			columns: { applicationId: true },
			with: { ports: { columns: { publishedPort: true } } },
		}),
		...DB_TYPES.map((type) =>
			(
				db.query[type] as unknown as {
					findMany: (args: unknown) => Promise<Row[]>;
				}
			).findMany({
				where: onServer,
				columns: Object.fromEntries(
					(type === "libsql" ? DB_PORT_FIELDS : ["externalPort"]).map(
						(field) => [field, true],
					),
				),
			}),
		),
	]);
	const used = new Set<number>();
	for (const app of apps) {
		for (const port of app.ports) used.add(port.publishedPort);
	}
	for (const row of dbRows.flat()) {
		for (const field of DB_PORT_FIELDS) {
			if (typeof row[field] === "number") used.add(row[field]);
		}
	}
	return used;
};

const existingRoutes = async (
	db: TransferWriteDb,
	hosts: string[],
): Promise<Set<string>> => {
	if (hosts.length === 0) return new Set();
	const rows = await db.query.domains.findMany({
		where: (fields, { inArray }) => inArray(fields.host, hosts),
		columns: { host: true, path: true },
	});
	return new Set(rows.map((row) => `${row.host}${row.path ?? "/"}`));
};

type ImportContext = {
	tx: TransferTx;
	appNameMap: Record<string, string>;
	usedPorts: Set<number>;
	usedRoutes: Set<string>;
	serverId: string | null;
	warnings: string[];
	fileMountIds: string[];
	applicationIds: string[];
};

const insertChildren = async (
	ctx: ImportContext,
	type: ServiceType,
	service: Row,
	newServiceId: string,
) => {
	const { tx, appNameMap, warnings } = ctx;
	const parent = { [SERVICE_ID_FIELD[type]]: newServiceId };
	const name = String(service.name);
	const rows = (key: string) =>
		((service[key] as Row[] | undefined) ?? []).map((row) =>
			omit(row, ["createdAt", ...PARENT_FIELDS]),
		);

	if (childKeysOf(type).includes("domains")) {
		for (const row of rows("domains")) {
			const host = replaceAppNames(String(row.host), appNameMap);
			const route = `${host}${(row.path as string | null) ?? "/"}`;
			const conflict = ctx.usedRoutes.has(route);
			if (conflict && row.enabled !== false) {
				warnings.push(
					`Domain ${host} is already used on this instance; it was imported disabled on "${name}".`,
				);
			}
			ctx.usedRoutes.add(route);
			if (SOURCE_IP_HOST.test(host)) {
				warnings.push(
					`Domain ${host} on "${name}" was generated for the source server's IP; generate a new one.`,
				);
			}
			// Without forward auth the route would be public, so keep it off until auth is set up again.
			const forwardAuth = row.forwardAuthEnabled === true;
			if (forwardAuth && row.enabled !== false) {
				warnings.push(
					`Domain ${host} on "${name}" used forward auth; it was imported disabled. Set up forward auth on this server before enabling it.`,
				);
			}
			await tx.insert(domains).values({
				...omit(row, ["domainId", "uniqueConfigKey", "previewDeploymentId"]),
				host,
				enabled: conflict || forwardAuth ? false : row.enabled,
				forwardAuthEnabled: false,
				...parent,
			} as typeof domains.$inferInsert);
		}
	}

	for (const row of rows("mounts")) {
		if (
			row.type === "file" &&
			(typeof row.filePath !== "string" || !isValidMountFilePath(row.filePath))
		) {
			throw new BundleFormatError(
				`Invalid file mount path "${String(row.filePath)}"`,
			);
		}
		const volumeName =
			typeof row.volumeName === "string"
				? replaceAppNames(row.volumeName, appNameMap)
				: row.volumeName;
		if (
			row.type === "volume" &&
			(typeof volumeName !== "string" || !VOLUME_NAME_REGEX.test(volumeName))
		) {
			throw new BundleFormatError(
				`Invalid volume name "${String(volumeName)}"`,
			);
		}
		if (
			row.type === "volume" &&
			!String(volumeName).includes(appNameMap[service.appName as string] ?? "")
		) {
			warnings.push(
				`Volume "${volumeName}" on "${name}" keeps its name; if a volume with that name already exists on the target server, it will be shared.`,
			);
		}
		const [mount] = await tx
			.insert(mounts)
			.values({
				...omit(row, ["mountId"]),
				volumeName,
				...parent,
			} as typeof mounts.$inferInsert)
			.returning();
		if (mount?.type === "file") ctx.fileMountIds.push(mount.mountId);
	}

	if (type !== "application") return;

	for (const row of rows("ports")) {
		const publishedPort = Number(row.publishedPort);
		if (ctx.usedPorts.has(publishedPort)) {
			warnings.push(
				`Port ${publishedPort} is already published on the target server; it was not added to "${name}".`,
			);
			continue;
		}
		ctx.usedPorts.add(publishedPort);
		await tx.insert(ports).values({
			...omit(row, ["portId"]),
			...parent,
		} as typeof ports.$inferInsert);
	}
	for (const row of rows("redirects")) {
		await tx.insert(redirects).values({
			...omit(row, ["redirectId", "uniqueConfigKey"]),
			...parent,
		} as typeof redirects.$inferInsert);
	}
	for (const row of rows("security")) {
		await tx.insert(security).values({
			...omit(row, ["securityId"]),
			...parent,
		} as typeof security.$inferInsert);
	}
};

const insertService = async (
	ctx: ImportContext,
	service: BundlePayload["services"][number],
	environmentId: string,
) => {
	const type = service.kind;
	const idField = SERVICE_ID_FIELD[type];
	const row = omit(stripForeignReferences(service), [
		"kind",
		idField,
		"environmentId",
		...childKeysOf(type),
	]);
	rewriteVariables(row, ctx.appNameMap);
	row.appName = ctx.appNameMap[service.appName];
	row.environmentId = environmentId;
	row.serverId = ctx.serverId;

	if (type === "compose") {
		row.composeStatus = "idle";
	} else {
		row.applicationStatus = "idle";
	}
	for (const field of DB_PORT_FIELDS) {
		if (type === "application" || type === "compose" || !row[field]) continue;
		const port = Number(row[field]);
		if (ctx.usedPorts.has(port)) {
			ctx.warnings.push(
				`Port ${port} is already published on the target server; it was removed from "${service.name}".`,
			);
			row[field] = null;
		} else {
			ctx.usedPorts.add(port);
		}
	}

	const [inserted] = (await ctx.tx
		.insert(SERVICE_TABLES[type])
		.values(row as never)
		.returning()) as Row[];
	const newId = inserted?.[idField] as string | undefined;
	if (!newId) throw new Error(`Failed to create "${service.name}"`);
	if (type === "application") ctx.applicationIds.push(newId);
	await insertChildren(ctx, type, service, newId);
};

export type ImportOptions = {
	organizationId: string;
	serverId: string | null;
};

export type ImportResult = {
	projectId: string;
	projectName: string;
	warnings: string[];
};

export const importBundle = async (
	db: TransferWriteDb,
	payload: BundlePayload,
	options: ImportOptions,
): Promise<ImportResult> => {
	// Backups live under <appName>/ in S3, so keeping the name lets the target find them.
	const taken = await existingAppNames(
		db,
		payload.services.map((service) => service.appName),
	);
	const warnings: string[] = [];
	const appNameMap = Object.fromEntries(
		payload.services.map((service) => {
			if (!taken.has(service.appName))
				return [service.appName, service.appName];
			const appName = regenerateAppName(service.kind, service.appName);
			warnings.push(
				`App name ${service.appName} already exists on this instance; "${service.name}" was imported as ${appName}, so its backups are stored under a new folder.`,
			);
			return [service.appName, appName];
		}),
	);
	const projectName = await importedProjectName(
		db,
		options.organizationId,
		String(payload.project.name ?? "project"),
	);
	const hosts = payload.services.flatMap((service) =>
		((service.domains as Row[] | undefined) ?? []).map((domain) =>
			replaceAppNames(String(domain.host), appNameMap),
		),
	);
	const [usedPorts, usedRoutes] = await Promise.all([
		publishedPortsOn(db, options.serverId),
		existingRoutes(db, hosts),
	]);
	const fileMountIds: string[] = [];
	const applicationIds: string[] = [];

	const projectId = await db.transaction(async (tx) => {
		const projectRow = omit(payload.project, ["projectId", "createdAt"]);
		rewriteVariables(projectRow, appNameMap);
		const [project] = await tx
			.insert(projects)
			.values({
				...projectRow,
				name: projectName,
				organizationId: options.organizationId,
			} as typeof projects.$inferInsert)
			.returning();
		if (!project) throw new Error("Failed to create the project");

		for (const { name, color } of payload.tags) {
			const existing = await tx.query.tags.findFirst({
				where: (fields, { and, eq }) =>
					and(
						eq(fields.organizationId, options.organizationId),
						eq(fields.name, name),
					),
			});
			const tagId =
				existing?.tagId ??
				(
					await tx
						.insert(tags)
						.values({ name, color, organizationId: options.organizationId })
						.returning()
				)[0]?.tagId;
			if (tagId) {
				await tx
					.insert(projectTags)
					.values({ projectId: project.projectId, tagId });
			}
		}

		const environmentIdMap = new Map<string, string>();
		for (const env of payload.environments) {
			const envRow = omit(env, ["environmentId", "projectId", "createdAt"]);
			rewriteVariables(envRow, appNameMap);
			const [inserted] = await tx
				.insert(environments)
				.values({
					...envRow,
					projectId: project.projectId,
				} as typeof environments.$inferInsert)
				.returning();
			if (inserted)
				environmentIdMap.set(env.environmentId, inserted.environmentId);
		}
		const firstEnvironmentId = environmentIdMap.values().next().value;
		if (
			firstEnvironmentId &&
			!payload.environments.some((env) => env.isDefault === true)
		) {
			await tx
				.update(environments)
				.set({ isDefault: true })
				.where(eq(environments.environmentId, firstEnvironmentId));
		}

		const ctx: ImportContext = {
			tx,
			appNameMap,
			usedPorts,
			usedRoutes,
			serverId: options.serverId,
			warnings,
			fileMountIds,
			applicationIds,
		};
		for (const service of payload.services) {
			const environmentId = environmentIdMap.get(service.environmentId);
			if (environmentId) await insertService(ctx, service, environmentId);
		}
		return project.projectId;
	});

	for (const mountId of fileMountIds) {
		await createFileMount(mountId).catch((error) => {
			warnings.push(`Could not write a file mount: ${errorMessage(error)}`);
		});
	}
	for (const applicationId of applicationIds) {
		try {
			const app = await findApplicationById(applicationId);
			for (const domain of app.domains) await manageDomain(app, domain);
			for (const row of app.security) await createSecurityMiddleware(app, row);
			for (const row of app.redirects) await createRedirectMiddleware(app, row);
		} catch (error) {
			warnings.push(
				`Could not write the Traefik configuration: ${errorMessage(error)}`,
			);
		}
	}

	return {
		projectId,
		projectName,
		warnings: [...payload.warnings, ...warnings],
	};
};

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);
