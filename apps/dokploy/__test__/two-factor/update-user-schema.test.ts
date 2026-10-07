import { apiUpdateUser } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("apiUpdateUser", () => {
	it("doesn't let a profile update change twoFactorEnabled", () => {
		const parsed = apiUpdateUser.parse({
			firstName: "Jane",
			twoFactorEnabled: true,
		});
		expect(parsed).not.toHaveProperty("twoFactorEnabled");
	});
});
