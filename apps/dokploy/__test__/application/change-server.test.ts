import { canChangeApplicationServer } from "@dokploy/server/services/application";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateApplication = vi.hoisted(() => vi.fn());
const mockFindApplicationById = vi.hoisted(() => vi.fn());
const mockChangeApplicationServer = vi.hoisted(() => vi.fn());
const mockGetAccessibleServerIds = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	updateApplication: mockUpdateApplication,
	findApplicationById: mockFindApplicationById,
	changeApplicationServer: mockChangeApplicationServer,
	getAccessibleServerIds: mockGetAccessibleServerIds,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { applicationRouter } = await import("@/server/api/routers/application");

const caller = applicationRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof applicationRouter.createCaller>[0]);

describe("canChangeApplicationServer helper", () => {
	it("returns true when application is idle and has no deployments", () => {
		expect(
			canChangeApplicationServer({
				applicationStatus: "idle",
				deployments: [],
			}),
		).toBe(true);

		expect(
			canChangeApplicationServer({
				applicationStatus: "idle",
				deployments: null,
			}),
		).toBe(true);
	});

	it("returns false when application is running, done, or in error state", () => {
		expect(
			canChangeApplicationServer({
				applicationStatus: "running",
				deployments: [],
			}),
		).toBe(false);

		expect(
			canChangeApplicationServer({
				applicationStatus: "done",
				deployments: [],
			}),
		).toBe(false);

		expect(
			canChangeApplicationServer({
				applicationStatus: "error",
				deployments: [],
			}),
		).toBe(false);
	});

	it("returns false when application has past deployments", () => {
		expect(
			canChangeApplicationServer({
				applicationStatus: "idle",
				deployments: [{ deploymentId: "dep-1" }],
			}),
		).toBe(false);
	});
});

describe("Application update router - Change Server before deployment", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetAccessibleServerIds.mockResolvedValue(
			new Set(["server-1", "server-2"]),
		);
	});

	it("allows changing the server when application is undeployed (idle with no deployments)", async () => {
		mockFindApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "test-app",
			applicationStatus: "idle",
			serverId: "server-1",
			deployments: [],
		});
		mockUpdateApplication.mockResolvedValue({
			applicationId: "app-1",
			appName: "test-app",
			serverId: "server-2",
		});
		mockChangeApplicationServer.mockResolvedValue({
			applicationId: "app-1",
			appName: "test-app",
			serverId: "server-2",
		});

		const result = await caller.update({
			applicationId: "app-1",
			serverId: "server-2",
		});

		expect(result).toBe(true);
		expect(mockChangeApplicationServer).toHaveBeenCalledWith(
			"app-1",
			"server-2",
		);
	});

	it("does not call changeApplicationServer if serverId remains the same", async () => {
		mockFindApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "test-app",
			applicationStatus: "idle",
			serverId: "server-1",
			deployments: [],
		});
		mockUpdateApplication.mockResolvedValue({
			applicationId: "app-1",
			appName: "test-app",
			serverId: "server-1",
		});

		const result = await caller.update({
			applicationId: "app-1",
			serverId: "server-1",
			name: "Updated Name",
		});

		expect(result).toBe(true);
		expect(mockChangeApplicationServer).not.toHaveBeenCalled();
		expect(mockUpdateApplication).toHaveBeenCalledWith("app-1", {
			name: "Updated Name",
		});
	});

	it("blocks server change when user is not authorized for target server", async () => {
		mockFindApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "test-app",
			applicationStatus: "idle",
			serverId: "server-1",
			deployments: [],
		});
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));

		await expect(
			caller.update({
				applicationId: "app-1",
				serverId: "unauthorized-server",
			}),
		).rejects.toThrow(
			/You are not authorized to deploy to the selected server/,
		);

		expect(mockChangeApplicationServer).not.toHaveBeenCalled();
	});
});
