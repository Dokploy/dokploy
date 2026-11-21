import { apiCreateNetwork } from "@dokploy/server/db/schema/network";
import {
	buildNetworkCreateOptions,
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
