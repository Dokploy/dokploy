import { apiCreateRegistry, apiTestRegistry } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("Registry Schema - Username case preservation (#4632)", () => {
	const validBase = {
		registryName: "AWS ECR",
		password: "dXNlcm5hbWU6cGFzc3dvcmQ=", // dummy base64 token
		registryUrl: "123456789.dkr.ecr.us-east-1.amazonaws.com",
		registryType: "cloud" as const,
		imagePrefix: null,
	};

	it("should preserve uppercase username (AWS ECR requires 'AWS')", () => {
		const result = apiCreateRegistry.safeParse({
			...validBase,
			username: "AWS",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.username).toBe("AWS");
		}
	});

	it("should not lowercase mixed-case usernames", () => {
		const result = apiCreateRegistry.safeParse({
			...validBase,
			username: "MyUser",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.username).toBe("MyUser");
		}
	});

	it("should still trim whitespace from username", () => {
		const result = apiCreateRegistry.safeParse({
			...validBase,
			username: "  AWS  ",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.username).toBe("AWS");
		}
	});

	it("should reject empty username", () => {
		const result = apiCreateRegistry.safeParse({
			...validBase,
			username: "",
		});
		expect(result.success).toBe(false);
	});

	it("should also preserve case in apiTestRegistry", () => {
		const result = apiTestRegistry.safeParse({
			...validBase,
			username: "AWS",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.username).toBe("AWS");
		}
	});

	it("should accept lowercase usernames too (backward compat)", () => {
		const result = apiCreateRegistry.safeParse({
			...validBase,
			username: "myuser",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.username).toBe("myuser");
		}
	});
});
