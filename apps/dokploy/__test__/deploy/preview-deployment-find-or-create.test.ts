import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
	previewDeploymentId: string;
	applicationId: string;
	pullRequestId: string;
};

const state = vi.hoisted(() => ({
	rows: [] as Array<{
		previewDeploymentId: string;
		applicationId: string;
		pullRequestId: string;
	}>,
	createComment: vi.fn(),
}));

// Answer from the current state, then yield to the event loop before the
// caller continues, the way a database round trip does: without the lock,
// concurrent callers all read "no preview yet" and every one creates its own.
const yieldToOthers = () => new Promise((resolve) => setTimeout(resolve, 1));

const conditionValue = (
	where: { conditions?: Array<{ field: string; value: unknown }> },
	field: string,
) => where?.conditions?.find((condition) => condition.field === field)?.value;

vi.mock("drizzle-orm", async (importOriginal) => ({
	...(await importOriginal<typeof import("drizzle-orm")>()),
	eq: (column: { name: string }, value: unknown) => ({
		field: column.name,
		value,
	}),
	and: (...conditions: Array<{ field: string; value: unknown }>) => ({
		conditions,
	}),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			previewDeployments: {
				findFirst: vi.fn(async ({ where }) => {
					const row = state.rows.find(
						(row) =>
							row.applicationId === conditionValue(where, "applicationId") &&
							row.pullRequestId === conditionValue(where, "pullRequestId"),
					);
					await yieldToOthers();
					return row;
				}),
			},
			organization: {
				findFirst: vi.fn().mockResolvedValue({ ownerId: "owner-id" }),
			},
		},
		$count: vi.fn(async (_table, where: { value: unknown }) => {
			const total = state.rows.filter(
				(row) => row.applicationId === where.value,
			).length;
			await yieldToOthers();
			return total;
		}),
		insert: vi.fn(() => ({
			values: (values: Omit<Row, "previewDeploymentId">) => ({
				returning: async () => {
					const row = {
						...values,
						previewDeploymentId: `preview-${state.rows.length + 1}`,
					};
					state.rows.push(row);
					return [row];
				},
			}),
		})),
		update: vi.fn(() => ({
			set: () => ({ where: async () => [] }),
		})),
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn().mockResolvedValue({
		applicationId: "application-id",
		appName: "my-app",
		githubId: "github-id",
		owner: "agentHits",
		repository: "dokploy",
		previewWildcard: "*.preview.example.com",
		previewHttps: true,
		previewPath: "/",
		previewPort: 3000,
		previewCertificateType: "none",
		previewCustomCertResolver: null,
		environment: { project: { organizationId: "organization-id" } },
		server: null,
	}),
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: vi.fn().mockResolvedValue({}),
	getIssueComment: vi.fn(() => "comment"),
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: vi.fn(() => ({
		rest: { issues: { createComment: state.createComment } },
	})),
}));

vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: vi.fn().mockResolvedValue({ domainId: "domain-id" }),
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@dokploy/server/templates", () => ({
	generatePassword: () => "abcdef",
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	removeDeploymentsByPreviewDeploymentId: vi.fn(),
}));
vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: vi.fn(),
}));
vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: vi.fn(),
}));
vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));

import { db } from "@dokploy/server/db";
import { findOrCreatePreviewDeployment } from "@dokploy/server/services/preview-deployment";

const pullRequest = (pullRequestId: string) => ({
	applicationId: "application-id",
	branch: "feature",
	pullRequestId,
	pullRequestNumber: "42",
	pullRequestTitle: "feat: add preview",
	pullRequestURL: "https://github.com/agentHits/dokploy/pull/42",
});

const existingRow = (pullRequestId: string, index: number) => ({
	previewDeploymentId: `existing-${index}`,
	applicationId: "application-id",
	pullRequestId,
});

describe("findOrCreatePreviewDeployment", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.rows = [];
		state.createComment.mockResolvedValue({ data: { id: 1 } });
	});

	it("creates one preview for a burst of concurrent webhook deliveries", async () => {
		const results = await Promise.all(
			Array.from({ length: 5 }, () =>
				findOrCreatePreviewDeployment(pullRequest("pr-1"), 3),
			),
		);

		expect(db.insert).toHaveBeenCalledTimes(1);
		expect(state.createComment).toHaveBeenCalledTimes(1);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(
			new Set(
				results.map((result) => result.previewDeployment?.previewDeploymentId),
			),
		).toEqual(new Set(["preview-1"]));
	});

	it("returns the existing preview whatever the limit", async () => {
		state.rows = [existingRow("pr-1", 0), existingRow("pr-2", 1)];

		const result = await findOrCreatePreviewDeployment(pullRequest("pr-1"), 1);

		expect(result).toEqual({
			previewDeployment: existingRow("pr-1", 0),
			created: false,
		});
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("does not create a preview past the limit", async () => {
		state.rows = [
			existingRow("pr-1", 0),
			existingRow("pr-2", 1),
			existingRow("pr-3", 2),
		];

		const result = await findOrCreatePreviewDeployment(pullRequest("pr-4"), 3);

		expect(result).toEqual({ previewDeployment: null, created: false });
		expect(db.insert).not.toHaveBeenCalled();
		expect(state.createComment).not.toHaveBeenCalled();
	});

	it("counts a preview created meanwhile for another pull request", async () => {
		state.rows = [existingRow("pr-1", 0)];

		const results = await Promise.all([
			findOrCreatePreviewDeployment(pullRequest("pr-2"), 2),
			findOrCreatePreviewDeployment(pullRequest("pr-3"), 2),
		]);

		expect(db.insert).toHaveBeenCalledTimes(1);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(
			results.filter((result) => result.previewDeployment === null),
		).toHaveLength(1);
	});

	it("lets the next caller proceed when creation fails", async () => {
		state.createComment.mockRejectedValueOnce(new Error("GitHub is down"));

		const [first, second] = await Promise.allSettled([
			findOrCreatePreviewDeployment(pullRequest("pr-1"), 3),
			findOrCreatePreviewDeployment(pullRequest("pr-1"), 3),
		]);

		expect(first.status).toBe("rejected");
		expect(second.status).toBe("fulfilled");
		expect(second.status === "fulfilled" && second.value.created).toBe(true);
	});
});
