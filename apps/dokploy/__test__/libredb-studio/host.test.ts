import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const domainsFindMany = vi.hoisted(() => vi.fn());
const studioFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			domains: { findMany: domainsFindMany },
			libredbStudio: { findFirst: studioFindFirst },
		},
	},
}));

const { isHostUsedByAnotherService, isLibreDBStudioHost } = await import(
	"@dokploy/server/utils/libredb-studio/host"
);

const STUDIO_APP = "studio-app";

const applicationDomain = (
	host: string,
	applicationId: string,
	serverId: string | null,
) => ({
	host,
	applicationId,
	application: { serverId },
	compose: null,
	previewDeployment: null,
});

const composeDomain = (host: string, serverId: string | null) => ({
	host,
	applicationId: null,
	application: null,
	compose: { serverId },
	previewDeployment: null,
});

const previewDomain = (host: string, serverId: string | null) => ({
	host,
	applicationId: null,
	application: null,
	compose: null,
	previewDeployment: { application: { serverId } },
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("isHostUsedByAnotherService", () => {
	it.each([
		["an application", applicationDomain("Shared.Example.com.", "app-2", null)],
		["a compose", composeDomain("shared.example.com", null)],
		["a preview", previewDomain("shared.example.com", null)],
	])("finds the host on a domain of %s", async (_name, domain) => {
		domainsFindMany.mockResolvedValue([domain]);
		await expect(
			isHostUsedByAnotherService({
				host: "shared.example.com",
				serverId: null,
				studioApplicationId: STUDIO_APP,
			}),
		).resolves.toBe(true);
	});

	it("asks only for the domains with the host's stored forms", async () => {
		domainsFindMany.mockResolvedValue([]);
		await isHostUsedByAnotherService({
			host: "XN--BCHER-KVA.example.",
			serverId: null,
			studioApplicationId: STUDIO_APP,
		});
		const { sql, params } = new PgDialect().sqlToQuery(
			domainsFindMany.mock.calls[0]?.[0].where,
		);
		expect(sql).toBe('lower(rtrim(trim("domain"."host"), \'.\')) in ($1, $2)');
		expect(params).toEqual(["xn--bcher-kva.example", "bücher.example"]);
	});

	it("ignores the Studio's own domains", async () => {
		domainsFindMany.mockResolvedValue([
			applicationDomain("studio.example.com", STUDIO_APP, null),
		]);
		await expect(
			isHostUsedByAnotherService({
				host: "studio.example.com",
				serverId: null,
				studioApplicationId: STUDIO_APP,
			}),
		).resolves.toBe(false);
	});

	it("counts every domain when there is no Studio application yet", async () => {
		domainsFindMany.mockResolvedValue([
			applicationDomain("studio.example.com", STUDIO_APP, null),
		]);
		await expect(
			isHostUsedByAnotherService({
				host: "studio.example.com",
				serverId: null,
			}),
		).resolves.toBe(true);
	});

	it("ignores domains on another server, which has its own Traefik", async () => {
		domainsFindMany.mockResolvedValue([
			applicationDomain("shared.example.com", "app-2", "srv-2"),
			composeDomain("shared.example.com", null),
		]);
		await expect(
			isHostUsedByAnotherService({
				host: "shared.example.com",
				serverId: "srv-1",
				studioApplicationId: STUDIO_APP,
			}),
		).resolves.toBe(false);
	});

	it("ignores other hosts on the same server", async () => {
		domainsFindMany.mockResolvedValue([
			applicationDomain("other.example.com", "app-2", null),
		]);
		await expect(
			isHostUsedByAnotherService({
				host: "shared.example.com",
				serverId: null,
				studioApplicationId: STUDIO_APP,
			}),
		).resolves.toBe(false);
	});
});

describe("isLibreDBStudioHost", () => {
	it("matches the stored host forms in SQL, then asks only about those applications", async () => {
		domainsFindMany.mockResolvedValue([
			applicationDomain("Bücher.Example.", STUDIO_APP, null),
			applicationDomain("bücher.example", "app-2", "srv-2"),
		]);
		studioFindFirst.mockResolvedValue({ libredbStudioId: "studio-1" });
		await expect(
			isLibreDBStudioHost("XN--BCHER-KVA.example", [null]),
		).resolves.toBe(true);
		const { sql, params } = new PgDialect().sqlToQuery(
			domainsFindMany.mock.calls[0]?.[0].where,
		);
		expect(sql).toBe('lower(rtrim(trim("domain"."host"), \'.\')) in ($1, $2)');
		expect(params).toEqual(["xn--bcher-kva.example", "bücher.example"]);
		const studioQuery = new PgDialect().sqlToQuery(
			studioFindFirst.mock.calls[0]?.[0].where,
		);
		expect(studioQuery.params).toEqual([STUDIO_APP]);
	});

	it("is false without asking about Studios when no domain on the server has the host", async () => {
		domainsFindMany.mockResolvedValue([
			applicationDomain("studio.example.com", STUDIO_APP, "srv-2"),
			composeDomain("studio.example.com", null),
		]);
		await expect(
			isLibreDBStudioHost("studio.example.com", [null]),
		).resolves.toBe(false);
		expect(studioFindFirst).not.toHaveBeenCalled();
	});

	it("is false when the applications with the host are not Studios", async () => {
		domainsFindMany.mockResolvedValue([
			applicationDomain("studio.example.com", "app-2", null),
		]);
		studioFindFirst.mockResolvedValue(undefined);
		await expect(
			isLibreDBStudioHost("studio.example.com", [null]),
		).resolves.toBe(false);
	});
});
