import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted before the `initCronJobs` import so the module graph
// never reaches a real DB, docker, or the node-schedule runtime.
const mocks = vi.hoisted(() => ({
	memberFindFirst: vi.fn(),
	backupsFindMany: vi.fn(),
	scheduleJob: vi.fn(),
	getWebServerSettings: vi.fn(),
	getAllServers: vi.fn(),
	cleanupAll: vi.fn(),
	sendDockerCleanupNotifications: vi.fn(),
	startLogCleanup: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: { findFirst: (...a: unknown[]) => mocks.memberFindFirst(...a) },
			backups: { findMany: (...a: unknown[]) => mocks.backupsFindMany(...a) },
		},
	},
	dbUrl: "postgres://mock:mock@localhost:5432/mock",
}));

vi.mock("node-schedule", () => ({
	scheduleJob: (...a: unknown[]) => mocks.scheduleJob(...a),
	scheduledJobs: {},
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: (...a: unknown[]) => mocks.getWebServerSettings(...a),
}));

vi.mock("@dokploy/server/services/server", () => ({
	getAllServers: (...a: unknown[]) => mocks.getAllServers(...a),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	cleanupAll: (...a: unknown[]) => mocks.cleanupAll(...a),
}));

vi.mock("@dokploy/server/utils/notifications/docker-cleanup", () => ({
	sendDockerCleanupNotifications: (...a: unknown[]) =>
		mocks.sendDockerCleanupNotifications(...a),
}));

vi.mock("@dokploy/server/utils/access-log/handler", () => ({
	startLogCleanup: (...a: unknown[]) => mocks.startLogCleanup(...a),
}));

import { initCronJobs } from "@dokploy/server/utils/backups/index";

const ADMIN_ORG = "org-admin";
const ADMIN_USER = "user-admin";
const SERVER_ID = "server-1";
const SERVER_ORG = "org-remote";

// `findAdmin()` returns a `member` row whose `organizationId` (the owner's
// org) and `user.id` are deliberately distinct random ids, mirroring reality.
const adminRow = {
	id: "member-admin",
	organizationId: ADMIN_ORG,
	userId: ADMIN_USER,
	role: "owner",
	user: { id: ADMIN_USER },
};

// Remote server owned by an organization *other than* the admin owner's org,
// to prove the per-server callback must use the server's own org id.
const remoteServer = {
	serverId: SERVER_ID,
	enableDockerCleanup: true,
	name: "remote-1",
	organizationId: SERVER_ORG,
};

// `initCronJobs` registers callbacks via `scheduleJob(name, cron, cb)`; we
// capture the cb by job name so each test can fire only the relevant one.
const findJob = (name: string) => {
	const call = mocks.scheduleJob.mock.calls.find((c) => c[0] === name);
	if (!call) {
		throw new Error(`scheduleJob was not called for job "${name}"`);
	}
	return call[2] as () => Promise<unknown>;
};

const jobWasScheduled = (name: string) =>
	mocks.scheduleJob.mock.calls.some((c) => c[0] === name);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.memberFindFirst.mockResolvedValue(adminRow);
	mocks.backupsFindMany.mockResolvedValue([]);
	mocks.getWebServerSettings.mockResolvedValue({ enableDockerCleanup: true });
	mocks.getAllServers.mockResolvedValue([remoteServer]);
	mocks.cleanupAll.mockResolvedValue(undefined);
	mocks.sendDockerCleanupNotifications.mockResolvedValue(undefined);
	mocks.startLogCleanup.mockResolvedValue(undefined);
});

