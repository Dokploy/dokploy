import { transferGitProvidersToOrganizationOwner } from "@dokploy/server/services/git-provider";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updates = vi.hoisted(() => [] as Record<string, unknown>[]);

const mockDb = vi.hoisted(() => ({
	query: {
		gitProvider: {
			findMany: vi.fn(),
		},
	},
	update: vi.fn(() => ({
		set: vi.fn((values: Record<string, unknown>) => {
			updates.push(values);
			return { where: vi.fn(() => Promise.resolve()) };
		}),
	})),
}));

vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

const owners = vi.hoisted(() => new Map<string, string>());
vi.mock("@dokploy/server/services/proprietary/sso", () => ({
	getOrganizationOwnerId: vi.fn((organizationId: string) =>
		Promise.resolve(owners.get(organizationId) ?? null),
	),
}));

beforeEach(() => {
	vi.clearAllMocks();
	updates.length = 0;
	owners.clear();
});

describe("transferGitProvidersToOrganizationOwner", () => {
	it("moves the user's providers in each organization to that organization's owner", async () => {
		owners.set("org-1", "owner-1");
		owners.set("org-2", "owner-2");
		mockDb.query.gitProvider.findMany.mockResolvedValue([
			{ organizationId: "org-1" },
			{ organizationId: "org-1" },
			{ organizationId: "org-2" },
		]);

		await transferGitProvidersToOrganizationOwner("leaving-user");

		expect(updates).toEqual([{ userId: "owner-1" }, { userId: "owner-2" }]);
	});

	it("leaves providers alone when the user is the organization owner", async () => {
		owners.set("org-1", "leaving-user");
		mockDb.query.gitProvider.findMany.mockResolvedValue([
			{ organizationId: "org-1" },
		]);

		await transferGitProvidersToOrganizationOwner("leaving-user", "org-1");

		expect(updates).toHaveLength(0);
	});

	it("does nothing when the user connected no providers", async () => {
		mockDb.query.gitProvider.findMany.mockResolvedValue([]);

		await transferGitProvidersToOrganizationOwner("leaving-user", "org-1");

		expect(mockDb.update).not.toHaveBeenCalled();
	});
});
