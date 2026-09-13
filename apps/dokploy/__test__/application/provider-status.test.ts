import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateApplication = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/permission", () => {
	return {
		checkServicePermissionAndAccess: vi.fn(async () => undefined),
	};
});

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: true,
	hasValidLicense: vi.fn(async () => false),
	updateApplication: mockUpdateApplication,
	findApplicationById: vi.fn(async () => ({
		applicationId: "app-1",
		appName: "example-app",
	})),
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

describe("saving an application provider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each(["done", "running"])(
		"keeps the %s application status when GitHub settings change",
		async (status) => {
			let savedStatus = status;
			mockUpdateApplication.mockImplementation(async (_id, update) => {
				if (update.applicationStatus !== undefined) {
					savedStatus = update.applicationStatus;
				}
			});

			await caller.saveGithubProvider({
				applicationId: "app-1",
				repository: "example-repo",
				owner: "example-owner",
				branch: "main",
				buildPath: "/",
				githubId: "provider-1",
				watchPaths: ["src/**"],
				triggerType: "push",
				enableSubmodules: false,
			});

			expect(savedStatus).toBe(status);
			expect(mockUpdateApplication).toHaveBeenCalledWith(
				"app-1",
				expect.objectContaining({
					watchPaths: ["src/**"],
					sourceType: "github",
				}),
			);
		},
	);
});
