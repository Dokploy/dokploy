import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { getBuildCommand } from "@dokploy/server/utils/builders";
import {
	BuildArchitectureError,
	resolveBuildPlan,
} from "@dokploy/server/utils/builders/build-platform";
import * as upload from "@dokploy/server/utils/cluster/upload";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/vault", () => ({
	withResolvedVaultRefs: async (application: unknown) => application,
}));

vi.mock("@dokploy/server/utils/cluster/upload", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/cluster/upload")
		>();
	return {
		...actual,
		collectRegistryPushTargets: vi.fn(),
		uploadImageRemoteCommand: vi.fn(),
		registryLoginCommands: vi.fn(() => "docker login ghcr.io"),
	};
});

const createApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		appName: "test-app",
		buildType: "dockerfile",
		sourceType: "git",
		customGitBuildPath: "/",
		dockerfile: "Dockerfile",
		env: null,
		buildArgs: null,
		buildSecrets: null,
		publishDirectory: null,
		dockerBuildStage: null,
		dockerContextPath: null,
		cleanCache: false,
		createEnvFile: false,
		registry: null,
		buildRegistry: null,
		rollbackRegistry: null,
		environment: {
			project: {
				env: "",
			},
			env: "",
		},
		...overrides,
	}) as unknown as ApplicationNested;

const clusterTarget = {
	kind: "cluster" as const,
	registry: {
		registryId: "r1",
		registryUrl: "ghcr.io",
		username: "acme",
		password: "secret",
	} as upload.RegistryPushTarget["registry"],
	imageName: "test-app:latest",
	tag: "ghcr.io/acme/test-app:latest",
};

describe("resolveBuildPlan and getBuildCommand", () => {
	beforeEach(() => {
		vi.mocked(upload.collectRegistryPushTargets).mockReset();
		vi.mocked(upload.uploadImageRemoteCommand).mockReset();
		vi.mocked(upload.registryLoginCommands).mockReset();
		vi.mocked(upload.registryLoginCommands).mockReturnValue(
			"docker login ghcr.io",
		);
		vi.mocked(upload.uploadImageRemoteCommand).mockResolvedValue(
			"\ndocker tag test-app:latest ghcr.io/acme/test-app:latest\ndocker push ghcr.io/acme/test-app:latest\n",
		);
	});

	it("keeps host builds on the local tag-and-push path", async () => {
		const application = createApplication({
			registry: { registryId: "r1" } as ApplicationNested["registry"],
		});
		const command = await getBuildCommand(application);

		expect(command).toContain("docker build -t test-app -f");
		expect(command).not.toContain("--push");
		expect(upload.uploadImageRemoteCommand).toHaveBeenCalled();
		expect(upload.collectRegistryPushTargets).not.toHaveBeenCalled();
	});

	it("pushes multi-arch with buildx and does not tag a local image afterward", async () => {
		vi.mocked(upload.collectRegistryPushTargets).mockResolvedValue([
			clusterTarget,
		]);
		const application = createApplication({
			buildArchitecture: "multi",
			registry: { registryId: "r1" } as ApplicationNested["registry"],
		});

		const plan = await resolveBuildPlan(application);
		expect(plan.output.mode).toBe("push");

		const command = await getBuildCommand(application);
		expect(command).toContain("docker login ghcr.io");
		expect(command).toContain("docker buildx build");
		expect(command).toContain("--push");
		expect(command).toContain("ghcr.io/acme/test-app");
		expect(command).not.toContain("docker tag ");
		expect(command).not.toContain("docker push ");
		expect(upload.uploadImageRemoteCommand).not.toHaveBeenCalled();
	});

	it("rejects multi-arch without a cluster or build registry", async () => {
		await expect(
			resolveBuildPlan(
				createApplication({
					buildArchitecture: "multi",
					rollbackRegistry: {
						registryId: "rb",
					} as ApplicationNested["rollbackRegistry"],
				}),
			),
		).rejects.toThrow(BuildArchitectureError);
		expect(upload.collectRegistryPushTargets).not.toHaveBeenCalled();
	});
});
