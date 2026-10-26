import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findServerById: vi.fn(),
	getTraefikOverview: vi.fn(),
	pullTraefikImage: vi.fn(),
	readEnvironmentVariableList: vi.fn(),
	readPorts: vi.fn(),
	writeTraefikSetup: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	...mocks,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanAllDeploymentQueue: vi.fn(),
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
}));

const { settingsRouter } = await import("@/server/api/routers/settings");

const caller = settingsRouter.createCaller({
	session: { activeOrganizationId: "org-a" },
	user: { id: "user-1", email: "admin@example.com", role: "owner" },
} as Parameters<typeof settingsRouter.createCaller>[0]);

describe("Traefik update endpoints on cloud", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findServerById.mockImplementation(async (serverId: string) => ({
			serverId,
			organizationId: serverId === "server-b" ? "org-b" : "org-a",
		}));
		mocks.getTraefikOverview.mockResolvedValue({
			state: "running",
			startedAt: "2026-10-23T03:00:00Z",
			image: "traefik:v3.6.25",
			currentVersion: "3.6.25",
			recommendedVersion: "3.7.16",
			versionStatus: "outdated",
		});
	});

	it("never reads or updates the Traefik of the cloud platform itself", async () => {
		await expect(caller.getTraefikOverview({})).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(caller.updateTraefik({})).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(mocks.getTraefikOverview).not.toHaveBeenCalled();
		expect(mocks.pullTraefikImage).not.toHaveBeenCalled();
		expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
	});

	it("serves the organization's own remote servers", async () => {
		await expect(
			caller.getTraefikOverview({ serverId: "server-a" }),
		).resolves.toMatchObject({ versionStatus: "outdated", isUpdating: false });
		expect(mocks.getTraefikOverview).toHaveBeenCalledWith("server-a");
	});

	it("rejects another organization's server", async () => {
		await expect(
			caller.updateTraefik({ serverId: "server-b" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.pullTraefikImage).not.toHaveBeenCalled();
	});
});
