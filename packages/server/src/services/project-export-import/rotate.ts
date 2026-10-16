import {
	applications,
	compose,
	environments,
	libsql,
	mariadb,
	mongo,
	mounts,
	mysql,
	postgres,
	projects,
	redis,
} from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates";
import { eq } from "drizzle-orm";
import type { TransferTx } from "./queries";
import {
	buildUsedBy,
	SERVICE_ID_FIELD,
	SERVICE_TYPE_ENV_KEY,
} from "./service-kinds";
import type {
	RotationEntry,
	ServiceType,
	Snapshot,
	UsedBy,
	Warning,
} from "./types";

const DB_KINDS: ServiceType[] = [
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
];
const ROOT_PASSWORD_KINDS: ServiceType[] = ["mysql", "mariadb"];

const SERVICE_TABLES = {
	application: { table: applications, idColumn: applications.applicationId },
	compose: { table: compose, idColumn: compose.composeId },
	postgres: { table: postgres, idColumn: postgres.postgresId },
	mysql: { table: mysql, idColumn: mysql.mysqlId },
	mariadb: { table: mariadb, idColumn: mariadb.mariadbId },
	mongo: { table: mongo, idColumn: mongo.mongoId },
	redis: { table: redis, idColumn: redis.redisId },
	libsql: { table: libsql, idColumn: libsql.libsqlId },
} as const;

const TEXT_FIELDS_BY_KIND: Partial<Record<ServiceType, string[]>> = {
	application: [
		"env",
		"buildArgs",
		"buildSecrets",
		"previewEnv",
		"previewBuildArgs",
		"previewBuildSecrets",
	],
	compose: ["env", "composeFile"],
};

type RotationField = "databasePassword" | "databaseRootPassword";

export type RotationSpec = {
	serviceId: string;
	serviceType: ServiceType;
	field: RotationField;
	oldPassword: string;
	newPassword: string;
};

const generateRotatedPassword = (): string => generatePassword(20);

const findRow = async (
	tx: TransferTx,
	kind: ServiceType,
	id: string,
): Promise<Record<string, unknown> | undefined> => {
	const idField = SERVICE_ID_FIELD[kind];
	const query = tx.query as unknown as Record<
		string,
		{
			findFirst: (
				args: unknown,
			) => Promise<Record<string, unknown> | undefined>;
		}
	>;
	return query[SERVICE_TYPE_ENV_KEY[kind]]?.findFirst({
		where: (
			fields: Record<string, unknown>,
			ops: { eq: (a: unknown, b: unknown) => unknown },
		) => ops.eq(fields[idField], id),
	});
};

const updateServiceFields = async (
	tx: TransferTx,
	kind: ServiceType,
	id: string,
	patch: Record<string, string>,
): Promise<void> => {
	const { table, idColumn } = SERVICE_TABLES[kind];
	await tx
		.update(table)
		.set(patch as never)
		.where(eq(idColumn, id));
};

const updatePassword = async (
	tx: TransferTx,
	spec: RotationSpec,
): Promise<void> => {
	const { serviceType, serviceId, field, newPassword } = spec;
	if (!DB_KINDS.includes(serviceType)) return;
	const column =
		field === "databaseRootPassword" &&
		ROOT_PASSWORD_KINDS.includes(serviceType)
			? "databaseRootPassword"
			: "databasePassword";
	await updateServiceFields(tx, serviceType, serviceId, {
		[column]: newPassword,
	});
};

export const buildRotationPlan = async (
	tx: TransferTx,
	snapshot: Snapshot,
	serviceIdMap: Record<string, Record<string, string>>,
): Promise<{ specs: RotationSpec[]; unsafe: UsedBy[] }> => {
	const specs: RotationSpec[] = [];
	const unsafe: UsedBy[] = [];

	for (const service of snapshot.resources.services) {
		const kind = service.kind as ServiceType;
		if (!DB_KINDS.includes(kind)) continue;
		const oldId = service[SERVICE_ID_FIELD[kind]] as string;
		const newId = serviceIdMap[kind]?.[oldId];
		if (!newId) continue;

		const row = await findRow(tx, kind, newId);
		if (!row) continue;

		const oldPassword = row.databasePassword as string | undefined;
		const oldRoot = ROOT_PASSWORD_KINDS.includes(kind)
			? (row.databaseRootPassword as string | undefined)
			: undefined;
		if (
			(oldPassword && !isSafeToRotate(oldPassword, row)) ||
			(oldRoot && !isSafeToRotate(oldRoot, row))
		) {
			unsafe.push(usedByOf(service, newId));
			continue;
		}
		const newPassword = oldPassword ? generateRotatedPassword() : undefined;
		if (oldPassword && newPassword) {
			specs.push({
				serviceId: newId,
				serviceType: kind,
				field: "databasePassword",
				oldPassword,
				newPassword,
			});
		}
		if (oldRoot) {
			specs.push({
				serviceId: newId,
				serviceType: kind,
				field: "databaseRootPassword",
				oldPassword: oldRoot,
				newPassword:
					oldRoot === oldPassword && newPassword
						? newPassword
						: generateRotatedPassword(),
			});
		}
	}

	return { specs, unsafe };
};

