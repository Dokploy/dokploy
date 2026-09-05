import { db } from "@dokploy/server/db";
import { assertRegistryBelongsToOrganization } from "@dokploy/server/services/registry";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// db is globally mocked in __test__/setup.ts; each test overrides
// db.query.registry.findFirst to model the row findRegistryById resolves.
const ORG = "org-1";
const OTHER_ORG = "org-2";
const REGISTRY_ID = "reg-1";

function mockRegistry(organizationId: string) {
	vi.mocked(db.query.registry.findFirst).mockResolvedValue({
		registryId: REGISTRY_ID,
		organizationId,
	} as any);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("assertRegistryBelongsToOrganization", () => {
	it("resolves when the registry belongs to the caller's organization", async () => {
		mockRegistry(ORG);
		await expect(
			assertRegistryBelongsToOrganization(REGISTRY_ID, ORG),
		).resolves.toBeUndefined();
	});

	it("rejects a registry from another organization with UNAUTHORIZED", async () => {
		mockRegistry(OTHER_ORG);
		const err = await assertRegistryBelongsToOrganization(
			REGISTRY_ID,
			ORG,
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(TRPCError);
		expect((err as TRPCError).code).toBe("UNAUTHORIZED");
		expect((err as TRPCError).message).toBe(
			"You are not authorized to use this registry",
		);
	});

	it("propagates NOT_FOUND when the referenced registry does not exist", async () => {
		vi.mocked(db.query.registry.findFirst).mockResolvedValue(undefined as any);
		await expect(
			assertRegistryBelongsToOrganization("missing", ORG),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
