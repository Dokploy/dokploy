import { randomUUID } from "node:crypto";
import {
	type EnvironmentRow,
	loadProjectTree,
	type ProjectTree,
	type TransferDb,
} from "./queries";
import { SECRET_FIELDS, stripNeverExport } from "./secret-fields";
import {
	filterEnvironments,
	filterServices,
	SERVICE_ID_FIELD,
	SERVICE_TYPE_ENV_KEY,
	SERVICE_TYPES,
} from "./service-kinds";
import type {
	CaptureSource,
	ExportScope,
	Inventory,
	Requirement,
	ResourceKind,
	ServiceType,
	Snapshot,
	Warning,
} from "./types";
import { SECRET_REDACTED, SECRET_REF_PREFIX } from "./types";
import { exportedImageOf } from "./warnings";

export class CaptureNotFoundError extends Error {}

export type CaptureOptions = {
	detectRequirements: (
		tree: ProjectTree,
		scope: ExportScope,
	) => Requirement[] | Promise<Requirement[]>;
	detectWarnings: (
		tree: ProjectTree,
		scope: ExportScope,
	) => Warning[] | Promise<Warning[]>;
};

export type CaptureResult = {
	resources: Snapshot["resources"];
	inventory: Inventory;
	requirements: Requirement[];
	warnings: Warning[];
	secretsPlain: Map<string, string>;
	tree: ProjectTree;
};

type ChildDef = { key: string; kind: ResourceKind };

const DB_SERVICE_CHILDREN: ChildDef[] = [
	{ key: "mounts", kind: "mount" },
	{ key: "backups", kind: "backup" },
	{ key: "volumeBackups", kind: "volumeBackup" },
];

const CHILD_KINDS: Partial<Record<ServiceType, ChildDef[]>> = {
	application: [
		{ key: "domains", kind: "domain" },
		{ key: "mounts", kind: "mount" },
		{ key: "redirects", kind: "redirect" },
		{ key: "security", kind: "security" },
		{ key: "ports", kind: "port" },
		{ key: "schedules", kind: "schedule" },
		{ key: "volumeBackups", kind: "volumeBackup" },
	],
	compose: [
		{ key: "domains", kind: "domain" },
		{ key: "mounts", kind: "mount" },
		{ key: "backups", kind: "backup" },
		{ key: "schedules", kind: "schedule" },
		{ key: "volumeBackups", kind: "volumeBackup" },
	],
	postgres: DB_SERVICE_CHILDREN,
	mysql: DB_SERVICE_CHILDREN,
	mariadb: DB_SERVICE_CHILDREN,
	mongo: DB_SERVICE_CHILDREN,
	libsql: DB_SERVICE_CHILDREN,
	redis: [
		{ key: "mounts", kind: "mount" },
		{ key: "volumeBackups", kind: "volumeBackup" },
	],
};

const SHARED_BY_VALUE_TABLE: Partial<
	Record<
		Requirement["kind"],
		{
			query:
				| "destinations"
				| "registry"
				| "sshKeys"
				| "network"
				| "certificates"
				| "vaultProvider";
			idField: string;
			resourceKind: ResourceKind;
		}
	>
> = {
	destination: {
		query: "destinations",
		idField: "destinationId",
		resourceKind: "destination",
	},
	registry: {
		query: "registry",
		idField: "registryId",
		resourceKind: "registry",
	},
	sshKey: { query: "sshKeys", idField: "sshKeyId", resourceKind: "sshKey" },
	network: { query: "network", idField: "networkId", resourceKind: "network" },
	certificate: {
		query: "certificates",
		idField: "certificateId",
		resourceKind: "certificate",
	},
	vault: {
		query: "vaultProvider",
		idField: "vaultProviderId",
		resourceKind: "vaultProvider",
	},
};

const effectiveScope = (scope: ExportScope): ExportScope =>
	scope.includeEnvSecrets
		? scope
		: {
				...scope,
				shared: {
					...scope.shared,
					vaultProvider: "reference",
					dnsProvider: "reference",
				},
			};