type Match = { spec: RotationSpec; count: number };

export const rotateText = (
	text: string,
	specs: RotationSpec[],
): { text: string; matched: Match[] } => {
	let result = text;
	const matched: Match[] = [];

	const orderedSpecs = [...specs].sort(
		(a, b) => b.oldPassword.length - a.oldPassword.length,
	);
	for (const spec of orderedSpecs) {
		if (!spec.oldPassword) continue;
		let count = 0;

		const literalParts = result.split(spec.oldPassword);
		if (literalParts.length > 1) {
			count += literalParts.length - 1;
			result = literalParts.join(spec.newPassword);
		}

		const encoded = encodeURIComponent(spec.oldPassword);
		if (encoded !== spec.oldPassword) {
			const parts = result.split(encoded);
			if (parts.length > 1) {
				count += parts.length - 1;
				result = parts.join(encodeURIComponent(spec.newPassword));
			}
		}

		if (count > 0) {
			matched.push({ spec, count });
		}
	}

	return { text: result, matched };
};

const rotateFields = (
	row: Record<string, unknown>,
	fields: string[],
	specs: RotationSpec[],
): { patch: Record<string, string>; matched: Match[] } => {
	const patch: Record<string, string> = {};
	const matched: Match[] = [];
	for (const field of fields) {
		const value = row[field];
		if (typeof value !== "string" || value.length === 0) continue;
		const rotated = rotateText(value, specs);
		if (rotated.matched.length === 0) continue;
		patch[field] = rotated.text;
		matched.push(...rotated.matched);
	}
	return { patch, matched };
};

const buildRotationEntries = (allMatches: Match[][]): RotationEntry[] => {
	const totals = new Map<string, { spec: RotationSpec; occurrences: number }>();
	for (const matches of allMatches) {
		for (const { spec, count } of matches) {
			const key = `${spec.serviceId}:${spec.field}`;
			const existing = totals.get(key);
			if (existing) {
				existing.occurrences += count;
			} else {
				totals.set(key, { spec, occurrences: count });
			}
		}
	}
	return [...totals.values()].map(({ spec, occurrences }) => ({
		service: spec.serviceId,
		field: spec.field,
		occurrences,
	}));
};

const MIN_ROTATABLE_PASSWORD_LENGTH = 8;

const isSafeToRotate = (
	password: string,
	row: Record<string, unknown>,
): boolean =>
	password.length >= MIN_ROTATABLE_PASSWORD_LENGTH &&
	password !== row.databaseUser &&
	password !== row.databaseName;

const usedByOf = (service: Record<string, unknown>, newId: string): UsedBy =>
	buildUsedBy(
		(service.environmentId as string) ?? "",
		service.kind as ServiceType,
		service,
		newId,
	);

const USER_BEARING_DATABASES: Partial<Record<ServiceType, Set<string>>> = {
	mysql: new Set(["mysql", "--all-databases"]),
	mariadb: new Set(["mysql", "--all-databases"]),
};

const dumpsThatMayContainUsers = (
	snapshot: Snapshot,
	serviceIdMap: Record<string, Record<string, string>>,
): UsedBy[] => {
	const affected: UsedBy[] = [];
	for (const dump of snapshot.dumps) {
		const kind = dump.serviceType;
		const userBearing = USER_BEARING_DATABASES[kind];
		if (!userBearing) continue;
		const service = snapshot.resources.services.find(
			(row) => row[SERVICE_ID_FIELD[kind]] === dump.serviceId,
		);
		if (!service) continue;
		const databaseName = service.databaseName as string | undefined;
		if (!databaseName || !userBearing.has(databaseName)) continue;
		const newId = serviceIdMap[kind]?.[dump.serviceId];
		if (!newId) continue;
		affected.push(usedByOf(service, newId));
	}
	return affected;
};

export type ApplyRotationResult = {
	rotations: RotationEntry[];
	warnings: Warning[];
};

export type RotationScope = {
	projectId: string | null;
	environmentIds: string[];
};

