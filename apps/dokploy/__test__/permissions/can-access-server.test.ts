import { canAccessServer } from "@dokploy/server/services/user";
import { db } from "@dokploy/server/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Base member shape matching the schema
const baseMember = {
	id: "member-1",
	organizationId: "org-1",
	userId: "user-1",
	createdAt: new Date(),
	teamId: null,
	isDefault: false,
	canCreateProjects: false,
	canAccessToSSHKeys: false,
	canCreateServices: false,
	canDeleteProjects: false,
	canDeleteServices: false,
	canAccessToDocker: false,
	canAccessToAPI: false,
	canAccessToGitProviders: false,
	canAccessToTraefikFiles: false,
	canDeleteEnvironments: false,
	canCreateEnvironments: false,
	accessedProjects: [],
	accessedEnvironments: [],
	accessedServices: [],
	accessedServers: [],
	user: { id: "user-1", email: "user@test.com", name: "Test User" },
};

describe("canAccessServer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("owner role", () => {
		it("always returns true regardless of accessedServers", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "owner",
				accessedServers: [],
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(true);
		});

		it("returns true even when accessedServers is null", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "owner",
				accessedServers: null,
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(true);
		});
	});

	describe("admin role", () => {
		it("always returns true regardless of accessedServers", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "admin",
				accessedServers: [],
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(true);
		});
	});

	describe("member role", () => {
		it("returns true when serverId is in accessedServers", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: ["server-1", "server-2"],
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(true);
		});

		it("returns false when serverId is NOT in accessedServers", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: ["server-2", "server-3"],
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(false);
		});

		it("returns false when accessedServers is empty", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: [],
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(false);
		});

		it("returns false when accessedServers is null/undefined", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: null,
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(false);
		});

		it('returns true when "local" is in accessedServers and serverId is "local"', async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: ["local"],
			} as any);

			const result = await canAccessServer("user-1", "local", "org-1");
			expect(result).toBe(true);
		});

		it('returns false when "local" is NOT in accessedServers and serverId is "local"', async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: ["server-1"],
			} as any);

			const result = await canAccessServer("user-1", "local", "org-1");
			expect(result).toBe(false);
		});

		it("does not grant access to a server not explicitly listed", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: ["server-1"],
			} as any);

			const result = await canAccessServer("user-1", "server-99", "org-1");
			expect(result).toBe(false);
		});

		it("checks exact match — partial server id does not grant access", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
				...baseMember,
				role: "member",
				accessedServers: ["server-1-extended"],
			} as any);

			const result = await canAccessServer("user-1", "server-1", "org-1");
			expect(result).toBe(false);
		});
	});

	describe("member not found", () => {
		it("throws UNAUTHORIZED when member does not exist in the organization", async () => {
			vi.mocked(db.query.member.findFirst).mockResolvedValueOnce(
				undefined as any,
			);

			await expect(
				canAccessServer("user-1", "server-1", "org-1"),
			).rejects.toThrow("Permission denied");
		});
	});

	describe("multiple servers in accessedServers", () => {
		it.each([
			["server-1", true],
			["server-2", true],
			["server-3", true],
			["server-4", false],
			["local", false],
		])(
			"serverId=%s should return %s",
			async (serverId, expected) => {
				vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
					...baseMember,
					role: "member",
					accessedServers: ["server-1", "server-2", "server-3"],
				} as any);

				const result = await canAccessServer("user-1", serverId, "org-1");
				expect(result).toBe(expected);
			},
		);
	});
});
