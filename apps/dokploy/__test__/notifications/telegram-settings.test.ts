import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	storedTelegram: {} as Record<string, unknown>,
}));

vi.mock("@dokploy/server/db", () => {
	const tx = {
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => ({
				returning: () => {
					mocks.inserts.push({ table, values });
					if ("botToken" in values) {
						mocks.storedTelegram = { telegramId: "telegram-1", ...values };
					}
					return Promise.resolve([
						{
							telegramId: "telegram-1",
							notificationId: "notification-1",
							...values,
						},
					]);
				},
			}),
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: () => ({
					returning: () => {
						mocks.updates.push({ table, values });
						if ("botToken" in values) {
							for (const [key, value] of Object.entries(values)) {
								if (value !== undefined) {
									mocks.storedTelegram[key] = value;
								}
							}
						}
						return Promise.resolve([
							{ notificationId: "notification-1", ...values },
						]);
					},
				}),
			}),
		}),
	};
	return {
		db: {
			transaction: (callback: (tx: unknown) => unknown) => callback(tx),
		},
	};
});

const {
	apiCreateTelegram,
	apiTestTelegramConnection,
	apiUpdateTelegram,
	notifications,
	telegram,
	telegramProxyUrlSchema,
} = await import("@dokploy/server/db/schema/notification");
const { createTelegramNotification, updateTelegramNotification } = await import(
	"@dokploy/server/services/notification"
);

const createInput = {
	name: "Telegram deployments",
	botToken: "123456:bot-token",
	chatId: "-1001234567890",
	messageThreadId: "42",
	appDeploy: true,
	appBuildError: true,
	databaseBackup: false,
	dokployBackup: false,
	volumeBackup: false,
	dokployRestart: false,
	dockerCleanup: false,
	serverThreshold: false,
};

const updateIds = {
	notificationId: "notification-1",
	telegramId: "telegram-1",
};

type ProxyInput = { proxyUrl?: string | null };

describe("Telegram proxy settings schema", () => {
	it.each([undefined, null, "", "  "])(
		"accepts an unset proxy value: %s",
		(proxyUrl) => {
			expect(telegramProxyUrlSchema.parse(proxyUrl)).toBe(
				typeof proxyUrl === "string" ? "" : proxyUrl,
			);
		},
	);

	it.each([
		"socks5://127.0.0.1:1080",
		"socks5h://proxy.example.com:1080",
		"socks5://proxy.example.com",
		"socks5h://proxy.example.com:1080/",
		"socks5://user:pass@proxy.example.com:1080",
		"socks5h://user%40name:p%3Ass@proxy.example.com:1080",
	])("accepts SOCKS5 proxy URL %s", (proxyUrl) => {
		expect(telegramProxyUrlSchema.parse(`  ${proxyUrl}  `)).toBe(proxyUrl);
	});

	it.each([
		"http://proxy.example.com:1080",
		"https://proxy.example.com:1080",
		"socks4://proxy.example.com:1080",
		"not-a-url",
		"socks5://",
		"socks5://:1080",
		"socks5://proxy.example.com:invalid",
		"socks5://proxy.example.com:0",
		"socks5://proxy.example.com:65536",
		"socks5://proxy.example.com:1080/telegram",
		"socks5://proxy.example.com:1080?token=secret",
		"socks5://proxy.example.com:1080#telegram",
	])("rejects invalid proxy URL %s", (proxyUrl) => {
		expect(telegramProxyUrlSchema.safeParse(proxyUrl).success).toBe(false);
	});

	it("keeps proxyUrl optional for existing create and update clients", () => {
		expect(apiCreateTelegram.parse(createInput)).toEqual(createInput);
		expect(apiUpdateTelegram.parse(updateIds)).toEqual(updateIds);
	});

	it.each([null, "", "  socks5h://user:pass@proxy.example.com:1080  "])(
		"accepts the same proxy setting in create, update, and connection-test inputs: %s",
		(proxyUrl) => {
			const expected = typeof proxyUrl === "string" ? proxyUrl.trim() : null;
			const connectionInput = {
				botToken: createInput.botToken,
				chatId: createInput.chatId,
				messageThreadId: createInput.messageThreadId,
			};
			expect(
				apiCreateTelegram.parse({ ...createInput, proxyUrl }).proxyUrl,
			).toBe(expected);
			expect(apiUpdateTelegram.parse({ ...updateIds, proxyUrl }).proxyUrl).toBe(
				expected,
			);
			expect(
				apiTestTelegramConnection.parse({ ...connectionInput, proxyUrl })
					.proxyUrl,
			).toBe(expected);
		},
	);

	it("allows testing an existing Telegram connection without proxy settings", () => {
		const input = {
			botToken: createInput.botToken,
			chatId: createInput.chatId,
			messageThreadId: "",
		};
		expect(apiTestTelegramConnection.parse(input)).toEqual(input);
	});

	it.each(Object.keys(createInput))(
		"still requires the existing create field %s",
		(field) => {
			const input = { ...createInput } as Record<string, unknown>;
			delete input[field];
			expect(apiCreateTelegram.safeParse(input).success).toBe(false);
		},
	);

	it.each(["botToken", "chatId"])("still rejects an empty %s", (field) => {
		expect(
			apiCreateTelegram.safeParse({ ...createInput, [field]: "" }).success,
		).toBe(false);
	});
});

