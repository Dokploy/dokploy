import { paths } from "@dokploy/server/constants";
import type { ProjectTree } from "./queries";
import {
	at,
	copyDir,
	copyFile,
	exists,
	type Location,
	remove,
	safeErrorMessage,
} from "./remote-fs";
import { buildUsedBy, SERVICE_ID_FIELD, scopedServices } from "./service-kinds";
import type { Emit, ExportScope, Requirement, UsedBy, Warning } from "./types";

const GIT_SOURCE_TYPES = new Set([
	"git",
	"github",
	"gitlab",
	"bitbucket",
	"gitea",
]);

const skipMessage = (from: Location, error: unknown) =>
	`Skipped ${from.path}${from.serverId ? ` (server ${from.serverId})` : ""}: ${safeErrorMessage(error)}`;

const safeCopy = async (
	copy: () => Promise<void>,
	from: Location,
	to: Location,
): Promise<string | undefined> => {
	try {
		if (!(await exists(from))) {
			return;
		}
		await copy();
	} catch (error) {
		await remove(to).catch(() => {});
		return skipMessage(from, error);
	}
};

const safeCopyDir = (
	from: Location,
	to: Location,
	opts?: { exclude?: string[] },
) => safeCopy(() => copyDir(from, to, opts), from, to);

const safeCopyFile = (from: Location, to: Location) =>
	safeCopy(() => copyFile(from, to), from, to);

export type CollectFilesOptions = {
	emit?: Emit;
	pathsFn?: typeof paths;
};

export const collectFiles = async (
	tree: ProjectTree,
	scope: ExportScope,
	requirements: Requirement[],
	workDir: Location,
	opts: CollectFilesOptions = {},
): Promise<{ warnings: Warning[] }> => {
	const emit = opts.emit ?? (() => {});
	const pathsFn = opts.pathsFn ?? paths;
	const warnings: Warning[] = [];

	const report = (skipped: string | undefined, affected: UsedBy[]) => {
		if (!skipped) {
			return;
		}
		emit(skipped);
		warnings.push({
			code: "FILE_PULL_FAILED",
			severity: "warning",
			message: skipped,
			affected,
		});
	};

	for (const { serviceType, environmentId, service } of scopedServices(
		tree,
		scope,
	)) {
		const serverId = (service.serverId as string | null) ?? null;
		const appName = service.appName as string | null;
		if (!appName) {
			continue;
		}
		const remotePaths = pathsFn(serverId !== null);
		const usedBy = buildUsedBy(
			environmentId,
			serviceType,
			service,
			service[SERVICE_ID_FIELD[serviceType]] as string,
		);

		if (serviceType === "application" && scope.files.applicationSources) {
			const sourceType = service.sourceType as string;
			const exclude = [".git", "node_modules"];
			if (GIT_SOURCE_TYPES.has(sourceType)) {
				exclude.push("code");
			}
			report(
				await safeCopyDir(
					{ serverId, path: `${remotePaths.APPLICATIONS_PATH}/${appName}` },
					at(workDir, "files", "applications", appName),
					{ exclude },
				),
				[usedBy],
			);
		}

		if (serviceType === "compose" && scope.files.composeFiles) {
			report(
				await safeCopyDir(
					{ serverId, path: `${remotePaths.COMPOSE_PATH}/${appName}` },
					at(workDir, "files", "compose", appName),
				),
				[usedBy],
			);
		}

		if (serviceType === "application" && scope.files.traefikRaw) {
			report(
				await safeCopyFile(
					{
						serverId,
						path: `${remotePaths.DYNAMIC_TRAEFIK_PATH}/${appName}.yml`,
					},
					at(workDir, "files", "traefik", `${appName}.yml`),
				),
				[usedBy],
			);
		}
	}

	if (scope.files.customCertificates) {
		for (const requirement of requirements) {
			if (requirement.kind !== "certificate") {
				continue;
			}
			const certName = requirement.originalId;
			if (!certName) {
				continue;
			}
			const serverId = requirement.serverId;
			const remotePaths = pathsFn(serverId !== null);
			report(
				await safeCopyDir(
					{ serverId, path: `${remotePaths.CERTIFICATES_PATH}/${certName}` },
					at(workDir, "files", "certificates", certName),
				),
				requirement.usedBy,
			);
		}
	}

	return { warnings };
};
