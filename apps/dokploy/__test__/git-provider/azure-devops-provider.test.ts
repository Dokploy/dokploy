import { beforeEach, describe, expect, it, vi } from "vitest";

const findAzureDevopsById = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/azure-devops", () => ({
	findAzureDevopsById,
}));

const {
	cloneAzureDevopsRepository,
	getAzureDevopsBranches,
	getAzureDevopsHeaders,
	getAzureDevopsRepositories,
} = await import("@dokploy/server/utils/providers/azure-devops");

const provider = {
	azureDevopsId: "azure-1",
	organizationName: "contoso",
	personalAccessToken: "secret token",
	gitProviderId: "provider-1",
};

describe("Azure DevOps provider", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		findAzureDevopsById.mockResolvedValue(provider);
	});

	it("uses PAT basic authentication without exposing a username", () => {
		expect(getAzureDevopsHeaders(provider).Authorization).toBe(
			`Basic ${Buffer.from(":secret token").toString("base64")}`,
		);
	});

	it("maps repositories from all accessible projects", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					value: [
						{
							id: "repo-1",
							name: "api",
							remoteUrl: "https://dev.azure.com/contoso/platform/_git/api",
							webUrl: "https://dev.azure.com/contoso/platform/_git/api",
							defaultBranch: "refs/heads/main",
							project: { id: "project-1", name: "platform" },
						},
					],
				}),
				{ status: 200 },
			),
		);

		await expect(getAzureDevopsRepositories("azure-1")).resolves.toEqual([
			{
				id: "repo-1",
				name: "api",
				url: "https://dev.azure.com/contoso/platform/_git/api",
				remoteUrl: "https://dev.azure.com/contoso/platform/_git/api",
				defaultBranch: "main",
				project: { id: "project-1", name: "platform" },
			},
		]);
	});

	it("normalizes branch refs", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					value: [{ name: "refs/heads/feature/azure", objectId: "abc123" }],
				}),
				{ status: 200 },
			),
		);

		await expect(
			getAzureDevopsBranches({
				azureDevopsId: "azure-1",
				projectId: "project-1",
				repositoryId: "repo-1",
			}),
		).resolves.toEqual([{ name: "feature/azure", commit: { sha: "abc123" } }]);
	});

	it("builds a quoted private clone command", async () => {
		const command = (
			await cloneAzureDevopsRepository({
				appName: "my-app",
				azureDevopsRemoteUrl: "https://dev.azure.com/contoso/platform/_git/api",
				azureDevopsBranch: "main",
				azureDevopsId: "azure-1",
				enableSubmodules: false,
				serverId: null,
			})
		).replace(/\\/g, "");

		expect(command).toContain("dev.azure.com/contoso/platform/_git/api");
		expect(command).toContain("dokploy:secret%20token@");
		expect(command).toContain("--branch main");
	});

	it("rejects clone URLs outside dev.azure.com", async () => {
		await expect(
			cloneAzureDevopsRepository({
				appName: "my-app",
				azureDevopsRemoteUrl: "https://evil.example/repository",
				azureDevopsBranch: "main",
				azureDevopsId: "azure-1",
				enableSubmodules: false,
				serverId: null,
			}),
		).rejects.toThrow("Invalid Azure DevOps repository URL");
	});
});
