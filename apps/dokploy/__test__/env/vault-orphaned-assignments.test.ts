import type {
	VaultProviderAssignment,
	VaultProviderConfig,
} from "@dokploy/server/db/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ProjectState = {
	projectId: string;
	organizationId: string;
	environments: { environmentId: string }[];
};

type ProviderState = {
	vaultProviderId: string;
	name: string;
	organizationId: string;
	providerType: VaultProviderConfig["providerType"];
	config: VaultProviderConfig;
	assignments: VaultProviderAssignment[];
};

const mocks = vi.hoisted(() => {
	const state = {
		deletedEntity: "project" as "project" | "environment",
		failDelete: false,
		projects: [] as ProjectState[],
		providers: [] as ProviderState[],
	};

	const database: any = {
		query: {
			projects: {
				findFirst: vi.fn(async () => state.projects[0]),
				findMany: vi.fn(async () => state.projects),
			},
			environments: {
				findFirst: vi.fn(async () => {
					const environment = state.projects
						.flatMap((project) => project.environments)
						.find(({ environmentId }) => environmentId === "env-deleted");
					return environment
						? {
								...environment,
								projectId: "project-keep",
								isDefault: false,
								applications: [],
								compose: [],
								libsql: [],
								mariadb: [],
								mongo: [],
								mysql: [],
								postgres: [],
								redis: [],
							}
						: undefined;
				}),
			},
			vaultProvider: {
				findFirst: vi.fn(async () => state.providers[0]),
				findMany: vi.fn(async () => state.providers),
			},
		},
		select: vi.fn(() => {
			const builder: any = {
				from: vi.fn(() => builder),
				where: vi.fn(() => builder),
				for: vi.fn(async () =>
					state.providers.map(({ vaultProviderId, assignments }) => ({
						vaultProviderId,
						assignments,
					})),
				),
			};
			return builder;
		}),
		delete: vi.fn(() => {
			const builder: any = {
				where: vi.fn(() => builder),
				returning: vi.fn(async () => {
					if (state.failDelete) throw new Error("delete failed");
					if (state.deletedEntity === "project") {
						const [deleted] = state.projects.splice(0, 1);
						return deleted ? [deleted] : [];
					}

					const project = state.projects[0];
					const index = project?.environments.findIndex(
						({ environmentId }) => environmentId === "env-deleted",
					);
					if (!project || index === undefined || index < 0) return [];
					const [deleted] = project.environments.splice(index, 1);
					return deleted ? [deleted] : [];
				}),
			};
			return builder;
		}),
		update: vi.fn(() => {
			let values: Partial<ProviderState> = {};
			const apply = () => {
				Object.assign(state.providers[0]!, values);
				return state.providers[0]!;
			};
			const builder: any = {
				set: vi.fn((nextValues: Partial<ProviderState>) => {
					values = nextValues;
					return builder;
				}),
				where: vi.fn(() => builder),
				returning: vi.fn(async () => {
					return [apply()];
				}),
			};
			return builder;
		}),
	};

	database.transaction = vi.fn(
		async (callback: (tx: typeof database) => Promise<unknown>) => {
			const projects = structuredClone(state.projects);
			const providers = structuredClone(state.providers);
			try {
				return await callback(database);
			} catch (error) {
				state.projects = projects;
				state.providers = providers;
				throw error;
			}
		},
	);

	return { database, state };
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.database }));

import { deleteEnvironment } from "@dokploy/server/services/environment";
import { deleteProject } from "@dokploy/server/services/project";
import {
	findVaultProviderById,
	findVaultProviderInOrganization,
	findVaultProvidersByOrganizationId,
	updateVaultProvider,
} from "@dokploy/server/services/vault-provider";

