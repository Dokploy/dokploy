import { LIBREDB_STUDIO_DEFAULT_IMAGE } from "@dokploy/server/utils/libredb-studio/constants";
import type { StudioDatabase } from "@dokploy/server/utils/libredb-studio/seed";
import type { LibreDBStudioScope } from "@dokploy/server/utils/libredb-studio/sync";
import { TRPCError } from "@trpc/server";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
	studioFindFirst: vi.fn(),
	studioFindMany: vi.fn(),
	serverFindMany: vi.fn(),
	insertValues: vi.fn(),
	insertReturning: vi.fn(),
	updateSet: vi.fn(),
	updateReturning: vi.fn(),
	runLibreDBStudioSync: vi.fn(),
	loadLibreDBStudioScope: vi.fn(),
	findApplicationById: vi.fn(),
	updateApplication: vi.fn(),
	mechanizeDockerContainer: vi.fn(),
	applicationFindFirst: vi.fn(),
	getRemoteDocker: vi.fn(),
	getService: vi.fn(),
	serviceRemove: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => {
	const selectChain = {
		from: () => selectChain,
		where: () => selectChain,
	};
	return {
		db: {
			query: {
				libredbStudio: {
					findFirst: mocks.studioFindFirst,
					findMany: mocks.studioFindMany,
				},
				server: { findMany: mocks.serverFindMany },
				applications: { findFirst: mocks.applicationFindFirst },
			},
			select: vi.fn(() => selectChain),
			insert: vi.fn(() => ({
				values: (values: Record<string, unknown>) => {
					mocks.insertValues(values);
					return { returning: mocks.insertReturning };
				},
			})),
			update: vi.fn(() => ({
				set: (values: Record<string, unknown>) => {
					mocks.updateSet(values);
					return {
						where: () =>
							Object.assign(Promise.resolve(undefined), {
								returning: mocks.updateReturning,
							}),
					};
				},
			})),
		},
	};
});

vi.mock("@dokploy/server/utils/libredb-studio/sync", () => ({
	runLibreDBStudioSync: mocks.runLibreDBStudioSync,
	loadLibreDBStudioScope: mocks.loadLibreDBStudioScope,
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
	updateApplication: mocks.updateApplication,
}));

