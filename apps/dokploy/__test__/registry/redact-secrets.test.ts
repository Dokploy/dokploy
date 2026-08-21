import { redactExecError, redactSecrets } from "@dokploy/server/services/registry";
import { ExecError } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it } from "vitest";

describe("redactSecrets", () => {
	it("replaces a secret with ***", () => {
		const command = `printf %s 'sup3r-secret' | docker login registry.example.com -u user --password-stdin`;
		expect(redactSecrets(command, ["sup3r-secret"])).toBe(
			"printf %s '***' | docker login registry.example.com -u user --password-stdin",
		);
	});

	it("redacts every occurrence of a secret", () => {
		expect(redactSecrets("pw=abc and again abc", ["abc"])).toBe(
			"pw=*** and again ***",
		);
	});

	it("redacts multiple secrets", () => {
		expect(redactSecrets("a then b", ["a", "b"])).toBe("*** then ***");
	});

	it("ignores empty, null and undefined secrets", () => {
		const text = "nothing to redact";
		expect(redactSecrets(text, ["", null, undefined])).toBe(text);
	});

	it("leaves the text untouched when the secret is absent", () => {
		const text = "no secret here";
		expect(redactSecrets(text, ["other"])).toBe(text);
	});

	it("redacts a shell-escaped password", () => {
		const escaped = "'a'\\''b'"; // shEscape("a'b")
		const command = `printf %s ${escaped} | docker login`;
		expect(redactSecrets(command, [escaped])).toBe(
			"printf %s *** | docker login",
		);
	});
});

describe("redactExecError", () => {
	it("redacts the secret from an ExecError message and command", () => {
		const error = new ExecError("Command execution failed: pw=hunter2", {
			command: "docker login -p hunter2",
			stderr: "auth failed for hunter2",
		});
		const redacted = redactExecError(error, ["hunter2"]);
		expect(redacted).toBeInstanceOf(ExecError);
		const execError = redacted as ExecError;
		expect(execError.message).toBe("Command execution failed: pw=***");
		expect(execError.command).toBe("docker login -p ***");
		expect(execError.stderr).toBe("auth failed for ***");
	});

	it("redacts the secret from a plain Error message", () => {
		const error = new Error("failed with token abc123");
		const redacted = redactExecError(error, ["abc123"]) as Error;
		expect(redacted.message).toBe("failed with token ***");
	});

	it("returns non-error values unchanged", () => {
		expect(redactExecError("just a string", ["x"])).toBe("just a string");
	});
});
