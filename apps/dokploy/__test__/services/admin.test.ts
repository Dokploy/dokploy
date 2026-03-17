import { db } from "@dokploy/server/db";
import { findOwner, isAdminPresent } from "@dokploy/server/services/admin";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

describe("admin service", () => {
	it("isAdminPresent queries only minimal owner columns", async () => {
		vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
			id: "member_1",
		} as never);

		const result = await isAdminPresent();

		expect(result).toBe(true);
		expect(db.query.member.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				columns: {
					id: true,
				},
			}),
		);
	});

	it("findOwner queries only stable member columns", async () => {
		vi.mocked(db.query.member.findFirst).mockResolvedValueOnce({
			id: "member_1",
			userId: "user_1",
			user: {
				id: "user_1",
			},
		} as never);

		const result = await findOwner();

		expect(result.userId).toBe("user_1");
		expect(db.query.member.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				columns: {
					id: true,
					userId: true,
				},
				with: {
					user: true,
				},
			}),
		);
	});

	it("findOwner throws when owner is not found", async () => {
		vi.mocked(db.query.member.findFirst).mockResolvedValueOnce(undefined);

		await expect(findOwner()).rejects.toBeInstanceOf(TRPCError);
	});

	it("isAdminPresent returns false when query fails", async () => {
		vi.mocked(db.query.member.findFirst).mockRejectedValueOnce(
			new Error("relation member does not exist"),
		);

		await expect(isAdminPresent()).resolves.toBe(false);
	});
});
