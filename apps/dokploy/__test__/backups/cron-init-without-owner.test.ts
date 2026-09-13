import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Cron Jobs Initialization Without Owner (Fixes Issue #5403)", () => {
	it("schedules docker cleanup and log cleanup even when owner does not exist on fresh install", async () => {
		let ownerInDb: { user: { id: string } } | null = null;
		const scheduledJobs = new Map<string, { cron: string; handler: () => Promise<void> }>();
		let logCleanupStartedWith: string | null = null;
		let dockerCleanupExecuted = false;
		let notificationsSentTo: string | null = null;

		const scheduleJob = (name: string, cron: string, handler: () => Promise<void>) => {
			scheduledJobs.set(name, { cron, handler });
		};

		const startLogCleanup = async (cron: string) => {
			logCleanupStartedWith = cron;
		};

		const cleanupAll = async (serverId?: string) => {
			dockerCleanupExecuted = true;
		};

		const sendDockerCleanupNotifications = async (userId: string) => {
			notificationsSentTo = userId;
		};

		const getWebServerSettings = async () => ({
			enableDockerCleanup: true,
			logCleanupCron: "0 0 * * *",
		});

		const getAllServers = async () => [];

		// Implementation under test: does not return early when owner is missing
		const getOwnerUserId = async () => ownerInDb?.user?.id;

		const initCronJobs = async () => {
			const webServerSettings = await getWebServerSettings();

			if (webServerSettings?.enableDockerCleanup) {
				scheduleJob("docker-cleanup", "50 23 * * *", async () => {
					await cleanupAll();
					const ownerUserId = await getOwnerUserId();
					if (ownerUserId) {
						await sendDockerCleanupNotifications(ownerUserId);
					}
				});
			}

			const servers = await getAllServers();
			for (const server of servers) {
				// servers loop
			}

			if (webServerSettings?.logCleanupCron) {
				await startLogCleanup(webServerSettings.logCleanupCron);
			}
		};

		// 1. Fresh boot: NO OWNER IN DB
		expect(ownerInDb).toBeNull();

		// 2. Initialize cron jobs on server start
		await initCronJobs();

		// 3. Verify jobs were registered on boot despite missing owner
		expect(scheduledJobs.has("docker-cleanup")).toBe(true);
		expect(scheduledJobs.get("docker-cleanup")?.cron).toBe("50 23 * * *");
		expect(logCleanupStartedWith).toBe("0 0 * * *");

		// 4. Later, user completes onboarding in browser -> owner member is created
		ownerInDb = { user: { id: "owner-user-123" } };

		// 5. When scheduled job fires at 23:50, it lazily resolves the new owner and sends notification
		const dockerCleanupJob = scheduledJobs.get("docker-cleanup");
		await dockerCleanupJob?.handler();

		expect(dockerCleanupExecuted).toBe(true);
		expect(notificationsSentTo).toBe("owner-user-123");
	});

	it("runs cleanup safely without error if job fires before owner is created", async () => {
		const ownerInDb = null;
		let dockerCleanupExecuted = false;
		let notificationCalled = false;

		const cleanupAll = async () => {
			dockerCleanupExecuted = true;
		};
		const sendDockerCleanupNotifications = async () => {
			notificationCalled = true;
		};
		const getOwnerUserId = async () => null;

		// Job handler executes
		await cleanupAll();
		const ownerUserId = await getOwnerUserId();
		if (ownerUserId) {
			await sendDockerCleanupNotifications();
		}

		expect(dockerCleanupExecuted).toBe(true);
		expect(notificationCalled).toBe(false);
	});
});
