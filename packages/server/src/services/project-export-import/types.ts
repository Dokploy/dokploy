import { serviceType } from "@dokploy/server/db/schema";
import { z } from "zod";

export const TRANSFER_FORMAT = "dokploy-project-export" as const;
export const TRANSFER_FORMAT_VERSION = 1 as const;
export const BUNDLE_EXTENSION = ".dokploy.tar.gz";
export const SECRET_REF_PREFIX = "$secret:";
export const SECRET_REDACTED = "$secret:REDACTED";
export const MAX_EMBEDDED_DUMP_BYTES = 8 * 1024 * 1024 * 1024;
export const TRANSFER_MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024;

export const KDF_PARAMS = {
	N: 32768,
	r: 8,
	p: 1,
	dkLen: 64,
} as const;

export const serviceTypeSchema = z.enum(serviceType.enumValues);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

const CHILD_AND_SHARED_RESOURCE_KINDS = [
	"project",
	"environment",
	"domain",
	"mount",
	"port",
	"redirect",
	"security",
	"backup",
	"volumeBackup",
	"schedule",
	"destination",
	"registry",
	"sshKey",
	"network",
	"certificate",
	"vaultProvider",
	"dnsProvider",
] as const;

export const resourceKindSchema = z.enum([
	"application",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"compose",
	"libsql",
	...CHILD_AND_SHARED_RESOURCE_KINDS,
]);
export type ResourceKind = z.infer<typeof resourceKindSchema>;

export const sharedResourceKindSchema = z.enum([
	"destination",
	"registry",
	"sshKey",
	"network",
	"certificate",
	"vaultProvider",
	"dnsProvider",
]);
export type SharedResourceKind = z.infer<typeof sharedResourceKindSchema>;

export const usedBySchema = z.object({
	serviceId: z.string(),
	serviceType: z.union([
		serviceTypeSchema,
		z.literal("project"),
		z.literal("environment"),
	]),
	serviceName: z.string(),
	environmentId: z.string(),
	field: z.string().optional(),
});
export type UsedBy = z.infer<typeof usedBySchema>;

export const vaultProviderTypeSchema = z.enum([
	"hashicorp",
	"infisical",
	"aws",
	"aws-parameter-store",
	"doppler",
	"azure",
	"scaleway",
	"phase",
]);
export type VaultProviderType = z.infer<typeof vaultProviderTypeSchema>;

export const gitProviderTypeSchema = z.enum([
	"github",
	"gitlab",
	"gitea",
	"bitbucket",
]);
export type GitProviderType = z.infer<typeof gitProviderTypeSchema>;

const requirementBase = {
	originalId: z.string().nullable(),
	configIncluded: z.boolean(),
	usedBy: z.array(usedBySchema),
};

export const requirementSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("vault"),
		...requirementBase,
		providerName: z.string(),
		providerType: vaultProviderTypeSchema,
		secretKeys: z.array(z.string()),
	}),
	z.object({
		kind: z.literal("gitProvider"),
		...requirementBase,
		providerType: gitProviderTypeSchema,
		repositories: z.array(z.object({ owner: z.string(), repo: z.string() })),
	}),
	z.object({
		kind: z.literal("destination"),
		...requirementBase,
		bucket: z.string(),
		endpoint: z.string(),
		region: z.string(),
	}),
	z.object({
		kind: z.literal("registry"),
		...requirementBase,
		registryUrl: z.string(),
		imagePrefix: z.string(),
		role: z.array(z.enum(["registry", "buildRegistry", "rollbackRegistry"])),
	}),
	z.object({
		kind: z.literal("sshKey"),
		...requirementBase,
		publicKey: z.string(),
	}),
	z.object({
		kind: z.literal("network"),
		...requirementBase,
		name: z.string(),
	}),
	z.object({
		kind: z.literal("certificate"),
		...requirementBase,
		fingerprint: z.string(),
		serverId: z.string().nullable(),
	}),
	z.object({
		kind: z.literal("server"),
		...requirementBase,
	}),
]);
export type Requirement = z.infer<typeof requirementSchema>;
export type RequirementKind = Requirement["kind"];

