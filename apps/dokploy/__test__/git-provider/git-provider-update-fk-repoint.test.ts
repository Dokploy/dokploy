import { beforeEach, describe, expect, it, vi } from "vitest";

// Service-level guard: the update* services must never write the identity/FK
// columns (giteaId/githubId/gitlabId and gitProviderId). Repointing gitProviderId
// at another org's git_provider is the credential-leak mechanism. We capture the
// argument passed to drizzle's `.set()` and assert the FK/PK keys are absent.

const capture = vi.hoisted(() => ({ setArgs: [] as unknown[] }));
const setMock = vi.hoisted(() =>
	vi.fn((values: unknown) => {
		capture.setArgs.push(values);
		return { where: () => ({ returning: () => Promise.resolve([{}]) }) };
	}),
);
const updateMock = vi.hoisted(() => vi.fn(() => ({ set: setMock })));

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: updateMock,
	},
}));

import { updateGitea } from "@dokploy/server/services/gitea";
import { updateGithub } from "@dokploy/server/services/github";
import { updateGitlab } from "@dokploy/server/services/gitlab";

beforeEach(() => {
	vi.clearAllMocks();
	capture.setArgs.length = 0;
});

const hijackPayload = {
	giteaId: "gitea-victim",
	gitProviderId: "gp-attacker",
	giteaUrl: "https://evil.gitea.com",
	clientSecret: "stolen-secret",
	accessToken: "stolen-at",
	refreshToken: "stolen-rt",
};

describe("updateGitea — FK/PK repoint guard", () => {
	it("strips giteaId and gitProviderId from the SET clause", async () => {
		await updateGitea("gitea-victim", hijackPayload);

		expect(setMock).toHaveBeenCalledTimes(1);
		const setArg = capture.setArgs[0] as Record<string, unknown>;
		expect(setArg).not.toHaveProperty("giteaId");
		expect(setArg).not.toHaveProperty("gitProviderId");
		expect(setArg.giteaUrl).toBe("https://evil.gitea.com");
		expect(setArg.clientSecret).toBe("stolen-secret");
	});

	it("preserves OAuth secret columns when they are provided", async () => {
		await updateGitea("gitea-victim", {
			accessToken: "at",
			refreshToken: "rt",
			expiresAt: 123,
		});

		const setArg = capture.setArgs[0] as Record<string, unknown>;
		expect(setArg.accessToken).toBe("at");
		expect(setArg.refreshToken).toBe("rt");
		expect(setArg.expiresAt).toBe(123);
		expect(setArg).not.toHaveProperty("gitProviderId");
		expect(setArg).not.toHaveProperty("giteaId");
	});

	it("only sends provided editable columns (omitted fields are not sent)", async () => {
		await updateGitea("gitea-victim", {
			giteaUrl: "https://gitea.com",
		});

		const setArg = capture.setArgs[0] as Record<string, unknown>;
		expect(Object.keys(setArg)).toEqual(["giteaUrl"]);
	});
});

describe("updateGithub — FK/PK repoint guard", () => {
	it("strips githubId and gitProviderId from the SET clause", async () => {
		await updateGithub("gh-victim", {
			githubId: "gh-victim",
			gitProviderId: "gp-attacker",
			githubAppName: "stolen-app",
			githubUrl: "https://github.corp.evil.com",
			githubClientSecret: "stolen-secret",
		});

		expect(setMock).toHaveBeenCalledTimes(1);
		const setArg = capture.setArgs[0] as Record<string, unknown>;
		expect(setArg).not.toHaveProperty("githubId");
		expect(setArg).not.toHaveProperty("gitProviderId");
		expect(setArg.githubAppName).toBe("stolen-app");
		expect(setArg.githubUrl).toBe("https://github.corp.evil.com");
		expect(setArg.githubClientSecret).toBe("stolen-secret");
	});

	it("only sends provided editable columns", async () => {
		await updateGithub("gh-victim", {
			githubAppName: "renamed-app",
		});

		const setArg = capture.setArgs[0] as Record<string, unknown>;
		expect(Object.keys(setArg)).toEqual(["githubAppName"]);
	});
});

describe("updateGitlab — FK/PK repoint guard", () => {
	it("strips gitlabId and gitProviderId from the SET clause", async () => {
		await updateGitlab("gl-victim", {
			gitlabId: "gl-victim",
			gitProviderId: "gp-attacker",
			gitlabUrl: "https://gitlab.corp.evil.com",
			secret: "stolen-secret",
			accessToken: "stolen-at",
		});

		expect(setMock).toHaveBeenCalledTimes(1);
		const setArg = capture.setArgs[0] as Record<string, unknown>;
		expect(setArg).not.toHaveProperty("gitlabId");
		expect(setArg).not.toHaveProperty("gitProviderId");
		expect(setArg.gitlabUrl).toBe("https://gitlab.corp.evil.com");
		expect(setArg.secret).toBe("stolen-secret");
		expect(setArg.accessToken).toBe("stolen-at");
	});

	it("only sends provided editable columns", async () => {
		await updateGitlab("gl-victim", {
			gitlabUrl: "https://gitlab.com",
		});

		const setArg = capture.setArgs[0] as Record<string, unknown>;
		expect(Object.keys(setArg)).toEqual(["gitlabUrl"]);
	});
});
