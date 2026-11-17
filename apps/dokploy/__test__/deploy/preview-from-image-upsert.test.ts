import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the tables the upsert touches. Every query yields to
// the event loop, so concurrent requests interleave like they do against
// Postgres. Advisory locks are FIFO mutexes held until the transaction
// callback settles, and the global `db` draws from a connection pool that a
// transaction holds one connection of until it ends.
const fake = vi.hoisted(() => {
	type Row = Record<string, any>;
	type Where = { column: string; value: unknown } | { and: Where[] };

	const state = {
		applications: new Map<string, Row>(),
		previews: [] as Row[],
		domains: new Map<string, Row>(),
		locks: new Map<string, Promise<void>>(),
		seq: 0,
		beforeInsert: undefined as (() => void) | undefined,
		insertError: undefined as unknown,
		lockError: undefined as unknown,
		pool: {
			size: Number.POSITIVE_INFINITY,
			inUse: 0,
			waiters: [] as Array<() => void>,
		},
		openTransactions: 0,
		// Fails any use of the global `db` or Traefik while a transaction is open.
		strict: false,
	};

	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	const matches = (row: Row, where: Where): boolean =>
		"and" in where
			? where.and.every((condition) => matches(row, condition))
			: row[where.column] === where.value;
	const withRelations = (row: Row) => ({
		...row,
		domain: row.domainId ? (state.domains.get(row.domainId) ?? null) : null,
		application: {
			applicationId: row.applicationId,
			serverId: null,
			buildServerId: null,
		},
	});

	const acquire = async () => {
		if (state.pool.inUse < state.pool.size) {
			state.pool.inUse++;
			return;
		}
		await new Promise<void>((resolve) => state.pool.waiters.push(resolve));
	};
	const release = () => {
		const next = state.pool.waiters.shift();
		if (next) next();
		else state.pool.inUse--;
	};
	const assertOutsideTransaction = (what: string) => {
		if (state.strict && state.openTransactions > 0) {
			throw new Error(`${what} used while a transaction is open`);
		}
	};
	const onPool = async <T>(run: () => Promise<T>) => {
		assertOutsideTransaction("global db");
		await acquire();
		try {
			return await run();
		} finally {
			release();
		}
	};
	const onTransaction = <T>(run: () => Promise<T>) => run();

	const executor = (via: <T>(run: () => Promise<T>) => Promise<T>) => ({
		query: {
			previewDeployments: {
				findFirst: ({ where }: { where: Where }) =>
					via(async () => {
						await tick();
						const row = state.previews.find((preview) =>
							matches(preview, where),
						);
						return row ? withRelations(row) : undefined;
					}),
			},
			organization: {
				findFirst: () => via(async () => ({ ownerId: "owner-1" })),
			},
			applications: {
				findFirst: () =>
					via(async () => ({ previewForwardAuthEnabled: false })),
			},
			webServerSettings: {
				findFirst: () => via(async () => ({ serverIp: "203.0.113.7" })),
			},
		},
		insert: () => ({
			values: (values: Row) => ({
				returning: () =>
					via(async () => {
						await tick();
						state.beforeInsert?.();
						if (state.insertError) throw state.insertError;
						const duplicate =
							values.dockerImage &&
							state.previews.some(
								(preview) =>
									preview.dockerImage &&
									preview.applicationId === values.applicationId &&
									preview.pullRequestNumber === values.pullRequestNumber,
							);
						if (duplicate) {
							throw new Error("Failed query", {
								cause: {
									code: "23505",
									constraint_name:
										"preview_deployments_app_pull_request_image_idx",
								},
							});
						}
						const row = {
							previewDeploymentId: `preview-${++state.seq}`,
							domainId: null,
							...values,
						};
						state.previews.push(row);
						return [row];
					}),
			}),
		}),
		update: () => ({
			set: (values: Row) => ({
				where: (where: Where) => {
					const result = via(async () => {
						await tick();
						const rows = state.previews.filter((row) => matches(row, where));
						for (const row of rows) Object.assign(row, values);
						return rows;
					});
					return Object.assign(result, { returning: () => result });
				},
			}),
		}),
		$count: (_table: unknown, where: Where) =>
			via(async () => {
				await tick();
				return state.previews.filter((row) => matches(row, where)).length;
			}),
	});

	const transaction = async <T>(fn: (tx: unknown) => Promise<T>) => {
		assertOutsideTransaction("global db");
		await acquire();
		state.openTransactions++;
		const unlocks: Array<() => void> = [];
		const tx: Record<string, unknown> = {
			...executor(onTransaction),
			transaction: (savepoint: (tx: unknown) => Promise<unknown>) =>
				savepoint(tx),
			execute: async (statement: { queryChunks: unknown[] }) => {
				const key = JSON.stringify(statement.queryChunks).match(
					/preview_deployments:([\w-]+)/,
				)?.[1];
				if (!key) return;
				if (state.lockError) throw state.lockError;
				const previous = state.locks.get(key) ?? Promise.resolve();
				const held = new Promise<void>((resolve) => unlocks.push(resolve));
				state.locks.set(
					key,
					previous.then(() => held),
				);
				await previous;
			},
		};
		try {
			return await fn(tx);
		} finally {
			for (const unlock of unlocks) unlock();
			state.openTransactions--;
			release();
		}
	};

	const db = { ...executor(onPool), transaction };
	// Mocked helpers that take an executor go through the pool unless given a transaction.
	const useExecutor = async (given: unknown) => {
		if (given === undefined || given === db) await onPool(async () => {});
	};

	const reset = () => {
		state.applications.clear();
		state.previews = [];
		state.domains.clear();
		state.locks.clear();
		state.seq = 0;
		state.beforeInsert = undefined;
		state.insertError = undefined;
		state.lockError = undefined;
		state.pool = {
			size: Number.POSITIVE_INFINITY,
			inUse: 0,
			waiters: [],
		};
		state.openTransactions = 0;
		state.strict = false;
	};

	return { state, reset, db, useExecutor, assertOutsideTransaction };
});

