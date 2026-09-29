import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildBitbucketProviderUpdate,
	buildGiteaProviderUpdate,
	buildGithubProviderUpdate,
	buildGitlabProviderUpdate,
	buildGitProviderUpdate,
} from "@/components/dashboard/compose/general/generic/compose-provider-update";

const mockUpdateCompose = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	findComposeById: vi.fn(async () => ({
		composeId: "compose-1",
		name: "example-compose",
	})),
	updateCompose: mockUpdateCompose,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByCompose: vi.fn(),
	killDockerBuild: vi.fn(),
	myQueue: {
		add: vi.fn(),
	},
}));

const { composeRouter } = await import("@/server/api/routers/compose");

const caller = composeRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof composeRouter.createCaller>[0]);

const providerUpdates = [
	{
		name: "GitHub",
		update: buildGithubProviderUpdate("compose-1", {
			branch: "main",
			composePath: "./docker-compose.yml",
			repository: { owner: "example-owner", repo: "example-repo" },
			githubId: "provider-1",
			watchPaths: ["src/**"],
			triggerType: "push",
			enableSubmodules: false,
		}),
	},
	{
		name: "GitLab",
		update: buildGitlabProviderUpdate("compose-1", {
			branch: "main",
			composePath: "./docker-compose.yml",
			repository: {
				owner: "example-owner",
				repo: "example-repo",
				id: 1,
				gitlabPathNamespace: "example-owner/example-repo",
			},
			gitlabId: "provider-1",
			watchPaths: ["src/**"],
			enableSubmodules: false,
		}),
	},
	{
		name: "Bitbucket",
		update: buildBitbucketProviderUpdate("compose-1", {
			branch: "main",
			composePath: "./docker-compose.yml",
			repository: {
				owner: "example-owner",
				repo: "example-repo",
				slug: "example-repo-slug",
			},
			bitbucketId: "provider-1",
			watchPaths: ["src/**"],
			enableSubmodules: false,
		}),
	},
	{
		name: "Gitea",
		update: buildGiteaProviderUpdate("compose-1", {
			branch: "main",
			composePath: "./docker-compose.yml",
			repository: { owner: "example-owner", repo: "example-repo" },
			giteaId: "provider-1",
			watchPaths: ["src/**"],
			enableSubmodules: false,
		}),
	},
	{
		name: "custom Git",
		update: buildGitProviderUpdate("compose-1", {
			branch: "main",
			composePath: "./docker-compose.yml",
			repositoryURL: "https://example.com/repo.git",
			sshKey: "key-1",
			watchPaths: ["src/**"],
			enableSubmodules: false,
		}),
	},
] as const;

describe("saving a compose provider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each(providerUpdates)(
		"does not send a status when saving $name settings",
		({ update }) => {
			expect(update).toEqual(
				expect.objectContaining({ composeId: "compose-1" }),
			);
			expect(update).not.toHaveProperty("composeStatus");
		},
	);

	it.each(["done", "running"])(
		"keeps the %s status when disconnecting a Git provider",
		async (status) => {
			let savedStatus = status;
			mockUpdateCompose.mockImplementation(async (_id, update) => {
				if (update.composeStatus !== undefined) {
					savedStatus = update.composeStatus;
				}
			});

			await caller.disconnectGitProvider({ composeId: "compose-1" });

			expect(savedStatus).toBe(status);
			expect(mockUpdateCompose).toHaveBeenCalledTimes(1);
			expect(mockUpdateCompose).toHaveBeenCalledWith(
				"compose-1",
				expect.objectContaining({ sourceType: "github" }),
			);
		},
	);
});