const config: VaultProviderConfig = {
	providerType: "doppler",
	serviceToken: "dp.st.test",
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.state.deletedEntity = "project";
	mocks.state.failDelete = false;
	mocks.state.projects = [
		{
			projectId: "project-deleted",
			organizationId: "org-1",
			environments: [{ environmentId: "env-from-deleted-project" }],
		},
		{
			projectId: "project-keep",
			organizationId: "org-1",
			environments: [
				{ environmentId: "env-deleted" },
				{ environmentId: "env-keep" },
			],
		},
	];
	mocks.state.providers = [
		{
			vaultProviderId: "vault-1",
			name: "production",
			organizationId: "org-1",
			providerType: "doppler",
			config,
			assignments: [
				{
					projectId: "project-deleted",
					environmentIds: ["env-from-deleted-project"],
				},
				{
					projectId: "project-keep",
					environmentIds: ["env-deleted", "env-keep"],
				},
			],
		},
	];
});

const saveCurrentProvider = async () => {
	const provider = await findVaultProviderById("vault-1");
	return updateVaultProvider(
		provider.vaultProviderId,
		provider.name,
		provider.config,
		provider.assignments,
	);
};

describe("vault assignments after resource deletion", () => {
	it("keeps a vault provider editable after its assigned project is deleted", async () => {
		await deleteProject("project-deleted");

		await expect(saveCurrentProvider()).resolves.toBeDefined();
		expect(mocks.database.transaction).toHaveBeenCalledOnce();
		expect(mocks.state.providers[0]?.assignments).toEqual([
			{
				projectId: "project-keep",
				environmentIds: ["env-deleted", "env-keep"],
			},
		]);
	});

	it("keeps a vault provider editable after an assigned environment is deleted", async () => {
		mocks.state.deletedEntity = "environment";
		mocks.state.projects.shift();
		mocks.state.providers[0]!.assignments = [
			{
				projectId: "project-keep",
				environmentIds: ["env-deleted", "env-keep"],
			},
		];

		await deleteEnvironment("env-deleted");

		await expect(saveCurrentProvider()).resolves.toBeDefined();
		expect(mocks.database.transaction).toHaveBeenCalledOnce();
		expect(mocks.state.providers[0]?.assignments).toEqual([
			{
				projectId: "project-keep",
				environmentIds: ["env-keep"],
			},
		]);
	});

	it("filters legacy orphaned assignments on read without writing to the database", async () => {
		mocks.state.projects.shift();
		const storedAssignments = structuredClone(
			mocks.state.providers[0]!.assignments,
		);

		const provider = await findVaultProviderInOrganization("vault-1", "org-1");

		expect(provider.assignments).toEqual([
			{
				projectId: "project-keep",
				environmentIds: ["env-deleted", "env-keep"],
			},
		]);
		expect(mocks.state.providers[0]!.assignments).toEqual(storedAssignments);

		await expect(
			updateVaultProvider(
				provider.vaultProviderId,
				provider.name,
				provider.config,
				provider.assignments,
			),
		).resolves.toBeDefined();
		expect(mocks.state.providers[0]!.assignments).toEqual(provider.assignments);
	});

	it("filters stale environment assignments from the provider list", async () => {
		mocks.state.projects.shift();
		mocks.state.projects[0]!.environments.shift();
		mocks.state.providers[0]!.assignments = [
			{
				projectId: "project-keep",
				environmentIds: ["env-deleted", "env-keep"],
			},
		];
		const storedAssignments = structuredClone(
			mocks.state.providers[0]!.assignments,
		);

		const providers = await findVaultProvidersByOrganizationId("org-1");

		expect(providers[0]?.assignments).toEqual([
			{
				projectId: "project-keep",
				environmentIds: ["env-keep"],
			},
		]);
		expect(mocks.state.providers[0]!.assignments).toEqual(storedAssignments);
	});

	it("rolls back assignment cleanup when project deletion fails", async () => {
		mocks.state.failDelete = true;
		const assignments = structuredClone(mocks.state.providers[0]!.assignments);

		await expect(deleteProject("project-deleted")).rejects.toThrow(
			"delete failed",
		);

		expect(mocks.database.transaction).toHaveBeenCalledOnce();
		expect(
			mocks.state.projects.some(
				(project) => project.projectId === "project-deleted",
			),
		).toBe(true);
		expect(mocks.state.providers[0]!.assignments).toEqual(assignments);
	});
});
