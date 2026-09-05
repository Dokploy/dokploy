import { apiUpdateApplication } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

const APP_ID = "app-1";

describe("apiUpdateApplication — registry FK columns", () => {
	it("keeps registryId, buildRegistryId and rollbackRegistryId writable as strings", () => {
		const r = apiUpdateApplication.safeParse({
			applicationId: APP_ID,
			registryId: "r1",
			buildRegistryId: "r2",
			rollbackRegistryId: "r3",
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.registryId).toBe("r1");
			expect(r.data.buildRegistryId).toBe("r2");
			expect(r.data.rollbackRegistryId).toBe("r3");
		}
	});

	it("accepts null to clear the registry FKs (registry/rollback picker 'None')", () => {
		const r = apiUpdateApplication.safeParse({
			applicationId: APP_ID,
			registryId: null,
			buildRegistryId: null,
			rollbackRegistryId: null,
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.registryId).toBeNull();
			expect(r.data.buildRegistryId).toBeNull();
			expect(r.data.rollbackRegistryId).toBeNull();
		}
	});

	it("still omits serverId from the writable surface", () => {
		const r = apiUpdateApplication.safeParse({
			applicationId: APP_ID,
			serverId: "srv-1",
		} as any);
		expect(r.success).toBe(true);
		if (r.success) {
			expect((r.data as Record<string, unknown>).serverId).toBeUndefined();
			expect("serverId" in r.data).toBe(false);
		}
	});

	it("requires applicationId (rejects missing and empty)", () => {
		expect(apiUpdateApplication.safeParse({ registryId: "r1" }).success).toBe(
			false,
		);
		expect(apiUpdateApplication.safeParse({ applicationId: "" }).success).toBe(
			false,
		);
	});
});
