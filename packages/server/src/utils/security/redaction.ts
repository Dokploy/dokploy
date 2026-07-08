export const REDACTED_SECRET_VALUE = "__DOKPLOY_REDACTED_SECRET__";
const MCP_REDACTED_SECRET_VALUE = "[REDACTED]";

export type SecretRecord = Record<string, unknown>;

export const isSecretPlaceholderValue = (value: unknown) =>
	typeof value === "string" &&
	(value.includes(REDACTED_SECRET_VALUE) ||
		value.includes(MCP_REDACTED_SECRET_VALUE));

export const redactSecretValue = <T>(value: T) => {
	if (value === null || value === undefined || value === "") {
		return value;
	}

	return REDACTED_SECRET_VALUE;
};

export const redactSecretFields = <T extends SecretRecord | null | undefined>(
	record: T,
	fields: readonly string[],
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

export const preserveSecretPlaceholderFields = <
	TUpdate extends object,
	TCurrent extends object,
>(
	update: TUpdate,
	current: TCurrent,
	fields: readonly (keyof TUpdate & keyof TCurrent)[],
) => {
	const next: Record<PropertyKey, unknown> = {
		...(update as unknown as Record<PropertyKey, unknown>),
	};
	const currentRecord = current as Record<PropertyKey, unknown>;

	for (const field of fields) {
		if (isSecretPlaceholderValue(next[field])) {
			next[field] = currentRecord[field];
		}
	}

	return next as TUpdate;
};
