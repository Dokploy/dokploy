import { describe, expect, it } from "vitest";
import {
	buildAuthorizedKeysAppendCommand,
	buildSshLoginCommand,
	shellQuote,
} from "@/lib/shell-command";

describe("ssh setup shell commands", () => {
	it("single-quotes shell values and preserves literal command substitutions", () => {
		expect(shellQuote("deploy'$(id)")).toBe("'deploy'\\''$(id)'");
	});

	it("builds authorized_keys commands without echo interpolation", () => {
		const command = buildAuthorizedKeysAppendCommand(
			'ssh-ed25519 AAA"$(touch /tmp/pwn)" user@example',
		);

		expect(command).toBe(
			`printf '%s\\n' 'ssh-ed25519 AAA"$(touch /tmp/pwn)" user@example' >> ~/.ssh/authorized_keys`,
		);
		expect(command).not.toContain("echo ");
	});

	it("quotes the ssh login target as a single argument", () => {
		expect(buildSshLoginCommand("root;id", "203.0.113.10")).toBe(
			"ssh -- 'root;id@203.0.113.10'",
		);
	});
});
