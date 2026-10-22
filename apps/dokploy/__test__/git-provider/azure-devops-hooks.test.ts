import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	service: {} as Record<string, unknown> | undefined,
	provider: {} as Record<string, unknown> | undefined,
	records: [] as Record<string, unknown>[],
	remote: [] as Record<string, unknown>[],
	locked: vi.fn(),
	post: vi.fn(),
	put: vi.fn(),
	failDelete: false,
	loseCreate: false,
	missing: false,
	failCreate: false,
	versions: ["1.0", "2.0"],
	callbackOrigin: "https://dokploy.test",
}));

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: async () => state.callbackOrigin,
}));
vi.mock("@dokploy/server/db", () => {
	const query = {
		applications: { findFirst: async () => state.service },
		compose: { findFirst: async () => state.service },
		azureDevops: { findFirst: async () => state.provider },
		azureDevopsHook: {
			findMany: async () => state.records.map((record) => ({ ...record })),
		},
	};
	const tx = {
		query,
		execute: state.locked,
		insert: () => ({
			values: (value: Record<string, unknown>) => ({
				onConflictDoNothing: async () => {
					if (
						!state.records.some(
							(record) =>
								record.serviceId === value.serviceId &&
								record.azureDevopsId === value.azureDevopsId,
						)
					)
						state.records.push({
							id: "record",
							status: "pending",
							subscriptionId: null,
							...value,
						});
				},
				returning: async () => {
					const record = {
						id: "record",
						status: "pending",
						subscriptionId: null,
						...value,
					};
					state.records.push(record);
					return [record];
				},
			}),
		}),
		update: (table: Parameters<typeof getTableName>[0]) => ({
			set: (value: Record<string, unknown>) => ({
				where: async () => {
					if (getTableName(table) === "azure_devops_hook")
						Object.assign(state.records[0]!, value);
				},
			}),
		}),
		delete: () => ({
			where: async () => {
				state.records = [];
			},
		}),
	};
	return {
		db: {
			...tx,
			transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
		},
	};
});

import { syncAzureDevopsWebhook } from "@dokploy/server/services/azure-devops-hooks";

const project = "11111111-1111-4111-8111-111111111111";
const repo = "22222222-2222-4222-8222-222222222222";
const response = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});

beforeEach(() => {
	vi.clearAllMocks();
	state.records = [];
	state.remote = [];
	state.failDelete = false;
	state.loseCreate = false;
	state.missing = false;
	state.failCreate = false;
	state.versions = ["1.0", "2.0"];
	state.callbackOrigin = "https://dokploy.test";
	state.service = {
		sourceType: "azureDevops",
		azureDevopsId: "provider",
		azureDevopsProjectId: project,
		azureDevopsRepositoryId: repo,
		azureDevopsBranch: "main",
		autoDeploy: true,
		refreshToken: "callback-secret",
		environment: { project: { organizationId: "org" } },
	};
	state.provider = {
		azureDevopsId: "provider",
		baseUrl: "https://ado.test/tfs/c",
		personalAccessToken: "private-pat",
	};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: URL, options: RequestInit) => {
			const method = options.method;
			if (url.pathname.endsWith("publishers/tfs"))
				return response({
					supportedEvents: [
						{ id: "git.push", supportedResourceVersions: state.versions },
					],
				});
			if (method === "GET") return response({ value: state.remote });
			if (method === "POST") {
				if (state.failCreate)
					return response({ message: "private-pat callback-secret" }, 403);
				const data = {
					...JSON.parse(options.body as string),
					id: `subscription-${state.remote.length + 1}`,
				};
				state.remote.push(data);
				state.post(data);
				if (state.loseCreate) {
					state.loseCreate = false;
					throw new Error("Lost response private-pat");
				}
				return response(data);
			}
			if (method === "PUT") {
				state.put(JSON.parse(options.body as string));
				if (state.missing) {
					state.missing = false;
					return response({}, 404);
				}
				return response({ id: "subscription-1" });
			}
			if (method === "DELETE") {
				if (state.failDelete)
					return response({ error: "private-pat callback-secret" }, 403);
				state.remote = [];
				return new Response(null, { status: 204 });
			}
			return response({}, 500);
		}),
	);
});

