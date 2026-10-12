import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
	provider: {} as Record<string, unknown>,
}));

vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: vi.fn(async () => ({ ...store.provider })),
	updateGitlab: vi.fn(async (_id: string, values: Record<string, unknown>) => {
		store.provider = { ...store.provider, ...values };
	}),
}));

const { refreshGitlabToken } = await import(
	"@dokploy/server/utils/providers/gitlab"
);

const GITLAB_ID = "gitlab-1";

// Behaves like GitLab: a refresh returns a new pair and invalidates the refresh token it used
const createGitlab = () => {
	let validRefreshToken = "refresh-1";
	let issued = 1;
	let failNext = false;

	const fetch = vi.fn(async (_url: string, init: RequestInit) => {
		const body = new URLSearchParams(init.body as string);
		// Keeps the request open, so concurrent callers overlap as two deployments do
		await new Promise((resolve) => setTimeout(resolve, 20));

		if (failNext) {
			failNext = false;
			return new Response(null, {
				status: 500,
				statusText: "Internal Server Error",
			});
		}

		if (body.get("refresh_token") !== validRefreshToken) {
			return new Response(null, { status: 400, statusText: "Bad Request" });
		}

		issued++;
		validRefreshToken = `refresh-${issued}`;
		return Response.json({
			access_token: `access-${issued}`,
			refresh_token: validRefreshToken,
			expires_in: 7200,
		});
	});

	return {
		fetch,
		failNextRequest: () => {
			failNext = true;
		},
	};
};

describe("refreshGitlabToken", () => {
	let gitlab: ReturnType<typeof createGitlab>;

	beforeEach(() => {
		store.provider = {
			gitlabId: GITLAB_ID,
			gitlabUrl: "https://gitlab.example.com",
			gitlabInternalUrl: null,
			applicationId: "app-id",
			secret: "app-secret",
			accessToken: "access-1",
			refreshToken: "refresh-1",
			expiresAt: 0,
		};
		gitlab = createGitlab();
		vi.stubGlobal("fetch", gitlab.fetch);
	});

	it("sends one refresh request when two callers find the token expired at the same time", async () => {
		await Promise.all([
			refreshGitlabToken(GITLAB_ID),
			refreshGitlabToken(GITLAB_ID),
		]);

		expect(gitlab.fetch).toHaveBeenCalledTimes(1);
		expect(store.provider.refreshToken).toBe("refresh-2");
	});

	it("refreshes again after a failed refresh", async () => {
		gitlab.failNextRequest();

		await expect(refreshGitlabToken(GITLAB_ID)).rejects.toThrow(
			"Failed to refresh token: Internal Server Error",
		);
		await refreshGitlabToken(GITLAB_ID);

		expect(gitlab.fetch).toHaveBeenCalledTimes(2);
		expect(store.provider.refreshToken).toBe("refresh-2");
	});
});
