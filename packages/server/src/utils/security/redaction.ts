export const REDACTED_SECRET_VALUE = "__DOKPLOY_REDACTED_SECRET__";

export type SecretRecord = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN =
	"(?:access[_-]?key|api[_-]?key|authorization|credential|private[_-]?key|refresh[_-]?token|secret|token|password|passwd|pwd)";

export const isRedactedSecretValue = (value: unknown) =>
	value === REDACTED_SECRET_VALUE;

export const redactSecretValue = <T>(value: T) => {
	if (value === null || value === undefined || value === "") {
		return value;
	}

	return REDACTED_SECRET_VALUE;
};

export const redactSecretFields = <T extends SecretRecord | null | undefined>(
	record: T,
	fields: string[],
) => {
	if (!record) {
		return record;
	}

	const redacted = { ...record };

	for (const field of fields) {
		if (field in redacted) {
			redacted[field] = redactSecretValue(redacted[field]);
		}
	}

	return redacted as T;
};

export const redactSecretFieldsList = <T extends SecretRecord>(
	records: T[],
	fields: string[],
) => records.map((record) => redactSecretFields(record, fields));

const redactNestedServerSecrets = <T>(server: T): T => {
	if (!server || typeof server !== "object") {
		return server;
	}

	const redacted = { ...(server as SecretRecord) };
	if ("command" in redacted) {
		redacted.command = redactSecretValue(redacted.command);
	}
	if (redacted.metricsConfig && typeof redacted.metricsConfig === "object") {
		const metricsConfig = { ...(redacted.metricsConfig as SecretRecord) };
		if (metricsConfig.server && typeof metricsConfig.server === "object") {
			metricsConfig.server = redactSecretFields(
				metricsConfig.server as SecretRecord,
				["token"],
			);
		}
		redacted.metricsConfig = metricsConfig;
	}
	if (redacted.sshKey && typeof redacted.sshKey === "object") {
		redacted.sshKey = redactSecretFields(redacted.sshKey as SecretRecord, [
			"privateKey",
		]);
	}

	return redacted as T;
};

export const redactDeployableServiceSecrets = <
	T extends SecretRecord | null | undefined,
>(
	record: T,
) => {
	const redacted = redactSecretFields(record, [
		"env",
		"previewEnv",
		"buildArgs",
		"buildSecrets",
		"previewBuildArgs",
		"previewBuildSecrets",
		"password",
		"refreshToken",
	]);
	if (!redacted) {
		return redacted;
	}

	const withRelations = { ...redacted };
	if (withRelations.security && typeof withRelations.security === "object") {
		withRelations.security = Array.isArray(withRelations.security)
			? withRelations.security.map(redactSecuritySecrets)
			: redactSecuritySecrets(withRelations.security as SecretRecord);
	}
	for (const key of ["server", "buildServer"]) {
		if (key in withRelations) {
			withRelations[key] = redactNestedServerSecrets(withRelations[key]);
		}
	}
	return withRelations as T;
};

export const redactDatabaseServiceSecrets = <
	T extends SecretRecord | null | undefined,
>(
	record: T,
) => {
	const redacted = redactSecretFields(record, [
		"env",
		"databasePassword",
		"databaseRootPassword",
	]);
	if (!redacted) {
		return redacted;
	}

	const withRelations = { ...redacted };
	if ("server" in withRelations) {
		withRelations.server = redactNestedServerSecrets(withRelations.server);
	}
	return withRelations as T;
};

export const redactAiSettingsSecrets = <
	T extends SecretRecord | null | undefined,
>(
	record: T,
) => redactSecretFields(record, ["apiKey"]);

export const redactAiSettingsSecretsList = <T extends SecretRecord>(
	records: T[],
) => records.map(redactAiSettingsSecrets);

export const redactSecuritySecrets = <
	T extends SecretRecord | null | undefined,
>(
	record: T,
) => redactSecretFields(record, ["password"]);

const redactNestedSecretRecord = (
	record: SecretRecord | null | undefined,
	fields: string[],
) => redactSecretFields(record, fields);

export const redactBackupMetadataSecrets = <T>(metadata: T): T => {
	if (!metadata || typeof metadata !== "object") {
		return metadata;
	}

	const redacted = { ...(metadata as SecretRecord) };
	if (redacted.mariadb && typeof redacted.mariadb === "object") {
		redacted.mariadb = redactNestedSecretRecord(
			redacted.mariadb as SecretRecord,
			["databasePassword"],
		);
	}
	if (redacted.mongo && typeof redacted.mongo === "object") {
		redacted.mongo = redactNestedSecretRecord(redacted.mongo as SecretRecord, [
			"databasePassword",
		]);
	}
	if (redacted.mysql && typeof redacted.mysql === "object") {
		redacted.mysql = redactNestedSecretRecord(redacted.mysql as SecretRecord, [
			"databaseRootPassword",
		]);
	}
	return redacted as T;
};

export const redactBackupScheduleSecrets = <
	T extends SecretRecord | null | undefined,
>(
	record: T,
) => {
	if (!record) {
		return record;
	}

	const redacted = {
		...record,
		metadata: redactBackupMetadataSecrets(record.metadata),
	};

	for (const key of ["postgres", "mysql", "mariadb", "mongo", "libsql"]) {
		if (redacted[key] && typeof redacted[key] === "object") {
			redacted[key] = redactDatabaseServiceSecrets(
				redacted[key] as SecretRecord,
			);
		}
	}

	return redacted as T;
};

