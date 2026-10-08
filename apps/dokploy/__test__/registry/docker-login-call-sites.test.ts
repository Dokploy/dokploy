import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A registry password in a command line is readable by every user on the host
 * (ps), locally and over SSH. Every place that logs docker in must therefore
 * keep the password out of the command it builds and send it on stdin, as its
 * own command ahead of the script that pushes or pulls.
 */

const PASSWORD = "hunter2-S3cret";
const ECR_TOKEN = "ecr-token-S3cret";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findRegistryByIdWithCredentials: vi.fn(),
	getECRAuthToken: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	ExecError: class ExecError extends Error {},
}));
vi.mock("@dokploy/server/services/registry", () => ({
	findRegistryByIdWithCredentials: mocks.findRegistryByIdWithCredentials,
}));
vi.mock("@dokploy/server/services/deployment", () => ({
	findAllDeploymentsByApplicationId: vi.fn(),
}));
vi.mock("@dokploy/server/services/rollbacks", () => ({
	createRollback: vi.fn(),
}));
vi.mock("@dokploy/server/utils/aws/ecr", () => ({
	getECRAuthToken: mocks.getECRAuthToken,
}));
vi.mock("@dokploy/server/services/build-policy/audit", () => ({
	recordBuildPolicyAudit: vi.fn(),
	findPendingBreakGlass: vi.fn(),
	consumeBreakGlass: vi.fn(),
	grantBreakGlass: vi.fn(),
	listBuildPolicyAudit: vi.fn(),
}));

import { getBuildPolicyPushCommand } from "@dokploy/server/services/build-policy/apply";
import { uploadImageRemoteCommand } from "@dokploy/server/utils/cluster/upload";
import { buildRemoteDocker } from "@dokploy/server/utils/providers/docker";

const registryRow = {
	registryId: "reg-1",
	registryName: "main",
	registryType: "cloud",
	registryUrl: "registry.example.com",
	username: "acme",
	password: PASSWORD,
	imagePrefix: null,
	awsAccessKeyId: null,
	awsSecretAccessKey: null,
	awsRegion: null,
};

/** Every command string handed to an exec, local or remote. */
const executedCommands = () =>
	[...mocks.execAsync.mock.calls, ...mocks.execAsyncRemote.mock.calls].map(
		(call) => (call[0] === "srv-1" ? call[1] : call[0]) as string,
	);

const expectNoSecretIn = (...texts: string[]) => {
	for (const text of texts) {
		expect(text).not.toContain(PASSWORD);
		expect(text).not.toContain(ECR_TOKEN);
		expect(text).not.toContain("printf");
	}
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.findRegistryByIdWithCredentials.mockResolvedValue(registryRow);
	mocks.getECRAuthToken.mockResolvedValue({
		username: "AWS",
		password: ECR_TOKEN,
		endpoint: "https://123.dkr.ecr.us-east-1.amazonaws.com",
	});
});

