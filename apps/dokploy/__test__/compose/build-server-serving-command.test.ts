import {
	createCommand,
	getBuildComposeCommand,
	getComposeBuildOverridePath,
	getRestoreAfterFailedBuildCommand,
} from "@dokploy/server/utils/builders/compose";
import { quote } from "shell-quote";
import { describe, expect, it, vi } from "vitest";

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
	environment: { project: { env: "" }, env: "" },
} as unknown as Parameters<typeof getBuildComposeCommand>[0];

const q = (value: string) => quote([value]);

const remoteBuild = {
	images: [
		{ service: "web", image: "reg.example.com/acme/my-app-web:dpl-1" },
		{ service: "api", image: "reg.example.com/acme/my-app-api:dpl-1" },
	],
	loginCommand: "echo pw | docker login reg.example.com -u u --password-stdin",
	servingHostLabel: "prod-1",
};

describe("createCommand with a build server", () => {
	it("never builds on the serving host and merges the override", () => {
		const overridePath = getComposeBuildOverridePath(base);
		const command = createCommand(base, undefined, { overridePath });

		expect(command).toContain("--no-build");
		expect(command).not.toContain("--build ");
		expect(command).toContain(`-f ${q(overridePath)}`);
		expect(command).toContain("up -d");
		expect(command).toContain("--remove-orphans");
	});

	it("keeps the compose file before the override so the override wins", () => {
		const overridePath = getComposeBuildOverridePath(base);
		const command = createCommand(base, undefined, { overridePath });
		expect(command.indexOf("-f docker-compose.yml")).toBeLessThan(
			command.indexOf(`-f ${q(overridePath)}`),
		);
	});

	it("still uses --no-build without an override (nothing was built)", () => {
		const command = createCommand(base, undefined, {});
		expect(command).toContain("--no-build");
		expect(command).not.toContain("docker-compose.dokploy-build.yml");
	});

	it("keeps --pull always when pulling on deploy is enabled", () => {
		const command = createCommand(
			{ ...base, pullImagesOnDeploy: true } as typeof base,
			undefined,
			{ overridePath: "/o.yml" },
		);
		expect(command).toContain("--pull always");
		expect(command).toContain("--no-build");
	});

	it("uses a second -c file for a swarm stack", () => {
		const command = createCommand(
			{ ...base, composeType: "stack" } as typeof base,
			undefined,
			{ overridePath: "/o.yml" },
		);
		expect(command).toContain("stack deploy");
		expect(command).toContain("-c /o.yml");
		expect(command).toContain("--with-registry-auth");
	});

	it("refuses to produce a command that would build on the serving host", () => {
		expect(() => createCommand(base)).toThrow(/never builds/);
	});

	it("refuses a custom command together with a build server", () => {
		expect(() =>
			createCommand(
				{ ...base, command: "compose up -d" } as typeof base,
				undefined,
				{},
			),
		).toThrow(/custom compose command/);
	});

	it("is unchanged for a compose without a build server", () => {
		const command = createCommand({
			...base,
			buildServerId: null,
			buildRegistryId: null,
		} as typeof base);
		expect(command).toContain("--build");
		expect(command).not.toContain("--no-build");
	});
});

