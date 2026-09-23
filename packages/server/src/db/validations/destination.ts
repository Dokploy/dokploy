export const ADDITIONAL_FLAG_REGEX = /^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/;
export const ADDITIONAL_FLAG_ERROR =
	"Invalid flag format. Must start with -- (e.g. --s3-sign-accept-encoding=false)";

export const RCLONE_DESTINATION_PROVIDERS = {
	GOOGLE_DRIVE: "GoogleDrive",
	ONEDRIVE: "OneDrive",
	FTP: "FTP",
	SFTP: "SFTP",
	REMOTE: "RcloneRemote",
} as const;

export type RcloneDestinationProvider =
	(typeof RCLONE_DESTINATION_PROVIDERS)[keyof typeof RCLONE_DESTINATION_PROVIDERS];

const RCLONE_DESTINATION_PROVIDER_VALUES = new Set<string>(
	Object.values(RCLONE_DESTINATION_PROVIDERS),
);

export const isRcloneDestinationProvider = (
	provider: string | null | undefined,
): provider is RcloneDestinationProvider =>
	!!provider && RCLONE_DESTINATION_PROVIDER_VALUES.has(provider);

export const isNamedRcloneDestinationProvider = (
	provider: string | null | undefined,
) =>
	provider === RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE ||
	provider === RCLONE_DESTINATION_PROVIDERS.ONEDRIVE ||
	provider === RCLONE_DESTINATION_PROVIDERS.REMOTE;

export const RCLONE_REMOTE_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
export const RCLONE_REMOTE_NAME_ERROR =
	"Invalid rclone remote name. Use only letters, numbers, dots, underscores, and dashes";

export const FTP_TLS_REQUIRED_ERROR =
	"FTP destinations must use TLS. Add --ftp-explicit-tls for explicit FTPS (port 21) or --ftp-tls for implicit FTPS (port 990).";
export const FTP_TLS_CONFLICT_ERROR =
	"Choose either implicit FTPS or explicit FTPS, not both.";
export const FTP_CERTIFICATE_VERIFICATION_REQUIRED_ERROR =
	"FTP TLS certificate verification cannot be disabled.";
export const SFTP_HOST_KEY_REQUIRED_ERROR =
	"SFTP destinations must verify the server host key. Add --sftp-known-hosts-file=/path/to/known_hosts.";
export const RCLONE_PATH_ERROR = "Invalid rclone path";

const hasRcloneControlCharacters = (value: string) =>
	Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code <= 0x1f || code === 0x7f;
	});
const RCLONE_WINDOWS_DRIVE_PATH = /^[a-zA-Z]:/;

const decodeRclonePath = (value: string) => {
	let decoded = value;
	for (let index = 0; index < 8; index += 1) {
		if (!/%[0-9a-f]{2}/i.test(decoded)) return decoded;
		try {
			decoded = decodeURIComponent(decoded);
		} catch {
			return null;
		}
	}
	return decoded;
};

export const getRclonePathValidationError = (
	value: string,
	allowAbsolute: boolean,
) => {
	if (value.includes("\\")) return RCLONE_PATH_ERROR;
	const normalized = value;
	if (hasRcloneControlCharacters(normalized)) {
		return RCLONE_PATH_ERROR;
	}

	const decoded = decodeRclonePath(normalized);
	if (decoded === null) return RCLONE_PATH_ERROR;
	if (decoded.includes("\\")) return RCLONE_PATH_ERROR;

	const canonical = decoded.trim();
	if (hasRcloneControlCharacters(canonical)) {
		return RCLONE_PATH_ERROR;
	}
	if (
		(!allowAbsolute && canonical.startsWith("/")) ||
		RCLONE_WINDOWS_DRIVE_PATH.test(canonical)
	) {
		return RCLONE_PATH_ERROR;
	}
	if (
		canonical.split("/").some((segment) => segment === "." || segment === "..")
	) {
		return RCLONE_PATH_ERROR;
	}
	return undefined;
};

export const getRcloneBasePathValidationError = (value: unknown) => {
	if (typeof value !== "string") return RCLONE_PATH_ERROR;
	return getRclonePathValidationError(value, false);
};

const parseBooleanFlagValue = (
	flag: string,
	flagName: string,
): boolean | undefined => {
	if (flag === flagName) return true;
	const prefix = `${flagName}=`;
	if (!flag.startsWith(prefix)) return undefined;

	const value = flag.slice(prefix.length).toLowerCase();
	if (["1", "t", "true"].includes(value)) return true;
	if (["0", "f", "false"].includes(value)) return false;
	return undefined;
};

