import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	updateApplication: vi.fn(),
	findRegistryById: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
	assertNoTraefikLabels: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/services/registry", () => ({
	findRegistryById: mocks.findRegistryById,
}));

vi.mock("@dokploy/server/index", async () => {
	const { assertServiceCredentialAccess } = await import(
		"@dokploy/server/services/service-credentials"
	);
	return {
		IS_CLOUD: true,
		hasValidLicense: vi.fn(async () => false),
		updateApplication: mocks.updateApplication,
		assertServiceCredentialAccess,
		findApplicationById: vi.fn(async () => ({
			applicationId: "app-1",
			appName: "example-app",
		})),
	};
});

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { applicationRouter } = await import("@/server/api/routers/application");

const caller = applicationRouter.createCaller({
	session: { userId: "user-1", activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof applicationRouter.createCaller>[0]);

const registries: Record<string, { organizationId: string }> = {
	"own-registry": { organizationId: "org-1" },
	"foreign-registry": { organizationId: "org-2" },
};

const saveDockerProvider = (dockerRegistryId?: string | null) =>
	caller.saveDockerProvider({
		applicationId: "app-1",
		dockerImage: "ghcr.io/team/app:latest",
		username: null,
		password: null,
		registryUrl: null,
		...(dockerRegistryId !== undefined && { dockerRegistryId }),
	});

const update = (dockerRegistryId: string | null) =>
	caller.update({ applicationId: "app-1", dockerRegistryId });

describe.each([
	{ name: "saveDockerProvider", save: saveDockerProvider },
	{ name: "update", save: update },
])("$name with dockerRegistryId", ({ save }) => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.updateApplication.mockResolvedValue({
			applicationId: "app-1",
			appName: "example-app",
		});
		mocks.findRegistryById.mockImplementation(
			async (id: string) => registries[id],
		);
	});

	it("saves a registry from the active organization", async () => {
		await save("own-registry");

		expect(mocks.findRegistryById).toHaveBeenCalledWith("own-registry");
		expect(mocks.updateApplication).toHaveBeenCalledWith(
			"app-1",
			expect.objectContaining({ dockerRegistryId: "own-registry" }),
		);
	});

	it("rejects another organization's registry before saving", async () => {
		await expect(save("foreign-registry")).rejects.toThrow(
			"You are not authorized to use this credential",
		);
		expect(mocks.updateApplication).not.toHaveBeenCalled();
	});

	it("clears the selection", async () => {
		await save(null);

		expect(mocks.findRegistryById).not.toHaveBeenCalled();
		expect(mocks.updateApplication).toHaveBeenCalledWith(
			"app-1",
			expect.objectContaining({ dockerRegistryId: null }),
		);
	});
});

describe("saveDockerProvider without dockerRegistryId", () => {
	it("keeps the saved registry", async () => {
		vi.clearAllMocks();
		await saveDockerProvider();

		const [, saved] = mocks.updateApplication.mock.calls[0] ?? [];
		expect(saved).not.toHaveProperty("dockerRegistryId");
	});
});
