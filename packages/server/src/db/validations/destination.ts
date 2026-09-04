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
	"Rclone remote name may contain only letters, numbers, dots, underscores, and dashes";

export const FTP_TLS_REQUIRED_ERROR =
	"FTP destinations must use TLS. Add --ftp-explicit-tls for explicit FTPS (port 21) or --ftp-tls for implicit FTPS (port 990).";
export const FTP_TLS_CONFLICT_ERROR =
	"Choose either implicit FTPS or explicit FTPS, not both.";
export const SFTP_HOST_KEY_REQUIRED_ERROR =
	"SFTP destinations must verify the server host key. Add --sftp-known-hosts-file=/path/to/known_hosts.";

const isBooleanFlagEnabled = (
	flags: readonly string[],
	flagName: string,
): boolean =>
	(flags.includes(flagName) || flags.includes(`${flagName}=true`)) &&
	!flags.includes(`${flagName}=false`);

export const getFtpTlsState = (
	flags: readonly string[] | null | undefined,
) => {
	const values = flags ?? [];
	return {
		implicitTlsEnabled: isBooleanFlagEnabled(values, "--ftp-tls"),
		explicitTlsEnabled: isBooleanFlagEnabled(values, "--ftp-explicit-tls"),
	};
};

export const hasSftpHostKeyVerification = (
	flags: readonly string[] | null | undefined,
): boolean =>
	(flags ?? []).some((flag) => {
		const prefix = "--sftp-known-hosts-file=";
		if (!flag.startsWith(prefix)) return false;
		const value = flag.slice(prefix.length).trim();
		return value.length > 0 && value !== "none";
	});