const getBooleanFlagValues = (flags: readonly string[], flagName: string) =>
	flags
		.filter((flag) => flag === flagName || flag.startsWith(`${flagName}=`))
		.map((flag) => parseBooleanFlagValue(flag, flagName));

const isBooleanFlagEnabled = (
	flags: readonly string[],
	flagName: string,
): boolean => {
	const values = getBooleanFlagValues(flags, flagName);
	return values.length > 0 && values.every((value) => value === true);
};

export const getFtpTlsState = (flags: readonly string[] | null | undefined) => {
	const values = flags ?? [];
	return {
		implicitTlsEnabled: isBooleanFlagEnabled(values, "--ftp-tls"),
		explicitTlsEnabled: isBooleanFlagEnabled(values, "--ftp-explicit-tls"),
	};
};

export const hasDisabledFtpCertificateVerification = (
	flags: readonly string[] | null | undefined,
): boolean => {
	const values = flags ?? [];
	return ["--ftp-no-check-certificate", "--no-check-certificate"].some(
		(flagName) => {
			const matchingValues = getBooleanFlagValues(values, flagName);
			return (
				matchingValues.length > 0 &&
				matchingValues.some((value) => value !== false)
			);
		},
	);
};

export const hasSftpHostKeyVerification = (
	flags: readonly string[] | null | undefined,
): boolean => {
	const prefix = "--sftp-known-hosts-file=";
	const knownHostsFlags = (flags ?? []).filter((flag) =>
		flag.startsWith(prefix),
	);
	if (knownHostsFlags.length !== 1) return false;

	const value = knownHostsFlags[0]?.slice(prefix.length).trim() ?? "";
	return value.length > 0 && value !== "none";
};

type DestinationValidationField =
	| "endpoint"
	| "accessKey"
	| "bucket"
	| "region"
	| "additionalFlags";

export interface DestinationValidationIssue {
	field: DestinationValidationField;
	message: string;
}

export interface DestinationValidationInput {
	provider?: string | null;
	accessKey?: string;
	bucket?: string;
	region?: string;
	endpoint?: string;
	additionalFlags?: readonly string[] | null;
}

export const getDestinationValidationIssues = (
	data: DestinationValidationInput,
): DestinationValidationIssue[] => {
	const issues: DestinationValidationIssue[] = [];
	const provider = data.provider;
	const flags = data.additionalFlags ?? [];

	const bucketIssue = getRcloneBasePathValidationError(data.bucket);
	if (bucketIssue) {
		issues.push({ field: "bucket", message: bucketIssue });
	}

	if (isNamedRcloneDestinationProvider(provider)) {
		if (!RCLONE_REMOTE_NAME_REGEX.test(data.endpoint?.trim() || "")) {
			issues.push({ field: "endpoint", message: RCLONE_REMOTE_NAME_ERROR });
		}
		return issues;
	}

	if (
		provider !== RCLONE_DESTINATION_PROVIDERS.FTP &&
		provider !== RCLONE_DESTINATION_PROVIDERS.SFTP
	) {
		return issues;
	}

	if (!data.endpoint?.trim()) {
		issues.push({ field: "endpoint", message: "Host is required" });
	}
	if (!data.accessKey?.trim()) {
		issues.push({ field: "accessKey", message: "Username is required" });
	}
	if (data.region?.trim()) {
		const port = Number(data.region);
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			issues.push({
				field: "region",
				message: "Port must be an integer between 1 and 65535",
			});
		}
	}

	if (provider === RCLONE_DESTINATION_PROVIDERS.FTP) {
		const { implicitTlsEnabled, explicitTlsEnabled } = getFtpTlsState(flags);
		if (!implicitTlsEnabled && !explicitTlsEnabled) {
			issues.push({
				field: "additionalFlags",
				message: FTP_TLS_REQUIRED_ERROR,
			});
		}
		if (implicitTlsEnabled && explicitTlsEnabled) {
			issues.push({
				field: "additionalFlags",
				message: FTP_TLS_CONFLICT_ERROR,
			});
		}
		if (hasDisabledFtpCertificateVerification(flags)) {
			issues.push({
				field: "additionalFlags",
				message: FTP_CERTIFICATE_VERIFICATION_REQUIRED_ERROR,
			});
		}
	} else if (!hasSftpHostKeyVerification(flags)) {
		issues.push({
			field: "additionalFlags",
			message: SFTP_HOST_KEY_REQUIRED_ERROR,
		});
	}

	return issues;
};
