/**
 * Redacts credentials from rclone command strings before they reach logs.
 *
 * In addition to Dokploy's S3 flags, generic rclone destinations can carry
 * provider-specific password, secret, or token flags. Keep their values out of
 * structured logs and error output regardless of quoting style.
 */
export const redactRcloneCredentials = (command: string): string => {
	return command.replace(
		/(--(?:s3-access-key-id|s3-secret-access-key|[a-zA-Z0-9-]*(?:password|secret|token)[a-zA-Z0-9-]*)=)(?:"[^"]*"|'[^']*'|[^\s]+)/gi,
		'$1"[REDACTED]"',
	);
};
