import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findOwner: vi.fn(),
	scheduleJob: vi.fn(),
	startLogCleanup: vi.fn(),
	cleanupAll: vi.fn(),
	sendDockerCleanupNotifications: vi.fn(),
}));

vi.mock("node-schedule", () => ({ scheduleJob: mocks.scheduleJob }));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: { findFirst: mocks.findOwner },
			backups: { findMany: vi.fn(async () => []) },
		},
	},
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(async () => ({
		enableDockerCleanup: true,
		logCleanupCron: "0 0 * * *",
	})),
}));

vi.mock("@dokploy/server/services/server", () => ({
	getAllServers: vi.fn(async () => []),
}));

vi.mock("@dokploy/server/utils/access-log/handler", () => ({
	startLogCleanup: mocks.startLogCleanup,
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	cleanupAll: mocks.cleanupAll,
}));

vi.mock("@dokploy/server/utils/notifications/docker-cleanup", () => ({
	sendDockerCleanupNotifications: mocks.sendDockerCleanupNotifications,
}));

import { initCronJobs } from "@dokploy/server/utils/backups";

describe("initCronJobs (#5403)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers docker and log cleanup before the owner exists", async () => {
		mocks.findOwner.mockResolvedValue(undefined);

		await initCronJobs();

		expect(mocks.scheduleJob).toHaveBeenCalledWith(
			"docker-cleanup",
			expect.any(String),
			expect.any(Function),
		);
		expect(mocks.startLogCleanup).toHaveBeenCalledWith("0 0 * * *");
	});

	it("notifies the owner's organization when the cleanup runs", async () => {
		mocks.findOwner.mockResolvedValue(undefined);
		await initCronJobs();
		const job = mocks.scheduleJob.mock.calls[0]?.[2] as () => Promise<void>;

		mocks.findOwner.mockResolvedValue({ organizationId: "org-1" });
		await job();

		expect(mocks.cleanupAll).toHaveBeenCalled();
		expect(mocks.sendDockerCleanupNotifications).toHaveBeenCalledWith("org-1");
	});
});
