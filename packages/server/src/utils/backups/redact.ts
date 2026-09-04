/**
 * Redacts credentials from rclone command strings before they reach logs or
 * user-facing error output. Handles both the existing S3 flags and the
 * provider-specific FTP/SFTP credential flags used by backup destinations.
 */
export const redactRcloneCredentials = (command: string): string => {
	return command.replace(
		/(--(?:s3-access-key-id|s3-secret-access-key|ftp-pass|sftp-pass|sftp-key-file-pass)=)(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g,
		'$1"[REDACTED]"',
	);
};