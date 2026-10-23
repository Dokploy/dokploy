import type { AzureDevopsClient } from "@dokploy/server/utils/providers/azure-devops-client";
import { evaluateAzureDevopsPush } from "@dokploy/server/utils/providers/azure-devops-push";
import { describe, expect, it, vi } from "vitest";

const project = "11111111-1111-4111-8111-111111111111";
const repo = "22222222-2222-4222-8222-222222222222";
const before = "a".repeat(40);
const after = "b".repeat(40);
const source = {
	sourceType: "azureDevops",
	autoDeploy: true,
	azureDevopsId: "provider",
	azureDevopsProjectId: project,
	azureDevopsRepositoryId: repo,
	azureDevopsBranch: "main",
	watchPaths: null,
};
const payload = (
	refs = [{ name: "refs/heads/main", oldObjectId: before, newObjectId: after }],
) => ({
	eventType: "git.push",
	resource: {
		repository: { id: repo, project: { id: project } },
		refUpdates: refs,
		commits: [{ commitId: after, comment: "Selected commit" }],
	},
});
const client = (paths: string[]) =>
	({
		changedPaths: vi.fn().mockResolvedValue(paths),
	}) as unknown as AzureDevopsClient;

describe("Azure DevOps push filtering", () => {
	it("selects the second ref, its hash and commit message", async () => {
		const getClient = vi.fn();
		const body = payload([
			{
				name: "refs/heads/other",
				oldObjectId: before,
				newObjectId: "c".repeat(40),
			},
			{ name: "refs/heads/main", oldObjectId: before, newObjectId: after },
		]);
		expect(
			await evaluateAzureDevopsPush("POST", body, source, getClient),
		).toMatchObject({ deploy: true, hash: after, title: "Selected commit" });
		expect(getClient).not.toHaveBeenCalled();
	});
	it.each(["GET", "PUT", undefined])("requires POST (%s)", async (method) =>
		expect(
			await evaluateAzureDevopsPush(method, payload(), source, vi.fn()),
		).toMatchObject({ deploy: false, status: 405 }),
	);
	it.each([{}, null, { eventType: "git.push", resource: {} }])(
		"rejects malformed payloads",
		async (body) =>
			expect(
				await evaluateAzureDevopsPush("POST", body, source, vi.fn()),
			).toMatchObject({ deploy: false, status: 400 }),
	);
	it.each(["refs/tags/main", "refs/heads/other"])("ignores %s", async (name) =>
		expect(
			await evaluateAzureDevopsPush(
				"POST",
				payload([{ name, oldObjectId: before, newObjectId: after }]),
				source,
				vi.fn(),
			),
		).toMatchObject({ deploy: false }),
	);
	it("ignores deleted branches", async () =>
		expect(
			await evaluateAzureDevopsPush(
				"POST",
				payload([
					{
						name: "refs/heads/main",
						oldObjectId: before,
						newObjectId: "0".repeat(40),
					},
				]),
				source,
				vi.fn(),
			),
		).toMatchObject({ deploy: false }));
	it.each([
		{ ...source, azureDevopsId: null },
		{ ...source, autoDeploy: false },
		{ ...source, azureDevopsRepositoryId: project },
		{ ...source, azureDevopsProjectId: repo },
		{ ...source, sourceType: "git" },
	])(
		"ignores disconnected, disabled and mismatched sources",
		async (configured) =>
			expect(
				await evaluateAzureDevopsPush("POST", payload(), configured, vi.fn()),
			).toMatchObject({ deploy: false }),
	);
	it("uses a safe title when the selected commit is absent from the payload", async () => {
		const body = payload();
		body.resource.commits = [];
		expect(
			await evaluateAzureDevopsPush("POST", body, source, vi.fn()),
		).toMatchObject({ deploy: true, title: "Azure DevOps push" });
	});
	it.each([
		["src/a.ts", true],
		["README.md", false],
	])("uses the full diff for watch paths (%s)", async (path, deploy) => {
		const api = client([path as string]);
		expect(
			await evaluateAzureDevopsPush(
				"POST",
				payload(),
				{ ...source, watchPaths: ["src/**"] },
				async () => api,
			),
		).toMatchObject({ deploy });
		expect(api.changedPaths).toHaveBeenCalledWith(project, repo, before, after);
	});
	it("deploys new branches and unavailable/force-push diffs", async () => {
		const getClient = vi.fn().mockRejectedValue(new Error("inaccessible"));
		for (const old of [before, "0".repeat(40)])
			expect(
				await evaluateAzureDevopsPush(
					"POST",
					payload([
						{ name: "refs/heads/main", oldObjectId: old, newObjectId: after },
					]),
					{ ...source, watchPaths: ["src/**"] },
					getClient,
				),
			).toMatchObject({ deploy: true, fallbackReason: expect.any(String) });
	});
});