vi.mock("@dokploy/server/utils/builders", () => ({
	mechanizeDockerContainer: mocks.mechanizeDockerContainer,
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const {
	createLibreDBStudio,
	findLibreDBStudioById,
	findLibreDBStudiosByScope,
	getLibreDBStudioUrl,
	getLibreDBStudioView,
	reconcileLibreDBStudios,
	scheduleLibreDBStudioSync,
	syncLibreDBStudio,
	updateLibreDBStudio,
	withLibreDBStudioScopeLock,
} = await import("@dokploy/server/services/libredb-studio");

const secrets = {
	launchSecret: "test-launch-secret-of-studio-1",
	jwtSecret: "test-jwt-secret-of-studio-1",
	adminPassword: "test-admin-password-of-studio-1",
};

const database = (overrides: Partial<StudioDatabase> = {}): StudioDatabase => ({
	kind: "postgres",
	id: "pg-1",
	name: "Orders DB",
	appName: "demo-shop-orders-db-e6qmrw",
	serverId: null,
	databaseName: "orders",
	databaseUser: "orders",
	databasePassword: "orders-pass",
	databaseRootPassword: null,
	sqldNode: null,
	networkIds: [],
	detachDokployNetwork: false,
	hasNetworkSwarm: false,
	applicationStatus: "done",
	...overrides,
});

const scope = (overrides: {
	requiredNetworkIds?: string[];
	applicationNetworkIds?: string[];
	covered?: StudioDatabase[];
	excluded?: LibreDBStudioScope["coverage"]["excluded"];
}): LibreDBStudioScope => ({
	studio: {
		libredbStudioId: "studio-1",
		applicationId: "app-1",
		allowCustomConnections: false,
		seedHash: null,
		lastSyncedAt: null,
		lastSyncError: null,
		...secrets,
		createdAt: "2026-10-03T00:00:00.000Z",
	},
	application: {
		applicationId: "app-1",
		appName: "demo-shop-libredb-studio-x1y2z3",
		name: "LibreDB Studio",
		serverId: null,
		environmentId: "env-1",
		networkIds: overrides.applicationNetworkIds ?? [],
	},
	labels: { projectName: "Demo Shop", environmentName: "production" },
	databases: [],
	coverage: {
		covered: overrides.covered ?? [],
		excluded: overrides.excluded ?? [],
		requiredNetworkIds: overrides.requiredNetworkIds ?? [],
	},
});

const studioWithApplication = (
	overrides: {
		libredbStudioId?: string;
		serverId?: string | null;
		env?: string | null;
		domains?: {
			host: string;
			https: boolean;
			path: string | null;
			domainType: "application" | "compose" | "preview" | null;
			enabled: boolean;
		}[];
		dockerImage?: string | null;
	} = {},
) => ({
	libredbStudioId: overrides.libredbStudioId ?? "studio-1",
	applicationId: "app-1",
	allowCustomConnections: true,
	seedHash: "abc",
	lastSyncedAt: "2026-10-03T10:00:00.000Z",
	lastSyncError: null,
	...secrets,
	createdAt: "2026-10-03T00:00:00.000Z",
	application: {
		applicationId: "app-1",
		name: "LibreDB Studio",
		appName: "demo-shop-libredb-studio-x1y2z3",
		environmentId: "env-1",
		serverId: overrides.serverId ?? null,
		applicationStatus: "done",
		dockerImage:
			overrides.dockerImage === undefined
				? LIBREDB_STUDIO_DEFAULT_IMAGE
				: overrides.dockerImage,
		env: overrides.env ?? null,
		environment: { projectId: "project-1", project: { name: "Demo Shop" } },
		server: overrides.serverId ? { name: "Edge box" } : null,
		domains: overrides.domains ?? [
			{
				host: "studio.example.com",
				https: true,
				path: "/",
				domainType: "application",
				enabled: true,
			},
		],
	},
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	mocks.updateApplication.mockResolvedValue(undefined);
	mocks.mechanizeDockerContainer.mockResolvedValue(undefined);
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "app-1",
		appName: "demo-shop-libredb-studio-x1y2z3",
		serverId: null,
		applicationStatus: "done",
	});
	mocks.applicationFindFirst.mockResolvedValue({ applicationId: "app-1" });
	mocks.serviceRemove.mockResolvedValue(undefined);
	mocks.getService.mockReturnValue({ remove: mocks.serviceRemove });
	mocks.getRemoteDocker.mockResolvedValue({ getService: mocks.getService });
	mocks.runLibreDBStudioSync.mockResolvedValue({
		changed: true,
		scope: scope({}),
	});
});

afterEach(() => {
	errorSpy.mockRestore();
	vi.useRealTimers();
});

describe("Studio lookups and rows", () => {
	it("throws NOT_FOUND for an unknown Studio", async () => {
		mocks.studioFindFirst.mockResolvedValue(undefined);

		await expect(findLibreDBStudioById("missing")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("keeps only the Studios that run on the scope's server", async () => {
		mocks.studioFindMany.mockResolvedValue([
			studioWithApplication({ libredbStudioId: "local", serverId: null }),
			studioWithApplication({
				libredbStudioId: "remote",
				serverId: "server-2",
			}),
		]);

		const local = await findLibreDBStudiosByScope({
			environmentId: "env-1",
			serverId: null,
		});
		const remote = await findLibreDBStudiosByScope({
			environmentId: "env-1",
			serverId: "server-2",
		});

		expect(local.map((studio) => studio.libredbStudioId)).toEqual(["local"]);
		expect(remote.map((studio) => studio.libredbStudioId)).toEqual(["remote"]);
	});

	it("creates the link row with its secrets and refuses to update an unknown one", async () => {
		const row = scope({}).studio;
		mocks.insertReturning.mockResolvedValue([row]);
		mocks.updateReturning.mockResolvedValue([]);

		await expect(
			createLibreDBStudio({ applicationId: "app-1", ...secrets }),
		).resolves.toEqual(row);
		expect(mocks.insertValues).toHaveBeenCalledWith({
			applicationId: "app-1",
			launchSecret: "test-launch-secret-of-studio-1",
			jwtSecret: "test-jwt-secret-of-studio-1",
			adminPassword: "test-admin-password-of-studio-1",
		});
		await expect(
			updateLibreDBStudio("missing", { allowCustomConnections: true }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("withLibreDBStudioScopeLock", () => {
	it("runs callers of one scope one after the other and releases on failure", async () => {
		const events: string[] = [];
		let releaseFirst: () => void = () => undefined;
		const scopeKey = { environmentId: "env-1", serverId: null };

		const first = withLibreDBStudioScopeLock(scopeKey, async () => {
			events.push("first-start");
			await new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
			events.push("first-end");
			throw new Error("install failed");
		});
		const second = withLibreDBStudioScopeLock(scopeKey, async () => {
			events.push("second");
			return "second-result";
		});
		const otherScope = withLibreDBStudioScopeLock(
			{ environmentId: "env-1", serverId: "server-2" },
			async () => {
				events.push("other-scope");
				return "other";
			},
		);

		await expect(otherScope).resolves.toBe("other");
		expect(events).toEqual(["first-start", "other-scope"]);

		releaseFirst();
		await expect(first).rejects.toThrow("install failed");
		await expect(second).resolves.toBe("second-result");
		expect(events).toEqual([
			"first-start",
			"other-scope",
			"first-end",
			"second",
		]);
	});
});

describe("syncLibreDBStudio", () => {
	it("leaves the networks alone when the sets match in any order", async () => {
		mocks.runLibreDBStudioSync.mockResolvedValue({
			changed: false,
			scope: scope({
				requiredNetworkIds: ["net-a", "net-b"],
				applicationNetworkIds: ["net-b", "net-a"],
			}),
		});

		await expect(syncLibreDBStudio("studio-1")).resolves.toEqual({
			changed: false,
			networksChanged: false,
		});
		expect(mocks.findApplicationById).not.toHaveBeenCalled();
		expect(mocks.updateApplication).not.toHaveBeenCalled();
		expect(mocks.mechanizeDockerContainer).not.toHaveBeenCalled();
	});

	it("re-applies a running Studio with the required networks, then stores them", async () => {
		mocks.runLibreDBStudioSync.mockResolvedValue({
			changed: true,
			scope: scope({
				requiredNetworkIds: ["net-a", "net-b"],
				applicationNetworkIds: ["net-a"],
			}),
		});

		await expect(
			syncLibreDBStudio("studio-1", { force: true }),
		).resolves.toEqual({ changed: true, networksChanged: true });
		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledWith("studio-1", {
			force: true,
		});
		expect(mocks.mechanizeDockerContainer).toHaveBeenCalledWith({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
			applicationStatus: "done",
			networkIds: ["net-a", "net-b"],
		});
		expect(mocks.updateApplication).toHaveBeenCalledWith("app-1", {
			networkIds: ["net-a", "net-b"],
		});
		expect(
			mocks.mechanizeDockerContainer.mock.invocationCallOrder[0],
		).toBeLessThan(mocks.updateApplication.mock.invocationCallOrder[0] ?? 0);
		expect(mocks.serviceRemove).not.toHaveBeenCalled();
	});

	it.each(["idle", "error"] as const)(
		"leaves the networks of a Studio whose status is %s to a later sync",
		async (applicationStatus) => {
			mocks.runLibreDBStudioSync.mockResolvedValue({
				changed: true,
				scope: scope({ requiredNetworkIds: ["net-a"] }),
			});
			mocks.findApplicationById.mockResolvedValue({
				applicationId: "app-1",
				appName: "demo-shop-libredb-studio-x1y2z3",
				serverId: null,
				applicationStatus,
			});

			await expect(syncLibreDBStudio("studio-1")).resolves.toEqual({
				changed: true,
				networksChanged: false,
			});
			expect(mocks.updateApplication).not.toHaveBeenCalled();
			expect(mocks.mechanizeDockerContainer).not.toHaveBeenCalled();
		},
	);

	it("re-applies the networks on a later sync once a stopped Studio runs again", async () => {
		mocks.runLibreDBStudioSync.mockResolvedValue({
			changed: false,
			scope: scope({ requiredNetworkIds: ["net-a"] }),
		});
		mocks.findApplicationById.mockResolvedValueOnce({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
			applicationStatus: "idle",
		});

		await expect(syncLibreDBStudio("studio-1")).resolves.toEqual({
			changed: false,
			networksChanged: false,
		});
		expect(mocks.updateApplication).not.toHaveBeenCalled();

		await expect(syncLibreDBStudio("studio-1")).resolves.toEqual({
			changed: false,
			networksChanged: true,
		});
		expect(mocks.mechanizeDockerContainer).toHaveBeenCalledTimes(1);
		expect(mocks.mechanizeDockerContainer).toHaveBeenCalledWith({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
			applicationStatus: "done",
			networkIds: ["net-a"],
		});
		expect(mocks.updateApplication).toHaveBeenCalledTimes(1);
		expect(mocks.updateApplication).toHaveBeenCalledWith("app-1", {
			networkIds: ["net-a"],
		});
		expect(
			mocks.mechanizeDockerContainer.mock.invocationCallOrder[0],
		).toBeLessThan(mocks.updateApplication.mock.invocationCallOrder[0] ?? 0);
	});

	it("leaves the networks to a later sync while a deploy is in progress", async () => {
		mocks.runLibreDBStudioSync.mockResolvedValue({
			changed: true,
			scope: scope({ requiredNetworkIds: ["net-a"] }),
		});
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
			applicationStatus: "running",
		});

		await expect(syncLibreDBStudio("studio-1")).resolves.toEqual({
			changed: true,
			networksChanged: false,
		});
		expect(mocks.updateApplication).not.toHaveBeenCalled();
		expect(mocks.mechanizeDockerContainer).not.toHaveBeenCalled();
	});

	it("records a failed re-apply, keeps the stored networks and rethrows", async () => {
		mocks.runLibreDBStudioSync.mockResolvedValue({
			changed: true,
			scope: scope({ requiredNetworkIds: ["net-a"] }),
		});
		mocks.mechanizeDockerContainer.mockRejectedValue(new Error("swarm down"));

		await expect(syncLibreDBStudio("studio-1")).rejects.toThrow("swarm down");
		expect(mocks.updateApplication).not.toHaveBeenCalled();
		expect(mocks.updateSet).toHaveBeenCalledWith({
			lastSyncError: "Updating the Studio networks failed: swarm down",
		});
		expect(mocks.serviceRemove).not.toHaveBeenCalled();
	});

	it("removes the service a re-apply brought back for a deleted Studio and rejects with NOT_FOUND", async () => {
		mocks.runLibreDBStudioSync.mockResolvedValue({
			changed: true,
			scope: scope({ requiredNetworkIds: ["net-a"] }),
		});
		mocks.applicationFindFirst.mockResolvedValue(undefined);

		const error = await syncLibreDBStudio("studio-1").catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error).toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.getRemoteDocker).toHaveBeenCalledWith(null);
		expect(mocks.getService).toHaveBeenCalledWith(
			"demo-shop-libredb-studio-x1y2z3",
		);
		expect(mocks.serviceRemove.mock.invocationCallOrder[0]).toBeGreaterThan(
			mocks.mechanizeDockerContainer.mock.invocationCallOrder[0] ?? 0,
		);
		expect(mocks.updateSet).not.toHaveBeenCalled();
	});

	it("rethrows when the service of a deleted Studio cannot be removed", async () => {
		mocks.runLibreDBStudioSync.mockResolvedValue({
			changed: true,
			scope: scope({ requiredNetworkIds: ["net-a"] }),
		});
		mocks.applicationFindFirst.mockResolvedValue(undefined);
		mocks.serviceRemove.mockRejectedValue(
			Object.assign(new Error("ssh down"), { statusCode: 500 }),
		);

		await expect(syncLibreDBStudio("studio-1")).rejects.toThrow("ssh down");
		expect(mocks.updateSet).not.toHaveBeenCalled();
	});

	it("runs two syncs of one Studio one after the other", async () => {
		const events: string[] = [];
		let releaseFirst: () => void = () => undefined;
		mocks.runLibreDBStudioSync
			.mockImplementationOnce(async () => {
				events.push("first-start");
				await new Promise<void>((resolve) => {
					releaseFirst = resolve;
				});
				events.push("first-end");
				return { changed: true, scope: scope({}) };
			})
			.mockImplementationOnce(async () => {
				events.push("second");
				return { changed: false, scope: scope({}) };
			});

		const first = syncLibreDBStudio("studio-1");
		const second = syncLibreDBStudio("studio-1");
		await vi.waitFor(() => expect(events).toEqual(["first-start"]));

		releaseFirst();
		await Promise.all([first, second]);

		expect(events).toEqual(["first-start", "first-end", "second"]);
	});
});

describe("scheduleLibreDBStudioSync", () => {
	const scopeKey = { environmentId: "env-1", serverId: null };

	beforeEach(() => {
		vi.useFakeTimers();
		mocks.studioFindMany.mockResolvedValue([
			studioWithApplication({ libredbStudioId: "studio-1" }),
		]);
	});

	it("debounces requests for one scope into a single run after one second", async () => {
		scheduleLibreDBStudioSync(scopeKey);
		scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(500);
		scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(999);

		expect(mocks.studioFindMany).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(1),
		);
		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledWith("studio-1", {});
		expect(mocks.studioFindMany).toHaveBeenCalledTimes(1);
	});

	it("runs exactly once more when requests arrive during a run", async () => {
		let releaseFirst: () => void = () => undefined;
		mocks.runLibreDBStudioSync
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						releaseFirst = () => resolve({ changed: true, scope: scope({}) });
					}),
			)
			.mockResolvedValue({ changed: false, scope: scope({}) });

		scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(1),
		);

		scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(1000);
		scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(1000);
		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(1);

		releaseFirst();
		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(2),
		);
		await vi.advanceTimersByTimeAsync(5000);
		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(2);
	});

	it("logs a failed sync and still syncs the other Studios of the scope", async () => {
		mocks.studioFindMany.mockResolvedValue([
			studioWithApplication({ libredbStudioId: "studio-1" }),
			studioWithApplication({ libredbStudioId: "studio-2" }),
		]);
		mocks.runLibreDBStudioSync
			.mockRejectedValueOnce(new Error("ssh down"))
			.mockResolvedValueOnce({ changed: true, scope: scope({}) });

		expect(() => scheduleLibreDBStudioSync(scopeKey)).not.toThrow();
		await vi.advanceTimersByTimeAsync(1000);

		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(2),
		);
		expect(mocks.runLibreDBStudioSync).toHaveBeenLastCalledWith("studio-2", {});
		expect(errorSpy).toHaveBeenCalledWith(
			"[libredb-studio] Seed sync failed for Studio studio-1:",
			expect.objectContaining({ message: "ssh down" }),
		);
	});

	it("does nothing when the Studio was deleted before the timer fired", async () => {
		mocks.studioFindMany.mockResolvedValue([]);

		expect(() => scheduleLibreDBStudioSync(scopeKey)).not.toThrow();
		await vi.advanceTimersByTimeAsync(1000);
		await vi.waitFor(() =>
			expect(mocks.studioFindMany).toHaveBeenCalledTimes(1),
		);
		await vi.advanceTimersByTimeAsync(5000);

		expect(mocks.runLibreDBStudioSync).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	// The second Studio of the scope syncs only after the first one has been
	// handled, so waiting for it proves that nothing was logged for the first.
	it("stays quiet when a Studio was deleted before its sync ran", async () => {
		mocks.studioFindMany.mockResolvedValue([
			studioWithApplication({ libredbStudioId: "studio-1" }),
			studioWithApplication({ libredbStudioId: "studio-2" }),
		]);
		mocks.runLibreDBStudioSync
			.mockRejectedValueOnce(
				new TRPCError({
					code: "NOT_FOUND",
					message: "LibreDB Studio not found",
				}),
			)
			.mockResolvedValueOnce({ changed: false, scope: scope({}) });

		expect(() => scheduleLibreDBStudioSync(scopeKey)).not.toThrow();
		await vi.advanceTimersByTimeAsync(1000);

		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(2),
		);
		expect(mocks.runLibreDBStudioSync).toHaveBeenLastCalledWith("studio-2", {});
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("stays quiet when a Studio is deleted while its networks are re-applied", async () => {
		mocks.studioFindMany.mockResolvedValue([
			studioWithApplication({ libredbStudioId: "studio-1" }),
			studioWithApplication({ libredbStudioId: "studio-2" }),
		]);
		mocks.runLibreDBStudioSync
			.mockResolvedValueOnce({
				changed: true,
				scope: scope({ requiredNetworkIds: ["net-a"] }),
			})
			.mockResolvedValueOnce({ changed: false, scope: scope({}) });
		mocks.mechanizeDockerContainer.mockRejectedValue(
			new Error("LibreDB Studio seed sync failed: LibreDB Studio not found"),
		);
		mocks.applicationFindFirst.mockResolvedValue(undefined);
		mocks.serviceRemove.mockRejectedValue(
			Object.assign(new Error("service not found"), { statusCode: 404 }),
		);

		expect(() => scheduleLibreDBStudioSync(scopeKey)).not.toThrow();
		await vi.advanceTimersByTimeAsync(1000);

		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(2),
		);
		expect(mocks.serviceRemove).toHaveBeenCalledTimes(1);
		expect(mocks.updateApplication).not.toHaveBeenCalled();
		expect(mocks.updateSet).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("logs a failure to list the Studios of the scope", async () => {
		mocks.studioFindMany.mockRejectedValue(new Error("database down"));

		scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(1000);

		await vi.waitFor(() =>
			expect(errorSpy).toHaveBeenCalledWith(
				"[libredb-studio] Could not list the Studios of environment env-1:",
				expect.objectContaining({ message: "database down" }),
			),
		);
		expect(mocks.runLibreDBStudioSync).not.toHaveBeenCalled();
	});

	it("logs instead of throwing when the timer cannot be scheduled", () => {
		const timerSpy = vi
			.spyOn(globalThis, "setTimeout")
			.mockImplementation(() => {
				throw new Error("no timers");
			});

		expect(() => scheduleLibreDBStudioSync(scopeKey)).not.toThrow();
		expect(errorSpy).toHaveBeenCalledWith(
			"[libredb-studio] Could not schedule a seed sync:",
			expect.objectContaining({ message: "no timers" }),
		);
		timerSpy.mockRestore();
	});
});

describe("reconcileLibreDBStudios", () => {
	it("syncs every Studio, logs the ones that fail and skips deleted ones quietly", async () => {
		mocks.studioFindMany.mockResolvedValue([
			{ libredbStudioId: "studio-1" },
			{ libredbStudioId: "studio-2" },
			{ libredbStudioId: "studio-3" },
		]);
		mocks.runLibreDBStudioSync
			.mockRejectedValueOnce(new Error("disk full"))
			.mockRejectedValueOnce(
				new TRPCError({
					code: "NOT_FOUND",
					message: "LibreDB Studio not found",
				}),
			)
			.mockResolvedValueOnce({ changed: false, scope: scope({}) });

		await expect(reconcileLibreDBStudios()).resolves.toBeUndefined();

		expect(mocks.runLibreDBStudioSync).toHaveBeenNthCalledWith(
			1,
			"studio-1",
			{},
		);
		expect(mocks.runLibreDBStudioSync).toHaveBeenNthCalledWith(
			2,
			"studio-2",
			{},
		);
		expect(mocks.runLibreDBStudioSync).toHaveBeenNthCalledWith(
			3,
			"studio-3",
			{},
		);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith(
			"[libredb-studio] Seed sync failed for Studio studio-1:",
			expect.objectContaining({ message: "disk full" }),
		);
	});
});

describe("getLibreDBStudioUrl", () => {
	const domain = (overrides: {
		host: string;
		https?: boolean;
		path?: string | null;
		domainType?: string | null;
		enabled?: boolean;
	}) => ({ https: false, path: "/", domainType: "application", ...overrides });

	it("prefers the first HTTPS domain", () => {
		expect(
			getLibreDBStudioUrl([
				domain({ host: "plain.example.com" }),
				domain({ host: "secure.example.com", https: true }),
			]),
		).toEqual({ url: "https://secure.example.com", https: true });
	});

	it("has no launch URL when the only enabled domain serves a path", () => {
		expect(
			getLibreDBStudioUrl([
				domain({ host: "studio.example.com", https: true, path: "/studio" }),
			]),
		).toBeNull();
	});

	it.each([null, "", "/"])(
		"chooses a domain with the root path %j over a path domain",
		(path) => {
			expect(
				getLibreDBStudioUrl([
					domain({ host: "secure.example.com", https: true, path: "/studio" }),
					domain({ host: "plain.example.com", path }),
				]),
			).toEqual({ url: "http://plain.example.com", https: false });
		},
	);

	it("falls back to the first domain and skips disabled or preview ones", () => {
		expect(
			getLibreDBStudioUrl([
				domain({ host: "off.example.com", https: true, enabled: false }),
				domain({
					host: "pr-1.example.com",
					https: true,
					domainType: "preview",
				}),
				domain({ host: "studio-1-2-3-4.sslip.io" }),
			]),
		).toEqual({ url: "http://studio-1-2-3-4.sslip.io", https: false });
	});

	it("returns null without a usable domain", () => {
		expect(getLibreDBStudioUrl([])).toBeNull();
		expect(
			getLibreDBStudioUrl([
				domain({ host: "off.example.com", enabled: false }),
			]),
		).toBeNull();
	});
});

describe("getLibreDBStudioView", () => {
	beforeEach(() => {
		mocks.loadLibreDBStudioScope.mockResolvedValue(
			scope({
				covered: [database()],
				excluded: [
					{
						database: database({
							kind: "redis",
							id: "redis-1",
							name: "Cache",
							serverId: "server-2",
						}),
						reason: "other-server",
					},
					{
						database: database({
							kind: "mongo",
							id: "mongo-1",
							name: "Events",
						}),
						reason: "no-network",
					},
					{
						database: database({
							kind: "mysql",
							id: "mysql-1",
							name: "Legacy MySQL",
							databaseUser: "${JWT_SECRET}",
						}),
						reason: "reference-like-value",
					},
				],
			}),
		);
		mocks.serverFindMany.mockResolvedValue([
			{ serverId: "server-2", name: "Edge box" },
		]);
	});

	it("builds the card view without secrets", async () => {
		mocks.studioFindFirst.mockResolvedValue(
			studioWithApplication({
				dockerImage: "ghcr.io/libredb/libredb-studio:0.17.0",
			}),
		);

		const view = await getLibreDBStudioView("studio-1");

		expect(view).toEqual({
			libredbStudioId: "studio-1",
			applicationId: "app-1",
			name: "LibreDB Studio",
			appName: "demo-shop-libredb-studio-x1y2z3",
			environmentId: "env-1",
			projectId: "project-1",
			serverId: null,
			serverName: null,
			applicationStatus: "done",
			url: "https://studio.example.com",
			https: true,
			image: "ghcr.io/libredb/libredb-studio:0.17.0",
			recommendedImage: LIBREDB_STUDIO_DEFAULT_IMAGE,
			updateAvailable: true,
			belowMinimumVersion: true,
			allowCustomConnections: true,
			cookieSettingMismatch: false,
			lastSyncedAt: "2026-10-03T10:00:00.000Z",
			lastSyncError: null,
			covered: [
				{
					kind: "postgres",
					id: "pg-1",
					name: "Orders DB",
					seedId: expect.stringMatching(/^dokploy-postgres-[0-9a-f]{12}$/),
					applicationStatus: "done",
				},
			],
			excluded: [
				{
					kind: "redis",
					id: "redis-1",
					name: "Cache",
					reason: "other-server",
					message: expect.stringContaining("Edge box"),
				},
				{
					kind: "mongo",
					id: "mongo-1",
					name: "Events",
					reason: "no-network",
					message: "Is not attached to any network.",
				},
				{
					kind: "mysql",
					id: "mysql-1",
					name: "Legacy MySQL",
					reason: "reference-like-value",
					message:
						"Has a user, database name or password that looks like a ${...} reference, which Studio could resolve from its own environment.",
				},
			],
		});
		expect(JSON.stringify(view)).not.toContain("orders-pass");
		expect(JSON.stringify(view)).not.toContain("JWT_SECRET");
		for (const secret of Object.values(secrets)) {
			expect(JSON.stringify(view)).not.toContain(secret);
		}
	});

	it.each([
		{ https: true, env: "AUTH_COOKIE_SECURE=false", mismatch: true },
		{ https: true, env: "", mismatch: false },
		{ https: false, env: "", mismatch: true },
		{ https: false, env: "AUTH_COOKIE_SECURE=false", mismatch: false },
		{ https: false, env: "AUTH_COOKIE_SECURE= OFF ", mismatch: false },
		{ https: false, env: "AUTH_COOKIE_SECURE=true", mismatch: true },
	])(
		"reports a cookie mismatch of $mismatch for https $https and env '$env'",
		async ({ https, env, mismatch }) => {
			mocks.studioFindFirst.mockResolvedValue(
				studioWithApplication({
					env,
					domains: [
						{
							host: "studio.example.com",
							https,
							path: "/",
							domainType: "application",
							enabled: true,
						},
					],
				}),
			);

			const view = await getLibreDBStudioView("studio-1");

			expect(view.cookieSettingMismatch).toBe(mismatch);
		},
	);

	it.each([
		["an older release", "ghcr.io/libredb/libredb-studio:0.17.0", true],
		["a prerelease", "ghcr.io/libredb/libredb-studio:0.18.0-rc.1", true],
		["the recommended image", LIBREDB_STUDIO_DEFAULT_IMAGE, false],
		["a newer release", "ghcr.io/libredb/libredb-studio:0.19.0", false],
		["a custom image", "registry.example.com/team/studio-fork:0.17.0", false],
		["an unparseable image", "ghcr.io/libredb/libredb-studio:latest", false],
	])(
		"reports updateAvailable for %s",
		async (_name, dockerImage, updateAvailable) => {
			mocks.studioFindFirst.mockResolvedValue(
				studioWithApplication({ dockerImage }),
			);

			const view = await getLibreDBStudioView("studio-1");

			expect(view.updateAvailable).toBe(updateAvailable);
		},
	);

	it("reports no cookie mismatch and no URL without a domain", async () => {
		mocks.studioFindFirst.mockResolvedValue(
			studioWithApplication({ domains: [] }),
		);

		const view = await getLibreDBStudioView("studio-1");

		expect(view.url).toBeNull();
		expect(view.https).toBe(false);
		expect(view.cookieSettingMismatch).toBe(false);
	});
});

describe("state shared by two copies of the module", () => {
	let secondCopy: typeof import("@dokploy/server/services/libredb-studio");

	beforeAll(async () => {
		vi.resetModules();
		secondCopy = await import("@dokploy/server/services/libredb-studio");
	});

	// Waiting for one macrotask lets every microtask run, so a call that was
	// not queued behind the first one would have reached its mock by then.
	const flushMicrotasks = () =>
		new Promise<void>((resolve) => setImmediate(resolve));

	it("makes the scope lock of the second copy wait for the first", async () => {
		expect(secondCopy.withLibreDBStudioScopeLock).not.toBe(
			withLibreDBStudioScopeLock,
		);
		const events: string[] = [];
		let releaseFirst: () => void = () => undefined;
		const scopeKey = { environmentId: "env-1", serverId: null };

		const first = withLibreDBStudioScopeLock(scopeKey, async () => {
			events.push("first-start");
			await new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
			events.push("first-end");
		});
		await vi.waitFor(() => expect(events).toEqual(["first-start"]));
		const second = secondCopy.withLibreDBStudioScopeLock(scopeKey, async () => {
			events.push("second");
		});
		await flushMicrotasks();

		expect(events).toEqual(["first-start"]);
		releaseFirst();
		await Promise.all([first, second]);
		expect(events).toEqual(["first-start", "first-end", "second"]);
	});

	it("makes a sync of one Studio on the second copy wait for the first", async () => {
		expect(secondCopy.syncLibreDBStudio).not.toBe(syncLibreDBStudio);
		let releaseFirst: () => void = () => undefined;
		mocks.runLibreDBStudioSync
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						releaseFirst = () => resolve({ changed: true, scope: scope({}) });
					}),
			)
			.mockResolvedValueOnce({ changed: false, scope: scope({}) });

		const first = syncLibreDBStudio("studio-1");
		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(1),
		);
		const second = secondCopy.syncLibreDBStudio("studio-1");
		await flushMicrotasks();

		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(1);
		releaseFirst();
		await expect(first).resolves.toEqual({
			changed: true,
			networksChanged: false,
		});
		await expect(second).resolves.toEqual({
			changed: false,
			networksChanged: false,
		});
		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(2);
	});

	it("debounces requests made through both copies into one run", async () => {
		expect(secondCopy.scheduleLibreDBStudioSync).not.toBe(
			scheduleLibreDBStudioSync,
		);
		vi.useFakeTimers();
		mocks.studioFindMany.mockResolvedValue([
			studioWithApplication({ libredbStudioId: "studio-1" }),
		]);
		const scopeKey = { environmentId: "env-1", serverId: null };

		scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(500);
		secondCopy.scheduleLibreDBStudioSync(scopeKey);
		await vi.advanceTimersByTimeAsync(999);

		expect(mocks.studioFindMany).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await vi.waitFor(() =>
			expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(1),
		);
		await vi.advanceTimersByTimeAsync(5000);
		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledTimes(1);
		expect(mocks.studioFindMany).toHaveBeenCalledTimes(1);
	});
});