describe("Azure DevOps hook lifecycle", () => {
	it("does not require hook permissions when first saved in manual mode", async () => {
		state.service!.autoDeploy = false;
		expect(
			(await syncAzureDevopsWebhook("application", "service"))[0],
		).toMatchObject({ status: "disabled" });
		expect(fetch).not.toHaveBeenCalled();
	});
	it("falls back to stable payload version 1.0", async () => {
		state.versions = ["1.0"];
		await syncAzureDevopsWebhook("application", "service");
		expect(state.post).toHaveBeenCalledWith(
			expect.objectContaining({ resourceVersion: "1.0" }),
		);
	});
	it("reports unsupported payload versions without creating a subscription", async () => {
		state.versions = ["1.0-preview.1"];
		expect(
			(await syncAzureDevopsWebhook("application", "service"))[0],
		).toMatchObject({
			status: "error",
			error: expect.stringContaining("payload version"),
		});
		expect(state.post).not.toHaveBeenCalled();
	});
	it("retains the source and sanitizes setup permission errors", async () => {
		state.failCreate = true;
		const result = await syncAzureDevopsWebhook("application", "service");
		expect(result[0]).toMatchObject({ status: "error" });
		expect(state.service?.azureDevopsId).toBe("provider");
		expect(JSON.stringify(result)).not.toContain("private-pat");
		expect(JSON.stringify(result)).not.toContain("callback-secret");
	});
	it("updates callback URLs after a Dokploy domain change", async () => {
		await syncAzureDevopsWebhook("application", "service");
		state.callbackOrigin = "https://changed.test";
		await syncAzureDevopsWebhook("application", "service");
		expect(state.put).toHaveBeenCalledWith(
			expect.objectContaining({
				consumerInputs: expect.objectContaining({
					url: expect.stringContaining("https://changed.test/api/deploy/"),
				}),
			}),
		);
	});
	it.each(["application", "compose"] as const)(
		"creates a %s hook with filters and a stable payload version",
		async (type) => {
			const result = await syncAzureDevopsWebhook(type, "service");
			expect(state.locked).toHaveBeenCalled();
			expect(result[0]).toMatchObject({
				status: "active",
				subscriptionId: "subscription-1",
			});
			expect(state.post).toHaveBeenCalledWith(
				expect.objectContaining({
					eventType: "git.push",
					resourceVersion: "2.0",
					publisherInputs: {
						projectId: project,
						repository: repo,
						branch: "main",
					},
					consumerInputs: expect.objectContaining({
						url: expect.stringContaining(
							type === "compose" ? "/api/deploy/compose/" : "/api/deploy/",
						),
					}),
				}),
			);
			expect(JSON.stringify(result)).not.toContain("callback-secret");
			expect(JSON.stringify(result)).not.toContain("private-pat");
		},
	);
	it("updates the known subscription after repeated saves, branch and token changes", async () => {
		await syncAzureDevopsWebhook("application", "service");
		state.service!.azureDevopsBranch = "release";
		state.service!.refreshToken = "rotated";
		await syncAzureDevopsWebhook("application", "service");
		expect(state.post).toHaveBeenCalledTimes(1);
		expect(state.put).toHaveBeenCalledWith(
			expect.objectContaining({
				publisherInputs: expect.objectContaining({ branch: "release" }),
				consumerInputs: expect.objectContaining({
					url: expect.stringContaining("/rotated?"),
				}),
			}),
		);
	});
	it("recovers an uncertain create without creating a duplicate", async () => {
		state.loseCreate = true;
		expect(
			(await syncAzureDevopsWebhook("application", "service"))[0],
		).toMatchObject({ status: "error" });
		expect(JSON.stringify(state.records)).not.toContain("private-pat");
		await syncAzureDevopsWebhook("application", "service");
		expect(state.post).toHaveBeenCalledTimes(1);
		expect(state.records[0]).toMatchObject({ status: "active" });
	});
	it("recreates a known subscription after Azure returns 404", async () => {
		await syncAzureDevopsWebhook("application", "service");
		state.missing = true;
		await syncAzureDevopsWebhook("application", "service");
		expect(state.post).toHaveBeenCalledTimes(2);
	});
	it("disables and re-enables automatic deployments", async () => {
		await syncAzureDevopsWebhook("compose", "service");
		state.service!.autoDeploy = false;
		expect(
			(await syncAzureDevopsWebhook("compose", "service"))[0],
		).toMatchObject({ status: "disabled", subscriptionId: null });
		expect(state.remote).toHaveLength(0);
		state.service!.autoDeploy = true;
		await syncAzureDevopsWebhook("compose", "service");
		expect(state.records[0]).toMatchObject({ status: "active" });
	});
	it("retains safe cleanup information after a service was deleted", async () => {
		await syncAzureDevopsWebhook("application", "service");
		state.service = undefined;
		state.failDelete = true;
		const records = await syncAzureDevopsWebhook("application", "service");
		expect(records[0]).toMatchObject({
			status: "cleanupPending",
			baseUrl: "https://ado.test/tfs/c",
			projectId: project,
			subscriptionId: "subscription-1",
		});
		expect(JSON.stringify(records)).not.toContain("private-pat");
		expect(JSON.stringify(records)).not.toContain("callback-secret");
		state.failDelete = false;
		await syncAzureDevopsWebhook("application", "service");
		expect(state.records).toHaveLength(0);
	});
	it("cleans up an uncertain create after disconnect", async () => {
		state.loseCreate = true;
		await syncAzureDevopsWebhook("application", "service");
		state.service!.sourceType = "git";
		await syncAzureDevopsWebhook("application", "service");
		expect(state.remote).toHaveLength(0);
		expect(state.records).toHaveLength(0);
	});
	it("keeps cleanup records after provider deletion", async () => {
		await syncAzureDevopsWebhook("application", "service");
		state.service = undefined;
		state.provider = undefined;
		expect(
			(await syncAzureDevopsWebhook("application", "service"))[0],
		).toMatchObject({
			status: "cleanupPending",
			subscriptionId: "subscription-1",
		});
	});
});
