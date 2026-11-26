import { db } from "@dokploy/server/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	updateApplication: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", async (importActual) => ({
	...(await importActual<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	assertServiceCredentialAccess: vi.fn(async () => {}),
	updateApplication: mocks.updateApplication,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { applicationRouter } = await import("@/server/api/routers/application");

const caller = applicationRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof applicationRouter.createCaller>[0]);

const GIB = 1024 ** 3;
const findStored = vi.mocked(db.query.applications.findFirst);

describe("application.update resources", () => {
	beforeEach(() => {
		mocks.updateApplication.mockReset();
		mocks.updateApplication.mockResolvedValue({
			applicationId: "app-1",
			appName: "web-app",
		});
		findStored.mockReset();
	});

	it("rejects a reservation sent alone that exceeds the stored limit", async () => {
		findStored.mockResolvedValue({
			cpuLimit: null,
			cpuReservation: null,
			memoryLimit: String(GIB),
			memoryReservation: null,
		} as never);

		await expect(
			caller.update({
				applicationId: "app-1",
				memoryReservation: String(2 * GIB),
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Memory reservation cannot exceed the memory limit",
		});
		expect(mocks.updateApplication).not.toHaveBeenCalled();
	});

	it("allows the same reservation once the limit is cleared in the same request", async () => {
		findStored.mockResolvedValue({
			cpuLimit: null,
			cpuReservation: null,
			memoryLimit: String(GIB),
			memoryReservation: null,
		} as never);

		await caller.update({
			applicationId: "app-1",
			memoryReservation: String(2 * GIB),
			memoryLimit: null,
		});

		expect(mocks.updateApplication).toHaveBeenCalled();
	});

	it("skips the lookup when no resource field is sent", async () => {
		await caller.update({ applicationId: "app-1", name: "Renamed" });

		expect(findStored).not.toHaveBeenCalled();
		expect(mocks.updateApplication).toHaveBeenCalled();
	});
});