export const warningCodeSchema = z.enum([
	"ABSOLUTE_HOST_PATH_MOUNT",
	"MANUAL_VOLUME_NAME",
	"APPNAME_IN_COMPOSE_FILE",
	"PREVIEW_DEPLOYMENTS_DROPPED",
	"LETSENCRYPT_CERTS_NOT_EXPORTED",
	"REDIS_NO_DUMP",
	"WEBHOOK_TOKEN_REGENERATED",
	"DUMP_SKIPPED_TOO_LARGE",
	"DROP_SOURCE_NOT_EXPORTED",
	"MISSING_REQUIREMENT_BLOCKING",
	"ROTATION_DUMP_MAY_CONTAIN_USERS",
	"ROTATION_CHECK_CONSUMERS",
	"ROTATION_AMBIGUOUS_PASSWORD",
	"ROTATION_SKIPPED_UNSAFE_PASSWORD",
	"MONGO_ADMIN_USERS_NOT_RESTORED",
	"COMPOSE_DUMP_NOT_RESTORABLE",
	"BACKUP_DESTINATION_UNRESOLVED",
	"DUMP_FAILED",
	"FILE_PULL_FAILED",
	"NETWORK_UNRESOLVED",
	"IMAGE_TAG_NOT_PINNED",
	"DOKPLOY_VERSION_MISMATCH",
	"TRAEFIK_VERSION_MISMATCH",
	"INSTANCE_KIND_MISMATCH",
	"DOCKER_VERSION_MISMATCH",
]);
export type WarningCode = z.infer<typeof warningCodeSchema>;

export const warningSchema = z.object({
	code: warningCodeSchema,
	severity: z.enum(["info", "warning", "blocking"]),
	message: z.string(),
	affected: z.array(usedBySchema),
});
export type Warning = z.infer<typeof warningSchema>;

export const dumpIndexSchema = z.discriminatedUnion("mode", [
	z.object({
		serviceId: z.string(),
		serviceType: serviceTypeSchema,
		mode: z.literal("embed"),
		ext: z.string(),
		path: z.string(),
		bytes: z.number(),
	}),
	z.object({
		serviceId: z.string(),
		serviceType: serviceTypeSchema,
		mode: z.literal("referenceLastBackup"),
		destinationId: z.string(),
		keyPrefix: z.string(),
	}),
]);
export type DumpIndex = z.infer<typeof dumpIndexSchema>;

export const captureSourceSchema = z.object({
	kind: z.literal("project"),
	id: z.string(),
});
export type CaptureSource = z.infer<typeof captureSourceSchema>;

export const exportScopeSchema = z.object({
	environmentIds: z.array(z.string()).optional(),
	serviceIds: z.array(z.string()).optional(),
	includeEnvSecrets: z.boolean().default(true),
	shared: z
		.partialRecord(sharedResourceKindSchema, z.enum(["value", "reference"]))
		.default({}),
	files: z
		.object({
			applicationSources: z.boolean().default(true),
			composeFiles: z.boolean().default(true),
			traefikRaw: z.boolean().default(true),
			customCertificates: z.boolean().default(true),
		})
		.prefault({}),
	dumps: z
		.object({
			mode: z.enum(["embed", "referenceLastBackup", "none"]).default("none"),
		})
		.prefault({}),
	includeBackupSchedules: z.boolean().default(true),
});
export type ExportScope = z.infer<typeof exportScopeSchema>;

export const manifestCryptoSchema = z.object({
	salt: z.string(),
	kdfParams: z.object({
		N: z.number(),
		r: z.number(),
		p: z.number(),
		dkLen: z.number(),
	}),
	keyCheck: z.string(),
});
export type ManifestCrypto = z.infer<typeof manifestCryptoSchema>;

export const sourceInstanceSchema = z.object({
	dokployVersion: z.string(),
	organizationId: z.string(),
	releaseTag: z.string().optional(),
	isCloud: z.boolean().optional(),
	traefikVersion: z.string().optional(),
	nodeVersion: z.string().optional(),
	dockerVersions: z.record(z.string(), z.string()).optional(),
});
export type SourceInstance = z.infer<typeof sourceInstanceSchema>;

export const manifestSchema = z.object({
	format: z.literal(TRANSFER_FORMAT),
	formatVersion: z.number().int().min(1),
	exportedAt: z.string(),
	exportedBy: z.object({ userId: z.string(), email: z.string() }),
	sourceInstance: sourceInstanceSchema,
	scope: exportScopeSchema,
	crypto: manifestCryptoSchema,
	counts: z.partialRecord(resourceKindSchema, z.number()),
});
export type Manifest = z.infer<typeof manifestSchema>;

export const snapshotSchema = z.object({
	manifest: manifestSchema,
	resources: z.object({
		project: z.record(z.string(), z.unknown()),
		environments: z.array(z.record(z.string(), z.unknown())),
		services: z.array(z.record(z.string(), z.unknown())),
		shared: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
	}),
	requirements: z.array(requirementSchema),
	warnings: z.array(warningSchema),
	dumps: z.array(dumpIndexSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const inventorySchema = z.object({
	project: z.object({ name: z.string(), environments: z.number() }),
	environments: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			services: z.partialRecord(serviceTypeSchema, z.number()),
		}),
	),
	totals: z.partialRecord(resourceKindSchema, z.number()),
	estimatedDumpBytes: z.number(),
	estimatedFilesBytes: z.number(),
	images: z
		.array(
			z.object({
				serviceId: z.string(),
				serviceType: serviceTypeSchema,
				name: z.string(),
				image: z.string(),
			}),
		)
		.default([]),
});
export type Inventory = z.infer<typeof inventorySchema>;

