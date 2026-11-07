// Remote commands run in the SSH user's login shell, which is often dash
// (/bin/sh) and rejects bash options such as `set -o pipefail`.
export const wrapInBash = (script: string) =>
	`bash -c '${script.replaceAll("'", `'\\''`)}'`;
