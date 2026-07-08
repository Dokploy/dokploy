export const ADDITIONAL_FLAG_REGEX = /^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/;
export const ADDITIONAL_FLAG_ERROR =
	"Invalid flag format. Must start with -- (e.g. --s3-sign-accept-encoding=false)";

const ALLOWED_RCLONE_S3_ADDITIONAL_FLAGS = new Set([
	"--s3-sign-accept-encoding",
]);

export const RCLONE_ADDITIONAL_FLAG_ERROR =
	"Additional flags can only use explicitly allowed rclone S3 options";

export const getAdditionalFlagName = (flag: string) =>
	flag.split("=", 1)[0]?.toLowerCase() || "";

export const isRcloneAdditionalFlagAllowed = (flag: string) =>
	ADDITIONAL_FLAG_REGEX.test(flag) &&
	ALLOWED_RCLONE_S3_ADDITIONAL_FLAGS.has(getAdditionalFlagName(flag));

export const assertRcloneAdditionalFlagsAllowed = (
	flags?: readonly string[] | null,
) => {
	for (const flag of flags || []) {
		if (!isRcloneAdditionalFlagAllowed(flag)) {
			throw new Error(RCLONE_ADDITIONAL_FLAG_ERROR);
		}
	}
};
