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
// `pass` flags hold either an obscured secret or the command substitution
// produced by `getObscuredPassFlag()` (`$(rclone obscure '<password>')`). The
// substitution contains spaces and quoted characters such as `)`, so it is
// located with a quote-aware scan instead of a fixed pattern.
const PASS_FLAG_PATTERN = /--(?:sftp|ftp|webdav)-pass=/g;

const findPassValueEnd = (
	command: string,
	start: number,
): number | undefined => {
	if (!command.startsWith("$(", start)) {
		const match = new RegExp(`^${SHELL_WORD}`).exec(command.slice(start));
		return match ? start + match[0].length : undefined;
	}

	let depth = 1;
	let inSingleQuote = false;
	let inDoubleQuote = false;

	for (let i = start + 2; i < command.length; i++) {
		const char = command[i];
		if (inSingleQuote) {
			if (char === "'") inSingleQuote = false;
		} else if (inDoubleQuote) {
			if (char === "\\") i++;
			else if (char === '"') inDoubleQuote = false;
		} else if (char === "'") {
			inSingleQuote = true;
		} else if (char === '"') {
			inDoubleQuote = true;
		} else if (char === "\\") {
			i++;
		} else if (char === "(") {
			depth++;
		} else if (char === ")" && --depth === 0) {
			return i + 1;
		}
	}

	return undefined;
};

/**
 * Redacts S3 credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches the flag format produced by `getS3Credentials()`:
 *   --s3-access-key-id=VALUE  and  --s3-secret-access-key=VALUE (shell-quoted)
 * As well as the pass flags produced by the sftp/ftp/webdav credential helpers.
 */
export const redactRcloneCredentials = (command: string): string => {
	let redacted = command.replace(ACCESS_KEY_PATTERN, '$1"[REDACTED]"');
	redacted = redacted.replace(SECRET_KEY_PATTERN, '$1"[REDACTED]"');

	let result = "";
	let cursor = 0;
	PASS_FLAG_PATTERN.lastIndex = 0;
	for (
		let m = PASS_FLAG_PATTERN.exec(redacted);
		m;
		m = PASS_FLAG_PATTERN.exec(redacted)
	) {
		const valueStart = m.index + m[0].length;
		const valueEnd = findPassValueEnd(redacted, valueStart);
		result += `${redacted.slice(cursor, m.index)}${m[0]}"[REDACTED]"`;
		if (valueEnd === undefined) {
			cursor = valueStart;
			break;
		}
		cursor = valueEnd;
	}
	return result + redacted.slice(cursor);
};
