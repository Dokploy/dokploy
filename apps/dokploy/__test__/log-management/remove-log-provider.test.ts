import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleted: [] as unknown[],
	updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
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
				where: () => {
					mocks.updates.push({ table, values });
					return Promise.resolve();
				},
			}),
		}),
	};
	return {
		db: { transaction: (fn: (tx: unknown) => unknown) => fn(tx) },
	};
});

const { server, webServerSettings } = await import("@dokploy/server/db/schema");
const { removeLogProvider } = await import(
	"@dokploy/server/services/log-management/service"
);

const render = (value: unknown) => new PgDialect().sqlToQuery(value as SQL).sql;

describe("removeLogProvider", () => {
	beforeEach(() => {
		mocks.updates = [];
	});

	it("drops the provider id from every server and from the local host", async () => {
		mocks.deleted = [{ logProviderId: "lp-1" }];

		await removeLogProvider("lp-1");

		expect(mocks.updates.map((u) => u.table)).toEqual([
			server,
			webServerSettings,
		]);
		expect(render(mocks.updates[0]?.values.logProviderIds)).toBe(
			'array_remove("server"."logProviderIds", $1)',
		);
		expect(render(mocks.updates[1]?.values.logProviderIds)).toBe(
			'array_remove("webServerSettings"."logProviderIds", $1)',
		);
		expect(render(mocks.updates[1]?.values.logManagementOrganizationId)).toBe(
			'CASE WHEN cardinality(array_remove("webServerSettings"."logProviderIds", $1)) = 0 THEN NULL ELSE "webServerSettings"."logManagementOrganizationId" END',
		);
	});

	it("does not touch assignments when the provider does not exist", async () => {
		mocks.deleted = [];

		await expect(removeLogProvider("missing")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mocks.updates).toEqual([]);
	});
});
