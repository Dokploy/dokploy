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
const FTP_PASS_PATTERN = new RegExp(`(--ftp-pass=)${SHELL_WORD}`, "g");
const SFTP_PASS_PATTERN = new RegExp(`(--sftp-pass=)${SHELL_WORD}`, "g");
const SFTP_KEY_FILE_PASS_PATTERN = new RegExp(
	`(--sftp-key-file-pass=)${SHELL_WORD}`,
	"g",
);

/**
 * Redacts credentials from rclone command strings before they reach logs or
 * user-facing error output. Handles both the existing S3 flags and the
 * provider-specific FTP/SFTP credential flags used by backup destinations.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches the flag format produced by `getS3Credentials()`:
 *   --s3-access-key-id=VALUE  and  --s3-secret-access-key=VALUE (shell-quoted)
 */
export const redactRcloneCredentials = (command: string): string => {
	return command
		.replace(ACCESS_KEY_PATTERN, '$1"[REDACTED]"')
		.replace(SECRET_KEY_PATTERN, '$1"[REDACTED]"')
		.replace(FTP_PASS_PATTERN, '$1"[REDACTED]"')
		.replace(SFTP_PASS_PATTERN, '$1"[REDACTED]"')
		.replace(SFTP_KEY_FILE_PASS_PATTERN, '$1"[REDACTED]"');
};

export const getSafeRcloneErrorMessage = (error: unknown): string =>
	redactRcloneCredentials(
		error instanceof Error ? error.message : String(error),
	);
