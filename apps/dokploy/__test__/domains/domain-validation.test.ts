import os from "node:os";
import {
	getServerIpCandidates,
	validateDomain,
} from "@dokploy/server/services/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	findServerById: vi.fn(),
	getPublicIpWithFallback: vi.fn(),
	getWebServerSettings: vi.fn(),
	resolve4: vi.fn(),
	resolve6: vi.fn(),
}));

vi.mock("node:dns", () => ({
	default: {
		resolve4: mocks.resolve4,
		resolve6: mocks.resolve6,
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

vi.mock("@dokploy/server/wss/utils", () => ({
	getPublicIpWithFallback: mocks.getPublicIpWithFallback,
}));

describe("getServerIpCandidates", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("includes every address reported by a multi-homed remote server", async () => {
		mocks.findServerById.mockResolvedValue({
			ipAddress: "10.0.0.10",
		});
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: ["10.0.0.10", "192.0.2.10", "2001:db8::10"].join("\n"),
			stderr: "",
		});

		await expect(getServerIpCandidates("server-id")).resolves.toEqual([
			"10.0.0.10",
			"192.0.2.10",
			"2001:db8::10",
		]);
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-id",
			expect.stringContaining("ip -o addr show scope global"),
		);
	});

	it("includes every address assigned to the local Dokploy host", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			serverIp: "10.0.0.10",
		});
		mocks.getPublicIpWithFallback.mockResolvedValue("2001:db8::10");
		vi.spyOn(os, "networkInterfaces").mockReturnValue({
			eth0: [
				{
					address: "192.0.2.10",
					netmask: "255.255.255.0",
					family: "IPv4",
					mac: "00:00:00:00:00:00",
					internal: false,
					cidr: "192.0.2.10/24",
				},
			],
		});

		await expect(getServerIpCandidates()).resolves.toEqual([
			"10.0.0.10",
			"192.0.2.10",
			"2001:db8::10",
		]);
	});

	it("retains remote interface addresses when public IP detection times out", async () => {
		vi.useFakeTimers();
		mocks.findServerById.mockResolvedValue({
			ipAddress: "10.0.0.10",
		});
		mocks.execAsyncRemote.mockImplementation(
			(_serverId: string, command: string) => {
				if (command.includes("curl")) {
					return new Promise(() => undefined);
				}
				return Promise.resolve({
					stdout: "192.0.2.10\n",
					stderr: "",
				});
			},
		);

		const candidatesPromise = getServerIpCandidates("server-id");
		await vi.advanceTimersByTimeAsync(7000);

		await expect(candidatesPromise).resolves.toEqual([
			"10.0.0.10",
			"192.0.2.10",
		]);
	});
});

describe("validateDomain", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("validates an IPv6-only domain against an IPv6 server address", async () => {
		const noIpv4 = Object.assign(new Error("queryA ENODATA example.com"), {
			code: "ENODATA",
		});
		mocks.resolve4.mockImplementation(
			(_domain: string, callback: (error: Error | null) => void) =>
				callback(noIpv4),
		);
		mocks.resolve6.mockImplementation(
			(
				_domain: string,
				callback: (error: Error | null, addresses?: string[]) => void,
			) => callback(null, ["2001:db8::10"]),
		);

		await expect(
			validateDomain("example.com", ["2001:db8::10"]),
		).resolves.toMatchObject({
			isValid: true,
			resolvedIp: "2001:db8::10",
		});
	});
});
