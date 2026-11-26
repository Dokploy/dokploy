import type { BackupMetadata } from "@dokploy/server/db/schema/backup-metadata";

export const getBackupSecrets = (
	metadata?: BackupMetadata | null,
): string[] => {
	const secrets: string[] = [];
	for (const settings of [
		metadata?.postgres,
		metadata?.mysql,
		metadata?.mariadb,
		metadata?.mongo,
	]) {
		if (settings?.databasePassword) secrets.push(settings.databasePassword);
	}
	if (metadata?.mysql?.databaseRootPassword)
		secrets.push(metadata.mysql.databaseRootPassword);
	for (const uri of [
		metadata?.postgres?.connectionUri,
		metadata?.mongo?.connectionUri,
	]) {
		if (!uri) continue;
		secrets.push(uri);
		const addEncodedSecret = (value: string) => {
			if (!value) return;
			secrets.push(value);
			try {
				secrets.push(decodeURIComponent(value));
			} catch {
				// A malformed escape must not prevent redaction of the raw value.
			}
		};
		// Database URIs support host lists, which the WHATWG URL parser rejects.
		const authority = uri.split("://")[1]?.split(/[/?#]/, 1)[0] ?? "";
		const userInfo = authority.slice(
			0,
			Math.max(authority.lastIndexOf("@"), 0),
		);
		const separator = userInfo.indexOf(":");
		if (separator >= 0) addEncodedSecret(userInfo.slice(separator + 1));
		const queryStart = uri.indexOf("?");
		if (queryStart >= 0) {
			for (const parameter of uri
				.slice(queryStart + 1)
				.split("#", 1)[0]!
				.split("&")) {
				const separator = parameter.indexOf("=");
				if (separator < 0) continue;
				let name = parameter.slice(0, separator);
				try {
					name = decodeURIComponent(name);
				} catch {
					// Keep the raw parameter name when the URI is malformed.
				}
				if (/password|secret|token/i.test(name))
					addEncodedSecret(parameter.slice(separator + 1));
			}
		}
	}
	return [
		...new Set(
			secrets.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]),
		),
	].sort((a, b) => b.length - a.length);
};

export const redactBackupError = (
	message: string,
	backup: { metadata?: BackupMetadata | null },
) =>
	getBackupSecrets(backup.metadata)
		.reduce((text, value) => text.split(value).join("[REDACTED]"), message)
		.replace(
			/(postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s]+/gi,
			"$1://[REDACTED]",
		)
		.slice(-2000);

// A shell word as produced by shell-quote: bare, 'single' or "double" quoted.
const SHELL_WORD = String.raw`(?:[^\s'"\\]|\\.|'[^']*'|"(?:[^"\\]|\\.)*")+`;

const ACCESS_KEY_PATTERN = new RegExp(
	`(--s3-access-key-id=)${SHELL_WORD}`,
	"g",
);
const SECRET_KEY_PATTERN = new RegExp(
	`(--s3-secret-access-key=)${SHELL_WORD}`,
	"g",
);

/**
 * Redacts S3 credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches the flag format produced by `getS3Credentials()`:
 *   --s3-access-key-id=VALUE  and  --s3-secret-access-key=VALUE (shell-quoted)
 */
export const redactRcloneCredentials = (command: string): string => {
	return command
		.replace(ACCESS_KEY_PATTERN, '$1"[REDACTED]"')
		.replace(SECRET_KEY_PATTERN, '$1"[REDACTED]"');
};
