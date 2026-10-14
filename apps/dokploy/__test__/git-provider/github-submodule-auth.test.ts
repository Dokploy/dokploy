import { cloneGithubRepository } from "@dokploy/server/utils/providers/github"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockFindGithubById, mockGithubAuth } = vi.hoisted(() => ({
	mockFindGithubById: vi.fn(),
	mockGithubAuth: vi.fn(),
}))

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: mockFindGithubById,
}))

vi.mock("@octokit/auth-app", () => ({
	createAppAuth: vi.fn(),
}))

vi.mock("octokit", () => ({
	Octokit: vi.fn(function () {
		return { auth: mockGithubAuth }
	}),
}))

beforeEach(() => {
	vi.clearAllMocks()
	mockFindGithubById.mockResolvedValue({
		githubAppId: "app-id",
		githubPrivateKey: "private-key",
		githubInstallationId: "installation-id",
	})
	mockGithubAuth.mockResolvedValue({ token: "installation-token" })
})

const cloneCommand = (enableSubmodules: boolean) =>
	cloneGithubRepository({
		appName: "example-app",
		owner: "octo-org",
		repository: "private-repository",
		branch: "main",
		githubId: "github-provider",
		enableSubmodules,
		serverId: null,
		outputPathOverride: "/tmp/example-app",
	})

describe("GitHub repository clone authentication", () => {
	it("authenticates HTTPS clones without storing the token in the remote URL", async () => {
		const command = await cloneCommand(false)
		const authorization = Buffer.from(
			"x-access-token:installation-token",
		).toString("base64")

		expect(command).toContain(
			`http.https://github.com/.extraheader=Authorization: Basic ${authorization}`,
		)
		expect(command).toContain(
			"https://github.com/octo-org/private-repository.git",
		)
		expect(command).not.toContain("installation-token@")
		expect(command).not.toContain("--recurse-submodules")
	})

	it("rewrites GitHub SSH submodule URLs to authenticated HTTPS", async () => {
		const command = await cloneCommand(true)

		expect(command).toContain("--recurse-submodules")
		expect(command).toContain(
			"url.https://github.com/.insteadOf=git@github.com:",
		)
		expect(command).toContain(
			"url.https://github.com/.insteadOf=ssh://git@github.com/",
		)
		expect(command).toContain("http.https://github.com/.extraheader=")
	})
})
