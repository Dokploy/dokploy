import type { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

const { assertServiceEnvironmentReadAccess } = await import(
	"../../server/api/utils/service-environment"
);

const createContext = (organizationId = "org-1") =>
	({
		session: {
			activeOrganizationId: organizationId,
		},
	}) as never;

const service = (organizationId = "org-1") => ({
	env: "TOKEN=secret",
	environment: {
		project: {
			organizationId,
		},
	},
});

describe("service environment reveal access", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	});

	it("requires envVars read permission and returns the service in the active organization", async () => {
		const result = await assertServiceEnvironmentReadAccess(
			createContext(),
			"service-1",
			async () => service(),
			"service",
		);

		expect(result.env).toBe("TOKEN=secret");
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"service-1",
			{
				envVars: ["read"],
			},
		);
	});

	it("rejects reveal when the service belongs to another organization", async () => {
		await expect(
			assertServiceEnvironmentReadAccess(
				createContext("org-1"),
				"service-1",
				async () => service("org-2"),
				"service",
			),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		} satisfies Partial<TRPCError>);
	});
});
