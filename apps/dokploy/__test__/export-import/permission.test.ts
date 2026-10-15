import { beforeEach, describe, expect, it, vi } from "vitest";

let memberToReturn:
	| {
			id: string;
			role: string;
			userId: string;
			organizationId: string;
			accessedProjects: string[];
	  }
	| undefined = {
	id: "member-1",
	role: "owner",
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects: [],
};

let projectToReturn: { projectId: string; organizationId: string } | undefined =
	{ projectId: "project-1", organizationId: "org-1" };

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(() => Promise.resolve(memberToReturn)),
			},
			projects: {
				findFirst: vi.fn(() => Promise.resolve(projectToReturn)),
			},
		},
	},
}));

const { assertTransferPermission } = await import(
	"@dokploy/server/services/project-export-import"
);

const ctxFor = (organizationId: string) => ({
	user: { id: "user-1" },
	session: { activeOrganizationId: organizationId },
});

beforeEach(() => {
	memberToReturn = {
		id: "member-1",
		role: "owner",
		userId: "user-1",
		organizationId: "org-1",
		accessedProjects: [],
	};
	projectToReturn = { projectId: "project-1", organizationId: "org-1" };
});

describe("assertTransferPermission", () => {
	it("allows an owner to export", async () => {
		memberToReturn = { ...memberToReturn!, role: "owner" };
		await expect(
			assertTransferPermission(ctxFor("org-1") as any, "project-1", "export"),
		).resolves.toBeDefined();
	});

	it("allows an admin to export", async () => {
		memberToReturn = { ...memberToReturn!, role: "admin" };
		await expect(
			assertTransferPermission(ctxFor("org-1") as any, "project-1", "export"),
		).resolves.toBeDefined();
	});

	it("rejects a plain member with FORBIDDEN", async () => {
		memberToReturn = { ...memberToReturn!, role: "member" };
		await expect(
			assertTransferPermission(ctxFor("org-1") as any, "project-1", "export"),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects a user with no membership in the active org (cross-org access)", async () => {
		memberToReturn = undefined;
		await expect(
			assertTransferPermission(ctxFor("org-2") as any, "project-1", "export"),
		).rejects.toBeDefined();
	});

	it("rejects NOT_FOUND when projectId belongs to a different organization, even for an owner", async () => {
		projectToReturn = { projectId: "project-1", organizationId: "org-2" };
		await expect(
			assertTransferPermission(ctxFor("org-1") as any, "project-1", "export"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects NOT_FOUND when projectId doesn't exist at all", async () => {
		projectToReturn = undefined;
		await expect(
			assertTransferPermission(
				ctxFor("org-1") as any,
				"project-missing",
				"export",
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("skips the project lookup entirely when no projectId is given", async () => {
		projectToReturn = undefined;
		await expect(
			assertTransferPermission(ctxFor("org-1") as any, undefined, "export"),
		).resolves.toBeDefined();
	});
});
