/**
 * Redacts credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Covers the flag format produced by `getS3Credentials()`:
 *   --s3-access-key-id="VALUE"  and  --s3-secret-access-key="VALUE"
 * as well as secret-bearing flags for rclone-backed destinations
 * (`--ftp-pass=`, `--sftp-key-pem=`, `--drive-token=`, ...).
 * Values may be double-quoted, single-quoted, or bare, matching the quoting
 * emitted by shell-quote on flag values. A single-quoted segment is `'[^']*'`
 * because POSIX single quotes contain no escapes; shell-quote renders an
 * embedded apostrophe as the concatenation `'...'\''...'`, which the `\\.`
 * alternative consumes between segments. `\` is excluded from the bare-char
 * alternative so a trailing backslash inside quotes can't swallow the closing
 * quote (e.g. `'trailing\'`).
 */
const SECRET_OPTIONS =
	"access-key-id|secret-access-key|client-secret|secret|token|pass|password\\d*|key-pem|key-file|private-key|service-account-credentials|credentials|sas-key|account-key|shared-key|auth-token|bearer-token|key";

const SECRET_FLAG_PATTERN = new RegExp(
	`(--[\\w-]*-(?:${SECRET_OPTIONS})=)("(?:[^"\\\\]|\\\\.)*"|'[^']*'|\\\\.|[^\\s'"\\\\])+`,
	"g",
);

/** Matches flag names ending in a credential option, e.g. `sftp-pass`, `drive-token`. */
export const RCLONE_SECRET_OPTION_REGEX = new RegExp(
	`-(?:${SECRET_OPTIONS})$`,
	"i",
);

export const redactRcloneCredentials = (command: string): string => {
	return command.replace(SECRET_FLAG_PATTERN, '$1"[REDACTED]"');
};
