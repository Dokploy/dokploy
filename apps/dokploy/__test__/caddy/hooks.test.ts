import { db } from "@dokploy/server/db";
import { security } from "@dokploy/server/db/schema";
import {
	createDomain,
	findDomainServerId,
	updateDomainById,
} from "@dokploy/server/services/domain";
import { createSecurity } from "@dokploy/server/services/security";
import { assertTraefikProvider } from "@dokploy/server/services/web-server-settings";
import { syncCaddy } from "@dokploy/server/utils/caddy/sync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/traefik/security");
vi.mock("@dokploy/server/utils/caddy/sync", async (original) => ({
	...(await original<typeof import("@dokploy/server/utils/caddy/sync")>()),
	syncCaddy: vi.fn(async () => {}),
}));

// setup.ts mocks the database with one object shared by every table, so each
// test queues the rows its lookups return, in the order they run.
const findFirst = vi.mocked(db.query.domains.findFirst);
const returns = (...rows: object[]) => {
	for (const row of rows) findFirst.mockResolvedValueOnce(row as never);
};
// It has no transactions either. Running the body is enough here.
db.transaction = ((run: (tx: typeof db) => unknown) => run(db)) as never;

beforeEach(() => {
	findFirst.mockReset();
	vi.mocked(db.insert).mockClear();
	vi.mocked(db.update).mockClear();
	vi.mocked(db.delete).mockClear();
});

describe("findDomainServerId", () => {
	it.each([
		[{ applicationId: "app" }, { serverId: "server" }],
		[{ composeId: "compose" }, { serverId: "server" }],
		[
			{ previewDeploymentId: "preview" },
			{ application: { serverId: "server" } },
		],
	])("finds the server through %j", async (owner, row) => {
		returns(row);
		expect(await findDomainServerId(owner)).toBe("server");
	});

	it("is null for the Dokploy host and for a domain with no owner", async () => {
		returns({ serverId: null });
		expect(await findDomainServerId({ applicationId: "app" })).toBeNull();
		expect(await findDomainServerId({})).toBeNull();
	});
});

describe("on a server that runs Caddy", () => {
	it.each([{ forwardAuthEnabled: true }, { middlewares: ["custom"] }])(
		"an update to %j is refused before it is saved",
		async (change) => {
			returns(
				{ applicationId: "app" },
				{ serverId: "server" },
				{ webServerProvider: "caddy" },
			);
			await expect(updateDomainById("domain", change)).rejects.toThrow(
				"is not available with Caddy",
			);
			expect(db.update).not.toHaveBeenCalled();
		},
	);

	it("a domain with a custom entrypoint is refused before it is inserted", async () => {
		returns({ serverId: "server" }, { webServerProvider: "caddy" });
		await expect(
			createDomain({
				host: "example.com",
				applicationId: "app",
				customEntrypoint: "other",
			}),
		).rejects.toThrow("is not available with Caddy");
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("Traefik-only changes are refused", async () => {
		returns({ webServerProvider: "caddy" });
		await expect(assertTraefikProvider("server")).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("a password rule Caddy does not load is not kept", async () => {
		const rule = { applicationId: "app", username: "amy", password: "secret" };
		returns({ serverId: "server" });
		await createSecurity(rule);
		expect(db.delete).not.toHaveBeenCalled();
		// The second lookup is the deletion's.
		returns({ serverId: "server" }, { serverId: "server" });
		vi.mocked(syncCaddy).mockRejectedValueOnce(new Error("not live"));
		await expect(createSecurity(rule)).rejects.toThrow("not live");
		expect(db.delete).toHaveBeenCalledWith(security);
	});
});

describe("on a server that runs Traefik", () => {
	it("the same update is saved", async () => {
		returns(
			{ applicationId: "app" },
			{ serverId: "server" },
			{ webServerProvider: "traefik" },
		);
		await updateDomainById("domain", { forwardAuthEnabled: true });
		expect(db.update).toHaveBeenCalledOnce();
	});

	it("an ordinary update looks nothing up before it is saved", async () => {
		vi.mocked(db.update).mockImplementationOnce(() => {
			expect(findFirst).not.toHaveBeenCalled();
			return {
				set: () => ({ where: () => ({ returning: async () => [] }) }),
			} as never;
		});
		await updateDomainById("domain", { host: "example.com" });
		expect(db.update).toHaveBeenCalledOnce();
	});

	it("Traefik-only changes are allowed", async () => {
		returns({ webServerProvider: "traefik" });
		await expect(assertTraefikProvider("server")).resolves.toBeUndefined();
	});
});
