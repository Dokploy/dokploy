import type {
	CaddyCompileOptions,
	CaddyHeaderMap,
	CaddyRouteRedirectScheme,
	CaddyRouteTransform,
} from "../types";

export type CaddyMigrationWarningCode =
	| "unsupported-rule"
	| "unsupported-matcher"
	| "unsupported-router"
	| "unsupported-service"
	| "unsupported-middleware"
	| "unsupported-security-middleware"
	| "unsupported-domain-field"
	| "unresolved-middleware"
	| "unresolved-service"
	| "shadowed-route"
	| "conflicting-manual-fragment"
	| "unreachable-upstream"
	| "invalid-label"
	| "invalid-config"
	| "missing-input"
	| "missing-certificate"
	| "validation-failed"
	| "health-check-failed"
	| "backup-failed"
	| "apply-failed"
	| "rollback-failed";

export interface CaddyMigrationWarning {
	code: CaddyMigrationWarningCode;
	message: string;
	blocking: boolean;
	source?: string;
	routerName?: string;
	serviceName?: string;
	middlewareName?: string;
	label?: string;
}

export interface CaddyMiddlewareTranslation {
	transforms: CaddyRouteTransform;
	basicAuth: { username: string; hash: string }[];
	allowedRemoteIps?: string[] | null;
	redirectScheme?: CaddyRouteRedirectScheme | null;
	warnings: CaddyMigrationWarning[];
}

export type ResolvedCaddyMiddleware = Omit<
	CaddyMiddlewareTranslation,
	"warnings"
>;

export type KnownTraefikMiddlewareMap = Record<
	string,
	Partial<ResolvedCaddyMiddleware> & {
		transforms?: CaddyRouteTransform;
		basicAuth?: { username: string; hash: string }[];
		responseHeaders?: CaddyHeaderMap;
		requestHeaders?: CaddyHeaderMap;
	}
>;

export interface TraefikRuleMatch {
	hosts: string[];
	pathPrefix?: string | null;
	pathExact?: string | null;
}

export type CaddyMigrationStatus =
	| "prepared"
	| "applying"
	| "applied"
	| "failed"
	| "rolling_back"
	| "rolled_back";

export interface CaddyMigrationArtifactPaths {
	root: string;
	reportJson: string;
	reportMd: string;
	caddyJson: string;
	fragmentsDir: string;
	backupsDir: string;
}

export interface CaddyMigrationFileBackup {
	label: string;
	source: string;
	backupPath: string;
	existed: boolean;
}

export interface CaddyMigrationResourceSnapshot {
	resourceName: string;
	resourceType: "service" | "standalone" | "unknown";
	running: boolean;
	replicas?: number;
	env?: string;
	additionalPorts?: {
		targetPort: number;
		publishedPort: number;
		protocol?: string;
	}[];
	image?: string;
	binds?: string[];
	mounts?: Array<Record<string, unknown>>;
	networks?: Array<string | Record<string, unknown>>;
	labels?: Record<string, string>;
	containerLabels?: Record<string, string>;
	placement?: Record<string, unknown>;
	endpointPorts?: Array<Record<string, unknown>>;
	restartPolicy?: Record<string, unknown>;
}

export interface CaddyMigrationBackupSummary {
	createdAt: string;
	traefikResource?: CaddyMigrationResourceSnapshot;
	caddyResource?: CaddyMigrationResourceSnapshot;
	restoreSnapshotPath?: string;
	files?: CaddyMigrationFileBackup[];
}

export interface CaddyMigrationRuntimePreflightRoute {
	routeId: string;
	routeHosts: string[];
	source: string;
	sourceFragment?: string;
	upstream: string;
	normalizedHost: string;
	normalizedPort: number;
	network: string;
}

export interface CaddyMigrationRuntimePreflightCheck {
	dial: string;
	host: string;
	port: number;
	network: string;
	status: "passed" | "failed";
	reason?: string;
	routes: CaddyMigrationRuntimePreflightRoute[];
}

export interface CaddyMigrationRuntimePreflight {
	status: "passed" | "failed" | "skipped";
	checkedAt?: string;
	network: string;
	networks?: string[];
	probeMode?: "standalone" | "service";
	probeImage: string;
	checks: CaddyMigrationRuntimePreflightCheck[];
}

export interface CaddyMigrationReport {
	migrationId: string;
	serverId: string | null;
	createdAt: string;
	updatedAt: string;
	status: CaddyMigrationStatus;
	sourceProvider: "traefik";
	targetProvider: "caddy";
	artifactPaths: CaddyMigrationArtifactPaths;
	inputs: {
		traefikStaticConfigPath: string;
		traefikStaticConfigFound: boolean;
		dynamicFiles: string[];
		dbApplicationDomains: number;
		dbComposeDomains: number;
		composeFilesScanned: string[];
		composeFilesSkipped: Array<{ path: string; reason: string }>;
	};
	summary: {
		fragments: number;
		routes: number;
		warnings: number;
		blockingWarnings: number;
	};
	validation: {
		status: "passed" | "failed" | "skipped";
		message?: string;
	};
	compileSettings?: Pick<
		CaddyCompileOptions,
		"letsEncryptEmail" | "trustedProxies" | "accessLogs"
	>;
	runtimePreflight?: CaddyMigrationRuntimePreflight;
	warnings: CaddyMigrationWarning[];
	backup?: CaddyMigrationBackupSummary;
	events: Array<{
		at: string;
		type: string;
		message: string;
	}>;
}

export const createMigrationWarning = (
	warning: CaddyMigrationWarning,
): CaddyMigrationWarning => warning;
