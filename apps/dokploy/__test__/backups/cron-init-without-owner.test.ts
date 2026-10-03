import { beforeEach, describe, expect, it, vi } from "vitest";

const getWebServerSettingsMock = vi.fn();
const findFirstMemberMock = vi.fn();
const scheduleJobMock = vi.fn();
const cleanupAllMock = vi.fn();
const sendDockerCleanupNotificationsMock = vi.fn();
const startLogCleanupMock = vi.fn();
const getAllServersMock = vi.fn();

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: (...args: unknown[]) => findFirstMemberMock(...args),
			},
		},
	},
}));

vi.mock("@dokploy/server/db/schema", () => ({
	member: {
		role: "role",
	},
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: (...args: unknown[]) => getWebServerSettingsMock(...args),
}));

vi.mock("@dokploy/server/services/server", () => ({
	getAllServers: (...args: unknown[]) => getAllServersMock(...args),
}));

vi.mock("node-schedule", () => ({
	scheduleJob: (...args: unknown[]) => scheduleJobMock(...args),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	cleanupAll: (...args: unknown[]) => cleanupAllMock(...args),
}));

vi.mock("@dokploy/server/utils/notifications/docker-cleanup", () => ({
	sendDockerCleanupNotifications: (...args: unknown[]) =>
		sendDockerCleanupNotificationsMock(...args),
}));

vi.mock("@dokploy/server/utils/access-log/handler", () => ({
	startLogCleanup: (...args: unknown[]) => startLogCleanupMock(...args),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { initCronJobs } from "@dokploy/server/utils/backups/index";

describe("initCronJobs without owner on boot (Fixes #5403)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAllServersMock.mockResolvedValue([]);
		getWebServerSettingsMock.mockResolvedValue({
			enableDockerCleanup: true,
			logCleanupCron: "0 0 * * *",
		});
	});

	it("schedules docker cleanup and log cleanup when owner member does not exist on fresh install", async () => {
		// 1. Fresh boot: no owner exists in database yet
		findFirstMemberMock.mockResolvedValue(null);

		const scheduledJobs = new Map<
			string,
			{ cron: string; handler: () => Promise<void> }
		>();
		scheduleJobMock.mockImplementation(
			(name: string, cron: string, handler: () => Promise<void>) => {
				scheduledJobs.set(name, { cron, handler });
			},
		);

		// 2. Run production initCronJobs on boot
		await initCronJobs();

		// 3. Verify jobs were scheduled despite missing owner
		expect(scheduleJobMock).toHaveBeenCalledWith(
			"docker-cleanup",
			expect.any(String),
			expect.any(Function),
		);
		expect(startLogCleanupMock).toHaveBeenCalledWith("0 0 * * *");

		// 4. User completes onboarding -> owner created in DB
		findFirstMemberMock.mockResolvedValue({
			user: { id: "owner-user-456" },
		});

		// 5. Scheduled job executes -> lazily resolves owner and sends notification
		const dockerCleanupJob = scheduledJobs.get("docker-cleanup");
		expect(dockerCleanupJob).toBeDefined();
		await dockerCleanupJob?.handler();

		expect(cleanupAllMock).toHaveBeenCalled();
		expect(sendDockerCleanupNotificationsMock).toHaveBeenCalledWith(
			"owner-user-456",
		);
	});

	it("executes cleanup without error if job fires before owner is created", async () => {
		findFirstMemberMock.mockResolvedValue(null);

		let registeredHandler: (() => Promise<void>) | undefined;
		scheduleJobMock.mockImplementation(
			(_name: string, _cron: string, handler: () => Promise<void>) => {
				registeredHandler = handler;
			},
		);

		await initCronJobs();
		expect(registeredHandler).toBeDefined();

		// Job fires before owner exists
		await registeredHandler?.();

		expect(cleanupAllMock).toHaveBeenCalled();
		expect(sendDockerCleanupNotificationsMock).not.toHaveBeenCalled();
	});
});
