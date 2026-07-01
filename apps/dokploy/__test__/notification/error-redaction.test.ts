import { REDACTED_SECRET_VALUE } from "@dokploy/server/utils/security/redaction";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findNotifications: vi.fn(),
	sendCustomNotification: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			notifications: {
				findMany: mocks.findNotifications,
			},
		},
	},
}));

vi.mock("@react-email/components", () => ({
	render: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/utils", () => ({
	sendCustomNotification: mocks.sendCustomNotification,
	sendDiscordNotification: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendGotifyNotification: vi.fn(),
	sendLarkNotification: vi.fn(),
	sendMattermostNotification: vi.fn(),
	sendNtfyNotification: vi.fn(),
	sendPushoverNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	sendSlackNotification: vi.fn(),
	sendTeamsNotification: vi.fn(),
	sendTelegramNotification: vi.fn(),
}));

const { sendBuildErrorNotifications } = await import(
	"@dokploy/server/utils/notifications/build-error"
);
const { sendDatabaseBackupNotifications } = await import(
	"@dokploy/server/utils/notifications/database-backup"
);
const { sendVolumeBackupNotifications } = await import(
	"@dokploy/server/utils/notifications/volume-backup"
);

const sensitiveError = [
	"Command failed: git clone https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz@github.com/org/repo.git",
	"rclone rcat --s3-access-key-id AKIA123 --s3-secret-access-key rcloneSecretValue :s3:bucket/path",
	"DATABASE_URL=postgres://dokploy:postgres-password@postgres:5432/dokploy",
	"Authorization: Bearer bearer-token-123",
].join("\n");

const expectPayloadRedacted = () => {
	const payload = mocks.sendCustomNotification.mock.calls.at(-1)?.[1];
	expect(payload.errorMessage).toContain(REDACTED_SECRET_VALUE);
	expect(payload.errorMessage).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
	expect(payload.errorMessage).not.toContain("rcloneSecretValue");
	expect(payload.errorMessage).not.toContain("postgres-password");
	expect(payload.errorMessage).not.toContain("bearer-token-123");
};

describe("notification error redaction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findNotifications.mockResolvedValue([
			{
				custom: {
					webhookUrl: "https://hooks.example.com/dokploy",
				},
			},
		]);
		mocks.sendCustomNotification.mockResolvedValue(undefined);
	});

	it("redacts build error notification payloads", async () => {
		await sendBuildErrorNotifications({
			applicationName: "app",
			applicationType: "application",
			buildLink: "https://dokploy.example.com/build",
			errorMessage: sensitiveError,
			organizationId: "org-1",
			projectName: "project",
		});

		expectPayloadRedacted();
	});

	it("redacts database backup error notification payloads", async () => {
		await sendDatabaseBackupNotifications({
			applicationName: "postgres",
			databaseName: "appdb",
			databaseType: "postgres",
			errorMessage: sensitiveError,
			organizationId: "org-1",
			projectName: "project",
			type: "error",
		});

		expectPayloadRedacted();
	});

	it("redacts volume backup error notification payloads", async () => {
		await sendVolumeBackupNotifications({
			applicationName: "app",
			errorMessage: sensitiveError,
			organizationId: "org-1",
			projectName: "project",
			serviceType: "application",
			type: "error",
			volumeName: "data",
		});

		expectPayloadRedacted();
	});
});
