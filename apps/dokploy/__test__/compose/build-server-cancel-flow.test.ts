import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	deploymentStatus: vi.fn(),
	findServerById: vi.fn(),
	findRegistryByIdWithCredentials: vi.fn(),
	getRegistryLoginCommand: vi.fn(),
	cloneGitRepository: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
	execAsync: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			deployments: {
				findFirst: (...args: unknown[]) => mocks.deploymentStatus(...args),
			},
		},
	},
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
	getCreateComposeFileCommand: vi.fn(),
}));
vi.mock("@dokploy/server/services/patch", () => ({
	generateApplyPatchesCommand: vi.fn().mockResolvedValue(""),
}));

import { prepareComposeBuildServerDeploy } from "@dokploy/server/services/compose-build-server";

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

const configJson = JSON.stringify({
	name: "my-app",
	services: { web: { build: { context: "." } } },
});

const PID_FILE = "/etc/dokploy/logs/.build-pids/dep1.pid";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findServerById.mockResolvedValue({
		serverId: "build-1",
		name: "builder",
		ipAddress: "10.0.0.9",
		serverType: "build",
		organizationId: "org-1",
	});
	mocks.findRegistryByIdWithCredentials.mockResolvedValue({
		registryId: "reg-1",
		registryName: "main",
		registryUrl: "reg.example.com",
		username: "acme",
		organizationId: "org-1",
	});
	mocks.getRegistryLoginCommand.mockResolvedValue("echo login;");
	mocks.cloneGitRepository.mockResolvedValue("echo clone;");
	mocks.deploymentStatus.mockResolvedValue({ status: "running" });
	mocks.execAsyncRemote.mockImplementation(
		async (_serverId: string, command: string) => ({
			stdout: command.includes("config --format json") ? configJson : "",
			stderr: "",
		}),
	);
});

// A cancelled deploy ends like a failed one on the serving host: the compose
// file and .env the clone replaced are put back and the previous release is
// re-confirmed. What it must never do is write the new override, which is what
// would make the serving host pull and start the half-pushed release.
const expectOnlyTheRestore = (runStep: ReturnType<typeof vi.fn>) => {
	for (const [command] of runStep.mock.calls) {
		expect(String(command)).toContain("Restoring previous working deployment");
		expect(String(command)).not.toContain("pull_policy");
		expect(String(command)).not.toContain("base64 -d");
	}
};

const prepare = (runStep = vi.fn().mockResolvedValue(undefined)) => ({
	runStep,
	promise: prepareComposeBuildServerDeploy({
		entity: compose,
		deployment: { logPath: "/tmp/log", deploymentId: "dep1" },
		runStep,
	}),
});

describe("prepareComposeBuildServerDeploy and cancellation", () => {
	it("launches every build-server step cancelable for this deployment", async () => {
		const { promise, runStep } = prepare();
		await promise;

		const calls = mocks.execAsyncRemote.mock.calls;
		expect(calls.length).toBeGreaterThan(2);
		for (const call of calls) {
			expect(call[0]).toBe("build-1");
			expect(call[3]).toEqual({
				cancelable: { pidFile: PID_FILE, deploymentId: "dep1" },
			});
		}
		expect(runStep).toHaveBeenCalledTimes(1);
	});

	it("stops before the first step when the deployment was cancelled while queued", async () => {
		mocks.deploymentStatus.mockResolvedValue({ status: "cancelled" });

		const { promise, runStep } = prepare();

		await expect(promise).rejects.toMatchObject({ deploymentCancelled: true });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expectOnlyTheRestore(runStep);
	});

	it("does not run any step after a cancel that lands between two steps", async () => {
		let seen = 0;
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => {
				seen++;
				// The user cancels while the clone step is running.
				if (command.includes("echo clone;")) {
					mocks.deploymentStatus.mockResolvedValue({ status: "cancelled" });
				}
				return { stdout: "", stderr: "" };
			},
		);

		const { promise, runStep } = prepare();

		await expect(promise).rejects.toMatchObject({ deploymentCancelled: true });
		const after = seen;
		expect(after).toBeGreaterThan(0);
		expect(
			mocks.execAsyncRemote.mock.calls.some(
				(call) => String(call[1]).includes("docker push"),
			),
		).toBe(false);
		expectOnlyTheRestore(runStep);
	});

	it("never writes the override or lets the serving host pull when cancelled after the push", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => {
				if (command.includes("config --format json")) {
					return { stdout: configJson, stderr: "" };
				}
				// The last push finished, and the cancel arrives with nothing left to kill.
				if (command.includes("docker push") && command.includes(":latest")) {
					mocks.deploymentStatus.mockResolvedValue({ status: "cancelled" });
				}
				return { stdout: "", stderr: "" };
			},
		);

		const { promise, runStep } = prepare();

		await expect(promise).rejects.toMatchObject({ deploymentCancelled: true });
		expect(
			mocks.execAsyncRemote.mock.calls.some((call) =>
				String(call[1]).includes("docker push"),
			),
		).toBe(true);
		expectOnlyTheRestore(runStep);
	});

	it("a compose without a build server never looks at the cancel flag", async () => {
		const runStep = vi.fn();
		await prepareComposeBuildServerDeploy({
			entity: { ...compose, buildServerId: null, buildRegistryId: null },
			deployment: { logPath: "/tmp/log", deploymentId: "dep1" },
			runStep,
		});

		expect(mocks.deploymentStatus).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(runStep).not.toHaveBeenCalled();
	});
});
