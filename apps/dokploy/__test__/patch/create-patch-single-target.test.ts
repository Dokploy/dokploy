import { createPatch } from "@dokploy/server/services/patch";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
	const returning = vi.fn(async () => [{ patchId: "p1" }]);
	const values = vi.fn(() => ({ returning }));
	const insert = vi.fn(() => ({ values }));
	return { insert, values, returning };
});
vi.mock("@dokploy/server/db", () => ({ db: { insert: dbMocks.insert } }));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));
vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("createPatch target", () => {
	it("rejects a patch that names both an application and a compose", async () => {
		await expect(
			createPatch({
				filePath: "docker-compose.yml",
				content: "services: {}",
				applicationId: "my-app",
				composeId: "victim-compose",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(dbMocks.insert).not.toHaveBeenCalled();
	});

	it("creates a patch for a single compose", async () => {
		await createPatch({
			filePath: "docker-compose.yml",
			content: "services: {}",
			composeId: "my-compose",
		});
		expect(dbMocks.values).toHaveBeenCalledWith(
			expect.objectContaining({ composeId: "my-compose" }),
		);
		expect(dbMocks.values).toHaveBeenCalledWith(
			expect.not.objectContaining({ applicationId: expect.anything() }),
		);
	});
});
