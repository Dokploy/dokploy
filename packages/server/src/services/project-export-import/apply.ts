import {
	environments,
	projects,
	projectTags,
	tags,
} from "@dokploy/server/db/schema";
import { parse } from "dotenv";
import { eq } from "drizzle-orm";
import type { ApplyServicesContext, DbServiceKind } from "./apply/services";
import {
	DB_SERVICE_KINDS,
	insertApplication,
	insertCompose,
	insertDbService,
	rewriteVaultNames,
} from "./apply/services";
import { applyVaultAssignments, insertSharedByValue } from "./apply/shared";
import { replaceAppNames } from "./appname";
import { conflictResolutionsOf, resolvedProjectName } from "./conflicts";
import type { TransferTx, TransferWriteDb } from "./queries";
import {
	buildServerIpMap,
	buildServiceBuildServerMap,
	buildServiceServerMap,
} from "./resolve";
import { applyRotation } from "./rotate";
import { restoreSecretFields } from "./secret-fields";
import type {
	Plan,
	ServiceType,
	Snapshot,
	TransferResult,
	Warning,
} from "./types";
import { transferResultSchema } from "./types";

const rewriteSharedEnv = (
	row: Record<string, unknown>,
	plan: Plan,
	vaultNameMap: Record<string, string>,
): Record<string, unknown> =>
	typeof row.env === "string"
		? {
				...row,
				env: rewriteVaultNames(
					replaceAppNames(row.env, plan.appNameMap),
					vaultNameMap,
				),
			}
		: row;

const ENV_KEY_REGEX = /^\s*(?:export\s+)?([\w.-]+)\s*=/;

const appendMissingEnv = (target: string, source: string): string => {
	const targetKeys = new Set(Object.keys(parse(target)));
	const missing = source.split("\n").filter((line) => {
		const key = ENV_KEY_REGEX.exec(line)?.[1];
		return key && !targetKeys.has(key);
	});
	if (missing.length === 0) return target;
	return [target.trimEnd(), ...missing].filter(Boolean).join("\n");
};

const insertProjectAndEnvironments = async (
	tx: TransferTx,
	snapshot: Snapshot,
	plan: Plan,
	organizationId: string,
	secretsPlain: Map<string, string>,
	vaultNameMap: Record<string, string>,
): Promise<{ projectId: string; environmentIdMap: Record<string, string> }> => {
	const { tags: projectTagRows, ...restoredProject } = rewriteSharedEnv(
		restoreSecretFields("project", snapshot.resources.project, secretsPlain),
		plan,
		vaultNameMap,
	);
	let projectId: string;
	if (plan.target.kind === "newProject") {
		const [inserted] = await tx
			.insert(projects)
			.values({
				...restoredProject,
				projectId: undefined,
				name: resolvedProjectName(plan.target, conflictResolutionsOf(plan)),
				description: plan.target.description ?? null,
				organizationId,
			} as unknown as typeof projects.$inferInsert)
			.returning();
		if (!inserted) {
			throw new Error("Failed to insert project");
		}
		projectId = inserted.projectId;
		await applyProjectTags(
			tx,
			projectId,
			organizationId,
			(projectTagRows as { name: string; color: string | null }[]) ?? [],
		);
	} else {
		const targetProjectId = plan.target.projectId;
		const project = await tx.query.projects.findFirst({
			where: (fields, { eq }) => eq(fields.projectId, targetProjectId),
			columns: { organizationId: true },
		});
		if (!project || project.organizationId !== organizationId) {
			throw new Error(
				`Cannot import into project "${targetProjectId}": not found in this organization`,
			);
		}
		projectId = targetProjectId;
	}

	const environmentIdMap: Record<string, string> = {};
	if (plan.target.kind === "newProject") {
		let firstInsertedId: string | undefined;
		let sawDefault = false;
		for (const env of snapshot.resources.environments) {
			const restored = rewriteSharedEnv(
				restoreSecretFields("environment", env, secretsPlain),
				plan,
				vaultNameMap,
			);
			const [inserted] = await tx
				.insert(environments)
				.values({
					...restored,
					environmentId: undefined,
					projectId,
					isDefault: Boolean(env.isDefault),
				} as unknown as typeof environments.$inferInsert)
				.returning();
			if (inserted) {
				environmentIdMap[env.environmentId as string] = inserted.environmentId;
				firstInsertedId ??= inserted.environmentId;
				sawDefault ||= inserted.isDefault;
			}
		}
		if (!sawDefault && firstInsertedId) {
			await tx
				.update(environments)
				.set({ isDefault: true })
				.where(eq(environments.environmentId, firstInsertedId));
		}
	} else {
		const baseName = plan.target.environmentName;
		let index = 0;
		for (const env of snapshot.resources.environments) {
			const restored = rewriteSharedEnv(
				restoreSecretFields("environment", env, secretsPlain),
				plan,
				vaultNameMap,
			);
			// Imported services read ${{project.*}} as ${{environment.*}} here, so the existing project's variables stay untouched.
			restored.env = appendMissingEnv(
				typeof restored.env === "string" ? restored.env : "",
				typeof restoredProject.env === "string" ? restoredProject.env : "",
			);
			const name =
				index === 0
					? baseName
					: `${baseName}-${(env.name as string | undefined) ?? `env-${index + 1}`}`;
			const [inserted] = await tx
				.insert(environments)
				.values({
					...restored,
					environmentId: undefined,
					name,
					projectId,
					isDefault: false,
				} as unknown as typeof environments.$inferInsert)
				.returning();
			if (inserted) {
				environmentIdMap[env.environmentId as string] = inserted.environmentId;
			}
			index += 1;
		}
	}

	return { projectId, environmentIdMap };
};

