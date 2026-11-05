import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	updates: [] as Array<{ values: Record<string, unknown>; where: unknown }>,
	returning: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { webServerSettings: { findFirst: mocks.findFirst } },
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: (where: unknown) => {
					mocks.updates.push({ values, where });
					return { returning: () => Promise.resolve(mocks.returning()) };
				},
			}),
		}),
	},
}));

const { releaseWebServerAgent, setWebServerProviderIds } = await import(
	"@dokploy/server/services/web-server-settings"
);

const render = (value: unknown) => new PgDialect().sqlToQuery(value as SQL).sql;

beforeEach(() => {
	mocks.updates = [];
	mocks.findFirst.mockResolvedValue({
		id: "ws-1",
		vectorAgentOrganizationId: "org-a",
	});
	mocks.returning.mockReturnValue([{ id: "ws-1" }]);
});

describe("setWebServerProviderIds", () => {
	it("claims the local agent for the organization when assigning providers", async () => {
		const row = await setWebServerProviderIds("org-a", ["lp-1", "mp-1"]);

		expect(row).toEqual({ id: "ws-1" });
		const update = mocks.updates[0];
		expect(update?.values).toMatchObject({
			telemetryProviderIds: ["lp-1", "mp-1"],
			vectorAgentOrganizationId: "org-a",
		});
		expect(render(update?.where)).toBe(
			'("webServerSettings"."id" = $1 and ("webServerSettings"."vectorAgentOrganizationId" is null or "webServerSettings"."vectorAgentOrganizationId" = $2))',
		);
	});

	it("releases the owner when the selection is cleared", async () => {
		await setWebServerProviderIds("org-a", []);

		expect(mocks.updates[0]?.values).toMatchObject({
			telemetryProviderIds: [],
			vectorAgentOrganizationId: null,
		});
	});

	it("returns null when another organization owns the local agent", async () => {
		mocks.returning.mockReturnValue([]);

		await expect(
			setWebServerProviderIds("org-b", ["lp-9"]),
		).resolves.toBeNull();
	});
});

describe("releaseWebServerAgent", () => {
	it("clears the selection and the owner only for the owning organization", async () => {
		await releaseWebServerAgent("org-a");

		const update = mocks.updates[0];
		expect(update?.values).toMatchObject({
			telemetryProviderIds: [],
			vectorAgentOrganizationId: null,
		});
		expect(render(update?.where)).toBe(
			'"webServerSettings"."vectorAgentOrganizationId" = $1',
		);
	});
});
