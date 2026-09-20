/**
 * Redacts credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Covers the flag format produced by `getS3Credentials()`:
 *   --s3-access-key-id="VALUE"  and  --s3-secret-access-key="VALUE"
 * as well as secret-bearing flags for rclone-backed destinations
 * (`--ftp-pass=`, `--sftp-key-pem=`, `--drive-token=`, ...).
 * Values may be double-quoted, single-quoted, or bare, matching the quoting
 * emitted by shell-quote on flag values.
 */
const SECRET_FLAG_PATTERN =
	/(--[\w-]*-(?:access-key-id|secret-access-key|client-secret|secret|token|pass|password\d*|key-pem|key-file|private-key|service-account-credentials|credentials|sas-key|account-key|shared-key|auth-token|bearer-token|key)=)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s'"])+/g;

export const redactRcloneCredentials = (command: string): string => {
	return command.replace(SECRET_FLAG_PATTERN, '$1"[REDACTED]"');
};
