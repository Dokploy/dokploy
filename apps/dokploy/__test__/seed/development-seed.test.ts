import {
	applications,
	environments,
	projects,
} from "@dokploy/server/db/schema";
import {
	developmentSeedIds,
	seedDevelopmentProjectData,
} from "@dokploy/server/services/development-seed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createFakeDatabase = () => {
	const state = {
		organizations: [] as any[],
		members: [] as any[],
		projects: [] as any[],
		environments: [] as any[],
		applications: [] as any[],
	};

	const collectionFor = (table: unknown) => {
		if (table === projects) return state.projects;
		if (table === environments) return state.environments;
		if (table === applications) return state.applications;
		throw new Error("Unexpected table");
	};

	const matchesWhere = (item: any, where: any) => {
		const [_, column, operator, valueChunk] = where.queryChunks ?? [];
		const columnName = column?.name;
		const operation = operator?.value?.join("").trim();

		if (!columnName || !operation) {
			throw new Error("Unsupported where clause");
		}

		if (operation === "=") {
			return item[columnName] === valueChunk.value;
		}

		if (operation === "in" && Array.isArray(valueChunk)) {
			return valueChunk.some((chunk) => item[columnName] === chunk.value);
		}

		throw new Error(`Unsupported where operation: ${operation}`);
	};

	const database = {
		query: {
			member: {
				findFirst: vi.fn(async () => {
					const defaultMember = state.members.find((item) => item.isDefault);
					if (!defaultMember) return undefined;

					return {
						...defaultMember,
						organization: state.organizations.find(
							(item) => item.id === defaultMember.organizationId,
						),
					};
				}),
			},
			organization: {
				findFirst: vi.fn(async () => state.organizations[0]),
			},
			projects: {
				findFirst: vi.fn(async ({ where }: any) =>
					state.projects.find((item) => matchesWhere(item, where)),
				),
			},
			environments: {
				findFirst: vi.fn(async ({ where }: any) =>
					state.environments.find((item) => matchesWhere(item, where)),
				),
			},
			applications: {
				findFirst: vi.fn(async ({ where }: any) =>
					state.applications.find((item) => matchesWhere(item, where)),
				),
			},
		},
		transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
			await callback(database);
		}),
		insert: vi.fn((table: unknown) => ({
			values: (values: any) => ({
				returning: async () => {
					collectionFor(table).push({ ...values });
					return [{ ...values }];
				},
			}),
		})),
		update: vi.fn((table: unknown) => ({
			set: (values: any) => ({
				where: (where: any) => ({
					returning: async () => {
						const collection = collectionFor(table);
						const index = collection.findIndex((item) =>
							matchesWhere(item, where),
						);
						if (index === -1) return [];

						collection[index] = {
							...collection[index],
							...values,
						};
						return [{ ...collection[index] }];
					},
				}),
			}),
		})),
		delete: vi.fn((table: unknown) => ({
			where: async (where: any) => {
				const collection = collectionFor(table);
				const retainedItems = collection.filter(
					(item) => !matchesWhere(item, where),
				);
				collection.splice(0, collection.length, ...retainedItems);
			},
		})),
	};

	return { database, state };
};

