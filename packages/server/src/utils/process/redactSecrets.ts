// Dokploy embeds some secrets directly into the shell commands it runs: the
// SSH key written to /tmp/id_rsa when cloning over SSH, and the base64 TLS key
// piped to `base64 -d` when provisioning certificates on a remote server. When
// such a command fails, its ExecError (command/stdout/stderr) is logged, which
// would otherwise persist the secret in plain text. These helpers strip that
// material before it can reach the logs.

const PRIVATE_KEY_BLOCK =
	/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

const BASE64_DECODE_PIPE = /echo "[A-Za-z0-9+/=]+"\s*\|\s*base64 -d/g;

export const redactSecrets = (value: string): string =>
	value
		.replace(PRIVATE_KEY_BLOCK, "[REDACTED PRIVATE KEY]")
		.replace(BASE64_DECODE_PIPE, 'echo "[REDACTED]" | base64 -d');

// Node's child_process errors repeat the failed command on `message`, `stack`
// and `cmd`, so redact those too when wrapping an original error.
export const redactErrorSecrets = <T extends Error>(error: T): T => {
	const candidate = error as T & { cmd?: string };
	candidate.message = redactSecrets(candidate.message);
	if (candidate.stack) {
		candidate.stack = redactSecrets(candidate.stack);
	}
	if (candidate.cmd) {
		candidate.cmd = redactSecrets(candidate.cmd);
	}
	return candidate;
};
