import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	findServerById: vi.fn(),
	findRegistryByIdWithCredentials: vi.fn(),
	getRegistryLoginCommand: vi.fn(),
	cloneGitRepository: vi.fn(),
	getCreateComposeFileCommand: vi.fn(),
	generateApplyPatchesCommand: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
	execAsync: vi.fn(),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));
vi.mock("@dokploy/server/services/registry", () => ({
	findRegistryByIdWithCredentials: mocks.findRegistryByIdWithCredentials,
}));
vi.mock("@dokploy/server/utils/cluster/upload", () => ({
	getRegistryLoginCommand: mocks.getRegistryLoginCommand,
	getRegistryTag: (
		registry: { registryUrl: string; username: string },
		image: string,
	) => `${registry.registryUrl}/${registry.username}/${image}`,
}));
vi.mock("@dokploy/server/utils/docker/domain", () => ({
	writeDomainsToCompose: vi.fn().mockResolvedValue("echo write-compose;"),
}));
vi.mock("@dokploy/server/utils/providers/git", () => ({
	cloneGitRepository: mocks.cloneGitRepository,
}));
vi.mock("@dokploy/server/utils/providers/github", () => ({
	cloneGithubRepository: vi.fn(),
}));
vi.mock("@dokploy/server/utils/providers/gitlab", () => ({
	cloneGitlabRepository: vi.fn(),
}));
vi.mock("@dokploy/server/utils/providers/gitea", () => ({
	cloneGiteaRepository: vi.fn(),
}));
vi.mock("@dokploy/server/utils/providers/bitbucket", () => ({
	cloneBitbucketRepository: vi.fn(),
}));
vi.mock("@dokploy/server/utils/providers/raw", () => ({
	getCreateComposeFileCommand: mocks.getCreateComposeFileCommand,
}));
vi.mock("@dokploy/server/services/patch", () => ({
	generateApplyPatchesCommand: mocks.generateApplyPatchesCommand,
}));

import {
	assertComposeBuildSettings,
	createDeploymentLogWriter,
	prepareComposeBuildServerDeploy,
} from "@dokploy/server/services/compose-build-server";

const compose = {
	appName: "my-app",
	composeId: "c1",
	sourceType: "git",
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
	createEnvFile: false,
	buildServerId: "build-1",
	buildRegistryId: "reg-1",
	server: { name: "prod-1" },
	environment: { project: { env: "" }, env: "" },
} as any;

const buildServer = {
	serverId: "build-1",
	name: "builder",
	ipAddress: "10.0.0.9",
	serverType: "build",
	organizationId: "org-1",
};
const registry = {
	registryId: "reg-1",
	registryName: "main",
	registryUrl: "reg.example.com",
	username: "acme",
	organizationId: "org-1",
};

const configJson = (services: Record<string, unknown>) =>
	JSON.stringify({ name: "my-app", services });

