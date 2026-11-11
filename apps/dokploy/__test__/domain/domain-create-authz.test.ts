import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createDomain: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
	checkServiceAccess: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createDomain: mocks.createDomain,
	findPreviewDeploymentById: mocks.findPreviewDeploymentById,
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServiceAccess,
	checkPermission: vi.fn(async () => undefined),
}));
vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { domainRouter } = await import("@/server/api/routers/domain");

const callerAs = (role: string) =>
	domainRouter.createCaller({
		user: { id: "u1", role },
		session: { activeOrganizationId: "org-a" },
	} as never);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.createDomain.mockResolvedValue({
		domainId: "d1",
		host: "x.example.com",
	});
	mocks.findPreviewDeploymentById.mockResolvedValue({ applicationId: "app-1" });
});

describe("domain.create — authorized users still create domains", () => {
	for (const role of ["owner", "admin", "member"]) {
		it(`${role} with access creates an application domain`, async () => {
			mocks.checkServiceAccess.mockResolvedValue(undefined);
			await callerAs(role).create({
				host: "x.example.com",
				applicationId: "app-1",
				domainType: "application",
				customCertResolver: "",
			} as never);
			expect(mocks.checkServiceAccess).toHaveBeenCalledWith(
				expect.anything(),
				"app-1",
				{ domain: ["create"] },
			);
			expect(mocks.createDomain).toHaveBeenCalledTimes(1);
		});
	}

	it("still authorizes and creates when domainType is omitted", async () => {
		mocks.checkServiceAccess.mockResolvedValue(undefined);
		await callerAs("member").create({
			host: "x.example.com",
			applicationId: "app-1",
			customCertResolver: "",
		} as never);
		expect(mocks.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ domain: ["create"] },
		);
		expect(mocks.createDomain).toHaveBeenCalledTimes(1);
	});
});

describe("domain.create — unauthorized is blocked", () => {
	it("rejects when the caller lacks access to the service (even with omitted domainType)", async () => {
		mocks.checkServiceAccess.mockRejectedValue(
			Object.assign(new Error("UNAUTHORIZED"), { code: "UNAUTHORIZED" }),
		);
		await expect(
			callerAs("member").create({
				host: "x.example.com",
				applicationId: "victim-app",
				customCertResolver: "",
			} as never),
		).rejects.toBeTruthy();
		expect(mocks.createDomain).not.toHaveBeenCalled();
	});

	it("rejects when no service id is provided", async () => {
		await expect(
			callerAs("owner").create({
				host: "x.example.com",
				customCertResolver: "",
			} as never),
		).rejects.toBeTruthy();
		expect(mocks.createDomain).not.toHaveBeenCalled();
	});
});
