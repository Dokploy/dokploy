import { readFile } from "node:fs/promises";
import {
	notifications,
	traefikUpdateDeliveries,
} from "@dokploy/server/db/schema";
import * as schemas from "@dokploy/server/db/schema/notification";
import * as settings from "@dokploy/server/services/settings";
import { TRAEFIK_VERSION } from "@dokploy/server/setup/traefik-setup";
import {
	checkTraefikUpdates,
	initTraefikUpdateChecks,
} from "@dokploy/server/utils/notifications/traefik-update";
import { PGlite } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
	isCloud: false,
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	sendCustomNotification: vi.fn(),
	sendSlackNotification: vi.fn(),
	scheduleJob: vi.fn(),
	findDestinations: vi.fn(),
	findServers: vi.fn(),
	insert: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: mocks.insert,
		update: mocks.update,
		delete: mocks.delete,
		query: {
			notifications: { findMany: mocks.findDestinations },
			server: { findMany: mocks.findServers },
		},
	},
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	get IS_CLOUD() {
		return mocks.isCloud;
	},
}));

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn(async () => "https://dokploy.example.com"),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	sleep: vi.fn(),
}));

vi.mock(
	"@dokploy/server/utils/notifications/utils",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/utils/notifications/utils")
		>()),
		sendCustomNotification: mocks.sendCustomNotification,
		sendSlackNotification: mocks.sendSlackNotification,
	}),
);

vi.mock("node-schedule", () => ({ scheduleJob: mocks.scheduleJob }));

describe("Traefik update notification preferences", () => {
	it.each([
		["Slack", schemas.apiCreateSlack, schemas.apiUpdateSlack],
		["Telegram", schemas.apiCreateTelegram, schemas.apiUpdateTelegram],
		["Discord", schemas.apiCreateDiscord, schemas.apiUpdateDiscord],
		["Email", schemas.apiCreateEmail, schemas.apiUpdateEmail],
		["Resend", schemas.apiCreateResend, schemas.apiUpdateResend],
		["Gotify", schemas.apiCreateGotify, schemas.apiUpdateGotify],
		["Ntfy", schemas.apiCreateNtfy, schemas.apiUpdateNtfy],
		["Mattermost", schemas.apiCreateMattermost, schemas.apiUpdateMattermost],
		["Custom", schemas.apiCreateCustom, schemas.apiUpdateCustom],
		["Lark", schemas.apiCreateLark, schemas.apiUpdateLark],
		["Teams", schemas.apiCreateTeams, schemas.apiUpdateTeams],
		["Pushover", schemas.apiCreatePushover, schemas.apiUpdatePushover],
	] as const)(
		"accepts legacy %s requests without requiring an opt-in",
		(provider, create, update) => {
			const legacyCreate = {
				name: "Existing integration",
				appDeploy: false,
				appBuildError: false,
				databaseBackup: false,
				dokployBackup: false,
				volumeBackup: false,
				dokployRestart: false,
				dockerCleanup: false,
				serverThreshold: false,
				webhookUrl: "https://example.com/webhook",
				channel: "ops",
				decoration: false,
				botToken: "token",
				chatId: "test",
				messageThreadId: "thread",
				smtpServer: "smtp.example.com",
				smtpPort: 587,
				username: "test",
				password: "test",
				fromAddress: "from@example.com",
				toAddresses: ["to@example.com"],
				apiKey: "key",
				serverUrl: "https://example.com",
				appToken: "token",
				topic: "ops",
				accessToken: "token",
				priority: 1,
				endpoint: "https://example.com",
				userKey: "user-key",
				apiToken: "api-token",
			};
			const legacyUpdate = {
				notificationId: "destination",
				[`${provider.toLowerCase()}Id`]: "integration",
				name: "Renamed integration",
			};

			expect(create.parse(legacyCreate).traefikUpdateAvailable).toBeUndefined();
			expect(update.parse(legacyUpdate).traefikUpdateAvailable).toBeUndefined();
			expect(
				create.parse({ ...legacyCreate, traefikUpdateAvailable: true })
					.traefikUpdateAvailable,
			).toBe(true);
			expect(
				update.parse({ ...legacyUpdate, traefikUpdateAvailable: false })
					.traefikUpdateAvailable,
			).toBe(false);
		},
	);
});

