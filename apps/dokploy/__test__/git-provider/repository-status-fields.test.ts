import { afterEach, describe, expect, it, vi } from "vitest";

const farFuture = () => Math.floor(Date.now() / 1000) + 3600;

vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: vi.fn(async () => ({
		gitlabId: "gitlab-1",
		gitlabUrl: "https://gitlab.example.com",
		accessToken: "token",
		expiresAt: farFuture(),
		groupName: null,
	})),
	updateGitlab: vi.fn(),
}));

vi.mock("@dokploy/server/services/gitea", () => ({
	findGiteaById: vi.fn(async () => ({
		giteaId: "gitea-1",
		giteaUrl: "https://gitea.example.com",
		accessToken: "token",
	})),
	updateGitea: vi.fn(),
}));

vi.mock("@dokploy/server/services/bitbucket", () => ({
	findBitbucketById: vi.fn(async () => ({
		bitbucketId: "bitbucket-1",
		bitbucketUsername: "acme",
		appPassword: "secret",
	})),
}));

const { getGitlabRepositories } = await import(
	"@dokploy/server/utils/providers/gitlab"
);
const { getGiteaRepositories } = await import(
	"@dokploy/server/utils/providers/gitea"
);
const { getBitbucketRepositories } = await import(
	"@dokploy/server/utils/providers/bitbucket"
);

const respondWith = (pages: unknown[]) => {
	const fetch = vi.fn(async () => Response.json(pages.shift() ?? []));
	vi.stubGlobal("fetch", fetch);
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("repository status fields", () => {
	it("maps GitLab archived, visibility, fork and activity", async () => {
		respondWith([
			[
				{
					id: 1,
					name: "API",
					path_with_namespace: "acme/api",
					namespace: { path: "acme", full_path: "acme", kind: "user" },
					visibility: "internal",
					archived: true,
					forked_from_project: { id: 99 },
					last_activity_at: "2026-01-01T00:00:00Z",
				},
				{
					id: 2,
					name: "Site",
					path_with_namespace: "acme/site",
					namespace: { path: "acme", full_path: "acme", kind: "user" },
					visibility: "public",
					archived: false,
					last_activity_at: "2026-02-01T00:00:00Z",
				},
			],
		]);

		const repositories = await getGitlabRepositories("gitlab-1");

		expect(repositories).toEqual([
			{
				id: 1,
				name: "API",
				url: "acme/api",
				owner: { username: "acme" },
				visibility: "internal",
				archived: true,
				fork: true,
				lastActivityAt: "2026-01-01T00:00:00Z",
			},
			{
				id: 2,
				name: "Site",
				url: "acme/site",
				owner: { username: "acme" },
				visibility: "public",
				archived: false,
				fork: false,
				lastActivityAt: "2026-02-01T00:00:00Z",
			},
		]);
	});

	it("maps Gitea archived, visibility, fork and activity", async () => {
		respondWith([
			[
				{
					id: 1,
					name: "api",
					full_name: "acme/api",
					owner: { login: "acme" },
					private: true,
					internal: false,
					archived: true,
					fork: true,
					updated_at: "2026-01-01T00:00:00Z",
				},
				{
					id: 2,
					name: "docs",
					full_name: "acme/docs",
					owner: { login: "acme" },
					private: false,
					internal: true,
					archived: false,
					fork: false,
					updated_at: "2026-02-01T00:00:00Z",
				},
			],
		]);

		const repositories = await getGiteaRepositories("gitea-1");

		expect(
			repositories.map(({ visibility, archived, fork, lastActivityAt }) => ({
				visibility,
				archived,
				fork,
				lastActivityAt,
			})),
		).toEqual([
			{
				visibility: "private",
				archived: true,
				fork: true,
				lastActivityAt: "2026-01-01T00:00:00Z",
			},
			{
				visibility: "internal",
				archived: false,
				fork: false,
				lastActivityAt: "2026-02-01T00:00:00Z",
			},
		]);
	});

	it("maps Bitbucket visibility, fork and activity", async () => {
		respondWith([
			{
				values: [
					{
						name: "api",
						slug: "api",
						links: { html: { href: "https://bitbucket.org/acme/api" } },
						workspace: { slug: "acme" },
						is_private: true,
						parent: { full_name: "upstream/api" },
						updated_on: "2026-01-01T00:00:00Z",
					},
					{
						name: "site",
						slug: "site",
						links: { html: { href: "https://bitbucket.org/acme/site" } },
						workspace: { slug: "acme" },
						is_private: false,
						updated_on: "2026-02-01T00:00:00Z",
					},
				],
				next: null,
			},
		]);

		const repositories = await getBitbucketRepositories("bitbucket-1");

		expect(repositories).toEqual([
			{
				name: "api",
				slug: "api",
				url: "https://bitbucket.org/acme/api",
				owner: { username: "acme" },
				visibility: "private",
				fork: true,
				lastActivityAt: "2026-01-01T00:00:00Z",
			},
			{
				name: "site",
				slug: "site",
				url: "https://bitbucket.org/acme/site",
				owner: { username: "acme" },
				visibility: "public",
				fork: false,
				lastActivityAt: "2026-02-01T00:00:00Z",
			},
		]);
	});
});
