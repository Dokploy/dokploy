import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression test for PR #5176:
 * Teams notification failures must not escape the try/catch inside
 * `sendServerThresholdNotifications`.  Before the fix, Teams was called
 * outside the try/catch, so a rejection would propagate up and abort the
 * entire notification loop — preventing subsequent providers (Gotify,
 * Slack, etc.) from being notified.
 *
 * Strategy: mock the DB to return one notification record with both
 * Teams and Gotify configured, make Teams reject, and assert that:
 *   1. The function resolves without throwing.
 *   2. Gotify is still called despite the Teams failure.
 */

// ── hoisted mocks ───────────────────────────────────────────────────
const { mockFindMany } = vi.hoisted(() => ({
	mockFindMany: vi.fn(),
}));

// ── module mocks ────────────────────────────────────────────────────
vi.mock("@dokploy/server/utils/notifications/utils", () => ({
	sendDiscordNotification: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendGotifyNotification: vi.fn(),
	sendSlackNotification: vi.fn(),
	sendTelegramNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	sendNtfyNotification: vi.fn(),
	sendMattermostNotification: vi.fn(),
	sendCustomNotification: vi.fn(),
	sendLarkNotification: vi.fn(),
	sendPushoverNotification: vi.fn(),
	sendTeamsNotification: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			notifications: {
				findMany: mockFindMany,
			},
		},
	},
}));

// Mock react-email render used by the email template in server-threshold.ts
vi.mock("@react-email/components", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		render: vi.fn(() => Promise.resolve("mocked-html")),
	};
});

// ── imports (resolved after mocks are hoisted) ──────────────────────
import { sendServerThresholdNotifications } from "@dokploy/server/utils/notifications/server-threshold";
import {
	sendGotifyNotification,
	sendTeamsNotification,
} from "@dokploy/server/utils/notifications/utils";

// ── tests ───────────────────────────────────────────────────────────
describe("sendServerThresholdNotifications (PR #5176)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("catches Teams notification errors and still calls Gotify", async () => {
		// DB returns one notification config with both Teams and Gotify
		mockFindMany.mockResolvedValueOnce([
			{
				teams: { webhookUrl: "https://teams.test" },
				gotify: {
					serverUrl: "https://gotify.test",
					appToken: "token",
				},
				// All other providers are null/undefined
				slack: null,
				discord: null,
				telegram: null,
				email: null,
				resend: null,
				ntfy: null,
				mattermost: null,
				custom: null,
				lark: null,
				pushover: null,
			},
		]);

		// Teams rejects — this must be caught inside the loop
		vi.mocked(sendTeamsNotification).mockRejectedValueOnce(
			new Error("Teams webhook failed"),
		);
		vi.mocked(sendGotifyNotification).mockResolvedValueOnce(undefined);

		// The function must resolve cleanly despite the Teams failure
		await expect(
			sendServerThresholdNotifications("org-1", {
				Type: "CPU",
				Value: 95,
				Threshold: 90,
				Message: "High CPU",
				Timestamp: new Date().toISOString(),
				Token: "token",
				ServerName: "TestServer",
			}),
		).resolves.not.toThrow();

		// Both providers were attempted
		expect(sendTeamsNotification).toHaveBeenCalledTimes(1);
		expect(sendGotifyNotification).toHaveBeenCalledTimes(1);
	});
});
