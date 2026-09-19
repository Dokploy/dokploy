/**
 * Redacts S3 credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches quoted and unquoted flag values produced by `getS3Credentials()`.
 */
export const redactRcloneCredentials = (command: string): string => {
	return command.replace(
		/(--s3-(?:access-key-id|secret-access-key)=)(?:(?:"[^"]*"|'[^']*'|\\.|[^\s'"])+)/g,
		'$1"[REDACTED]"',
	);
};
