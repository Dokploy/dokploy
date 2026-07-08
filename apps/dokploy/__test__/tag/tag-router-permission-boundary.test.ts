import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	findMemberByUserId: vi.fn(),
	insertProjectTagsValues: vi.fn(),
	insertProjectTagsReturning: vi.fn(),
	projectFindFirst: vi.fn(),
	projectTagDeleteWhere: vi.fn(),
	tagFindFirst: vi.fn(),
	tagFindMany: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			projects: {
				findFirst: mocks.projectFindFirst,
			},
			tags: {
				findFirst: mocks.tagFindFirst,
				findMany: mocks.tagFindMany,
			},
		},
		insert: vi.fn(() => ({
			values: mocks.insertProjectTagsValues.mockReturnValue({
				returning: mocks.insertProjectTagsReturning,
			}),
		})),
		delete: vi.fn(() => ({
			where: mocks.projectTagDeleteWhere,
		})),
	},
}));

vi.mock("@/server/db", () => ({
	db: {
		query: {
			projects: {
				findFirst: mocks.projectFindFirst,
			},
			tags: {
				findFirst: mocks.tagFindFirst,
				findMany: mocks.tagFindMany,
			},
		},
		insert: vi.fn(() => ({
			values: mocks.insertProjectTagsValues.mockReturnValue({
				returning: mocks.insertProjectTagsReturning,
			}),
		})),
		delete: vi.fn(() => ({
			where: mocks.projectTagDeleteWhere,
		})),
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	findMemberByUserId: mocks.findMemberByUserId,
}));

const { tagRouter } = await import("../../server/api/routers/tag");

const createCaller = () =>
	tagRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "member",
		},
	} as never);

describe("tag router permission boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedProjects: ["project-1"],
		});
		mocks.projectFindFirst.mockResolvedValue({
			projectId: "project-1",
			organizationId: "org-1",
		});
		mocks.tagFindFirst.mockResolvedValue({
			tagId: "tag-1",
			organizationId: "org-1",
		});
		mocks.tagFindMany.mockResolvedValue([
			{
				tagId: "tag-1",
				organizationId: "org-1",
			},
			{
				tagId: "tag-2",
				organizationId: "org-1",
			},
		]);
		mocks.insertProjectTagsReturning.mockResolvedValue([
			{
				projectId: "project-1",
				tagId: "tag-1",
			},
		]);
		mocks.projectTagDeleteWhere.mockResolvedValue(undefined);
	});

	it("requires tag.read for tag read endpoints", async () => {
		const caller = createCaller();

		await expect(caller.all()).resolves.toHaveLength(2);
		await expect(caller.one({ tagId: "tag-1" })).resolves.toMatchObject({
			tagId: "tag-1",
		});

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			tag: ["read"],
		});
		expect(
			mocks.checkPermission.mock.calls.filter(
				([, permissions]) =>
					JSON.stringify(permissions) === JSON.stringify({ tag: ["read"] }),
			),
		).toHaveLength(2);
	});

	it("requires tag.update for project tag association mutations", async () => {
		const caller = createCaller();

		await expect(
			caller.assignToProject({
				projectId: "project-1",
				tagId: "tag-1",
			}),
		).resolves.toMatchObject({
			projectId: "project-1",
			tagId: "tag-1",
		});
		await expect(
			caller.removeFromProject({
				projectId: "project-1",
				tagId: "tag-1",
			}),
		).resolves.toEqual({ success: true });
		await expect(
			caller.bulkAssign({
				projectId: "project-1",
				tagIds: ["tag-1", "tag-2"],
			}),
		).resolves.toEqual({ success: true });

		expect(
			mocks.checkPermission.mock.calls.filter(
				([, permissions]) =>
					JSON.stringify(permissions) === JSON.stringify({ tag: ["update"] }),
			),
		).toHaveLength(3);
	});

	it("denies project tag association mutations before side effects when tag.update is missing", async () => {
		mocks.checkPermission.mockRejectedValueOnce(
			new TRPCError({
				code: "FORBIDDEN",
				message: "Permission denied",
			}),
		);

		await expect(
			createCaller().bulkAssign({
				projectId: "project-1",
				tagIds: ["tag-1"],
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.projectTagDeleteWhere).not.toHaveBeenCalled();
		expect(mocks.insertProjectTagsValues).not.toHaveBeenCalled();
	});
});
