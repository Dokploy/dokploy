import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: getSettings,
}));

const settings = {
	serverIp: "10.0.0.5",
	metricsConfig: { server: { port: 4500, token: "secret" } },
};
const live = {
	cpu: "7.07",
	memUsedGB: "2.46",
	memTotal: "6.00",
};

const loadModule = async () => {
	vi.resetModules();
	return await import("@dokploy/server/monitoring/agent-stats");
};

describe("getAgentHostUsage", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		getSettings.mockReset();
		getSettings.mockResolvedValue(settings);
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reads the live CPU and memory from the agent with its token", async () => {
		fetchMock.mockResolvedValue({ ok: true, json: async () => live });
		const { getAgentHostUsage } = await loadModule();

		expect(await getAgentHostUsage()).toEqual({
			cpu: 7.07,
			memUsedGB: 2.46,
			memTotalGB: 6,
		});
		const [url, init] = fetchMock.mock.calls[0] as [
			string,
			{ headers: Record<string, string> },
		];
		expect(url).toBe("http://10.0.0.5:4500/metrics/live");
		expect(init.headers.Authorization).toBe("Bearer secret");
	});

	it("falls back to the node's gateway when the server address does not answer", async () => {
		fetchMock
			.mockRejectedValueOnce(new Error("timeout"))
			.mockResolvedValueOnce({ ok: true, json: async () => live });
		const { getAgentHostUsage } = await loadModule();

		expect(await getAgentHostUsage()).not.toBeNull();
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"http://172.18.0.1:4500/metrics/live",
		);
	});

	it("returns null when the agent is not configured or not reachable", async () => {
		getSettings.mockResolvedValue({ serverIp: "10.0.0.5", metricsConfig: {} });
		let { getAgentHostUsage } = await loadModule();
		expect(await getAgentHostUsage()).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();

		getSettings.mockResolvedValue(settings);
		fetchMock.mockRejectedValue(new Error("refused"));
		({ getAgentHostUsage } = await loadModule());
		expect(await getAgentHostUsage()).toBeNull();
	});

	it("ignores a response without usable numbers", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ cpu: "x", memUsedGB: "1", memTotal: "0" }),
		});
		const { getAgentHostUsage } = await loadModule();
		expect(await getAgentHostUsage()).toBeNull();
	});
});
