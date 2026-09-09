/**
 * Secret redaction for build/deploy command errors.
 *
 * Build commands embed environment secrets inline (nixpacks/railpack
 * `--env KEY=VALUE` args, docker-file's `KEY=VALUE docker build ...` shell
 * prefix), and ExecError retains the full command string - so a failed build
 * can carry every secret into whatever surface logs or displays the error.
 * Redaction happens once, at the error boundary, so downstream log and UI
 * surfaces only ever see "***".
 */
export const redactSecrets = (text: string, secrets: string[]): string => {
	let redacted = text;
	// Longest first so overlapping values cannot partially survive.
	for (const secret of secrets
		.filter(Boolean)
		.sort((a, b) => b.length - a.length)) {
		redacted = redacted.split(secret).join("***");
	}
	return redacted;
};
