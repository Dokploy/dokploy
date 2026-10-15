import { paths } from "@dokploy/server/constants";
import type { mounts } from "@dokploy/server/db/schema";
import { findApplicationById } from "@dokploy/server/services/application";
import type { Certificate } from "@dokploy/server/services/certificate";
import { createCertificateFiles } from "@dokploy/server/services/certificate";
import { createFileMount } from "@dokploy/server/services/mount";
import { recreateNetwork } from "@dokploy/server/services/network";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { replaceAppNames } from "./appname";
import { conflictResolutionsOf } from "./conflicts";
import { assertSafeBundlePath } from "./deserialize";
import type { TransferDb } from "./queries";
import {
	at,
	copyDir,
	exists,
	type Location,
	readFile,
	safeErrorMessage,
	writeFile,
} from "./remote-fs";
import { buildServiceServerMap, requirementKey } from "./resolve";
import { SERVICE_ID_FIELD } from "./service-kinds";
import type {
	Emit,
	Plan,
	RestoreError,
	ServiceType,
	Snapshot,
	TransferResult,
} from "./types";
import { conflictKey } from "./types";

export type DeployCandidate = {
	serviceId: string;
	serviceType: "application" | "compose";
	serverId: string | null;
};

export type PostApplyOptions = {
	emit?: Emit;
	pathsFn?: typeof paths;
};

export type PostApplyResult = {
	deployCandidates: DeployCandidate[];
	postApplyErrors: RestoreError[];
};

const copyApplicationFiles = async (
	oldAppName: string,
	newAppName: string,
	serverId: string | null,
	workDir: Location,
	pathsFn: typeof paths,
	emit: Emit,
): Promise<void> => {
	const source = at(workDir, "files", "applications", oldAppName);
	if (!(await exists(source))) return;
	const remotePaths = pathsFn(serverId !== null);
	await copyDir(source, {
		serverId,
		path: `${remotePaths.APPLICATIONS_PATH}/${newAppName}`,
	});
	emit(`Copied application files for ${newAppName}`);
};

const COMPOSE_ENV_FILES = [
	"docker-compose.yml",
	"docker-compose.yaml",
	".env",
	"code/docker-compose.yml",
	"code/docker-compose.yaml",
];

const copyComposeFiles = async (
	oldAppName: string,
	newAppName: string,
	appNameMap: Record<string, string>,
	serverId: string | null,
	workDir: Location,
	pathsFn: typeof paths,
	emit: Emit,
): Promise<void> => {
	const source = at(workDir, "files", "compose", oldAppName);
	if (!(await exists(source))) return;

	for (const relativePath of COMPOSE_ENV_FILES) {
		const file = at(source, relativePath);
		if (!(await exists(file))) continue;
		const content = (await readFile(file)).toString("utf8");
		await writeFile(file, replaceAppNames(content, appNameMap));
	}

	const remotePaths = pathsFn(serverId !== null);
	await copyDir(source, {
		serverId,
		path: `${remotePaths.COMPOSE_PATH}/${newAppName}`,
	});
	emit(`Copied compose files for ${newAppName}`);
};

const createImportedNetworks = async (
	snapshot: Snapshot,
	plan: Plan,
	result: TransferResult,
	emit: Emit,
): Promise<RestoreError[]> => {
	const errors: RestoreError[] = [];
	const conflictResolutions = conflictResolutionsOf(plan);
	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "network") continue;
		if (plan.resolutions[requirementKey(requirement)]?.action !== "create") {
			continue;
		}
		const conflict =
			conflictResolutions[
				conflictKey({ kind: "network", value: requirement.name })
			];
		if (conflict?.action === "keep" || conflict?.action === "skip") continue;
		if (!requirement.originalId) continue;
		const newNetworkId = result.idMap.network?.[requirement.originalId];
		if (!newNetworkId) continue;
		try {
			await recreateNetwork(newNetworkId);
			emit(`Created Docker network ${requirement.name}`);
		} catch (error) {
			errors.push({
				serviceId: newNetworkId,
				serviceName: requirement.name,
				error: safeErrorMessage(error),
			});
		}
	}
	return errors;
};

const writeCertificateFiles = async (
	db: TransferDb,
	snapshot: Snapshot,
	plan: Plan,
	result: TransferResult,
	emit: Emit,
): Promise<RestoreError[]> => {
	const errors: RestoreError[] = [];
	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "certificate" || !requirement.originalId) continue;
		const resolution = plan.resolutions[requirementKey(requirement)];
		if (resolution?.action !== "create") continue;
		const newCertificateId = result.idMap.certificate?.[requirement.originalId];
		if (!newCertificateId) continue;
		try {
			const row = await db.query.certificates.findFirst({
				where: (fields, { eq }) => eq(fields.certificateId, newCertificateId),
			});
			if (!row) continue;
			await createCertificateFiles(row as Certificate);
			emit(`Wrote certificate files for ${row.name}`);
		} catch (error) {
			errors.push({
				serviceId: newCertificateId,
				error: safeErrorMessage(error),
			});
		}
	}
	return errors;
};

const writeRawTraefikConfig = async (
	oldAppName: string,
	newAppName: string,
	appNameMap: Record<string, string>,
	serverId: string | null,
	workDir: Location,
	pathsFn: typeof paths,
): Promise<boolean> => {
	const raw = at(workDir, "files", "traefik", `${oldAppName}.yml`);
	if (!(await exists(raw))) return false;

	const rewritten = replaceAppNames(
		(await readFile(raw)).toString("utf8"),
		appNameMap,
	);
	const remotePaths = pathsFn(serverId !== null);
	await writeFile(
		{ serverId, path: `${remotePaths.DYNAMIC_TRAEFIK_PATH}/${newAppName}.yml` },
		rewritten,
	);
	return true;
};

