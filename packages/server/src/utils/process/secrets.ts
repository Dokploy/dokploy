import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quote } from "shell-quote";

const shellSingleQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export const createSecretTempFile = (
	prefix: string,
	fileName: string,
	content: string | null | undefined,
) => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	chmodSync(dir, 0o700);
	const path = join(dir, fileName);
	writeFileSync(path, content || "", { mode: 0o600 });

	return {
		dir,
		path,
		quotedDir: quote([dir]),
		quotedPath: quote([path]),
	};
};

export const createGitAskPassScript = (token: string | null | undefined) => {
	const quotedToken = shellSingleQuote(token || "");
	const secret = createSecretTempFile(
		"dokploy-git-askpass-",
		"askpass.sh",
		`#!/bin/sh
case "$1" in
	*Username*) printf '%s\\n' oauth2 ;;
	*) printf '%s\\n' ${quotedToken} ;;
esac
`,
	);
	chmodSync(secret.path, 0o700);
	return secret;
};
