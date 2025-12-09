import { createDomain, updateDomainById } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: vi.fn(),
		update: vi.fn(),
	},
}));

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dokploy/server")>();
	return {
		...actual,
		findApplicationById: vi.fn(),
		manageDomain: vi.fn(),
	};
});

const mockError = Object.assign(new Error("duplicate key"), {
	constraint_name: "domain_host_path_unique",
});

const baseDomainInput = {
	domainType: "application" as const,
	port: 80,
	https: false,
	certificateType: "none" as const,
};

describe("Domain Conflict Validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("createDomain", () => {
		it("should throw CONFLICT error for duplicate domain without path", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.transaction).mockRejectedValue(mockError);

			await expect(
				createDomain({
					...baseDomainInput,
					host: "example.com",
					path: null,
				}),
			).rejects.toThrow("Host 'example.com' is already in use");
		});

		it("should throw CONFLICT error for duplicate domain with path", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.transaction).mockRejectedValue(mockError);

			await expect(
				createDomain({
					...baseDomainInput,
					host: "example.com",
					path: "/api",
				}),
			).rejects.toThrow("Host 'example.com' with path '/api' is already in use");
		});
	});

	describe("updateDomainById", () => {
		it("should throw CONFLICT error for duplicate domain without path", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.update).mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(mockError),
					}),
				}),
			} as any);

			await expect(
				updateDomainById("domain-id", {
					host: "example.com",
					path: null,
				}),
			).rejects.toThrow("Host 'example.com' is already in use");
		});

		it("should throw CONFLICT error for duplicate domain with path", async () => {
			const { db } = await import("@dokploy/server/db");

			vi.mocked(db.update).mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(mockError),
					}),
				}),
			} as any);

			await expect(
				updateDomainById("domain-id", {
					host: "example.com",
					path: "/api",
				}),
			).rejects.toThrow("Host 'example.com' with path '/api' is already in use");
		});
	});
});
