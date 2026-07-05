/**
 * Redacts S3 credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches the flag format produced by `getS3Credentials()`:
 *   --s3-access-key-id="VALUE"  and  --s3-secret-access-key="VALUE"
 */
export const redactRcloneCredentials = (command: string): string => {
	return command
		.replace(/(--s3-access-key-id=)"[^"]*"/g, '$1"[REDACTED]"')
		.replace(/(--s3-secret-access-key=)"[^"]*"/g, '$1"[REDACTED]"');
};
