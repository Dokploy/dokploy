import {
	getBitbucketBranch,
	getBitbucketRepository,
} from "@dokploy/server/utils/providers/bitbucket";
import {
	getGiteaBranch,
	getGiteaRepository,
} from "@dokploy/server/utils/providers/gitea";
import {
	getGithubBranch,
	getGithubRepository,
} from "@dokploy/server/utils/providers/github";
import {
	getGitlabBranch,
	getGitlabRepository,
} from "@dokploy/server/utils/providers/gitlab";
import type { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findBitbucketById: vi.fn(),
	findGiteaById: vi.fn(),
	findGithubById: vi.fn(),
	findGitlabById: vi.fn(),
	githubGetBranch: vi.fn(),
	githubGetRepository: vi.fn(),
	updateGitea: vi.fn(),
	updateGitlab: vi.fn(),
}));

vi.mock("@dokploy/server/services/bitbucket", () => ({
	findBitbucketById: mocks.findBitbucketById,
}));

vi.mock("@dokploy/server/services/gitea", () => ({
	findGiteaById: mocks.findGiteaById,
	updateGitea: mocks.updateGitea,
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: mocks.findGithubById,
}));

vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: mocks.findGitlabById,
	updateGitlab: mocks.updateGitlab,
}));

vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));
vi.mock("octokit", () => ({
	Octokit: class {
		rest = {
			repos: {
				getBranch: mocks.githubGetBranch,
				get: mocks.githubGetRepository,
			},
		};
	},
}));

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findGithubById.mockResolvedValue({
		githubAppId: 1,
		githubInstallationId: "2",
		githubPrivateKey: "private-key",
		githubUrl: "https://github.com",
	});
	mocks.findBitbucketById.mockResolvedValue({
		apiToken: "token",
		bitbucketEmail: "dev@example.com",
	});
	mocks.findGitlabById.mockResolvedValue({
		accessToken: "token",
		expiresAt: Math.floor(Date.now() / 1000) + 3600,
		gitlabUrl: "https://gitlab.example.com",
	});
	mocks.findGiteaById.mockResolvedValue({
		accessToken: "token",
		giteaUrl: "https://gitea.example.com",
	});
});

describe("direct branch lookup", () => {
	it("looks up one GitHub branch", async () => {
		mocks.githubGetBranch.mockResolvedValue({
			data: { name: "feature/payments" },
		});

		await expect(
			getGithubBranch("github-1", "acme", "payments", "feature/payments"),
		).resolves.toEqual({ name: "feature/payments" });
		expect(mocks.githubGetBranch).toHaveBeenCalledWith({
			owner: "acme",
			repo: "payments",
			branch: "feature/payments",
		});
	});

	it("looks up one Bitbucket branch without listing branches", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ name: "feature/payments" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getBitbucketBranch("bitbucket-1", "acme", "payments", "feature/payments"),
		).resolves.toEqual({ name: "feature/payments" });
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/refs/branches/feature%2Fpayments",
		);
	});

	it("looks up one GitLab branch by project id", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ name: "release/2026.08" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getGitlabBranch("gitlab-1", 202, "release/2026.08"),
		).resolves.toEqual({ name: "release/2026.08" });
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/projects/202/repository/branches/release%2F2026.08",
		);
	});

	it("looks up one Gitea branch", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "main" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getGiteaBranch("gitea-1", "acme", "payments", "main"),
		).resolves.toEqual({ name: "main" });
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/api/v1/repos/acme/payments/branches/main",
		);
	});
});

describe("direct repository lookup", () => {
	it("looks up one GitHub installation repository", async () => {
		mocks.githubGetRepository.mockResolvedValue({
			data: {
				id: 101,
				name: "payments",
				full_name: "acme/payments",
				html_url: "https://github.com/acme/payments",
				owner: { login: "acme" },
			},
		});

		await expect(
			getGithubRepository("github-1", "acme", "payments"),
		).resolves.toEqual({
			id: 101,
			name: "payments",
			owner: "acme",
			path: "acme/payments",
			url: "https://github.com/acme/payments",
		});
		expect(mocks.githubGetRepository).toHaveBeenCalledWith({
			owner: "acme",
			repo: "payments",
		});
	});

	it("looks up one Bitbucket workspace repository", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				uuid: "{repo-id}",
				name: "Payments API",
				slug: "payments-api",
				full_name: "acme/payments-api",
				workspace: { slug: "acme" },
				links: { html: { href: "https://bitbucket.org/acme/payments-api" } },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getBitbucketRepository("bitbucket-1", "acme", "payments-api"),
		).resolves.toMatchObject({
			id: "{repo-id}",
			name: "Payments API",
			owner: "acme",
			path: "acme/payments-api",
			slug: "payments-api",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/repositories/acme/payments-api",
		);
	});

	it("looks up nested GitLab project paths", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				id: 202,
				name: "Payments",
				path: "payments",
				path_with_namespace: "platform/backend/payments",
				web_url: "https://gitlab.example.com/platform/backend/payments",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getGitlabRepository("gitlab-1", "platform/backend", "payments"),
		).resolves.toEqual({
			id: 202,
			name: "Payments",
			owner: "platform/backend",
			path: "platform/backend/payments",
			url: "https://gitlab.example.com/platform/backend/payments",
		});
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"projects/platform%2Fbackend%2Fpayments",
		);
	});

	it("looks up one Gitea repository", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				id: 303,
				name: "payments",
				full_name: "acme/payments",
				html_url: "https://gitea.example.com/acme/payments",
				owner: { login: "acme" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getGiteaRepository("gitea-1", "acme", "payments"),
		).resolves.toEqual({
			id: 303,
			name: "payments",
			owner: "acme",
			path: "acme/payments",
			url: "https://gitea.example.com/acme/payments",
		});
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/api/v1/repos/acme/payments",
		);
	});

	it("returns a not-found error without falling back to the full list", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

		await expect(
			getBitbucketRepository("bitbucket-1", "acme", "missing"),
		).rejects.toEqual(
			expect.objectContaining<Partial<TRPCError>>({ code: "NOT_FOUND" }),
		);
	});
});
