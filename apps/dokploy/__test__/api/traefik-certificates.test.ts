import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDockerResourceType: vi.fn(),
	findRemovableTraefikCertificates: vi.fn(),
	getUnusedTraefikCertificates: vi.fn(),
	removeTraefikCertificates: vi.fn(),
	queueTraefikTask: vi.fn(),
	reloadDockerResource: vi.fn(),
}));

const noop = vi.fn();

vi.mock("@dokploy/server", () => ({
	CLEANUP_CRON_JOB: "0 0 * * *",
	DEFAULT_UPDATE_DATA: { latestVersion: null, updateAvailable: false },
	IS_CLOUD: false,
	findServerById: async () => ({ organizationId: "org-1" }),
	findRemovableTraefikCertificates: mocks.findRemovableTraefikCertificates,
	getDockerResourceType: mocks.getDockerResourceType,
	getDokployImageTag: () => "canary",
	getUnusedTraefikCertificates: mocks.getUnusedTraefikCertificates,
	paths: () => ({
		MAIN_TRAEFIK_PATH: "/tmp",
		LOGS_PATH: "/tmp",
		MONITORING_PATH: "/tmp",
		DYNAMIC_TRAEFIK_PATH: "/tmp",
	}),
	queueTraefikTask: mocks.queueTraefikTask,
	reloadDockerResource: mocks.reloadDockerResource,
	removeTraefikCertificates: mocks.removeTraefikCertificates,
	setupGPUSupport: noop,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/root", () => ({
	appRouter: {},
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
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof settingsRouter.createCaller>[0]);

const certificate = (main: string) => ({
	id: `id-${main}`,
	resolver: "letsencrypt",
	main,
	sans: [],
	expiresAt: null,
});

const lastResult = async (serverId: string) => {
	await vi.waitFor(async () => {
		expect(
			(await caller.getUnusedTraefikCertificates({ serverId })).isRemoving,
		).toBe(false);
	});
	return caller.getUnusedTraefikCertificates({ serverId });
};

describe("settings Traefik certificate cleanup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDockerResourceType.mockResolvedValue("standalone");
		mocks.getUnusedTraefikCertificates.mockResolvedValue({
			certificates: [],
			routesComplete: true,
		});
		mocks.removeTraefikCertificates.mockResolvedValue(1);
	});

	it("rejects a second removal while the first is still being checked", async () => {
		let release = () => {};
		mocks.findRemovableTraefikCertificates.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = () =>
						resolve({
							targets: [certificate("old.example.com")],
							routesComplete: true,
						});
				}),
		);

		const first = caller.removeUnusedTraefikCertificates({
			serverId: "server-a",
			certificateIds: ["id-old.example.com"],
		});
		await vi.waitFor(() =>
			expect(mocks.findRemovableTraefikCertificates).toHaveBeenCalled(),
		);
		const second = caller.removeUnusedTraefikCertificates({
			serverId: "server-a",
			certificateIds: ["id-old.example.com"],
		});

		await expect(second).rejects.toMatchObject({ code: "CONFLICT" });
		release();
		await expect(first).resolves.toEqual({ count: 1 });
		await lastResult("server-a");
		expect(mocks.removeTraefikCertificates).toHaveBeenCalledTimes(1);
	});

	it("frees the server again when the selection check fails", async () => {
		mocks.getDockerResourceType.mockResolvedValueOnce("service");

		await expect(
			caller.removeUnusedTraefikCertificates({
				serverId: "server-b",
				certificateIds: ["id-old.example.com"],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		mocks.findRemovableTraefikCertificates.mockResolvedValueOnce({
			targets: [],
			routesComplete: true,
		});
		await expect(
			caller.removeUnusedTraefikCertificates({
				serverId: "server-b",
				certificateIds: ["id-old.example.com"],
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("in use again"),
		});
		expect((await lastResult("server-b")).isRemoving).toBe(false);
	});

	it("reports how many certificates were actually removed", async () => {
		mocks.findRemovableTraefikCertificates.mockResolvedValueOnce({
			targets: [certificate("a.example.com"), certificate("b.example.com")],
			routesComplete: false,
		});
		mocks.removeTraefikCertificates.mockResolvedValueOnce(1);

		await expect(
			caller.removeUnusedTraefikCertificates({
				serverId: "server-c",
				certificateIds: ["id-a.example.com", "id-b.example.com"],
			}),
		).resolves.toEqual({ count: 2 });

		const result = await lastResult("server-c");
		expect(result.lastRemovedCount).toBe(1);
		expect(result.lastRemoveError).toBeNull();
		expect(mocks.removeTraefikCertificates).toHaveBeenCalledWith(
			"server-c",
			["id-a.example.com", "id-b.example.com"],
			{ requireRoutes: false },
		);
	});

	it("keeps the audit entry short for a large cleanup", async () => {
		const mains = [1, 2, 3, 4, 5, 6, 7].map((n) => `old${n}.example.com`);
		mocks.findRemovableTraefikCertificates.mockResolvedValueOnce({
			targets: mains.map(certificate),
			routesComplete: true,
		});
		const { audit } = await import("@/server/api/utils/audit");

		await caller.removeUnusedTraefikCertificates({
			serverId: "server-f",
			certificateIds: mains.map((main) => `id-${main}`),
		});
		await lastResult("server-f");

		expect(audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "delete",
				resourceType: "certificate",
				resourceName:
					"old1.example.com, old2.example.com, old3.example.com, old4.example.com, old5.example.com and 2 more",
			}),
		);
	});

	it("keeps the error when the removal fails", async () => {
		mocks.findRemovableTraefikCertificates.mockResolvedValueOnce({
			targets: [certificate("a.example.com")],
			routesComplete: true,
		});
		mocks.removeTraefikCertificates.mockRejectedValueOnce(
			new Error("Couldn't write acme.json: disk full"),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await caller.removeUnusedTraefikCertificates({
			serverId: "server-d",
			certificateIds: ["id-a.example.com"],
		});

		const result = await lastResult("server-d");
		expect(result.lastRemoveError).toBe("Couldn't write acme.json: disk full");
		expect(result.lastRemovedCount).toBeNull();
	});

	it("reloads Traefik through the same queue as certificate cleanup", async () => {
		mocks.queueTraefikTask.mockImplementation(
			async (_serverId: string | undefined, task: () => Promise<void>) =>
				task(),
		);

		await caller.reloadTraefik({ serverId: "server-e" });

		await vi.waitFor(() =>
			expect(mocks.reloadDockerResource).toHaveBeenCalledWith(
				"dokploy-traefik",
				"server-e",
			),
		);
		expect(mocks.queueTraefikTask).toHaveBeenCalledWith(
			"server-e",
			expect.any(Function),
		);
	});
});
