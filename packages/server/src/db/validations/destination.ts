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