describe("getBuildComposeCommand on the serving host", () => {
	it("logs in, pulls the pushed images, then runs up --no-build with the override", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const overridePath = getComposeBuildOverridePath(base);

		expect(script).toContain(
			"Pulling images on prod-1 (2 built on the build server)",
		);
		expect(script).toContain("docker login reg.example.com");
		expect(script).toContain(
			`docker pull ${q("reg.example.com/acme/my-app-web:dpl-1")} && docker pull ${q("reg.example.com/acme/my-app-api:dpl-1")}`,
		);
		expect(script).toContain("--no-build");
		expect(script).toContain(`-f ${q(overridePath)}`);

		// Order: login, pull, up.
		const login = script.indexOf("echo pw | docker login");
		const pull = script.indexOf("docker pull reg.example.com");
		const up = script.indexOf('if [ "$PULL_OK" = "1" ]; then env -i');
		expect(login).toBeGreaterThan(-1);
		expect(login).toBeLessThan(pull);
		expect(pull).toBeLessThan(up);
	});

	it("skips up and restores the previous release when login or pull fails", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		expect(script).toContain('if [ "$PULL_OK" = "1" ]; then env -i');
		expect(script).toContain("else false; fi");
		expect(script).toContain("Restoring previous working deployment");
		expect(script).toContain("OVERRIDE_RESTORED");
	});

	it("includes the override in the last-good snapshot", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		expect(script).toContain("last-good-docker-compose.dokploy-build.yml.bak");
	});

	it("only pulls and runs when no service has a build section", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild: { images: [], loginCommand: "", servingHostLabel: "prod-1" },
		});
		expect(script).toContain("--no-build");
		expect(script).not.toContain("docker pull");
		expect(script).not.toContain("docker login");
		expect(script).not.toContain("PULL_OK");
		expect(script).not.toMatch(/docker compose[^\n]* -f \S*dokploy-build\.yml/);
	});

	it("pulls an image shared by several services once", async () => {
		const shared = "reg.example.com/acme/my-app-web:dpl-1";
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild: {
				...remoteBuild,
				images: [
					{ service: "web", image: shared },
					{ service: "worker", image: shared },
					{ service: "beat", image: shared },
				],
			},
		});
		expect(script.match(/docker pull /g)).toHaveLength(1);
		expect(script).toContain("(1 built on the build server)");
	});

	it("keeps the deploy line of a plain compose exactly as it was", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, buildServerId: null, buildRegistryId: null } as typeof base,
			{ deploymentId: "d" },
		);
		// No leftover blank block from the (absent) pull section: the docker line
		// follows the isolated-deployment slot directly, like before the feature.
		expect(script).toMatch(
			/";\n\n\t\t\n\t\tenv -i PATH="\$PATH" HOME="\$HOME" /,
		);
	});

	it("fails closed when a build server is set but no remote build result is given", async () => {
		await expect(
			getBuildComposeCommand(base, { deploymentId: "d" }),
		).rejects.toThrow(/refusing to build on the serving host/);
	});

	it("does not touch the override or pull anything for a plain compose", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, buildServerId: null, buildRegistryId: null } as typeof base,
			{ deploymentId: "d" },
		);
		expect(script).toContain("--build");
		expect(script).not.toContain("docker-compose.dokploy-build.yml");
		expect(script).not.toContain("PULL_OK");
	});

	it("uses docker stack deploy with the override and registry auth for a stack", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, composeType: "stack" } as typeof base,
			{ deploymentId: "d", remoteBuild },
		);
		expect(script).toContain("stack deploy");
		expect(script).toContain(`-c ${q(getComposeBuildOverridePath(base))}`);
		expect(script).toContain("--with-registry-auth");
		expect(script).not.toContain("--no-build");
	});
});

describe("getRestoreAfterFailedBuildCommand", () => {
	it("restores the compose file, env and override and re-confirms the old release", async () => {
		const restore = await getRestoreAfterFailedBuildCommand(base, {
			deploymentId: "dep1",
		});
		expect(restore).toContain("Restoring previous working deployment");
		expect(restore).toContain("docker-compose.yml.bak");
		expect(restore).toContain("docker-compose.dokploy-build.yml.bak");
		expect(restore).toContain("OVERRIDE_RESTORED");
		expect(restore).toContain("__DOKPLOY_ROLLBACK_OK__\\:dep1");
	});

	it("runs from the code directory so the relative -f / --env-file paths resolve", async () => {
		const restore = await getRestoreAfterFailedBuildCommand(
			{ ...base, createEnvFile: true } as typeof base,
			{ deploymentId: "dep1" },
		);
		expect(restore).toMatch(
			/^cd '?[^;]*my-app[\\/]+code'? 2>\/dev\/null \|\| true;/,
		);
		expect(restore.indexOf("cd ")).toBeLessThan(
			restore.indexOf("docker compose"),
		);
		expect(restore).toContain("--env-file .env");
	});

	it("is empty for a stack (not transactional) and for fresh volumes", async () => {
		expect(
			await getRestoreAfterFailedBuildCommand(
				{ ...base, composeType: "stack" } as typeof base,
				{ deploymentId: "d" },
			),
		).toBe("");
		expect(
			await getRestoreAfterFailedBuildCommand(base, {
				deploymentId: "d",
				freshVolumes: true,
			}),
		).toBe("");
	});
});
