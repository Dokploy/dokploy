import { ExecError, execAsync } from "@dokploy/server/utils/process/execAsync";
import { redactSecrets } from "@dokploy/server/utils/process/redact";
import { describe, expect, it } from "vitest";

describe("redactSecrets", () => {
	it("replaces every occurrence of each secret", () => {
		const out = redactSecrets("cmd KEY=hunter2 run KEY=hunter2 done", [
			"KEY=hunter2",
		]);
		expect(out).toBe("cmd *** run *** done");
		expect(out).not.toContain("hunter2");
	});

	it("redacts longest-first so overlapping values cannot partially survive", () => {
		const out = redactSecrets("prefix abcdefgh suffix", ["abcd", "abcdefgh"]);
		expect(out).toBe("prefix *** suffix");
	});

	it("skips empty entries and leaves text untouched without secrets", () => {
		expect(redactSecrets("plain text", [])).toBe("plain text");
		expect(redactSecrets("plain text", [""])).toBe("plain text");
	});
});

describe("execAsync build-secret redaction (dokploy#5354)", () => {
	const secretPair = "MY_API_KEY=sk-test-1234567890abcdef";

	it("failed build commands do not retain embedded secrets on the thrown error", async () => {
		// mirrors a failed nixpacks/docker build: non-zero exit, secrets inline
		const failure = await execAsync(`${secretPair} false`, {
			redact: [secretPair],
		}).catch((e: unknown) => e);

		expect(failure).toBeInstanceOf(ExecError);
		const err = failure as ExecError;
		expect(err.command).not.toContain("sk-test-1234567890abcdef");
		expect(err.command).toContain("***");
		expect(err.message).not.toContain("sk-test-1234567890abcdef");
		expect(err.getDetailedMessage()).not.toContain("sk-test-1234567890abcdef");
	});

	it("without a redaction set the old leak shape is still visible (control)", async () => {
		const failure = await execAsync(`${secretPair} false`).catch(
			(e: unknown) => e,
		);
		expect(failure).toBeInstanceOf(ExecError);
		// documents what callers got before the redact option existed
		expect((failure as ExecError).command).toContain(
			"sk-test-1234567890abcdef",
		);
	});

	it("successful commands resolve normally", async () => {
		const { stdout } = await execAsync("echo build-ok");
		expect(stdout.trim()).toBe("build-ok");
	});
});

describe("redaction follow-ups (greptile review on dokploy#5354)", () => {
	const secretPair = "MY_API_KEY=sk-test-1234567890abcdef";
	const exportForm = "export MY_API_KEY=sk-test-1234567890abcdef";

	it("railpack export-line form is stripped when included in the redaction set", () => {
		const out = redactSecrets(`Dockerfile:2\n${exportForm} && buildx build`, [
			exportForm,
		]);
		expect(out).not.toContain("sk-test-1234567890abcdef");
		expect(out).toContain("***");
	});

	it("the nested originalError no longer carries the raw command", async () => {
		const failure = await execAsync(`${secretPair} false`, {
			redact: [secretPair],
		}).catch((e: unknown) => e);
		expect(failure).toBeInstanceOf(ExecError);
		const err = failure as ExecError;
		// deploy handlers log the complete error object - the nested error must
		// not smuggle the command past the redaction set
		expect(String(err.originalError)).not.toContain(
			"sk-test-1234567890abcdef",
		);
		expect(String(err.originalError)).not.toContain(secretPair);
	});
});
