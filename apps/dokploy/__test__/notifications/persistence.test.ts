import { vi, describe, expect, it, beforeEach } from "vitest";

/**
 * Regression test for PR #5176:
 * Gotify and Ntfy create/update must persist `serverThreshold` to the
 * notifications table.  Before the fix, `serverThreshold` was omitted from
 * the Gotify and Ntfy insert/update calls, so enabling it in the UI had
 * no effect.
 *
 * Strategy: mock the DB layer so we can spy on the values passed to
 * `insert().values()` and `update().set()`, then assert that
 * `serverThreshold: true` is present.
 */

// ── hoisted mocks (available inside vi.mock factories) ──────────────
const { mockInsertValues, mockUpdateSet } = vi.hoisted(() => {
	const insertValues = vi.fn(() => ({
		returning: () => ({
			then: (cb: any) =>
				cb([
					{
						gotifyId: "test-gotify-id",
						ntfyId: "test-ntfy-id",
						notificationId: "test-notification-id",
					},
				]),
		}),
	}));

	const updateSet = vi.fn(() => ({
		where: () => ({
			returning: () => ({
				then: (cb: any) => cb([{}]),
			}),
			then: (cb: any) => cb([{}]),
		}),
	}));

	return { mockInsertValues: insertValues, mockUpdateSet: updateSet };
});

// ── module mocks ────────────────────────────────────────────────────
vi.mock("@dokploy/server/db", () => {
	const mockDb: any = {
		insert: vi.fn(() => ({ values: mockInsertValues })),
		update: vi.fn(() => ({ set: mockUpdateSet })),
		transaction: vi.fn(async (cb: any) => cb(mockDb)),
		query: {
			notifications: {
				findFirst: vi.fn(() =>
					Promise.resolve({
						organizationId: "org-1",
						notificationId: "test-notification-id",
					}),
				),
			},
		},
	};
	return { db: mockDb };
});

// ── imports (resolved after mocks are hoisted) ──────────────────────
import {
	createGotifyNotification,
	updateGotifyNotification,
	createNtfyNotification,
	updateNtfyNotification,
} from "@dokploy/server/services/notification";

// ── tests ───────────────────────────────────────────────────────────
describe("Notification Persistence Regression (PR #5176)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Gotify ────────────────────────────────────────────────────────
	it("createGotifyNotification passes serverThreshold to the db", async () => {
		await createGotifyNotification(
			{
				name: "Gotify Test",
				serverUrl: "http://gotify.test",
				appToken: "token",
				priority: 5,
				serverThreshold: true,
				appDeploy: false,
				appBuildError: false,
				databaseBackup: false,
				dokployBackup: false,
				volumeBackup: false,
				dokployRestart: false,
				dockerCleanup: false,
			},
			"org-1",
		);

		// First insert = gotify row, second insert = notifications row
		expect(mockInsertValues).toHaveBeenCalledTimes(2);
		const notificationInsertArgs = mockInsertValues.mock.calls[1][0];
		expect(notificationInsertArgs).toHaveProperty("serverThreshold", true);
	});

	it("updateGotifyNotification passes serverThreshold to the db", async () => {
		await updateGotifyNotification({
			notificationId: "test-notification-id",
			gotifyId: "test-gotify-id",
			name: "Gotify Test Update",
			serverUrl: "http://gotify.test",
			appToken: "token",
			priority: 5,
			serverThreshold: true,
			appDeploy: false,
			appBuildError: false,
			databaseBackup: false,
			dokployBackup: false,
			volumeBackup: false,
			dokployRestart: false,
			dockerCleanup: false,
			organizationId: "org-1",
		});

		// First set = notifications row, second set = gotify row
		expect(mockUpdateSet).toHaveBeenCalledTimes(2);
		const notificationUpdateArgs = mockUpdateSet.mock.calls[0][0];
		expect(notificationUpdateArgs).toHaveProperty("serverThreshold", true);
	});

	// ── Ntfy ─────────────────────────────────────────────────────────
	it("createNtfyNotification passes serverThreshold to the db", async () => {
		await createNtfyNotification(
			{
				name: "Ntfy Test",
				serverUrl: "http://ntfy.test",
				topic: "test-topic",
				priority: 5,
				serverThreshold: true,
				appDeploy: false,
				appBuildError: false,
				databaseBackup: false,
				dokployBackup: false,
				volumeBackup: false,
				dokployRestart: false,
				dockerCleanup: false,
			},
			"org-1",
		);

		expect(mockInsertValues).toHaveBeenCalledTimes(2);
		const notificationInsertArgs = mockInsertValues.mock.calls[1][0];
		expect(notificationInsertArgs).toHaveProperty("serverThreshold", true);
	});

	it("updateNtfyNotification passes serverThreshold to the db", async () => {
		await updateNtfyNotification({
			notificationId: "test-notification-id",
			ntfyId: "test-ntfy-id",
			name: "Ntfy Test Update",
			serverUrl: "http://ntfy.test",
			topic: "test-topic",
			priority: 5,
			serverThreshold: true,
			appDeploy: false,
			appBuildError: false,
			databaseBackup: false,
			dokployBackup: false,
			volumeBackup: false,
			dokployRestart: false,
			dockerCleanup: false,
			organizationId: "org-1",
		});

		expect(mockUpdateSet).toHaveBeenCalledTimes(2);
		const notificationUpdateArgs = mockUpdateSet.mock.calls[0][0];
		expect(notificationUpdateArgs).toHaveProperty("serverThreshold", true);
	});
});