describe("initCronJobs docker-cleanup notifications (self-hosted)", () => {
	describe("web-server cleanup job", () => {
		it("passes the admin owner's organizationId to sendDockerCleanupNotifications (not the user id)", async () => {
			await initCronJobs();

			await findJob("docker-cleanup")();

			expect(mocks.cleanupAll).toHaveBeenCalledTimes(1);
			expect(mocks.cleanupAll).toHaveBeenCalledWith();
			expect(mocks.sendDockerCleanupNotifications).toHaveBeenCalledTimes(1);
			expect(mocks.sendDockerCleanupNotifications).toHaveBeenCalledWith(
				ADMIN_ORG,
			);
			// Regression guard for the original bug: passing user.id instead of org id.
			expect(mocks.sendDockerCleanupNotifications).not.toHaveBeenCalledWith(
				ADMIN_USER,
			);
		});

		it("registers the job under the 'docker-cleanup' name when enabled", async () => {
			await initCronJobs();

			expect(jobWasScheduled("docker-cleanup")).toBe(true);
		});

		it("does not register the job when enableDockerCleanup is disabled", async () => {
			mocks.getWebServerSettings.mockResolvedValue({
				enableDockerCleanup: false,
			});
			mocks.getAllServers.mockResolvedValue([]);

			await initCronJobs();

			expect(jobWasScheduled("docker-cleanup")).toBe(false);
		});
	});

	describe("per-remote-server cleanup job", () => {
		it("passes that server's own organizationId to sendDockerCleanupNotifications (not the admin's org or user id)", async () => {
			await initCronJobs();

			await findJob(SERVER_ID)();

			expect(mocks.cleanupAll).toHaveBeenCalledTimes(1);
			expect(mocks.cleanupAll).toHaveBeenCalledWith(SERVER_ID);
			expect(mocks.sendDockerCleanupNotifications).toHaveBeenCalledTimes(1);
			expect(mocks.sendDockerCleanupNotifications).toHaveBeenCalledWith(
				SERVER_ORG,
				`Docker cleanup for Server remote-1 (${SERVER_ID})`,
			);
			// A remote server owned by a different org must NOT fall back to the
			// admin owner's org (would dispatch the wrong organization's channels).
			expect(mocks.sendDockerCleanupNotifications).not.toHaveBeenCalledWith(
				ADMIN_ORG,
				expect.anything(),
			);
			// Regression guard for the original bug.
			expect(mocks.sendDockerCleanupNotifications).not.toHaveBeenCalledWith(
				ADMIN_USER,
				expect.anything(),
			);
		});

		it("registers the job under the serverId when the server has enableDockerCleanup enabled", async () => {
			await initCronJobs();

			expect(jobWasScheduled(SERVER_ID)).toBe(true);
		});

		it("does not register the job for servers with enableDockerCleanup disabled", async () => {
			mocks.getWebServerSettings.mockResolvedValue({
				enableDockerCleanup: false,
			});
			mocks.getAllServers.mockResolvedValue([
				{ ...remoteServer, enableDockerCleanup: false },
			]);

			await initCronJobs();

			expect(jobWasScheduled(SERVER_ID)).toBe(false);
		});

		it("uses each remote server's own organizationId when servers belong to different orgs", async () => {
			const serverA = {
				serverId: "server-a",
				enableDockerCleanup: true,
				name: "alpha",
				organizationId: "org-a",
			};
			const serverB = {
				serverId: "server-b",
				enableDockerCleanup: true,
				name: "beta",
				organizationId: "org-b",
			};
			mocks.getAllServers.mockResolvedValue([serverA, serverB]);

			await initCronJobs();

			await findJob("server-a")();
			await findJob("server-b")();

			expect(mocks.sendDockerCleanupNotifications).toHaveBeenCalledTimes(2);
			expect(mocks.sendDockerCleanupNotifications).toHaveBeenNthCalledWith(
				1,
				"org-a",
				"Docker cleanup for Server alpha (server-a)",
			);
			expect(mocks.sendDockerCleanupNotifications).toHaveBeenNthCalledWith(
				2,
				"org-b",
				"Docker cleanup for Server beta (server-b)",
			);
		});
	});

	describe("admin lookup", () => {
		it("registers no docker-cleanup jobs when no owner member exists", async () => {
			mocks.memberFindFirst.mockResolvedValue(undefined);

			await initCronJobs();

			expect(mocks.scheduleJob).not.toHaveBeenCalled();
			expect(mocks.sendDockerCleanupNotifications).not.toHaveBeenCalled();
		});
	});
});
