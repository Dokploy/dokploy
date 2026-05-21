import { describe, expect, it } from "vitest";
import { customRoleNameSchema } from "@/server/api/routers/proprietary/custom-role-validation";

describe("custom role name validation", () => {
	it("normalizes surrounding whitespace before storing a role name", () => {
		const parsed = customRoleNameSchema.parse(" deployer ");

		expect(parsed).toBe("deployer");
	});

	it("rejects empty role names after trimming whitespace", () => {
		const result = customRoleNameSchema.safeParse("   ");

		expect(result.success).toBe(false);
	});

	it("rejects names with unsupported characters", () => {
		const result = customRoleNameSchema.safeParse("deploy/read");

		expect(result.success).toBe(false);
	});

	it("rejects reserved built-in role names after trimming", () => {
		const result = customRoleNameSchema.safeParse(" admin ");

		expect(result.success).toBe(false);
	});
});