export const redactProjectNestedSecrets = <
	T extends SecretRecord | null | undefined,
>(
	project: T,
	options: { redactProjectEnv?: boolean; redactEnvironmentEnv?: boolean } = {},
) => {
	if (!project) {
		return project;
	}

	const redactedProject = { ...project };
	if (options.redactProjectEnv !== false && "env" in redactedProject) {
		redactedProject.env = redactSecretValue(redactedProject.env);
	}

	if (!Array.isArray(redactedProject.environments)) {
		return redactedProject as T;
	}

	redactedProject.environments = redactedProject.environments.map(
		(environment) => {
			if (!environment || typeof environment !== "object") {
				return environment;
			}

			const redactedEnvironment = { ...(environment as SecretRecord) };
			if (
				options.redactEnvironmentEnv !== false &&
				"env" in redactedEnvironment
			) {
				redactedEnvironment.env = redactSecretValue(redactedEnvironment.env);
			}

			if (Array.isArray(redactedEnvironment.applications)) {
				redactedEnvironment.applications = redactedEnvironment.applications.map(
					redactDeployableServiceSecrets,
				);
			}
			if (Array.isArray(redactedEnvironment.compose)) {
				redactedEnvironment.compose = redactedEnvironment.compose.map(
					(service) =>
						redactSecretFields(redactDeployableServiceSecrets(service), [
							"composeFile",
						]),
				);
			}
			for (const key of [
				"libsql",
				"mariadb",
				"mongo",
				"mysql",
				"postgres",
				"redis",
			]) {
				if (Array.isArray(redactedEnvironment[key])) {
					redactedEnvironment[key] = (
						redactedEnvironment[key] as SecretRecord[]
					).map(redactDatabaseServiceSecrets);
				}
			}

			return redactedEnvironment;
		},
	);

	return redactedProject as T;
};

export const redactRollbackFullContextSecrets = <T>(fullContext: T): T => {
	if (!fullContext || typeof fullContext !== "object") {
		return fullContext;
	}

	const redacted = { ...(fullContext as SecretRecord) };
	for (const key of ["registry", "buildRegistry", "rollbackRegistry"]) {
		if (redacted[key] && typeof redacted[key] === "object") {
			redacted[key] = redactSecretFields(redacted[key] as SecretRecord, [
				"password",
			]);
		}
	}

	return redacted as T;
};

export function redactSensitiveText(value: string): string;
export function redactSensitiveText(value: null): null;
export function redactSensitiveText(value: undefined): undefined;
export function redactSensitiveText(value: string | null): string | null;
export function redactSensitiveText(
	value: string | undefined,
): string | undefined;
export function redactSensitiveText(
	value: string | null | undefined,
): string | null | undefined;
export function redactSensitiveText(value: string | null | undefined) {
	if (typeof value !== "string" || value === "") {
		return value;
	}

	let redacted = value;

	redacted = redacted.replace(
		/(\b[a-z][a-z0-9+.-]*:\/\/)([^@\s/?#]+)@/gi,
		`$1${REDACTED_SECRET_VALUE}@`,
	);

	redacted = redacted.replace(
		new RegExp(
			`([?&#][^=\\s]*${SENSITIVE_KEY_PATTERN}[^=\\s]*=)([^&#\\s]+)`,
			"gi",
		),
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		new RegExp(
			`(\\b[A-Z0-9_]*${SENSITIVE_KEY_PATTERN}[A-Z0-9_]*=)("[^"]*"|'[^']*'|[^\\s;&|]+)`,
			"gi",
		),
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		/(\bAuthorization\s*:\s*)(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi,
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		new RegExp(
			`((?:"[^"]*${SENSITIVE_KEY_PATTERN}[^"]*"|'[^']*${SENSITIVE_KEY_PATTERN}[^']*'|\\b[^\\s:,{]*${SENSITIVE_KEY_PATTERN}[^\\s:,{]*\\b)\\s*:\\s*)("[^"]*"|'[^']*'|[^\\s,}\\]]+)`,
			"gi",
		),
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		new RegExp(
			`(\\s--?[a-z0-9-]*${SENSITIVE_KEY_PATTERN}[a-z0-9-]*(?:=|\\s+))("[^"]*"|'[^']*'|[^\\s;&|]+)`,
			"gi",
		),
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		/(\b(?:PASSWORD|IDENTIFIED\s+BY)\s+)('[^']*'|"[^"]*"|[^\s;&|]+)/gi,
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		/(\bredis-cli\b[^\n;&|]*?\s-a\s+)("[^"]*"|'[^']*'|[^\s;&|]+)/gi,
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		/(\bCONFIG\s+SET\s+requirepass\s+)("[^"]*"|'[^']*'|[^\s;&|]+)/gi,
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		/(\bmongo(?:dump|export|import|restore|sh)?\b[^\n;&|]*?\s-p\s+)[^\n;&|]+/gi,
		`$1${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		/(\b(?:postgres(?:ql)?|mysql|mariadb|mongodb|redis):\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi,
		`$1${REDACTED_SECRET_VALUE}$3`,
	);

	redacted = redacted.replace(
		/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi,
		`$1 ${REDACTED_SECRET_VALUE}`,
	);

	redacted = redacted.replace(
		/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
		REDACTED_SECRET_VALUE,
	);

	return redacted;
}

export const secretUpdateValue = (value: unknown) => {
	if (
		typeof value !== "string" ||
		value.trim() === "" ||
		isRedactedSecretValue(value)
	) {
		return undefined;
	}

	return value;
};