vi.mock("@dokploy/server/db", () => ({ db: fake.db }));

vi.mock("drizzle-orm", async (importOriginal) => ({
	...(await importOriginal<typeof import("drizzle-orm")>()),
	eq: (column: { name: string }, value: unknown) => ({
		column: column.name,
		value,
	}),
	and: (...conditions: unknown[]) => ({ and: conditions }),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(
		async (applicationId: string, executor?: unknown) => {
			await fake.useExecutor(executor);
			return structuredClone(fake.state.applications.get(applicationId));
		},
	),
}));

vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: vi.fn(
		async (input: Record<string, unknown>, executor?: unknown) => {
			await fake.useExecutor(executor);
			const domain = {
				...input,
				domainId: `domain-${fake.state.domains.size}`,
			};
			fake.state.domains.set(domain.domainId, domain);
			return domain;
		},
	),
	findDomainById: vi.fn(),
	updateDomainById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(async () => fake.assertOutsideTransaction("Traefik")),
	removeDomain: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: vi.fn(),
	getIssueComment: vi.fn(),
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: vi.fn(),
}));

import { createDomain } from "@dokploy/server/services/domain";
import { findGithubById } from "@dokploy/server/services/github";
import {
	createPreviewDeployment,
	getImageRepository,
	upsertPreviewDeploymentFromImage,
} from "@dokploy/server/services/preview-deployment";
import { authGithub } from "@dokploy/server/utils/providers/github";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";

const PREVIEW_IMAGE = "ghcr.io/acme/web:pr-7";

const mockApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	name: "Web",
	appName: "web-abc",
	sourceType: "docker",
	dockerImage: "ghcr.io/acme/web:latest",
	githubId: null,
	isPreviewDeploymentsActive: true,
	previewLimit: 3,
	previewWildcard: "*.preview.example.com",
	previewPath: "/",
	previewPort: 3000,
	previewHttps: true,
	previewCertificateType: "letsencrypt",
	previewCustomCertResolver: null,
	previewForwardAuthEnabled: false,
	server: null,
	environment: { project: { organizationId: "org-1" } },
	...overrides,
});

const seedPreview = (overrides: Record<string, unknown> = {}) => {
	const row = {
		previewDeploymentId: `existing-${fake.state.previews.length}`,
		applicationId: "app-1",
		pullRequestNumber: "7",
		dockerImage: "ghcr.io/acme/web:pr-7-old",
		domainId: null,
		...overrides,
	};
	fake.state.previews.push(row);
	return row;
};

const input = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	dockerImage: PREVIEW_IMAGE,
	pullRequestNumber: "7",
	...overrides,
});

