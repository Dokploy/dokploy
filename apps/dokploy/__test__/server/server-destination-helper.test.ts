import {
	assertServerDestinationAllowed,
	resolveServerDestinationHost,
} from "@dokploy/server/utils/servers/destination";
import { describe, expect, it } from "vitest";

describe("server destination helper", () => {
	it("rejects private server addresses when private networks are not allowed", async () => {
		await expect(
			assertServerDestinationAllowed(
				{ ipAddress: "10.0.0.5" },
				{ allowPrivateNetwork: false },
			),
		).rejects.toThrow(/Server address/i);
	});

	it("rejects hostnames that resolve to private addresses", async () => {
		await expect(
			assertServerDestinationAllowed(
				{ ipAddress: "remote.example.com" },
				{
					allowPrivateNetwork: false,
					lookup: async () => [{ address: "192.168.1.10", family: 4 }],
				},
			),
		).rejects.toThrow(/Server address/i);
	});

	it("allows public server destinations in cloud mode", async () => {
		await expect(
			assertServerDestinationAllowed(
				{ ipAddress: "remote.example.com" },
				{
					allowPrivateNetwork: false,
					lookup: async () => [{ address: "8.8.8.8", family: 4 }],
				},
			),
		).resolves.toBeUndefined();
	});

	it("returns the validated public address for SSH and Docker connects", async () => {
		await expect(
			resolveServerDestinationHost(
				{ ipAddress: "remote.example.com" },
				{
					allowPrivateNetwork: false,
					lookup: async () => [{ address: "8.8.4.4", family: 4 }],
				},
			),
		).resolves.toBe("8.8.4.4");
	});

	it("preserves private self-hosted server destinations when private networks are allowed", async () => {
		await expect(
			resolveServerDestinationHost(
				{ ipAddress: "10.0.0.5" },
				{ allowPrivateNetwork: true },
			),
		).resolves.toBe("10.0.0.5");
	});
});