const applyProjectTags = async (
	tx: TransferTx,
	projectId: string,
	organizationId: string,
	tagRows: { name: string; color: string | null }[],
): Promise<void> => {
	for (const { name, color } of tagRows) {
		const existing = await tx.query.tags.findFirst({
			where: (fields, { and, eq }) =>
				and(eq(fields.organizationId, organizationId), eq(fields.name, name)),
		});
		let tagId = existing?.tagId;
		if (!tagId) {
			const [inserted] = await tx
				.insert(tags)
				.values({ name, color, organizationId })
				.returning();
			tagId = inserted?.tagId;
		}
		if (!tagId) continue;
		await tx.insert(projectTags).values({ projectId, tagId });
	}
};

export const apply = async (
	db: TransferWriteDb,
	snapshot: Snapshot,
	plan: Plan,
	secretsPlain: Map<string, string>,
	organizationId: string,
): Promise<TransferResult> => {
	const serverIpMap = await buildServerIpMap(
		db,
		plan.serverMap,
		organizationId,
	);
	const serviceServerMap = buildServiceServerMap(snapshot);
	const serviceBuildServerMap = buildServiceBuildServerMap(snapshot);
	return db.transaction(async (tx) => {
		const { idMaps, vaultNameMap } = await insertSharedByValue(
			tx,
			snapshot,
			plan,
			secretsPlain,
			organizationId,
		);

		const { projectId, environmentIdMap } = await insertProjectAndEnvironments(
			tx,
			snapshot,
			plan,
			organizationId,
			secretsPlain,
			vaultNameMap,
		);

		const conflictResolutions = conflictResolutionsOf(plan);

		const serviceIdMap: Record<ServiceType, Record<string, string>> = {
			application: {},
			compose: {},
			postgres: {},
			mysql: {},
			mariadb: {},
			mongo: {},
			redis: {},
			libsql: {},
		};

		const ctx: ApplyServicesContext = {
			tx,
			snapshot,
			plan,
			idMaps,
			secretsPlain,
			vaultNameMap,
			conflictResolutions,
			organizationId,
			serverIpMap,
			serviceServerMap,
			serviceBuildServerMap,
		};

		const serviceInsertWarnings: Warning[] = [];
		for (const service of snapshot.resources.services) {
			const kind = service.kind as ServiceType;
			const oldEnvironmentId = service.environmentId as string;
			const newEnvironmentId = environmentIdMap[oldEnvironmentId];
			if (!newEnvironmentId) continue;

			if (kind === "application") {
				const { oldId, newId, warnings } = await insertApplication(
					ctx,
					service,
					newEnvironmentId,
				);
				serviceIdMap.application[oldId] = newId;
				serviceInsertWarnings.push(...warnings);
			} else if (kind === "compose") {
				const { oldId, newId, warnings } = await insertCompose(
					ctx,
					service,
					newEnvironmentId,
				);
				serviceIdMap.compose[oldId] = newId;
				serviceInsertWarnings.push(...warnings);
			} else if ((DB_SERVICE_KINDS as readonly string[]).includes(kind)) {
				const { oldId, newId, warnings } = await insertDbService(
					ctx,
					kind as DbServiceKind,
					service,
					newEnvironmentId,
				);
				serviceIdMap[kind][oldId] = newId;
				serviceInsertWarnings.push(...warnings);
			}
		}

		const newEnvironmentIds = [...new Set(Object.values(environmentIdMap))];
		await applyVaultAssignments(
			tx,
			snapshot,
			idMaps,
			projectId,
			newEnvironmentIds,
		);

		const { rotations, warnings: rotationWarnings } = await applyRotation(
			tx,
			snapshot,
			serviceIdMap,
			plan.rotateDatabaseCredentials,
			{
				projectId: plan.target.kind === "newProject" ? projectId : null,
				environmentIds: newEnvironmentIds,
			},
		);

		const idMap: Record<string, Record<string, string>> = {
			project: { [snapshot.resources.project.projectId as string]: projectId },
			environment: environmentIdMap,
			destination: idMaps.destination,
			registry: idMaps.registry,
			sshKey: idMaps.sshKey,
			network: idMaps.network,
			certificate: idMaps.certificate,
			vaultProvider: idMaps.vaultProvider,
			...serviceIdMap,
		};

		const pendingRequirements = Object.entries(plan.resolutions)
			.filter(([, resolution]) => resolution.action === "skip")
			.map(([key]) => key);

		return transferResultSchema.parse({
			idMap,
			appNameMap: plan.appNameMap,
			pendingRequirements,
			pendingServices: plan.pendingServices,
			rotations,
			restoreErrors: [],
			warnings: [
				...plan.warnings,
				...rotationWarnings,
				...serviceInsertWarnings,
			],
		});
	});
};
