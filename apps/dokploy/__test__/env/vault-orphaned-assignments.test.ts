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
	const createGate = () => {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		return { promise, resolve };
	};

	const hasBoundValue = (
		value: unknown,
		expected: string,
		seen = new Set<object>(),
	): boolean => {
		if (value === expected) return true;
		if (!value || typeof value !== "object" || seen.has(value)) return false;
		seen.add(value);
		return Object.values(value).some((entry) =>
			hasBoundValue(entry, expected, seen),
		);
	};

	const state = {
		deletedEntity: "project" as "project" | "environment",
		failDelete: false,
		pauseProjectDelete: false,
		pauseProviderUpdate: false,
		signalNextValidation: false,
		concurrentTransactions: false,
		projects: [] as ProjectState[],
		providers: [] as ProviderState[],
	};
	let projectDeleteReached = createGate();
	let releaseProjectDelete = createGate();
	let releaseProviderUpdate = createGate();
	let validationReached = createGate();
	const organizationLocks = new Map<
		string,
		{ locked: boolean; queue: (() => void)[] }
	>();

	const acquireOrganizationLock = async (organizationId: string) => {
		const lock = organizationLocks.get(organizationId) ?? {
			locked: false,
			queue: [],
		};
		organizationLocks.set(organizationId, lock);
		if (!lock.locked) {
			lock.locked = true;
			return;
		}
		await new Promise<void>((resolve) => lock.queue.push(resolve));
	};

	const releaseOrganizationLock = (organizationId: string) => {
		const lock = organizationLocks.get(organizationId);
		if (!lock) return;
		const next = lock.queue.shift();
		if (next) next();
		else lock.locked = false;
	};

	const database: any = {
		query: {
			projects: {
				findFirst: vi.fn(async (options?: { where?: unknown }) =>
					state.projects.find((project) =>
						hasBoundValue(options?.where, project.projectId),
					),
				),
				findMany: vi.fn(async () => {
					if (state.signalNextValidation) {
						state.signalNextValidation = false;
						validationReached.resolve();
					}
					return state.projects;
				}),
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
				findFirst: vi.fn(async (options?: { where?: unknown }) =>
					state.providers.find((provider) =>
						hasBoundValue(options?.where, provider.vaultProviderId),
					),
				),
				findMany: vi.fn(async () => state.providers),
			},
		},
		select: vi.fn(() => {
			let organizationId: string | undefined;
			const builder: any = {
				from: vi.fn(() => builder),
				where: vi.fn((condition: unknown) => {
					organizationId = state.providers.find((provider) =>
						hasBoundValue(condition, provider.organizationId),
					)?.organizationId;
					return builder;
				}),
				for: vi.fn(async () =>
					state.providers
						.filter((provider) => provider.organizationId === organizationId)
						.map(({ vaultProviderId, assignments }) => ({
							vaultProviderId,
							assignments,
						})),
				),
			};
			return builder;
		}),
		delete: vi.fn(() => {
			let condition: unknown;
			const builder: any = {
				where: vi.fn((nextCondition: unknown) => {
					condition = nextCondition;
					return builder;
				}),
				returning: vi.fn(async () => {
					if (state.failDelete) throw new Error("delete failed");
					if (state.deletedEntity === "project") {
						if (state.pauseProjectDelete) {
							projectDeleteReached.resolve();
							await releaseProjectDelete.promise;
						}
						const index = state.projects.findIndex((project) =>
							hasBoundValue(condition, project.projectId),
						);
						if (index < 0) return [];
						const [deleted] = state.projects.splice(index, 1);
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
			let condition: unknown;
			const apply = () => {
				const provider = state.providers.find(({ vaultProviderId }) =>
					hasBoundValue(condition, vaultProviderId),
				);
				if (!provider) return undefined;
				Object.assign(provider, values);
				return provider;
			};
			const builder: any = {
				set: vi.fn((nextValues: Partial<ProviderState>) => {
					values = nextValues;
					return builder;
				}),
				where: vi.fn((nextCondition: unknown) => {
					condition = nextCondition;
					return builder;
				}),
				returning: vi.fn(async () => {
					if (state.pauseProviderUpdate && values.name) {
						await releaseProviderUpdate.promise;
					}
					const provider = apply();
					return provider ? [provider] : [];
				}),
			};
			return builder;
		}),
		insert: vi.fn(() => {
			let values: ProviderState | undefined;
			const builder: any = {
				values: vi.fn((nextValues: ProviderState) => {
					values = nextValues;
					return builder;
				}),
				returning: vi.fn(async () => {
					if (!values) return [];
					state.providers.push(values);
					return [values];
				}),
			};
			return builder;
		}),
	};

	database.transaction = vi.fn(
		async (callback: (tx: typeof database) => Promise<unknown>) => {
			const projects = structuredClone(state.projects);
			const providers = structuredClone(state.providers);
			const acquiredLocks: string[] = [];
			const tx = Object.create(database);
			tx.execute = vi.fn(async (query: unknown) => {
				const organizationId = state.projects
					.map((project) => project.organizationId)
					.concat(state.providers.map((provider) => provider.organizationId))
					.find((id) => hasBoundValue(query, id));
				if (!organizationId) throw new Error("Organization lock key not found");
				await acquireOrganizationLock(organizationId);
				acquiredLocks.push(organizationId);
			});
			try {
				return await callback(tx);
			} catch (error) {
				if (!state.concurrentTransactions) {
					state.projects = projects;
					state.providers = providers;
				}
				throw error;
			} finally {
				for (const organizationId of acquiredLocks.reverse()) {
					releaseOrganizationLock(organizationId);
				}
			}
		},
	);

	return {
		database,
		state,
		resetRaceGates: () => {
			projectDeleteReached = createGate();
			releaseProjectDelete = createGate();
			releaseProviderUpdate = createGate();
			validationReached = createGate();
			organizationLocks.clear();
		},
		projectDeleteReached: () => projectDeleteReached.promise,
		releaseProjectDelete: () => releaseProjectDelete.resolve(),
		releaseProviderUpdate: () => releaseProviderUpdate.resolve(),
		validationReached: () => validationReached.promise,
	};
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.database }));

import { deleteEnvironment } from "@dokploy/server/services/environment";
import { deleteProject } from "@dokploy/server/services/project";
import {
	createVaultProvider,
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
	mocks.resetRaceGates();
	mocks.state.deletedEntity = "project";
	mocks.state.failDelete = false;
	mocks.state.pauseProjectDelete = false;
	mocks.state.pauseProviderUpdate = false;
	mocks.state.signalNextValidation = false;
	mocks.state.concurrentTransactions = false;
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
		expect(mocks.database.transaction).toHaveBeenCalledTimes(2);
		expect(mocks.state.providers[0]?.assignments).toEqual([
			{
				projectId: "project-keep",
				environmentIds: ["env-deleted", "env-keep"],
			},
		]);
	});

	it("only cleans providers in the deleted project's organization", async () => {
		const foreignAssignments = [
			{
				projectId: "project-deleted",
				environmentIds: ["env-from-deleted-project"],
			},
		];
		mocks.state.providers.unshift({
			vaultProviderId: "vault-other-organization",
			name: "foreign",
			organizationId: "org-2",
			providerType: "doppler",
			config,
			assignments: structuredClone(foreignAssignments),
		});

		await deleteProject("project-deleted");

		expect(
			mocks.state.providers.find(
				(provider) => provider.vaultProviderId === "vault-other-organization",
			)?.assignments,
		).toEqual(foreignAssignments);
		expect(
			mocks.state.providers.find(
				(provider) => provider.vaultProviderId === "vault-1",
			)?.assignments,
		).toEqual([
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
		expect(mocks.database.transaction).toHaveBeenCalledTimes(2);
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

	it("rejects an update validated concurrently with project deletion", async () => {
		const staleAssignments = structuredClone(
			mocks.state.providers[0]!.assignments,
		);
		mocks.state.pauseProjectDelete = true;
		mocks.state.pauseProviderUpdate = true;
		mocks.state.concurrentTransactions = true;

		const deletion = deleteProject("project-deleted");
		await mocks.projectDeleteReached();

		mocks.state.signalNextValidation = true;
		const update = updateVaultProvider(
			"vault-1",
			"production",
			config,
			staleAssignments,
		);
		await Promise.race([
			mocks.validationReached(),
			new Promise<void>((resolve) => setImmediate(resolve)),
		]);

		mocks.releaseProjectDelete();
		await deletion;
		mocks.releaseProviderUpdate();

		await expect(update).rejects.toThrow(
			"Assignment references a project outside this organization",
		);
		expect(mocks.state.providers[0]?.assignments).toEqual([
			{
				projectId: "project-keep",
				environmentIds: ["env-deleted", "env-keep"],
			},
		]);
		expect(
			mocks.state.projects.some(
				(project) => project.projectId === "project-deleted",
			),
		).toBe(false);
	});

	it("rejects a create validated concurrently with project deletion", async () => {
		mocks.state.pauseProjectDelete = true;
		mocks.state.concurrentTransactions = true;
		const deletion = deleteProject("project-deleted");
		await mocks.projectDeleteReached();

		const create = createVaultProvider(
			{
				name: "concurrent-create",
				config,
				assignments: [
					{
						projectId: "project-deleted",
						environmentIds: ["env-from-deleted-project"],
					},
				],
			},
			"org-1",
		);
		await new Promise<void>((resolve) => setImmediate(resolve));

		mocks.releaseProjectDelete();
		await deletion;

		await expect(create).rejects.toThrow(
			"Assignment references a project outside this organization",
		);
		expect(
			mocks.state.providers.some(
				(provider) => provider.name === "concurrent-create",
			),
		).toBe(false);
		expect(
			mocks.state.projects.some(
				(project) => project.projectId === "project-deleted",
			),
		).toBe(false);
	});
});
