import {
	getBuildComposeCommand,
	getRestoreAfterFailedBuildCommand,
} from "@dokploy/server/utils/builders/compose";
import { quote } from "shell-quote";
import { describe, expect, it, vi } from "vitest";

/**
 * A compose with a build server promises its serving host never builds. The
 * automatic rollback (the restore that runs when a deploy fails) used to bring
 * a release that predates the build server back with a plain `up`, which
 * builds any service whose image was pruned in the meantime. These tests pin
 * the restore to `--no-build`, and pin a compose without a build server to the
 * exact restore line it has always had.
 */

vi.mock("@dokploy/server/utils/docker/domain", () => ({
	writeDomainsToCompose: vi.fn().mockResolvedValue(""),
}));

const base = {
	appName: "my-app",
	sourceType: "raw",
	command: "",
	composePath: "docker-compose.yml",
	composeType: "docker-compose",
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
	serverId: null,
	env: "",
	mounts: [],
	domains: [],
	buildServerId: "build-1",
	buildRegistryId: "reg-1",
	buildServer: { serverId: "build-1", name: "devino-third" },
	environment: { project: { env: "" }, env: "" },
} as unknown as Parameters<typeof getBuildComposeCommand>[0];

const noBuildServer = {
	...base,
	buildServerId: null,
	buildRegistryId: null,
	buildServer: null,
} as unknown as typeof base;

const remoteBuild = {
	images: [{ service: "web", image: "reg.example.com/acme/my-app-web:dpl-9" }],
	loginCommand: "echo pw | docker login reg.example.com -u u --password-stdin",
	servingHostLabel: "prod-1",
};

/** Every `docker compose ... up` invocation in a script, one per match. */
const upInvocations = (script: string) =>
	script.match(/docker compose [^\n]*? up -d[^\n]*/g) ?? [];

const restorePart = (script: string) => {
	const start = script.indexOf("Restoring previous working deployment");
	expect(start).toBeGreaterThan(-1);
	return script.slice(start);
};

describe("compose rollback on a unit with a build server", () => {
	it("restores a release with a build override from the registry images, never building", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const restore = restorePart(script);

		// The override-restored branch re-runs the deploy command: --no-build and
		// the override are both there.
		expect(restore).toContain('if [ "$OVERRIDE_RESTORED" = "1" ]; then');
		const ups = upInvocations(restore);
		expect(ups.length).toBe(2);
		for (const up of ups) {
			expect(up).toContain("--no-build");
			expect(up).not.toMatch(/ --build\b/);
		}
		expect(ups[0]).toContain("docker-compose.dokploy-build.yml");
	});

	it("restores a release that predates the build server with --no-build, not a plain up", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const restore = restorePart(script);
		const [, elseBranch] = restore.split("else\n");
		// The branch taken when no build override could be put back.
		const plain = upInvocations(elseBranch ?? "")[0];

		expect(plain).toBeDefined();
		expect(plain).toContain("--no-build");
		expect(plain).toContain("--remove-orphans");
		// And it really is the override-less command.
		expect(plain).not.toContain("docker-compose.dokploy-build.yml");
	});

	it("never emits an `up` without --no-build anywhere in the script", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const ups = upInvocations(script);
		expect(ups.length).toBeGreaterThanOrEqual(3);
		for (const up of ups) expect(up).toContain("--no-build");
	});

	it("refuses with a message naming the build server when the old release's images are gone", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const restore = restorePart(script);

		expect(restore).toContain(
			"This release was deployed before builds moved to build server devino-third",
		);
		expect(restore).toContain(
			"Redeploy instead, which builds on build server devino-third.",
		);
		expect(restore).toContain("the serving host never builds");
	});

	it("falls back to a generic name when the build server was not loaded", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, buildServer: undefined } as typeof base,
			{ deploymentId: "dep1", remoteBuild },
		);
		expect(restorePart(script)).toContain(
			"Redeploy instead, which builds on the build server.",
		);
	});

	it("quotes a build server name so it cannot break out of the echo", async () => {
		const evil = "x\"; touch /tmp/pwned; echo \"$(id) `id`";
		const script = await getBuildComposeCommand(
			{
				...base,
				buildServer: { serverId: "build-1", name: evil },
			} as typeof base,
			{ deploymentId: "dep1", remoteBuild },
		);
		const restore = restorePart(script);
		// The whole message is one shell-quote'd word, so the metacharacters in
		// the name (quote, ;, $(), backtick) stay literal text.
		const label = `build server ${evil}`;
		const message = `Error: ❌ This release was deployed before builds moved to ${label}; its images are most likely no longer on this host and the serving host never builds. Automatic restore failed. Redeploy instead, which builds on ${label}.`;
		expect(restore).toContain(`echo ${quote([message])};`);
	});

	it("keeps the marker so a successful --no-build restore still counts as rolled back", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const restore = restorePart(script);
		expect(restore.match(/__DOKPLOY_ROLLBACK_OK__\\?:dep1/g)).toHaveLength(2);
	});

	it("uses --no-build in the restore that follows a failed build on the build server", async () => {
		const restore = await getRestoreAfterFailedBuildCommand(base, {
			deploymentId: "dep1",
		});
		const ups = upInvocations(restore);
		expect(ups.length).toBe(2);
		for (const up of ups) expect(up).toContain("--no-build");
		expect(restore).toContain("deployed before builds moved to build server");
	});

	it("also pins the restore when the compose pulls images on deploy", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, pullImagesOnDeploy: true } as typeof base,
			{ deploymentId: "dep1", remoteBuild },
		);
		const restore = restorePart(script);
		// --pull always is stripped from the restore (it is often what broke the
		// deploy); --no-build must survive the stripping.
		for (const up of upInvocations(restore)) {
			expect(up).toContain("--no-build");
			expect(up).not.toContain("--pull always");
		}
	});

	it("has no restore for a swarm stack (declarative, never builds)", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, composeType: "stack" } as typeof base,
			{ deploymentId: "d", remoteBuild },
		);
		expect(script).not.toContain("Restoring previous working deployment");
		expect(script).toContain("stack deploy");
		expect(script).toContain("--with-registry-auth");
	});
});

describe("compose rollback on a unit without a build server", () => {
	it("restores exactly as before: a plain up, the generic failure line, no override logic", async () => {
		const script = await getBuildComposeCommand(noBuildServer, {
			deploymentId: "dep1",
		});
		const restore = restorePart(script);

		expect(restore).not.toContain("--no-build");
		expect(restore).not.toContain("OVERRIDE_RESTORED");
		expect(restore).not.toContain("docker-compose.dokploy-build.yml");
		expect(restore).not.toContain("before builds moved to");
		expect(restore).toMatch(
			/ up -d --remove-orphans 2>&1 && echo \S+ \|\| echo "Warning: ⚠️ Automatic restore failed, manual intervention may be required";/,
		);
	});

	it("still builds on deploy, since it has no build server", async () => {
		const script = await getBuildComposeCommand(noBuildServer, {
			deploymentId: "dep1",
		});
		const deployUp = upInvocations(script)[0];
		expect(deployUp).toContain("--build");
		expect(deployUp).not.toContain("--no-build");
	});

	it("is byte-identical whether or not a buildServer relation is loaded", async () => {
		const withRelation = await getBuildComposeCommand(
			{ ...noBuildServer, buildServer: { serverId: "x", name: "n" } } as never,
			{ deploymentId: "dep1" },
		);
		const without = await getBuildComposeCommand(noBuildServer, {
			deploymentId: "dep1",
		});
		expect(withRelation).toBe(without);
	});
});
