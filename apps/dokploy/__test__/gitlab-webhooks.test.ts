import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findGitlabById: vi.fn(),
	updateGitlab: vi.fn(),
}));

vi.mock("@dokploy/server/services/gitlab", () => mocks);

import { registerGitlabDeployWebhook } from "@dokploy/server/utils/providers/gitlab";

const deployWebhookUrl = "https://dokploy.example.com/api/deploy/refresh-token";

const createResponse = (
	body: unknown,
	init: { status?: number; statusText?: string } = {},
) =>
	new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: {
			"Content-Type": "application/json",
		},
	});

const mockGitlabProvider = (overrides = {}) => ({
	gitlabId: "gitlab-id",
	gitlabUrl: "https://gitlab.example.com/",
	gitlabInternalUrl: null,
	applicationId: "application-id",
	redirectUri: "https://dokploy.example.com/api/providers/gitlab/callback",
	secret: "secret",
	accessToken: "access-token",
	refreshToken: "refresh-token",
	groupName: null,
	expiresAt: Math.floor(Date.now() / 1000) + 3600,
	gitProviderId: "git-provider-id",
	...overrides,
});

describe("registerGitlabDeployWebhook", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates a project hook when no hook exists for the deploy URL", async () => {
		mocks.findGitlabById.mockResolvedValue(mockGitlabProvider());
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(createResponse([]))
			.mockResolvedValueOnce(createResponse({ id: 1, url: deployWebhookUrl }));

		await registerGitlabDeployWebhook({
			gitlabId: "gitlab-id",
			gitlabProjectId: 123,
			branch: "main",
			deployWebhookUrl,
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"https://gitlab.example.com/api/v4/projects/123/hooks?per_page=100",
			{
				headers: {
					Authorization: "Bearer access-token",
					"Content-Type": "application/json",
				},
			},
		);

		const createCall = fetchMock.mock.calls[1];
		expect(createCall?.[0]).toBe(
			"https://gitlab.example.com/api/v4/projects/123/hooks",
		);
		expect(createCall?.[1]).toMatchObject({
			method: "POST",
			headers: {
				Authorization: "Bearer access-token",
				"Content-Type": "application/json",
			},
		});
		expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
			url: deployWebhookUrl,
			push_events: true,
			enable_ssl_verification: true,
			push_events_branch_filter: "main",
			branch_filter_strategy: "wildcard",
		});
	});

	it("updates the existing project hook with the same deploy URL", async () => {
		mocks.findGitlabById.mockResolvedValue(mockGitlabProvider());
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				createResponse([{ id: 456, url: deployWebhookUrl }]),
			)
			.mockResolvedValueOnce(
				createResponse({ id: 456, url: deployWebhookUrl }),
			);

		await registerGitlabDeployWebhook({
			gitlabId: "gitlab-id",
			gitlabProjectId: 123,
			branch: "production",
			deployWebhookUrl,
		});

		const updateCall = fetchMock.mock.calls[1];
		expect(updateCall?.[0]).toBe(
			"https://gitlab.example.com/api/v4/projects/123/hooks/456",
		);
		expect(updateCall?.[1]).toMatchObject({
			method: "PUT",
		});
		expect(JSON.parse(updateCall?.[1]?.body as string)).toMatchObject({
			url: deployWebhookUrl,
			push_events_branch_filter: "production",
		});
	});

	it("uses the internal GitLab URL before the public URL", async () => {
		mocks.findGitlabById.mockResolvedValue(
			mockGitlabProvider({
				gitlabUrl: "https://gitlab.example.com",
				gitlabInternalUrl: "http://gitlab:8080/",
			}),
		);
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(createResponse([]))
			.mockResolvedValueOnce(createResponse({ id: 1, url: deployWebhookUrl }));

		await registerGitlabDeployWebhook({
			gitlabId: "gitlab-id",
			gitlabProjectId: 123,
			branch: "main",
			deployWebhookUrl,
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"http://gitlab:8080/api/v4/projects/123/hooks?per_page=100",
		);
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"http://gitlab:8080/api/v4/projects/123/hooks",
		);
	});
});
