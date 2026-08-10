import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findGithubById: vi.fn(),
	authGithub: vi.fn(),
	createDeployment: vi.fn(),
	createDeploymentStatus: vi.fn(),
	listDeployments: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: mocks.findGithubById,
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: mocks.authGithub,
}));

import {
	createGithubDeployment,
	deactivateGithubDeployments,
	setGithubDeploymentStatus,
} from "@dokploy/server/services/github-deployment";

const base = {
	githubId: "github-1",
	owner: "contracko",
	repository: "app",
};

describe("GitHub Deployments integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findGithubById.mockResolvedValue({ githubId: "github-1" });
		mocks.authGithub.mockReturnValue({
			rest: {
				repos: {
					createDeployment: mocks.createDeployment,
					createDeploymentStatus: mocks.createDeploymentStatus,
					listDeployments: mocks.listDeployments,
				},
			},
		});
	});

	it("creates a persistent deployment without auto-merge", async () => {
		mocks.createDeployment.mockResolvedValue({
			status: 201,
			data: { id: 42 },
		});

		await expect(
			createGithubDeployment({
				...base,
				ref: "abc123",
				environment: "staging",
				transient: false,
			}),
		).resolves.toBe(42);
		expect(mocks.createDeployment).toHaveBeenCalledWith(
			expect.objectContaining({
				auto_merge: false,
				required_contexts: [],
				transient_environment: false,
				production_environment: false,
			}),
		);
	});

	it("does not let a GitHub API failure fail a Dokploy deployment", async () => {
		mocks.createDeployment.mockRejectedValue(new Error("GitHub unavailable"));

		await expect(
			createGithubDeployment({
				...base,
				ref: "abc123",
				environment: "preview-pr-1",
			}),
		).resolves.toBeNull();
	});

	it("auto-inactivates prior deployments only after success", async () => {
		mocks.createDeploymentStatus.mockResolvedValue({ status: 201 });

		await setGithubDeploymentStatus({
			...base,
			deploymentId: 42,
			state: "success",
			environmentUrl: "https://preview.example.test",
		});

		expect(mocks.createDeploymentStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				deployment_id: 42,
				state: "success",
				auto_inactive: true,
			}),
		);
	});

	it("marks every deployment in a torn-down preview environment inactive", async () => {
		mocks.listDeployments.mockResolvedValue({
			data: [{ id: 41 }, { id: 42 }],
		});
		mocks.createDeploymentStatus.mockResolvedValue({ status: 201 });

		await deactivateGithubDeployments({
			...base,
			environment: "app-pr-7",
		});

		expect(mocks.listDeployments).toHaveBeenCalledWith(
			expect.objectContaining({ environment: "app-pr-7", per_page: 100 }),
		);
		expect(mocks.createDeploymentStatus).toHaveBeenCalledTimes(2);
		expect(mocks.createDeploymentStatus).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ deployment_id: 41, state: "inactive" }),
		);
		expect(mocks.createDeploymentStatus).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ deployment_id: 42, state: "inactive" }),
		);
	});
});
