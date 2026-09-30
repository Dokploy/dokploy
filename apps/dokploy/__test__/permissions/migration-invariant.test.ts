import { beforeEach, describe, expect, it, vi } from "vitest";

type ScopeRow = {
	environmentId: string;
	projectId: string;
	serviceId: string | null;
};

let rowsToReturn: ScopeRow[] = [];
vi.mock("@dokploy/server/db", () => ({
	db: { execute: vi.fn(() => Promise.resolve(rowsToReturn)) },
}));

const { resolveAccessScope } = await import(
	"@dokploy/server/services/access-scope"
);

type Member = {
	accessedProjects: string[];
	accessedEnvironments: string[];
	accessedServices: string[];
};

const servicesOfProject = (rows: ScopeRow[], projectId: string) =>
	rows
		.filter((r) => r.projectId === projectId && r.serviceId)
		.map((r) => r.serviceId!);

const servicesOfEnvironment = (rows: ScopeRow[], environmentId: string) =>
	rows
		.filter((r) => r.environmentId === environmentId && r.serviceId)
		.map((r) => r.serviceId!);

// Mirrors the two UPDATE statements in 0197. A grant is dropped only when the
// member holds SOME but not all of the services beneath it, which is the
// signature of a parent the old dialog auto-added. Holding all of them is
// already full access, and holding none means the row was a deliberate
// project- or environment-level grant that must survive.
const isPartialGrant = (contained: string[], held: string[]) =>
	contained.some((id) => !held.includes(id)) &&
	contained.some((id) => held.includes(id));

const applyMigration = (member: Member, rows: ScopeRow[]): Member => ({
	accessedProjects: member.accessedProjects.filter(
		(projectId) =>
			!isPartialGrant(
				servicesOfProject(rows, projectId),
				member.accessedServices,
			),
	),
	accessedEnvironments: member.accessedEnvironments.filter(
		(environmentId) =>
			!isPartialGrant(
				servicesOfEnvironment(rows, environmentId),
				member.accessedServices,
			),
	),
	accessedServices: member.accessedServices,
});

const world: ScopeRow[] = [
	{ environmentId: "env-prod", projectId: "proj-1", serviceId: "svc-a" },
	{ environmentId: "env-prod", projectId: "proj-1", serviceId: "svc-b" },
	{ environmentId: "env-dev", projectId: "proj-1", serviceId: "svc-c" },
	{ environmentId: "env-solo", projectId: "proj-2", serviceId: null },
];

const oldReachable = (member: Member) => [...member.accessedServices].sort();

const newReachable = async (member: Member) => {
	rowsToReturn = world;
	const scope = await resolveAccessScope(member);
	return [...scope.serviceIds].sort();
};

beforeEach(() => {
	rowsToReturn = world;
});

describe("migration preserves reachable services exactly", () => {
	const cases: Array<[string, Member]> = [
		[
			"partial grant with auto-added parent project",
			{
				accessedProjects: ["proj-1"],
				accessedEnvironments: ["env-prod"],
				accessedServices: ["svc-a"],
			},
		],
		[
			"member covering every service in the project",
			{
				accessedProjects: ["proj-1"],
				accessedEnvironments: [],
				accessedServices: ["svc-a", "svc-b", "svc-c"],
			},
		],
		[
			"service-only grant",
			{
				accessedProjects: [],
				accessedEnvironments: [],
				accessedServices: ["svc-c"],
			},
		],
		[
			"empty member",
			{ accessedProjects: [], accessedEnvironments: [], accessedServices: [] },
		],
		[
			"project with no services",
			{
				accessedProjects: ["proj-2"],
				accessedEnvironments: [],
				accessedServices: [],
			},
		],
		[
			"project dropped but environment kept",
			{
				accessedProjects: ["proj-1"],
				accessedEnvironments: ["env-dev"],
				accessedServices: ["svc-c"],
			},
		],
	];

	for (const [name, before] of cases) {
		it(name, async () => {
			const after = applyMigration(before, world);
			expect(await newReachable(after)).toEqual(oldReachable(before));
		});
	}

	it("drops the auto-added parent so the member does not gain the siblings", async () => {
		const before: Member = {
			accessedProjects: ["proj-1"],
			accessedEnvironments: ["env-prod"],
			accessedServices: ["svc-a"],
		};
		expect(applyMigration(before, world).accessedProjects).toEqual([]);
		expect(applyMigration(before, world).accessedEnvironments).toEqual([]);
	});

	it("keeps a project the member already covers in full", async () => {
		const before: Member = {
			accessedProjects: ["proj-1"],
			accessedEnvironments: [],
			accessedServices: ["svc-a", "svc-b", "svc-c"],
		};
		expect(applyMigration(before, world).accessedProjects).toEqual(["proj-1"]);
	});

	it("keeps an environment grant held without any of its services", async () => {
		const before: Member = {
			accessedProjects: ["proj-1"],
			accessedEnvironments: ["env-prod"],
			accessedServices: [],
		};
		const after = applyMigration(before, world);

		expect(after.accessedProjects).toEqual(["proj-1"]);
		expect(after.accessedEnvironments).toEqual(["env-prod"]);
	});

	it("deliberate grants gain the services beneath them, by design", async () => {
		// The one shape where reachability intentionally widens. Holding no service
		// inside the project means the row came from ticking the project itself, so
		// under the new semantics it grants everything beneath it. Dropping it
		// instead would revoke the project from a member with no service grant to
		// derive visibility from, which is the worse of the two.
		const before: Member = {
			accessedProjects: ["proj-1"],
			accessedEnvironments: ["env-prod"],
			accessedServices: [],
		};
		const after = applyMigration(before, world);

		expect(oldReachable(before)).toEqual([]);
		expect(await newReachable(after)).toEqual(["svc-a", "svc-b", "svc-c"]);
	});

	it("keeps a project that has no services at all", async () => {
		const before: Member = {
			accessedProjects: ["proj-2"],
			accessedEnvironments: [],
			accessedServices: [],
		};
		expect(applyMigration(before, world).accessedProjects).toEqual(["proj-2"]);
	});
});
