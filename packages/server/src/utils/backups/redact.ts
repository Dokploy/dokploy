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
const FTP_HOST_PATTERN = new RegExp(`(--ftp-host=)${SHELL_WORD}`, "g");
const FTP_USER_PATTERN = new RegExp(`(--ftp-user=)${SHELL_WORD}`, "g");
const FTP_PASS_PATTERN = new RegExp(`(--ftp-pass=)${SHELL_WORD}`, "g");
const SFTP_HOST_PATTERN = new RegExp(`(--sftp-host=)${SHELL_WORD}`, "g");
const SFTP_USER_PATTERN = new RegExp(`(--sftp-user=)${SHELL_WORD}`, "g");
const SFTP_PASS_PATTERN = new RegExp(`(--sftp-pass=)${SHELL_WORD}`, "g");

const DRIVE_CLIENT_ID_PATTERN = new RegExp(
	`(--drive-client-id=)${SHELL_WORD}`,
	"g",
);
const DRIVE_CLIENT_SECRET_PATTERN = new RegExp(
	`(--drive-client-secret=)${SHELL_WORD}`,
	"g",
);
const DRIVE_TOKEN_PATTERN = new RegExp(`(--drive-token=)${SHELL_WORD}`, "g");
const ONEDRIVE_CLIENT_ID_PATTERN = new RegExp(
	`(--onedrive-client-id=)${SHELL_WORD}`,
	"g",
);
const ONEDRIVE_CLIENT_SECRET_PATTERN = new RegExp(
	`(--onedrive-client-secret=)${SHELL_WORD}`,
	"g",
);
const ONEDRIVE_TOKEN_PATTERN = new RegExp(
	`(--onedrive-token=)${SHELL_WORD}`,
	"g",
);

/**
 * Redacts credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches the flag format produced by getRcloneConfig():
 *   --s3-access-key-id=VALUE, --s3-secret-access-key=VALUE,
 *   --ftp-host=VALUE, --ftp-user=VALUE, --ftp-pass=VALUE,
 *   --sftp-host=VALUE, --sftp-user=VALUE, --sftp-pass=VALUE
 */
export const redactRcloneCredentials = (command: string): string => {
	return command
		.replace(ACCESS_KEY_PATTERN, '$1"[REDACTED]"')
		.replace(SECRET_KEY_PATTERN, '$1"[REDACTED]"')
		.replace(FTP_HOST_PATTERN, '$1"[REDACTED]"')
		.replace(FTP_USER_PATTERN, '$1"[REDACTED]"')
		.replace(FTP_PASS_PATTERN, '$1"[REDACTED]"')
		.replace(SFTP_HOST_PATTERN, '$1"[REDACTED]"')
		.replace(SFTP_USER_PATTERN, '$1"[REDACTED]"')
		.replace(SFTP_PASS_PATTERN, '$1"[REDACTED]"')
		.replace(DRIVE_CLIENT_ID_PATTERN, '$1"[REDACTED]"')
		.replace(DRIVE_CLIENT_SECRET_PATTERN, '$1"[REDACTED]"')
		.replace(DRIVE_TOKEN_PATTERN, '$1"[REDACTED]"')
		.replace(ONEDRIVE_CLIENT_ID_PATTERN, '$1"[REDACTED]"')
		.replace(ONEDRIVE_CLIENT_SECRET_PATTERN, '$1"[REDACTED]"')
		.replace(ONEDRIVE_TOKEN_PATTERN, '$1"[REDACTED]"');
};
