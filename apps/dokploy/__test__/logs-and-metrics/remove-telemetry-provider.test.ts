import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleted: [] as unknown[],
	updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	updatedServers: [] as Array<{ serverId: string }>,
	updatedLocal: [] as Array<{ id: string }>,
	queried: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => {
	const tx = {
		delete: () => ({
			where: () => ({
				returning: () => Promise.resolve(mocks.deleted),
			}),
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: () => ({
					returning: () => {
						mocks.updates.push({ table, values });
						return Promise.resolve(
							mocks.updates.length === 1
								? mocks.updatedServers
								: mocks.updatedLocal,
						);
					},
				}),
			}),
		}),
	};
	return {
		db: {
			transaction: (fn: (tx: unknown) => unknown) => fn(tx),
			query: {
				server: { findMany: mocks.queried },
				webServerSettings: { findFirst: mocks.queried },
			},
		},
	};
});

const { server, webServerSettings } = await import("@dokploy/server/db/schema");
const { removeTelemetryProvider } = await import(
	"@dokploy/server/services/logs-and-metrics/service"
);

const render = (value: unknown) => new PgDialect().sqlToQuery(value as SQL).sql;

describe("removeTelemetryProvider", () => {
	beforeEach(() => {
		mocks.updates = [];
		mocks.updatedServers = [{ serverId: "server-1" }];
		mocks.updatedLocal = [{ id: "ws-1" }];
		mocks.queried.mockReset();
	});

	it("drops the provider id from the selection of every server and of the local host", async () => {
		mocks.deleted = [{ telemetryProviderId: "lp-1" }];

		const { provider, targets } = await removeTelemetryProvider("lp-1");
		expect(provider).toEqual({ telemetryProviderId: "lp-1" });
		expect(targets).toEqual(["server-1", null]);

		expect(mocks.updates.map((u) => u.table)).toEqual([
			server,
			webServerSettings,
		]);
		expect(render(mocks.updates[0]?.values.telemetryProviderIds)).toBe(
			'array_remove("server"."telemetryProviderIds", $1)',
		);
		expect(render(mocks.updates[1]?.values.telemetryProviderIds)).toBe(
			'array_remove("webServerSettings"."telemetryProviderIds", $1)',
		);
		expect(render(mocks.updates[1]?.values.vectorAgentOrganizationId)).toBe(
			'CASE WHEN cardinality(array_remove("webServerSettings"."telemetryProviderIds", $1)) = 0 THEN NULL ELSE "webServerSettings"."vectorAgentOrganizationId" END',
		);
	});

	it("reconciles exactly the hosts whose selection the transaction updated", async () => {
		mocks.deleted = [{ telemetryProviderId: "lp-1" }];
		mocks.updatedServers = [{ serverId: "server-1" }, { serverId: "server-2" }];
		mocks.updatedLocal = [];

		const { targets } = await removeTelemetryProvider("lp-1");
		expect(targets).toEqual(["server-1", "server-2"]);
		expect(mocks.queried).not.toHaveBeenCalled();
	});

	it("does not touch assignments when the provider does not exist", async () => {
		mocks.deleted = [];

		await expect(removeTelemetryProvider("missing")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mocks.updates).toEqual([]);
	});
});
