export const ADDITIONAL_FLAG_REGEX = /^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/;
export const ADDITIONAL_FLAG_ERROR =
	"Invalid flag format. Must start with -- (e.g. --s3-sign-accept-encoding=false)";

// rclone runs as root on the host (the Dokploy server itself in self-hosted
// mode), so flags that read or write local files, run programs or open a
// listener would turn `destination:create` into host access.
const BLOCKED_FLAG_NAMES = [
	"config",
	"log-file",
	"metadata-mapper",
	"cpuprofile",
	"memprofile",
	"cache-dir",
	"temp-dir",
	"ca-cert",
	"client-cert",
	"client-key",
	"files-from",
	"filter-from",
	"include-from",
	"exclude-from",
	"rc",
	"metrics",
	"s3-env-auth",
	"s3-profile",
	"s3-shared-credentials-file",
];

export const isAllowedAdditionalFlag = (flag: string) => {
	const name = (flag.replace(/^--/, "").split("=")[0] ?? "").toLowerCase();
	return (
		!name.endsWith("-command") &&
		!BLOCKED_FLAG_NAMES.some(
			(blocked) => name === blocked || name.startsWith(`${blocked}-`),
		)
	);
};

export const ADDITIONAL_FLAG_BLOCKED_ERROR =
	"This flag is not allowed: it can read or write local files, run programs or open ports";
