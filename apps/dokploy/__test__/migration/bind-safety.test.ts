import {
	findUnsafeBindMounts,
	isBindSourceWithinProjectDirectory,
} from "@dokploy/server/utils/migration/bind-safety";
import { describe, expect, it } from "vitest";

describe("compose bind-mount safety", () => {
	it("allows bind sources inside the compose project directory", () => {
		expect(
			isBindSourceWithinProjectDirectory(
				"/etc/dokploy/compose/my-app/files/config.yml",
				"/etc/dokploy/compose/my-app",
			),
		).toBe(true);
		expect(
			isBindSourceWithinProjectDirectory(
				"/etc/dokploy/compose/my-app",
				"/etc/dokploy/compose/my-app",
			),
		).toBe(true);
	});

	it("rejects bind sources outside the compose project directory", () => {
		expect(
			isBindSourceWithinProjectDirectory(
				"/var/run/docker.sock",
				"/etc/dokploy/compose/my-app",
			),
		).toBe(false);
		expect(
			isBindSourceWithinProjectDirectory(
				"/etc/dokploy/compose/other-app/data",
				"/etc/dokploy/compose/my-app",
			),
		).toBe(false);
		expect(
			isBindSourceWithinProjectDirectory("/etc", "/etc/dokploy/compose/my-app"),
		).toBe(false);
	});

	it("rejects a sibling directory that merely shares a name prefix", () => {
		// "/etc/dokploy/compose/my-app-2" starts with the string
		// "/etc/dokploy/compose/my-app" but is NOT inside it - a naive
		// startsWith() check (without the trailing separator) would wrongly
		// allow this.
		expect(
			isBindSourceWithinProjectDirectory(
				"/etc/dokploy/compose/my-app-2/data",
				"/etc/dokploy/compose/my-app",
			),
		).toBe(false);
	});

	it("resolves relative segments (..) before comparing", () => {
		expect(
			isBindSourceWithinProjectDirectory(
				"/etc/dokploy/compose/my-app/../other-app/secrets",
				"/etc/dokploy/compose/my-app",
			),
		).toBe(false);
	});

	it("findUnsafeBindMounts filters down to only the unsafe mounts", () => {
		const unsafe = findUnsafeBindMounts(
			[
				{
					source: "/etc/dokploy/compose/my-app/data",
					destination: "/data",
				},
				{ source: "/var/run/docker.sock", destination: "/var/run/docker.sock" },
				{ source: "/home/user/secrets", destination: "/secrets" },
			],
			"/etc/dokploy/compose/my-app",
		);

		expect(unsafe).toEqual([
			{ source: "/var/run/docker.sock", destination: "/var/run/docker.sock" },
			{ source: "/home/user/secrets", destination: "/secrets" },
		]);
	});
});