const setup = (overrides: Record<string, unknown> = {}) => {
	const application = mockApplication(overrides);
	fake.state.applications.set(application.applicationId, application);
	return application;
};

beforeEach(() => {
	vi.clearAllMocks();
	fake.reset();
});

describe("creating a preview deployment from an image", () => {
	it("creates the preview for a new pull request without calling GitHub", async () => {
		setup();

		const preview = await upsertPreviewDeploymentFromImage(
			input({ pullRequestTitle: "Add pricing page" }),
		);

		expect(fake.state.previews).toHaveLength(1);
		const [created] = fake.state.previews;
		expect(created).toMatchObject({
			applicationId: "app-1",
			dockerImage: PREVIEW_IMAGE,
			pullRequestNumber: "7",
			pullRequestTitle: "Add pricing page",
			pullRequestCommentId: "",
		});
		expect(created?.appName).toMatch(/^preview-web-abc-/);
		expect(vi.mocked(createDomain).mock.calls[0]?.[0]).toMatchObject({
			host: `${created?.appName}.preview.example.com`,
			domainType: "preview",
			port: 3000,
			https: true,
		});
		expect(preview).toMatchObject({
			previewDeploymentId: created?.previewDeploymentId,
			domain: { host: `${created?.appName}.preview.example.com` },
		});
		expect(findGithubById).not.toHaveBeenCalled();
		expect(authGithub).not.toHaveBeenCalled();
	});

	it("updates the image of an existing preview instead of creating one", async () => {
		setup();
		const existing = seedPreview();
		seedPreview({ pullRequestNumber: "5" });
		seedPreview({ pullRequestNumber: "6" });

		const preview = await upsertPreviewDeploymentFromImage(input());

		expect(preview.previewDeploymentId).toBe(existing.previewDeploymentId);
		expect(fake.state.previews).toHaveLength(3);
		expect(existing.dockerImage).toBe(PREVIEW_IMAGE);
		expect(createDomain).not.toHaveBeenCalled();
	});

	it("accepts a digest of the application repository", async () => {
		setup();

		await upsertPreviewDeploymentFromImage(
			input({ dockerImage: "ghcr.io/acme/web@sha256:abc123" }),
		);

		expect(fake.state.previews).toHaveLength(1);
	});

	it.each([
		["the application is not a Docker application", { sourceType: "github" }],
		["preview deployments are disabled", { isPreviewDeploymentsActive: false }],
		["the application has no image yet", { dockerImage: null }],
	])("rejects the request when %s", async (_, overrides) => {
		setup(overrides);

		await expect(
			upsertPreviewDeploymentFromImage(input()),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(fake.state.previews).toHaveLength(0);
	});

	it.each([
		"ghcr.io/other/web:pr-7",
		"ghcr.io/acme/web-evil:pr-7",
		"docker.io/acme/web:pr-7",
	])(
		"rejects %s, which is outside the application repository",
		async (image) => {
			setup();

			await expect(
				upsertPreviewDeploymentFromImage(input({ dockerImage: image })),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(fake.state.previews).toHaveLength(0);
		},
	);

	it("rejects a new preview when the preview limit is reached", async () => {
		setup({ previewLimit: 1 });
		seedPreview({ pullRequestNumber: "6" });

		await expect(
			upsertPreviewDeploymentFromImage(input()),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(fake.state.previews).toHaveLength(1);
	});
});

describe("concurrent requests", () => {
	it("creates one preview when two requests for a pull request overlap", async () => {
		setup();

		const [first, second] = await Promise.all([
			upsertPreviewDeploymentFromImage(
				input({ dockerImage: "ghcr.io/acme/web:pr-7-a" }),
			),
			upsertPreviewDeploymentFromImage(
				input({ dockerImage: "ghcr.io/acme/web:pr-7-b" }),
			),
		]);

		expect(fake.state.previews).toHaveLength(1);
		expect(second.previewDeploymentId).toBe(first.previewDeploymentId);
		expect(fake.state.previews[0]?.dockerImage).toBe("ghcr.io/acme/web:pr-7-b");
		expect(createDomain).toHaveBeenCalledTimes(1);
	});

	it("does not exceed the preview limit when requests for different pull requests overlap", async () => {
		setup({ previewLimit: 1 });

		const results = await Promise.allSettled([
			upsertPreviewDeploymentFromImage(input({ pullRequestNumber: "7" })),
			upsertPreviewDeploymentFromImage(input({ pullRequestNumber: "8" })),
		]);

		expect(fake.state.previews).toHaveLength(1);
		expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
			1,
		);
		const rejected = results.find(({ status }) => status === "rejected");
		expect((rejected as PromiseRejectedResult).reason).toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("updates the preview that won the unique index instead of failing", async () => {
		setup();
		let conflicting: Record<string, unknown> | undefined;
		fake.state.beforeInsert = () => {
			fake.state.beforeInsert = undefined;
			conflicting = seedPreview({ previewDeploymentId: "written-elsewhere" });
		};

		const preview = await upsertPreviewDeploymentFromImage(input());

		expect(preview.previewDeploymentId).toBe("written-elsewhere");
		expect(fake.state.previews).toHaveLength(1);
		expect(conflicting?.dockerImage).toBe(PREVIEW_IMAGE);
		expect(createDomain).not.toHaveBeenCalled();
	});

	it("does not treat other unique violations as the same pull request", async () => {
		setup();
		fake.state.insertError = new Error("Failed query", {
			cause: {
				code: "23505",
				constraint_name: "preview_deployments_appName_unique",
			},
		});

		await expect(upsertPreviewDeploymentFromImage(input())).rejects.toThrow(
			"Failed query",
		);
		expect(fake.state.previews).toHaveLength(0);
	});

	it("answers CONFLICT when the application lock can't be taken in time", async () => {
		setup();
		fake.state.lockError = new Error("Failed query", {
			cause: { code: "55P03" },
		});

		await expect(
			upsertPreviewDeploymentFromImage(input()),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(fake.state.previews).toHaveLength(0);
	});
});

describe("database connections", () => {
	it("runs every query of the transaction on it and configures Traefik after the commit", async () => {
		setup({ previewWildcard: "*.sslip.io" });
		fake.state.strict = true;

		const preview = await upsertPreviewDeploymentFromImage(input());

		expect(fake.state.previews).toHaveLength(1);
		expect(preview.domain?.host).toMatch(/-203-0-113-7\.sslip\.io$/);
		expect(vi.mocked(manageDomain).mock.calls[0]?.[0]).toMatchObject({
			appName: fake.state.previews[0]?.appName,
		});
	});

	it("updates an existing preview without the global db inside the transaction", async () => {
		setup();
		seedPreview();
		fake.state.strict = true;

		await upsertPreviewDeploymentFromImage(input());

		expect(fake.state.previews[0]?.dockerImage).toBe(PREVIEW_IMAGE);
	});

	it("finishes previews of more applications than the pool has connections", async () => {
		const applications = Array.from({ length: 5 }, (_, index) =>
			setup({ applicationId: `app-${index}`, appName: `web-${index}` }),
		);
		fake.state.pool.size = 2;

		const stalled = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("requests stalled on the pool")), 2000),
		);
		await Promise.race([
			Promise.all(
				applications.map(({ applicationId }) =>
					upsertPreviewDeploymentFromImage(input({ applicationId })),
				),
			),
			stalled,
		]);

		expect(fake.state.previews).toHaveLength(5);
	});

	it("keeps creating webhook previews on the global db and configures Traefik", async () => {
		setup();

		const preview = await createPreviewDeployment({
			applicationId: "app-1",
			branch: "feature",
			pullRequestId: "",
			pullRequestNumber: "9",
			pullRequestTitle: "Feature",
			pullRequestURL: "",
			dockerImage: PREVIEW_IMAGE,
		});

		expect(fake.state.previews[0]).toMatchObject({
			previewDeploymentId: preview.previewDeploymentId,
			domainId: expect.any(String),
		});
		expect(vi.mocked(manageDomain).mock.calls[0]?.[0]).toMatchObject({
			appName: preview.appName,
		});
	});
});

describe("getImageRepository", () => {
	it.each([
		["nginx", "nginx"],
		["nginx:alpine", "nginx"],
		["ghcr.io/acme/web:pr-7", "ghcr.io/acme/web"],
		["ghcr.io/acme/web@sha256:abc", "ghcr.io/acme/web"],
		["ghcr.io/acme/web:pr-7@sha256:abc", "ghcr.io/acme/web"],
		["localhost:5000/web", "localhost:5000/web"],
		["localhost:5000/web:pr-7", "localhost:5000/web"],
	])("%s -> %s", (image, repository) => {
		expect(getImageRepository(image)).toBe(repository);
	});
});
