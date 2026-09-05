import { beforeEach, describe, expect, it, vi } from "vitest";

type DeleteCall = {
	table: unknown;
	cond: unknown;
};

const recorder = vi.hoisted(() => {
	const state = {
		deleteCalls: [] as DeleteCall[],
		notificationsReturning: [] as unknown[],
	};

	type Chain = {
		where: (cond: unknown) => Chain;
		returning: () => Promise<unknown[]>;
	};

	const buildChain = (table: unknown): Chain => {
		const self: Chain = {
			where(cond: unknown) {
				state.deleteCalls.push({ table, cond });
				return self;
			},
			returning() {
				return Promise.resolve(state.notificationsReturning);
			},
		};
		return self;
	};

	const tx = { delete: vi.fn((table: unknown) => buildChain(table)) };
	const dbMock = {
		transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
		delete: vi.fn(),
	};

	return {
		dbMock,
		deleteCalls: state.deleteCalls,
		reset: () => {
			state.deleteCalls.length = 0;
			state.notificationsReturning = [];
		},
		setNotificationReturning: (rows: unknown[]) => {
			state.notificationsReturning = rows;
		},
	};
});

vi.mock("@dokploy/server/db", () => ({ db: recorder.dbMock }));

import {
	custom,
	discord,
	email,
	gotify,
	lark,
	mattermost,
	notifications,
	ntfy,
	pushover,
	resend,
	slack,
	teams,
	telegram,
} from "@dokploy/server/db/schema";
import { removeNotificationById } from "@dokploy/server/services/notification";

const PROVIDERS = [
	{ type: "slack", table: slack, idCol: "slackId" },
	{ type: "telegram", table: telegram, idCol: "telegramId" },
	{ type: "discord", table: discord, idCol: "discordId" },
	{ type: "email", table: email, idCol: "emailId" },
	{ type: "resend", table: resend, idCol: "resendId" },
	{ type: "gotify", table: gotify, idCol: "gotifyId" },
	{ type: "ntfy", table: ntfy, idCol: "ntfyId" },
	{ type: "mattermost", table: mattermost, idCol: "mattermostId" },
	{ type: "custom", table: custom, idCol: "customId" },
	{ type: "lark", table: lark, idCol: "larkId" },
	{ type: "pushover", table: pushover, idCol: "pushoverId" },
	{ type: "teams", table: teams, idCol: "teamsId" },
] as const;

const ALL_PROVIDER_TABLES = PROVIDERS.map((p) => p.table);

const chunkInfo = (cond: unknown): { column: unknown; value: unknown } => {
	const chunks =
		(cond as { queryChunks?: unknown[] } | null)?.queryChunks ?? [];
	let column: unknown;
	let value: unknown;
	for (const c of chunks) {
		if (!c || typeof c !== "object") {
			continue;
		}
		if (value === undefined && "value" in c && "encoder" in c) {
			value = (c as { value: unknown }).value;
		} else if (column === undefined && "table" in c && "dataType" in c) {
			column = c;
		}
	}
	return { column, value };
};

const callsFor = (table: unknown): DeleteCall[] =>
	recorder.deleteCalls.filter((c) => c.table === table);

beforeEach(() => {
	recorder.reset();
	vi.clearAllMocks();
});

describe("removeNotificationById", () => {
	describe("provider row cleanup", () => {
		it.each(PROVIDERS.map((p) => [p.type, p] as const))(
			"deletes the linked %s provider row inside the transaction",
			async (type, provider) => {
				const providerId = `${type}-row-id`;
				const deletedRow = {
					notificationId: "notif-1",
					name: "n",
					notificationType: type,
					organizationId: "org",
					[provider.idCol]: providerId,
				};
				recorder.setNotificationReturning([deletedRow]);

				const result = await removeNotificationById("notif-1");

				expect(result).toBe(deletedRow);
				expect(recorder.dbMock.transaction).toHaveBeenCalledTimes(1);

				const notifCalls = callsFor(notifications);
				expect(notifCalls).toHaveLength(1);
				const notifInfo = chunkInfo(notifCalls[0]?.cond);
				expect(notifInfo.column).toBe(notifications.notificationId);
				expect(notifInfo.value).toBe("notif-1");

				const providerCalls = callsFor(provider.table);
				expect(providerCalls).toHaveLength(1);
				const providerInfo = chunkInfo(providerCalls[0]?.cond);
				const expectedColumn = (
					provider.table as unknown as Record<string, unknown>
				)[provider.idCol];
				expect(providerInfo.column).toBe(expectedColumn);
				expect(providerInfo.value).toBe(providerId);

				for (const other of ALL_PROVIDER_TABLES) {
					if (other === provider.table) {
						continue;
					}
					expect(callsFor(other)).toHaveLength(0);
				}

				expect(recorder.dbMock.delete).not.toHaveBeenCalled();
			},
		);
	});

	it("returns undefined and deletes no provider row when the notification does not exist", async () => {
		recorder.setNotificationReturning([]);

		const result = await removeNotificationById("missing-id");

		expect(result).toBeUndefined();
		expect(recorder.dbMock.transaction).toHaveBeenCalledTimes(1);
		expect(callsFor(notifications)).toHaveLength(1);
		for (const table of ALL_PROVIDER_TABLES) {
			expect(callsFor(table)).toHaveLength(0);
		}
	});

	it("skips the provider delete without throwing when the matching id is null", async () => {
		const deletedRow = {
			notificationId: "notif-2",
			name: "n",
			notificationType: "slack",
			organizationId: "org",
			slackId: null,
		};
		recorder.setNotificationReturning([deletedRow]);

		const result = await removeNotificationById("notif-2");

		expect(result).toBe(deletedRow);
		expect(callsFor(notifications)).toHaveLength(1);
		for (const table of ALL_PROVIDER_TABLES) {
			expect(callsFor(table)).toHaveLength(0);
		}
	});

	it("deletes only the provider matching notificationType, not a stray id of another type", async () => {
		const deletedRow = {
			notificationId: "notif-3",
			name: "n",
			notificationType: "slack",
			organizationId: "org",
			slackId: null,
			discordId: "stray-discord-id",
		};
		recorder.setNotificationReturning([deletedRow]);

		const result = await removeNotificationById("notif-3");

		expect(result).toBe(deletedRow);
		expect(callsFor(notifications)).toHaveLength(1);
		expect(callsFor(slack)).toHaveLength(0);
		expect(callsFor(discord)).toHaveLength(0);
		for (const table of ALL_PROVIDER_TABLES) {
			expect(callsFor(table)).toHaveLength(0);
		}
	});

	it("does not call db.delete directly on the top-level db", async () => {
		recorder.setNotificationReturning([
			{
				notificationId: "notif-4",
				name: "n",
				notificationType: "slack",
				organizationId: "org",
				slackId: "slack-id",
			},
		]);

		await removeNotificationById("notif-4");

		expect(recorder.dbMock.delete).not.toHaveBeenCalled();
	});
});