export const targetSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("newProject"),
		name: z.string(),
		description: z.string().optional(),
	}),
	z.object({
		kind: z.literal("existingProject"),
		projectId: z.string(),
		environmentName: z.string(),
	}),
]);
export type Target = z.infer<typeof targetSchema>;

export const domainStrategySchema = z.discriminatedUnion("custom", [
	z.object({ custom: z.literal("keep") }),
	z.object({ custom: z.literal("prefix"), value: z.string() }),
	z.object({ custom: z.literal("suffix"), value: z.string() }),
	z.object({ custom: z.literal("disable") }),
]);
export type DomainStrategy = z.infer<typeof domainStrategySchema>;

export const proposedResolutionStatusSchema = z.enum([
	"resolved",
	"mappable",
	"createable",
	"missing",
]);
export type ProposedResolutionStatus = z.infer<
	typeof proposedResolutionStatusSchema
>;

export const proposedResolutionSchema = z.object({
	status: proposedResolutionStatusSchema,
	targetId: z.string().optional(),
	candidates: z
		.array(z.object({ id: z.string(), name: z.string() }))
		.optional(),
});
export type ProposedResolution = z.infer<typeof proposedResolutionSchema>;

export const resolutionActionSchema = z.enum(["reuse", "create", "skip"]);

export const resolutionSchema = z.object({
	requirementKey: z.string(),
	action: resolutionActionSchema,
	targetId: z.string().optional(),
});
export type Resolution = z.infer<typeof resolutionSchema>;

export const conflictKindSchema = z.enum([
	"domain",
	"port",
	"projectName",
	"network",
]);
export const conflictOptionSchema = z.enum(["rename", "skip", "keep"]);

export const conflictSchema = z.object({
	kind: conflictKindSchema,
	value: z.string(),
	existingId: z.string(),
	usedBy: z.array(usedBySchema),
	options: z.array(conflictOptionSchema),
});
export type Conflict = z.infer<typeof conflictSchema>;
export type ConflictKind = z.infer<typeof conflictKindSchema>;
export type ConflictOption = z.infer<typeof conflictOptionSchema>;

export const conflictResolutionSchema = z.object({
	action: conflictOptionSchema,
	value: z.string().optional(),
});
export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;

export const conflictKey = (conflict: Pick<Conflict, "kind" | "value">) =>
	`${conflict.kind}:${conflict.value}`;

export const pendingServiceSchema = z.object({
	serviceId: z.string(),
	serviceType: serviceTypeSchema,
	reason: z.string(),
});
export type PendingService = z.infer<typeof pendingServiceSchema>;

export const planValidationCheckSchema = z.object({
	check: z.string(),
	ok: z.boolean(),
	detail: z.string().optional(),
});
export type PlanValidationCheck = z.infer<typeof planValidationCheckSchema>;

export const planSchema = z.object({
	target: targetSchema,
	resolutions: z.record(z.string(), resolutionSchema),
	serverMap: z.record(z.string(), z.string().nullable()),
	appNameMap: z.record(z.string(), z.string()),
	domainStrategy: domainStrategySchema,
	portsStrategy: z.enum(["keep", "disable"]),
	rotateDatabaseCredentials: z.boolean().default(false),
	deployAfterImport: z.boolean().optional(),
	conflicts: z.array(conflictSchema),
	conflictResolutions: z
		.record(z.string(), conflictResolutionSchema)
		.optional(),
	pendingServices: z.array(pendingServiceSchema),
	warnings: z.array(warningSchema),
	validation: z.array(planValidationCheckSchema),
	summary: z.object({
		counts: z.partialRecord(resourceKindSchema, z.number()),
		domains: z.number(),
		dumps: z.number(),
	}),
});
export type Plan = z.infer<typeof planSchema>;

export const rotationEntrySchema = z.object({
	service: z.string(),
	field: z.string(),
	occurrences: z.number(),
});
export type RotationEntry = z.infer<typeof rotationEntrySchema>;

export const restoreErrorSchema = z.object({
	serviceId: z.string(),
	serviceName: z.string().optional(),
	error: z.string(),
});
export type RestoreError = z.infer<typeof restoreErrorSchema>;

export const transferResultSchema = z.object({
	idMap: z.record(z.string(), z.record(z.string(), z.string())),
	appNameMap: z.record(z.string(), z.string()),
	pendingRequirements: z.array(z.string()),
	pendingServices: z.array(pendingServiceSchema),
	rotations: z.array(rotationEntrySchema),
	restoreErrors: z.array(restoreErrorSchema),
	warnings: z.array(warningSchema),
});
export type TransferResult = z.infer<typeof transferResultSchema>;

export type Emit = (message: string) => void;