export const capture = async (
	db: TransferDb,
	source: CaptureSource,
	requestedScope: ExportScope,
	opts: CaptureOptions,
): Promise<CaptureResult> => {
	const scope = effectiveScope(requestedScope);
	const tree = await loadProjectTree(db, source);
	if (!tree) {
		throw new CaptureNotFoundError("Project or environment not found");
	}

	const secretsPlain = new Map<string, string>();
	const keptEnvironments = filterEnvironments(tree, scope);

	const resourceEnvironments = keptEnvironments.map((env) =>
		sanitizeRow("environment", withoutServiceArrays(env), scope, secretsPlain),
	);

	const resourceServices = keptEnvironments.flatMap((env) =>
		SERVICE_TYPES.flatMap((serviceType) =>
			filterServices(
				env[SERVICE_TYPE_ENV_KEY[serviceType]] as Record<string, unknown>[],
				serviceType,
				scope,
			).map((service) =>
				buildServiceResource(serviceType, service, scope, secretsPlain),
			),
		),
	);

	const projectResource = sanitizeRow(
		"project",
		withoutRelationArrays(tree),
		scope,
		secretsPlain,
	);

	const [requirements, warnings] = await Promise.all([
		Promise.resolve(opts.detectRequirements(tree, scope)),
		Promise.resolve(opts.detectWarnings(tree, scope)),
	]);

	const shared = await loadSharedByValue(
		db,
		tree.organizationId,
		requirements,
		scope,
		secretsPlain,
	);

	const inventory = buildInventory(tree, keptEnvironments, scope);

	return {
		resources: {
			project: projectResource,
			environments: resourceEnvironments,
			services: resourceServices,
			shared,
		},
		inventory,
		requirements,
		warnings,
		secretsPlain,
		tree,
	};
};

const generateSecretId = () => randomUUID();

const redactOrCapture = (
	value: string,
	scope: ExportScope,
	secretsPlain: Map<string, string>,
): string => {
	if (!scope.includeEnvSecrets) {
		return SECRET_REDACTED;
	}
	const id = generateSecretId();
	secretsPlain.set(id, value);
	return `${SECRET_REF_PREFIX}${id}`;
};

const redactEnvFile = (
	envFile: string,
	scope: ExportScope,
	secretsPlain: Map<string, string>,
): string =>
	envFile
		.split("\n")
		.map((line) => {
			const eqIndex = line.indexOf("=");
			if (eqIndex === -1) {
				return line;
			}
			const key = line.slice(0, eqIndex);
			const value = line.slice(eqIndex + 1);
			if (value.length === 0) {
				return line;
			}
			return `${key}=${redactOrCapture(value, scope, secretsPlain)}`;
		})
		.join("\n");

const sanitizeRow = (
	kind: ResourceKind,
	row: Record<string, unknown>,
	scope: ExportScope,
	secretsPlain: Map<string, string>,
): Record<string, unknown> => {
	const stripped = stripNeverExport(kind, row);
	const entries = SECRET_FIELDS[kind];
	if (!entries) {
		return stripped;
	}

	const result: Record<string, unknown> = { ...stripped };
	for (const entry of entries) {
		if (entry.when && !entry.when(row)) {
			continue;
		}
		const value = result[entry.field];
		if (value === null || value === undefined || value === "") {
			continue;
		}
		if (entry.kind === "envFile") {
			if (typeof value === "string") {
				result[entry.field] = redactEnvFile(value, scope, secretsPlain);
			}
			continue;
		}
		const plainText = typeof value === "string" ? value : JSON.stringify(value);
		result[entry.field] = redactOrCapture(plainText, scope, secretsPlain);
	}
	return result;
};

const buildServiceResource = (
	serviceType: ServiceType,
	service: Record<string, unknown>,
	scope: ExportScope,
	secretsPlain: Map<string, string>,
): Record<string, unknown> => {
	const childDefs = CHILD_KINDS[serviceType] ?? [];
	const sanitizedChildren: Record<string, unknown> = {};
	const ownFields = { ...service };

	for (const { key, kind } of childDefs) {
		if (kind === "backup" && !scope.includeBackupSchedules) {
			sanitizedChildren[key] = [];
			delete ownFields[key];
			continue;
		}
		const children = (ownFields[key] as Record<string, unknown>[]) ?? [];
		sanitizedChildren[key] = children.map((child) =>
			sanitizeRow(kind, child, scope, secretsPlain),
		);
		delete ownFields[key];
	}

	const sanitizedOwn = sanitizeRow(serviceType, ownFields, scope, secretsPlain);

	return { kind: serviceType, ...sanitizedOwn, ...sanitizedChildren };
};