describe("Traefik update notifications", () => {
	const connection = new PGlite();
	const database = drizzle(connection, {
		schema: { notifications, traefikUpdateDeliveries },
	});

	beforeAll(async () => {
		await connection.exec(`
			CREATE TABLE "notification" ("notificationId" text PRIMARY KEY);
		`);
		await connection.exec(
			await readFile(
				new URL(
					"../../drizzle/0205_add_traefik_update_notifications.sql",
					import.meta.url,
				),
				"utf8",
			),
		);
	});

	afterAll(async () => {
		await connection.close();
	});

	beforeEach(async () => {
		await connection.exec('TRUNCATE TABLE "notification" CASCADE');
		vi.restoreAllMocks();
		vi.resetAllMocks();
		mocks.isCloud = false;
		mocks.execAsync.mockResolvedValue({
			stdout: "traefik:v3.6.25|running|",
			stderr: "",
		});
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: "traefik:v3.6.25|running|",
			stderr: "",
		});
		mocks.insert.mockImplementation(database.insert.bind(database));
		mocks.update.mockImplementation(database.update.bind(database));
		mocks.delete.mockImplementation(database.delete.bind(database));
		mocks.findServers.mockResolvedValue([]);
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const destinations = async (
		...entries: {
			id: string;
			organizationId?: string;
			enabled?: boolean | null;
			type?: "custom" | "slack" | "lark";
		}[]
	) => {
		const rows = entries.map(
			({ id, organizationId = "org-a", enabled = true, type = "custom" }) => ({
				notificationId: id,
				organizationId,
				traefikUpdateAvailable: enabled,
				notificationType: type,
				lark:
					type === "lark" ? { webhookUrl: "https://lark.example.com" } : null,
				custom:
					type === "custom"
						? { endpoint: "https://webhook.example.com" }
						: null,
				slack:
					type === "slack"
						? { webhookUrl: "https://slack.example.com", channel: "#ops" }
						: null,
			}),
		);
		for (const row of rows) {
			if (row.traefikUpdateAvailable === null) {
				await connection.query(
					'INSERT INTO "notification" ("notificationId") VALUES ($1)',
					[row.notificationId],
				);
			} else {
				await connection.query(
					'INSERT INTO "notification" ("notificationId", "traefikUpdateAvailable") VALUES ($1, $2)',
					[row.notificationId, row.traefikUpdateAvailable],
				);
			}
		}
		mocks.findDestinations.mockImplementation(async (query: { where: SQL }) => {
			const optedIn = await database
				.select({
					notificationId: notifications.notificationId,
				})
				.from(notifications)
				.where(query.where);
			return rows.filter((row) =>
				optedIn.some((item) => item.notificationId === row.notificationId),
			);
		});
	};

	it("registers a daily background check", () => {
		initTraefikUpdateChecks();
		expect(mocks.scheduleJob).toHaveBeenCalledWith(
			"traefik-update-check",
			"0 4 * * *",
			expect.any(Function),
		);
	});

	it("sends the installed and recommended versions with settings and release notes", async () => {
		await destinations({ id: "webhook" });

		await checkTraefikUpdates();

		expect(mocks.sendCustomNotification).toHaveBeenCalledExactlyOnceWith(
			expect.any(Object),
			expect.objectContaining({
				type: "traefik-update-available",
				serverName: "Dokploy server",
				serverId: null,
				currentVersion: "3.6.25",
				recommendedVersion: TRAEFIK_VERSION,
				settingsUrl:
					"https://dokploy.example.com/dashboard/settings/server#traefik",
				releaseNotesUrl: `https://github.com/traefik/traefik/releases/tag/v${TRAEFIK_VERSION}`,
			}),
		);
	});

	it.each([
		["current", `traefik:v${TRAEFIK_VERSION}|running|`],
		["newer", "traefik:v99.0.0|running|"],
		["custom", "registry.example.com/traefik:v3.6.25|running|"],
		["unknown", "traefik:latest|running|"],
		["missing", "missing"],
		["Docker unavailable", "docker-unavailable"],
		["stopped", "traefik:v3.6.25|exited|"],
	])("skips %s Traefik", async (_status, stdout) => {
		await destinations({ id: "webhook" });
		mocks.execAsync.mockResolvedValue({ stdout, stderr: "" });

		await checkTraefikUpdates();

		expect(mocks.sendCustomNotification).not.toHaveBeenCalled();
		expect(await database.select().from(traefikUpdateDeliveries)).toEqual([]);
	});

	it("deduplicates completed and concurrently claimed deliveries", async () => {
		await destinations({ id: "webhook" });
		let releaseDelivery!: () => void;
		mocks.sendCustomNotification.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				releaseDelivery = resolve;
			}),
		);

		const firstCheck = checkTraefikUpdates();
		try {
			await vi.waitFor(() =>
				expect(mocks.sendCustomNotification).toHaveBeenCalledOnce(),
			);
			await checkTraefikUpdates();
			expect(mocks.sendCustomNotification).toHaveBeenCalledOnce();
		} finally {
			releaseDelivery();
			await firstCheck;
		}
		await checkTraefikUpdates();
		expect(mocks.sendCustomNotification).toHaveBeenCalledOnce();
	});

	it("sends another alert when the recommended version changes", async () => {
		await destinations({ id: "webhook" });
		await checkTraefikUpdates();
		vi.spyOn(settings, "getTraefikOverview").mockResolvedValue({
			state: "running",
			startedAt: null,
			image: "traefik:v3.6.25",
			currentVersion: "3.6.25",
			recommendedVersion: "3.99.1",
			versionStatus: "outdated",
		});

		await checkTraefikUpdates();

		expect(mocks.sendCustomNotification).toHaveBeenCalledTimes(2);
		expect(mocks.sendCustomNotification).toHaveBeenLastCalledWith(
			expect.any(Object),
			expect.objectContaining({ recommendedVersion: "3.99.1" }),
		);
	});

	it("retries a failed destination without resending to a successful destination", async () => {
		await destinations({ id: "webhook" }, { id: "slack", type: "slack" });
		mocks.sendCustomNotification.mockRejectedValueOnce(
			new Error("secret token"),
		);

		await checkTraefikUpdates();
		await checkTraefikUpdates();

		expect(mocks.sendCustomNotification).toHaveBeenCalledTimes(2);
		expect(mocks.sendSlackNotification).toHaveBeenCalledOnce();
		expect(console.warn).toHaveBeenCalledExactlyOnceWith(
			"[Traefik] Update notification failed",
			{ notificationId: "webhook", serverId: undefined },
		);
	});

	it("retries when Lark rejects a webhook with an HTTP 200 response", async () => {
		await destinations({ id: "lark", type: "lark" });
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ code: 19001 }))
			.mockResolvedValueOnce(Response.json({ code: 0 }));
		vi.stubGlobal("fetch", fetch);

		await checkTraefikUpdates();
		expect(await database.select().from(traefikUpdateDeliveries)).toEqual([]);

		await checkTraefikUpdates();
		await checkTraefikUpdates();
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("reclaims an expired delivery after a worker stops before recording success", async () => {
		await destinations({ id: "webhook" });
		await database.insert(traefikUpdateDeliveries).values({
			notificationId: "webhook",
			serverKey: "local",
			recommendedVersion: TRAEFIK_VERSION,
			claimToken: "abandoned",
			claimedUntil: new Date(0),
		});

		await checkTraefikUpdates();

		expect(mocks.sendCustomNotification).toHaveBeenCalledOnce();
		expect(await database.select().from(traefikUpdateDeliveries)).toEqual([
			expect.objectContaining({ deliveredAt: expect.any(Date) }),
		]);
	});

	it("isolates remote failures and sends only to destinations in the server's organization", async () => {
		mocks.isCloud = true;
		await destinations(
			{ id: "a-webhook" },
			{ id: "a-slack", type: "slack" },
			{ id: "b-webhook", organizationId: "org-b" },
		);
		mocks.findServers.mockResolvedValue([
			{ serverId: "offline", name: "Offline", organizationId: "org-a" },
			{ serverId: "remote-a", name: "Remote A", organizationId: "org-a" },
			{ serverId: "remote-b", name: "Remote B", organizationId: "org-b" },
		]);
		let rejectConnection!: (error: Error) => void;
		mocks.execAsyncRemote.mockReturnValueOnce(
			new Promise<never>((_, reject) => {
				rejectConnection = reject;
			}),
		);

		const check = checkTraefikUpdates();
		try {
			await vi.waitFor(() =>
				expect(mocks.sendCustomNotification).toHaveBeenCalledTimes(2),
			);
		} finally {
			rejectConnection(new Error("SSH connection refused"));
			await check;
		}

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(3);
		expect(mocks.sendSlackNotification).toHaveBeenCalledExactlyOnceWith(
			expect.any(Object),
			expect.objectContaining({
				text: expect.stringContaining("Remote A (remote-a)"),
			}),
		);
		expect(await database.select().from(traefikUpdateDeliveries)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					notificationId: "a-webhook",
					serverKey: "remote:remote-a",
				}),
				expect.objectContaining({
					notificationId: "a-slack",
					serverKey: "remote:remote-a",
				}),
				expect.objectContaining({
					notificationId: "b-webhook",
					serverKey: "remote:remote-b",
				}),
			]),
		);
		expect(mocks.sendCustomNotification).toHaveBeenCalledTimes(2);
		expect(mocks.sendCustomNotification).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				settingsUrl:
					"https://dokploy.example.com/dashboard/settings/servers#server-remote-b",
			}),
		);
	});

	it("skips checks when a destination uses the default opt-out", async () => {
		await destinations({ id: "existing", enabled: null });

		await checkTraefikUpdates();

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.sendCustomNotification).not.toHaveBeenCalled();
	});

	it("only runs read-only Docker commands locally and over SSH", async () => {
		await destinations({ id: "webhook" });
		mocks.findServers.mockResolvedValue([
			{ serverId: "remote-a", name: "Remote A", organizationId: "org-a" },
		]);

		await checkTraefikUpdates();

		expect(mocks.execAsync).toHaveBeenCalledOnce();
		expect(mocks.execAsyncRemote).toHaveBeenCalledOnce();
		const commands = [
			mocks.execAsync.mock.calls[0]?.[0],
			mocks.execAsyncRemote.mock.calls[0]?.[1],
		] as string[];
		for (const command of commands) {
			expect(command.match(/\bdocker (?:service |container )?\w+/g)).toEqual([
				"docker info",
				"docker service inspect",
				"docker service ps",
				"docker service ps",
				"docker inspect",
				"docker service inspect",
				"docker container inspect",
				"docker container inspect",
			]);
		}
	});
});
