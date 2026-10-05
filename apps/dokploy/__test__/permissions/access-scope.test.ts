import { beforeEach, describe, expect, it, vi } from "vitest";

type ScopeRow = {
	environmentId: string;
	projectId: string;
	serviceId: string | null;
};

let rowsToReturn: ScopeRow[] = [];
const execute = vi.fn(() => Promise.resolve(rowsToReturn));

vi.mock("@dokploy/server/db", () => ({
	db: {
		execute: (..._args: unknown[]) => execute(),
	},
}));

const { resolveAccessScope, getEffectiveAccessedServices } = await import(
	"@dokploy/server/services/access-scope"
);

const member = (
	accessedProjects: string[] = [],
	accessedEnvironments: string[] = [],
	accessedServices: string[] = [],
) => ({ accessedProjects, accessedEnvironments, accessedServices });

beforeEach(() => {
	vi.clearAllMocks();
	rowsToReturn = [];
});

describe("getEffectiveAccessedServices", () => {
	it("returns accessedServices untouched and issues no query when nothing is full-access", async () => {
		const result = await getEffectiveAccessedServices(
			member([], [], ["svc-a"]),
		);

		expect(result).toEqual(["svc-a"]);
		expect(execute).not.toHaveBeenCalled();
	});

	it("expands a full-access project to all of its services", async () => {
		rowsToReturn = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-b" },
		];
		const result = await getEffectiveAccessedServices(member(["proj-1"]));

		expect(result.sort()).toEqual(["svc-a", "svc-b"]);
	});

	it("expands a full-access environment to its services", async () => {
		rowsToReturn = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-b" },
		];
		const result = await getEffectiveAccessedServices(member([], ["env-1"]));

		expect(result.sort()).toEqual(["svc-a", "svc-b"]);
	});

	it("does not expand an environment reached only through an explicit service grant", async () => {
		rowsToReturn = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];
		const result = await getEffectiveAccessedServices(
			member([], ["env-other"], ["svc-a"]),
		);

		expect(result).toEqual(["svc-a"]);
	});

	it("deduplicates when a project and one of its environments are both full-access", async () => {
		rowsToReturn = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];
		const result = await getEffectiveAccessedServices(
			member(["proj-1"], ["env-1"], ["svc-a"]),
		);

		expect(result).toEqual(["svc-a"]);
	});
});

describe("resolveAccessScope", () => {
	it("keeps a full-access project that has no environments", async () => {
		rowsToReturn = [];
		const scope = await resolveAccessScope(member(["proj-empty"]));

		expect(scope.projectIds).toEqual(["proj-empty"]);
		expect(scope.environmentIds).toEqual([]);
		expect(scope.serviceIds).toEqual([]);
	});

	it("makes a project visible through an explicit service grant alone", async () => {
		rowsToReturn = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];
		const scope = await resolveAccessScope(member([], [], ["svc-a"]));

		expect(scope.projectIds).toEqual(["proj-1"]);
		expect(scope.environmentIds).toEqual(["env-1"]);
		expect(scope.serviceIds).toEqual(["svc-a"]);
	});

	it("makes every environment of a full-access project visible", async () => {
		rowsToReturn = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: null },
			{ environmentId: "env-2", projectId: "proj-1", serviceId: "svc-b" },
		];
		const scope = await resolveAccessScope(member(["proj-1"]));

		expect(scope.environmentIds.sort()).toEqual(["env-1", "env-2"]);
		expect(scope.serviceIds).toEqual(["svc-b"]);
	});

	it("returns empty sets without querying when the member holds nothing", async () => {
		const scope = await resolveAccessScope(member());

		expect(scope).toEqual({
			serviceIds: [],
			environmentIds: [],
			projectIds: [],
		});
		expect(execute).not.toHaveBeenCalled();
	});
});
