/**
 * Redacts credentials from backup/restore command strings before they reach
 * logs or user-facing error output. Handles S3, FTP and SFTP rclone flags as
 * well as database passwords passed through the DB_PASS environment variable.
 */
export const redactRcloneCredentials = (command: string): string => {
	return command
		.replace(
			/(--(?:s3-access-key-id|s3-secret-access-key|ftp-pass|sftp-pass|sftp-key-file-pass)=)(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\\[^\r\n]|[^\s"'\\])+)/g,
			'$1"[REDACTED]"',
		)
		.replace(
			/(\bDB_PASS=)(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\\[^\r\n]|[^\s"'\\])+)/g,
			'$1"[REDACTED]"',
		);
};

export const getSafeRcloneErrorMessage = (error: unknown): string =>
	redactRcloneCredentials(
		error instanceof Error ? error.message : String(error),
	);
