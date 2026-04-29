import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, drizzleSpies, utilsSpies } = vi.hoisted(() => {
	return {
		findManyMock: vi.fn(),
		drizzleSpies: {
			and: vi.fn((...parts: unknown[]) => ({ kind: "and", parts })),
			eq: vi.fn((column: unknown, value: unknown) => ({
				kind: "eq",
				column,
				value,
			})),
		},
		utilsSpies: {
			sendCustomNotification: vi.fn(),
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
		},
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			notifications: {
				findMany: (...args: unknown[]) => findManyMock(...args),
			},
		},
	},
}));

vi.mock("@dokploy/server/db/schema", () => ({
	notifications: {
		backupSuccess: { _column: "backupSuccess" },
		backupFailure: { _column: "backupFailure" },
		organizationId: { _column: "organizationId" },
	},
}));

vi.mock("drizzle-orm", () => ({
	and: (...parts: unknown[]) => drizzleSpies.and(...parts),
	eq: (column: unknown, value: unknown) => drizzleSpies.eq(column, value),
}));

vi.mock("@react-email/components", () => ({
	renderAsync: vi.fn().mockResolvedValue("<html>rendered</html>"),
}));

vi.mock("@dokploy/server/emails/emails/database-backup", () => ({
	default: vi.fn(() => ({ __email: "DatabaseBackupEmail" })),
}));

vi.mock(
	"../../../../packages/server/src/utils/notifications/utils",
	() => utilsSpies,
);

import { sendDatabaseBackupNotifications } from "@dokploy/server/utils/notifications/database-backup";

const baseArgs = {
	projectName: "acme",
	applicationName: "payments-db",
	databaseType: "postgres" as const,
	organizationId: "org-1",
	databaseName: "payments",
	schedule: "0 3 * * *",
	destinationBucket: "bucket-a",
	destinationPrefix: "nightly",
	durationMs: 1234,
};

describe("sendDatabaseBackupNotifications", () => {
	beforeEach(() => {
		findManyMock.mockReset();
		drizzleSpies.and.mockClear();
		drizzleSpies.eq.mockClear();
		for (const spy of Object.values(utilsSpies)) {
			spy.mockReset();
		}
	});

	it("filters on backupFailure when type is error", async () => {
		findManyMock.mockResolvedValue([]);

		await sendDatabaseBackupNotifications({
			...baseArgs,
			type: "error",
			errorMessage: "boom",
		});

		expect(findManyMock).toHaveBeenCalledTimes(1);
		const filterColumns = drizzleSpies.eq.mock.calls.map(
			([column]) => (column as any)?._column,
		);
		expect(filterColumns).toContain("backupFailure");
		expect(filterColumns).not.toContain("backupSuccess");
	});

	it("filters on backupSuccess when type is success", async () => {
		findManyMock.mockResolvedValue([]);

		await sendDatabaseBackupNotifications({
			...baseArgs,
			type: "success",
		});

		const filterColumns = drizzleSpies.eq.mock.calls.map(
			([column]) => (column as any)?._column,
		);
		expect(filterColumns).toContain("backupSuccess");
		expect(filterColumns).not.toContain("backupFailure");
	});

	it("does not dispatch when no notifications match", async () => {
		findManyMock.mockResolvedValue([]);

		await sendDatabaseBackupNotifications({
			...baseArgs,
			type: "success",
		});

		for (const spy of Object.values(utilsSpies)) {
			expect(spy).not.toHaveBeenCalled();
		}
	});

	it("dispatches discord with schedule, destination, and duration fields on success", async () => {
		findManyMock.mockResolvedValue([
			{
				discord: { webhookUrl: "https://discord/hook", decoration: false },
			},
		]);

		await sendDatabaseBackupNotifications({
			...baseArgs,
			type: "success",
		});

		expect(utilsSpies.sendDiscordNotification).toHaveBeenCalledTimes(1);
		const [, payload] = utilsSpies.sendDiscordNotification.mock.calls[0] as [
			unknown,
			{ fields: { name: string; value: string }[] },
		];
		const fieldNames = payload.fields.map((f) => f.name.trim());
		expect(fieldNames).toEqual(
			expect.arrayContaining(["Schedule", "Destination", "Duration"]),
		);
		const destinationField = payload.fields.find(
			(f) => f.name.trim() === "Destination",
		);
		expect(destinationField?.value).toBe("bucket-a/nightly");
		const durationField = payload.fields.find(
			(f) => f.name.trim() === "Duration",
		);
		expect(durationField?.value).toBe("1.23s");
	});

	it("truncates error messages to 500 chars across providers", async () => {
		const longError = "E".repeat(5000);
		findManyMock.mockResolvedValue([
			{
				discord: { webhookUrl: "https://discord/hook", decoration: false },
				slack: { webhookUrl: "https://slack/hook", channel: "#ops" },
				telegram: { botToken: "t", chatId: "c", messageThreadId: null },
			},
		]);

		await sendDatabaseBackupNotifications({
			...baseArgs,
			type: "error",
			errorMessage: longError,
		});

		const discordPayload = utilsSpies.sendDiscordNotification.mock.calls[0][1];
		const errorField = discordPayload.fields.find(
			(f: { name: string; value: string }) => f.name.trim() === "Error Message",
		);
		expect(errorField.value.length).toBeLessThanOrEqual(512);
		expect(errorField.value).toMatch(/…```$/);

		const slackPayload = utilsSpies.sendSlackNotification.mock.calls[0][1];
		const slackError = slackPayload.attachments[0].fields.find(
			(f: { title: string; value: string }) => f.title === "Error Message",
		);
		expect(slackError.value.length).toBeLessThanOrEqual(501);

		const telegramMsg = utilsSpies.sendTelegramNotification.mock
			.calls[0][1] as string;
		const preMatch = telegramMsg.match(/<pre>([\s\S]*?)<\/pre>/);
		expect(preMatch?.[1].length ?? 0).toBeLessThanOrEqual(501);
	});
});
