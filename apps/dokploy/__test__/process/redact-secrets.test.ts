import { redactSecrets } from "@dokploy/server/utils/process/redactSecrets";
import { describe, expect, it } from "vitest";

// All key material below is synthetic: these base64 strings decode to the
// literal text "synthetic-test-not-a-real-...-key" and are not real keys.

describe("redactSecrets", () => {
	it("redacts a PEM private key block written to /tmp/id_rsa", () => {
		const secret = "c3ludGhldGljLXRlc3Qtbm90LWEtcmVhbC1wcml2YXRlLWtleQ==";
		const command =
			`echo "-----BEGIN OPENSSH PRIVATE KEY-----\n${secret}\n-----END OPENSSH PRIVATE KEY-----" > /tmp/id_rsa;` +
			"chmod 600 /tmp/id_rsa;git clone --branch main --depth 1 git@example.com:org/repo /code";

		const redacted = redactSecrets(command);

		expect(redacted).not.toContain(secret);
		expect(redacted).toContain("[REDACTED PRIVATE KEY]");
		expect(redacted).toContain("chmod 600 /tmp/id_rsa");
		expect(redacted).toContain("git clone --branch main");
	});

	it("redacts a base64 key piped to base64 -d", () => {
		const secret = "c3ludGhldGljLXRlc3Qtbm90LWEtcmVhbC1jZXJ0LWtleQ==";
		const command = `echo "${secret}" | base64 -d > "/etc/dokploy/cert.key";`;

		const redacted = redactSecrets(command);

		expect(redacted).not.toContain(secret);
		expect(redacted).toContain('echo "[REDACTED]" | base64 -d');
	});

	it("leaves commands without secrets untouched", () => {
		const command =
			"git clone --branch main --depth 1 git@github.com:org/repo.git /tmp/code";

		expect(redactSecrets(command)).toBe(command);
	});
});