const domainKeys = (rows: { host: string; enabled?: boolean | null }[]) =>
	rows
		.map((row) => `${row.host}|${row.enabled ?? true}`)
		.sort()
		.join(",");

const registerTraefikDomains = async (
	oldAppName: string,
	newAppName: string,
	newApplicationId: string,
	sourceDomains: { host: string; enabled?: boolean | null }[],
	appNameMap: Record<string, string>,
	workDir: Location,
	pathsFn: typeof paths,
	emit: Emit,
): Promise<void> => {
	const app = await findApplicationById(newApplicationId);
	const serverId = app.serverId ?? null;

	// The raw file still routes the source hosts, so it is only safe when the import kept them.
	const domainsUnchanged =
		domainKeys(
			sourceDomains.map((domain) => ({
				...domain,
				host: replaceAppNames(domain.host, appNameMap),
			})),
		) === domainKeys(app.domains);
	const usedRawConfig =
		domainsUnchanged &&
		(await writeRawTraefikConfig(
			oldAppName,
			newAppName,
			appNameMap,
			serverId,
			workDir,
			pathsFn,
		));
	if (usedRawConfig) {
		emit(`Wrote raw Traefik config for ${newAppName}`);
		return;
	}

	for (const domain of app.domains) {
		await manageDomain(app, domain);
	}
	if (app.domains.length > 0) {
		emit(`Registered ${app.domains.length} domain(s) for ${newAppName}`);
	}
};

const writeFileMounts = async (
	db: TransferDb,
	snapshot: Snapshot,
	result: TransferResult,
	emit: Emit,
): Promise<RestoreError[]> => {
	const errors: RestoreError[] = [];
	for (const service of snapshot.resources.services) {
		const kind = service.kind as ServiceType;
		const oldId = service[SERVICE_ID_FIELD[kind]] as string | undefined;
		if (!oldId) continue;
		const newId = result.idMap[kind]?.[oldId];
		if (!newId) continue;

		const ownerField = SERVICE_ID_FIELD[
			kind
		] as keyof typeof mounts.$inferSelect;
		try {
			const fileMounts = await db.query.mounts.findMany({
				where: (fields, { eq, and }) =>
					and(eq(fields[ownerField], newId), eq(fields.type, "file")),
			});
			for (const mount of fileMounts) {
				await createFileMount(mount.mountId);
				emit(`Wrote mount file ${mount.filePath} for ${newId}`);
			}
		} catch (error) {
			errors.push({
				serviceId: newId,
				serviceName: (service.name as string | undefined) ?? newId,
				error: safeErrorMessage(error),
			});
		}
	}
	return errors;
};

export const postApply = async (
	db: TransferDb,
	snapshot: Snapshot,
	plan: Plan,
	result: TransferResult,
	workDir: Location,
	opts: PostApplyOptions = {},
): Promise<PostApplyResult> => {
	const emit = opts.emit ?? (() => {});
	const pathsFn = opts.pathsFn ?? paths;
	const pendingServiceIds = new Set(
		plan.pendingServices.map((p) => p.serviceId),
	);
	const deployCandidates: DeployCandidate[] = [];
	const postApplyErrors: RestoreError[] = [];
	const serviceServerMap = buildServiceServerMap(snapshot);

	for (const service of snapshot.resources.services) {
		const kind = service.kind as ServiceType;
		if (kind !== "application" && kind !== "compose") continue;

		const oldId = service[SERVICE_ID_FIELD[kind]] as string;
		const newId = result.idMap[kind]?.[oldId];
		if (!newId) continue;

		const oldAppName = service.appName as string;
		const newAppName = plan.appNameMap[oldAppName] ?? oldAppName;
		const oldServerId = serviceServerMap.get(oldId) ?? null;
		const serverId = plan.serverMap[oldServerId ?? "null"] ?? null;

		try {
			assertSafeBundlePath(oldAppName, oldAppName);
			assertSafeBundlePath(newAppName, newAppName);
			if (kind === "application") {
				await copyApplicationFiles(
					oldAppName,
					newAppName,
					serverId,
					workDir,
					pathsFn,
					emit,
				);
				await registerTraefikDomains(
					oldAppName,
					newAppName,
					newId,
					(service.domains as { host: string; enabled?: boolean }[]) ?? [],
					plan.appNameMap,
					workDir,
					pathsFn,
					emit,
				);
			} else {
				await copyComposeFiles(
					oldAppName,
					newAppName,
					plan.appNameMap,
					serverId,
					workDir,
					pathsFn,
					emit,
				);
			}
		} catch (error) {
			postApplyErrors.push({
				serviceId: newId,
				serviceName: (service.name as string | undefined) ?? oldAppName,
				error: safeErrorMessage(error),
			});
			continue;
		}

		if (!pendingServiceIds.has(oldId)) {
			deployCandidates.push({ serviceId: newId, serviceType: kind, serverId });
		}
	}

	postApplyErrors.push(
		...(await createImportedNetworks(snapshot, plan, result, emit)),
	);
	postApplyErrors.push(
		...(await writeCertificateFiles(db, snapshot, plan, result, emit)),
		...(await writeFileMounts(db, snapshot, result, emit)),
	);

	return { deployCandidates, postApplyErrors };
};
