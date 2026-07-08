import {
	assertNotificationBaseUrlAllowed,
	assertNotificationHttpUrlAllowed,
	assertNotificationSmtpHostAllowed,
	normalizeNotificationBaseUrl,
	normalizeNotificationHttpUrl,
	normalizeNotificationSmtpHost,
	notificationOptionalSecretUpdateValue,
	notificationSecretUpdateValue,
	REDACTED_NOTIFICATION_SECRET,
	redactNotificationSecrets,
	resolveNotificationSmtpTarget,
} from "@dokploy/server/utils/notifications/security";
import { sendCustomNotification } from "@dokploy/server/utils/notifications/utils";
import { describe, expect, it } from "vitest";

describe("notification secret and outbound target boundaries", () => {
	it("redacts provider secrets from notification read payloads", () => {
		const redacted = redactNotificationSecrets({
			notificationId: "notification-1",
			name: "prod alerts",
			organizationId: "org-1",
			slack: {
				slackId: "slack-1",
				webhookUrl: "https://hooks.slack.com/services/T/B/secret",
				channel: "ops",
			},
			telegram: {
				telegramId: "telegram-1",
				botToken: "telegram-secret",
				chatId: "123",
			},
			discord: {
				discordId: "discord-1",
				webhookUrl: "https://discord.com/api/webhooks/1/secret",
				decoration: true,
			},
			email: {
				emailId: "email-1",
				smtpServer: "smtp.example.com",
				smtpPort: 587,
				username: "alerts@example.com",
				password: "smtp-secret",
				fromAddress: "alerts@example.com",
				toAddresses: ["ops@example.com"],
			},
			resend: {
				resendId: "resend-1",
				apiKey: "re_secret",
				fromAddress: "alerts@example.com",
				toAddresses: ["ops@example.com"],
			},
			gotify: {
				gotifyId: "gotify-1",
				serverUrl: "https://gotify.example.com",
				appToken: "gotify-secret",
				priority: 5,
			},
			ntfy: {
				ntfyId: "ntfy-1",
				serverUrl: "https://ntfy.sh",
				topic: "deploys",
				accessToken: "ntfy-secret",
				priority: 3,
			},
			mattermost: {
				mattermostId: "mattermost-1",
				webhookUrl: "https://mattermost.example.com/hooks/secret",
				channel: "ops",
			},
			custom: {
				customId: "custom-1",
				endpoint: "https://example.com/webhook?token=secret",
				headers: {
					Authorization: "Bearer secret",
					"X-Trace": "trace-secret",
				},
			},
			lark: {
				larkId: "lark-1",
				webhookUrl: "https://open.larksuite.com/open-apis/bot/v2/hook/secret",
			},
			teams: {
				teamsId: "teams-1",
				webhookUrl: "https://example.webhook.office.com/webhookb2/secret",
			},
			pushover: {
				pushoverId: "pushover-1",
				userKey: "user-secret",
				apiToken: "api-secret",
				priority: 0,
			},
		});

		expect(redacted.slack.webhookUrl).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.telegram.botToken).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.discord.webhookUrl).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.email.password).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.resend.apiKey).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.gotify.appToken).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.ntfy.accessToken).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.mattermost.webhookUrl).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.custom.endpoint).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.custom.headers.Authorization).toBe(
			REDACTED_NOTIFICATION_SECRET,
		);
		expect(redacted.lark.webhookUrl).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.teams.webhookUrl).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.pushover.userKey).toBe(REDACTED_NOTIFICATION_SECRET);
		expect(redacted.pushover.apiToken).toBe(REDACTED_NOTIFICATION_SECRET);

		expect(redacted.email.smtpServer).toBe("smtp.example.com");
		expect(redacted.gotify.serverUrl).toBe("https://gotify.example.com");
		expect(redacted.ntfy.topic).toBe("deploys");
	});

	it("treats redacted required secrets as preserve-on-update values", () => {
		expect(notificationSecretUpdateValue(REDACTED_NOTIFICATION_SECRET)).toBe(
			undefined,
		);
		expect(notificationSecretUpdateValue("")).toBe(undefined);
		expect(notificationSecretUpdateValue("new-secret")).toBe("new-secret");
	});

	it("allows optional notification secrets to be cleared explicitly", () => {
		expect(
			notificationOptionalSecretUpdateValue(REDACTED_NOTIFICATION_SECRET),
		).toBe(undefined);
		expect(notificationOptionalSecretUpdateValue("")).toBe(null);
		expect(notificationOptionalSecretUpdateValue("new-secret")).toBe(
			"new-secret",
		);
	});

	it("rejects unsafe cloud HTTP notification targets before fetch", () => {
		const unsafeTargets = [
			"http://127.0.0.1:8080/webhook",
			"https://169.254.169.254/latest/meta-data",
			"https://[::1]/webhook",
			"https://[fea0::1]/webhook",
			"https://webhook.internal/path",
			"https://hooks",
			"https://user:pass@example.com/webhook",
			"http://example.com/webhook",
		];

		for (const target of unsafeTargets) {
			expect(() =>
				normalizeNotificationHttpUrl(target, {
					allowPrivateNetwork: false,
					fieldName: "Notification webhook URL",
				}),
			).toThrow(/notification/i);
		}
	});

	it("preserves safe webhook path and query data for public cloud targets", () => {
		expect(
			normalizeNotificationHttpUrl(
				"https://hooks.slack.com/services/T/B/secret?retry=1",
				{
					allowPrivateNetwork: false,
					fieldName: "Slack webhook URL",
				},
			),
		).toBe("https://hooks.slack.com/services/T/B/secret?retry=1");
	});

	it("rejects public-looking webhook hostnames that resolve to private addresses", async () => {
		await expect(
			assertNotificationHttpUrlAllowed("https://hooks.example.com/webhook", {
				allowPrivateNetwork: false,
				fieldName: "Notification webhook URL",
				lookup: async () => [{ address: "192.168.1.10", family: 4 }],
			}),
		).rejects.toThrow(/Notification webhook URL/i);
	});

	it("allows webhook hostnames that resolve only to public addresses", async () => {
		await expect(
			assertNotificationHttpUrlAllowed(
				"https://hooks.example.com/webhook?retry=1",
				{
					allowPrivateNetwork: false,
					fieldName: "Notification webhook URL",
					lookup: async () => [{ address: "8.8.8.8", family: 4 }],
				},
			),
		).resolves.toBe("https://hooks.example.com/webhook?retry=1");
	});

	it("does not resolve self-hosted notification targets when private networks are allowed", async () => {
		await expect(
			assertNotificationHttpUrlAllowed("http://127.0.0.1:8080/webhook", {
				allowPrivateNetwork: true,
				fieldName: "Notification webhook URL",
				lookup: async () => {
					throw new Error("lookup should not run");
				},
			}),
		).resolves.toBe("http://127.0.0.1:8080/webhook");
	});

	it("allows private self-hosted notification targets when explicitly allowed", () => {
		expect(
			normalizeNotificationHttpUrl("http://127.0.0.1:8080/webhook", {
				allowPrivateNetwork: true,
				fieldName: "Notification webhook URL",
			}),
		).toBe("http://127.0.0.1:8080/webhook");
	});

	it("normalizes base URLs used for provider path joins", () => {
		expect(
			normalizeNotificationBaseUrl("https://gotify.example.com/base/", {
				allowPrivateNetwork: false,
				fieldName: "Gotify server URL",
			}),
		).toBe("https://gotify.example.com/base");

		expect(() =>
			normalizeNotificationBaseUrl("https://gotify.example.com?token=secret", {
				allowPrivateNetwork: false,
				fieldName: "Gotify server URL",
			}),
		).toThrow(/query/i);
	});

	it("rejects public-looking base URL hostnames that resolve to private addresses", async () => {
		await expect(
			assertNotificationBaseUrlAllowed("https://gotify.example.com/base/", {
				allowPrivateNetwork: false,
				fieldName: "Gotify server URL",
				lookup: async () => [{ address: "172.16.0.10", family: 4 }],
			}),
		).rejects.toThrow(/Gotify server URL/i);
	});

	it("rejects unsafe cloud SMTP hosts before nodemailer delivery", () => {
		expect(
			normalizeNotificationSmtpHost("smtp.gmail.com", {
				allowPrivateNetwork: false,
			}),
		).toBe("smtp.gmail.com");

		for (const host of [
			"127.0.0.1",
			"169.254.169.254",
			"smtp.internal",
			"127.1",
			"10.1",
			"0x7f.0.0.1",
			"0xc0.0xa8.0.1",
			"0251.0376.0251.0376",
		]) {
			expect(() =>
				normalizeNotificationSmtpHost(host, {
					allowPrivateNetwork: false,
				}),
			).toThrow(/SMTP/i);
		}

		expect(
			normalizeNotificationSmtpHost("mail", {
				allowPrivateNetwork: true,
			}),
		).toBe("mail");
	});

	it("rejects public-looking SMTP hosts that resolve to private addresses", async () => {
		await expect(
			assertNotificationSmtpHostAllowed("smtp.example.com", {
				allowPrivateNetwork: false,
				lookup: async () => [{ address: "127.0.0.1", family: 4 }],
			}),
		).rejects.toThrow(/SMTP/i);
	});

	it("pins cloud SMTP delivery to a validated public address", async () => {
		await expect(
			resolveNotificationSmtpTarget("smtp.example.com", {
				allowPrivateNetwork: false,
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			}),
		).resolves.toEqual({
			host: "8.8.8.8",
			servername: "smtp.example.com",
		});
	});

	it("rejects private custom notification endpoints before sending", async () => {
		await expect(
			sendCustomNotification(
				{
					endpoint: "http://127.0.0.1:8080/webhook",
					headers: {
						Authorization: "Bearer caller-secret",
					},
				} as never,
				{ title: "test" },
			),
		).rejects.toThrow(/Custom notification endpoint/i);
	});

	it("does not resolve SMTP hosts when private networks are allowed", async () => {
		await expect(
			assertNotificationSmtpHostAllowed("mail", {
				allowPrivateNetwork: true,
				lookup: async () => {
					throw new Error("lookup should not run");
				},
			}),
		).resolves.toBe("mail");
	});
});
