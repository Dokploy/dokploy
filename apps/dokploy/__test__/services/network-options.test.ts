import { apiCreateNetwork } from "@dokploy/server/db/schema/network";
import {
	buildNetworkCreateOptions,
	computeNetworksToSync,
	isNetworkEncrypted,
} from "@dokploy/server/services/network";
import { describe, expect, it } from "vitest";

describe("network creation options", () => {
	it("sets Options.encrypted to 'true' when driver is overlay and encrypted is true", () => {
		const options = buildNetworkCreateOptions({
			name: "overlay-encrypted",
			driver: "overlay",
			internal: false,
			attachable: true,
			encrypted: true,
			enableIPv4: true,
			enableIPv6: false,
			mtu: null,
			ipam: {},
		});

		expect(options.Driver).toBe("overlay");
		expect(options.Attachable).toBe(true);
		expect(options.Options).toEqual({
			encrypted: "true",
		});
	});

	it("preserves Options.encrypted alongside MTU for overlay networks", () => {
		const options = buildNetworkCreateOptions({
			name: "overlay-encrypted-mtu",
			driver: "overlay",
			internal: false,
			attachable: false,
			encrypted: true,
			enableIPv4: true,
			enableIPv6: false,
			mtu: 1400,
			ipam: {},
		});

		expect(options.Options).toEqual({
			"com.docker.network.driver.mtu": "1400",
			encrypted: "true",
		});
	});

	it("does not set Options.encrypted when encrypted is false", () => {
		const options = buildNetworkCreateOptions({
			name: "overlay-unencrypted",
			driver: "overlay",
			internal: false,
			attachable: true,
			encrypted: false,
			enableIPv4: true,
			enableIPv6: false,
			mtu: null,
			ipam: {},
		});

		expect(options.Options).toBeUndefined();
	});

	it("does not set Options.encrypted when driver is bridge even if encrypted is true", () => {
		const options = buildNetworkCreateOptions({
			name: "bridge-net",
			driver: "bridge",
			internal: false,
			attachable: false,
			encrypted: true,
			enableIPv4: true,
			enableIPv6: false,
			mtu: null,
			ipam: {},
		});

		expect(options.Driver).toBe("bridge");
		expect(options.Options).toBeUndefined();
	});

	it("preserves MTU on bridge networks without setting encrypted", () => {
		const options = buildNetworkCreateOptions({
			name: "bridge-mtu",
			driver: "bridge",
			internal: false,
			attachable: false,
			encrypted: true,
			enableIPv4: true,
			enableIPv6: false,
			mtu: 1500,
			ipam: {},
		});

		expect(options.Options).toEqual({
			"com.docker.network.driver.mtu": "1500",
		});
	});
});

describe("isNetworkEncrypted", () => {
	it("returns true when options.encrypted is 'true'", () => {
		expect(isNetworkEncrypted({ encrypted: "true" })).toBe(true);
	});

	it("returns true when options.encrypted is empty string (Docker CLI --opt encrypted inspect)", () => {
		expect(isNetworkEncrypted({ encrypted: "" })).toBe(true);
	});

	it("returns false when options is undefined or encrypted is missing", () => {
		expect(isNetworkEncrypted(undefined)).toBe(false);
		expect(isNetworkEncrypted(null)).toBe(false);
		expect(isNetworkEncrypted({})).toBe(false);
		expect(isNetworkEncrypted({ other: "val" })).toBe(false);
	});
});

describe("apiCreateNetwork validation", () => {
	it("parses valid overlay network with encrypted flag", () => {
		const input = {
			name: "secure-overlay",
			driver: "overlay" as const,
			encrypted: true,
			attachable: true,
		};
		const parsed = apiCreateNetwork.parse(input);
		expect(parsed.encrypted).toBe(true);
		expect(parsed.driver).toBe("overlay");
	});
});

describe("computeNetworksToSync", () => {
	it("detects a saved network with encrypted: false as changed when live Docker network has encrypted: 'true'", () => {
		const existing = [
			{
				networkId: "net-1",
				name: "my-overlay",
				dockerId: "docker-id-1",
				encrypted: false,
			},
		];
		const dockerNetworks = [
			{
				Id: "docker-id-1",
				Name: "my-overlay",
				Driver: "overlay",
				Options: { encrypted: "true" },
			},
		];

		const result = computeNetworksToSync(existing, dockerNetworks);
		expect(result.changed).toHaveLength(1);
		expect(result.changed[0]).toMatchObject({
			networkId: "net-1",
			name: "my-overlay",
			encrypted: true,
		});
		expect(result.importable).toHaveLength(0);
		expect(result.missing).toHaveLength(0);
	});

	it("detects a saved network with encrypted: false as changed when live Docker network has encrypted: '' (Docker CLI --opt encrypted)", () => {
		const existing = [
			{
				networkId: "net-2",
				name: "cli-overlay",
				dockerId: "docker-id-2",
				encrypted: false,
			},
		];
		const dockerNetworks = [
			{
				Id: "docker-id-2",
				Name: "cli-overlay",
				Driver: "overlay",
				Options: { encrypted: "" },
			},
		];

		const result = computeNetworksToSync(existing, dockerNetworks);
		expect(result.changed).toHaveLength(1);
		expect(result.changed[0]?.encrypted).toBe(true);
	});

	it("does not mark network as changed when encrypted flag matches and Docker ID matches", () => {
		const existing = [
			{
				networkId: "net-3",
				name: "synced-overlay",
				dockerId: "docker-id-3",
				encrypted: true,
			},
		];
		const dockerNetworks = [
			{
				Id: "docker-id-3",
				Name: "synced-overlay",
				Driver: "overlay",
				Options: { encrypted: "true" },
			},
		];

		const result = computeNetworksToSync(existing, dockerNetworks);
		expect(result.changed).toHaveLength(0);
	});

	it("detects a saved network as changed when Docker ID has changed", () => {
		const existing = [
			{
				networkId: "net-4",
				name: "recreated-net",
				dockerId: "old-docker-id",
				encrypted: false,
			},
		];
		const dockerNetworks = [
			{
				Id: "new-docker-id",
				Name: "recreated-net",
				Driver: "overlay",
				Options: {},
			},
		];

		const result = computeNetworksToSync(existing, dockerNetworks);
		expect(result.changed).toHaveLength(1);
		expect(result.changed[0]?.networkId).toBe("net-4");
	});
});