describe("assertComposeBuildSettings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findServerById.mockResolvedValue(buildServer);
		mocks.findRegistryByIdWithCredentials.mockResolvedValue(registry);
	});

	it("accepts a build server with a registry", async () => {
		await expect(
			assertComposeBuildSettings(
				{ buildServerId: "build-1", buildRegistryId: "reg-1" },
				"org-1",
			),
		).resolves.toBeUndefined();
	});

	it("rejects a build server without a registry", async () => {
		await expect(
			assertComposeBuildSettings({ buildServerId: "build-1" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("must be set together"),
		});
	});

	it("rejects a server that is not of type build", async () => {
		mocks.findServerById.mockResolvedValue({
			...buildServer,
			serverType: "deploy",
		});
		await expect(
			assertComposeBuildSettings({
				buildServerId: "build-1",
				buildRegistryId: "reg-1",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("not a build server"),
		});
	});

	it("rejects a server or registry from another organization", async () => {
		await expect(
			assertComposeBuildSettings(
				{ buildServerId: "build-1", buildRegistryId: "reg-1" },
				"org-2",
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects a server id that does not resolve", async () => {
		mocks.findServerById.mockRejectedValue(new Error("not found"));
		await expect(
			assertComposeBuildSettings({
				buildServerId: "nope",
				buildRegistryId: "reg-1",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("accepts clearing both", async () => {
		await expect(
			assertComposeBuildSettings({
				buildServerId: null,
				buildRegistryId: null,
			}),
		).resolves.toBeUndefined();
	});
});

describe("prepareComposeBuildServerDeploy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findServerById.mockResolvedValue(buildServer);
		mocks.findRegistryByIdWithCredentials.mockResolvedValue(registry);
		mocks.getRegistryLoginCommand.mockResolvedValue(
			"echo pw | docker login reg.example.com -u acme --password-stdin",
		);
		mocks.cloneGitRepository.mockResolvedValue("echo clone;");
		mocks.generateApplyPatchesCommand.mockResolvedValue("");
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	const callsOn = (serverId: string) =>
		mocks.execAsyncRemote.mock.calls.filter((call) => call[0] === serverId);

	it("does nothing for a compose without a build server", async () => {
		const runStep = vi.fn();
		const result = await prepareComposeBuildServerDeploy({
			entity: { ...compose, buildServerId: null, buildRegistryId: null },
			deployment: { logPath: "/tmp/log", deploymentId: "dep1" },
			runStep,
		});
		expect(result).toBeUndefined();
		expect(runStep).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("clones, builds, tags and pushes on the build server and writes the override on the serving host", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => ({
				stdout: command.includes("config --format json")
					? configJson({
							web: { build: { context: "." } },
							db: { image: "postgres:16" },
						})
					: "",
				stderr: "",
			}),
		);
		const runStep = vi.fn().mockResolvedValue(undefined);

		const result = await prepareComposeBuildServerDeploy({
			entity: compose,
			deployment: { logPath: "/tmp/log", deploymentId: "dep1" },
			runStep,
		});

		const commands = callsOn("build-1").map((call) => call[1] as string);
		const joined = commands.join("\n----\n");
		// Everything above ran on the build server and nothing ran elsewhere.
		expect(
			mocks.execAsyncRemote.mock.calls.every(
				(c) => c[0] === "build-1" || c[0] === null || c[0] === undefined,
			),
		).toBe(true);
		expect(joined).toContain("echo clone;");
		expect(joined).toContain("docker compose -p my-app");
		expect(joined).toMatch(/ build 2>&1/);
		expect(joined).toContain(
			"docker tag my-app-web reg.example.com/acme/my-app-web\\:dpl-dep1",
		);
		expect(joined).toContain(
			"docker tag my-app-web reg.example.com/acme/my-app-web\\:latest",
		);
		expect(joined).toContain(
			"docker push reg.example.com/acme/my-app-web\\:dpl-dep1",
		);
		expect(joined).toContain(
			"docker push reg.example.com/acme/my-app-web\\:latest",
		);
		expect(joined).not.toContain("postgres:16");

		// Clone happens before build, build before push.
		expect(joined.indexOf("echo clone;")).toBeLessThan(
			joined.indexOf(" build 2>&1"),
		);
		expect(joined.indexOf(" build 2>&1")).toBeLessThan(
			joined.indexOf("docker push"),
		);

		// The serving host got the override that pins the pushed image.
		expect(runStep).toHaveBeenCalledTimes(1);
		const overrideStep = runStep.mock.calls[0]![0] as string;
		expect(overrideStep).toContain("docker-compose.dokploy-build.yml");
		const encoded = overrideStep.match(/echo "([A-Za-z0-9+/=]+)"/)![1]!;
		const yaml = Buffer.from(encoded, "base64").toString("utf8");
		expect(yaml).toContain("reg.example.com/acme/my-app-web:dpl-dep1");
		expect(yaml).toContain("pull_policy: missing");

		expect(result).toEqual({
			images: [
				{ service: "web", image: "reg.example.com/acme/my-app-web:dpl-dep1" },
			],
			loginCommand: expect.stringContaining("docker login reg.example.com"),
			servingHostLabel: "prod-1",
		});
	});

	it("streams the build log to the deployment log on the serving host", async () => {
		const servingCompose = { ...compose, serverId: "serve-1" };
		mocks.execAsyncRemote.mockImplementation(
			async (
				serverId: string,
				command: string,
				onData?: (d: string) => void,
			) => {
				if (serverId === "build-1" && command.includes(" build 2>&1")) {
					onData?.("Step 1/3 : FROM node\n");
				}
				return {
					stdout: command.includes("config --format json")
						? configJson({ web: { build: "." } })
						: "",
					stderr: "",
				};
			},
		);

		await prepareComposeBuildServerDeploy({
			entity: servingCompose,
			deployment: { logPath: "/var/log/dep.log", deploymentId: "dep1" },
			runStep: vi.fn().mockResolvedValue(undefined),
		});

		const logWrites = callsOn("serve-1").map((call) =>
			Buffer.from(
				(call[1] as string).match(/echo "([A-Za-z0-9+/=]+)"/)?.[1] ?? "",
				"base64",
			).toString("utf8"),
		);
		const logText = logWrites.join("");
		expect(logText).toContain("Building on build server builder (10.0.0.9)");
		expect(logText).toContain("Step 1/3 : FROM node");
		expect(callsOn("serve-1")[0]![1]).toContain(">> /var/log/dep.log");
	});

	it("only pulls when no service has a build section, and removes a stale override", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_s: string, command: string) => ({
				stdout: command.includes("config --format json")
					? configJson({ db: { image: "postgres:16" } })
					: "",
				stderr: "",
			}),
		);
		const runStep = vi.fn().mockResolvedValue(undefined);

		const result = await prepareComposeBuildServerDeploy({
			entity: compose,
			deployment: { logPath: "/tmp/log", deploymentId: "dep1" },
			runStep,
		});

		expect(result).toMatchObject({ images: [], loginCommand: "" });
		const joined = mocks.execAsyncRemote.mock.calls
			.map((call) => call[1] as string)
			.join("\n");
		expect(joined).not.toContain("docker push");
		expect(joined).not.toContain(" build 2>&1");
		expect(runStep).toHaveBeenCalledTimes(1);
		expect(runStep.mock.calls[0]![0]).toMatch(
			/^rm -f .*docker-compose\.dokploy-build\.yml/,
		);
	});

	it("restores the previous release on the serving host when the build fails", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_s: string, command: string) => {
				if (command.includes("config --format json")) {
					return { stdout: configJson({ web: { build: "." } }), stderr: "" };
				}
				if (command.includes(" build 2>&1")) throw new Error("build exploded");
				return { stdout: "", stderr: "" };
			},
		);
		const runStep = vi.fn().mockResolvedValue(undefined);

		await expect(
			prepareComposeBuildServerDeploy({
				entity: compose,
				deployment: { logPath: "/tmp/log", deploymentId: "dep1" },
				runStep,
			}),
		).rejects.toThrow("build exploded");

		expect(runStep).toHaveBeenCalledTimes(1);
		const restore = runStep.mock.calls[0]![0] as string;
		expect(restore).toContain("Restoring previous working deployment");
		expect(restore).toContain("__DOKPLOY_ROLLBACK_OK__\\:dep1");
		// No override was written for a release that never got built.
		expect(restore).not.toContain("base64 -d");
	});

	it("does not trust a server that stopped being a build server", async () => {
		mocks.findServerById.mockResolvedValue({
			...buildServer,
			serverType: "deploy",
		});
		const runStep = vi.fn().mockResolvedValue(undefined);
		await expect(
			prepareComposeBuildServerDeploy({
				entity: compose,
				deployment: { logPath: "/tmp/log", deploymentId: "dep1" },
				runStep,
			}),
		).rejects.toThrow(/not a build server/);
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});

describe("createDeploymentLogWriter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("batches many lines into one remote append", async () => {
		const writer = createDeploymentLogWriter("serve-1", "/var/log/a b.log");
		writer.push("one\n");
		writer.push("two\n");
		writer.line("three");
		await writer.close();

		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
		const [serverId, command] = mocks.execAsyncRemote.mock.calls[0]!;
		expect(serverId).toBe("serve-1");
		expect(command).toContain("base64 -d >>");
		const encoded = (command as string).match(/echo "([^"]+)"/)![1]!;
		expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(
			"one\ntwo\nthree\n",
		);
	});

	it("never fails the deploy when the log append fails", async () => {
		mocks.execAsyncRemote.mockRejectedValue(new Error("ssh down"));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const writer = createDeploymentLogWriter("serve-1", "/x.log");
		writer.line("hello");
		await expect(writer.close()).resolves.toBeUndefined();
		error.mockRestore();
	});
});