export const applyRotation = async (
	tx: TransferTx,
	snapshot: Snapshot,
	serviceIdMap: Record<string, Record<string, string>>,
	rotateDatabaseCredentials: boolean,
	scope: RotationScope,
): Promise<ApplyRotationResult> => {
	if (!rotateDatabaseCredentials) {
		return { rotations: [], warnings: [] };
	}

	const { specs, unsafe } = await buildRotationPlan(tx, snapshot, serviceIdMap);
	if (specs.length === 0) {
		return { rotations: [], warnings: [] };
	}

	for (const spec of specs) {
		await updatePassword(tx, spec);
	}

	const servicesByOldPassword = new Map<string, Set<string>>();
	for (const spec of specs) {
		const services =
			servicesByOldPassword.get(spec.oldPassword) ?? new Set<string>();
		services.add(spec.serviceId);
		servicesByOldPassword.set(spec.oldPassword, services);
	}
	const ambiguousServiceIds = new Set(
		specs
			.filter(
				(spec) => (servicesByOldPassword.get(spec.oldPassword)?.size ?? 0) > 1,
			)
			.map((spec) => spec.serviceId),
	);

	const allMatches: Match[][] = [];

	const project = scope.projectId
		? await tx.query.projects.findFirst({
				where: (fields, { eq }) =>
					eq(fields.projectId, scope.projectId as string),
			})
		: undefined;
	if (project && scope.projectId) {
		const { patch, matched } = rotateFields(project, ["env"], specs);
		if (matched.length > 0) {
			await tx
				.update(projects)
				.set(patch)
				.where(eq(projects.projectId, scope.projectId));
			allMatches.push(matched);
		}
	}

	for (const environmentId of scope.environmentIds) {
		const environment = await tx.query.environments.findFirst({
			where: (fields, { eq }) => eq(fields.environmentId, environmentId),
		});
		if (!environment) continue;
		const { patch, matched } = rotateFields(environment, ["env"], specs);
		if (matched.length > 0) {
			await tx
				.update(environments)
				.set(patch)
				.where(eq(environments.environmentId, environmentId));
			allMatches.push(matched);
		}
	}

	const ambiguousServices: UsedBy[] = [];
	const unreferenced: UsedBy[] = [];

	for (const service of snapshot.resources.services) {
		const kind = service.kind as ServiceType;
		const oldId = service[SERVICE_ID_FIELD[kind]] as string;
		const newId = serviceIdMap[kind]?.[oldId];
		if (!newId) continue;

		if (ambiguousServiceIds.has(newId)) {
			ambiguousServices.push(usedByOf(service, newId));
		}

		const rotatedItself = specs.some((spec) => spec.serviceId === newId);
		let referenced = rotatedItself;
		const row = await findRow(tx, kind, newId);
		if (row) {
			const { patch, matched } = rotateFields(
				row,
				TEXT_FIELDS_BY_KIND[kind] ?? ["env"],
				specs,
			);
			if (matched.length > 0) {
				await updateServiceFields(tx, kind, newId, patch);
				allMatches.push(matched);
				referenced = true;
			}
		}

		const ownerField = SERVICE_ID_FIELD[
			kind
		] as keyof typeof mounts.$inferSelect;
		const fileMounts = await tx.query.mounts.findMany({
			where: (fields, { and, eq }) =>
				and(eq(fields[ownerField], newId), eq(fields.type, "file")),
		});
		for (const mount of fileMounts) {
			const { patch, matched } = rotateFields(mount, ["content"], specs);
			if (matched.length === 0) continue;
			await tx
				.update(mounts)
				.set(patch)
				.where(eq(mounts.mountId, mount.mountId));
			allMatches.push(matched);
			referenced = true;
		}

		if (!referenced) {
			unreferenced.push(usedByOf(service, newId));
		}
	}

	const rotations = buildRotationEntries(allMatches);
	const warnings: Warning[] = [];
	if (unreferenced.length > 0) {
		warnings.push({
			code: "ROTATION_CHECK_CONSUMERS",
			severity: "info",
			message: `${unreferenced.length} service(s) don't reference the rotated database password(s) in their env, build args, compose file or file mounts; if they connect some other way, update them manually.`,
			affected: unreferenced,
		});
	}
	if (unsafe.length > 0) {
		warnings.push({
			code: "ROTATION_SKIPPED_UNSAFE_PASSWORD",
			severity: "warning",
			message: `${unsafe.length} database(s) kept their original password: it is shorter than ${MIN_ROTATABLE_PASSWORD_LENGTH} characters or equal to the database user/name, so rewriting it in env files would be unreliable. Rotate it manually after the import.`,
			affected: unsafe,
		});
	}
	if (ambiguousServices.length > 0) {
		warnings.push({
			code: "ROTATION_AMBIGUOUS_PASSWORD",
			severity: "warning",
			message: `${ambiguousServices.length} service(s) shared the same database password before rotation; any other service referencing that password by value may now point at the wrong new password. Check their env manually.`,
			affected: ambiguousServices,
		});
	}
	const userBearingDumps = dumpsThatMayContainUsers(snapshot, serviceIdMap);
	if (userBearingDumps.length > 0) {
		warnings.push({
			code: "ROTATION_DUMP_MAY_CONTAIN_USERS",
			severity: "warning",
			message: `${userBearingDumps.length} dump(s) come from a system database (mysql "mysql"/"--all-databases" or mongo "admin") and may carry user accounts with the old password; after restore, those accounts still use the pre-rotation credentials.`,
			affected: userBearingDumps,
		});
	}

	return { rotations, warnings };
};
