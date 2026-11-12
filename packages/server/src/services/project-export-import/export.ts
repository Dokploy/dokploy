import slug from "slugify";
import { encryptPayload } from "./crypto";
import {
	childKeysOf,
	loadProjectTree,
	SERVICE_ID_FIELD,
	SERVICE_TYPES,
	type TransferDb,
} from "./queries";
import {
	BUNDLE_EXTENSION,
	BUNDLE_FORMAT,
	BUNDLE_FORMAT_VERSION,
	type BundlePayload,
	type Envelope,
	type Row,
	type ServiceType,
} from "./types";

export class ProjectNotFoundError extends Error {
	constructor() {
		super("Project not found");
		this.name = "ProjectNotFoundError";
	}
}

const DROPPED_FIELDS = [
	"createdAt",
	"serverId",
	"buildServerId",
	"githubId",
	"gitlabId",
	"giteaId",
	"bitbucketId",
	"refreshToken",
	"registryId",
	"buildRegistryId",
	"rollbackRegistryId",
	"customGitSSHKeyId",
	"networkIds",
	"organizationId",
];

export const stripForeignReferences = (row: Row): Row => {
	const result = { ...row };
	for (const field of DROPPED_FIELDS) delete result[field];
	return result;
};

const GIT_PROVIDER_FIELDS = ["githubId", "gitlabId", "giteaId", "bitbucketId"];

const serviceWarnings = (type: ServiceType, row: Row): string[] => {
	const name = String(row.name ?? row.appName);
	const warnings: string[] = [];
	if (GIT_PROVIDER_FIELDS.some((field) => row[field])) {
		warnings.push(
			`"${name}" uses a connected git provider; reconnect it after importing.`,
		);
	}
	if (type === "application" && row.sourceType === "drop") {
		warnings.push(
			`"${name}" was deployed from an uploaded file, which is not included; upload it again.`,
		);
	}
	if (row.registryId || row.buildRegistryId || row.rollbackRegistryId) {
		warnings.push(
			`"${name}" uses a registry; select it again after importing.`,
		);
	}
	if (row.customGitSSHKeyId) {
		warnings.push(
			`"${name}" uses an SSH key; select it again after importing.`,
		);
	}
	if (Array.isArray(row.networkIds) && row.networkIds.length > 0) {
		warnings.push(`"${name}" was attached to networks; attach them again.`);
	}
	return warnings;
};

export type ExportInput = {
	projectId: string;
	serviceIds?: string[];
	passphrase: string;
};

export const exportProject = async (
	db: TransferDb,
	input: ExportInput,
): Promise<{ filename: string; content: string }> => {
	const tree = await loadProjectTree(db, input.projectId);
	if (!tree) throw new ProjectNotFoundError();

	const serviceFilter = input.serviceIds && new Set(input.serviceIds);

	const warnings = [
		"Backups, scheduled tasks, volume backups, deployments and the data in volumes and databases are not transferred.",
		"Servers, registries, destinations, git providers, SSH keys, networks and certificates are not transferred; services are created without them.",
	];
	const services: Row[] = [];
	for (const env of tree.environments) {
		for (const type of SERVICE_TYPES) {
			const key = type === "application" ? "applications" : type;
			for (const service of env[key as keyof typeof env] as unknown as Row[]) {
				const id = service[SERVICE_ID_FIELD[type]] as string;
				if (serviceFilter && !serviceFilter.has(id)) continue;
				warnings.push(...serviceWarnings(type, service));
				const own = stripForeignReferences(service);
				for (const child of childKeysOf(type)) {
					own[child] = ((service[child] as Row[]) ?? []).map((row) => {
						const { createdAt: _createdAt, ...rest } = row;
						return rest;
					});
				}
				services.push({ ...own, kind: type });
			}
		}
	}

	const { environments: _environments, projectTags, ...project } = tree;
	const payload: BundlePayload = {
		project: stripForeignReferences(project),
		tags: projectTags.map(({ tag }) => ({ name: tag.name, color: tag.color })),
		environments: tree.environments.map((env) => {
			const {
				applications: _a,
				compose: _c,
				postgres: _p,
				mysql: _m,
				mariadb: _ma,
				mongo: _mo,
				redis: _r,
				libsql: _l,
				...rest
			} = env;
			return stripForeignReferences(
				rest,
			) as BundlePayload["environments"][number];
		}),
		services: services as BundlePayload["services"],
		warnings,
	};

	const exportedAt = new Date().toISOString();
	const envelope: Envelope = {
		format: BUNDLE_FORMAT,
		formatVersion: BUNDLE_FORMAT_VERSION,
		exportedAt,
		projectName: tree.name,
		...(await encryptPayload(JSON.stringify(payload), input.passphrase)),
	};
	const base = slug(tree.name, { lower: true, strict: true }) || "project";
	return {
		filename: `${base}-${exportedAt.slice(0, 10)}${BUNDLE_EXTENSION}`,
		content: JSON.stringify(envelope),
	};
};
