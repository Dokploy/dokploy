import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findFirstMember: vi.fn(),
	getWebServerSettings: vi.fn(),
	sendServerThresholdNotifications: vi.fn(),
	dbSelect: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createCustomNotification: vi.fn(),
	createDiscordNotification: vi.fn(),
	createEmailNotification: vi.fn(),
	createGotifyNotification: vi.fn(),
	createLarkNotification: vi.fn(),
	createMattermostNotification: vi.fn(),
	createNtfyNotification: vi.fn(),
	createPushoverNotification: vi.fn(),
	createResendNotification: vi.fn(),
	createSlackNotification: vi.fn(),
	createTeamsNotification: vi.fn(),
	createTelegramNotification: vi.fn(),
	findNotificationById: vi.fn(),
	getWebServerSettings: mocks.getWebServerSettings,
	IS_CLOUD: false,
	removeNotificationById: vi.fn(),
	sendCustomNotification: vi.fn(),
	sendDiscordNotification: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendGotifyNotification: vi.fn(),
	sendLarkNotification: vi.fn(),
	sendMattermostNotification: vi.fn(),
	sendNtfyNotification: vi.fn(),
	sendPushoverNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	sendServerThresholdNotifications: mocks.sendServerThresholdNotifications,
	sendSlackNotification: vi.fn(),
	sendTeamsNotification: vi.fn(),
	sendTelegramNotification: vi.fn(),
	updateCustomNotification: vi.fn(),
	updateDiscordNotification: vi.fn(),
	updateEmailNotification: vi.fn(),
	updateGotifyNotification: vi.fn(),
	updateLarkNotification: vi.fn(),
	updateMattermostNotification: vi.fn(),
	updateNtfyNotification: vi.fn(),
	updatePushoverNotification: vi.fn(),
	updateResendNotification: vi.fn(),
	updateSlackNotification: vi.fn(),
	updateTeamsNotification: vi.fn(),
	updateTelegramNotification: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: mocks.findFirstMember,
			},
		},
		select: () => ({
			from: () => ({
				where: mocks.dbSelect,
			}),
		}),
	},
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("../../server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

import { notificationRouter } from "../../server/api/routers/notification";

const caller = notificationRouter.createCaller({} as any);

describe("receiveNotification router (issue #5830)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("resolves owner organization and Dokploy ServerName for main Dokploy server alerts", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			metricsConfig: {
				server: {
					token: "valid-dokploy-token",
				},
			},
		});

		mocks.findFirstMember.mockResolvedValue({
			id: "member-1",
			role: "owner",
			organizationId: "org-owner-123",
		});

		await caller.receiveNotification({
			ServerType: "Dokploy",
			Type: "Memory",
			Value: 88.5,
			Threshold: 85.0,
			Message: "Memory high on Dokploy host",
			Timestamp: "2026-10-31T00:00:00.000Z",
			Token: "valid-dokploy-token",
		});

		expect(mocks.findFirstMember).toHaveBeenCalledOnce();
		expect(mocks.sendServerThresholdNotifications).toHaveBeenCalledWith(
			"org-owner-123",
			expect.objectContaining({
				ServerName: "Dokploy",
				Type: "Memory",
				Value: 88.5,
				Threshold: 85.0,
			}),
		);
	});

	it("throws BAD_REQUEST when Dokploy server token does not match", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			metricsConfig: {
				server: {
					token: "actual-token",
				},
			},
		});

		await expect(
			caller.receiveNotification({
				ServerType: "Dokploy",
				Type: "CPU",
				Value: 95.0,
				Threshold: 90.0,
				Message: "CPU high",
				Timestamp: "2026-10-31T00:00:00.000Z",
				Token: "wrong-token",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		expect(mocks.sendServerThresholdNotifications).not.toHaveBeenCalled();
	});

	it("resolves server organization and custom name for Remote server alerts", async () => {
		mocks.dbSelect.mockResolvedValue([
			{
				serverId: "remote-1",
				name: "Production-Worker",
				organizationId: "org-remote-456",
			},
		]);

		await caller.receiveNotification({
			ServerType: "Remote",
			Type: "CPU",
			Value: 90.0,
			Threshold: 80.0,
			Message: "CPU threshold reached",
			Timestamp: "2026-10-31T00:00:00.000Z",
			Token: "remote-token-abc",
		});

		expect(mocks.sendServerThresholdNotifications).toHaveBeenCalledWith(
			"org-remote-456",
			expect.objectContaining({
				ServerName: "Production-Worker",
				Type: "CPU",
				Value: 90.0,
				Threshold: 80.0,
			}),
		);
	});
});