describe("Telegram proxy settings persistence", () => {
	beforeEach(() => {
		mocks.inserts = [];
		mocks.updates = [];
		mocks.storedTelegram = {
			telegramId: "telegram-1",
			botToken: createInput.botToken,
			chatId: createInput.chatId,
			messageThreadId: createInput.messageThreadId,
			proxyUrl: "socks5h://existing.example.com:1080",
		};
	});

	it.each<[string, ProxyInput, string | null]>([
		["omitted", {}, null],
		["empty", { proxyUrl: "" }, null],
		["null", { proxyUrl: null }, null],
		["whitespace", { proxyUrl: "  " }, null],
		[
			"configured",
			{ proxyUrl: "  socks5h://user:pass@proxy.example.com:1080  " },
			"socks5h://user:pass@proxy.example.com:1080",
		],
	])(
		"creates a notification with %s proxy settings",
		async (_, proxyInput, expected) => {
			const input = apiCreateTelegram.parse({ ...createInput, ...proxyInput });
			await createTelegramNotification(input, "organization-1");

			expect(
				mocks.inserts.find((insert) => insert.table === telegram)?.values,
			).toEqual({
				botToken: createInput.botToken,
				chatId: createInput.chatId,
				messageThreadId: createInput.messageThreadId,
				proxyUrl: expected,
			});
			expect(
				mocks.inserts.find((insert) => insert.table === notifications)?.values,
			).toMatchObject({
				telegramId: "telegram-1",
				organizationId: "organization-1",
				notificationType: "telegram",
				name: createInput.name,
			});
		},
	);

	it("preserves an existing proxy when an update omits proxyUrl", async () => {
		await updateTelegramNotification(
			apiUpdateTelegram.parse({
				...createInput,
				...updateIds,
				name: "Renamed notification",
			}),
		);

		const values = mocks.updates.find(
			(update) => update.table === telegram,
		)?.values;
		expect(values).toBeDefined();
		expect(values?.proxyUrl).toBeUndefined();
		expect(mocks.storedTelegram.proxyUrl).toBe(
			"socks5h://existing.example.com:1080",
		);
		expect(
			mocks.updates.find((update) => update.table === notifications)?.values
				.name,
		).toBe("Renamed notification");
	});

	it.each<[string, ProxyInput, string | null]>([
		["empty", { proxyUrl: "" }, null],
		["null", { proxyUrl: null }, null],
		["whitespace", { proxyUrl: "  " }, null],
		[
			"configured",
			{ proxyUrl: "  socks5://user:pass@replacement.example.com:1080  " },
			"socks5://user:pass@replacement.example.com:1080",
		],
	])("updates %s proxy settings", async (_, proxyInput, expected) => {
		const input = apiUpdateTelegram.parse({
			...updateIds,
			organizationId: "organization-1",
			...proxyInput,
		});
		await updateTelegramNotification(input);

		expect(
			mocks.updates.find((update) => update.table === telegram)?.values
				.proxyUrl,
		).toBe(expected);
		expect(mocks.storedTelegram).toMatchObject({
			botToken: createInput.botToken,
			chatId: createInput.chatId,
			messageThreadId: createInput.messageThreadId,
			proxyUrl: expected,
		});
	});
});