describe("seedDevelopmentProjectData", () => {
	beforeEach(() => {
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("IS_CLOUD", undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("exits cleanly when no organization exists", async () => {
		const { database, state } = createFakeDatabase();
		const logger = { log: vi.fn(), warn: vi.fn() };

		const result = await seedDevelopmentProjectData({
			database: database as any,
			logger,
		});

		expect(result).toEqual({
			seeded: false,
			reason: "missing-organization",
			applications: [],
		});
		expect(state.projects).toHaveLength(0);
		expect(state.environments).toHaveLength(0);
		expect(state.applications).toHaveLength(0);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("Create a local account first"),
		);
	});

	it("creates deterministic project, environment, and public Git applications", async () => {
		const { database, state } = createFakeDatabase();
		state.organizations.push({
			id: "org-1",
			name: "My Organization",
			createdAt: new Date(),
		});
		state.members.push({
			id: "member-1",
			organizationId: "org-1",
			userId: "user-1",
			role: "owner",
			isDefault: true,
			createdAt: new Date(),
		});

		const result = await seedDevelopmentProjectData({
			database: database as any,
			logger: { log: vi.fn(), warn: vi.fn() },
		});

		expect(result.seeded).toBe(true);
		expect(result.organizationId).toBe("org-1");
		expect(state.projects).toMatchObject([
			{
				projectId: developmentSeedIds.projectId,
				organizationId: "org-1",
				name: "Example Project",
			},
		]);
		expect(state.environments).toMatchObject([
			{
				environmentId: developmentSeedIds.environmentId,
				projectId: developmentSeedIds.projectId,
				isDefault: true,
			},
		]);
		expect(state.applications).toHaveLength(2);
		expect(state.applications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					applicationId: "dev-seed-nextjs",
					appName: "seed-nextjs",
					description:
						"Development seed app cloned from the public Next.js repository.",
					sourceType: "git",
					customGitUrl: "https://github.com/vercel/next.js.git",
					customGitBranch: "canary",
					customGitBuildPath: "/examples/with-docker",
					customGitSSHKeyId: null,
					githubId: null,
					serverId: null,
					buildType: "dockerfile",
					dockerfile: "Dockerfile",
				}),
				expect.objectContaining({
					applicationId: "dev-seed-laravel",
					appName: "seed-laravel",
					description:
						"Development seed app cloned from the public Laravel repository.",
					customGitUrl: "https://github.com/laravel/laravel.git",
					customGitBranch: "13.x",
					customGitBuildPath: "/",
					env: expect.stringContaining(
						"APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
					),
					buildType: "nixpacks",
				}),
			]),
		);
	});

	it("updates existing seed rows without creating duplicates", async () => {
		const { database, state } = createFakeDatabase();
		state.organizations.push({
			id: "org-1",
			name: "My Organization",
			createdAt: new Date(),
		});
		state.members.push({
			id: "member-1",
			organizationId: "org-1",
			userId: "user-1",
			role: "owner",
			isDefault: true,
			createdAt: new Date(),
		});

		await seedDevelopmentProjectData({
			database: database as any,
			logger: { log: vi.fn(), warn: vi.fn() },
		});
		state.projects[0].name = "Stale name";
		state.applications[0].customGitUrl = "https://example.com/stale.git";
		state.applications.push({
			applicationId: "dev-seed-node-nixpacks",
			appName: "retired-seed",
			customGitUrl: "https://example.com/retired.git",
		});

		await seedDevelopmentProjectData({
			database: database as any,
			logger: { log: vi.fn(), warn: vi.fn() },
		});

		expect(state.projects).toHaveLength(1);
		expect(state.environments).toHaveLength(1);
		expect(state.applications).toHaveLength(2);
		expect(state.applications).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					applicationId: "dev-seed-node-nixpacks",
				}),
			]),
		);
		expect(state.projects[0].name).toBe("Example Project");
		expect(state.applications[0].customGitUrl).toBe(
			"https://github.com/vercel/next.js.git",
		);
		expect(state.applications[0].customGitBuildPath).toBe(
			"/examples/with-docker",
		);
		expect(state.applications[0].buildType).toBe("dockerfile");
		expect(state.applications[0].dockerfile).toBe("Dockerfile");
	});

	it("refuses to seed in production or cloud mode", async () => {
		const { database } = createFakeDatabase();
		const logger = { log: vi.fn(), warn: vi.fn() };

		vi.stubEnv("NODE_ENV", "production");
		await expect(
			seedDevelopmentProjectData({ database: database as any, logger }),
		).resolves.toMatchObject({ seeded: false, reason: "production" });

		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("IS_CLOUD", "true");
		await expect(
			seedDevelopmentProjectData({ database: database as any, logger }),
		).resolves.toMatchObject({ seeded: false, reason: "cloud" });
	});
});
