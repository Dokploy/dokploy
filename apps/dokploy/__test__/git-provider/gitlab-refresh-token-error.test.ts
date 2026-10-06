import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findGitlabById: vi.fn(),
	updateGitlab: vi.fn(),
}));

vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: mocks.findGitlabById,
	updateGitlab: mocks.updateGitlab,
}));

import { refreshGitlabToken } from "@dokploy/server/utils/providers/gitlab";

const expiredProvider = {
	gitlabId: "gl-1",
	gitlabUrl: "https://gitlab.example.com",
	gitlabInternalUrl: null,
	applicationId: "client-id",
	secret: "client-secret",
	accessToken: "old-access",
	refreshToken: "old-refresh",
	expiresAt: 1,
};

describe("refreshGitlabToken", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", fetchMock);
		mocks.findGitlabById.mockResolvedValue(expiredProvider);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("throws UNAUTHORIZED with reconnect guidance and the HTTP status when the refresh is rejected", async () => {
		fetchMock.mockResolvedValue(
			new Response("{}", { status: 400, statusText: "Bad Request" }),
		);

		const error = await refreshGitlabToken("gl-1").catch((e) => e);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error.code).toBe("UNAUTHORIZED");
		expect(error.message).toContain(
			"GitLab token expired or was revoked. Reconnect the GitLab provider in Settings → Git.",
		);
		expect(error.message).toContain("HTTP 400");
		expect(mocks.updateGitlab).not.toHaveBeenCalled();
	});

	it("reports the status even when the response has no status text", async () => {
		fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));

		const error = await refreshGitlabToken("gl-1").catch((e) => e);

		expect(error.code).toBe("UNAUTHORIZED");
		expect(error.message).toContain("HTTP 401");
	});

	it("posts the refresh grant to the provider token endpoint", async () => {
		fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));

		await refreshGitlabToken("gl-1").catch(() => undefined);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://gitlab.example.com/oauth/token",
		);
	});

	it("stores the new tokens when the refresh succeeds", async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					access_token: "new-access",
					refresh_token: "new-refresh",
					expires_in: 7200,
				}),
				{ status: 200 },
			),
		);

		await refreshGitlabToken("gl-1");

		expect(mocks.updateGitlab).toHaveBeenCalledWith(
			"gl-1",
			expect.objectContaining({
				accessToken: "new-access",
				refreshToken: "new-refresh",
			}),
		);
	});

	it("does not call GitLab while the token is still valid", async () => {
		mocks.findGitlabById.mockResolvedValue({
			...expiredProvider,
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		});

		await refreshGitlabToken("gl-1");

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
