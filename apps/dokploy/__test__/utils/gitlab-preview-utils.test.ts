import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the gitlab service so findGitlabById does not hit the DB
vi.mock("@dokploy/server/services/gitlab", async (importOriginal) => {
	const mod =
		await importOriginal<typeof import("@dokploy/server/services/gitlab")>();
	return {
		...mod,
		findGitlabById: vi.fn(),
	};
});

import { findGitlabById } from "@dokploy/server/services/gitlab";
import {
	checkGitlabMemberPermissions,
	hasExistingSecurityMRNote,
	mrNoteExists,
} from "@dokploy/server/utils/providers/gitlab";

const FAKE_GITLAB_ID = "gitlab-provider-1";
const FAKE_PROVIDER = {
	gitlabId: FAKE_GITLAB_ID,
	accessToken: "test-access-token",
	gitlabUrl: "https://gitlab.example.com",
	gitlabInternalUrl: null,
	// Far-future expiry so refreshGitlabToken returns early without a fetch call
	expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

describe("checkGitlabMemberPermissions", () => {
	beforeEach(() => {
		vi.mocked(findGitlabById).mockResolvedValue(FAKE_PROVIDER as any);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns hasWriteAccess=true when access_level is 30 (Developer)", async () => {
		// GitLab access levels: Guest=10, Reporter=20, Developer=30, Maintainer=40, Owner=50
		const userId = 7;
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => [{ id: userId }],
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ id: userId, access_level: 30 }),
				}),
		);

		const result = await checkGitlabMemberPermissions(
			FAKE_GITLAB_ID,
			123,
			"someuser",
		);

		expect(result).toEqual({ hasWriteAccess: true, accessLevel: 30 });
	});

	it("returns hasWriteAccess=true when access_level is 40 (Maintainer)", async () => {
		const userId = 8;
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => [{ id: userId }],
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ id: userId, access_level: 40 }),
				}),
		);

		const result = await checkGitlabMemberPermissions(
			FAKE_GITLAB_ID,
			123,
			"maintainer",
		);

		expect(result).toEqual({ hasWriteAccess: true, accessLevel: 40 });
	});

	it("returns hasWriteAccess=false when access_level is 20 (Reporter)", async () => {
		const userId = 9;
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => [{ id: userId }],
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ id: userId, access_level: 20 }),
				}),
		);

		const result = await checkGitlabMemberPermissions(
			FAKE_GITLAB_ID,
			123,
			"reporter",
		);

		expect(result).toEqual({ hasWriteAccess: false, accessLevel: 20 });
	});

	it("returns hasWriteAccess=false with null accessLevel when user is not a project member (404)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => [{ id: 10 }],
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
					statusText: "Not Found",
				}),
		);

		const result = await checkGitlabMemberPermissions(
			FAKE_GITLAB_ID,
			123,
			"outsider",
		);

		expect(result).toEqual({ hasWriteAccess: false, accessLevel: null });
	});

	it("throws when the user lookup API call fails (non-ok response)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
			}),
		);

		await expect(
			checkGitlabMemberPermissions(FAKE_GITLAB_ID, 123, "anyuser"),
		).rejects.toThrow("Failed to resolve GitLab user");
	});

	it("returns hasWriteAccess=false when the username lookup returns no users", async () => {
		// GitLab /users?username=ghost returns [] when user does not exist
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => [], // no matching user
			}),
		);

		const result = await checkGitlabMemberPermissions(
			FAKE_GITLAB_ID,
			123,
			"ghost-user",
		);

		expect(result).toEqual({ hasWriteAccess: false, accessLevel: null });
	});

	it("throws when the members API returns a server error (500)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => [{ id: 11 }],
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
				}),
		);

		await expect(
			checkGitlabMemberPermissions(FAKE_GITLAB_ID, 123, "someuser"),
		).rejects.toThrow();
	});
});

describe("mrNoteExists", () => {
	beforeEach(() => {
		vi.mocked(findGitlabById).mockResolvedValue(FAKE_PROVIDER as any);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns true when the note exists (200 OK)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

		const exists = await mrNoteExists(FAKE_GITLAB_ID, 123, 42, 99);

		expect(exists).toBe(true);
	});

	it("returns false when the note does not exist (404)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

		const exists = await mrNoteExists(FAKE_GITLAB_ID, 123, 42, 0);

		expect(exists).toBe(false);
	});
});

describe("hasExistingSecurityMRNote", () => {
	beforeEach(() => {
		vi.mocked(findGitlabById).mockResolvedValue(FAKE_PROVIDER as any);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns false when there are no notes", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
		);

		const result = await hasExistingSecurityMRNote(FAKE_GITLAB_ID, 123, 42);

		expect(result).toBe(false);
	});

	it("returns false when notes exist but none contain the security sentinel", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => [
					{ id: 1, body: "Looks good!" },
					{ id: 2, body: "Please fix tests." },
				],
			}),
		);

		const result = await hasExistingSecurityMRNote(FAKE_GITLAB_ID, 123, 42);

		expect(result).toBe(false);
	});

	it("returns true when a note contains the security sentinel text", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => [
					{ id: 1, body: "Looks good!" },
					{
						id: 2,
						body: "### 🚨 Preview Deployment Blocked - Security Protection",
					},
				],
			}),
		);

		const result = await hasExistingSecurityMRNote(FAKE_GITLAB_ID, 123, 42);

		expect(result).toBe(true);
	});
});
