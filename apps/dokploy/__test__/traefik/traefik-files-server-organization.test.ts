import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// apiReadTraefikConfig validates against the real local paths(), which outside
// production live under the working directory.
const traefikPath = vi.hoisted(() => `${process.cwd()}/.docker/traefik`);

const mocks = vi.hoisted(() => ({
	findServerById: vi.fn(),
	readDirectory: vi.fn(),
	readConfigInPath: vi.fn(),
	writeTraefikConfigInPath: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	paths: () => ({ MAIN_TRAEFIK_PATH: traefikPath }),
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
	user: { id: "user-1", email: "user@example.com", role: "member" },
} as Parameters<typeof settingsRouter.createCaller>[0]);

const filePath = path.join(traefikPath, "dynamic/app.yml");

describe("traefik file endpoints scope remote servers to the active organization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findServerById.mockImplementation(async (serverId: string) => ({
			serverId,
			organizationId: serverId === "server-a" ? "org-a" : "org-b",
		}));
		mocks.readDirectory.mockResolvedValue([]);
		mocks.readConfigInPath.mockResolvedValue("http: {}");
	});

	it("rejects listing a server from another organization", async () => {
		await expect(
			caller.readDirectories({ serverId: "server-b" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.readDirectory).not.toHaveBeenCalled();
	});

	it("rejects writing to a server from another organization", async () => {
		await expect(
			caller.updateTraefikFile({
				path: filePath,
				traefikConfig: "http: {}",
				serverId: "server-b",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.writeTraefikConfigInPath).not.toHaveBeenCalled();
	});

	it("rejects reading from a server from another organization", async () => {
		await expect(
			caller.readTraefikFile({ path: filePath, serverId: "server-b" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.readConfigInPath).not.toHaveBeenCalled();
	});

	it("allows servers of the active organization", async () => {
		await caller.readDirectories({ serverId: "server-a" });
		await caller.readTraefikFile({ path: filePath, serverId: "server-a" });
		await caller.updateTraefikFile({
			path: filePath,
			traefikConfig: "http: {}",
			serverId: "server-a",
		});

		expect(mocks.readDirectory).toHaveBeenCalledWith(traefikPath, "server-a");
		expect(mocks.readConfigInPath).toHaveBeenCalledWith(filePath, "server-a");
		expect(mocks.writeTraefikConfigInPath).toHaveBeenCalledWith(
			filePath,
			"http: {}",
			"server-a",
		);
	});

	it("does not look up a server when none is given", async () => {
		await caller.readDirectories({});
		await caller.updateTraefikFile({
			path: filePath,
			traefikConfig: "http: {}",
		});

		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.writeTraefikConfigInPath).toHaveBeenCalledWith(
			filePath,
			"http: {}",
			undefined,
		);
	});
});
