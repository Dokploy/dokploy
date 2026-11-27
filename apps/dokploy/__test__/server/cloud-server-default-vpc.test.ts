import { ensureDigitalOceanDefaultVpc } from "@dokploy/server/utils/digitalocean";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const page = (vpcs: { region: string; default: boolean }[], hasNext: boolean) =>
	new Response(
		JSON.stringify({
			vpcs,
			links: hasNext ? { pages: { next: "next" } } : {},
		}),
	);

const customerVpcs = Array.from({ length: 200 }, () => ({
	region: "tor1",
	default: false,
}));

describe("default VPC of a region", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubEnv("DIGITALOCEAN_TOKEN", "token");
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	const requests = () =>
		fetchMock.mock.calls.map(([request]) => `${request.method} ${request.url}`);

	it("finds the default VPC when it sits past the first 200", async () => {
		fetchMock
			.mockResolvedValueOnce(page(customerVpcs, true))
			.mockResolvedValueOnce(page([{ region: "tor1", default: true }], false));

		await ensureDigitalOceanDefaultVpc("tor1");

		expect(requests()).toEqual([
			expect.stringContaining("/vpcs?per_page=200&page=1"),
			expect.stringContaining("/vpcs?per_page=200&page=2"),
		]);
	});

	it("creates it only after every page came back without one", async () => {
		fetchMock
			.mockResolvedValueOnce(page(customerVpcs, true))
			.mockResolvedValueOnce(page([{ region: "sfo3", default: true }], false))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ vpc: { id: "vpc-default" } })),
			);

		await ensureDigitalOceanDefaultVpc("tor1");

		expect(requests().at(-1)).toMatch(/^POST .*\/vpcs$/);
		expect(await fetchMock.mock.calls.at(-1)?.[0].json()).toMatchObject({
			name: "default-tor1",
			region: "tor1",
		});
	});
});
