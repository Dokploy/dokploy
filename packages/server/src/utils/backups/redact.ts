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
// `pass` flags hold either an obscured value or the shell command substitution
// produced by `getObscuredPassFlag()` (`$(rclone obscure '<password>')`), which
// contains spaces and must be matched as a whole.
const PASS_KEY_PATTERN = new RegExp(
	`(--(?:sftp|ftp|webdav)-pass=)(\\$\\(rclone [^)]*\\)|${SHELL_WORD})`,
	"g",
);

/**
 * Redacts S3 credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches the flag format produced by `getS3Credentials()`:
 *   --s3-access-key-id=VALUE  and  --s3-secret-access-key=VALUE (shell-quoted)
 * As well as the pass flags produced by the sftp/ftp/webdav credential helpers.
 */
export const redactRcloneCredentials = (command: string): string => {
	return command
		.replace(ACCESS_KEY_PATTERN, '$1"[REDACTED]"')
		.replace(SECRET_KEY_PATTERN, '$1"[REDACTED]"')
		.replace(PASS_KEY_PATTERN, '$1"[REDACTED]"');
};
