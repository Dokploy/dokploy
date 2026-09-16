import { describe, expect, it, vi } from "vitest";

const mockMember = (role: string) => ({
	id: "m-1", role, userId: "u-1", organizationId: "o-1",
	accessedProjects: [], accessedServices: [], accessedEnvironments: [],
});

let currentMember = mockMember("user");

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: { findFirst: vi.fn(() => Promise.resolve(currentMember)), findMany: vi.fn(() => Promise.resolve([])) },
			organizationRole: { findFirst: vi.fn(), findMany: vi.fn(() => Promise.resolve([])) },
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

const { checkPermission, resolvePermissions } = await import("@dokploy/server/services/permission");
const { userRole } = await import("@dokploy/server/lib/access-control");
const ctx = { user: { id: "u-1" }, session: { activeOrganizationId: "o-1" } };

describe("View-only user role tests", () => {
	it("userRole is defined in access-control", () => {
		expect(userRole).toBeDefined();
	});

	it("user role allows read access to services, domains, deployments", async () => {
		currentMember = mockMember("user");
		await expect(checkPermission(ctx, { service: ["read"] })).resolves.toBeUndefined();
		await expect(checkPermission(ctx, { domain: ["read"] })).resolves.toBeUndefined();
		await expect(checkPermission(ctx, { deployment: ["read"] })).resolves.toBeUndefined();
	});

	it("user role rejects deployment and project creation", async () => {
		currentMember = mockMember("user");
		await expect(checkPermission(ctx, { deployment: ["create"] })).rejects.toThrow();
		await expect(checkPermission(ctx, { project: ["create"] })).rejects.toThrow();
	});

	it("resolves view-only permissions map correctly", async () => {
		currentMember = mockMember("user");
		const perms = await resolvePermissions(ctx);
		expect(perms.service.read).toBe(true);
		expect(perms.domain.read).toBe(true);
		expect(perms.deployment.create).toBe(false);
		expect(perms.project.create).toBe(false);
	});
});
