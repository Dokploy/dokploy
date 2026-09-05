import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFind = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDeploy = vi.hoisted(() => vi.fn());
const mockCheckPort = vi.hoisted(() => vi.fn());
const mockCheckPerm = vi.hoisted(() => vi.fn());
const mockAudit = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server", () => ({
	findMariadbById: mockFind,
	updateMariadbById: mockUpdate,
	deployMariadb: mockDeploy,
	checkPortInUse: mockCheckPort,
	IS_CLOUD: false,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mockCheckPerm,
	checkServiceAccess: vi.fn(),
	checkPermission: vi.fn(),
	findMemberByUserId: vi.fn(),
	addNewService: vi.fn(),
	hasPermission: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mockAudit }));

const { mariadbRouter } = await import("@/server/api/routers/mariadb");

const mariadbFixture = {
	mariadbId: "mariadb-1",
	appName: "test-mariadb",
	serverId: null,
	externalPort: 3306,
};

const ctx = {
	user: { id: "user-1", email: "u@test.com", role: "owner" },
	session: { activeOrganizationId: "org-1" },
} as unknown as Parameters<typeof mariadbRouter.createCaller>[0];

const call = () => mariadbRouter.createCaller(ctx);

beforeEach(() => {
	vi.clearAllMocks();
	mockCheckPerm.mockResolvedValue(undefined);
	mockFind.mockResolvedValue({ ...mariadbFixture });
	mockUpdate.mockResolvedValue({ ...mariadbFixture });
	mockDeploy.mockResolvedValue(undefined);
	mockAudit.mockResolvedValue(undefined);
});

describe("mariadb.saveExternalPort handler (G13-G17)", () => {
	it("G13+G14: externalPort null clears the port — update called with null, deploy called, checkPortInUse NOT called", async () => {
		await call().saveExternalPort({
			mariadbId: "mariadb-1",
			externalPort: null,
		});

		expect(mockCheckPerm).toHaveBeenCalledWith(ctx, "mariadb-1", {
			service: ["create"],
		});
		expect(mockCheckPort).not.toHaveBeenCalled();
		expect(mockUpdate).toHaveBeenCalledWith("mariadb-1", {
			externalPort: null,
		});
		expect(mockDeploy).toHaveBeenCalledWith("mariadb-1");
		expect(mockAudit).toHaveBeenCalledOnce();
	});

	it("G16: externalPort number (free port) runs checkPortInUse and deploys with the port", async () => {
		mockCheckPort.mockResolvedValue({ isInUse: false });

		await call().saveExternalPort({
			mariadbId: "mariadb-1",
			externalPort: 3306,
		});

		expect(mockCheckPort).toHaveBeenCalledWith(3306, undefined);
		expect(mockUpdate).toHaveBeenCalledWith("mariadb-1", {
			externalPort: 3306,
		});
		expect(mockDeploy).toHaveBeenCalledWith("mariadb-1");
	});

	it("G15: externalPort number on a busy port throws CONFLICT and does NOT update/deploy", async () => {
		mockCheckPort.mockResolvedValue({
			isInUse: true,
			conflictingContainer: "some-container",
		});

		await expect(
			call().saveExternalPort({ mariadbId: "mariadb-1", externalPort: 3306 }),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Port 3306 is already in use by some-container",
		});

		expect(mockUpdate).not.toHaveBeenCalled();
		expect(mockDeploy).not.toHaveBeenCalled();
		expect(mockAudit).not.toHaveBeenCalled();
	});

	it("G15b: checkPortInUse receives the serverId from the mariadb row when present", async () => {
		mockFind.mockResolvedValue({ ...mariadbFixture, serverId: "server-9" });
		mockCheckPort.mockResolvedValue({ isInUse: false });

		await call().saveExternalPort({
			mariadbId: "mariadb-1",
			externalPort: 3306,
		});

		expect(mockCheckPort).toHaveBeenCalledWith(3306, "server-9");
	});

	it("G17: unauthorized caller is rejected before any service call", async () => {
		mockCheckPerm.mockRejectedValue(new TRPCError({ code: "UNAUTHORIZED" }));

		await expect(
			call().saveExternalPort({ mariadbId: "mariadb-1", externalPort: null }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mockFind).not.toHaveBeenCalled();
		expect(mockUpdate).not.toHaveBeenCalled();
		expect(mockDeploy).not.toHaveBeenCalled();
	});
});
