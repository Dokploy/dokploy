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
	IS_CLOUD: false,
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
	user: { id: "user-1", email: "admin@example.com", role: "admin" },
} as Parameters<typeof settingsRouter.createCaller>[0]);

const TRAEFIK_ENV = [
	"CF_DNS_API_TOKEN=abc#def",
	'QUOTED="kept"',
	"MULTI=line1\nline2",
	"LITERAL=${{not-a-ref}}",
];

const overview = (versionStatus: string) => ({
	state: "running",
	startedAt: "2026-10-23T03:00:00Z",
	image: "traefik:v3.6.25",
	currentVersion: "3.6.25",
	recommendedVersion: "3.7.16",
	versionStatus,
});

describe("Traefik update endpoints", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findServerById.mockImplementation(async (serverId: string) => ({
			serverId,
			organizationId: serverId === "server-b" ? "org-b" : "org-a",
		}));
		mocks.getTraefikOverview.mockResolvedValue(overview("outdated"));
		mocks.pullTraefikImage.mockResolvedValue(undefined);
		mocks.readEnvironmentVariableList.mockResolvedValue(TRAEFIK_ENV);
		mocks.readPorts.mockResolvedValue([
			{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
		]);
		mocks.writeTraefikSetup.mockResolvedValue(undefined);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("rejects reading the overview of another organization's server", async () => {
		await expect(
			caller.getTraefikOverview({ serverId: "server-b" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.getTraefikOverview).not.toHaveBeenCalled();
	});

	it("rejects updating another organization's server", async () => {
		await expect(
			caller.updateTraefik({ serverId: "server-b" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.pullTraefikImage).not.toHaveBeenCalled();
		expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
	});

	it.each(["up-to-date", "newer", "unknown", "custom", "not-found"])(
		"refuses to recreate Traefik when it is %s",
		async (status) => {
			mocks.getTraefikOverview.mockResolvedValue(overview(status));

			await expect(caller.updateTraefik({})).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
			expect(mocks.pullTraefikImage).not.toHaveBeenCalled();
			expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
		},
	);

	it.each(["exited", "restarting", "stopped"])(
		"refuses to update a Traefik that is %s, which would drop its ports",
		async (state) => {
			mocks.getTraefikOverview.mockResolvedValue({
				...overview("outdated"),
				state,
				startedAt: null,
			});

			await expect(caller.updateTraefik({})).rejects.toMatchObject({
				code: "BAD_REQUEST",
				message: expect.stringContaining("Start it with Reload"),
			});
			expect(mocks.pullTraefikImage).not.toHaveBeenCalled();
			expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
		},
	);

	it("leaves the running Traefik alone when the pull fails", async () => {
		mocks.pullTraefikImage.mockRejectedValue(new Error("manifest unknown"));

		await expect(caller.updateTraefik({})).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("manifest unknown"),
		});
		expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
	});

	it("pulls the image, then recreates Traefik keeping env and ports", async () => {
		await expect(caller.updateTraefik({ serverId: "server-a" })).resolves.toBe(
			true,
		);

		expect(mocks.pullTraefikImage).toHaveBeenCalledWith("server-a");
		expect(mocks.writeTraefikSetup).toHaveBeenCalledWith({
			env: TRAEFIK_ENV,
			additionalPorts: [
				{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
			],
			serverId: "server-a",
		});
		expect(mocks.pullTraefikImage.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.writeTraefikSetup.mock.invocationCallOrder[0]!,
		);
	});

	it("reads env and ports before the download, while Traefik is still running", async () => {
		await caller.updateTraefik({ serverId: "server-a" });

		const pulledAt = mocks.pullTraefikImage.mock.invocationCallOrder[0]!;
		expect(
			mocks.readEnvironmentVariableList.mock.invocationCallOrder[0],
		).toBeLessThan(pulledAt);
		expect(mocks.readPorts.mock.invocationCallOrder[0]).toBeLessThan(pulledAt);
	});

	it("reports why the background update failed, and clears it on the next attempt", async () => {
		mocks.writeTraefikSetup.mockRejectedValueOnce(
			new Error(
				"port is already allocated. The previous Traefik was restored.",
			),
		);

		await caller.updateTraefik({ serverId: "server-a" });
		await vi.waitFor(async () =>
			expect(
				await caller.getTraefikOverview({ serverId: "server-a" }),
			).toMatchObject({
				isUpdating: false,
				lastUpdateError:
					"port is already allocated. The previous Traefik was restored.",
			}),
		);

		let finishRecreate: () => void = () => {};
		mocks.writeTraefikSetup.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finishRecreate = resolve;
			}),
		);
		await caller.updateTraefik({ serverId: "server-a" });
		await expect(
			caller.getTraefikOverview({ serverId: "server-a" }),
		).resolves.toMatchObject({ isUpdating: true, lastUpdateError: null });
		finishRecreate();
		await vi.waitFor(async () =>
			expect(
				(await caller.getTraefikOverview({ serverId: "server-a" })).isUpdating,
			).toBe(false),
		);
	});

	it("keeps errors per server", async () => {
		mocks.writeTraefikSetup.mockRejectedValueOnce(new Error("broken"));

		await caller.updateTraefik({ serverId: "server-a" });
		await vi.waitFor(async () =>
			expect(
				(await caller.getTraefikOverview({ serverId: "server-a" }))
					.lastUpdateError,
			).toBe("broken"),
		);

		await expect(
			caller.getTraefikOverview({ serverId: "server-c" }),
		).resolves.toMatchObject({ lastUpdateError: null });
	});

	it("allows one update per server at a time", async () => {
		let finishRecreate: () => void = () => {};
		mocks.writeTraefikSetup.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finishRecreate = resolve;
			}),
		);

		await expect(caller.updateTraefik({ serverId: "server-a" })).resolves.toBe(
			true,
		);
		await expect(
			caller.getTraefikOverview({ serverId: "server-a" }),
		).resolves.toMatchObject({ isUpdating: true });
		await expect(
			caller.updateTraefik({ serverId: "server-a" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(caller.updateTraefik({ serverId: "server-c" })).resolves.toBe(
			true,
		);

		finishRecreate();
		await vi.waitFor(async () =>
			expect(await caller.updateTraefik({ serverId: "server-a" })).toBe(true),
		);
	});

	it("releases the lock when the update fails before recreating", async () => {
		mocks.pullTraefikImage.mockRejectedValueOnce(new Error("timeout"));

		await expect(caller.updateTraefik({})).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		await expect(caller.updateTraefik({})).resolves.toBe(true);
	});

	it("does not let an expired update release a newer update's lock", async () => {
		vi.useFakeTimers();
		try {
			let finishFirst: () => void = () => {};
			let finishSecond: () => void = () => {};
			mocks.writeTraefikSetup
				.mockReturnValueOnce(
					new Promise<void>((resolve) => {
						finishFirst = resolve;
					}),
				)
				.mockReturnValueOnce(
					new Promise<void>((resolve) => {
						finishSecond = resolve;
					}),
				);

			await caller.updateTraefik({ serverId: "server-a" });
			await vi.advanceTimersByTimeAsync(5 * 60_000);
			await caller.updateTraefik({ serverId: "server-a" });

			finishFirst();
			await vi.advanceTimersByTimeAsync(0);
			await expect(
				caller.updateTraefik({ serverId: "server-a" }),
			).rejects.toMatchObject({ code: "CONFLICT" });

			finishSecond();
			await vi.advanceTimersByTimeAsync(0);
			await expect(
				caller.getTraefikOverview({ serverId: "server-a" }),
			).resolves.toMatchObject({ isUpdating: false });
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not let an expired update's failure overwrite a newer update", async () => {
		vi.useFakeTimers();
		try {
			let failFirst: (error: Error) => void = () => {};
			let finishSecond: () => void = () => {};
			mocks.writeTraefikSetup
				.mockReturnValueOnce(
					new Promise<void>((_, reject) => {
						failFirst = reject;
					}),
				)
				.mockReturnValueOnce(
					new Promise<void>((resolve) => {
						finishSecond = resolve;
					}),
				);

			await caller.updateTraefik({ serverId: "server-a" });
			await vi.advanceTimersByTimeAsync(5 * 60_000);
			await caller.updateTraefik({ serverId: "server-a" });

			failFirst(new Error("old failure"));
			await vi.advanceTimersByTimeAsync(0);
			finishSecond();
			await vi.advanceTimersByTimeAsync(0);

			await expect(
				caller.getTraefikOverview({ serverId: "server-a" }),
			).resolves.toMatchObject({ isUpdating: false, lastUpdateError: null });
		} finally {
			vi.useRealTimers();
		}
	});

	it("is limited to owners and admins", async () => {
		const memberCaller = settingsRouter.createCaller({
			session: { activeOrganizationId: "org-a" },
			user: { id: "user-2", email: "member@example.com", role: "member" },
		} as Parameters<typeof settingsRouter.createCaller>[0]);

		await expect(
			memberCaller.getTraefikOverview({ serverId: "server-a" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(
			memberCaller.updateTraefik({ serverId: "server-a" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.getTraefikOverview).not.toHaveBeenCalled();
	});
});
