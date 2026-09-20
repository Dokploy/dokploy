export const ADDITIONAL_FLAG_REGEX = /^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/;
export const ADDITIONAL_FLAG_ERROR =
	"Invalid flag format. Must start with -- (e.g. --s3-sign-accept-encoding=false)";

/**
 * Non-S3 destination providers backed by rclone.
 * "custom" resolves its backend type from the `type` key inside `rcloneConfig`.
 */
export const NON_S3_DESTINATION_PROVIDERS = [
	"ftp",
	"sftp",
	"drive",
	"onedrive",
	"custom",
] as const;

export const RCLONE_CONFIG_KEY_REGEX = /^[a-zA-Z0-9_]+$/;
export const RCLONE_BACKEND_TYPE_REGEX = /^[a-z0-9_]+$/i;

export const isNonS3DestinationProvider = (provider?: string | null): boolean =>
	NON_S3_DESTINATION_PROVIDERS.includes(
		(provider ?? "")
			.trim()
			.toLowerCase() as (typeof NON_S3_DESTINATION_PROVIDERS)[number],
	);

/**
 * Parses an rclone config body ("key = value" per line, optionally wrapped in a
 * single `[section]` header, `#`/`;` comments allowed) into a key/value map.
 */
export const parseRcloneConfig = (rawConfig: string) => {
	const config: Record<string, string> = {};
	let sawSection = false;
	for (const rawLine of rawConfig.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) continue;
		if (line.startsWith("[") && line.endsWith("]")) {
			if (sawSection) {
				return {
					config,
					error: "Only a single rclone config section is allowed",
				};
			}
			sawSection = true;
			continue;
		}
		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			return { config, error: `Invalid rclone config line: "${line}"` };
		}
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (!RCLONE_CONFIG_KEY_REGEX.test(key)) {
			return { config, error: `Invalid rclone option key: "${key}"` };
		}
		if (!value) {
			return { config, error: `Missing value for rclone option "${key}"` };
		}
		config[key] = value;
	}
	return { config, error: null as string | null };
};

export const validateRcloneDestinationConfig = (
	provider: string | null | undefined,
	rcloneConfig: string | null | undefined,
): string | null => {
	if (!isNonS3DestinationProvider(provider)) return null;
	if (!rcloneConfig?.trim()) {
		return "Rclone config is required for this provider";
	}
	const { config, error } = parseRcloneConfig(rcloneConfig);
	if (error) return error;
	const normalizedProvider = (provider ?? "").trim().toLowerCase();
	const configType = config.type?.trim().toLowerCase();
	if (normalizedProvider === "custom") {
		if (!configType || !RCLONE_BACKEND_TYPE_REGEX.test(configType)) {
			return 'Custom destinations require a valid "type = <backend>" entry (e.g. type = dropbox)';
		}
	} else if (configType && configType !== normalizedProvider) {
		return `Config type "${config.type}" does not match the selected provider`;
	}
	return null;
};
