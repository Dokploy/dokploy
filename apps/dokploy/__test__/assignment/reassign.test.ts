import { beforeEach, describe, expect, it, vi } from "vitest";

const updates = vi.hoisted(() => [] as Record<string, unknown>[]);
const state = vi.hoisted(() => ({
	target: null as unknown,
	projects: [] as unknown[],
}));

vi.mock("@dokploy/server/db", () => {
	const db = {
		transaction: vi.fn((run: (tx: unknown) => unknown) => run(db)),
		update: vi.fn(() => ({
			set: vi.fn((values: Record<string, unknown>) => {
				updates.push(values);
				return { where: vi.fn(() => Promise.resolve()) };
			}),
		})),
		query: {
			member: { findFirst: vi.fn(() => Promise.resolve(state.target)) },
			projects: { findMany: vi.fn(() => Promise.resolve(state.projects)) },
		},
	};
	return { db };
});

const { reassignResources } = await import(
	"@dokploy/server/services/assignment"
);

const app = (id: string, assignedTo: string) => ({
	applicationId: id,
	name: id,
	appName: id,
	applicationStatus: "running",
	assignedTo,
});

const emptyServices = {
	compose: [],
	postgres: [],
	mysql: [],
	mariadb: [],
	mongo: [],
	redis: [],
	libsql: [],
};

// "Shop" was created by alice; bob added "shop-db" inside it.
const shop = {
	projectId: "p-shop",
	name: "Shop",
	description: null,
	assignedTo: "alice",
	environments: [
		{
			environmentId: "env-shop",
			name: "production",
			isDefault: true,
			assignedTo: "alice",
			applications: [app("shop-web", "alice"), app("shop-db", "bob")],
			...emptyServices,
		},
	],
};

const member = (role: string) => ({
	id: "member-carol",
	userId: "carol",
	role,
	accessedProjects: ["p-other"],
	accessedEnvironments: [],
	accessedServices: [],
});

beforeEach(() => {
	vi.clearAllMocks();
	updates.length = 0;
	state.projects = [shop];
});

const assignWholeShop = () =>
	reassignResources({
		organizationId: "org",
		targetUserId: "carol",
		projectIds: ["p-shop"],
		environmentIds: ["env-shop"],
		services: [
			{ id: "shop-web", type: "application" },
			{ id: "shop-db", type: "application" },
		],
	});

describe("reassignResources", () => {
	it("moves the project with what is assigned to the same user and leaves others' items alone", async () => {
		state.target = member("member");

		const result = await assignWholeShop();

		expect(result).toEqual({ projects: 1, environments: 1, services: 1 });
		const access = updates.find((values) => "accessedServices" in values);
		expect(access?.accessedServices).toEqual(["shop-web"]);
		expect(access?.accessedProjects).toEqual(["p-other", "p-shop"]);
		expect(access?.accessedEnvironments).toEqual(["env-shop"]);
	});

	it("does not touch the access lists of an admin", async () => {
		state.target = member("admin");

		await assignWholeShop();

		expect(updates.some((values) => "accessedServices" in values)).toBe(false);
		expect(
			updates.filter((values) => values.assignedTo === "carol"),
		).toHaveLength(3);
	});

	it("reassigns a service picked on its own even if it is assigned to someone else", async () => {
		state.target = member("member");

		const result = await reassignResources({
			organizationId: "org",
			targetUserId: "carol",
			projectIds: [],
			environmentIds: [],
			services: [{ id: "shop-db", type: "application" }],
		});

		expect(result.services).toBe(1);
	});

	it("rejects items that are not in the organization", async () => {
		state.target = member("member");

		await expect(
			reassignResources({
				organizationId: "org",
				targetUserId: "carol",
				projectIds: ["p-elsewhere"],
				environmentIds: [],
				services: [],
			}),
		).rejects.toThrow("not in this organization");
		expect(updates).toHaveLength(0);
	});

	it("rejects a target who is not a member", async () => {
		state.target = undefined;

		await expect(assignWholeShop()).rejects.toThrow("not a member");
	});
});