const withoutServiceArrays = (env: EnvironmentRow): Record<string, unknown> => {
	const {
		applications: _applications,
		compose: _compose,
		postgres: _postgres,
		mysql: _mysql,
		mariadb: _mariadb,
		mongo: _mongo,
		redis: _redis,
		libsql: _libsql,
		...rest
	} = env;
	return rest;
};

const withoutRelationArrays = (tree: ProjectTree): Record<string, unknown> => {
	const { environments: _environments, projectTags, ...rest } = tree;
	return {
		...rest,
		tags: (projectTags ?? []).map(({ tag }) => ({
			name: tag.name,
			color: tag.color,
		})),
	};
};

const loadSharedByValue = async (
	db: TransferDb,
	organizationId: string,
	requirements: Requirement[],
	scope: ExportScope,
	secretsPlain: Map<string, string>,
): Promise<Record<string, Record<string, unknown>[]>> => {
	const shared: Record<string, Record<string, unknown>[]> = {};

	for (const requirement of requirements) {
		if (!requirement.configIncluded || !requirement.originalId) {
			continue;
		}
		const table = SHARED_BY_VALUE_TABLE[requirement.kind];
		if (!table) {
			continue;
		}
		const row = await (
			db.query[table.query] as {
				findFirst: (
					args: unknown,
				) => Promise<Record<string, unknown> | undefined>;
			}
		).findFirst({
			where: (
				fields: Record<string, unknown>,
				{ eq }: { eq: (a: unknown, b: unknown) => unknown },
			) => eq(fields[table.idField], requirement.originalId),
		});
		if (!row) {
			continue;
		}
		shared[requirement.kind] ??= [];
		shared[requirement.kind]?.push(
			sanitizeRow(table.resourceKind, row, scope, secretsPlain),
		);
	}

	if (scope.shared.dnsProvider === "value") {
		const rows = await db.query.dnsProvider.findMany({
			where: (fields, { eq }) => eq(fields.organizationId, organizationId),
		});
		shared.dnsProvider = rows.map((row) =>
			sanitizeRow(
				"dnsProvider",
				row as Record<string, unknown>,
				scope,
				secretsPlain,
			),
		);
	}

	return shared;
};

const buildInventory = (
	tree: ProjectTree,
	keptEnvironments: EnvironmentRow[],
	scope: ExportScope,
): Inventory => {
	const totals: Partial<Record<ResourceKind, number>> = {};
	const bump = (kind: ResourceKind, by = 1) => {
		totals[kind] = (totals[kind] ?? 0) + by;
	};

	const images: Inventory["images"] = [];
	const environments = keptEnvironments.map((env) => {
		const services: Partial<Record<ServiceType, number>> = {};
		for (const serviceType of SERVICE_TYPES) {
			const rows = filterServices(
				env[SERVICE_TYPE_ENV_KEY[serviceType]] as Record<string, unknown>[],
				serviceType,
				scope,
			);
			services[serviceType] = rows.length;
			bump(serviceType, rows.length);
			for (const row of rows) {
				const image = exportedImageOf(serviceType, row);
				if (!image) continue;
				images.push({
					serviceId: row[SERVICE_ID_FIELD[serviceType]] as string,
					serviceType,
					name: (row.name as string | undefined) ?? (row.appName as string),
					image,
				});
			}
			for (const { key, kind } of CHILD_KINDS[serviceType] ?? []) {
				if (kind === "backup" && !scope.includeBackupSchedules) continue;
				const childCount = rows.reduce(
					(sum, row) => sum + ((row[key] as unknown[]) ?? []).length,
					0,
				);
				bump(kind, childCount);
			}
		}
		return { id: env.environmentId, name: env.name, services };
	});

	return {
		project: { name: tree.name, environments: keptEnvironments.length },
		environments,
		totals,
		estimatedDumpBytes: 0,
		estimatedFilesBytes: 0,
		images,
	};
};
