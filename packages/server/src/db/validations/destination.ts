export const ADDITIONAL_FLAG_REGEX = /^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/;
export const ADDITIONAL_FLAG_ERROR =
	"Invalid flag format. Must start with -- (e.g. --s3-sign-accept-encoding=false)";

export const RCLONE_DESTINATION_TYPES = [
	"ftp",
	"sftp",
	"drive",
	"onedrive",
] as const;

export type RcloneDestinationType = (typeof RCLONE_DESTINATION_TYPES)[number];

const RCLONE_DESTINATION_TYPE_SET = new Set<string>(RCLONE_DESTINATION_TYPES);

export const getRcloneDestinationType = (provider: string) => {
	const normalizedProvider = provider.trim().toLowerCase();
	if (RCLONE_DESTINATION_TYPE_SET.has(normalizedProvider)) {
		return normalizedProvider as RcloneDestinationType;
	}
	return "s3";
};