describe("uploadImageRemoteCommand", () => {
	const application = {
		appName: "my-app",
		sourceType: "git",
		applicationId: "app-1",
		registry: { registryId: "reg-1" },
		buildRegistry: null,
		rollbackRegistry: null,
		rollbackActive: false,
	} as never;

	it("logs in on the build server with the password on stdin, not in the script", async () => {
		const script = await uploadImageRemoteCommand(application, "srv-1");

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"srv-1",
			"docker login 'registry.example.com' -u 'acme' --password-stdin",
			undefined,
			{ stdin: PASSWORD },
		);
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expectNoSecretIn(script, ...executedCommands());
		expect(script).not.toContain("docker login");
		expect(script).toContain("Registry Login Success");
		expect(script).toContain("docker push");
	});

	it("logs in on this host with the password on stdin when there is no server", async () => {
		const script = await uploadImageRemoteCommand(application, null);

		expect(mocks.execAsync).toHaveBeenCalledWith(
			"docker login 'registry.example.com' -u 'acme' --password-stdin",
			{ stdin: PASSWORD },
		);
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expectNoSecretIn(script, ...executedCommands());
	});

	it("sends the ECR token on stdin", async () => {
		mocks.findRegistryByIdWithCredentials.mockResolvedValue({
			...registryRow,
			registryType: "awsEcr",
			registryUrl: "123.dkr.ecr.us-east-1.amazonaws.com",
			awsAccessKeyId: "AKIA",
			awsSecretAccessKey: "secret",
			awsRegion: "us-east-1",
		});
		const script = await uploadImageRemoteCommand(application, "srv-1");

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"srv-1",
			"docker login --username AWS --password-stdin '123.dkr.ecr.us-east-1.amazonaws.com'",
			undefined,
			{ stdin: ECR_TOKEN },
		);
		expectNoSecretIn(script, ...executedCommands());
	});

	it("fails the deploy before the script when the login is refused", async () => {
		mocks.execAsyncRemote.mockRejectedValue(new Error("unauthorized"));
		await expect(uploadImageRemoteCommand(application, "srv-1")).rejects.toThrow(
			"unauthorized",
		);
	});
});

describe("buildRemoteDocker", () => {
	const base = { dockerImage: "nginx:1", registryUrl: null } as const;

	it("logs in with the application's own credentials on stdin", async () => {
		const script = await buildRemoteDocker(
			{
				...base,
				registryUrl: "registry.example.com",
				username: "acme",
				password: PASSWORD,
				registry: null,
			} as never,
			"srv-1",
		);

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"srv-1",
			"docker login 'registry.example.com' -u 'acme' --password-stdin",
			undefined,
			{ stdin: PASSWORD },
		);
		expectNoSecretIn(script, ...executedCommands());
		expect(script).toContain("docker pull");
	});

	it("logs in with an attached registry's stored credentials on stdin", async () => {
		const script = await buildRemoteDocker(
			{ ...base, registry: { registryId: "reg-1", registryType: "cloud" } } as never,
			null,
		);

		expect(mocks.execAsync).toHaveBeenCalledWith(
			"docker login 'registry.example.com' -u 'acme' --password-stdin",
			{ stdin: PASSWORD },
		);
		expectNoSecretIn(script, ...executedCommands());
	});

	it("logs in to ECR with the fresh token on stdin", async () => {
		const script = await buildRemoteDocker(
			{
				...base,
				registry: {
					registryId: "reg-1",
					registryType: "awsEcr",
					registryUrl: "123.dkr.ecr.us-east-1.amazonaws.com",
					awsAccessKeyId: "AKIA",
					awsSecretAccessKey: "secret",
					awsRegion: "us-east-1",
				},
			} as never,
			"srv-1",
		);

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"srv-1",
			"docker login --username AWS --password-stdin '123.dkr.ecr.us-east-1.amazonaws.com'",
			undefined,
			{ stdin: ECR_TOKEN },
		);
		expectNoSecretIn(script, ...executedCommands());
	});
});

describe("getBuildPolicyPushCommand", () => {
	const plan = {
		enforced: true,
		buildServerId: "srv-1",
		registryId: "reg-1",
		repository: "registry.example.com/acme/my-app",
		settings: null,
	};

	it("logs in on the build host with the password on stdin, not in the script", async () => {
		const script = await getBuildPolicyPushCommand(plan, {
			appName: "my-app",
			serverId: "srv-1",
		});

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"srv-1",
			"docker login 'registry.example.com' -u 'acme' --password-stdin",
			undefined,
			{ stdin: PASSWORD },
		);
		expectNoSecretIn(script, ...executedCommands());
		expect(script).not.toContain("docker login");
		expect(script).toContain("docker push");
	});

	it("does nothing when the policy is not enforcing", async () => {
		const script = await getBuildPolicyPushCommand(
			{ ...plan, enforced: false },
			{ appName: "my-app", serverId: "srv-1" },
		);
		expect(script).toBe("");
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});
