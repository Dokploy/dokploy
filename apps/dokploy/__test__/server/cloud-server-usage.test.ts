import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	servers: [] as Record<string, unknown>[],
	updates: [] as Record<string, unknown>[],
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { cloudServer: { findMany: async () => mocks.servers } },
		update: () => ({
			set: (values: Record<string, unknown>) => {
				mocks.updates.push(values);
				return { where: () => ({ returning: async () => [values] }) };
			},
		}),
	},
}));

vi.mock("@dokploy/server/services/server", () => ({}));
vi.mock("@dokploy/server/services/ssh-key", () => ({}));
vi.mock("@dokploy/server/services/deployment", () => ({}));
vi.mock("@dokploy/server/setup/server-setup", () => ({}));
vi.mock("@dokploy/server/utils/filesystem/ssh", () => ({}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({}));

const { recordCloudServersBandwidth } = await import(
	"@dokploy/server/services/cloud-server"
);

const NOW = "2026-11-24T10:00:00.000Z";
const HOUR_AT_8_MBPS = 3_600_000_000;

const oneHourAt8Mbps = (request: Request) => {
	const start = Number(new URL(request.url).searchParams.get("start"));
	return new Response(
		JSON.stringify({
			data: {
				result: [
					{
						values: [
							[start, "8"],
							[start + 3600, "8"],
						],
					},
				],
			},
		}),
	);
};

const server = (overrides: Record<string, unknown> = {}) => ({
	cloudServerId: "cs-1",
	providerVmId: "123",
	createdAt: "2026-11-21T15:00:00.000Z",
	status: "ready",
	bandwidthBytes: 0,
	bandwidthMeasuredAt: null,
	...overrides,
});

describe("cloud server bandwidth", () => {
	const fetchMock = vi.fn();

	const requestedRange = (call: number) => {
		const { searchParams } = new URL(fetchMock.mock.calls[call]?.[0].url);
		return Object.fromEntries(searchParams);
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(NOW));
		vi.stubEnv("DIGITALOCEAN_TOKEN", "token");
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockReset();
		fetchMock.mockImplementation(async (request: Request) =>
			oneHourAt8Mbps(request),
		);
		mocks.updates = [];
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("measures a new server from the moment it was created", async () => {
		mocks.servers = [server()];

		await recordCloudServersBandwidth();

		expect(requestedRange(0)).toEqual({
			host_id: "123",
			interface: "public",
			direction: "outbound",
			start: String(Date.parse("2026-11-21T15:00:00Z") / 1000),
			end: String(Date.parse(NOW) / 1000),
		});
		expect(mocks.updates).toEqual([
			{ bandwidthBytes: HOUR_AT_8_MBPS, bandwidthMeasuredAt: NOW },
		]);
	});

	it("adds only the traffic since the last measurement", async () => {
		mocks.servers = [
			server({
				bandwidthBytes: 500,
				bandwidthMeasuredAt: "2026-11-23T10:00:00.000Z",
			}),
		];

		await recordCloudServersBandwidth();

		expect(requestedRange(0).start).toBe(
			String(Date.parse("2026-11-23T10:00:00Z") / 1000),
		);
		expect(mocks.updates).toEqual([
			{ bandwidthBytes: 500 + HOUR_AT_8_MBPS, bandwidthMeasuredAt: NOW },
		]);
	});

	it("keeps going with the other servers when DO fails for one", async () => {
		mocks.servers = [server(), server({ cloudServerId: "cs-2" })];
		fetchMock.mockRejectedValueOnce(new Error("network down"));

		await recordCloudServersBandwidth();

		expect(mocks.updates).toHaveLength(1);
	});
});
