import type { Destination } from "@dokploy/server/services/destination";
import { quote } from "shell-quote";
import { getS3Credentials } from "./utils";

export const RCLONE_GENERIC_PROVIDER = "RcloneConfig";

const RCLONE_REMOTE_REGEX =
	/^[a-zA-Z0-9][a-zA-Z0-9._-]*:(?:[a-zA-Z0-9._~/-]+)?$/;
const RCLONE_CONFIG_PATH_REGEX =
	/^\/(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/;

export type RcloneDestinationInput = Pick<
	Destination,
	| "provider"
	| "accessKey"
	| "secretAccessKey"
	| "bucket"
	| "region"
	| "endpoint"
	| "additionalFlags"
>;

export interface ResolvedRcloneDestination {
	flags: string[];
	remoteRoot: string;
}

const normalizeRcloneRemoteRoot = (remoteRoot: string) => {
	let normalized = remoteRoot.trim();
	while (normalized.endsWith("/") && !normalized.endsWith(":/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
};

export const getRcloneDestination = (
	destination: RcloneDestinationInput,
): ResolvedRcloneDestination => {
	if (destination.provider === RCLONE_GENERIC_PROVIDER) {
		if (!RCLONE_REMOTE_REGEX.test(destination.bucket)) {
			throw new Error(
				"Invalid rclone remote. Use a configured remote such as gdrive:dokploy-backups",
			);
		}
		if (!RCLONE_CONFIG_PATH_REGEX.test(destination.endpoint)) {
			throw new Error(
				"Invalid rclone config path. Use an absolute path containing only letters, numbers, dots, dashes, underscores and slashes",
			);
		}

		const flags = [`--config=${quote([destination.endpoint])}`];
		if (destination.additionalFlags?.length) {
			flags.push(...destination.additionalFlags);
		}

		return {
			flags,
			remoteRoot: normalizeRcloneRemoteRoot(destination.bucket),
		};
	}

	return {
		flags: getS3Credentials(destination as Destination),
		remoteRoot: `:s3:${destination.bucket}`,
	};
};

export const joinRclonePath = (remoteRoot: string, path = "") => {
	const normalizedRoot = normalizeRcloneRemoteRoot(remoteRoot);
	const normalizedPath = path.replace(/^\/+/, "");
	if (!normalizedPath) return normalizedRoot;
	if (normalizedRoot.endsWith(":") || normalizedRoot.endsWith(":/")) {
		return `${normalizedRoot}${normalizedPath}`;
	}
	return `${normalizedRoot}/${normalizedPath}`;
};
