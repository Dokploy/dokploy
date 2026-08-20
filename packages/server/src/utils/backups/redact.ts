/**
 * Redacts S3 credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 *
 * `getS3Credentials()` passes values through shell-quote, which leaves
 * "safe" values (hex keys, tokens without spaces) UNQUOTED and quotes the
 * others — so every flag form must be covered:
 *   --s3-access-key-id=VALUE        (unquoted — the v0.29.13 leak)
 *   --s3-access-key-id="VALUE"      (double quotes)
 *   --s3-access-key-id='VALUE'      (single quotes, incl. shell-quote's '\'' idiom)
 *   --s3-access-key-id VALUE        (space separated, any quoting)
 *   --s3-access-key-id="UNTERMINATED (truncated strings — last-resort pass)
 */
const SENSITIVE_RCLONE_FLAGS = [
	"--s3-access-key-id",
	"--s3-secret-access-key",
] as const;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Double-quoted value, tolerating escaped characters inside.
const DOUBLE_QUOTED = String.raw`"(?:[^"\\]|\\.)*"`;
// Single-quoted value, including shell-quote's embedded-quote idiom ('a'\''b').
const SINGLE_QUOTED = String.raw`'[^']*'(?:\\''[^']*')*`;
// Bare value: a single shell token without quotes or whitespace.
const BARE = String.raw`[^\s"']+`;

export const redactRcloneCredentials = (command: string): string => {
	if (!command) {
		return command;
	}

	let result = command;
	for (const flag of SENSITIVE_RCLONE_FLAGS) {
		const f = escapeRegExp(flag);
		result = result
			// --flag="value" / --flag "value"
			.replace(new RegExp(`(${f}=)${DOUBLE_QUOTED}`, "g"), '$1"[REDACTED]"')
			.replace(new RegExp(`(${f}\\s+)${DOUBLE_QUOTED}`, "g"), '$1"[REDACTED]"')
			// --flag='value' / --flag 'value'
			.replace(new RegExp(`(${f}=)${SINGLE_QUOTED}`, "g"), "$1'[REDACTED]'")
			.replace(new RegExp(`(${f}\\s+)${SINGLE_QUOTED}`, "g"), "$1'[REDACTED]'")
			// --flag=value / --flag value (unquoted — must run after the
			// quoted forms so the quote characters are never left behind)
			.replace(new RegExp(`(${f}=)${BARE}`, "g"), "$1[REDACTED]")
			.replace(new RegExp(`(${f}\\s+)${BARE}`, "g"), "$1[REDACTED]")
			// Last resort: unterminated quoted value (e.g. a truncated command
			// string in an error message). Runs after every other pass and
			// skips values already replaced by the placeholder.
			.replace(
				new RegExp(`(${f}=)["'](?!\\[REDACTED\\])[^\\s]*`, "g"),
				"$1[REDACTED]",
			)
			.replace(
				new RegExp(`(${f}\\s+)["'](?!\\[REDACTED\\])[^\\s]*`, "g"),
				"$1[REDACTED]",
			);
	}
	return result;
};
