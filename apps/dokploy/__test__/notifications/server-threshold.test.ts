import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	sendSlackNotification: vi.fn(),
	sendDiscordNotification: vi.fn(),
	sendTelegramNotification: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	sendCustomNotification: vi.fn(),
	sendGotifyNotification: vi.fn(),
	sendLarkNotification: vi.fn(),
	sendMattermostNotification: vi.fn(),
	sendNtfyNotification: vi.fn(),
	sendPushoverNotification: vi.fn(),
	sendTeamsNotification: vi.fn(),
	render: vi
		.fn()
		.mockResolvedValue("<html>Rendered Server Threshold Email</html>"),
}));

vi.mock("@react-email/components", () => ({
	render: mocks.render,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			notifications: {
				findMany: mocks.findMany,
			},
		},
	},
}));

vi.mock("@dokploy/server/utils/notifications/utils", () => ({
	escapeHtml: (str: string) => str,
	sendCustomNotification: mocks.sendCustomNotification,
	sendDiscordNotification: mocks.sendDiscordNotification,
	sendEmailNotification: mocks.sendEmailNotification,
	sendGotifyNotification: mocks.sendGotifyNotification,
	sendLarkNotification: mocks.sendLarkNotification,
	sendMattermostNotification: mocks.sendMattermostNotification,
	sendNtfyNotification: mocks.sendNtfyNotification,
	sendPushoverNotification: mocks.sendPushoverNotification,
	sendResendNotification: mocks.sendResendNotification,
	sendSlackNotification: mocks.sendSlackNotification,
	sendTeamsNotification: mocks.sendTeamsNotification,
	sendTelegramNotification: mocks.sendTelegramNotification,
}));

vi.mock("@dokploy/server/emails/emails/server-threshold", () => ({
	default: vi.fn().mockReturnValue({}),
}));

import { sendServerThresholdNotifications } from "@dokploy/server/utils/notifications/server-threshold";

describe("sendServerThresholdNotifications (issue #5830)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findMany.mockResolvedValue([]);
	});

	it("filters by organizationId when organizationId is provided (e.g. for remote servers)", async () => {
		mocks.findMany.mockResolvedValue([]);

		await sendServerThresholdNotifications("org-123", {
			ServerName: "Remote-Worker-1",
			Type: "CPU",
			Value: 92.5,
			Threshold: 85,
			Message: "CPU limit exceeded",
			Timestamp: "2026-10-31T00:00:00.000Z",
			Token: "token-123",
		});

		expect(mocks.findMany).toHaveBeenCalledOnce();
		const callArgs = mocks.findMany.mock.calls[0]?.[0];
		expect(callArgs).toBeDefined();
		expect(callArgs.where).toBeDefined();
	});

	it("does not drop notifications when organizationId is empty string for the main Dokploy server", async () => {
		mocks.findMany.mockResolvedValue([
			{
				notificationId: "notif-1",
				serverThreshold: true,
				organizationId: "org-owner",
				slack: { webhookUrl: "https://slack.example.com" },
			},
		]);

		await sendServerThresholdNotifications("", {
			ServerName: "Dokploy",
			Type: "Memory",
			Value: 88.0,
			Threshold: 80.0,
			Message: "Memory high on Dokploy host",
			Timestamp: "2026-10-31T00:00:00.000Z",
			Token: "main-token",
		});

		expect(mocks.findMany).toHaveBeenCalledOnce();
		expect(mocks.sendSlackNotification).toHaveBeenCalledOnce();
	});

	it("does not drop notifications when organizationId is undefined or null", async () => {
		mocks.findMany.mockResolvedValue([
			{
				notificationId: "notif-2",
				serverThreshold: true,
				organizationId: "org-owner",
				discord: { webhookUrl: "https://discord.example.com" },
			},
		]);

		await sendServerThresholdNotifications(undefined, {
			ServerName: "Dokploy",
			Type: "CPU",
			Value: 95.0,
			Threshold: 90.0,
			Message: "CPU peak",
			Timestamp: "2026-10-31T00:00:00.000Z",
			Token: "main-token",
		});

		expect(mocks.findMany).toHaveBeenCalledOnce();
		expect(mocks.sendDiscordNotification).toHaveBeenCalledOnce();
	});

	it("delivers alerts to email and resend using rendered email template", async () => {
		mocks.findMany.mockResolvedValue([
			{
				notificationId: "notif-3",
				serverThreshold: true,
				organizationId: "org-1",
				email: { to: "admin@example.com" },
				resend: { apiKey: "resend-key", to: "admin@example.com" },
			},
		]);

		await sendServerThresholdNotifications("org-1", {
			ServerName: "Dokploy",
			Type: "Memory",
			Value: 86.42,
			Threshold: 85.0,
			Message: "Memory threshold reached",
			Timestamp: "2026-10-31T00:00:00.000Z",
			Token: "token-1",
		});

		expect(mocks.render).toHaveBeenCalledOnce();
		expect(mocks.sendEmailNotification).toHaveBeenCalledOnce();
		expect(mocks.sendResendNotification).toHaveBeenCalledOnce();
	});

	it("delivers alerts to telegram when configured", async () => {
		mocks.findMany.mockResolvedValue([
			{
				notificationId: "notif-4",
				serverThreshold: true,
				organizationId: "org-1",
				telegram: { botToken: "bot-token", chatId: "chat-id" },
			},
		]);

		await sendServerThresholdNotifications("org-1", {
			ServerName: "Dokploy",
			Type: "CPU",
			Value: 90.0,
			Threshold: 85.0,
			Message: "CPU high",
			Timestamp: "2026-10-31T00:00:00.000Z",
			Token: "token-1",
		});

		expect(mocks.sendTelegramNotification).toHaveBeenCalledOnce();
	});
});
